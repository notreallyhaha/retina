import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validatePassword, passwordsMatch } from '../utils/validatePassword';

function SignUpPage() {
  const navigate = useNavigate();
  const { register, isAuthenticated, user } = useAuth();

  // Replace the useEffect in both files
  useEffect(() => {
    if (isAuthenticated) {
      navigate(user?.isAdmin ? '/admin' : '/', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordValidation, setPasswordValidation] = useState(null);

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    setPasswordValidation(password ? validatePassword(password) : null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const passwordResult = validatePassword(formData.password);
    if (!passwordResult.valid) { setError('Password does not meet requirements'); return; }

    const matchResult = passwordsMatch(formData.password, formData.confirmPassword);
    if (!matchResult.valid) { setError(matchResult.error); return; }

    setLoading(true);

    try {
      const result = await register(formData.firstName.trim(), formData.lastName.trim(), formData.email.trim(), formData.password);
      if (result.success) navigate('/face-enrollment');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>Create your account</h1>
          <p style={styles.subtitle}>Join the face recognition clock system</p>
        </header>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.nameRow}>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="firstName">First name</label>
              <input id="firstName" type="text" placeholder="Jane" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} style={styles.input} required />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="lastName">Last name</label>
              <input id="lastName" type="text" placeholder="Doe" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} style={styles.input} required />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="you@company.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={styles.input} required />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="Create a strong password" value={formData.password} onChange={handlePasswordChange} style={styles.input} required />

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
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" placeholder="Re-enter your password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} style={styles.input} required />
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
            disabled={loading || (passwordValidation && !passwordValidation.valid)}
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
  );
}

const PasswordRequirement = ({ met, text }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: met ? '#86efac' : '#737373',
    marginBottom: '4px'
  }}>
    <span style={{
      width: '14px',
      height: '14px',
      borderRadius: '4px',
      border: met ? '1.5px solid #22c55e' : '1.5px solid #404040',
      background: met ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '9px',
      color: '#22c55e',
      flexShrink: 0
    }}>
      {met ? '✓' : ''}
    </span>
    <span>{text}</span>
  </div>
);

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  card: {
    background: '#111111',
    borderRadius: '12px',
    padding: '40px',
    border: '1px solid #1f1f1f',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)'
  },
  header: {
    marginBottom: '28px',
    textAlign: 'center'
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '-0.025em',
    marginBottom: '8px',
    color: '#ffffff'
  },
  subtitle: {
    color: '#737373',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  nameRow: {
    display: 'flex',
    gap: '12px'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
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
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#ffffff',
    outline: 'none'
  },
  passwordRequirements: {
    background: '#0a0a0a',
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    padding: '10px 12px',
    marginTop: '10px'
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    padding: '12px 14px',
    borderRadius: '8px',
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
    padding: '12px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'opacity 0.15s ease, transform 0.15s ease'
  },
  divider: {
    height: '1px',
    background: '#1f1f1f',
    margin: '24px 0'
  },
  footerText: {
    color: '#737373',
    fontSize: '13px',
    textAlign: 'center'
  },
  link: {
    color: '#5170ff',
    textDecoration: 'none',
    fontWeight: '600'
  },
  backBtn: {
    display: 'block',
    width: '100%',
    marginTop: '16px',
    padding: '10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#525252',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'color 0.15s ease'
  }
};

export default SignUpPage;
