import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function HomePage() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Face Recognition Clock</h1>
        <p style={styles.subtitle}>Clock In/Out with Face Recognition</p>

        {isAuthenticated ? (
          <div>
            <div style={styles.userSection}>
              <p style={styles.welcomeText}>Welcome back, {user?.name}!</p>
              {user?.employeeId && (
                <p style={styles.employeeId}>Employee ID: {user.employeeId}</p>
              )}
              {user?.faceEnrolled ? (
                <span style={styles.enrolledBadge}>✓ Face Enrolled</span>
              ) : (
                <span style={styles.pendingBadge}>⚠ Face Not Enrolled</span>
              )}
            </div>

            <div style={styles.buttonGroup}>
              {user?.faceEnrolled ? (
                <Link to="/clock" style={styles.button}>
                  Clock In/Out
                </Link>
              ) : (
                <Link to="/face-enrollment" style={styles.button}>
                  Complete Face Enrollment
                </Link>
              )}
              
              <button onClick={logout} style={styles.logoutBtn}>
                Logout
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.buttonGroup}>
            <Link to="/login" style={styles.button}>
              Sign In
            </Link>
            <Link to="/signup" style={styles.buttonSecondary}>
              Register
            </Link>
          </div>
        )}
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
    padding: '48px 40px',
    border: '1px solid #262626',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%'
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '8px',
    letterSpacing: '-0.5px'
  },
  subtitle: {
    color: '#737373',
    fontSize: '14px',
    marginBottom: '32px'
  },
  userSection: {
    marginBottom: '24px'
  },
  welcomeText: {
    color: '#ffffff',
    fontSize: '16px',
    marginBottom: '8px'
  },
  employeeId: {
    color: '#a3a3a3',
    fontSize: '14px',
    marginBottom: '12px'
  },
  enrolledBadge: {
    display: 'inline-block',
    background: '#1a2a1a',
    color: '#86efac',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    border: '1px solid #2d5a2d'
  },
  pendingBadge: {
    display: 'inline-block',
    background: '#2a1a1a',
    color: '#f87171',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    border: '1px solid #5a2d2d'
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  button: {
    display: 'block',
    padding: '14px 24px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '500',
    transition: 'opacity 0.2s',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center'
  },
  buttonSecondary: {
    display: 'block',
    padding: '14px 24px',
    background: '#1a1a1a',
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '500',
    border: '1px solid #262626',
    transition: 'background 0.2s',
    textAlign: 'center'
  },
  logoutBtn: {
    display: 'block',
    padding: '14px 24px',
    background: 'transparent',
    color: '#737373',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '500',
    border: '1px solid #262626',
    cursor: 'pointer',
    transition: 'all 0.2s',
    width: '100%'
  }
};

export default HomePage;
