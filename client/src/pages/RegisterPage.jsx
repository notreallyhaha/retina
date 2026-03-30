import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ENROLLMENT_STEPS = [
  { instruction: 'Look straight ahead', angle: 'center' },
  { instruction: 'Turn your head slightly left', angle: 'left' },
  { instruction: 'Turn your head slightly right', angle: 'right' },
  { instruction: 'Look up slightly', angle: 'up' },
  { instruction: 'Look down slightly', angle: 'down' }
];

function RegisterPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    employeeId: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  // Multi-frame enrollment state
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

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

  const startCamera = async () => {
    try {
      console.log('Requesting camera access...');
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Make sure you are using HTTPS or localhost.');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      console.log('Camera access granted');
      videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      
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

  const getFaceDescriptor = async () => {
    const video = videoRef.current;
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    return detection ? { descriptor: detection.descriptor, landmarks: detection.landmarks } : null;
  };

  // Quality check for enrollment image
  const checkQuality = async (result) => {
    if (!result) return { valid: false, reason: 'No face detected' };
    
    const landmarks = result.landmarks;
    if (!landmarks) return { valid: false, reason: 'Could not detect face landmarks' };
    
    // Check face size (should be reasonable portion of frame)
    const jawline = landmarks.getJawOutline();
    const faceWidth = Math.abs(jawline[16].x - jawline[0].x);
    const faceHeight = Math.abs(landmarks.nose.y - jawline[8].y);
    
    const video = videoRef.current;
    const minFaceSize = Math.min(video.videoWidth, video.videoHeight) * 0.2;
    
    if (faceWidth < minFaceSize || faceHeight < minFaceSize) {
      return { valid: false, reason: 'Face too small. Move closer to the camera.' };
    }
    
    // Check eye visibility
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
      // All frames captured, submit registration
      await submitRegistration(newFrames);
    } else {
      setCurrentStep(currentStep + 1);
    }
    
    setIsCapturing(false);
  };

  const submitRegistration = async (frames) => {
    setLoading(true);
    
    try {
      // Calculate average descriptor from all frames
      const avgDescriptor = calculateAverageDescriptor(frames.map(f => f.descriptor));
      
      const response = await axios.post(`${API_URL}/api/register`, {
        name: formData.name,
        email: formData.email,
        employeeId: formData.employeeId,
        faceDescriptors: frames.map(f => f.descriptor), // Store all descriptors
        averageDescriptor: avgDescriptor
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
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
    setError('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Secure Face Registration</h1>
        
        {!modelsLoaded && <div style={styles.loading}>Loading models...</div>}

        {success ? (
          <div style={styles.success}>
            <span style={styles.successIcon}>✓</span>
            <p>Registration Successful</p>
          </div>
        ) : (
          <form>
            {!cameraActive ? (
              <>
                <div style={styles.formGroup}>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <input
                    type="text"
                    placeholder="Employee ID"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                    style={styles.input}
                    required
                  />
                </div>
                
                <div style={styles.infoBox}>
                  <p style={styles.infoTitle}>📸 Secure Enrollment Process</p>
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

                <button type="button" onClick={startCamera} style={styles.submitBtn}>
                  Start Camera & Begin Enrollment
                </button>
              </>
            ) : (
              <div style={styles.enrollmentSection}>
                <div style={styles.stepIndicator}>
                  Step {currentStep + 1} of {ENROLLMENT_STEPS.length}
                </div>
                
                <div style={styles.instructionBox}>
                  <p style={styles.instructionText}>
                    {ENROLLMENT_STEPS[currentStep].instruction}
                  </p>
                </div>

                <div style={styles.videoContainer}>
                  <video ref={videoRef} autoPlay playsInline style={styles.video} />
                  <canvas ref={canvasRef} style={styles.canvas} />
                </div>

                <div style={styles.framesCaptured}>
                  Frames captured: {capturedFrames.length} / {ENROLLMENT_STEPS.length}
                </div>

                {error && <div style={styles.error}>{error}</div>}

                <div style={styles.buttonRow}>
                  <button 
                    type="button" 
                    onClick={resetEnrollment}
                    style={styles.cancelBtn}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={handleCapture}
                    style={styles.captureBtn}
                    disabled={loading || isCapturing}
                  >
                    {isCapturing ? 'Capturing...' : `Capture Frame ${currentStep + 1}`}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        <button onClick={() => navigate('/')} style={styles.backBtn}>
          Back to Home
        </button>
      </div>
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
    marginBottom: '24px',
    color: '#ffffff'
  },
  loading: {
    textAlign: 'center',
    padding: '20px',
    color: '#737373'
  },
  formGroup: {
    marginBottom: '12px'
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: '#0a0a0a',
    border: '1px solid #262626',
    borderRadius: '8px',
    fontSize: '15px',
    color: '#ffffff',
    outline: 'none'
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
  enrollmentSection: {
    textAlign: 'center'
  },
  stepIndicator: {
    fontSize: '14px',
    color: '#737373',
    marginBottom: '12px'
  },
  instructionBox: {
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  instructionText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#ffffff'
  },
  videoContainer: {
    marginBottom: '16px'
  },
  video: {
    width: '100%',
    borderRadius: '8px',
    background: '#000',
    border: '1px solid #262626'
  },
  canvas: {
    display: 'none'
  },
  framesCaptured: {
    fontSize: '14px',
    color: '#a3a3a3',
    marginBottom: '16px'
  },
  error: {
    background: '#2a1a1a',
    color: '#f87171',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
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
    cursor: 'pointer'
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
    cursor: 'pointer'
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

export default RegisterPage;
