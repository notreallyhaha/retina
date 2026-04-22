import { useMemo } from 'react';

/**
 * NotificationBar Component - Railway Style
 * Floating notifications with refined styling at the bottom of the camera view
 *
 * @param {Object} props
 * @param {string[]} props.messages - Array of notification messages to display
 * @param {boolean} props.visible - Whether to show the notification bar
 */
function NotificationBar({ messages = [], visible = true }) {
  const validMessages = useMemo(() => messages.filter(msg => msg && msg.trim()), [messages]);
  const shouldShow = visible && validMessages.length > 0;

  return (
    <div
      style={{
        ...styles.container,
        opacity: shouldShow ? 1 : 0,
        transform: shouldShow ? 'translateY(0)' : 'translateY(10px)',
        pointerEvents: shouldShow ? 'auto' : 'none',
        maxHeight: shouldShow ? '200px' : '0'
      }}
    >
      <div style={styles.content}>
        {validMessages.map((message, index) => (
          <div
            key={index}
            style={{
              ...styles.notification,
              ...getNotificationStyle(message)
            }}
          >
            <span style={styles.warningIcon}>⚠</span>
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}

function getNotificationStyle(message) {
  const base = { ...styles.notification };

  if (message.includes('TOO CLOSE') || message.includes('TOO FAR'))
    return { ...base, ...styles.distanceWarning };
  if (message.includes('TOO DARK') || message.includes('TOO BRIGHT'))
    return { ...base, ...styles.lightingWarning };
  if (message.includes('CENTER'))
    return { ...base, ...styles.positionWarning };
  if (message.includes('HEAD STRAIGHT'))
    return { ...base, ...styles.tiltWarning };
  if (message.includes('OPEN YOUR EYES'))
    return { ...base, ...styles.eyesWarning };

  return base;
}

const styles = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 16px 16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
    maxWidth: '360px'
  },
  notification: {
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    textAlign: 'center',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    animation: 'slideUp 0.2s ease',
    letterSpacing: '-0.01em'
  },
  warningIcon: {
    fontSize: '11px',
    flexShrink: 0
  },
  distanceWarning: {
    background: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    color: '#fbbf24'
  },
  lightingWarning: {
    background: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    color: '#fbbf24'
  },
  positionWarning: {
    background: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    color: '#60a5fa'
  },
  tiltWarning: {
    background: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    color: '#60a5fa'
  },
  eyesWarning: {
    background: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    color: '#fbbf24'
  }
};

// Add animation keyframes
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
if (document.head && !document.getElementById('notification-animations')) {
  styleSheet.id = 'notification-animations';
  document.head.appendChild(styleSheet);
}

export default NotificationBar;
