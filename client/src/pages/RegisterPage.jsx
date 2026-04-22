import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoImg from '../../images/viber_image_2026-03-30_15-19-54-560-removebg-preview.png';

function RegisterPage() {
  const navigate = useNavigate();
  const { register, isAuthenticated, user } = useAuth();

  // Replace the useEffect in both files
  useEffect(() => {
    if (isAuthenticated) {
      navigate(user?.isAdmin ? '/admin' : '/', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const result = await register(formData.firstName, formData.lastName, formData.email, formData.password)
      if (result.success) {
        navigate('/enroll-face', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.glow} />
      <div style={styles.cardWrapper}>
        <div style={styles.card}>
          <div style={styles.logoContainer}>
            <img src={logoImg} alt="Retina" style={styles.logoImg} />
          </div>

          <header style={styles.header}>
            <h1 style={styles.title}>Create account</h1>
            <p style={styles.subtitle}>Sign up for Retina</p>
          </header>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="Juan"
                  value={formData.firstName}
                  onChange={handleChange}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Dela Cruz"
                  value={formData.lastName}
                  onChange={handleChange}
                  style={styles.input}
                  required
                />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                value={formData.email}
                onChange={handleChange}
                style={styles.input}
                required
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Min. 8 characters"
                value={formData.password}
                onChange={handleChange}
                style={styles.input}
                required
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                style={styles.input}
                required
              />
            </div>

            {error && (
              <div style={styles.error}>
                <span style={styles.errorIcon}>⚠</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div style={styles.divider} />

          <p style={styles.footerText}>
            Already have an account?{' '}
            <Link to="/login" style={styles.link}>Sign in</Link>
          </p>

          <button onClick={() => navigate('/')} style={styles.backBtn}>
            ← Back to home
          </button>
        </div>
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
    padding: '24px',
    position: 'relative',
    overflow: 'hidden'
  },
  glow: {
    position: 'absolute',
    width: '800px',
    height: '800px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(81, 112, 255, 0.18) 0%, rgba(255, 102, 196, 0.1) 45%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: 0,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)'
  },
  cardWrapper: {
    background: 'linear-gradient(135deg, rgba(81, 112, 255, 0.55) 0%, rgba(255, 102, 196, 0.55) 100%)',
    borderRadius: '22px',
    padding: '1px',
    maxWidth: '440px',
    width: '100%',
    position: 'relative',
    zIndex: 1,
    boxShadow: '0 0 60px rgba(81, 112, 255, 0.12)'
  },
  card: {
    background: 'linear-gradient(160deg, #161616 0%, #0f0f0f 100%)',
    borderRadius: '21px',
    padding: '40px'
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px'
  },
  logoImg: {
    height: '68px',
    objectFit: 'contain',
    filter: 'brightness(0) invert(1)'
  },
  header: {
    marginBottom: '28px',
    textAlign: 'center'
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '-0.025em',
    marginBottom: '6px',
    color: '#ffffff'
  },
  subtitle: {
    color: '#6b6b6b',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  row: {
    display: 'flex',
    gap: '12px'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#a3a3a3',
    letterSpacing: '-0.01em'
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    background: '#0a0a0a',
    border: '1px solid #222222',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box'
  },
  error: {
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.18)',
    color: '#f87171',
    padding: '12px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  errorIcon: {
    fontSize: '14px',
    flexShrink: 0
  },
  submitBtn: {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    marginTop: '4px',
    boxShadow: '0 4px 24px rgba(81, 112, 255, 0.35)'
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent 0%, #262626 50%, transparent 100%)',
    margin: '28px 0'
  },
  footerText: {
    color: '#737373',
    fontSize: '13px',
    textAlign: 'center'
  },
  link: {
    color: '#7c8fff',
    textDecoration: 'none',
    fontWeight: '600'
  },
  backBtn: {
    display: 'block',
    width: '100%',
    marginTop: '14px',
    padding: '10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#525252',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500'
  }
};

export default RegisterPage;