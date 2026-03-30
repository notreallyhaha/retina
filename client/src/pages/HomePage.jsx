import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Face Recognition Clock</h1>
        <p style={styles.subtitle}>Clock In/Out with Face Recognition</p>
        
        <div style={styles.buttonGroup}>
          <Link to="/clock" style={styles.button}>
            Clock In/Out
          </Link>
          <Link to="/register" style={styles.buttonSecondary}>
            Register
          </Link>
          <Link to="/admin" style={styles.buttonSecondary}>
            Admin
          </Link>
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
    marginBottom: '40px'
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
    transition: 'opacity 0.2s'
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
    transition: 'background 0.2s'
  }
};

export default HomePage;
