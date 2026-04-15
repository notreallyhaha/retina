import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validatePassword, passwordsMatch } from '../utils/validatePassword';

function SignUpPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordValidation, setPasswordValidation] = useState(null);

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    if (password) {
      setPasswordValidation(validatePassword(password));
    } else {
      setPasswordValidation(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const passwordResult = validatePassword(formData.password);
    if (!passwordResult.valid) {
      setError('Password does not meet requirements');
      return;
    }

    const matchResult = passwordsMatch(formData.password, formData.confirmPassword);
    if (!matchResult.valid) {
      setError(matchResult.error);
      return;
    }

    setLoading(true);

    try {
      const result = await register(
        formData.firstName.trim(),
        formData.lastName.trim(),
        formData.email.trim(),
        formData.password
      );

      if (result.success) {
        navigate('/face-enrollment');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create Account</h1>
        <p style={styles.subtitle}>Join the face recognition clock system</p>

        <form onSubmit={handleSubmit}>
          <div style={styles.nameRow}>
            <input
              type="text"
              placeholder="First Name"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              style={styles.input}
              required
            />
            <input
              type="text"
              placeholder="Last Name"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              style={styles.input}
              required
            />
          </div>

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
              onChange={handlePasswordChange}
              style={styles.input}
              required
            />
          </div>

          {passwordValidation && (
            <div style={styles.passwordRequirements}>
              {passwordValidation.valid ? (
                <PasswordRequirement met text="Password meets all requirements" />
              ) : (
                passwordValidation.errors.map((err, idx) => (
                  <PasswordRequirement key={idx} met={false} text={err} />
                ))
              )}
            </div>
          )}

          <div style={styles.formGroup}>
            <input
              type="password"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
            disabled={loading || (passwordValidation && !passwordValidation.valid)}
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Already have an account?{' '}
            <Link to="/login" style={styles.link}>Sign In</Link>
          </p>
        </div>

        <button onClick={() => navigate('/')} style={styles.backBtn}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

const PasswordRequirement = ({ met, text }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: met ? '#86efac' : '#737373',
    marginBottom: '4px'
  }}>
    <span style={{ fontSize: '10px' }}>{met ? '✓' : '○'}</span>
    <span>{text}</span>
  </div>
);

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
  nameRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px'
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
  passwordRequirements: {
    background: '#0a0a0a',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '12px',
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

export default SignUpPage;
