import { useMemo } from 'react';

/**
 * FaceOval Component
 * Oval face guide with progress ring that fills green when criteria are met
 * 
 * @param {Object} props
 * @param {boolean} props.allCriteriaMet - All quality criteria passing
 * @param {number} props.stableTime - Time face has been stable (0-2000ms)
 * @param {boolean} props.countingDown - Currently in countdown phase
 * @param {number} props.countdownValue - Current countdown value (3, 2, 1)
 * @param {boolean} props.capturing - Currently capturing frames
 * @param {string} props.status - Current status: 'searching' | 'ready' | 'holding' | 'countdown' | 'capturing'
 */
function FaceOval({
  allCriteriaMet = false,
  stableTime = 0,
  countingDown = false,
  countdownValue = 3,
  capturing = false,
  status = 'searching'
}) {
  // Calculate progress ring fill based on stable time (0-2000ms -> 0-100%)
  const progressPercent = useMemo(() => {
    if (status === 'countdown') return 100;
    if (status === 'capturing') return 100;
    if (status === 'holding') return 100; // Full progress when holding
    return Math.min(100, (stableTime / 2000) * 100);
  }, [stableTime, status]);

  // Determine oval color
  const ovalColor = useMemo(() => {
    if (capturing) return '#3b82f6'; // Blue during capture
    if (countingDown) return '#22c55e'; // Green during countdown
    if (allCriteriaMet) return '#22c55e'; // Green when ready
    return '#525252'; // Gray when searching
  }, [allCriteriaMet, countingDown, capturing]);

  // Calculate stroke dasharray for progress ring
  // Using Ramanujan's approximation for ellipse circumference
  const ovalRx = 120; // Horizontal radius
  const ovalRy = 160; // Vertical radius
  const h = Math.pow(ovalRx - ovalRy, 2) / Math.pow(ovalRx + ovalRy, 2);
  const circumference = Math.PI * (ovalRx + ovalRy) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  const strokeDashoffset = circumference * (1 - progressPercent / 100);

  return (
    <div style={styles.container}>
      <svg
        viewBox="0 0 300 380"
        style={styles.svg}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Define the oval path */}
        <defs>
          <ellipse id="faceOval" cx="150" cy="190" rx={ovalRx} ry={ovalRy} />
        </defs>

        {/* Background oval (gray track) */}
        <ellipse
          cx="150"
          cy="190"
          rx={ovalRx}
          ry={ovalRy}
          fill="none"
          stroke="#262626"
          strokeWidth="4"
        />

        {/* Progress ring (green fill) */}
        <ellipse
          cx="150"
          cy="190"
          rx={ovalRx}
          ry={ovalRy}
          fill="none"
          stroke={ovalColor}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.1s linear, stroke 0.2s ease',
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%'
          }}
        />

        {/* Inner guide text/icon */}
        <g style={{ pointerEvents: 'none' }}>
          {status === 'searching' && (
            <>
              <text
                x="150"
                y="175"
                textAnchor="middle"
                fill="#737373"
                fontSize="14"
                fontWeight="500"
              >
                FACE HERE
              </text>
              <text
                x="150"
                y="205"
                textAnchor="middle"
                fill="#525252"
                fontSize="24"
              >
                📷
              </text>
            </>
          )}

          {status === 'ready' && (
            <>
              <text
                x="150"
                y="185"
                textAnchor="middle"
                fill="#22c55e"
                fontSize="14"
                fontWeight="500"
              >
                ✓ Perfect
              </text>
              <text
                x="150"
                y="210"
                textAnchor="middle"
                fill="#86efac"
                fontSize="12"
              >
                Hold still...
              </text>
            </>
          )}

          {status === 'holding' && (
            <>
              <text
                x="150"
                y="185"
                textAnchor="middle"
                fill="#22c55e"
                fontSize="14"
                fontWeight="500"
              >
                ✓ Hold Still
              </text>
              <text
                x="150"
                y="210"
                textAnchor="middle"
                fill="#86efac"
                fontSize="12"
              >
                {Math.round(progressPercent)}%
              </text>
            </>
          )}

          {status === 'countdown' && (
            <text
              x="150"
              y="200"
              textAnchor="middle"
              fill="#22c55e"
              fontSize="48"
              fontWeight="700"
            >
              {countdownValue}
            </text>
          )}

          {status === 'capturing' && (
            <>
              <text
                x="150"
                y="185"
                textAnchor="middle"
                fill="#3b82f6"
                fontSize="14"
                fontWeight="500"
              >
                Capturing...
              </text>
              <text
                x="150"
                y="210"
                textAnchor="middle"
                fill="#60a5fa"
                fontSize="12"
              >
                Flash {capturing}
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    width: '300px',
    height: '380px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  svg: {
    width: '100%',
    height: '100%',
    maxWidth: '300px',
    maxHeight: '380px'
  }
};

export default FaceOval;
