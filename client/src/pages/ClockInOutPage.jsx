import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  loadFaceApiModels,
  detectFace,
  captureFrame,
} from '../utils/faceDetection';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const DETECTION_INTERVAL_MS = 250;
const CAPTURE_WINDOW_MS     = 3000; // 3s to press capture after face detected

/* ── helpers ────────────────────────────────────────────────── */
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function formatLocation(loc) {
  if (!loc) return 'Location unavailable';
  return `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
}

/* ── component ──────────────────────────────────────────────── */
function ClockInOutPage() {
  const navigate   = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const streamRef      = useRef(null);
  const loopTimerRef   = useRef(null);
  const windowTimerRef = useRef(null);
  const loopRunning       = useRef(false);
  const capturedFrameRef  = useRef(null);
  const pendingPayloadRef = useRef(null);

  // ── state ─────────────────────────────────────────────────
  const [now,            setNow]           = useState(new Date());
  const [clockType,      setClockType]     = useState('IN');   // auto-detected
  const [location,       setLocation]      = useState(null);
  const [cameraReady,    setCameraReady]   = useState(false);
  const [modelsLoaded,   setModelsLoaded]  = useState(false);
  const [faceDetected,   setFaceDetected]  = useState(false);
  const [captureEnabled, setCaptureEnabled]= useState(false);  // 3s window open
  const [countdown,      setCountdown]     = useState(0);
  const [lockSeconds,    setLockSeconds]   = useState(0);   // 1-hour lock after IN
  const [loading,        setLoading]       = useState(false);
  const [result,         setResult]        = useState(null);   // server response
  const [error,          setError]         = useState('');

  // ── clock tick ────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── 1-hour lock countdown ─────────────────────────────────
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const t = setInterval(() => setLockSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockSeconds > 0]);

  // ── auth guard ────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (!user?.faceEnrolled) { navigate('/face-enrollment'); return; }
  }, [isAuthenticated, user, navigate]);

  // ── detect auto clock type from last record ───────────────
  useEffect(() => {
    const fetchLast = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/clock/last`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const rec = res.data.record;
        if (!rec) { setClockType('IN'); setLockSeconds(0); return; }
        // IN and IN_OVERTIME both mean next action is OUT
        const isIn = rec.type === 'IN' || rec.type === 'IN_OVERTIME';
        setClockType(isIn ? 'OUT' : 'IN');
        setLockSeconds(isIn ? (rec.lockRemainingSeconds || 0) : 0);
      } catch {
        setClockType('IN');
        setLockSeconds(0);
      }
    };
    fetchLast();
  }, []);

  // ── location ──────────────────────────────────────────────
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      ()  => setLocation(null)
    );
  }, []);

  // ── load models + camera ──────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        await loadFaceApiModels();
        if (mounted) setModelsLoaded(true);
      } catch { setError('Failed to load face models. Please refresh.'); }
    };
    init();

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (mounted) setCameraReady(true);
        }
      } catch { setError('Failed to access camera. Please allow camera permissions.'); }
    };
    startCamera();

    return () => {
      mounted = false;
      loopRunning.current = false;
      clearTimeout(loopTimerRef.current);
      clearTimeout(windowTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── detection + capture window — all ref-based, no stale closures ──
  const windowOpenRef = useRef(false);

  const startDetectionLoop = useCallback(() => {
    const tick = async () => {
      if (!loopRunning.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (video && video.readyState >= 2 && canvas) {
        const ctx = canvas.getContext('2d', { alpha: false });
        canvas.width = 640; canvas.height = 480;
        ctx.drawImage(video, 0, 0, 640, 480);
        try {
          const det = await detectFace(canvas, 'detection');
          if (!loopRunning.current) return;
          if (det && !windowOpenRef.current) {
            // Face detected — open 3s capture window
            windowOpenRef.current = true;
            loopRunning.current = false;
            clearTimeout(loopTimerRef.current);
            setCaptureEnabled(true);
            setFaceDetected(true);
            setCountdown(3);
            let c = 3;
            const countInterval = setInterval(() => {
              c -= 1;
              setCountdown(c);
              if (c <= 0) clearInterval(countInterval);
            }, 1000);
            windowTimerRef.current = setTimeout(() => {
              clearInterval(countInterval);
              windowOpenRef.current = false;
              setCaptureEnabled(false);
              setFaceDetected(false);
              setCountdown(0);
              loopRunning.current = true;
              startDetectionLoopRef.current();
            }, CAPTURE_WINDOW_MS);
            return;
          }
        } catch { /* silent */ }
      }
      if (loopRunning.current) {
        loopTimerRef.current = setTimeout(tick, DETECTION_INTERVAL_MS);
      }
    };
    loopTimerRef.current = setTimeout(tick, DETECTION_INTERVAL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use a ref to startDetectionLoop so setTimeout callback is never stale
  const startDetectionLoopRef = useRef(startDetectionLoop);
  useEffect(() => { startDetectionLoopRef.current = startDetectionLoop; }, [startDetectionLoop]);

  // Start loop once camera + models ready
  useEffect(() => {
    if (!cameraReady || !modelsLoaded) return;
    loopRunning.current = true;
    startDetectionLoop();
    return () => {
      loopRunning.current = false;
      clearTimeout(loopTimerRef.current);
      clearTimeout(windowTimerRef.current);
    };
  }, [cameraReady, modelsLoaded, startDetectionLoop]);

  // ── capture & submit ──────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (!captureEnabled || loading) return;
    clearTimeout(windowTimerRef.current);
    setCaptureEnabled(false);
    setLoading(true);
    setError('');

    try {
      const video = videoRef.current;
      const frameDataUrl = captureFrame(video);
      capturedFrameRef.current = frameDataUrl; // freeze display

      // Send at 480px — good balance of DeepFace accuracy vs payload size
      const proofCanvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / video.videoWidth);
      proofCanvas.width  = Math.round(video.videoWidth  * scale);
      proofCanvas.height = Math.round(video.videoHeight * scale);
      proofCanvas.getContext('2d').drawImage(video, 0, 0, proofCanvas.width, proofCanvas.height);
      const proofPhoto = proofCanvas.toDataURL('image/jpeg', 0.85);

      const res = await axios.post(
        `${API_URL}/api/clock`,
        {
          type: clockType,
          location,
          proofPhoto,  // server runs DeepFace on this
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          timeout: 30000,
        }
      );

      if (!res.data.matched) {
        pendingPayloadRef.current = { type: res.data.clockType || clockType, location, proofPhoto, distance: res.data.distance };
      }
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Something went wrong');
      // Reset so user can try again
      windowOpenRef.current = false;
      capturedFrameRef.current = null;
      setCaptureEnabled(false);
      setFaceDetected(false);
      setCountdown(0);
      loopRunning.current = true;
      startDetectionLoopRef.current();
    } finally {
      setLoading(false);
    }
  }, [captureEnabled, loading, clockType, location, startDetectionLoop]);

  // ── request approval ──────────────────────────────────────
  const handleRequestApproval = useCallback(async () => {
    if (!pendingPayloadRef.current) return;
    setError('');
    try {
      await axios.post(
        `${API_URL}/api/clock/request-approval`,
        pendingPayloadRef.current,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, timeout: 15000 }
      );
      pendingPayloadRef.current = null;
      setResult(prev => ({ ...prev, approvalRequested: true }));
    } catch (e) {
      setError('Failed to request approval.');
    }
  }, []);

  // ── retry ─────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setResult(null);
    setError('');
    setCaptureEnabled(false);
    setFaceDetected(false);
    setCountdown(0);
    windowOpenRef.current = false;
    capturedFrameRef.current = null;
    pendingPayloadRef.current = null;
    loopRunning.current = true;
    startDetectionLoopRef.current();
  }, []);

  const initials = `${user?.firstName?.charAt(0) || ''}${user?.lastName?.charAt(0) || ''}`.toUpperCase();

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div style={S.page}>

      {/* ── TOP INFO BAR ── */}
      <div style={S.topBar}>
        <div style={S.topLeft}>
          <div style={S.logo}>
            <span style={S.logoText}>retina</span>
          </div>
          <div style={S.locationRow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
            <span style={S.locationText}>{formatLocation(location)}</span>
          </div>
        </div>
        <div style={S.topRight}>
          <div style={S.timeDisplay}>{formatTime(now)}</div>
          <div style={S.dateDisplay}>{formatDate(now)}</div>
        </div>
      </div>

      {/* ── CAMERA AREA ── */}
      <div style={S.cameraArea}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={S.video}
        />
        <canvas ref={canvasRef} style={S.hiddenCanvas} />

        {/* Face guide — only show when not loading and no result */}
        {!result && !loading && (
          <div style={S.guideOverlay}>
            <svg
              viewBox="0 0 300 380"
              style={S.guideSvg}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="cg" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#40d9a0"/>
                  <stop offset="100%" stopColor="#a08cff"/>
                </linearGradient>
              </defs>
              {(() => {
                const cx=150, cy=190, rw=108, rh=148, r=108;
                const x0=cx-rw, x1=cx+rw, y0=cy-rh, y1=cy+rh;
                const d = [
                  `M ${cx} ${y0}`,
                  `L ${x1-r} ${y0}`, `A ${r} ${r} 0 0 1 ${x1} ${y0+r}`,
                  `L ${x1} ${y1-r}`, `A ${r} ${r} 0 0 1 ${x1-r} ${y1}`,
                  `L ${x0+r} ${y1}`, `A ${r} ${r} 0 0 1 ${x0} ${y1-r}`,
                  `L ${x0} ${y0+r}`, `A ${r} ${r} 0 0 1 ${x0+r} ${y0}`,
                  `L ${cx} ${y0}`, 'Z',
                ].join(' ');
                return (
                  <>
                    <path d={d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.5"/>
                    <path d={d} fill="none"
                      stroke={captureEnabled ? 'url(#cg)' : 'rgba(255,255,255,0.18)'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      style={{ transition: 'stroke 0.3s ease' }}
                    />
                    {captureEnabled && <circle cx={cx} cy={y0} r="4" fill="#40d9a0"/>}
                  </>
                );
              })()}
            </svg>

            {/* Guide label */}
            <div style={S.guideLabel}>
              {!modelsLoaded
                ? 'Loading models…'
                : !cameraReady
                ? 'Starting camera…'
                : captureEnabled
                ? null
                : 'Position your face in the guide'}
            </div>

          </div>
        )}

        {/* ── Floating capture group — counter on top, button below, overlaid on camera ── */}
        {!result && !loading && (
          <div style={{
            position: 'absolute', bottom: 24, left: 0, right: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            zIndex: 15, pointerEvents: 'none',
          }}>
            {/* Countdown — only visible during 3s window */}
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              fontVariantNumeric: 'tabular-nums',
              color: captureEnabled ? 'rgba(64,217,160,0.85)' : 'transparent',
              transition: 'color 0.2s',
              userSelect: 'none',
            }}>
              {countdown}s
            </div>

            {/* Circular shutter button */}
            <div style={{ position: 'relative', pointerEvents: 'all' }}>
              {/* Outer ring — gradient border trick via padding + background */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                padding: 2,
                background: captureEnabled && !(lockSeconds > 0 && clockType === 'OUT')
                  ? 'linear-gradient(135deg, #40d9a0, #a08cff)'
                  : 'linear-gradient(135deg, rgba(64,217,160,0.2), rgba(160,140,255,0.2))',
                boxShadow: captureEnabled && !(lockSeconds > 0 && clockType === 'OUT')
                  ? '0 0 24px rgba(64,217,160,0.45), 0 0 48px rgba(160,140,255,0.2)'
                  : 'none',
                transition: 'all 0.3s ease',
              }}>
                {/* Inner button */}
                <button
                  onClick={handleCapture}
                  disabled={!captureEnabled || (lockSeconds > 0 && clockType === 'OUT')}
                  style={{
                    width: '100%', height: '100%', borderRadius: '50%',
                    border: 'none',
                    background: captureEnabled && !(lockSeconds > 0 && clockType === 'OUT')
                      ? 'linear-gradient(135deg, #40d9a0, #a08cff)'
                      : 'rgba(8,8,16,0.6)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    cursor: captureEnabled && !(lockSeconds > 0 && clockType === 'OUT')
                      ? 'pointer' : 'not-allowed',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                    transition: 'all 0.3s ease',
                  }}
                >
                  {(lockSeconds > 0 && clockType === 'OUT') ? (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.03em', lineHeight: 1.5, textAlign: 'center' }}>
                      {Math.floor(lockSeconds/60)}m{'\n'}{lockSeconds%60}s
                    </span>
                  ) : (
                    /* Camera lens circle */
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: captureEnabled
                        ? 'rgba(0,0,0,0.25)'
                        : 'transparent',
                      border: captureEnabled
                        ? '2px solid rgba(0,0,0,0.2)'
                        : '1.5px solid rgba(255,255,255,0.1)',
                      transition: 'all 0.3s ease',
                    }}/>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading overlay — frozen frame hides live camera */}
        {loading && (
          <div style={S.loadingOverlay}>
            {capturedFrameRef.current && (
              <img src={capturedFrameRef.current} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', transform: 'scaleX(-1)', opacity: 0.45,
              }}/>
            )}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={S.spinner}/>
              <div style={S.loadingText}>Verifying face…</div>
            </div>
          </div>
        )}

        {/* Result overlay */}
        {result && (
          <div style={S.resultOverlay}>
            {result.status === 'matched' && (
              <div style={{ ...S.resultCard, borderColor: 'rgba(64,217,160,0.3)' }}>
                <div style={{ ...S.resultIcon, background: 'rgba(64,217,160,0.15)', color: '#40d9a0' }}>✓</div>
                <div style={{ ...S.resultBadge, background: 'rgba(64,217,160,0.15)', color: '#40d9a0', border: '1px solid rgba(64,217,160,0.3)' }}>
                  MATCHED
                </div>
                <div style={S.resultName}>{result.name}</div>
                <div style={S.resultMeta}>Clock {result.type || clockType} · {new Date(result.timestamp).toLocaleTimeString()}</div>
                <div style={S.resultId}>{result.employeeId}</div>
                <button onClick={() => navigate('/dashboard')} style={{ ...S.actionBtn, background: 'rgba(64,217,160,0.15)', color: '#40d9a0', border: '1px solid rgba(64,217,160,0.3)' }}>
                  Go to Dashboard
                </button>
              </div>
            )}

            {result.status === 'pending' && (
              <div style={{ ...S.resultCard, borderColor: 'rgba(245,158,11,0.3)' }}>
                <div style={{ ...S.resultIcon, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>!</div>
                <div style={{ ...S.resultBadge, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                  {result.approvalRequested ? 'PENDING APPROVAL' : 'NOT MATCHED'}
                </div>
                <div style={S.resultName}>{result.name}</div>
                <div style={S.resultMeta}>Clock {result.type || clockType} · {new Date(result.timestamp).toLocaleTimeString()}</div>
                {!result.approvalRequested ? (
                  <div style={S.pendingActions}>
                    <button onClick={handleRequestApproval} style={{ ...S.actionBtn, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                      Request Approval
                    </button>
                    <button onClick={handleRetry} style={{ ...S.actionBtn, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      Try Again
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={S.approvalNote}>Your record has been flagged for admin review.</div>
                    <button onClick={() => navigate('/dashboard')} style={{ ...S.actionBtn, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                      Go to Dashboard
                    </button>
                  </>
                )}
              </div>
            )}

            {result.status === 'approved' && (
              <div style={{ ...S.resultCard, borderColor: 'rgba(160,140,255,0.3)' }}>
                <div style={{ ...S.resultIcon, background: 'rgba(160,140,255,0.15)', color: '#a08cff' }}>✓</div>
                <div style={{ ...S.resultBadge, background: 'rgba(160,140,255,0.15)', color: '#a08cff', border: '1px solid rgba(160,140,255,0.3)' }}>
                  APPROVED
                </div>
                <div style={S.resultName}>{result.name}</div>
                <div style={S.resultMeta}>Clock {result.type || clockType} · {new Date(result.timestamp).toLocaleTimeString()}</div>
                <button onClick={() => navigate('/dashboard')} style={{ ...S.actionBtn, background: 'rgba(160,140,255,0.15)', color: '#a08cff', border: '1px solid rgba(160,140,255,0.3)' }}>
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={S.bottomBar}>
        {error && <div style={S.errorMsg}>{error}</div>}

        <div style={S.bottomRow}>
          {/* User chip — avatar + name + employee ID */}
          <div style={S.userChip}>
            <div style={S.avatar}>{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={S.userName}>{user?.firstName} {user?.lastName}</div>
              <div style={S.userId}>{user?.employeeId}</div>
            </div>
          </div>

          {/* Clock type indicator */}
          <div style={{
            ...S.clockTypePill,
            background: clockType === 'OUT' ? 'rgba(160,140,255,0.12)' : 'rgba(64,217,160,0.12)',
            color: clockType === 'OUT' ? '#a08cff' : '#40d9a0',
            border: `1px solid ${clockType === 'OUT' ? 'rgba(160,140,255,0.3)' : 'rgba(64,217,160,0.3)'}`,
          }}>
            {clockType === 'OUT' ? 'Clock OUT' : clockType === 'IN' ? 'Clock IN' : 'Clock IN (OT)'}
          </div>

        </div>

        <button onClick={() => navigate('/dashboard')} style={S.backBtn}>
          ← Back
        </button>
      </div>
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────── */
const S = {
  page: {
    position: 'fixed', inset: 0,
    background: '#080810',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '14px 20px',
    background: 'rgba(8,8,16,0.9)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    zIndex: 20, flexShrink: 0,
  },
  topLeft: { display: 'flex', flexDirection: 'column', gap: 4 },
  logo:    { display: 'flex', alignItems: 'center' },
  logoText: {
    fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em',
    background: 'linear-gradient(90deg, #40d9a0, #a08cff)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  locationRow: { display: 'flex', alignItems: 'center', gap: 5 },
  locationText: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  topRight: { textAlign: 'right' },
  timeDisplay: { fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
  dateDisplay: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },

  cameraArea: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: '#000',
  },
  video: {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
  },
  hiddenCanvas: { display: 'none' },

  guideOverlay: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', zIndex: 10,
  },
  guideSvg: { width: '72vmin', height: 'auto' },
  guideLabel: {
    marginTop: 16, fontSize: 13, fontWeight: 500,
    color: 'rgba(255,255,255,0.45)',
    textShadow: '0 1px 6px rgba(0,0,0,0.8)',
  },
  countdownBadge: {
    marginTop: 12,
    background: 'rgba(64,217,160,0.15)',
    border: '1px solid rgba(64,217,160,0.35)',
    borderRadius: 100,
    padding: '6px 20px',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  countdownNum:  { fontSize: 20, fontWeight: 800, color: '#40d9a0' },
  countdownSub:  { fontSize: 12, color: 'rgba(64,217,160,0.7)' },

  loadingOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(8,8,16,0.75)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 16, zIndex: 20,
  },
  spinner: {
    width: 36, height: 36,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTop: '3px solid #40d9a0',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 500 },

  resultOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(8,8,16,0.88)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 20, padding: 24,
  },
  resultCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid',
    borderRadius: 20,
    padding: '32px 28px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 12,
    width: '100%', maxWidth: 320,
    textAlign: 'center',
  },
  resultIcon: {
    width: 56, height: 56, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 26, fontWeight: 700,
  },
  resultBadge: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    padding: '4px 14px', borderRadius: 100,
  },
  resultName:  { fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  resultMeta:  { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  resultId:    { fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' },
  pendingActions: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  approvalNote: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 },
  actionBtn: {
    width: '100%', padding: '11px 20px',
    borderRadius: 100, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.02em',
    transition: 'opacity 0.15s',
  },

  bottomBar: {
    flexShrink: 0,
    background: 'rgba(8,8,16,0.95)',
    backdropFilter: 'blur(16px)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '12px 16px',
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
    zIndex: 20,
  },
  errorMsg: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171', borderRadius: 10, padding: '10px 14px',
    fontSize: 13, marginBottom: 10,
  },
  bottomRow: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  userChip: {
    display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    background: 'linear-gradient(135deg, #40d9a0, #a08cff)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: '#000',
  },
  userName: { fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userId:   { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' },
  clockTypePill: {
    flexShrink: 0,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    padding: '6px 12px', borderRadius: 100,
    whiteSpace: 'nowrap',
  },
  captureBtn: {
    flexShrink: 0,
    padding: '10px 20px', borderRadius: 100,
    fontSize: 13, fontWeight: 700,
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  },
  backBtn: {
    display: 'block', width: '100%', marginTop: 10,
    background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.25)', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', textAlign: 'center',
    padding: '6px 0',
  },
};

export default ClockInOutPage;