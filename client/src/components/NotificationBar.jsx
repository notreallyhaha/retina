import { useEffect, useRef } from 'react';

/**
 * NotificationBar Component
 * Displays floating notifications at the top for failed quality criteria
 * Multiple notifications stack vertically
 * 
 * @param {Object} props
 * @param {string[]} props.messages - Array of notification messages to display
 * @param {boolean} props.visible - Whether to show the notification bar
 */
function NotificationBar({ messages = [], visible = true }) {
  const containerRef = useRef(null);

  // Filter out null/empty messages
  const validMessages = messages.filter(msg => msg && msg.trim());

  // Auto-hide when no messages
  const shouldShow = visible && validMessages.length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        opacity: shouldShow ? 1 : 0,
        transform: shouldShow ? 'translateY(0)' : 'translateY(-100%)',
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
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Get specific styling based on notification type
 */
function getNotificationStyle(message) {
  const baseStyle = { ...styles.notification };
  
  if (message.includes('TOO CLOSE') || message.includes('TOO FAR')) {
    return { ...baseStyle, ...styles.distanceWarning };
  }
  if (message.includes('TOO DARK') || message.includes('TOO BRIGHT')) {
    return { ...baseStyle, ...styles.lightingWarning };
  }
  if (message.includes('CENTER')) {
    return { ...baseStyle, ...styles.positionWarning };
  }
  if (message.includes('HEAD STRAIGHT')) {
    return { ...baseStyle, ...styles.tiltWarning };
  }
  if (message.includes('OPEN YOUR EYES')) {
    return { ...baseStyle, ...styles.eyesWarning };
  }
  
  return baseStyle;
}

const styles = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 16px',
    transition: 'all 0.3s ease',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    maxWidth: '400px'
  },
  notification: {
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    textAlign: 'center',
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    animation: 'slideIn 0.2s ease'
  },
  distanceWarning: {
    background: 'rgba(251, 191, 36, 0.2)',
    borderColor: 'rgba(251, 191, 36, 0.5)',
    color: '#fbbf24'
  },
  lightingWarning: {
    background: 'rgba(251, 191, 36, 0.2)',
    borderColor: 'rgba(251, 191, 36, 0.5)',
    color: '#fbbf24'
  },
  positionWarning: {
    background: 'rgba(59, 130, 246, 0.2)',
    borderColor: 'rgba(59, 130, 246, 0.5)',
    color: '#3b82f6'
  },
  tiltWarning: {
    background: 'rgba(59, 130, 246, 0.2)',
    borderColor: 'rgba(59, 130, 246, 0.5)',
    color: '#3b82f6'
  },
  eyesWarning: {
    background: 'rgba(251, 191, 36, 0.2)',
    borderColor: 'rgba(251, 191, 36, 0.5)',
    color: '#fbbf24'
  }
};

// Add animation keyframes
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
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
