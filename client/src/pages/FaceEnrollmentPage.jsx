import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { useAuth } from '../context/AuthContext';
import FaceOval from '../components/FaceOval';
import NotificationBar from '../components/NotificationBar';
import FlashOverlay from '../components/FlashOverlay';
import { runAllChecks, getFaceImageData } from '../utils/faceQuality';
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

// Flash sequence colors
const FLASH_COLORS = ['white', 'green', 'blue', 'white'];
const FLASH_DURATION = 200; // ms per flash
const STABLE_TIME_REQUIRED = 2000; // ms before countdown
const COUNTDOWN_DURATION = 1500; // 1.5s for countdown

function FaceEnrollmentPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const stableTimerRef = useRef(null);
  const countdownTimeoutRef = useRef(null);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState(STATUS.SEARCHING);
  
  // Quality check state
  const [qualityMessages, setQualityMessages] = useState([]);
  const [allCriteriaMet, setAllCriteriaMet] = useState(false);
  const [stableTime, setStableTime] = useState(0);
  
  // Countdown state
  const [countdownValue, setCountdownValue] = useState(3);
  
  // Flash capture state
  const [flashActive, setFlashActive] = useState(false);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flashColor, setFlashColor] = useState('white');
  const [capturedFrames, setCapturedFrames] = useState([]);

  // Load models on mount
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
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Make sure you are using HTTPS or localhost.');
      }

      // Set camera active first to render video element
      setCameraActive(true);
      setError('');

      // Wait for video element to be rendered in DOM
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!videoRef.current) {
        throw new Error('Video element not ready. Please try again.');
      }

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          // Add these for better mobile compatibility
          frameRate: { ideal: 30 }
        }
      });

      videoRef.current.srcObject = stream;

      // Wait for video to actually start playing
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 5000);
        videoRef.current.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        videoRef.current.play().then(resolve).catch(reject);
      });

      // Start real-time detection
      startDetection();
    } catch (err) {
      console.error('Camera error:', err);
      setCameraActive(false);

      let errorMessage = 'Failed to access camera. ';
      if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use. Close other apps and try again.';
      } else if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Tap the lock icon in address bar to allow.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found.';
      } else if (err.name === 'TypeError') {
        errorMessage = 'Camera requires HTTPS. Use the deployed URL, not localhost.';
      }

      setError(errorMessage);
    }
  };

  const startDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;

    detectionIntervalRef.current = setInterval(async () => {
      await detectAndCheck();
    }, 33); // ~30fps
  };

  const detectAndCheck = async () => {
    if (!videoRef.current || !canvasRef.current || status === STATUS.CAPTURING || status === STATUS.PROCESSING) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Update canvas size to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (!detection) {
        setQualityMessages(['⚠️ NO FACE DETECTED']);
        setAllCriteriaMet(false);
        resetStableTimer();
        setStatus(STATUS.SEARCHING);
        return;
      }

      // Get face image data for lighting check
      const faceImageData = getFaceImageData(canvas, detection.detection.box);

      // Run all quality checks
      const { allPass, messages } = runAllChecks(
        detection,
        video.videoWidth,
        video.videoHeight,
        faceImageData
      );

      setQualityMessages(messages);
      setAllCriteriaMet(allPass);

      if (allPass) {
        handleAllCriteriaMet(detection, faceImageData);
      } else {
        handleCriteriaFailed();
      }
    } catch (err) {
      console.error('Detection error:', err);
    }
  };

  const handleAllCriteriaMet = (detection, imageData) => {
    if (status === STATUS.COUNTDOWN || status === STATUS.CAPTURING) {
      return;
    }

    if (status !== STATUS.HOLDING && status !== STATUS.READY) {
      startStableTimer();
    }
    
    setStatus(STATUS.READY);
  };

  const handleCriteriaFailed = () => {
    if (status === STATUS.COUNTDOWN || status === STATUS.CAPTURING) {
      return;
    }
    
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
          // Start countdown
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
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
    }
    
    setStatus(STATUS.HOLDING);
    setCountdownValue(3);
    
    // Update status to holding after brief delay
    countdownTimeoutRef.current = setTimeout(() => {
      setStatus(STATUS.COUNTDOWN);
      
      // Countdown sequence: 3... 2... 1...
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
    
    // Capture 4 frames with flash sequence
    for (let i = 0; i < FLASH_COLORS.length; i++) {
      await captureFrameWithFlash(i);
    }
    
    // Process captured frames
    await processCapturedFrames();
  };

  const captureFrameWithFlash = (index) => {
    return new Promise(resolve => {
      setFlashIndex(index);
      setFlashColor(FLASH_COLORS[index]);
      setFlashActive(true);
      
      // Capture frame data
      setTimeout(() => {
        if (videoRef.current) {
          const detection = faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();
          
          if (detection) {
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

    // Run liveness detection
    const livenessResult = detectLiveness(capturedFrames);
    
    console.log('Liveness result:', livenessResult);

    if (!livenessResult.isLive) {
      setError('Liveness check failed. Please try again with a real face (not a photo).');
      setStatus(STATUS.SEARCHING);
      setCapturedFrames([]);
      resetStableTimer();
      return;
    }

    // Submit to server
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
  };

  // Render status text
  const renderStatusText = () => {
    switch (status) {
      case STATUS.SEARCHING:
        return 'Position your face in the oval';
      case STATUS.READY:
        return '✓ Perfect - Hold still...';
      case STATUS.HOLDING:
        return '✓ Hold still...';
      case STATUS.COUNTDOWN:
        return '';
      case STATUS.CAPTURING:
        return `Capturing frame ${flashIndex + 1}...`;
      case STATUS.PROCESSING:
        return 'Processing...';
      case STATUS.SUCCESS:
        return '✓ Enrollment successful!';
      default:
        return '';
    }
  };

  if (!user) {
    return null;
  }

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
                {/* Notification Bar */}
                <NotificationBar messages={qualityMessages} />

                {/* Video Container with Face Oval */}
                <div style={styles.videoWrapper}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={styles.video}
                  />
                  <canvas ref={canvasRef} style={styles.canvas} />
                  
                  {/* Face Oval Overlay */}
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

                {/* Status Text */}
                <div style={styles.statusText}>
                  {renderStatusText()}
                </div>

                {/* Stop Camera Button */}
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    clearTimers();
                    setStatus(STATUS.SEARCHING);
                    setCapturedFrames([]);
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

      {/* Flash Overlay */}
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
    objectFit: 'cover'
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
