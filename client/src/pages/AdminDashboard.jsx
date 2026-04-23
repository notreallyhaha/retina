import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PH_TZ = 'Asia/Manila';

// ── helpers ──────────────────────────────────────────────────
const token = () => localStorage.getItem('token');
const authHeaders = () => ({ Authorization: `Bearer ${token()}` });
const toPhDate = d => new Date(new Date(d).toLocaleString('en-US', { timeZone: PH_TZ }));
const dateKey = d => { const p = toPhDate(d); return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')}`; };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = ts => ts ? `${fmtDate(ts)} · ${fmtTime(ts)}` : '—';

// ── Status-aware session pairing (mirrors DashboardPage logic) ─
const COUNTS_STATUS = s => s === 'matched' || s === 'approved' || s === 'auto';
const IS_REJECTED   = s => s === 'rejected';

function pairRecords(records) {
  const sorted = [...records].filter(r => r.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const sessions = [];
  let openIn = null, openInType = null;
  for (const r of sorted) {
    const ts = new Date(r.timestamp);
    if (r.type === 'IN_OVERTIME' && openIn) {
      sessions.push({ inRec: openIn, outRec: r, isOt: false, inTs: new Date(openIn.timestamp), outTs: ts });
      openIn = r; openInType = 'IN_OVERTIME';
    } else if ((r.type === 'IN' || r.type === 'IN_OVERTIME') && !openIn) {
      openIn = r; openInType = r.type;
    } else if (r.type === 'OUT' && openIn) {
      sessions.push({ inRec: openIn, outRec: r, isOt: openInType === 'IN_OVERTIME', inTs: new Date(openIn.timestamp), outTs: ts });
      openIn = null; openInType = null;
    }
  }
  if (openIn) sessions.push({ inRec: openIn, outRec: null, isOt: openInType === 'IN_OVERTIME', inTs: new Date(openIn.timestamp), outTs: null });
  return sessions;
}

function sessionHours(sess, nowMs) {
  if (IS_REJECTED(sess.inRec.status)) return 0;
  if (sess.outRec && IS_REJECTED(sess.outRec.status)) return 0;
  if (!sess.outRec) {
    if (!COUNTS_STATUS(sess.inRec.status)) return 0;
    return (nowMs - sess.inTs.getTime()) / 3600000;
  }
  if (!COUNTS_STATUS(sess.inRec.status)) return 0;
  if (!COUNTS_STATUS(sess.outRec.status)) return 0;
  return (sess.outTs.getTime() - sess.inTs.getTime()) / 3600000;
}
const initials = name => name?.split(' ').map(n => n[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?';

const TYPE_META = {
  IN:          { label: 'Clock IN',    bg: 'rgba(34,197,94,0.12)',   color: '#86efac', border: 'rgba(34,197,94,0.25)' },
  OUT:         { label: 'Clock OUT',   bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.25)' },
  IN_OVERTIME: { label: 'IN OT',       bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  MANUAL:      { label: 'Manual',      bg: 'rgba(129,140,248,0.12)', color: '#818cf8', border: 'rgba(129,140,248,0.25)' },
  OT_MANUAL:   { label: 'OT Manual',   bg: 'rgba(251,113,133,0.12)', color: '#fb7185', border: 'rgba(251,113,133,0.25)' },
};
const STATUS_META = {
  matched:        { label: 'Matched',        bg: 'rgba(64,217,160,0.12)',  color: '#40d9a0', border: 'rgba(64,217,160,0.25)' },
  auto:           { label: 'Auto',           bg: 'rgba(64,217,160,0.12)',  color: '#40d9a0', border: 'rgba(64,217,160,0.25)' },
  approved:       { label: 'Approved',       bg: 'rgba(160,140,255,0.12)', color: '#a08cff', border: 'rgba(160,140,255,0.25)' },
  pending:        { label: 'Pending',        bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  pending_manual: { label: 'Pending',        bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  pending_ot:     { label: 'Pending OT',     bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  rejected:       { label: 'Rejected',       bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.25)' },
};

const typeMeta  = t => TYPE_META[t]   || { label: t || '—',      bg: 'rgba(255,255,255,0.06)', color: '#888', border: 'rgba(255,255,255,0.1)' };
const statusMeta = s => STATUS_META[s] || { label: s || 'unknown', bg: 'rgba(255,255,255,0.06)', color: '#888', border: 'rgba(255,255,255,0.1)' };

function Pill({ label, meta }) {
  return (
    <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {label || meta.label}
    </span>
  );
}

function Avatar({ name, size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, flexShrink: 0, background: 'linear-gradient(135deg,#40d9a0,#a08cff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color: '#000' }}>
      {initials(name)}
    </div>
  );
}

// ── Photo lightbox ────────────────────────────────────────────
function Lightbox({ src, onClose, faceScan = false }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <img src={src} alt="proof" onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain', boxShadow: '0 24px 64px rgba(0,0,0,0.8)', transform: faceScan ? 'scaleX(-1)' : 'none' }} />
      <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, cursor: 'pointer' }}>✕</button>
    </div>
  );
}

// ── Proof thumb ───────────────────────────────────────────────
function ProofThumb({ url, label, faceScan = false }) {
  const [open, setOpen] = useState(false);
  if (!url || !url.startsWith('data:')) return <span style={{ fontSize: 11, color: '#333' }}>—</span>;
  return (
    <>
      <div onClick={() => setOpen(true)} style={{ cursor: 'pointer', display: 'inline-block' }}>
        <img src={url} alt={label} style={{ height: 48, width: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', transition: 'opacity 0.15s', transform: faceScan ? 'scaleX(-1)' : 'none' }} />
      </div>
      {open && <Lightbox src={url} onClose={() => setOpen(false)} faceScan={faceScan} />}
    </>
  );
}

// ── Sidebar nav ───────────────────────────────────────────────
const NAV = [
  { id: 'overview',   label: 'Overview',           icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'pending',    label: 'Pending Approvals',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', badge: true },
  { id: 'employees',  label: 'Employees',           icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'records',    label: 'Attendance Records',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
];

// ── Overview ──────────────────────────────────────────────────
function Overview({ employees, pending, onNavigate }) {
  const total = employees.length;
  const enrolled = employees.filter(e => e.faceEnrolled).length;
  const admins = employees.filter(e => e.isAdmin).length;

  return (
    <div>
      <h2 style={S.panelTitle}>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Total Employees', value: total,          accent: '#a08cff', nav: 'employees' },
          { label: 'Face Enrolled',   value: enrolled,       accent: '#40d9a0', nav: 'employees' },
          { label: 'Pending',         value: pending.length, accent: '#f59e0b', nav: 'pending' },
          { label: 'Admins',          value: admins,         accent: '#818cf8', nav: 'employees' },
        ].map(s => (
          <div key={s.label} onClick={() => onNavigate(s.nav)} style={{ ...S.statCard, cursor: 'pointer' }}>
            <p style={S.statLabel}>{s.label}</p>
            <p style={{ ...S.statValue, color: s.accent }}>{s.value}</p>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={S.sectionTitle}>Needs Attention</h3>
            <button onClick={() => onNavigate('pending')} style={S.linkBtn}>View all →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {pending.slice(0, 3).map(rec => (
              <div key={rec.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px' }}>
                <Avatar name={rec.employeeName || rec.employeeId} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{rec.employeeName || rec.employeeId}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{fmtDateTime(rec.timestamp)}</div>
                </div>
                <Pill meta={typeMeta(rec.type)} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ ...S.sectionTitle, marginBottom: 12 }}>All Employees</h3>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{['Name','Employee ID','Email','Face','Role'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {employees.slice(0,8).map((emp, i) => (
              <tr key={emp.id} style={i < Math.min(employees.length,8)-1 ? S.trBorder : {}}>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={emp.name} size={28} />
                    <span style={{ fontWeight: 600 }}>{emp.name}</span>
                  </div>
                </td>
                <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{emp.employeeId}</td>
                <td style={{ ...S.td, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{emp.email}</td>
                <td style={S.td}><Pill meta={emp.faceEnrolled ? { bg:'rgba(64,217,160,0.1)',color:'#40d9a0',border:'rgba(64,217,160,0.2)' } : { bg:'rgba(255,255,255,0.04)',color:'#555',border:'rgba(255,255,255,0.1)' }} label={emp.faceEnrolled?'Enrolled':'Not enrolled'}/></td>
                <td style={S.td}><Pill meta={emp.isAdmin ? { bg:'rgba(129,140,248,0.1)',color:'#818cf8',border:'rgba(129,140,248,0.2)' } : { bg:'rgba(255,255,255,0.04)',color:'#555',border:'rgba(255,255,255,0.1)' }} label={emp.isAdmin?'Admin':'Employee'}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pending Approvals ─────────────────────────────────────────
function PendingApprovals({ pending, onApprove, onReject, loading }) {
  const [lightbox, setLightbox] = useState(null);
  const [rejectNote, setRejectNote] = useState({});
  const [rejectOpen, setRejectOpen] = useState(null);

  if (pending.length === 0) return (
    <div>
      <h2 style={S.panelTitle}>Pending Approvals</h2>
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        All caught up — no pending approvals
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={S.panelTitle}>Pending Approvals <span style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>({pending.length})</span></h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pending.map(rec => {
          const tm = typeMeta(rec.type);
          return (
            <div key={rec.id} style={S.card}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <Avatar name={rec.employeeName || rec.employeeId} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{rec.employeeName || '—'}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{rec.employeeId}</div>
                  </div>
                </div>
                <Pill meta={tm} />
              </div>

              {/* Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginTop: 14, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p style={S.metaLabel}>Time</p>
                  <p style={S.metaValue}>{fmtDateTime(rec.timestamp)}</p>
                </div>
                {rec.location && (
                  <div>
                    <p style={S.metaLabel}>Location</p>
                    <p style={S.metaValue}>
                      {typeof rec.location === 'object'
                        ? `${rec.location.latitude?.toFixed(4)}, ${rec.location.longitude?.toFixed(4)}`
                        : rec.location}
                    </p>
                  </div>
                )}
                {rec.distance != null && (
                  <div>
                    <p style={S.metaLabel}>Face Distance</p>
                    <p style={{ ...S.metaValue, color: rec.distance < 0.4 ? '#40d9a0' : '#f87171' }}>{rec.distance}</p>
                  </div>
                )}
                {rec.clockInTime && (
                  <div>
                    <p style={S.metaLabel}>Shift</p>
                    <p style={S.metaValue}>{rec.clockInTime} → {rec.clockOutTime}{rec.clockOutNextDay ? ' (+1)' : ''}{rec.manualDate ? ` · ${rec.manualDate}` : ''}</p>
                  </div>
                )}
              </div>

              {/* Proof photo */}
              {rec.proofPhotoUrl && rec.proofPhotoUrl.startsWith('data:') && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ ...S.metaLabel, marginBottom: 6 }}>Proof Photo</p>
                  <img
                    src={rec.proofPhotoUrl}
                    alt="proof"
                    onClick={() => setLightbox({src: rec.proofPhotoUrl, faceScan: true})}
                    style={{ height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transform: 'scaleX(-1)' }}
                  />
                </div>
              )}

              {/* Reject note input */}
              {rejectOpen === rec.id && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    placeholder="Reason for rejection (optional)…"
                    value={rejectNote[rec.id] || ''}
                    onChange={e => setRejectNote(n => ({ ...n, [rec.id]: e.target.value }))}
                    style={{ background: '#0d0d0d', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 12, resize: 'none', minHeight: 60, outline: 'none', fontFamily: 'Inter,system-ui,sans-serif' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRejectOpen(null)} style={{ ...S.miniBtn, color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)', flex: 1 }}>Cancel</button>
                    <button onClick={() => { onReject(rec.id || rec.recordId, rejectNote[rec.id]); setRejectOpen(null); }} disabled={loading} style={{ ...S.miniBtn, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', flex: 1 }}>Confirm Reject</button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {rejectOpen !== rec.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button onClick={() => onApprove(rec.id || rec.recordId)} disabled={loading} style={S.approveBtn}>✓ Approve</button>
                  <button onClick={() => setRejectOpen(rec.id)} disabled={loading} style={S.rejectBtn}>✕ Reject</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lightbox && <Lightbox src={lightbox.src} faceScan={lightbox.faceScan} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Employee profile / calendar modal ─────────────────────────
function EmployeeProfile({ emp, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [tab, setTab] = useState('calendar');
  const [rejectOpen, setRejectOpen] = useState(null); // recordId being rejected
  const [rejectNote, setRejectNote] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadRecords = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/records?userId=${emp.id}`, { headers: authHeaders() });
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch { if (!silent) setRecords([]); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, [emp.id]);

  // Optimistic approve: flip status instantly in local records, sync in background
  const handleApprove = async (recordId) => {
    const prev = records;
    setRecords(rs => rs.map(r => (r.recordId || r.id) === recordId ? { ...r, status: 'approved' } : r));
    showToast('Approved ✓');
    try {
      await axios.post(`${API_URL}/api/clock/approve/${recordId}`, {}, { headers: authHeaders() });
      loadRecords({ silent: true });
    } catch (e) {
      setRecords(prev);
      showToast(e?.response?.data?.detail || 'Failed', false);
    }
  };

  // Optimistic reject: flip status instantly, sync in background
  const handleReject = async (recordId) => {
    const prev = records;
    setRecords(rs => rs.map(r => (r.recordId || r.id) === recordId ? { ...r, status: 'rejected', rejectionNote: rejectNote } : r));
    setRejectOpen(null); setRejectNote('');
    showToast('Rejected');
    try {
      await axios.post(`${API_URL}/api/clock/reject/${recordId}`, { note: rejectNote }, { headers: authHeaders() });
      loadRecords({ silent: true });
    } catch (e) {
      setRecords(prev);
      showToast(e?.response?.data?.detail || 'Failed', false);
    }
  };

  // Build calendar for selected month
  const now = new Date();
  const calYear  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const calMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Group records by date key — MANUAL/OT_MANUAL use manualDate, not submission timestamp
  const byDate = {};
  for (const r of records) {
    const k = (r.type === 'MANUAL' || r.type === 'OT_MANUAL')
      ? (r.manualDate || null)
      : (r.timestamp ? dateKey(new Date(r.timestamp)) : null);
    if (!k) continue;
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(r);
  }

  const dayKey = (d) => `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  // Stats — only count hours from sessions where neither leg is rejected
  const totalHours = (() => {
    const nowMs = Date.now();
    const sessions = pairRecords(records);
    const ms = sessions.reduce((acc, sess) => acc + sessionHours(sess, nowMs) * 3600000, 0);
    return (ms / 3600000).toFixed(1);
  })();

  const dayRecords = selectedDay ? (byDate[selectedDay] || []) : [];

  // Build paired sessions + manual records for the selected day
  const daySessions = selectedDay ? pairRecords(dayRecords.filter(r => r.type === 'IN' || r.type === 'IN_OVERTIME' || r.type === 'OUT')) : [];
  const dayManuals  = selectedDay ? dayRecords.filter(r => r.type === 'MANUAL' || r.type === 'OT_MANUAL') : [];

  const RecordActions = ({ rec }) => {
    const isPending = rec.status?.startsWith('pending') || rec.status === 'pending';
    const isRejected = rec.status === 'rejected';
    const isApproved = rec.status === 'approved' || rec.status === 'matched' || rec.status === 'auto';
    const rid = rec.recordId || rec.id;
    return (
      <div style={{ marginTop: 8 }}>
        {isApproved && <span style={{ fontSize: 10, color: '#40d9a0', fontWeight: 700 }}>✓ {rec.status}</span>}
        {isRejected && <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>✕ Rejected{rec.rejectionNote ? ` — ${rec.rejectionNote}` : ''}</span>}
        {(isPending || isRejected) && rejectOpen !== rid && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {isPending && <button onClick={() => handleApprove(rid)} style={{ ...S.approveBtn, padding: '4px 12px', fontSize: 11 }}>✓ Approve</button>}
            <button onClick={() => { setRejectOpen(rid); setRejectNote(''); }} style={{ ...S.rejectBtn, padding: '4px 12px', fontSize: 11 }}>✕ Reject</button>
          </div>
        )}
        {rejectOpen === rid && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea placeholder="Reason (optional)…" value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              style={{ background: '#0a0a0a', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 11, resize: 'none', minHeight: 48, outline: 'none', fontFamily: 'Inter,sans-serif' }}/>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setRejectOpen(null)} style={{ ...S.miniBtn, color: '#555', borderColor: '#222', flex: 1 }}>Cancel</button>
              <button onClick={() => handleReject(rid)} style={{ ...S.miniBtn, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', flex: 1 }}>Confirm Reject</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <Avatar name={emp.name} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{emp.email} · <span style={{ fontFamily: 'monospace' }}>{emp.employeeId}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill meta={emp.faceEnrolled ? {bg:'rgba(64,217,160,0.1)',color:'#40d9a0',border:'rgba(64,217,160,0.2)'} : {bg:'rgba(255,255,255,0.04)',color:'#555',border:'rgba(255,255,255,0.1)'}} label={emp.faceEnrolled?'Enrolled':'Not enrolled'}/>
            <Pill meta={emp.isAdmin ? {bg:'rgba(129,140,248,0.1)',color:'#818cf8',border:'rgba(129,140,248,0.2)'} : {bg:'rgba(255,255,255,0.04)',color:'#555',border:'rgba(255,255,255,0.1)'}} label={emp.isAdmin?'Admin':'Employee'}/>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', fontSize: 16, borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          {[
            { label: 'Total Records', value: records.length },
            { label: 'Total Hours',   value: `${totalHours}h` },
            { label: 'Pending',       value: records.filter(r=>r.status?.startsWith('pending')).length, color: '#f59e0b' },
            { label: 'Rejected',      value: records.filter(r=>r.status==='rejected').length, color: '#f87171' },
          ].map((s,i) => (
            <div key={s.label} style={{ flex: 1, padding: '12px 16px', borderRight: i<3?'1px solid rgba(255,255,255,0.07)':undefined }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{s.label}</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: s.color || '#fff', margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, padding: '10px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          {['calendar','records'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: '6px 6px 0 0', border: 'none', background: tab===t ? 'rgba(160,140,255,0.12)' : 'transparent', color: tab===t ? '#a08cff' : 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
              {t === 'calendar' ? 'Calendar' : 'All Records'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
          ) : tab === 'calendar' ? (
            <div style={{ display: 'grid', gridTemplateColumns: selectedDay ? '1fr 1fr' : '1fr', gap: 20 }}>
              {/* Calendar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <button onClick={() => setMonthOffset(o=>o-1)} style={S.navBtn}>‹</button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{monthLabel}</span>
                  <button onClick={() => setMonthOffset(o=>Math.min(0,o+1))} disabled={monthOffset>=0} style={{ ...S.navBtn, opacity: monthOffset>=0?0.3:1 }}>›</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                  {['M','T','W','T','F','S','S'].map((d,i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>{d}</div>
                  ))}
                  {Array(startDow).fill(null).map((_,i) => <div key={`e${i}`}/>)}
                  {Array.from({length: daysInMonth}, (_,i) => {
                    const d = i+1;
                    const k = dayKey(d);
                    const dayRecs = byDate[k] || [];
                    const hasPending = dayRecs.some(r => r.status?.startsWith('pending'));
                    const hasRejected = dayRecs.some(r => r.status === 'rejected');
                    const hasApproved = dayRecs.some(r => r.status === 'approved' || r.status === 'matched' || r.status === 'auto');
                    const isSelected = selectedDay === k;
                    const isToday = k === dateKey(new Date());
                    let bg = '#0f0f0f', border = '1px solid #1a1a1a', color = '#333';
                    if (hasApproved) { bg='linear-gradient(135deg,#1a3a2a,#2a4a3a)'; border='1px solid rgba(64,217,160,0.2)'; color='#40d9a0'; }
                    if (hasPending)  { bg='linear-gradient(135deg,#3a2800,#4a3800)'; border='1px solid rgba(245,158,11,0.3)'; color='#f59e0b'; }
                    if (hasRejected && !hasApproved) { bg='linear-gradient(135deg,#2a0a0a,#3a1010)'; border='1px solid rgba(239,68,68,0.2)'; color='#f87171'; }
                    if (isSelected) border = '2px solid #a08cff';
                    return (
                      <div key={k} onClick={() => dayRecs.length ? setSelectedDay(isSelected ? null : k) : null}
                        style={{ aspectRatio: 1, borderRadius: 8, background: bg, border, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dayRecs.length ? 'pointer' : 'default', flexDirection: 'column', gap: 2, position: 'relative' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: dayRecs.length ? color : '#2a2a2a' }}>{d}</span>
                        {dayRecs.length > 0 && <span style={{ fontSize: 7, color: color, opacity: 0.7 }}>{dayRecs.length} rec</span>}
                        {isToday && <div style={{ position: 'absolute', top: 3, right: 3, width: 4, height: 4, borderRadius: '50%', background: '#818cf8' }}/>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  {[['#40d9a0','Approved/Matched'],['#f59e0b','Pending'],['#f87171','Rejected'],['#818cf8','Today']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                      {l}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day detail */}
              {selectedDay && (
                <div style={{ overflowY: 'auto' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
                    {new Date(selectedDay+'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Clock IN/OUT paired sessions */}
                    {daySessions.map(sess => {
                      const inRej  = IS_REJECTED(sess.inRec.status);
                      const outRej = sess.outRec && IS_REJECTED(sess.outRec.status);
                      const durH   = sessionHours(sess, Date.now());
                      const durLabel = durH > 0 ? `${durH.toFixed(1)}h` : null;
                      const cardBorder = inRej || outRej ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)';
                      return (
                        <div key={sess.inRec.id} style={{ background: '#111', border: cardBorder, borderRadius: 10, padding: '12px 14px' }}>
                          {/* Session header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Pill meta={typeMeta(sess.isOt ? 'IN_OVERTIME' : 'IN')} label={sess.isOt ? 'IN OT' : 'Clock IN'} />
                              <span style={{ fontSize: 10, color: '#444' }}>→</span>
                              {sess.outRec
                                ? <Pill meta={typeMeta('OUT')} label={sess.isOt ? 'OUT OT' : 'Clock OUT'} />
                                : <span style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>no out yet</span>}
                            </div>
                            {durLabel && !inRej && !outRej
                              ? <span style={{ fontSize: 11, fontWeight: 800, color: '#40d9a0' }}>{durLabel}</span>
                              : (inRej || outRej) && <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>rejected</span>}
                          </div>

                          {/* Times row */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <div style={{ background: '#0a0a0a', borderRadius: 8, padding: '8px 10px', border: inRej ? '1px solid rgba(239,68,68,0.2)' : '1px solid #1a1a1a' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: inRej ? '#f87171' : '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Clock In</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: inRej ? '#f87171' : '#fff', textDecoration: inRej ? 'line-through' : 'none' }}>{fmtTime(sess.inRec.timestamp)}</div>
                              {sess.inRec.distance != null && <div style={{ fontSize: 10, color: sess.inRec.distance < 0.4 ? '#40d9a0' : '#f87171', marginTop: 2 }}>dist: {sess.inRec.distance}</div>}
                            </div>
                            <div style={{ background: '#0a0a0a', borderRadius: 8, padding: '8px 10px', border: outRej ? '1px solid rgba(239,68,68,0.2)' : '1px solid #1a1a1a' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: outRej ? '#f87171' : '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Clock Out</div>
                              {sess.outRec
                                ? <><div style={{ fontSize: 14, fontWeight: 800, color: outRej ? '#f87171' : '#fff', textDecoration: outRej ? 'line-through' : 'none' }}>{fmtTime(sess.outRec.timestamp)}</div>
                                    {sess.outRec.distance != null && <div style={{ fontSize: 10, color: sess.outRec.distance < 0.4 ? '#40d9a0' : '#f87171', marginTop: 2 }}>dist: {sess.outRec.distance}</div>}</>
                                : <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>—</div>}
                            </div>
                          </div>

                          {/* Photos side by side */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div>
                              <div style={S.metaLabel}>In Proof</div>
                              {sess.inRec.proofPhotoUrl?.startsWith('data:')
                                ? <img src={sess.inRec.proofPhotoUrl} alt="in proof" onClick={() => setLightbox({src: sess.inRec.proofPhotoUrl, faceScan: true})} style={{ height: 56, width: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', marginTop: 3, transform: 'scaleX(-1)' }}/>
                                : <div style={{ fontSize: 10, color: '#333', marginTop: 3 }}>—</div>}
                            </div>
                            <div>
                              <div style={S.metaLabel}>Out Proof</div>
                              {sess.outRec?.proofPhotoUrl?.startsWith('data:')
                                ? <img src={sess.outRec.proofPhotoUrl} alt="out proof" onClick={() => setLightbox({src: sess.outRec.proofPhotoUrl, faceScan: true})} style={{ height: 56, width: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', marginTop: 3, transform: 'scaleX(-1)' }}/>
                                : <div style={{ fontSize: 10, color: '#333', marginTop: 3 }}>—</div>}
                            </div>
                          </div>

                          {/* Per-record approve/reject — separate for IN and OUT */}
                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 10, color: '#555', fontWeight: 700, minWidth: 48 }}>IN</span>
                              <div style={{ flex: 1 }}><RecordActions rec={sess.inRec} /></div>
                            </div>
                            {sess.outRec && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 10, color: '#555', fontWeight: 700, minWidth: 48 }}>OUT</span>
                                <div style={{ flex: 1 }}><RecordActions rec={sess.outRec} /></div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Manual / OT_MANUAL cards */}
                    {dayManuals.map(r => (
                      <div key={r.id} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Pill meta={typeMeta(r.type)} />
                          <Pill meta={statusMeta(r.status)} />
                        </div>
                        {r.clockInTime && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{r.clockInTime} → {r.clockOutTime}{r.clockOutNextDay?' (+1)':''}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={S.metaLabel}>Clock In Proof</div>
                            {r.clockInProofUrl?.startsWith('data:')
                              ? <img src={r.clockInProofUrl} alt="in" onClick={() => setLightbox({src: r.clockInProofUrl, faceScan: false})} style={{ height: 52, width: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', marginTop: 3 }}/>
                              : r.clockInNote ? <div style={{ fontSize: 10, color: '#777', marginTop: 3, fontStyle: 'italic' }}>{r.clockInNote}</div>
                              : <div style={{ fontSize: 10, color: '#333', marginTop: 3 }}>—</div>}
                          </div>
                          <div>
                            <div style={S.metaLabel}>Clock Out Proof</div>
                            {r.clockOutProofUrl?.startsWith('data:')
                              ? <img src={r.clockOutProofUrl} alt="out" onClick={() => setLightbox({src: r.clockOutProofUrl, faceScan: false})} style={{ height: 52, width: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', marginTop: 3 }}/>
                              : r.clockOutNote ? <div style={{ fontSize: 10, color: '#777', marginTop: 3, fontStyle: 'italic' }}>{r.clockOutNote}</div>
                              : <div style={{ fontSize: 10, color: '#333', marginTop: 3 }}>—</div>}
                          </div>
                        </div>
                        {r.rejectionNote && <div style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>Note: {r.rejectionNote}</div>}
                        <RecordActions rec={r} />
                      </div>
                    ))}

                    {daySessions.length === 0 && dayManuals.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 24, color: '#333', fontSize: 12 }}>No records for this day</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* All records — paired sessions */
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['In Time','Out Time','Date','Duration','Status','Photos'].map(h=><th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const nowMs = Date.now();
                    const clockSessions = pairRecords(records);
                    const manualRecs = records.filter(r => r.type === 'MANUAL' || r.type === 'OT_MANUAL');

                    const rows = [];

                    clockSessions.forEach((sess, i) => {
                      const inRej  = IS_REJECTED(sess.inRec.status);
                      const outRej = sess.outRec && IS_REJECTED(sess.outRec.status);
                      const disqualified = inRej || outRej;
                      const durH   = sessionHours(sess, nowMs);
                      const durLabel = durH > 0 ? `${durH.toFixed(1)}h` : null;
                      const isLive = !sess.outRec && !inRej && COUNTS_STATUS(sess.inRec.status);

                      const inMeta  = typeMeta(sess.isOt ? 'IN_OVERTIME' : 'IN');
                      const outMeta = typeMeta(sess.isOt ? 'IN_OVERTIME' : 'OUT'); // reuse color family

                      const rejStyle = { background:'rgba(239,68,68,0.08)', color:'#f87171', border:'1px solid rgba(239,68,68,0.2)', padding:'2px 8px', borderRadius:5, fontSize:10, fontWeight:700 };
                      const pendStyle = { background:'rgba(245,158,11,0.08)', color:'#f59e0b', border:'1px solid rgba(245,158,11,0.2)', padding:'2px 8px', borderRadius:5, fontSize:10, fontWeight:700 };
                      const okStyle   = { background:'rgba(64,217,160,0.08)', color:'#40d9a0', border:'1px solid rgba(64,217,160,0.2)', padding:'2px 8px', borderRadius:5, fontSize:10, fontWeight:700 };

                      const statusBadge = (rec) => {
                        if (!rec) return <span style={pendStyle}>live</span>;
                        if (IS_REJECTED(rec.status)) return <span style={rejStyle}>rejected</span>;
                        if (COUNTS_STATUS(rec.status)) return <span style={okStyle}>{rec.status}</span>;
                        return <span style={pendStyle}>pending</span>;
                      };

                      rows.push(
                        <tr key={sess.inRec.id} style={S.trBorder}>
                          {/* In Time */}
                          <td style={S.td}>
                            <div style={{display:'flex',flexDirection:'column',gap:2}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <Pill meta={inMeta} label={sess.isOt ? 'IN_OT' : 'IN'} />
                              </div>
                              <div style={{fontSize:12,color: inRej ? '#f87171' : '#e5e5e5', textDecoration: inRej ? 'line-through' : 'none'}}>
                                {fmtTime(sess.inRec.timestamp)}
                              </div>
                              <div>{statusBadge(sess.inRec)}</div>
                            </div>
                          </td>
                          {/* Out Time */}
                          <td style={S.td}>
                            {sess.outRec ? (
                              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  <Pill meta={outMeta} label={sess.isOt ? 'OUT_OT' : 'OUT'} />
                                </div>
                                <div style={{fontSize:12,color: outRej ? '#f87171' : '#e5e5e5', textDecoration: outRej ? 'line-through' : 'none'}}>
                                  {fmtTime(sess.outRec.timestamp)}
                                </div>
                                <div>{statusBadge(sess.outRec)}</div>
                              </div>
                            ) : (
                              <span style={{fontSize:11,color: isLive ? '#40d9a0' : '#555', fontStyle:'italic'}}>
                                {isLive ? '● live' : '—'}
                              </span>
                            )}
                          </td>
                          {/* Date */}
                          <td style={{...S.td, color:'rgba(255,255,255,0.4)', fontSize:12}}>{fmtDate(sess.inRec.timestamp)}</td>
                          {/* Duration */}
                          <td style={S.td}>
                            {disqualified
                              ? <span style={rejStyle}>rejected</span>
                              : durLabel
                                ? <span style={{fontSize:13,fontWeight:700,color:'#40d9a0'}}>{durLabel}</span>
                                : <span style={{fontSize:11,color:'#555'}}>pending…</span>
                            }
                          </td>
                          {/* Status summary */}
                          <td style={S.td}>
                            {disqualified
                              ? <span style={rejStyle}>disqualified</span>
                              : !sess.outRec
                                ? isLive ? <span style={{...okStyle,color:'#40d9a0'}}>live</span> : <span style={pendStyle}>no out</span>
                                : !COUNTS_STATUS(sess.inRec.status) || !COUNTS_STATUS(sess.outRec.status)
                                  ? <span style={pendStyle}>pending</span>
                                  : <span style={okStyle}>counted</span>
                            }
                          </td>
                          {/* Photos */}
                          <td style={S.td}>
                            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                              {sess.inRec.proofPhotoUrl?.startsWith('data:')   && <ProofThumb url={sess.inRec.proofPhotoUrl}    label="in proof"  faceScan={true}/>}
                              {sess.outRec?.proofPhotoUrl?.startsWith('data:') && <ProofThumb url={sess.outRec.proofPhotoUrl}   label="out proof" faceScan={true}/>}
                              {!sess.inRec.proofPhotoUrl && !sess.outRec?.proofPhotoUrl && <span style={{fontSize:11,color:'#333'}}>—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    });

                    // Manual rows unchanged
                    manualRecs.forEach((r, i) => {
                      rows.push(
                        <tr key={r.id} style={S.trBorder}>
                          <td style={S.td} colSpan={2}>
                            <div style={{display:'flex',flexDirection:'column',gap:2}}>
                              <Pill meta={typeMeta(r.type)} />
                              <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{r.clockInTime} → {r.clockOutTime}{r.clockOutNextDay?' (+1)':''}</span>
                            </div>
                          </td>
                          <td style={{...S.td,color:'rgba(255,255,255,0.4)',fontSize:12}}>{r.manualDate || fmtDate(r.timestamp)}</td>
                          <td style={S.td}>—</td>
                          <td style={S.td}><Pill meta={statusMeta(r.status)}/></td>
                          <td style={S.td}>
                            <div style={{display:'flex',gap:4}}>
                              {r.clockInProofUrl?.startsWith('data:')  && <ProofThumb url={r.clockInProofUrl}  label="in"/>}
                              {r.clockOutProofUrl?.startsWith('data:') && <ProofThumb url={r.clockOutProofUrl} label="out"/>}
                              {!r.clockInProofUrl && !r.clockOutProofUrl && <span style={{fontSize:11,color:'#333'}}>—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    });

                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {lightbox && <Lightbox src={lightbox.src} faceScan={lightbox.faceScan} onClose={() => setLightbox(null)} />}
      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 10, border: '1px solid', fontSize: 13, fontWeight: 600, zIndex: 10000,
          ...(toast.ok ? { background:'rgba(64,217,160,0.15)', borderColor:'rgba(64,217,160,0.3)', color:'#40d9a0' } : { background:'rgba(239,68,68,0.12)', borderColor:'rgba(239,68,68,0.3)', color:'#f87171' }) }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Employees panel ───────────────────────────────────────────
function Employees({ employees, onDelete, onToggleAdmin, loading }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ ...S.panelTitle, margin: 0 }}>Employees <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>({employees.length})</span></h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, ID…" style={S.searchInput} />
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{['Name','Employee ID','Email','Face','Role','Actions'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((emp, i) => (
              <tr key={emp.id} style={i<filtered.length-1?S.trBorder:{}}>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setSelected(emp)}>
                    <Avatar name={emp.name} size={30} />
                    <span style={{ fontWeight: 600, color: '#fff', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)' }}>{emp.name}</span>
                  </div>
                </td>
                <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{emp.employeeId}</td>
                <td style={{ ...S.td, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{emp.email}</td>
                <td style={S.td}><Pill meta={emp.faceEnrolled?{bg:'rgba(64,217,160,0.1)',color:'#40d9a0',border:'rgba(64,217,160,0.2)'}:{bg:'rgba(255,255,255,0.04)',color:'#555',border:'rgba(255,255,255,0.1)'}} label={emp.faceEnrolled?'Enrolled':'Not enrolled'}/></td>
                <td style={S.td}><Pill meta={emp.isAdmin?{bg:'rgba(129,140,248,0.1)',color:'#818cf8',border:'rgba(129,140,248,0.2)'}:{bg:'rgba(255,255,255,0.04)',color:'#555',border:'rgba(255,255,255,0.1)'}} label={emp.isAdmin?'Admin':'Employee'}/></td>
                <td style={S.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelected(emp)} style={{ ...S.miniBtn, color: '#a08cff', borderColor: 'rgba(160,140,255,0.3)' }}>View</button>
                    <button onClick={() => onToggleAdmin(emp.id, !emp.isAdmin)} disabled={loading} style={{ ...S.miniBtn, color: emp.isAdmin?'#f59e0b':'#818cf8', borderColor: emp.isAdmin?'rgba(245,158,11,0.3)':'rgba(129,140,248,0.3)' }}>{emp.isAdmin?'Revoke Admin':'Make Admin'}</button>
                    <button onClick={() => onDelete(emp.id, emp.name)} disabled={loading} style={{ ...S.miniBtn, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <EmployeeProfile emp={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Records panel ─────────────────────────────────────────────
function Records({ employees }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);

  const doFetch = async () => {
    setError(''); setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUserId) params.set('userId', selectedUserId);
      if (startDate)  params.set('startDate', startDate);
      if (endDate)    params.set('endDate', endDate);
      const res = await axios.get(`${API_URL}/api/records?${params}`, { headers: authHeaders() });
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to fetch records');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h2 style={S.panelTitle}>Attendance Records</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.filterLabel}>Employee</label>
          <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} style={S.filterInput}>
            <option value="">All employees</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeId})</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.filterLabel}>Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={S.filterInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.filterLabel}>End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={S.filterInput} />
        </div>
        <button onClick={doFetch} disabled={loading} style={S.fetchBtn}>{loading ? 'Loading…' : 'Fetch Records'}</button>
      </div>
      {error && <div style={S.errorMsg}>{error}</div>}
      {records.length > 0 && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{['Employee','Type','Status','Time','Date','Location','Photos'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {records.map((r,i) => (
                <tr key={r.id} style={i<records.length-1?S.trBorder:{}}>
                  <td style={{ ...S.td, fontFamily:'monospace', fontSize:11, color:'rgba(255,255,255,0.4)' }}>{r.employeeId}</td>
                  <td style={S.td}><Pill meta={typeMeta(r.type)}/></td>
                  <td style={S.td}><Pill meta={statusMeta(r.status)}/></td>
                  <td style={S.td}>{r.clockInTime ? `${r.clockInTime}→${r.clockOutTime}` : fmtTime(r.timestamp)}</td>
                  <td style={{ ...S.td, color:'rgba(255,255,255,0.4)', fontSize:12 }}>{r.manualDate || fmtDate(r.timestamp)}</td>
                  <td style={{ ...S.td, color:'rgba(255,255,255,0.3)', fontSize:11 }}>
                    {r.location ? (typeof r.location==='object' ? `${r.location.latitude?.toFixed(3)}, ${r.location.longitude?.toFixed(3)}` : r.location) : '—'}
                  </td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.proofPhotoUrl?.startsWith('data:')    && <ProofThumb url={r.proofPhotoUrl}    label="proof" faceScan={true}/>}
                      {r.clockInProofUrl?.startsWith('data:')  && <ProofThumb url={r.clockInProofUrl}  label="in"/>}
                      {r.clockOutProofUrl?.startsWith('data:') && <ProofThumb url={r.clockOutProofUrl} label="out"/>}
                      {!r.proofPhotoUrl && !r.clockInProofUrl && !r.clockOutProofUrl && <span style={{ fontSize:11, color:'#333' }}>—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && records.length === 0 && (
        <div style={{ textAlign:'center', padding:'64px 0', color:'rgba(255,255,255,0.2)', fontSize:14 }}>
          Select filters and click Fetch Records
        </div>
      )}
      {lightbox && <Lightbox src={lightbox.src} faceScan={lightbox.faceScan} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Main AdminDashboard ───────────────────────────────────────
export default function AdminDashboard({ onSignOut }) {
  const [tab, setTab] = useState('overview');
  const [employees, setEmployees] = useState([]);
  const [pending, setPending] = useState([]);
  const [toast, setToast] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Initial load shows spinner; background refreshes (after actions) are silent
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setDataLoading(true);
    try {
      const [empRes, pendRes] = await Promise.all([
        axios.get(`${API_URL}/api/employees`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/clock/pending`, { headers: authHeaders() }),
      ]);
      const emps = Array.isArray(empRes.data) ? empRes.data : [];
      setEmployees(emps);
      const empMap = Object.fromEntries(emps.map(e => [e.employeeId, e.name]));
      const recs = pendRes.data?.records || [];
      setPending(recs.map(r => ({ ...r, employeeName: empMap[r.employeeId] || null })));
    } catch {
      if (!silent) showToast('Failed to load data', false);
    } finally {
      if (!silent) setDataLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Optimistic approve: remove from pending instantly, sync in background ──
  const handleApprove = async (recordId) => {
    const prev = pending;
    setPending(p => p.filter(r => (r.recordId || r.id) !== recordId));
    showToast('Record approved ✓');
    try {
      await axios.post(`${API_URL}/api/clock/approve/${recordId}`, {}, { headers: authHeaders() });
      loadData({ silent: true });
    } catch (e) {
      setPending(prev);
      showToast(e?.response?.data?.detail || 'Approval failed', false);
    }
  };

  // ── Optimistic reject: remove from pending instantly, sync in background ──
  const handleReject = async (recordId, note) => {
    const prev = pending;
    setPending(p => p.filter(r => (r.recordId || r.id) !== recordId));
    showToast('Record rejected');
    try {
      await axios.post(`${API_URL}/api/clock/reject/${recordId}`, { note: note || '' }, { headers: authHeaders() });
      loadData({ silent: true });
    } catch (e) {
      setPending(prev);
      showToast(e?.response?.data?.detail || 'Reject failed', false);
    }
  };

  // ── Optimistic delete: remove employee instantly, sync in background ──
  const handleDelete = async (uid, name) => {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    const prevEmps = employees;
    const prevPend = pending;
    const deletedEmpId = employees.find(e => e.id === uid)?.employeeId;
    setEmployees(e => e.filter(emp => emp.id !== uid));
    if (deletedEmpId) setPending(p => p.filter(r => r.employeeId !== deletedEmpId));
    showToast(`${name} deleted`);
    try {
      await axios.delete(`${API_URL}/api/employees/${uid}`, { headers: authHeaders() });
      loadData({ silent: true });
    } catch (e) {
      setEmployees(prevEmps);
      setPending(prevPend);
      showToast(e?.response?.data?.detail || 'Delete failed', false);
    }
  };

  // ── Optimistic toggle admin: flip role instantly, sync in background ──
  const handleToggleAdmin = async (uid, makeAdmin) => {
    const prevEmps = employees;
    setEmployees(emps => emps.map(e => e.id === uid ? { ...e, isAdmin: makeAdmin } : e));
    showToast(makeAdmin ? 'Admin granted' : 'Admin revoked');
    try {
      await axios.patch(`${API_URL}/api/employees/${uid}`, { isAdmin: makeAdmin }, { headers: authHeaders() });
      loadData({ silent: true });
    } catch (e) {
      setEmployees(prevEmps);
      showToast(e?.response?.data?.detail || 'Update failed', false);
    }
  };

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <span style={S.logoText}>retina</span>
          <span style={S.logoBadge}>Admin</span>
        </div>
        <nav style={S.nav}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} style={{ ...S.navItem, ...(tab===item.id ? S.navItemActive : {}) }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon}/>
              </svg>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && pending.length > 0 && <span style={S.badge}>{pending.length}</span>}
            </button>
          ))}
        </nav>
        <div style={S.sidebarFooter}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', lineHeight: 1.6, marginBottom: 10 }}>Retina Attendance<br/>Admin Panel</div>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              onSignOut?.();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={S.main}>
        {dataLoading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'rgba(255,255,255,0.3)', fontSize:14 }}>Loading…</div>
        ) : (
          <>
            {tab==='overview'  && <Overview   employees={employees} pending={pending} onNavigate={setTab}/>}
            {tab==='pending'   && <PendingApprovals pending={pending} onApprove={handleApprove} onReject={handleReject}/>}
            {tab==='employees' && <Employees  employees={employees} onDelete={handleDelete} onToggleAdmin={handleToggleAdmin}/>}
            {tab==='records'   && <Records    employees={employees}/>}
          </>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast, ...(toast.ok
          ? { background:'rgba(64,217,160,0.15)', borderColor:'rgba(64,217,160,0.3)', color:'#40d9a0' }
          : { background:'rgba(239,68,68,0.12)',  borderColor:'rgba(239,68,68,0.3)',  color:'#f87171' }
        )}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const S = {
  page:         { display:'flex', height:'100vh', background:'#080810', fontFamily:'Inter,system-ui,sans-serif', overflow:'hidden' },
  sidebar:      { width:216, flexShrink:0, background:'#0a0a16', borderRight:'1px solid rgba(255,255,255,0.06)', display:'flex', flexDirection:'column', padding:'20px 0' },
  sidebarLogo:  { display:'flex', alignItems:'center', gap:8, padding:'0 18px 18px', borderBottom:'1px solid rgba(255,255,255,0.06)', marginBottom:10 },
  logoText:     { fontSize:17, fontWeight:800, letterSpacing:'-0.03em', background:'linear-gradient(90deg,#40d9a0,#a08cff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' },
  logoBadge:    { fontSize:9, fontWeight:700, letterSpacing:'0.08em', color:'#a08cff', background:'rgba(160,140,255,0.12)', border:'1px solid rgba(160,140,255,0.25)', padding:'2px 6px', borderRadius:4 },
  nav:          { display:'flex', flexDirection:'column', gap:2, padding:'0 8px', flex:1 },
  navItem:      { display:'flex', alignItems:'center', gap:9, padding:'8px 12px', borderRadius:8, border:'none', background:'transparent', color:'rgba(255,255,255,0.3)', fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'left', transition:'all 0.15s', width:'100%' },
  navItemActive:{ background:'rgba(160,140,255,0.1)', color:'#a08cff' },
  badge:        { background:'#f59e0b', color:'#000', fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:10, lineHeight:1 },
  sidebarFooter:{ padding:'14px 18px 0', borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:10 },
  main:         { flex:1, overflowY:'auto', padding:'28px 32px' },
  panelTitle:   { fontSize:18, fontWeight:800, color:'#fff', letterSpacing:'-0.02em', marginBottom:20, marginTop:0 },
  sectionTitle: { fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:0, marginTop:0 },
  statCard:     { background:'#111', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'16px 18px', transition:'border-color 0.15s' },
  statLabel:    { fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 8px' },
  statValue:    { fontSize:28, fontWeight:800, letterSpacing:'-0.03em', margin:0 },
  card:         { background:'#111', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'16px 18px' },
  tableWrap:    { background:'#111', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, overflow:'auto' },
  table:        { width:'100%', borderCollapse:'collapse' },
  th:           { padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.08em', background:'#0d0d0d', borderBottom:'1px solid rgba(255,255,255,0.07)', whiteSpace:'nowrap' },
  td:           { padding:'10px 16px', fontSize:13, color:'#e5e5e5', verticalAlign:'middle' },
  trBorder:     { borderBottom:'1px solid rgba(255,255,255,0.05)' },
  approveBtn:   { padding:'8px 16px', borderRadius:8, border:'1px solid rgba(64,217,160,0.3)', background:'rgba(64,217,160,0.08)', color:'#40d9a0', fontSize:12, fontWeight:700, cursor:'pointer' },
  rejectBtn:    { padding:'8px 16px', borderRadius:8, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#f87171', fontSize:12, fontWeight:700, cursor:'pointer' },
  miniBtn:      { padding:'5px 10px', borderRadius:6, border:'1px solid', background:'transparent', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' },
  linkBtn:      { background:'transparent', border:'none', color:'rgba(255,255,255,0.3)', fontSize:12, fontWeight:600, cursor:'pointer', padding:0 },
  searchInput:  { background:'#111', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px', color:'#fff', fontSize:12, outline:'none', width:220 },
  filterLabel:  { fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.06em' },
  filterInput:  { background:'#111', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px', color:'#fff', fontSize:12, outline:'none' },
  fetchBtn:     { padding:'8px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#40d9a0,#a08cff)', color:'#000', fontSize:12, fontWeight:700, cursor:'pointer', alignSelf:'flex-end' },
  errorMsg:     { background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', color:'#f87171', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:14 },
  metaLabel:    { fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 2px' },
  metaValue:    { fontSize:12, color:'rgba(255,255,255,0.6)', margin:0 },
  navBtn:       { background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', borderRadius:6, width:28, height:28, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' },
  toast:        { position:'fixed', bottom:24, right:24, padding:'12px 18px', borderRadius:10, border:'1px solid', fontSize:13, fontWeight:600, zIndex:9999 },
};