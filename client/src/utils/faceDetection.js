import * as faceapi from 'face-api.js';

/* ── model loading ─────────────────────────────────────────────── */
let _modelsLoaded = false;

export async function loadFaceApiModels(basePath = '/models') {
  if (_modelsLoaded) return;

  // Create a timeout promise to prevent infinite hanging
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Model loading timed out after 10 seconds')), 10000)
  );

  try {
    await Promise.race([
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(basePath),
        faceapi.nets.faceLandmark68Net.loadFromUri(basePath),
        faceapi.nets.faceRecognitionNet.loadFromUri(basePath),
      ]),
      timeout
    ]);
    _modelsLoaded = true;
    console.log('AI Models loaded successfully from:', basePath);
  } catch (e) {
    console.error('Detailed Model Load Error:', e);
    throw e;
  }
}

export function modelsReady() {
  return _modelsLoaded;
}

/* ── single detection (returns null when no face found) ────────── */
export async function detectFace(imageSource, mode = 'full') {
  if (!_modelsLoaded) throw new Error('Models not loaded');

  // Use TinyFaceDetector for significantly better performance on mobile
  const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224, // Increased from 160 for better accuracy while maintaining mobile performance
    scoreThreshold: 0.3 // Lowered from 0.4 to be more forgiving on mobile devices
  });

  if (mode === 'detection') {
    return await faceapi
      .detectSingleFace(imageSource, detectorOptions) || null;
  }

  if (mode === 'landmarks') {
    return await faceapi
      .detectSingleFace(imageSource, detectorOptions)
      .withFaceLandmarks() || null;
  }

  if (mode === 'full') {
    return await faceapi
      .detectSingleFace(imageSource, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor() || null;
  }

  return null;
}

/* ── image dimensions helper ───────────────────────────────────── */
function imageDimensions(src) {
  return {
    width: src.videoWidth || src.naturalWidth || src.width,
    height: src.videoHeight || src.naturalHeight || src.height,
  };
}

/* ── criteria checks ───────────────────────────────────────────── */
const TILT_THRESHOLD = 25;          // degrees max rotation (relaxed from 22)
const CENTER_THRESHOLD = 0.22;      // max offset from frame center (relaxed from 0.18)
const CENTER_EXIT_THRESHOLD = 0.25;   // slightly relaxed threshold to prevent flickering when leaving 'Holding' state
const SIZE_MIN = 0.05;              // min face area ratio of frame (relaxed from 0.06)
const SIZE_MAX = 0.60;              // max face area ratio (relaxed from 0.55)

/**
 * Evaluate detection quality criteria.
 * Returns { pass, messages, details }
 */
export function checkCriteria(detection, frameW, frameH) {
  const messages = [];
  const details = {};

  if (!detection) {
    return { pass: false, messages: ['No face detected'], details };
  }

  const { detection: det, landmarks } = detection;
  const box = det.box;

  // 1 – detection confidence
  details.confidence = det.confidence;
  if (det.confidence < 0.4) messages.push('Face not clear enough');

  // 2 – face size (area as ratio of frame)
  const area = (box.width * box.height) / (frameW * frameH);
  details.faceArea = area;

  if (area < SIZE_MIN) messages.push('Move closer');
  if (area > SIZE_MAX) messages.push('Move back');

  // 3 – centering
  const faceCx = box.x + box.width / 2;
  const faceCy = box.y + box.height / 2;
  const offsetX = Math.abs(faceCx - frameW / 2) / frameW;
  const offsetY = Math.abs(faceCy - frameH / 2) / frameH;
  details.offset = { x: offsetX, y: offsetY };

  // We use the threshold provided in the config.
  // Note: The calling component (FaceEnrollmentPage) can apply an exit-threshold
  // if it wants to prevent flickering, but the base check uses CENTER_THRESHOLD.
  if (offsetX > CENTER_THRESHOLD || offsetY > CENTER_THRESHOLD) {
    messages.push('Center your face in the oval');
  }

  // 4 – tilt (rotation angle from landmark geometry)
  const pts = landmarks.positions;
  if (pts.length >= 68) {
    const leftEye = pts[36];
    const rightEye = pts[45];
    const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
    details.tilt = angle;
    if (Math.abs(angle) > TILT_THRESHOLD) messages.push('Tilt your head less');
  }

  // 5 – eyes visible (check that eye landmarks are inside the detection box)
  const eyeVisible = (pt) =>
    pt.x >= box.x && pt.x <= box.x + box.width &&
    pt.y >= box.y && pt.y <= box.y + box.height;

  if (pts.length >= 37) {
    const le = eyeVisible(pts[36]);
    const re = eyeVisible(pts[45]);
    details.eyesVisible = le && re;
    if (!details.eyesVisible) messages.push('Both eyes must be visible');
  }

  return { pass: messages.length === 0, messages, details };
}

/* ── capture frame as data URL ─────────────────────────────────── */
export function captureFrame(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.95);
}

/* ── extract 128-d descriptor array from a captured image ──────── */
export async function extractDescriptor(imageSource) {
  const detection = await faceapi
    .detectSingleFace(imageSource, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) throw new Error('No face found in captured image');
  return Array.from(detection.descriptor);
}
