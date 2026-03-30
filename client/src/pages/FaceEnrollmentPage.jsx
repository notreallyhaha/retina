import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { useAuth } from '../context/AuthContext';
import FaceOval from '../components/FaceOval';
import NotificationBar from '../components/NotificationBar';
import FlashOverlay from '../components/FlashOverlay';
import { checkDistance, checkPosition, checkTilt, checkEyesOpen } from '../utils/faceQuality';
import { detectLiveness, captureFrameImageData } from '../utils/liveness';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Status constants
const STATUS = {
  SEARCHING: 'searching',
  READY: 'ready',
  HOLDING: 'holding',
  COUNTDOWN: 'countdown',
  CAPTURING: 'capturing',
  PROCESSING: 'processing',
  SUCCESS: 'success'
};

// Optimization constants
const FLASH_COLORS = ['white', 'green', 'blue', 'white'];
const FLASH_DURATION = 200;
const STABLE_TIME_REQUIRED = 2000;
const COUNTDOWN_DURATION = 1500;

// Adaptive FPS settings
const FPS_LEVELS = [
  { fps: 15, minTime: 0, maxTime: 50 },    // 15fps if detection < 50ms
  { fps: 10, minTime: 50, maxTime: 80 },   // 10fps if detection 50-80ms
  { fps: 7, minTime: 80, maxTime: 120 },   // 7fps if detection 80-120ms
  { fps: 5, minTime: 120, maxTime: Infinity } // 5fps if detection > 120ms
];

// Two-phase detection settings
const LANDMARK_FRAME_INTERVAL = 3; // Run landmarks every 3rd frame

function FaceEnrollmentPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const stableTimerRef = useRef(null);
  const countdownTimeoutRef = useRef(null);
  const lastDetectionRef = useRef(null);
  const lastLandmarksRef = useRef(null);
  const frameCounterRef = useRef(0);
  const detectionStartTimeRef = useRef(0);
  const messageDebounceRef = useRef(null);
  const lastMessageUpdateRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState(STATUS.SEARCHING);
  
  const [qualityMessages, setQualityMessages] = useState([]);
  const [allCriteriaMet, setAllCriteriaMet] = useState(false);
  const [stableTime, setStableTime] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  
  const [flashActive, setFlashActive] = useState(false);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flashColor, setFlashColor] = useState('white');
  const [capturedFrames, setCapturedFrames] = useState([]);
  
  // Detection settings state
  const [currentFps, setCurrentFps] = useState(10);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.faceEnrolled) {
      navigate('/');
      return;
    }

    loadModels();
    return () => {
      stopCamera();
      clearTimers();
    };
  }, [user, navigate]);

  const loadModels = async () => {
    try {
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model/';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      setModelsLoaded(true);
    } catch (err) {
      console.error('Failed to load models:', err);
      setError('Failed to load face recognition models');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const clearTimers = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (stableTimerRef.current) {
      clearInterval(stableTimerRef.current);
      stableTimerRef.current = null;
    }
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    if (messageDebounceRef.current) {
      clearTimeout(messageDebounceRef.current);
      messageDebounceRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available.');
      }

      setCameraActive(true);
      setError('');
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!videoRef.current) {
        throw new Error('Video element not ready.');
      }

      // Use lower resolution for better performance on mobile
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 640 },  // Reduced from 1280 for performance
          height: { ideal: 480 }, // Reduced from 720 for performance
          frameRate: { ideal: 30 }
        }
      });

      videoRef.current.srcObject = stream;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 5000);
        if (videoRef.current) {
          videoRef.current.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          videoRef.current.play().then(resolve).catch(reject);
        }
      });

      startDetection();
    } catch (err) {
      console.error('Camera error:', err);
      setCameraActive(false);

      let errorMessage = 'Failed to access camera. ';
      if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use.';
      } else if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Tap the lock icon to allow.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found.';
      } else if (err.name === 'TypeError') {
        errorMessage = 'Camera requires HTTPS.';
      }

      setError(errorMessage);
    }
  };

  const startDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;
    scheduleNextDetection();
  };

  const scheduleNextDetection = () => {
    if (!videoRef.current || !canvasRef.current || 
        status === STATUS.CAPTURING || status === STATUS.PROCESSING) {
      return;
    }

    const interval = 1000 / currentFps;
    detectionIntervalRef.current = setTimeout(async () => {
      await detectAndCheck();
      scheduleNextDetection();
    }, interval);
  };

  const adjustFps = (detectionTime) => {
    const newFpsConfig = FPS_LEVELS.find(level => 
      detectionTime >= level.minTime && detectionTime < level.maxTime
    );
    
    if (newFpsConfig && newFpsConfig.fps !== currentFps) {
      setCurrentFps(newFpsConfig.fps);
      console.log(`Adjusted FPS: ${currentFps} -> ${newFpsConfig.fps} (detection: ${detectionTime}ms)`);
    }
  };

  const detectAndCheck = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const now = Date.now();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Record detection start time for adaptive FPS
    detectionStartTimeRef.current = now;
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      frameCounterRef.current++;
      const shouldRunLandmarks = frameCounterRef.current % LANDMARK_FRAME_INTERVAL === 0 || 
                                   !lastLandmarksRef.current;

      // Two-phase detection:
      // - Always run face detection
      // - Only run landmarks every N frames (or if we don't have cached landmarks)
      let detection;
      if (shouldRunLandmarks) {
        detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
            inputSize: 160 // Smaller input = faster detection
          }))
          .withFaceLandmarks();
        
        if (detection) {
          lastLandmarksRef.current = detection.landmarks;
        }
      } else {
        // Detection only (no landmarks) - much faster
        detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
            inputSize: 160
          }));
      }

      // Calculate detection time and adjust FPS
      const detectionTime = Date.now() - detectionStartTimeRef.current;
      adjustFps(detectionTime);

      if (!detection) {
        // Face lost - clear caches
        lastDetectionRef.current = null;
        lastLandmarksRef.current = null;

        updateQualityMessages(['⚠️ NO FACE DETECTED']);
        setAllCriteriaMet(false);
        resetStableTimer();
        setStatus(STATUS.SEARCHING);
        return;
      }

      // Store detection for later use
      lastDetectionRef.current = detection;

      // Run quality checks
      const messages = [];

      // Distance check (uses bounding box only - fast)
      const distanceResult = checkDistance(detection.detection.box.width);
      if (!distanceResult.pass) messages.push(distanceResult.message);

      // Position check (uses bounding box only - fast)
      const videoCenterX = video.videoWidth / 2;
      const faceCenterX = detection.detection.box.x + detection.detection.box.width / 2;
      const flippedOffsetX = -1 * (faceCenterX - videoCenterX); // Mirror compensation
      const faceCenterY = detection.detection.box.y + detection.detection.box.height / 2;
      const videoCenterY = video.videoHeight / 2;
      
      const positionResult = checkPosition(flippedOffsetX + videoCenterX, faceCenterY, videoCenterX, videoCenterY);
      if (!positionResult.pass) messages.push(positionResult.message);

      // Tilt and eyes checks (require landmarks - use cached if available)
      if (lastLandmarksRef.current) {
        const tiltResult = checkTilt(lastLandmarksRef.current);
        if (!tiltResult.pass) messages.push(tiltResult.message);

        const eyesResult = checkEyesOpen(lastLandmarksRef.current);
        if (!eyesResult.pass) messages.push(eyesResult.message);
      } else {
        // No landmarks yet - skip these checks temporarily
        // User will see "CENTER YOUR FACE" until landmarks load
      }

      // Lighting check disabled - relies on device auto-exposure

      updateQualityMessages(messages);
      const allPass = messages.length === 0;
      setAllCriteriaMet(allPass);

      // Check for critical failures that should always reset the timer
      const criticalFailures = ['⚠️ TOO CLOSE', '⚠️ TOO FAR', '⚠️ CENTER YOUR FACE', '⚠️ NO FACE DETECTED'];
      const hasCriticalFailure = messages.some(msg => criticalFailures.includes(msg));

      if (allPass) {
        handleAllCriteriaMet();
      } else {
        handleCriteriaFailed(hasCriticalFailure);
      }
    } catch (err) {
      console.error('Detection error:', err);
    }
  };

  // Debounced message updates (max once per 200ms)
  const updateQualityMessages = (messages) => {
    const now = Date.now();
    const lastUpdate = lastMessageUpdateRef.current;
    
    // Check if messages actually changed
    const messagesChanged = JSON.stringify(messages) !== JSON.stringify(qualityMessages);
    
    if (messagesChanged && now - lastUpdate > 200) {
      // Update immediately if changed and debounce period passed
      setQualityMessages(messages);
      lastMessageUpdateRef.current = now;
    } else if (messagesChanged) {
      // Schedule update after debounce
      if (messageDebounceRef.current) {
        clearTimeout(messageDebounceRef.current);
      }
      messageDebounceRef.current = setTimeout(() => {
        setQualityMessages(messages);
        lastMessageUpdateRef.current = Date.now();
      }, 200);
    }
  };

  const handleAllCriteriaMet = () => {
    if (status === STATUS.COUNTDOWN || status === STATUS.CAPTURING) return;
    if (status !== STATUS.HOLDING && status !== STATUS.READY) {
      startStableTimer();
    }
    setStatus(STATUS.READY);
    // Clear quality messages when all criteria are met
    setQualityMessages([]);
  };

  const handleCriteriaFailed = (hasCriticalFailure = false) => {
    if (status === STATUS.COUNTDOWN || status === STATUS.CAPTURING) return;
    
    // Critical failures (distance, position, no face) always reset the timer
    // Minor failures (tilt, eyes) only reset if we're still searching
    if (hasCriticalFailure || status === STATUS.SEARCHING) {
      resetStableTimer();
    }
    setStatus(STATUS.SEARCHING);
  };

  const startStableTimer = () => {
    clearTimers();
    setStableTime(0);
    
    stableTimerRef.current = setInterval(() => {
      setStableTime(prev => {
        const newTime = prev + 100;
        if (newTime >= STABLE_TIME_REQUIRED) {
          startCountdown();
          return STABLE_TIME_REQUIRED;
        }
        return newTime;
      });
    }, 100);
  };

  const resetStableTimer = () => {
    if (stableTimerRef.current) {
      clearInterval(stableTimerRef.current);
      stableTimerRef.current = null;
    }
    setStableTime(0);
  };

  const startCountdown = () => {
    if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
    
    setStatus(STATUS.HOLDING);
    setCountdownValue(3);
    
    countdownTimeoutRef.current = setTimeout(() => {
      setStatus(STATUS.COUNTDOWN);
      
      const countdownInterval = setInterval(() => {
        setCountdownValue(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            startFlashCapture();
            return 1;
          }
          return prev - 1;
        });
      }, COUNTDOWN_DURATION / 3);
      
      countdownTimeoutRef.current = setTimeout(() => {
        clearInterval(countdownInterval);
      }, COUNTDOWN_DURATION);
    }, 500);
  };

  const startFlashCapture = async () => {
    setStatus(STATUS.CAPTURING);
    setCapturedFrames([]);
    setFlashIndex(0);
    
    for (let i = 0; i < FLASH_COLORS.length; i++) {
      await captureFrameWithFlash(i);
    }
    
    await processCapturedFrames();
  };

  const captureFrameWithFlash = (index) => {
    return new Promise(resolve => {
      setFlashIndex(index);
      setFlashColor(FLASH_COLORS[index]);
      setFlashActive(true);
      
      setTimeout(() => {
        if (videoRef.current && lastDetectionRef.current) {
          const detection = lastDetectionRef.current;
          const descriptor = Array.from(detection.descriptor);
          const imageData = captureFrameImageData(videoRef.current, detection.detection.box);
          const brightness = imageData ? calculateBrightness(imageData) : 128;
          
          setCapturedFrames(prev => [...prev, {
            descriptor,
            imageData,
            brightness,
            flashColor: FLASH_COLORS[index]
          }]);
        }
        
        setFlashActive(false);
        setTimeout(resolve, FLASH_DURATION);
      }, FLASH_DURATION);
    });
  };

  const calculateBrightness = (imageData) => {
    const pixels = imageData.data;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
    return total / (pixels.length / 4);
  };

  const processCapturedFrames = async () => {
    setStatus(STATUS.PROCESSING);
    
    if (capturedFrames.length < 4) {
      setError('Failed to capture all frames. Please try again.');
      setStatus(STATUS.SEARCHING);
      return;
    }

    const livenessResult = detectLiveness(capturedFrames);
    console.log('Liveness result:', livenessResult);

    if (!livenessResult.isLive) {
      setError('Liveness check failed. Please try again with a real face (not a photo).');
      setStatus(STATUS.SEARCHING);
      setCapturedFrames([]);
      resetStableTimer();
      return;
    }

    await submitEnrollment();
  };

  const submitEnrollment = async () => {
    setLoading(true);

    try {
      const descriptors = capturedFrames.map(f => f.descriptor);
      const avgDescriptor = calculateAverageDescriptor(descriptors);
      const livenessScore = detectLiveness(capturedFrames).score;

      const response = await axios.post(`${API_URL}/api/register/face`, {
        faceDescriptors: descriptors,
        averageDescriptor: avgDescriptor,
        livenessScore
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.data.success) {
        setStatus(STATUS.SUCCESS);
        updateUser({ faceEnrolled: true, employeeId: response.data.employeeId });
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err) {
      console.error('Enrollment error:', err);
      setError(err.response?.data?.error || 'Face enrollment failed');
      setStatus(STATUS.SEARCHING);
      setCapturedFrames([]);
      resetStableTimer();
    } finally {
      setLoading(false);
    }
  };

  const calculateAverageDescriptor = (descriptors) => {
    const length = descriptors[0].length;
    const avg = new Array(length).fill(0);
    descriptors.forEach(desc => {
      desc.forEach((val, i) => {
        avg[i] += val / descriptors.length;
      });
    });
    return avg;
  };

  const handleRetry = () => {
    setError('');
    setCapturedFrames([]);
    setStatus(STATUS.SEARCHING);
    resetStableTimer();
    lastLandmarksRef.current = null;
    frameCounterRef.current = 0;
  };

  const renderStatusText = () => {
    switch (status) {
      case STATUS.SEARCHING: return 'Position your face in the oval';
      case STATUS.READY: return '✓ Perfect - Hold still...';
      case STATUS.HOLDING: return '✓ Hold still...';
      case STATUS.COUNTDOWN: return '';
      case STATUS.CAPTURING: return `Capturing frame ${flashIndex + 1}...`;
      case STATUS.PROCESSING: return 'Processing...';
      case STATUS.SUCCESS: return '✓ Enrollment successful!';
      default: return '';
    }
  };

  if (!user) return null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Complete Your Registration</h1>
        <p style={styles.subtitle}>Enroll your face for secure clock in/out</p>

        {!modelsLoaded && <div style={styles.loading}>Loading models...</div>}

        {status === STATUS.SUCCESS ? (
          <div style={styles.success}>
            <span style={styles.successIcon}>✓</span>
            <p>Face Enrollment Successful!</p>
            <p style={styles.successSubtext}>Redirecting to home...</p>
          </div>
        ) : (
          <>
            <div style={styles.infoBox}>
              <p style={styles.infoTitle}>📸 Single Face Enrollment</p>
              <p style={styles.infoText}>
                Position your face in the oval. The system will automatically capture
                multiple frames with flash to verify liveness.
              </p>
              <ul style={styles.infoList}>
                <li>Position face in the oval guide</li>
                <li>Ensure good lighting</li>
                <li>Keep head straight</li>
                <li>Open your eyes</li>
                <li>Hold still for auto-capture</li>
              </ul>
            </div>

            {error && (
              <div style={styles.error}>
                {error}
                <button onClick={handleRetry} style={styles.retryBtn}>
                  Try Again
                </button>
              </div>
            )}

            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                style={styles.submitBtn}
                disabled={!modelsLoaded || loading}
              >
                {!modelsLoaded ? 'Loading Models...' : 'Start Camera'}
              </button>
            ) : (
              <div style={styles.cameraContainer}>
                <NotificationBar messages={qualityMessages} />

                <div style={styles.videoWrapper}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={styles.video}
                  />
                  <canvas ref={canvasRef} style={styles.canvas} />
                  
                  <div style={styles.faceOvalOverlay}>
                    <FaceOval
                      allCriteriaMet={allCriteriaMet}
                      stableTime={stableTime}
                      countingDown={status === STATUS.COUNTDOWN}
                      countdownValue={countdownValue}
                      capturing={status === STATUS.CAPTURING ? flashIndex + 1 : false}
                      status={status}
                    />
                  </div>
                </div>

                <div style={styles.statusText}>
                  {renderStatusText()}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    clearTimers();
                    setStatus(STATUS.SEARCHING);
                    setCapturedFrames([]);
                    lastLandmarksRef.current = null;
                    frameCounterRef.current = 0;
                  }}
                  style={styles.stopBtn}
                  disabled={status === STATUS.CAPTURING || status === STATUS.PROCESSING}
                >
                  Stop Camera
                </button>
              </div>
            )}
          </>
        )}

        <button onClick={() => navigate('/')} style={styles.backBtn}>
          Back to Home
        </button>
      </div>

      <FlashOverlay
        active={flashActive}
        flashIndex={flashIndex}
        flashColor={flashColor}
      />
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
    padding: '20px'
  },
  card: {
    background: '#141414',
    borderRadius: '12px',
    padding: '40px',
    border: '1px solid #262626',
    maxWidth: '500px',
    width: '100%'
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: '8px',
    color: '#ffffff'
  },
  subtitle: {
    color: '#737373',
    fontSize: '14px',
    textAlign: 'center',
    marginBottom: '24px'
  },
  loading: {
    textAlign: 'center',
    padding: '20px',
    color: '#737373'
  },
  infoBox: {
    background: '#0a0a0a',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  infoTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '12px'
  },
  infoText: {
    fontSize: '14px',
    color: '#a3a3a3',
    lineHeight: '1.6',
    marginBottom: '12px'
  },
  infoList: {
    fontSize: '14px',
    color: '#737373',
    paddingLeft: '20px',
    lineHeight: '1.8'
  },
  error: {
    background: '#2a1a1a',
    color: '#f87171',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  retryBtn: {
    marginTop: '8px',
    padding: '6px 12px',
    background: '#f87171',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  success: {
    background: '#1a2a1a',
    color: '#86efac',
    padding: '48px 24px',
    borderRadius: '12px',
    textAlign: 'center',
    marginBottom: '24px'
  },
  successIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '16px'
  },
  successSubtext: {
    fontSize: '14px',
    color: '#a3a3a3',
    marginTop: '8px'
  },
  cameraContainer: {
    position: 'relative'
  },
  videoWrapper: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #262626',
    background: '#000'
  },
  video: {
    width: '100%',
    display: 'block',
    minHeight: '400px',
    objectFit: 'cover',
    transform: 'scaleX(-1)' // Mirror for natural selfie experience
  },
  canvas: {
    display: 'none'
  },
  faceOvalOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: 10
  },
  statusText: {
    textAlign: 'center',
    padding: '16px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#ffffff',
    minHeight: '50px'
  },
  stopBtn: {
    width: '100%',
    padding: '12px',
    background: '#1a1a1a',
    color: '#737373',
    border: '1px solid #262626',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '12px',
    transition: 'all 0.2s'
  },
  backBtn: {
    display: 'block',
    width: '100%',
    marginTop: '16px',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#737373',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default FaceEnrollmentPage;
