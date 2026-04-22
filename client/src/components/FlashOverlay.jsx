/**
 * FlashOverlay Component
 * Displays flash animation during frame capture
 * Sequence: White → Green → Blue → White (200ms each)
 * 
 * @param {Object} props
 * @param {boolean} props.active - Whether flash is active
 * @param {number} props.flashIndex - Current flash index (0-3)
 * @param {string} props.flashColor - Current flash color
 */
function FlashOverlay({ active = false, flashIndex = 0, flashColor = 'white' }) {
  if (!active) return null;

  return (
    <div
      style={{
        ...styles.overlay,
        background: getFlashColor(flashColor)
      }}
    />
  );
}

/**
 * Get flash color value
 */
function getFlashColor(colorName) {
  switch (colorName) {
    case 'white':
      return 'rgba(255, 255, 255, 0.95)';
    case 'green':
      return 'rgba(34, 197, 94, 0.9)';
    case 'blue':
      return 'rgba(59, 130, 246, 0.9)';
    default:
      return 'rgba(255, 255, 255, 0.95)';
  }
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    pointerEvents: 'none',
    transition: 'background 0.05s ease'
  }
};

export default FlashOverlay;
