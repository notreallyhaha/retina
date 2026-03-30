import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function ClockInOutPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [clockType, setClockType] = useState('in');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [location, setLocation] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    // Redirect if not authenticated
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Check if user has completed face enrollment
    if (!user?.faceEnrolled) {
      navigate('/face-enrollment');
      return;
    }

    startCamera();
    getLocation();
    loadModels();
    return () => stopCamera();
  }, [isAuthenticated, user, navigate]);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      setError('Failed to access camera. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        () => {
          console.log('Location access denied');
        }
      );
    }
  };

  const getFaceDescriptor = async () => {
    const video = videoRef.current;
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection ? detection.descriptor : null;
  };

  const captureAndClock = async () => {
    setError('');
    setLoading(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      const descriptor = await getFaceDescriptor();

      if (!descriptor) {
        setError('No face detected. Please position your face clearly in the camera.');
        setLoading(false);
        return;
      }

      const proofPhoto = canvas.toDataURL('image/jpeg', 0.8);

      const response = await axios.post(`${API_URL}/api/clock`, {
        type: clockType,
        location: location,
        faceDescriptor: Array.from(descriptor),
        proofPhoto
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      setSuccess(response.data);
      setTimeout(() => {
        setSuccess(null);
        navigate('/');
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Clock in/out failed');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth
  if (!isAuthenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>Redirecting to login...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Clock {clockType === 'in' ? 'In' : 'Out'}</h1>

        {!modelsLoaded && <div style={styles.loading}>Loading models...</div>}

        {success ? (
          <div style={styles.successCard}>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.successTitle}>Success</h2>
            <p style={styles.name}>{success.name}</p>
            <p style={styles.employeeId}>ID: {success.employeeId}</p>
            <p style={styles.timestamp}>
              {new Date(success.timestamp).toLocaleString()}
            </p>
            <div style={styles.recordBadge}>#{success.recordId}</div>
          </div>
        ) : (
          <>
            <div style={styles.userInfo}>
              <p style={styles.userName}>{user?.name}</p>
              <p style={styles.userEmployeeId}>{user?.employeeId}</p>
            </div>

            <div style={styles.toggleContainer}>
              <button
                onClick={() => setClockType('in')}
                style={clockType === 'in' ? styles.toggleActive : styles.toggle}
              >
                Clock In
              </button>
              <button
                onClick={() => setClockType('out')}
                style={clockType === 'out' ? styles.toggleActive : styles.toggle}
              >
                Clock Out
              </button>
            </div>

            <div style={styles.cameraSection}>
              <video ref={videoRef} autoPlay playsInline style={styles.video} />
              <canvas ref={canvasRef} style={styles.canvas} />
            </div>

            {location && (
              <div style={styles.location}>
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}

            <button
              onClick={captureAndClock}
              style={styles.submitBtn}
              disabled={loading || !modelsLoaded}
            >
              {loading ? 'Processing...' : `Clock ${clockType === 'in' ? 'In' : 'Out'}`}
            </button>
          </>
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
    maxWidth: '450px',
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
  userInfo: {
    background: '#0a0a0a',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
    textAlign: 'center'
  },
  userName: {
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '500',
    marginBottom: '4px'
  },
  userEmployeeId: {
    color: '#a3a3a3',
    fontSize: '14px'
  },
  toggleContainer: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px'
  },
  toggle: {
    flex: 1,
    padding: '12px',
    background: '#0a0a0a',
    border: '1px solid #262626',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#737373',
    cursor: 'pointer'
  },
  toggleActive: {
    flex: 1,
    padding: '12px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: '1px solid transparent',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  cameraSection: {
    textAlign: 'center',
    marginBottom: '16px'
  },
  video: {
    width: '100%',
    borderRadius: '8px',
    marginBottom: '12px',
    background: '#000',
    border: '1px solid #262626'
  },
  canvas: {
    display: 'none'
  },
  location: {
    background: '#0a0a0a',
    padding: '10px 14px',
    borderRadius: '8px',
    textAlign: 'center',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#737373',
    border: '1px solid #262626'
  },
  error: {
    background: '#2a1a1a',
    color: '#f87171',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  successCard: {
    background: '#141414',
    padding: '40px 24px',
    borderRadius: '12px',
    textAlign: 'center',
    border: '1px solid #262626'
  },
  successIcon: {
    fontSize: '48px',
    color: '#86efac',
    marginBottom: '16px'
  },
  successTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '8px'
  },
  name: {
    color: '#a3a3a3',
    fontSize: '16px',
    marginBottom: '4px'
  },
  employeeId: {
    color: '#ffffff',
    fontWeight: '500',
    fontSize: '14px',
    marginBottom: '8px'
  },
  timestamp: {
    color: '#525252',
    fontSize: '13px',
    marginBottom: '16px'
  },
  recordBadge: {
    background: '#0a0a0a',
    color: '#ffffff',
    padding: '8px 16px',
    borderRadius: '20px',
    display: 'inline-block',
    fontSize: '13px',
    border: '1px solid #262626'
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

export default ClockInOutPage;
