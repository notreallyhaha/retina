import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoImg from '../../images/viber_image_2026-03-30_15-19-54-560-removebg-preview.png';

function HomePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  // Replace the useEffect
  useEffect(() => {
    if (isAuthenticated && user?.isAdmin) {
      navigate('/admin', { replace: true }); 
    } else if (isAuthenticated && user?.faceEnrolled) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.glow} />
      <div style={styles.cardWrapper}>
        <div style={styles.card}>
          <div style={styles.logoContainer}>
            <img src={logoImg} alt="Retina" style={styles.logoImg} />
          </div>

          <p style={styles.subtitle}>Clock in and out with secure face recognition</p>

          {isAuthenticated ? (
            <div style={styles.userSection}>
              <div style={styles.userCard}>
                <div style={styles.userAvatar}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                <div style={styles.userDetails}>
                  <p style={styles.userName}>{user?.firstName} {user?.lastName}</p>
                  {user?.employeeId && (
                    <p style={styles.employeeId}>{user.employeeId}</p>
                  )}
                </div>
              </div>

              <div style={styles.statusRow}>
                {user?.faceEnrolled ? (
                  <span style={styles.badgeSuccess}>
                    <span style={styles.dot} />
                    Face enrolled
                  </span>
                ) : (
                  <span style={styles.badgeWarning}>
                    <span style={styles.dot} />
                    Face not enrolled
                  </span>
                )}
              </div>

              <div style={styles.actions}>
                {user?.faceEnrolled ? (
                  <Link to="/clock" style={styles.button}>
                    Clock In / Out
                  </Link>
                ) : (
                  <Link to="/face-enrollment" style={styles.button}>
                    Complete Face Enrollment
                  </Link>
                )}
                <button onClick={async () => { await logout(); navigate('/login'); }} style={styles.ghostButton}>
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.actions}>
              <Link to="/login" style={styles.button}>
                Sign in
              </Link>
              <Link to="/signup" style={styles.ghostButton}>
                Create account
              </Link>
            </div>
          )}
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
    maxWidth: '420px',
    width: '100%',
    position: 'relative',
    zIndex: 1,
    boxShadow: '0 0 60px rgba(81, 112, 255, 0.12)'
  },
  card: {
    background: 'linear-gradient(160deg, #161616 0%, #0f0f0f 100%)',
    borderRadius: '21px',
    padding: '48px 40px',
    textAlign: 'center'
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px'
  },
  logoImg: {
    height: '72px',
    objectFit: 'contain',
    filter: 'brightness(0) invert(1)'
  },
  subtitle: {
    color: '#6b6b6b',
    fontSize: '14px',
    marginBottom: '36px',
    lineHeight: '1.6'
  },
  userSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid #222222',
    borderRadius: '14px',
    padding: '14px 16px',
    textAlign: 'left'
  },
  userAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    fontWeight: '700',
    letterSpacing: '0.02em',
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(81, 112, 255, 0.3)'
  },
  userDetails: {
    flex: 1
  },
  userName: {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '2px'
  },
  employeeId: {
    color: '#4a4a4a',
    fontSize: '12px',
    fontFamily: 'monospace'
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'center'
  },
  badgeSuccess: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(34, 197, 94, 0.08)',
    color: '#86efac',
    padding: '6px 16px',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid rgba(34, 197, 94, 0.18)'
  },
  badgeWarning: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(251, 191, 36, 0.08)',
    color: '#fbbf24',
    padding: '6px 16px',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid rgba(251, 191, 36, 0.18)'
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'currentColor',
    flexShrink: 0
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '13px 20px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(81, 112, 255, 0.35)'
  },
  ghostButton: {
    display: 'block',
    width: '100%',
    padding: '13px 20px',
    background: 'rgba(255,255,255,0.04)',
    color: '#8a8a8a',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #242424',
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
    letterSpacing: '-0.01em'
  }
};

export default HomePage;
