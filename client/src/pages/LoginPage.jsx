import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Since Firebase Admin SDK doesn't provide email/password sign-in server-side,
      // we send just email/password and the server will attempt a custom flow
      const result = await login(formData.email, formData.password, null);

      if (result.success) {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Welcome Back</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Don't have an account?{' '}
            <Link to="/signup" style={styles.link}>Sign Up</Link>
          </p>
        </div>

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
    maxWidth: '400px',
    width: '100%'
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: '8px',
    color: '#ffffff'
  },
  subtitle: {
    color: '#737373',
    fontSize: '14px',
    textAlign: 'center',
    marginBottom: '32px'
  },
  formGroup: {
    marginBottom: '16px'
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
    cursor: 'pointer',
    marginTop: '8px'
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center'
  },
  footerText: {
    color: '#737373',
    fontSize: '14px'
  },
  link: {
    color: '#5170ff',
    textDecoration: 'none',
    fontWeight: '500'
  },
  backBtn: {
    display: 'block',
    width: '100%',
    marginTop: '24px',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#737373',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default LoginPage;
