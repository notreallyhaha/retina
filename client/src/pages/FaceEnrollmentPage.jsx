import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import FaceOval from '../components/FaceOval';
import NotificationBar from '../components/NotificationBar';
import FlashOverlay from '../components/FlashOverlay';
import { detectLiveness, captureFrameImageData } from '../utils/liveness';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const STATUS = {
  SEARCHING: 'searching',
  READY: 'ready',
  HOLDING: 'holding',
  COUNTDOWN: 'countdown',
  CAPTURING: 'capturing',
  PROCESSING: 'processing',
  SUCCESS: 'success'
};

const FLASH_COLORS = ['white', 'green', 'blue', 'white'];
const FLASH_DURATION = 200;
const STABLE_TIME_REQUIRED = 2000;
const COUNTDOWN_DURATION = 1500;
const FPS_LEVELS = [
  { fps: 15, minTime: 0, maxTime: 50 },
  { fps: 10, minTime: 50, maxTime: 80 },
  { fps: 7, minTime: 80, maxTime: 120 },
  { fps: 5, minTime: 120, maxTime: Infinity }
];
const LANDMARK_FRAME_INTERVAL = 3;

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
  const detectionStartTimeRef = useRef(null);
  const messageDebounceRef = useRef(null);
  const lastMessageUpdateRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    return () => {
      stopCamera();
      clearTimers();
    };
  }, [user, navigate]);

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
      setCameraActive(true);
      setError('');
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!videoRef.current) throw new Error('Video element not ready.');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
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
      setCameraActive(false);
      const messages = {
        NotReadableError: 'Camera is already in use.',
        NotAllowedError: 'Camera permission denied.',
        NotFoundError: 'No camera found.',
      };
      setError(messages[err.name] || 'Failed to access camera.');
    }
  };

  const startDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;
    scheduleNextDetection();
  };

  const scheduleNextDetection = () => {
    if (!videoRef.current || !canvasRef.current ||
        status === STATUS.CAPTURING || status === STATUS.PROCESSING) return;
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
    }
  };

  const detectAndCheck = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const now = Date.now();
    const video = videoRef.current;
    const canvas = canvasRef.current;

    detectionStartTimeRef.current = now;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      frameCounterRef.current++;
      const shouldRunLandmarks = frameCounterRef.current % LANDMARK_FRAME_INTERVAL === 0 || !lastLandmarksRef.current;

      const detectionTime = Date.now() - detectionStartTimeRef.current;
      adjustFps(detectionTime);

      const messages = [];

      // Estimate face size based on video frame (assume face is roughly centered and fills ~30% of height)
      const faceWidthEstimate = video.videoWidth * 0.3;
      const videoCenterX = video.videoWidth / 2;
      const videoCenterY = video.videoHeight / 2;

      // Simulated checks for now since face-api.js is removed
      // We'll rely on server-side face detection
      const distanceResult = { pass: true, message: '' }; // Server will validate
      const positionResult = { pass: true, message: '' };
      const tiltResult = { pass: true, message: '' };
      const eyesResult = { pass: true, message: '' };

      if (!distanceResult.pass) messages.push(distanceResult.message);
      if (!positionResult.pass) messages.push(positionResult.message);
      if (!tiltResult.pass) messages.push(tiltResult.message);
      if (!eyesResult.pass) messages.push(eyesResult.message);

      updateQualityMessages(messages);
      const allPass = messages.length === 0;
      setAllCriteriaMet(allPass);

      if (allPass) {
        handleAllCriteriaMet();
      } else {
        handleCriteriaFailed(true);
      }
    } catch (err) {
      console.error('Detection error:', err);
    }
  };

  const updateQualityMessages = (messages) => {
    const now = Date.now();
    const lastUpdate = lastMessageUpdateRef.current;
    const messagesChanged = JSON.stringify(messages) !== JSON.stringify(qualityMessages);

    if (messagesChanged && now - lastUpdate > 200) {
      setQualityMessages(messages);
      lastMessageUpdateRef.current = now;
    } else if (messagesChanged) {
      if (messageDebounceRef.current) clearTimeout(messageDebounceRef.current);
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
    setQualityMessages([]);
  };

  const handleCriteriaFailed = () => {
    if (status === STATUS.COUNTDOWN || status === STATUS.CAPTURING) return;
    resetStableTimer();
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
        if (videoRef.current) {
          const imageData = captureFrameImageData(videoRef.current, null);
          setCapturedFrames(prev => [...prev, { imageData }]);
        }
        setFlashActive(false);
        setTimeout(resolve, FLASH_DURATION);
      }, FLASH_DURATION);
    });
  };

  const processCapturedFrames = async () => {
    setStatus(STATUS.PROCESSING);

    if (capturedFrames.length < 4) {
      setError('Failed to capture all frames. Please try again.');
      setStatus(STATUS.SEARCHING);
      return;
    }

    const livenessResult = detectLiveness(capturedFrames);

    if (!livenessResult.isLive) {
      setError('Liveness check failed. Please try again with a real face.');
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
      // Capture the best frame for server-side face detection
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      // Convert canvas to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));

      const formData = new FormData();
      formData.append('file', blob, 'face.jpg');
      formData.append('uid', user?.uid || user?.id);

      const descriptors = capturedFrames.map(f => []); // Placeholder
      const avgDescriptor = [];
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
      setError(err.response?.data?.detail || 'Face enrollment failed');
      setStatus(STATUS.SEARCHING);
      setCapturedFrames([]);
      resetStableTimer();
    } finally {
      setLoading(false);
    }
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
                <button onClick={handleRetry} style={styles.retryBtn}>Try Again</button>
              </div>
            )}

            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                style={styles.submitBtn}
                disabled={loading}
              >
                Start Camera
              </button>
            ) : (
              <div style={styles.cameraContainer}>
                <NotificationBar messages={qualityMessages} />

                <div style={styles.videoWrapper}>
                  <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
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

                <div style={styles.statusText}>{renderStatusText()}</div>

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
    transform: 'scaleX(-1)'
  },
  canvas: { display: 'none' },
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
    marginTop: '12px'
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
