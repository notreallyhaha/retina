import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import logoImg from '../../images/viber_image_2026-03-30_15-19-54-560-removebg-preview.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Shift colors — purple/indigo family to match dashboard accent
const SHIFT_COLORS = [
  { bg: '#5170ff', text: '#fff', dim: 'rgba(81,112,255,0.15)' },
  { bg: '#a08cff', text: '#fff', dim: 'rgba(160,140,255,0.15)' },
  { bg: '#40d9a0', text: '#052e1c', dim: 'rgba(64,217,160,0.15)' },
  { bg: '#ff66c4', text: '#fff', dim: 'rgba(255,102,196,0.15)' },
  { bg: '#f59e0b', text: '#1a0e00', dim: 'rgba(245,158,11,0.15)' },
  { bg: '#f87171', text: '#1a0000', dim: 'rgba(248,113,113,0.15)' },
];

/**
 * Parse raw clock records into day-keyed shift segments.
 * Each IN→OUT pair becomes a segment. If a segment crosses midnight,
 * it is split: the portion before midnight goes on the IN day,
 * the portion after midnight goes on the next day.
 */
function parseShifts(records) {
  const sorted = [...records]
    .filter(r => r.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Pair IN / OUT
  const pairs = [];
  let openIn = null;
  for (const r of sorted) {
    if (r.type === 'IN' && !openIn) openIn = r;
    else if (r.type === 'OUT' && openIn) {
      pairs.push({ inTs: new Date(openIn.timestamp), outTs: new Date(r.timestamp) });
      openIn = null;
    }
  }
  // Still clocked in — open-ended segment ending now
  if (openIn) {
    pairs.push({ inTs: new Date(openIn.timestamp), outTs: new Date(), open: true });
  }

  // dayKey: "YYYY-MM-DD"
  const dayKey = d => d.toISOString().slice(0, 10);
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Build map: dayKey → [{ startH, endH, colorIdx, open }]
  const map = {};
  let colorCursor = 0;
  const pairColors = new Map();

  pairs.forEach((pair, idx) => {
    const c = colorCursor % SHIFT_COLORS.length;
    colorCursor++;
    pairColors.set(idx, c);

    const inDay = startOfDay(pair.inTs);
    let cursor = new Date(pair.inTs);

    // Walk day by day until we reach the OUT day
    while (true) {
      const key = dayKey(cursor);
      if (!map[key]) map[key] = [];

      const dayStart = startOfDay(cursor);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);

      const segStart = cursor;
      const segEnd = pair.outTs < dayEnd ? pair.outTs : new Date(dayEnd.getTime() - 1000);

      const startH = (segStart - dayStart) / 3600000;
      const endH = (segEnd - dayStart) / 3600000;

      map[key].push({
        startH: Math.max(0, startH),
        endH: Math.min(24, endH),
        colorIdx: c,
        open: pair.open && segEnd >= pair.outTs,
      });

      if (pair.outTs <= dayEnd) break;
      // Advance to midnight of next day
      cursor = dayEnd;
    }
  });

  return map;
}

function ShiftCalendarPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/my-records`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecords(res.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const shiftMap = useMemo(() => parseShifts(records), [records]);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const dim = daysInMonth(currentYear, currentMonth);

  // All day keys for this month
  const dayKeys = Array.from({ length: dim }, (_, i) => {
    const d = i + 1;
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

  // Stats for current month
  const monthStats = useMemo(() => {
    let totalMs = 0;
    let shiftCount = 0;
    let overnightCount = 0;

    dayKeys.forEach(key => {
      const segs = shiftMap[key] || [];
      segs.forEach(seg => {
        totalMs += (seg.endH - seg.startH) * 3600000;
        shiftCount++;
        // overnight = segment that started from previous day (startH === 0 and there's a matching segment on prev day)
      });
    });

    // Count pairs that cross midnight
    records.filter(r => r.timestamp && r.type === 'IN').forEach(r => {
      const inD = new Date(r.timestamp);
      const inKey = inD.toISOString().slice(0, 10);
      const inMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      if (inKey.startsWith(inMonth)) {
        const outR = records.find(o =>
          o.type === 'OUT' &&
          new Date(o.timestamp) > inD &&
          new Date(o.timestamp).toDateString() !== inD.toDateString()
        );
        if (outR) overnightCount++;
      }
    });

    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const workingDays = dayKeys.filter(k => (shiftMap[k] || []).length > 0).length;
    return {
      totalHours: totalMs > 0 ? `${h}h ${m}m` : '—',
      shiftCount,
      workingDays,
      overnightCount,
    };
  }, [shiftMap, dayKeys, records]);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDay(null);
  };

  const fmtH = h => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h % 1) * 60);
    const ap = hh < 12 ? 'am' : 'pm';
    const d = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `${d}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ap}`;
  };

  const fmtDur = (startH, endH) => {
    const ms = (endH - startH) * 3600000;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h${m ? ` ${m}m` : ''}`;
  };

  const todayKey = now.toISOString().slice(0, 10);
  const selectedKey = selectedDay
    ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedSegs = selectedKey ? (shiftMap[selectedKey] || []) : [];

  // Hour axis labels for the tracker
  const AXIS_LABELS = ['12am', '4am', '8am', '12pm', '4pm', '8pm', '12am'];

  return (
    <div style={s.page}>
      {/* Navbar */}
      <nav style={s.navbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} style={s.backBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Dashboard
          </button>
          <img src={logoImg} alt="Retina" style={s.navLogo} />
        </div>
        <div style={s.navRight}>
          <div style={s.navUser}>
            <div style={s.navAvatar}>{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
            <div>
              <p style={s.navName}>{user?.firstName} {user?.lastName}</p>
              {user?.employeeId && <p style={s.navEmpId}>{user.employeeId}</p>}
            </div>
          </div>
          <button onClick={async () => { await logout(); navigate('/login'); }} style={s.signOutBtn}>Sign out</button>
        </div>
      </nav>

      <main style={s.main}>
        {/* Header row */}
        <div style={s.headerRow}>
          <div>
            <h1 style={s.pageTitle}>Shift Calendar</h1>
            <p style={s.pageDate}>{MONTHS[currentMonth]} {currentYear}</p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={prevMonth} style={s.navBtn}>‹</button>
            <button onClick={() => { setCurrentMonth(now.getMonth()); setCurrentYear(now.getFullYear()); setSelectedDay(null); }} style={s.todayBtn}>Today</button>
            <button onClick={nextMonth} style={s.navBtn}>›</button>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statsGrid}>
          {[
            { label: 'Total Hours', value: monthStats.totalHours },
            { label: 'Shifts', value: monthStats.shiftCount || '—' },
            { label: 'Working Days', value: monthStats.workingDays || '—' },
            { label: 'Overnight', value: monthStats.overnightCount || '—' },
          ].map(({ label, value }) => (
            <div key={label} style={s.statCard}>
              <p style={s.statLabel}>{label}</p>
              <p style={s.statValue}>{value}</p>
            </div>
          ))}
        </div>

        {/* Calendar body */}
        <div style={s.calBody}>
          {/* Left: sleep-tracker timeline */}
          <div style={s.trackerPanel}>
            {loading ? (
              <div style={s.loadingMsg}>Loading shifts...</div>
            ) : (
              <>
                {/* Axis */}
                <div style={s.axisRow}>
                  <div style={s.dayLabelCol} />
                  {AXIS_LABELS.map((l, i) => (
                    <div key={i} style={{ ...s.axisLabel, left: `${(i / 6) * 100}%` }}>{l}</div>
                  ))}
                </div>

                {/* Rows */}
                <div style={s.rowsWrap}>
                  {dayKeys.map((key, idx) => {
                    const dayNum = idx + 1;
                    const segs = shiftMap[key] || [];
                    const isToday = key === todayKey;
                    const isSelected = dayNum === selectedDay;
                    const hasShifts = segs.length > 0;

                    return (
                      <div
                        key={key}
                        style={{
                          ...s.dayRow,
                          background: isSelected ? 'rgba(81,112,255,0.07)' : 'transparent',
                          cursor: hasShifts ? 'pointer' : 'default',
                        }}
                        onClick={() => hasShifts && setSelectedDay(isSelected ? null : dayNum)}
                      >
                        {/* Day label */}
                        <div style={{ ...s.dayLabel, color: isToday ? '#818cf8' : isSelected ? '#a08cff' : '#333' }}>
                          {dayNum}
                        </div>

                        {/* Track */}
                        <div style={s.track}>
                          {/* Hour gridlines */}
                          {[4, 8, 12, 16, 20].map(h => (
                            <div key={h} style={{ ...s.gridLine, left: `${h / 24 * 100}%` }} />
                          ))}

                          {/* Shift segments */}
                          {segs.map((seg, si) => {
                            const c = SHIFT_COLORS[seg.colorIdx % SHIFT_COLORS.length];
                            const left = seg.startH / 24 * 100;
                            const width = (seg.endH - seg.startH) / 24 * 100;
                            return (
                              <div
                                key={si}
                                style={{
                                  position: 'absolute',
                                  left: `${left}%`,
                                  width: `${Math.max(0.5, width)}%`,
                                  top: '3px',
                                  bottom: '3px',
                                  borderRadius: '3px',
                                  background: isSelected ? c.bg : c.bg,
                                  opacity: isSelected ? 1 : 0.75,
                                }}
                                title={`${fmtH(seg.startH)} – ${seg.open ? 'now' : fmtH(seg.endH)} (${fmtDur(seg.startH, seg.endH)})`}
                              />
                            );
                          })}

                          {/* Today marker */}
                          {isToday && (
                            <div style={{ ...s.todayLine, left: `${(now.getHours() + now.getMinutes() / 60) / 24 * 100}%` }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right: day detail panel */}
          <div style={s.detailPanel}>
            {selectedDay && selectedKey ? (
              <>
                <div style={s.detailHeader}>
                  <p style={s.detailTitle}>
                    {new Date(currentYear, currentMonth, selectedDay).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                  <button onClick={() => setSelectedDay(null)} style={s.closeBtn}>✕</button>
                </div>

                {selectedSegs.length === 0 ? (
                  <p style={s.noShifts}>No shifts recorded.</p>
                ) : (
                  <div style={s.shiftList}>
                    {selectedSegs.map((seg, i) => {
                      const c = SHIFT_COLORS[seg.colorIdx % SHIFT_COLORS.length];
                      return (
                        <div key={i} style={s.shiftItem}>
                          <div style={{ ...s.shiftDot, background: c.bg }} />
                          <div style={{ flex: 1 }}>
                            <p style={s.shiftTime}>
                              {fmtH(seg.startH)} — {seg.open ? <span style={{ color: '#86efac' }}>now (ongoing)</span> : fmtH(seg.endH)}
                            </p>
                            <p style={s.shiftDur}>{fmtDur(seg.startH, seg.endH)}</p>
                          </div>
                          {seg.open && <span style={s.openBadge}>Live</span>}
                        </div>
                      );
                    })}

                    {/* Daily total */}
                    <div style={s.dailyTotal}>
                      <span style={s.dailyTotalLabel}>Total</span>
                      <span style={s.dailyTotalValue}>
                        {fmtDur(0, selectedSegs.reduce((a, sg) => a + sg.endH - sg.startH, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={s.detailEmpty}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
                </svg>
                <p style={{ margin: 0, fontSize: '11px', color: '#2a2a2a' }}>Click a day with shifts</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={s.legend}>
          <div style={s.legendItem}>
            <div style={{ ...s.legendDot, background: '#5170ff' }} />
            <span>Shift segment</span>
          </div>
          <div style={s.legendItem}>
            <div style={{ ...s.legendDot, background: '#86efac' }} />
            <span>Ongoing</span>
          </div>
          <div style={s.legendItem}>
            <div style={{ width: '2px', height: '10px', background: '#818cf8', borderRadius: '1px' }} />
            <span>Current time</span>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#2a2a2a' }}>
            Overnight shifts continue on the next row
          </div>
        </div>
      </main>
    </div>
  );
}

const s = {
  page: { height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0a' },
  navbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: '48px', background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', flexShrink: 0, zIndex: 100 },
  backBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '7px', color: '#555', cursor: 'pointer', fontSize: '11px', fontWeight: '600' },
  navLogo: { height: '20px', objectFit: 'contain', filter: 'brightness(0) invert(1)' },
  navRight: { display: 'flex', alignItems: 'center', gap: '14px' },
  navUser: { display: 'flex', alignItems: 'center', gap: '8px' },
  navAvatar: { width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  navName: { color: '#e5e5e5', fontSize: '12px', fontWeight: '600', margin: 0, lineHeight: 1.3 },
  navEmpId: { color: '#404040', fontSize: '10px', fontFamily: 'monospace', margin: 0 },
  signOutBtn: { padding: '5px 12px', background: 'transparent', border: '1px solid #222', borderRadius: '7px', color: '#6b6b6b', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },

  main: { flex: 1, padding: '16px 24px 12px', maxWidth: '1100px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden', minHeight: 0, boxSizing: 'border-box' },

  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  pageTitle: { fontSize: '18px', fontWeight: '700', color: '#fff', letterSpacing: '-0.03em', margin: '0 0 2px' },
  pageDate: { fontSize: '11px', color: '#333', margin: 0 },
  navBtn: { padding: '5px 12px', background: '#111', border: '1px solid #1a1a1a', borderRadius: '7px', color: '#555', cursor: 'pointer', fontSize: '14px', fontWeight: '500', lineHeight: 1 },
  todayBtn: { padding: '5px 12px', background: '#111', border: '1px solid #1a1a1a', borderRadius: '7px', color: '#555', cursor: 'pointer', fontSize: '11px', fontWeight: '600' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 },
  statCard: { background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '10px 14px' },
  statLabel: { fontSize: '10px', fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' },
  statValue: { fontSize: '17px', fontWeight: '700', color: '#fff', letterSpacing: '-0.03em', margin: 0 },

  calBody: { flex: 1, display: 'flex', gap: '10px', minHeight: 0, overflow: 'hidden' },

  trackerPanel: { flex: 1, background: '#111', border: '1px solid #1a1a1a', borderRadius: '12px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' },
  loadingMsg: { textAlign: 'center', padding: '32px', color: '#333', fontSize: '12px' },

  axisRow: { position: 'relative', height: '22px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, marginLeft: '36px' },
  axisLabel: { position: 'absolute', transform: 'translateX(-50%)', fontSize: '9px', color: '#2d2d2d', top: '6px', fontWeight: '600', letterSpacing: '0.04em' },

  rowsWrap: { flex: 1, overflowY: 'auto', overflowX: 'hidden' },
  dayRow: { display: 'flex', alignItems: 'center', height: '22px', borderBottom: '1px solid #141414', transition: 'background 0.1s' },
  dayLabel: { width: '36px', flexShrink: 0, fontSize: '10px', fontWeight: '600', textAlign: 'right', paddingRight: '8px', letterSpacing: '0.02em' },
  track: { flex: 1, position: 'relative', height: '100%', marginRight: '6px' },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: '1px', background: '#1a1a1a' },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: '2px', background: '#818cf8', borderRadius: '1px', zIndex: 2 },

  detailPanel: { width: '200px', flexShrink: 0, background: '#111', border: '1px solid #1a1a1a', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  detailHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 },
  detailTitle: { fontSize: '11px', fontWeight: '700', color: '#e5e5e5', margin: 0 },
  closeBtn: { background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '12px', padding: '0 2px' },
  noShifts: { color: '#2a2a2a', fontSize: '11px', textAlign: 'center', padding: '20px 12px', margin: 0 },
  shiftList: { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 },
  shiftItem: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
  shiftDot: { width: '8px', height: '8px', borderRadius: '50%', marginTop: '3px', flexShrink: 0 },
  shiftTime: { fontSize: '11px', color: '#e5e5e5', margin: '0 0 2px', fontWeight: '600' },
  shiftDur: { fontSize: '10px', color: '#333', margin: 0 },
  openBadge: { fontSize: '9px', fontWeight: '700', color: '#86efac', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', padding: '1px 6px', borderRadius: '4px', flexShrink: 0 },
  dailyTotal: { borderTop: '1px solid #1a1a1a', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dailyTotalLabel: { fontSize: '10px', fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: '0.06em' },
  dailyTotalValue: { fontSize: '13px', fontWeight: '700', color: '#fff' },
  detailEmpty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },

  legend: { display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 },
  legendItem: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#2d2d2d', fontWeight: '600', letterSpacing: '0.04em' },
  legendDot: { width: '8px', height: '8px', borderRadius: '2px' },
};

export default ShiftCalendarPage;
