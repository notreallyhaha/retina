import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import FaceOval from '../components/FaceOval';
import {
  loadFaceApiModels,
  detectFace,
  checkCriteria,
  captureFrame,
  extractDescriptor,
  modelsReady
} from '../utils/faceDetection';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const STATUS = {
  SEARCHING:  'searching',
  DETECTING:  'detecting',
  HOLDING:    'holding',
  WOBBLING:   'wobbling',
  CAPTURING:  'capturing',
  DONE:       'done',
  SUCCESS:    'success',
};

const PROGRESS_TARGET_FRAMES = 6;
const MAX_SAMPLES             = 3;
const DETECTION_INTERVAL_MS   = 200;

// Lighting thresholds (0-255 average luminance of face region)
const LUMA_TOO_DARK   = 50;   // below this → too dark
const LUMA_TOO_BRIGHT = 220;  // above this → too bright / washed out

// Minimum cosine distance between consecutive samples to ensure variation
// 0 = identical, 1 = completely different; 0.08 is a small but meaningful shift
const MIN_VARIATION_DISTANCE = 0.08;

// Cooldown frames after a sample is captured before the next stability window starts
const POST_CAPTURE_COOLDOWN_FRAMES = 8; // ~1.6s at 200ms interval

/* ── helpers ──────────────────────────────────────────────────── */

/**
 * Compute average luminance (0-255) of the face bounding box region on a canvas.
 * Uses perceived luminance formula: 0.299R + 0.587G + 0.114B
 */
function measureFaceLuminance(canvas, box) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(canvas.width  - x, Math.ceil(box.width));
  const h = Math.min(canvas.height - y, Math.ceil(box.height));
  if (w <= 0 || h <= 0) return 128;

  const pixels = ctx.getImageData(x, y, w, h).data;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  return total / (pixels.length / 4);
}

/**
 * Cosine distance between two 128-d float arrays.
 * Returns 0 for identical vectors, approaches 1 for very different ones.
 */
function cosineDistance(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ── component ────────────────────────────────────────────────── */
function FaceEnrollmentPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const streamRef       = useRef(null);
  const loopTimerRef    = useRef(null);
  const loopRunningRef  = useRef(false);

  // ── state ──────────────────────────────────────────────────────
  const [error,           setError]           = useState('');
  const [cameraActive,    setCameraActive]    = useState(false);
  const [status,          setStatus]          = useState(STATUS.SEARCHING);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage,   setStatusMessage]   = useState('Loading…');
  const [loadingModels,   setLoadingModels]   = useState(true);
  const [enrolling,       setEnrolling]       = useState(false);
  const [capturedImage,   setCapturedImage]   = useState(null);
  const [lightingWarning, setLightingWarning] = useState(''); // 'dark' | 'bright' | ''
  const [sampleCount,     setSampleCount]     = useState(0);

  // ── refs (never stale inside loop) ────────────────────────────
  const statusRef              = useRef(STATUS.SEARCHING);
  const enrollingRef           = useRef(false);
  const progressFrameRef       = useRef(0);
  const stabilityGraceRef      = useRef(2);
  const capturedDescriptorsRef = useRef([]);
  const capturedCountRef       = useRef(0);
  const lastDescriptorRef      = useRef(null);  // descriptor of previous sample
  const cooldownFramesRef      = useRef(0);      // frames remaining in post-capture cooldown

  const syncStatus    = (s) => { statusRef.current = s;    setStatus(s);    };
  const syncEnrolling = (v) => { enrollingRef.current = v; setEnrolling(v); };

  // ── teardown ───────────────────────────────────────────────────
  const teardown = useCallback(() => {
    loopRunningRef.current = false;
    if (loopTimerRef.current)  { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }
    if (streamRef.current)     { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current)        videoRef.current.srcObject = null;
  }, []);

  // ── resetProgress ──────────────────────────────────────────────
  const resetProgress = useCallback(() => {
    progressFrameRef.current       = 0;
    stabilityGraceRef.current      = 2;
    capturedDescriptorsRef.current = [];
    capturedCountRef.current       = 0;
    lastDescriptorRef.current      = null;
    cooldownFramesRef.current      = 0;
    setProgressPercent(0);
    setSampleCount(0);
    setLightingWarning('');
    syncStatus(STATUS.DETECTING);
    setStatusMessage('Position your face in the oval');
  }, []);

  // ── finalizeEnrollment — send images to server for DeepFace processing ──
  const finalizeEnrollment = useCallback(async () => {
    syncStatus(STATUS.CAPTURING);
    setStatusMessage('Processing with DeepFace… this may take a moment');
    syncEnrolling(true);
    loopRunningRef.current = false;

    try {
      const images = capturedDescriptorsRef.current; // now stores images
      if (images.length === 0) throw new Error('No samples collected');

      const response = await axios.post(
        `${API_URL}/api/register/face`,
        { faceImages: images },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          timeout: 60000, // DeepFace can be slow on first run (model download)
        }
      );

      if (response.data.success) {
        syncStatus(STATUS.SUCCESS);
        setStatusMessage('');
        updateUser({ faceEnrolled: true, employeeId: response.data.employeeId });
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (e) {
      console.error('Final enrollment error:', e);
      setError(e.response?.data?.detail ?? 'Face enrollment failed. Please try again.');
      syncEnrolling(false);
      teardown();
    }
  }, [navigate, updateUser, teardown]);

  // ── captureSample — store 640px image for DeepFace server-side processing ──
  const captureSample = useCallback(async () => {
    try {
      const video = videoRef.current;
      if (!video) throw new Error('No video');

      // Capture at 640px wide for good DeepFace accuracy
      const sampleCanvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / video.videoWidth);
      sampleCanvas.width  = Math.round(video.videoWidth  * scale);
      sampleCanvas.height = Math.round(video.videoHeight * scale);
      sampleCanvas.getContext('2d').drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const sampleImage = sampleCanvas.toDataURL('image/jpeg', 0.92);

      setCapturedImage(sampleImage);

      // Also run a quick client-side check that a face is actually present
      // before sending to server (saves a round-trip on bad frames)
      const clientCheck = await new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          try {
            await extractDescriptor(img);
            resolve(true);
          } catch {
            resolve(false);
          }
        };
        img.onerror = () => resolve(false);
        img.src = sampleImage;
      });

      if (!clientCheck) {
        setError('No face detected in sample. Please try again.');
        progressFrameRef.current  = 0;
        stabilityGraceRef.current = 2;
        return;
      }

      capturedDescriptorsRef.current.push(sampleImage); // store image, not descriptor
      lastDescriptorRef.current = null; // variation check no longer needed
      capturedCountRef.current  = capturedDescriptorsRef.current.length;
      cooldownFramesRef.current = POST_CAPTURE_COOLDOWN_FRAMES;
      progressFrameRef.current  = 0;

      const newCount = capturedCountRef.current;
      setSampleCount(newCount);
      setProgressPercent((newCount / MAX_SAMPLES) * 100);

      if (newCount < MAX_SAMPLES) {
        setStatusMessage(`Sample ${newCount}/${MAX_SAMPLES} ✓ — move slightly, then hold…`);
        syncStatus(STATUS.HOLDING);
      } else {
        await finalizeEnrollment();
      }
    } catch (e) {
      console.error('Sample capture error:', e);
      setError('Failed to capture sample. Please try again.');
      progressFrameRef.current  = 0;
      stabilityGraceRef.current = 2;
    }
  }, [finalizeEnrollment]);

  // ── detection tick ─────────────────────────────────────────────
  const runDetectionTick = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    if (enrollingRef.current) return;

    try {
      const processingCanvas = canvasRef.current;
      const ctx = processingCanvas.getContext('2d', { alpha: false });
      const aiWidth = 640, aiHeight = 480;

      if (processingCanvas.width !== aiWidth || processingCanvas.height !== aiHeight) {
        processingCanvas.width  = aiWidth;
        processingCanvas.height = aiHeight;
      }
      ctx.drawImage(video, 0, 0, aiWidth, aiHeight);

      // ── 1. Fast detection pass ──
      const detectionOnly = await detectFace(processingCanvas, 'detection');

      if (!detectionOnly) {
        const cur = statusRef.current;
        if (cur === STATUS.HOLDING || cur === STATUS.WOBBLING) {
          stabilityGraceRef.current -= 1;
          if (stabilityGraceRef.current <= 0) {
            progressFrameRef.current = Math.max(0, progressFrameRef.current - 1);
            stabilityGraceRef.current = 3;
          }
          syncStatus(STATUS.WOBBLING);
          setStatusMessage('Stay still…');
        }
        if (progressFrameRef.current === 0 && statusRef.current !== STATUS.DETECTING) {
          syncStatus(STATUS.DETECTING);
          setStatusMessage('Position your face in the oval');
        }
        setLightingWarning('');
        return;
      }

      // ── 2. Lighting check using face bounding box ──
      const box  = detectionOnly.box;
      const luma = measureFaceLuminance(processingCanvas, box);

      if (luma < LUMA_TOO_DARK) {
        setLightingWarning('dark');
        setStatusMessage('Too dark — move to a brighter area');
        progressFrameRef.current = 0; // reset stability while lighting is bad
        return;
      }
      if (luma > LUMA_TOO_BRIGHT) {
        setLightingWarning('bright');
        setStatusMessage('Too bright — avoid direct light on your face');
        progressFrameRef.current = 0;
        return;
      }
      setLightingWarning('');

      // ── 3. Transition to HOLDING if just detected ──
      if (statusRef.current === STATUS.DETECTING) syncStatus(STATUS.HOLDING);

      // ── 4. Full landmarks pass ──
      const detectionWithLandmarks = await detectFace(processingCanvas, 'landmarks');
      if (!detectionWithLandmarks) {
        setStatusMessage('Stabilizing…');
        return;
      }

      // ── 5. Quality criteria check ──
      const result = checkCriteria(detectionWithLandmarks, aiWidth, aiHeight);

      if (!result.pass) {
        const cur = statusRef.current;
        let actuallyFailing = true;
        if (
          (cur === STATUS.HOLDING || cur === STATUS.WOBBLING) &&
          result.messages.length === 1 &&
          result.messages[0] === 'Center your face in the oval'
        ) {
          const { offset } = result.details;
          if (offset && offset.x <= 0.25 && offset.y <= 0.25) actuallyFailing = false;
        }

        if (actuallyFailing) {
          if (cur === STATUS.HOLDING || cur === STATUS.WOBBLING) {
            stabilityGraceRef.current -= 1;
            if (stabilityGraceRef.current <= 0) {
              progressFrameRef.current = Math.max(0, progressFrameRef.current - 1);
              stabilityGraceRef.current = 3;
            }
            syncStatus(STATUS.WOBBLING);
          }
          setStatusMessage(result.messages[0] || 'Adjust position');
          return;
        }
      }

      // ── 6. Post-capture cooldown — wait for natural variation ──
      if (cooldownFramesRef.current > 0) {
        cooldownFramesRef.current -= 1;
        const count = capturedCountRef.current;

        // After a couple of frames, start checking if the face has moved enough
        if (lastDescriptorRef.current && cooldownFramesRef.current <= POST_CAPTURE_COOLDOWN_FRAMES - 3) {
          try {
            const frame = captureFrame(video);
            const quickDesc = await new Promise((resolve) => {
              const img = new Image();
              img.onload = async () => {
                try   { resolve(await extractDescriptor(img)); }
                catch { resolve(null); }
              };
              img.onerror = () => resolve(null);
              img.src = frame;
            });

            if (quickDesc) {
              const dist = cosineDistance(lastDescriptorRef.current, quickDesc);
              if (dist >= MIN_VARIATION_DISTANCE) {
                // Enough natural variation — end cooldown early
                cooldownFramesRef.current = 0;
                console.log(`[Variation] dist=${dist.toFixed(3)}, cooldown ended early`);
              } else {
                setStatusMessage(`Sample ${count}/${MAX_SAMPLES} ✓ — move slightly for variation…`);
                return;
              }
            }
          } catch {
            // silent — just wait out the cooldown
          }
        } else {
          setStatusMessage(`Sample ${count}/${MAX_SAMPLES} ✓ — move slightly for next sample…`);
          return;
        }
      }

      // ── 7. ALL CHECKS PASSED — increment stability ──
      progressFrameRef.current += 1;
      stabilityGraceRef.current = 2;

      if (statusRef.current !== STATUS.HOLDING) syncStatus(STATUS.HOLDING);

      const sampleProgress = (capturedCountRef.current / MAX_SAMPLES) * 100
        + (progressFrameRef.current / PROGRESS_TARGET_FRAMES) * (100 / MAX_SAMPLES);
      setProgressPercent(Math.min(sampleProgress, 99));

      setStatusMessage(
        capturedCountRef.current === 0
          ? 'Hold still…'
          : `Sample ${capturedCountRef.current}/${MAX_SAMPLES} ✓ — hold still…`
      );

      if (progressFrameRef.current >= PROGRESS_TARGET_FRAMES) {
        loopRunningRef.current = false;
        await captureSample();
        if (!enrollingRef.current) {
          loopRunningRef.current = true;
          scheduleNextTick();
        }
      }
    } catch (e) {
      console.error('Detection tick error:', e);
      resetProgress();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureSample, resetProgress]);

  // ── throttled loop ─────────────────────────────────────────────
  const scheduleNextTick = useCallback(() => {
    if (!loopRunningRef.current) return;
    loopTimerRef.current = setTimeout(async () => {
      if (!loopRunningRef.current) return;
      await runDetectionTick();
      scheduleNextTick();
    }, DETECTION_INTERVAL_MS);
  }, [runDetectionTick]);

  const startDetectionLoop = useCallback(() => {
    if (!modelsReady()) return;
    loopRunningRef.current = true;
    setProgressPercent(0);
    scheduleNextTick();
  }, [scheduleNextTick]);

  // ── start camera ───────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!videoRef.current) throw new Error('Video element not found');
      videoRef.current.srcObject = s;
      streamRef.current = s;
      await videoRef.current.play();
      setCameraActive(true);
      syncEnrolling(false);
      syncStatus(STATUS.DETECTING);
      setStatusMessage('Position your face in the oval');
      startDetectionLoop();
    } catch (e) {
      console.error('Camera start error:', e);
      if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        teardown();
        setError('Camera is in use by another app. Please close it and try again.');
      } else if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('Camera permission denied.');
      } else {
        if (!videoRef.current?.srcObject) setError('Failed to access camera.');
      }
      if (!videoRef.current?.srcObject) { setCameraActive(false); teardown(); }
    }
  }, [startDetectionLoop, teardown]);

  // ── stop / reset ───────────────────────────────────────────────
  const handleStop = useCallback(() => {
    teardown();
    setProgressPercent(0);
    syncStatus(STATUS.SEARCHING);
    setStatusMessage('');
    syncEnrolling(false);
    setCameraActive(false);
    setLightingWarning('');
    setSampleCount(0);
  }, [teardown]);

  // ── redirect guard — only block unauthenticated users, allow re-enrollment ──
  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  // ── load models ────────────────────────────────────────────────
  useEffect(() => {
    loadFaceApiModels()
      .then(() => setLoadingModels(false))
      .catch(e => {
        console.error('Model loading error:', e);
        setError('Failed to load face models. Please refresh the page.');
      });
    return () => teardown();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── success screen ─────────────────────────────────────────────
  if (status === STATUS.SUCCESS) {
    return (
      <div style={styles.fullScreenContainer}>
        <div style={styles.successOverlay}>
          <div style={styles.successCheckmark}>✓</div>
          <h1 style={styles.successTitle}>Face Enrolled!</h1>
          <p style={styles.successSubtitle}>Redirecting to home…</p>
          <button onClick={() => navigate('/')} style={styles.homeButton}>Go to Home</button>
        </div>
      </div>
    );
  }

  /* ── render ───────────────────────────────────────────────────── */
  return (
    <div style={styles.fullScreenContainer}>
      <video ref={videoRef} autoPlay playsInline muted style={styles.fullScreenVideo} />
      <canvas ref={canvasRef} style={styles.hiddenCanvas} />

      {cameraActive && !loadingModels && (
        <FaceOval progressPercent={progressPercent} status={status} message={statusMessage} />
      )}

      {/* Lighting warning banner */}
      {lightingWarning !== '' && cameraActive && (
        <div style={{
          ...styles.lightingBanner,
          background: lightingWarning === 'dark'
            ? 'rgba(234,179,8,0.9)'
            : 'rgba(249,115,22,0.9)',
        }}>
          <span style={styles.lightingIcon}>{lightingWarning === 'dark' ? '🌑' : '☀️'}</span>
          <span>
            {lightingWarning === 'dark'
              ? 'Too dark — move to a brighter area'
              : 'Too bright — avoid direct light on your face'}
          </span>
        </div>
      )}

      {/* Sample progress dots */}
      {cameraActive && !loadingModels && (
        <div style={styles.sampleDotsContainer}>
          {Array.from({ length: MAX_SAMPLES }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.sampleDot,
                background: i < sampleCount ? '#22c55e' : 'rgba(255,255,255,0.25)',
                transform:  i < sampleCount ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      )}

      {cameraActive && !loadingModels && statusMessage && status !== STATUS.CAPTURING && lightingWarning === '' && (
        <div style={styles.statusContainer}>{statusMessage}</div>
      )}

      {loadingModels && cameraActive && (
        <div style={styles.statusContainer}>Loading face models…</div>
      )}

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={handleStop} style={styles.errorRetry}>Try Again</button>
        </div>
      )}

      {cameraActive ? (
        <div style={styles.controls}>
          <button onClick={handleStop} style={styles.secondaryButton} disabled={enrolling}>
            Stop Camera
          </button>
          <button onClick={() => navigate('/')} style={styles.ghostButton}>← Back</button>
        </div>
      ) : (
        <div style={styles.startContainer}>
          <h1 style={styles.startTitle}>Face Enrollment</h1>
          <p style={styles.startSubtitle}>
            Position your face in the oval. We'll take 3 samples — move slightly between each one for better accuracy.
          </p>
          <button onClick={startCamera} style={styles.primaryButton} disabled={loadingModels}>
            {loadingModels ? 'Loading Models…' : 'Start Camera'}
          </button>
          <button onClick={() => navigate('/')} style={styles.backLink}>← Back to Home</button>
        </div>
      )}

      {capturedImage && status === STATUS.CAPTURING && (
        <div style={styles.previewContainer}>
          <img src={capturedImage} alt="Captured" style={styles.previewImage} />
          <div style={styles.previewLabel}>Processing Face…</div>
        </div>
      )}
    </div>
  );
}

/* ── styles ───────────────────────────────────────────────────── */
const styles = {
  fullScreenContainer:  { position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' },
  fullScreenVideo:      { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  hiddenCanvas:         { display: 'none' },
  statusContainer:      { position: 'absolute', bottom: 140, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: 500, textShadow: '0 2px 8px rgba(0,0,0,0.7)', zIndex: 20, pointerEvents: 'none' },
  sampleDotsContainer:  { position: 'absolute', bottom: 110, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, zIndex: 20, pointerEvents: 'none' },
  sampleDot:            { width: 10, height: 10, borderRadius: '50%', transition: 'background 0.3s ease, transform 0.3s ease' },
  lightingBanner:       { position: 'absolute', top: 60, left: 16, right: 16, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 14, fontWeight: 600, zIndex: 30 },
  lightingIcon:         { fontSize: 20 },
  previewContainer:     { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 240, height: 240, borderRadius: 120, overflow: 'hidden', border: '4px solid #fff', zIndex: 100, background: '#000' },
  previewImage:         { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  previewLabel:         { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', textAlign: 'center', padding: '8px', fontSize: 12, fontWeight: 600 },
  errorBanner:          { position: 'absolute', top: 60, left: 16, right: 16, background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(12px)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: '#fff', fontSize: 14, fontWeight: 500, zIndex: 30 },
  errorRetry:           { background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  controls:             { position: 'absolute', bottom: 20, left: 16, right: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 30, paddingBottom: 'env(safe-area-inset-bottom, 20px)' },
  secondaryButton:      { background: 'rgba(30,30,30,0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 100, padding: '12px 20px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  ghostButton:          { background: 'transparent', border: 'none', borderRadius: 100, padding: '10px 16px', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  startContainer:       { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 100%)', zIndex: 25 },
  startTitle:           { fontSize: 28, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' },
  startSubtitle:        { fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 32, lineHeight: 1.5, maxWidth: 320 },
  primaryButton:        { width: '100%', maxWidth: 320, padding: '16px 24px', background: '#fff', border: 'none', borderRadius: 100, color: '#000', fontSize: 17, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em' },
  backLink:             { marginTop: 16, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: 500, cursor: 'pointer', padding: '8px 16px' },
  successOverlay:       { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', zIndex: 40, padding: 24 },
  successCheckmark:     { width: 64, height: 64, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 700, marginBottom: 20 },
  successTitle:         { fontSize: 24, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' },
  successSubtitle:      { fontSize: 16, color: 'rgba(255,255,255,0.6)', marginBottom: 24, textAlign: 'center' },
  homeButton:           { padding: '14px 32px', background: '#fff', border: 'none', borderRadius: 100, color: '#000', fontSize: 16, fontWeight: 600, cursor: 'pointer' },
};

export default FaceEnrollmentPage;