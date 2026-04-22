/**
 * Face Quality Detection Utilities
 * Real-time quality checks for face enrollment
 */

// Quality thresholds
export const THRESHOLDS = {
  // Distance: face width in pixels
  DISTANCE_MIN: 150,
  DISTANCE_MAX: 450,

  // Lighting: brightness (0-255 scale)
  LIGHTING_MIN: 60,
  LIGHTING_MAX: 220,

  // Position: center offset in pixels
  POSITION_OFFSET_MAX: 100,

  // Tilt: eye level difference in pixels (relaxed for stability)
  TILT_MAX: 25,

  // Eyes: minimum eye opening in pixels (relaxed for natural blinking)
  EYE_OPEN_MIN: 2
};

/**
 * Check if face distance is appropriate
 * @param {number} faceWidth - Width of face bounding box
 * @returns {{ pass: boolean, message: string | null, value: number }}
 */
export function checkDistance(faceWidth) {
  if (faceWidth > THRESHOLDS.DISTANCE_MAX) {
    return { pass: false, message: '⚠️ TOO CLOSE', value: faceWidth };
  }
  if (faceWidth < THRESHOLDS.DISTANCE_MIN) {
    return { pass: false, message: '⚠️ TOO FAR', value: faceWidth };
  }
  return { pass: true, message: null, value: faceWidth };
}

/**
 * Check if lighting is appropriate
 * @param {ImageData} imageData - Canvas image data from face region
 * @returns {{ pass: boolean, message: string | null, value: number }}
 */
export function checkLighting(imageData) {
  const pixels = imageData.data;
  let totalBrightness = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    // Calculate luminance: 0.299R + 0.587G + 0.114B
    const brightness = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    totalBrightness += brightness;
  }
  
  const avgBrightness = totalBrightness / (pixels.length / 4);
  
  if (avgBrightness < THRESHOLDS.LIGHTING_MIN) {
    return { pass: false, message: '⚠️ TOO DARK', value: avgBrightness };
  }
  if (avgBrightness > THRESHOLDS.LIGHTING_MAX) {
    return { pass: false, message: '⚠️ TOO BRIGHT', value: avgBrightness };
  }
  return { pass: true, message: null, value: avgBrightness };
}

/**
 * Check if face is centered
 * @param {number} faceCenterX - X position of face center
 * @param {number} faceCenterY - Y position of face center
 * @param {number} videoCenterX - X position of video center
 * @param {number} videoCenterY - Y position of video center
 * @returns {{ pass: boolean, message: string | null, offsetX: number, offsetY: number }}
 */
export function checkPosition(faceCenterX, faceCenterY, videoCenterX, videoCenterY) {
  const offsetX = faceCenterX - videoCenterX;
  const offsetY = faceCenterY - videoCenterY;
  
  if (Math.abs(offsetX) > THRESHOLDS.POSITION_OFFSET_MAX || Math.abs(offsetY) > THRESHOLDS.POSITION_OFFSET_MAX) {
    return { pass: false, message: '⚠️ CENTER YOUR FACE', offsetX, offsetY };
  }
  return { pass: true, message: null, offsetX, offsetY };
}

/**
 * Check if head is straight (eyes level)
 * @param {Array} landmarks - Face landmarks from face-api.js
 * @returns {{ pass: boolean, message: string | null, tilt: number }}
 */
export function checkTilt(landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  
  // Calculate eye centers
  const leftEyeY = (leftEye[0].y + leftEye[1].y + leftEye[2].y + leftEye[3].y) / 4;
  const rightEyeY = (rightEye[0].y + rightEye[1].y + rightEye[2].y + rightEye[3].y) / 4;
  
  const tilt = Math.abs(leftEyeY - rightEyeY);
  
  if (tilt > THRESHOLDS.TILT_MAX) {
    return { pass: false, message: '⚠️ KEEP HEAD STRAIGHT', tilt };
  }
  return { pass: true, message: null, tilt };
}

/**
 * Check if both eyes are open
 * @param {Array} landmarks - Face landmarks from face-api.js
 * @returns {{ pass: boolean, message: string | null, leftOpen: number, rightOpen: number }}
 */
export function checkEyesOpen(landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  
  // Eye openness: vertical distance between top and bottom eyelid
  const leftOpen = leftEye[3].y - leftEye[1].y;
  const rightOpen = rightEye[3].y - rightEye[1].y;
  
  if (leftOpen < THRESHOLDS.EYE_OPEN_MIN || rightOpen < THRESHOLDS.EYE_OPEN_MIN) {
    return { 
      pass: false, 
      message: '⚠️ OPEN YOUR EYES', 
      leftOpen, 
      rightOpen 
    };
  }
  return { pass: true, message: null, leftOpen, rightOpen };
}

/**
 * Run all quality checks on detected face
 * @param {Object} detection - Face detection result from face-api.js
 * @param {number} videoWidth - Video element width
 * @param {number} videoHeight - Video element height
 * @param {ImageData} faceImageData - Image data from face region (for lighting check)
 * @returns {{ allPass: boolean, results: Object, messages: string[] }}
 */
export function runAllChecks(detection, videoWidth, videoHeight, faceImageData = null) {
  const results = {};
  const messages = [];
  
  // Get face bounding box
  const box = detection.detection.box;
  const faceWidth = box.width;
  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;
  const videoCenterX = videoWidth / 2;
  const videoCenterY = videoHeight / 2;
  
  // Run checks
  results.distance = checkDistance(faceWidth);
  if (!results.distance.pass) messages.push(results.distance.message);
  
  if (faceImageData) {
    results.lighting = checkLighting(faceImageData);
    if (!results.lighting.pass) messages.push(results.lighting.message);
  } else {
    results.lighting = { pass: true, message: null, value: 128 };
  }
  
  results.position = checkPosition(faceCenterX, faceCenterY, videoCenterX, videoCenterY);
  if (!results.position.pass) messages.push(results.position.message);
  
  results.tilt = checkTilt(detection.landmarks);
  if (!results.tilt.pass) messages.push(results.tilt.message);
  
  results.eyes = checkEyesOpen(detection.landmarks);
  if (!results.eyes.pass) messages.push(results.eyes.message);
  
  return {
    allPass: messages.length === 0,
    results,
    messages
  };
}

/**
 * Get face image data from canvas for lighting check
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} box - Face bounding box
 * @returns {ImageData | null}
 */
export function getFaceImageData(canvas, box) {
  const ctx = canvas.getContext('2d');
  
  // Add padding around face for better lighting sample
  const padding = 20;
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const width = Math.min(canvas.width - x, box.width + padding * 2);
  const height = Math.min(canvas.height - y, box.height + padding * 2);
  
  try {
    return ctx.getImageData(x, y, width, height);
  } catch (e) {
    console.error('Error getting face image data:', e);
    return null;
  }
}

export default {
  THRESHOLDS,
  checkDistance,
  checkLighting,
  checkPosition,
  checkTilt,
  checkEyesOpen,
  runAllChecks,
  getFaceImageData
};
