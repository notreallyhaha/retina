import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ENROLLMENT_STEPS = [
  { instruction: 'Look straight ahead', angle: 'center' },
  { instruction: 'Turn your head slightly left', angle: 'left' },
  { instruction: 'Turn your head slightly right', angle: 'right' },
  { instruction: 'Look up slightly', angle: 'up' },
  { instruction: 'Look down slightly', angle: 'down' }
];

// Camera Modal Component
function CameraEnrollmentModal({
  isOpen,
  onClose,
  videoRef,
  canvasRef,
  currentStep,
  setCurrentStep,
  capturedFrames,
  setCapturedFrames,
  isCapturing,
  setIsCapturing,
  error,
  setError,
  loading,
  onCapture,
  onCancel
}) {
  if (!isOpen) return null;

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modal}>
        <button onClick={onClose} style={modalStyles.closeBtn}>×</button>

        <div style={modalStyles.stepIndicator}>
          Step {currentStep + 1} of {ENROLLMENT_STEPS.length}
        </div>

        <div style={modalStyles.instructionBox}>
          <p style={modalStyles.instructionText}>
            {ENROLLMENT_STEPS[currentStep].instruction}
          </p>
        </div>

        <div style={modalStyles.videoContainer}>
          <video ref={videoRef} autoPlay playsInline style={modalStyles.video} />
          <canvas ref={canvasRef} style={modalStyles.canvas} />
        </div>

        <div style={modalStyles.framesCaptured}>
          Frames captured: {capturedFrames.length} / {ENROLLMENT_STEPS.length}
        </div>

        {error && <div style={modalStyles.error}>{error}</div>}

        <div style={modalStyles.buttonRow}>
          <button
            type="button"
            onClick={onCancel}
            style={modalStyles.cancelBtn}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCapture}
            style={modalStyles.captureBtn}
            disabled={loading || isCapturing}
          >
            {isCapturing ? 'Capturing...' : `Capture Frame ${currentStep + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FaceEnrollmentPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Multi-frame enrollment state
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    // Redirect if not authenticated or already enrolled
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.faceEnrolled) {
      navigate('/');
      return;
    }

    loadModels();
    return () => stopCamera();
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
    }
  };

  const startCamera = async () => {
    try {
      console.log('Requesting camera access...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Make sure you are using HTTPS or localhost.');
      }

      // Open modal first so video element renders
      setIsModalOpen(true);

      // Wait for video element to be available
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!videoRef.current) {
        throw new Error('Video element not ready. Please try again.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      console.log('Camera access granted');
      videoRef.current.srcObject = stream;
    } catch (err) {
      console.error('Camera error:', err);
      setIsModalOpen(false);

      let errorMessage = 'Failed to access camera. ';

      if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use. Close other apps (Zoom, Teams, etc.) and try again.';
      } else if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else if (err.message.includes('HTTPS') || err.message.includes('secure')) {
        errorMessage = 'Camera requires HTTPS. Use localhost or ngrok URL.';
      } else {
        errorMessage += err.message;
      }

      setError(errorMessage);
    }
  };

  const closeModal = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsModalOpen(false);
    resetEnrollment();
  };

  const getFaceDescriptor = async () => {
    const video = videoRef.current;
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection ? { descriptor: detection.descriptor, landmarks: detection.landmarks } : null;
  };

  const checkQuality = async (result) => {
    if (!result) return { valid: false, reason: 'No face detected' };

    const landmarks = result.landmarks;
    if (!landmarks) return { valid: false, reason: 'Could not detect face landmarks' };

    const jawline = landmarks.getJawOutline();
    const faceWidth = Math.abs(jawline[16].x - jawline[0].x);
    const faceHeight = Math.abs(landmarks.nose.y - jawline[8].y);

    const video = videoRef.current;
    const minFaceSize = Math.min(video.videoWidth, video.videoHeight) * 0.2;

    if (faceWidth < minFaceSize || faceHeight < minFaceSize) {
      return { valid: false, reason: 'Face too small. Move closer to the camera.' };
    }

    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const leftEyeOpen = leftEye[3].y - leftEye[1].y > 3;
    const rightEyeOpen = rightEye[3].y - rightEye[1].y > 3;

    if (!leftEyeOpen || !rightEyeOpen) {
      return { valid: false, reason: 'Please open your eyes fully' };
    }

    return { valid: true, quality: Math.min(faceWidth, faceHeight) };
  };

  const captureFrame = async () => {
    if (!videoRef.current) return null;

    const result = await getFaceDescriptor();
    const quality = await checkQuality(result);

    if (!quality.valid) {
      return { error: quality.reason };
    }

    return {
      descriptor: Array.from(result.descriptor),
      quality: quality.quality
    };
  };

  const handleCapture = async () => {
    if (isCapturing) return;

    setIsCapturing(true);
    setError('');

    const result = await captureFrame();

    if (result.error) {
      setError(result.error);
      setIsCapturing(false);
      return;
    }

    const newFrames = [...capturedFrames, result];
    setCapturedFrames(newFrames);

    if (newFrames.length >= ENROLLMENT_STEPS.length) {
      await submitEnrollment(newFrames);
    } else {
      setCurrentStep(currentStep + 1);
    }

    setIsCapturing(false);
  };

  const submitEnrollment = async (frames) => {
    setLoading(true);

    try {
      const avgDescriptor = calculateAverageDescriptor(frames.map(f => f.descriptor));

      const response = await axios.post(`${API_URL}/api/register/face`, {
        faceDescriptors: frames.map(f => f.descriptor),
        averageDescriptor: avgDescriptor
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.data.success) {
        setSuccess(true);
        updateUser({ faceEnrolled: true, employeeId: response.data.employeeId });
        closeModal();
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Face enrollment failed');
    } finally {
      setLoading(false);
      setCapturedFrames([]);
      setCurrentStep(0);
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

  const resetEnrollment = () => {
    setCapturedFrames([]);
    setCurrentStep(0);
    setIsCapturing(false);
    setError('');
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

        {success ? (
          <div style={styles.success}>
            <span style={styles.successIcon}>✓</span>
            <p>Face Enrollment Successful!</p>
            <p style={styles.successSubtext}>Redirecting to home...</p>
          </div>
        ) : (
          <>
            <div style={styles.infoBox}>
              <p style={styles.infoTitle}>📸 Face Enrollment Process</p>
              <p style={styles.infoText}>
                For maximum security, we'll capture 5 images of your face from different angles.
                This ensures accurate recognition when you clock in/out.
              </p>
              <ul style={styles.infoList}>
                <li>Look straight ahead</li>
                <li>Turn head slightly left</li>
                <li>Turn head slightly right</li>
                <li>Look up slightly</li>
                <li>Look down slightly</li>
              </ul>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="button"
              onClick={startCamera}
              style={styles.submitBtn}
              disabled={!modelsLoaded || loading}
            >
              {!modelsLoaded ? 'Loading Models...' : loading ? 'Processing...' : 'Start Camera & Begin Enrollment'}
            </button>
          </>
        )}

        <button onClick={() => navigate('/')} style={styles.backBtn}>
          Back to Home
        </button>
      </div>

      {/* Camera Enrollment Modal */}
      <CameraEnrollmentModal
        isOpen={isModalOpen}
        onClose={closeModal}
        videoRef={videoRef}
        canvasRef={canvasRef}
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        capturedFrames={capturedFrames}
        setCapturedFrames={setCapturedFrames}
        isCapturing={isCapturing}
        setIsCapturing={setIsCapturing}
        error={error}
        setError={setError}
        loading={loading}
        onCapture={handleCapture}
        onCancel={closeModal}
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

const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    backdropFilter: 'blur(4px)'
  },
  modal: {
    background: '#141414',
    borderRadius: '16px',
    padding: '32px',
    border: '1px solid #262626',
    maxWidth: '600px',
    width: '100%',
    position: 'relative',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    color: '#a3a3a3',
    fontSize: '28px',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    transition: 'all 0.2s'
  },
  stepIndicator: {
    fontSize: '14px',
    color: '#737373',
    marginBottom: '12px',
    textAlign: 'center'
  },
  instructionBox: {
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px'
  },
  instructionText: {
    fontSize: '18px',
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
    margin: 0
  },
  videoContainer: {
    marginBottom: '20px',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #262626'
  },
  video: {
    width: '100%',
    display: 'block',
    background: '#000'
  },
  canvas: {
    display: 'none'
  },
  framesCaptured: {
    fontSize: '14px',
    color: '#a3a3a3',
    marginBottom: '16px',
    textAlign: 'center'
  },
  error: {
    background: '#2a1a1a',
    color: '#f87171',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
    textAlign: 'center'
  },
  buttonRow: {
    display: 'flex',
    gap: '12px'
  },
  cancelBtn: {
    flex: 1,
    padding: '14px',
    background: '#1a1a1a',
    color: '#737373',
    border: '1px solid #262626',
    borderRadius: '8px',
    fontSize: '15px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  captureBtn: {
    flex: 2,
    padding: '14px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default FaceEnrollmentPage;
