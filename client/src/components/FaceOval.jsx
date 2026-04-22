import { useMemo } from 'react';

function FaceOval({
  progressPercent,
  status = 'searching',
  countdownValue = 3,
  message = ''
}) {
  // ── SVG geometry ─────────────────────────────────────────────
  const W  = 300;
  const H  = 400;           // taller viewBox so shape sits higher visually
  const cx = W / 2;         // 150
  const cy = H / 2 - 20;   // shift center up by 20px
  const rw = 108;           // half-width  — narrower for a taller feel
  const rh = 155;           // half-height — tall
  const r  = rw;            // corner radius = half-width → perfect pill ends

  // Rounded rect path starting from TOP-CENTER, going clockwise
  const x0 = cx - rw, x1 = cx + rw;
  const y0 = cy - rh, y1 = cy + rh;

  const rectPath = [
    `M ${cx} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `L ${x1} ${y1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `L ${x0 + r} ${y1}`,
    `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `L ${x0} ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `L ${cx} ${y0}`,
    'Z',
  ].join(' ');

  // Perimeter = 2*(width - 2r) + 2*(height - 2r) + 2πr
  const perimeter = 2 * (rw * 2 - 2 * r) + 2 * (rh * 2 - 2 * r) + 2 * Math.PI * r;
  const dashOffset = perimeter * (1 - progressPercent / 100);

  const isIdle      = status === 'searching' || status === 'detecting';
  const isHolding   = status === 'holding';
  const isWobbling  = status === 'wobbling';
  const isCapturing = status === 'capturing';
  const isSuccess   = status === 'done' || status === 'success' || progressPercent >= 100;

  const strokeColor = isWobbling  ? '#f59e0b'
    : isSuccess   ? '#40d9a0'
    : isCapturing ? '#a08cff'
    : isIdle      ? 'rgba(255,255,255,0.18)'
    : 'url(#retina-grad)';

  const guideColor = isWobbling  ? 'rgba(245,158,11,0.12)'
    : isSuccess   ? 'rgba(64,217,160,0.12)'
    : 'rgba(255,255,255,0.07)';

  const dotColor = isWobbling ? '#f59e0b' : isSuccess ? '#40d9a0' : '#40d9a0';

  return (
    <div style={styles.container}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={styles.svg}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="retina-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#40d9a0" />
            <stop offset="100%" stopColor="#a08cff" />
          </linearGradient>
          <linearGradient id="retina-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#40d9a0" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#a08cff" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Subtle inner fill when active */}
        {(isHolding || isWobbling || isSuccess) && (
          <path
            d={rectPath}
            fill={isSuccess ? 'rgba(64,217,160,0.07)' : isWobbling ? 'rgba(245,158,11,0.05)' : 'url(#retina-fill)'}
          />
        )}

        {/* Guide track */}
        <path
          d={rectPath}
          fill="none"
          stroke={guideColor}
          strokeWidth="3"
        />

        {/* Progress stroke */}
        <path
          d={rectPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={perimeter}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }}
        />

        {/* Top anchor dot */}
        {!isIdle && (
          <circle
            cx={cx} cy={y0}
            r="4"
            fill={dotColor}
            style={{ transition: 'fill 0.3s ease' }}
          />
        )}

        {/* ── Labels ── */}
        <g style={{ pointerEvents: 'none' }}>

          {isIdle && (
            <text
              x={cx} y={cy + 6}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontSize="12"
              fontWeight="600"
              fontFamily="Inter, system-ui, sans-serif"
              letterSpacing="0.06em"
            >
              POSITION FACE
            </text>
          )}

          {isHolding && (
            <>
              <text
                x={cx} y={progressPercent > 0 ? cy - 10 : cy + 6}
                textAnchor="middle"
                fill="#40d9a0"
                fontSize="11"
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="0.06em"
              >
                {progressPercent > 0 ? 'COLLECTING...' : 'HOLD STILL'}
              </text>
              {progressPercent > 0 && (
                <text
                  x={cx} y={cy + 16}
                  textAnchor="middle"
                  fill="#a08cff"
                  fontSize="22"
                  fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {Math.round(progressPercent)}%
                </text>
              )}
            </>
          )}

          {isWobbling && (
            <>
              <text
                x={cx} y={cy - 4}
                textAnchor="middle"
                fill="#f59e0b"
                fontSize="11"
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="0.06em"
              >
                HOLD STILL
              </text>
              <text
                x={cx} y={cy + 14}
                textAnchor="middle"
                fill="rgba(245,158,11,0.55)"
                fontSize="10"
                fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="0.04em"
              >
                RECOVERING
              </text>
            </>
          )}

          {isCapturing && (
            <text
              x={cx} y={cy + 6}
              textAnchor="middle"
              fill="#a08cff"
              fontSize="11"
              fontWeight="600"
              fontFamily="Inter, system-ui, sans-serif"
              letterSpacing="0.05em"
            >
              {message || 'PROCESSING...'}
            </text>
          )}

          {isSuccess && (
            <>
              <circle
                cx={cx} cy={cy - 10}
                r="22"
                fill="rgba(64,217,160,0.12)"
                stroke="rgba(64,217,160,0.3)"
                strokeWidth="1.5"
              />
              <text
                x={cx} y={cy - 2}
                textAnchor="middle"
                fill="#40d9a0"
                fontSize="20"
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
              >
                ✓
              </text>
              <text
                x={cx} y={cy + 22}
                textAnchor="middle"
                fill="rgba(64,217,160,0.7)"
                fontSize="10"
                fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="0.05em"
              >
                {message || 'ENROLLED'}
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

const SIZE_VMIN = 78;
const ASPECT = 400 / 300;

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10,
  },
  svg: {
    width: `${SIZE_VMIN}vmin`,
    height: `${SIZE_VMIN * ASPECT}vmin`,
    overflow: 'visible',
  },
};

export default FaceOval;