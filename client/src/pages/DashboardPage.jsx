import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import logoImg from '../../images/viber_image_2026-03-30_15-19-54-560-removebg-preview.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PH_TZ = 'Asia/Manila';

// ── PH timezone helpers ───────────────────────────────────────
const toPhDate = d => new Date(new Date(d).toLocaleString('en-US', { timeZone: PH_TZ }));
const phToday = () => toPhDate(new Date());
const dateKey = d => { const p = toPhDate(d); return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')}`; };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const weekStart = d => { const p = toPhDate(d); const m = new Date(p); m.setDate(p.getDate() - ((p.getDay() + 6) % 7)); m.setHours(0,0,0,0); return m; };
const fmtWeekRange = mon => `${mon.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${addDays(mon,6).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
const fmtWeekShort = mon => `${mon.toLocaleDateString('en-US',{month:'short',day:'numeric'})}–${addDays(mon,6).toLocaleDateString('en-US',{day:'numeric'})}`;
const DAY_NAMES_FULL = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const DAY_NAMES_SHORT = ['M','T','W','T','F','S','S'];

// ── Pair IN/OUT records into sessions ─────────────────────────
// Rules:
//  - A session is {inRecord, outRecord|null, type:'regular'|'ot'}
//  - Hours only count when BOTH records are non-rejected
//    (pending counts as 0h until approved/matched; rejected = 0h forever)
//  - If IN is rejected, OUT is disqualified even if OUT itself is matched
//  - A live open IN (no OUT yet) counts hours only if IN is not rejected
const COUNTS_STATUS = s => s === 'matched' || s === 'approved' || s === 'auto';
const IS_REJECTED   = s => s === 'rejected';

function pairRecords(records) {
  const sorted = [...records].filter(r => r.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const sessions = []; // {inRec, outRec, isOt, inTs, outTs}
  let openIn = null, openInType = null;

  for (const r of sorted) {
    const ts = new Date(r.timestamp);

    if (r.type === 'IN_OVERTIME' && openIn) {
      // Close previous regular segment, open OT segment
      sessions.push({ inRec: openIn, outRec: r, isOt: false, inTs: new Date(openIn.timestamp), outTs: ts });
      openIn = r; openInType = 'IN_OVERTIME';
    } else if ((r.type === 'IN' || r.type === 'IN_OVERTIME') && !openIn) {
      openIn = r; openInType = r.type;
    } else if (r.type === 'OUT' && openIn) {
      sessions.push({ inRec: openIn, outRec: r, isOt: openInType === 'IN_OVERTIME', inTs: new Date(openIn.timestamp), outTs: ts });
      openIn = null; openInType = null;
    }
  }
  // Still live
  if (openIn) {
    sessions.push({ inRec: openIn, outRec: null, isOt: openInType === 'IN_OVERTIME', inTs: new Date(openIn.timestamp), outTs: null });
  }
  return sessions;
}

// Hours for a session — 0 if either leg is rejected, 0 if still pending (no OUT yet)
function sessionHours(sess, nowMs) {
  if (IS_REJECTED(sess.inRec.status)) return 0;
  if (sess.outRec && IS_REJECTED(sess.outRec.status)) return 0;
  if (!sess.outRec) {
    // Live open — only count if IN is approved/matched
    if (!COUNTS_STATUS(sess.inRec.status)) return 0;
    return (nowMs - sess.inTs.getTime()) / 3600000;
  }
  // Both records present — only count if IN counts (pending OUT is still 0)
  if (!COUNTS_STATUS(sess.inRec.status)) return 0;
  if (!COUNTS_STATUS(sess.outRec.status)) return 0;
  return (sess.outTs.getTime() - sess.inTs.getTime()) / 3600000;
}

// Build week summary from records
function buildWeekData(records, mondayDate) {
  const days = Array.from({length:7}, (_,i) => {
    const d = addDays(mondayDate,i);
    return {date:d, key:dateKey(d), regular:0, ot:0, hasRealShift:false, manualRecords:[], approvedRecords:[], otRecord:null};
  });

  const nowMs = Date.now();
  const sessions = pairRecords(records);

  for (const sess of sessions) {
    const k = dateKey(sess.inTs);
    const day = days.find(d => d.key === k);
    if (!day) continue;

    const durH = sessionHours(sess, nowMs);

    if (durH > 0) {
      if (sess.isOt) {
        day.ot += durH;
      } else {
        day.regular += Math.min(durH, 8);
        day.ot      += Math.max(0, durH - 8);
      }
      day.hasRealShift = true;
      if (sess.outRec) day.approvedRecords.push({in: sess.inTs, out: sess.outTs});
    }
  }

  // Manual entries — tracked separately
  for (const r of records) {
    if (r.type === 'MANUAL') {
      const day = days.find(d => d.key === r.manualDate);
      if (day) day.manualRecords.push(r);
    }
    if (r.type === 'OT_MANUAL') {
      const day = days.find(d => d.key === r.manualDate);
      if (day) day.otRecord = r;
    }
  }

  days.forEach(d => {
    d.hasShift = d.hasRealShift || d.manualRecords.some(r => r.status === 'approved');
  });

  return days;
}

// ── Photo lightbox ────────────────────────────────────────────
function PhotoLightbox({ src, onClose, faceScan = false }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={e=>e.stopPropagation()} style={{position:'relative',maxWidth:'min(90vw,600px)',maxHeight:'85vh',display:'flex',flexDirection:'column',alignItems:'center',gap:'12px'}}>
        <img src={src} alt="Proof photo" style={{maxWidth:'100%',maxHeight:'75vh',borderRadius:'12px',objectFit:'contain',border:'1px solid #2a2a2a',transform:faceScan?'scaleX(-1)':'none'}}/>
        <button onClick={onClose} style={{background:'#1a1a1a',border:'1px solid #2a2a2a',color:'#aaa',fontSize:'12px',fontWeight:'700',padding:'8px 20px',borderRadius:'100px',cursor:'pointer',letterSpacing:'0.04em'}}>Close</button>
      </div>
    </div>
  );
}

// ── Proof side component (reusable) ──────────────────────────
function ProofSide({ label, proofType, onToggle, photo, onPhotoChange, note, onNoteChange, fileRef, readOnly }) {
  const [lightbox, setLightbox] = useState(false);
  const isPhoto = proofType === 'photo';
  const isNote = proofType === 'note';
  const photoSrc = photo ? (typeof photo === 'string' ? photo : photo.data) : null;
  return (
    <div style={m.proofSide}>
      {lightbox && photoSrc && <PhotoLightbox src={photoSrc} onClose={()=>setLightbox(false)}/>}
      <div style={m.proofSideHeader}>
        <span style={m.proofSideLbl}>Clock {label}</span>
        {!readOnly && (
          <button onClick={onToggle} style={{...m.proofModeBtn, background:isNote?'rgba(245,158,11,.1)':'rgba(129,140,248,.1)', color:isNote?'#f59e0b':'#818cf8', borderColor:isNote?'rgba(245,158,11,.25)':'rgba(129,140,248,.25)'}}>
            {isPhoto ? 'Photo' : 'Note'}
          </button>
        )}
        {readOnly && <span style={{fontSize:'8px',color:'#555',fontWeight:'600'}}>{isPhoto?'Photo':'Note'}</span>}
      </div>
      <div style={m.proofBody}>
        {isPhoto ? (
          photo ? (
            readOnly && photoSrc ? (
              // Show actual image thumbnail with tap-to-expand
              <div onClick={()=>setLightbox(true)} style={{...m.photoPreview, cursor:'pointer', padding:0, overflow:'hidden', position:'relative'}}>
                <img src={photoSrc} alt="proof" style={{width:'100%',height:'72px',objectFit:'cover',borderRadius:'7px',display:'block'}}/>
                <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.3)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'7px',opacity:0,transition:'opacity .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </div>
              </div>
            ) : (
              <div style={m.photoPreview}>
                <div style={m.photoCheck}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#40d9a0" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                <p style={{fontSize:'8px',color:'#40d9a0',marginTop:'3px',padding:'0 4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}}>{typeof photo==='string' ? 'photo' : photo.name}</p>
                {!readOnly && <button onClick={()=>onPhotoChange(null)} style={m.removeBtn}>remove</button>}
              </div>
            )
          ) : readOnly ? (
            <div style={{...m.photoUpload, cursor:'default', borderColor:'#1a1a1a'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#252525" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p style={m.photoLbl}>no photo</p>
            </div>
          ) : (
            <div style={m.photoUpload} onClick={() => fileRef?.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#252525" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p style={m.photoLbl}>tap to upload</p>
              <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>onPhotoChange({name:f.name,data:r.result}); r.readAsDataURL(f); }}/>
            </div>
          )
        ) : (
          readOnly ? (
            <div style={{padding:'8px',fontSize:'10px',color:'#555',fontStyle:'italic',lineHeight:1.4,minHeight:'72px'}}>{note || 'No note provided.'}</div>
          ) : (
            <textarea value={note} onChange={e=>onNoteChange(e.target.value)} placeholder={`Why no photo for clock ${label}?`} style={m.noteArea}/>
          )
        )}
      </div>
    </div>
  );
}

// ── Log/Edit shift modal (manual entry + OT) ─────────────────
function ShiftModal({ mode, day, existingData, occupiedSlots, onClose, onSubmit, isClockedIn }) {
  const isOT = mode === 'log_ot' || mode === 'edit_ot';
  const isEdit = mode === 'edit' || mode === 'edit_ot';
  const [clockIn, setClockIn] = useState(existingData?.clockInTime || '09:00');
  const [clockOut, setClockOut] = useState(existingData?.clockOutTime || '18:00');
  const [nextDay, setNextDay] = useState(existingData?.clockOutNextDay || false);
  const [inType, setInType] = useState(existingData?.clockInProofType || 'photo');
  const [outType, setOutType] = useState(existingData?.clockOutProofType || 'photo');
  const [inPhoto, setInPhoto] = useState(existingData?.clockInProofUrl ? {name:'existing',data:existingData.clockInProofUrl} : null);
  const [outPhoto, setOutPhoto] = useState(existingData?.clockOutProofUrl ? {name:'existing',data:existingData.clockOutProofUrl} : null);
  const [inNote, setInNote] = useState(existingData?.clockInNote || '');
  const [outNote, setOutNote] = useState(existingData?.clockOutNote || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inRef = useRef(); const outRef = useRef();

  const toMins = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
  const durH = (() => { const i=toMins(clockIn), o=toMins(clockOut)+(nextDay?1440:0); return (o-i)/60; })();
  const crossesMid = toMins(clockOut)<toMins(clockIn)&&!nextDay;

  const slotConflict = occupiedSlots?.some(s => {
    if(!s.start||!s.end) return false;
    const si=toMins(s.start), se=toMins(s.end), mi=toMins(clockIn), me=toMins(clockOut)+(nextDay?1440:0);
    return mi<se&&me>si;
  });

  const phDate = toPhDate(day.date);
  const dateLabel = phDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const modalTitle = isOT ? (isEdit?'Edit Overtime':'Log Overtime') : (isEdit?'Edit Shift Entry':'Log Shift');

  const handleSubmit = async () => {
    setError('');
    if (durH<=0) { setError('Clock out must be after clock in.'); return; }
    if (durH>15) { setError('Max shift duration is 15 hours.'); return; }
    if (slotConflict&&!isOT) { setError('Time range overlaps with an existing shift.'); return; }
    if (inType==='photo'&&!inPhoto) { setError('Upload a clock in photo.'); return; }
    if (outType==='photo'&&!outPhoto) { setError('Upload a clock out photo.'); return; }
    if (inType==='note'&&!inNote.trim()) { setError('Add a note for clock in.'); return; }
    if (outType==='note'&&!outNote.trim()) { setError('Add a note for clock out.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        isOT, isEdit,
        recordId: existingData?.recordId,
        manualDate: day.key,
        clockInTime: clockIn, clockOutTime: clockOut,
        clockOutNextDay: nextDay||crossesMid,
        clockInProofType: inType, clockInProofUrl: inType==='photo'?inPhoto?.data:null, clockInNote: inType==='note'?inNote:null,
        clockOutProofType: outType, clockOutProofUrl: outType==='photo'?outPhoto?.data:null, clockOutNote: outType==='note'?outNote:null,
      });
      onClose();
    } catch(e) { setError(e?.response?.data?.detail || e.message || 'Submission failed.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={m.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={m.card}>
        <div style={m.header}>
          <div>
            <p style={m.title}>{modalTitle} — {dateLabel}</p>
            <p style={m.sub}>{isOT?'Overtime entries go to admin for separate approval.':'Manual entries go to admin for approval.'}</p>
          </div>
          <button onClick={onClose} style={m.closeBtn}>✕</button>
        </div>

        <p style={m.fieldLabel}>Shift time</p>
        <div style={m.timeRow}>
          <div style={m.timeBlock}>
            <p style={m.timeBlockLbl}>Clock {isOT?'OT ':''}in</p>
            <input type="time" value={clockIn} onChange={e=>setClockIn(e.target.value)} style={m.timeInput}/>
          </div>
          <div style={{...m.timeBlock, borderColor:(crossesMid||nextDay)?'#3a2e10':'#1a1a1a'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <p style={{...m.timeBlockLbl, color:(nextDay||crossesMid)?'#f59e0b':'#404040'}}>Clock {isOT?'OT ':''}out</p>
              <label style={{display:'flex',alignItems:'center',gap:'4px',cursor:'pointer'}}>
                <input type="checkbox" checked={nextDay} onChange={e=>setNextDay(e.target.checked)} style={{accentColor:'#f59e0b'}}/>
                <span style={{fontSize:'9px',color:'#555',fontWeight:'600'}}>+1 day</span>
              </label>
            </div>
            <input type="time" value={clockOut} onChange={e=>setClockOut(e.target.value)} style={{...m.timeInput, color:(nextDay||crossesMid)?'#f59e0b':'#fff'}}/>
            {(crossesMid||nextDay)&&<p style={{fontSize:'9px',color:'#7a5a10',marginTop:'3px'}}>crosses midnight → next day</p>}
          </div>
        </div>

        {durH>0&&<div style={{...m.hint, background:durH>15?'rgba(239,68,68,.08)':'rgba(81,112,255,.08)', borderColor:durH>15?'rgba(239,68,68,.2)':'rgba(81,112,255,.2)', color:durH>15?'#f87171':'#818cf8'}}>
          {durH>15?`⚠ Max 15h — current: ${durH.toFixed(1)}h`:`Duration: ${durH.toFixed(1)}h`}
        </div>}
        {slotConflict&&!isOT&&<div style={{...m.hint, background:'rgba(239,68,68,.08)', borderColor:'rgba(239,68,68,.2)', color:'#f87171'}}>⚠ Overlaps with an existing shift</div>}

        <p style={{...m.fieldLabel, marginTop:'10px'}}>Proof</p>
        <div style={m.proofRow}>
          <ProofSide label="in" proofType={inType} onToggle={()=>setInType(t=>t==='photo'?'note':'photo')} photo={inPhoto} onPhotoChange={setInPhoto} note={inNote} onNoteChange={setInNote} fileRef={inRef} readOnly={false}/>
          <ProofSide label="out" proofType={outType} onToggle={()=>setOutType(t=>t==='photo'?'note':'photo')} photo={outPhoto} onPhotoChange={setOutPhoto} note={outNote} onNoteChange={setOutNote} fileRef={outRef} readOnly={false}/>
        </div>

        {error&&<div style={m.errorMsg}>{error}</div>}
        <div style={m.pendingNote}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {isEdit?'Still pending — edit and resubmit for approval':'Submitted as'} <strong style={{margin:'0 3px'}}>{isOT?'Overtime Entry':'Manual Entry'}</strong> {!isEdit&&'— pending admin approval'}
        </div>
        <div style={m.actionRow}>
          <button onClick={onClose} style={m.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} style={m.submitBtn}>{submitting?'Submitting…':isEdit?'Save Changes':'Submit for Approval'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Real shift proof row (face-scan clock records) ────────────
function RealShiftProofRow({ inPhoto, outPhoto }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  return (
    <div style={m.proofRow}>
      {lightboxSrc && <PhotoLightbox src={lightboxSrc} faceScan={true} onClose={()=>setLightboxSrc(null)}/>}
      {['in','out'].map(side => {
        const src = side==='in' ? inPhoto : outPhoto;
        return (
          <div key={side} style={m.proofSide}>
            <div style={m.proofSideHeader}>
              <span style={m.proofSideLbl}>Clock {side}</span>
              <span style={{fontSize:'8px',color:'#555',fontWeight:'600'}}>Face scan</span>
            </div>
            <div style={m.proofBody}>
              {src ? (
                <div onClick={()=>setLightboxSrc(src)} style={{...m.photoPreview, cursor:'pointer', padding:0, overflow:'hidden'}}>
                  <img src={src} alt={`clock ${side} proof`} style={{width:'100%',height:'72px',objectFit:'cover',borderRadius:'7px',display:'block',transform:'scaleX(-1)'}}/>
                </div>
              ) : (
                <div style={{...m.photoUpload, cursor:'default', borderColor:'#1a1a1a'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#252525" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <p style={m.photoLbl}>no photo</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Day detail modal (approved / pending view) ────────────────
function DayDetailModal({ day, dayData, onClose, onLogOT, onEditOT, onEditShift }) {
  const { manualRecords, approvedRecords, otRecord } = dayData;
  const pendingManual = manualRecords.find(r => r.status==='pending_manual');
  const approvedManual = manualRecords.find(r => r.status==='approved');
  const hasApprovedManual = !!approvedManual;
  const hasRealShift = approvedRecords.length > 0;
  const isApproved = hasRealShift || hasApprovedManual;
  const mainRecord = approvedManual || (approvedRecords.length>0 ? approvedRecords[0] : null);
  const otPending = otRecord?.status==='pending_ot';
  const otApproved = otRecord?.status==='approved';

  const phDate = toPhDate(day.date);
  const dateLabel = phDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  const fmtTs = ts => ts ? new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—';

  const TagPill = ({label, color}) => {
    const colors = {
      green:{bg:'rgba(34,197,94,.1)',color:'#86efac',border:'rgba(34,197,94,.2)'},
      amber:{bg:'rgba(245,158,11,.1)',color:'#f59e0b',border:'rgba(245,158,11,.2)'},
      purple:{bg:'rgba(160,140,255,.1)',color:'#a08cff',border:'rgba(160,140,255,.2)'},
      red:{bg:'rgba(239,68,68,.1)',color:'#f87171',border:'rgba(239,68,68,.2)'},
    }[color]||{bg:'rgba(100,100,100,.1)',color:'#888',border:'rgba(100,100,100,.2)'};
    return <span style={{fontSize:'10px',fontWeight:'700',padding:'2px 8px',borderRadius:'5px',background:colors.bg,color:colors.color,border:`1px solid ${colors.border}`}}>{label}</span>;
  };

  const TimeBlock = ({label, value, sub}) => (
    <div style={m.timeBlock}>
      <p style={m.timeBlockLbl}>{label}</p>
      <p style={{fontSize:'20px',fontWeight:'800',color:'#fff',letterSpacing:'-.03em',margin:0}}>{value}</p>
      {sub&&<p style={{fontSize:'9px',color:'#555',marginTop:'2px'}}>{sub}</p>}
    </div>
  );

  // ── Shared OT section — rendered in both pending and approved branches ──
  const OTSection = () => (
    <>
      <div style={{height:'1px',background:'#1a1a1a',margin:'12px 0'}}/>
      {!otRecord && (
        <>
          <div style={{fontSize:'12px',color:'#555',marginBottom:'10px'}}>No overtime logged for this day.</div>
          <div style={m.actionRow}>
            <button onClick={onLogOT} style={{...m.submitBtn, background:'rgba(245,158,11,.15)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.25)'}}>Log Overtime</button>
          </div>
        </>
      )}
      {(otPending || otApproved) && (
        <>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <span style={{fontSize:'12px',fontWeight:'700',color:'#e5e5e5'}}>Overtime</span>
            {otPending&&<TagPill label="pending approval" color="amber"/>}
            {otApproved&&<TagPill label="approved" color="purple"/>}
          </div>
          <div style={{...m.timeRow, marginBottom:'10px'}}>
            <TimeBlock label="OT in" value={otRecord.clockInTime||'—'}/>
            <TimeBlock label="OT out" value={otRecord.clockOutTime||'—'} sub={otRecord.clockOutNextDay?'next day':null}/>
          </div>
          <div style={m.proofRow}>
            <ProofSide label="in" proofType={otRecord.clockInProofType||'photo'} photo={otRecord.clockInProofUrl?{name:'photo',data:otRecord.clockInProofUrl}:null} note={otRecord.clockInNote} readOnly={true}/>
            <ProofSide label="out" proofType={otRecord.clockOutProofType||'photo'} photo={otRecord.clockOutProofUrl?{name:'photo',data:otRecord.clockOutProofUrl}:null} note={otRecord.clockOutNote} readOnly={true}/>
          </div>
          {otPending && (
            <div style={m.actionRow}>
              <button onClick={onEditOT} style={{...m.submitBtn, background:'rgba(245,158,11,.15)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.25)'}}>Edit Overtime</button>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div style={m.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{...m.card, maxHeight:'90vh', overflowY:'auto'}}>
        <div style={m.header}>
          <div>
            <p style={m.title}>{dateLabel}</p>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'5px',flexWrap:'wrap'}}>
              {pendingManual && <TagPill label="pending" color="amber"/>}
              {isApproved && <TagPill label="approved" color="green"/>}
              {otPending && <TagPill label="OT pending" color="amber"/>}
              {otApproved && <TagPill label="OT approved" color="purple"/>}
              {mainRecord && <span style={{fontSize:'11px',color:'#333'}}>{((mainRecord.regular||0)+(mainRecord.ot||0)||'?')}h worked</span>}
            </div>
          </div>
          <button onClick={onClose} style={m.closeBtn}>✕</button>
        </div>

        <div style={{height:'1px',background:'#1a1a1a',margin:'12px 0'}}/>

        {/* ── Pending manual branch ── */}
        {pendingManual && !hasApprovedManual && (
          <>
            <p style={m.fieldLabel}>Shift time</p>
            <div style={m.timeRow}>
              <TimeBlock label="Clock in" value={pendingManual.clockInTime||'—'}/>
              <TimeBlock label="Clock out" value={pendingManual.clockOutTime||'—'} sub={pendingManual.clockOutNextDay?'next day':null}/>
            </div>
            <p style={m.fieldLabel}>Proof</p>
            <div style={m.proofRow}>
              <ProofSide label="in" proofType={pendingManual.clockInProofType||'photo'} photo={pendingManual.clockInProofUrl?{name:'photo',data:pendingManual.clockInProofUrl}:null} note={pendingManual.clockInNote} readOnly={true}/>
              <ProofSide label="out" proofType={pendingManual.clockOutProofType||'photo'} photo={pendingManual.clockOutProofUrl?{name:'photo',data:pendingManual.clockOutProofUrl}:null} note={pendingManual.clockOutNote} readOnly={true}/>
            </div>
            <div style={{...m.pendingNote, marginBottom:'14px'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Still pending — you can edit and resubmit
            </div>
            <div style={m.actionRow}>
              <button onClick={onClose} style={m.cancelBtn}>Close</button>
              <button onClick={()=>onEditShift(pendingManual)} style={m.submitBtn}>Edit Entry</button>
            </div>

            {/* ── OT section shown even when shift is still pending ── */}
            <OTSection />
          </>
        )}

        {/* ── Approved branch ── */}
        {isApproved && !pendingManual && (
          <>
            <p style={m.fieldLabel}>Shift times</p>
            <div style={m.timeRow}>
              <TimeBlock label="Clock in" value={approvedManual ? approvedManual.clockInTime : fmtTs(mainRecord?.in)}/>
              <TimeBlock label="Clock out" value={approvedManual ? approvedManual.clockOutTime : fmtTs(mainRecord?.out)} sub={approvedManual?.clockOutNextDay?'next day':null}/>
            </div>
            <p style={m.fieldLabel}>Proof</p>
            {approvedManual ? (
              <div style={m.proofRow}>
                <ProofSide label="in" proofType={approvedManual.clockInProofType||'photo'} photo={approvedManual.clockInProofUrl?{name:'photo',data:approvedManual.clockInProofUrl}:null} note={approvedManual.clockInNote} readOnly={true}/>
                <ProofSide label="out" proofType={approvedManual.clockOutProofType||'photo'} photo={approvedManual.clockOutProofUrl?{name:'photo',data:approvedManual.clockOutProofUrl}:null} note={approvedManual.clockOutNote} readOnly={true}/>
              </div>
            ) : (
              <RealShiftProofRow inPhoto={dayData.inProofPhoto} outPhoto={dayData.outProofPhoto} />
            )}

            <OTSection />

            {/* Close button — only shown when no OT action buttons are visible */}
            {otApproved && (
              <div style={{...m.actionRow, marginTop:'10px'}}>
                <button onClick={onClose} style={m.cancelBtn}>Close</button>
              </div>
            )}
            {!otRecord && (
              <div style={{...m.actionRow, marginTop:'10px'}}>
                <button onClick={onClose} style={m.cancelBtn}>Close</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Modal styles
const m = {
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'},
  card:{background:'#111',border:'1px solid #222',borderRadius:'14px',padding:'20px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'},
  header:{display:'flex',alignItems:'flex-start',justifyContent:'space-between'},
  title:{fontSize:'14px',fontWeight:'700',color:'#fff',margin:'0 0 2px'},
  sub:{fontSize:'11px',color:'#404040',margin:0},
  closeBtn:{background:'none',border:'none',color:'#444',cursor:'pointer',fontSize:'14px',padding:'0 2px',flexShrink:0},
  fieldLabel:{fontSize:'9px',fontWeight:'700',color:'#404040',textTransform:'uppercase',letterSpacing:'.08em',margin:'0 0 6px'},
  timeRow:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'},
  timeBlock:{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:'10px',padding:'10px 12px'},
  timeBlockLbl:{fontSize:'9px',fontWeight:'700',color:'#404040',textTransform:'uppercase',letterSpacing:'.07em',margin:'0 0 6px'},
  timeInput:{background:'transparent',border:'none',outline:'none',color:'#fff',fontSize:'18px',fontWeight:'800',letterSpacing:'-.02em',width:'100%',fontFamily:'Inter,system-ui,sans-serif'},
  hint:{fontSize:'9px',borderRadius:'5px',padding:'5px 9px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'5px'},
  proofRow:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'},
  proofSide:{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:'10px',overflow:'hidden'},
  proofSideHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 10px',borderBottom:'1px solid #1a1a1a'},
  proofSideLbl:{fontSize:'9px',fontWeight:'700',color:'#e5e5e5',textTransform:'uppercase',letterSpacing:'.06em',margin:0},
  proofModeBtn:{fontSize:'8px',fontWeight:'700',padding:'2px 8px',borderRadius:'4px',border:'1px solid',cursor:'pointer'},
  proofBody:{padding:'8px'},
  photoUpload:{background:'#0a0a0a',border:'1.5px dashed #1f1f1f',borderRadius:'7px',height:'72px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'4px',cursor:'pointer'},
  photoLbl:{fontSize:'8px',fontWeight:'700',color:'#252525',textTransform:'uppercase',letterSpacing:'.05em',margin:0},
  photoPreview:{background:'linear-gradient(135deg,#1a2a1a,#0d1a0d)',borderRadius:'7px',height:'72px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px',padding:'4px'},
  photoCheck:{width:'22px',height:'22px',borderRadius:'50%',background:'rgba(64,217,160,.2)',display:'flex',alignItems:'center',justifyContent:'center'},
  removeBtn:{fontSize:'8px',color:'#555',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',marginTop:'2px'},
  noteArea:{background:'#0a0a0a',border:'none',outline:'none',width:'100%',color:'#e5e5e5',fontSize:'10px',fontFamily:'Inter,system-ui,sans-serif',resize:'none',minHeight:'72px',padding:0},
  errorMsg:{fontSize:'11px',color:'#f87171',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:'6px',padding:'7px 10px',marginBottom:'10px'},
  pendingNote:{fontSize:'10px',color:'#f59e0b',background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.15)',borderRadius:'6px',padding:'7px 10px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'6px'},
  actionRow:{display:'flex',gap:'8px'},
  cancelBtn:{flex:1,padding:'10px',borderRadius:'8px',background:'transparent',border:'1px solid #1a1a1a',color:'#555',fontSize:'12px',fontWeight:'700',cursor:'pointer'},
  submitBtn:{flex:2,padding:'10px',borderRadius:'8px',background:'linear-gradient(135deg,#5170ff,#ff66c4)',border:'none',color:'#fff',fontSize:'12px',fontWeight:'700',cursor:'pointer'},
};

// ── Timesheet Panel ───────────────────────────────────────────
function TimesheetPanel({ records, weekOffset, isClockedIn }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [occupiedSlots, setOccupiedSlots] = useState([]);
  const [dayDetailData, setDayDetailData] = useState(null);
  const [submitMsg, setSubmitMsg] = useState('');

  const todayPh = phToday();
  const mondayDate = addDays(weekStart(todayPh), weekOffset * 7);
  const days = buildWeekData(records, mondayDate);
  const todayKey = dateKey(todayPh);
  const weekTotal = days.reduce((a,d)=>a+d.regular+d.ot,0);
  const weekOt = days.reduce((a,d)=>a+d.ot,0);
  const daysWorked = days.filter(d=>d.hasShift||d.manualRecords.some(r=>r.status!=='pending_manual')).length;

  const openDay = async day => {
    const phDay = toPhDate(day.date);
    if (day.key === todayKey) return; // today is always locked — handled via clock in/out page
    if (phDay > todayPh) return;

    setSubmitMsg('');
    const token = localStorage.getItem('token');

    try {
      const res = await axios.get(`${API_URL}/api/clock/occupied?date=${day.key}`, {headers:{Authorization:`Bearer ${token}`}});
      setOccupiedSlots(res.data.slots||[]);
    } catch { setOccupiedSlots([]); }

    // Fetch OT record for this day (used to populate detail modal)
    let otRecord = null;
    try {
      const res = await axios.get(`${API_URL}/api/clock/ot?date=${day.key}`, {headers:{Authorization:`Bearer ${token}`}});
      otRecord = res.data.record || null;
    } catch {}

    // ✅ Prefer the freshly-fetched otRecord over the one built from records,
    // so the detail modal always has the latest data from Firestore.
    // Extract proof photos from real (face-scan) clock records for this day
    const dayRealRecords = records.filter(r => r.timestamp && dateKey(new Date(r.timestamp)) === day.key);
    const inRec  = [...dayRealRecords].filter(r=>r.type==='IN'||r.type==='IN_OVERTIME').sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))[0];
    const outRec = [...dayRealRecords].filter(r=>r.type==='OUT').sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))[0];
    setDayDetailData({
      manualRecords: day.manualRecords,
      approvedRecords: day.approvedRecords,
      otRecord: otRecord ?? day.otRecord,
      regular: day.regular,
      ot: day.ot,
      inProofPhoto: inRec?.proofPhotoUrl || null,
      outProofPhoto: outRec?.proofPhotoUrl || null,
    });

    if (!day.hasShift && day.manualRecords.length === 0) {
      setSelectedDay(day);
      setModalMode('log');
      return;
    }

    setSelectedDay(day);
    setModalMode('detail');
  };

  const compressImage = (base64DataUrl, maxWidth = 800, quality = 0.7) => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = base64DataUrl;
    });
  };

  const handleSubmit = async payload => {
    const token = localStorage.getItem('token');
    // Compress photos before sending to stay under Firestore's 1MB field limit
    if (payload.clockInProofUrl?.startsWith('data:')) {
      payload.clockInProofUrl = await compressImage(payload.clockInProofUrl);
    }
    if (payload.clockOutProofUrl?.startsWith('data:')) {
      payload.clockOutProofUrl = await compressImage(payload.clockOutProofUrl);
    }
    const endpoint = payload.isOT ? '/api/clock/overtime' : (payload.isEdit ? '/api/clock/manual/edit' : '/api/clock/manual');
    const res = await axios.post(`${API_URL}${endpoint}`, payload, {headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
    if (!res.data.success) throw new Error(res.data.message||'Failed');
    setSubmitMsg(payload.isOT ? 'Overtime entry submitted for approval.' : payload.isEdit ? 'Entry updated.' : 'Shift logged — pending admin approval.');
  };

  const dayGradient = d => {
    const t = d.regular + d.ot;
    if (t < 4) return 'linear-gradient(160deg,#2a2a5a,#3a3a7a)';
    if (t < 6) return 'linear-gradient(160deg,#3a4a8a,#5170ff)';
    if (t < 8) return 'linear-gradient(160deg,#5170ff,#a08cff)';
    return 'linear-gradient(160deg,#5170ff,#ff66c4)';
  };

  return (
    <>
      <div style={T.dayGrid}>
        {days.map((day, i) => {
          const phDay = toPhDate(day.date);
          const isFuture = phDay > todayPh && day.key !== todayKey;
          const isToday = day.key === todayKey;
          const isTodayLocked = isToday; // always locked — use clock in/out page for today
          const hasPending = day.manualRecords.some(r=>r.status==='pending_manual');
          // ✅ FIX Bug 1: correct operator precedence — was (!!day.otRecord?.status) === 'pending_ot' → always false
          const hasOtPending = day.otRecord?.status === 'pending_ot';
          const showWorked = day.hasRealShift || day.manualRecords.some(r=>r.status==='approved');
          const showPendingOnly = hasPending && !day.hasRealShift && !day.manualRecords.some(r=>r.status==='approved');

          let boxStyle = {...T.dayBox};
          if (isFuture) boxStyle = {...boxStyle, ...T.dayBoxFuture};
          else if (isTodayLocked) boxStyle = {...boxStyle, background:'#0d0d0d', border:'1.5px solid rgba(129,140,248,.25)', cursor:'default'};
          else if (showWorked) boxStyle = {...boxStyle, background:dayGradient(day), border:'none', cursor:'pointer'};
          else if (showPendingOnly) boxStyle = {...boxStyle, background:'linear-gradient(160deg,#3a2800,#5a3a00)', border:'1.5px solid rgba(245,158,11,.35)', cursor:'pointer'};
          else boxStyle = {...boxStyle, background:'#0f0f0f', border:'1.5px dashed #1f1f1f', cursor:'pointer'};

          if (showWorked && isToday) boxStyle = {...boxStyle, outline:'2px solid rgba(129,140,248,.6)', outlineOffset:'1px'};

          return (
            <div key={day.key} onClick={()=>!isFuture&&!isTodayLocked&&openDay(day)} style={boxStyle}>
              {(hasPending||hasOtPending) && <div style={T.pendingDot}/>}
              {isTodayLocked && (
                <div style={T.lockedMsg}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <div style={T.lockedText}>today</div>
                </div>
              )}
              {showWorked && !isTodayLocked && (
                <div style={T.hoursWrap}>
                  <span style={T.hMain}>{day.regular.toFixed(1)}</span>
                  {day.ot>0&&<><span style={T.hPlus}>+</span><span style={T.hOt}>{day.ot.toFixed(1)}</span></>}
                </div>
              )}
              {showPendingOnly && !isTodayLocked && (
                <div style={T.hoursWrap}>
                  <span style={{...T.hMain, color:'rgba(245,158,11,.85)'}}>{(()=>{const r=day.manualRecords.find(r=>r.status==='pending_manual'); if(!r)return'?'; const [ih,im]=r.clockInTime.split(':').map(Number); const [oh,om]=r.clockOutTime.split(':').map(Number); return ((oh*60+om-(ih*60+im))/60).toFixed(1);})()}</span>
                </div>
              )}
              {!showWorked && !showPendingOnly && !isTodayLocked && !isFuture && (
                <div style={T.plusSign}>+</div>
              )}
              <div style={T.dayBottom}>
                <div style={{...T.dayName, color: showWorked?'rgba(255,255,255,.5)':showPendingOnly?'rgba(245,158,11,.4)':isFuture?'#1a1a1a':isTodayLocked?'#333':'#252525'}}>
                  {DAY_NAMES_SHORT[i]}
                </div>
                <div style={{...T.dayDate, color: showWorked?'rgba(255,255,255,.85)':showPendingOnly?'rgba(245,158,11,.7)':isFuture?'#1a1a1a':isToday?'#818cf8':'#252525'}}>
                  {phDay.getDate()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {submitMsg && (
        <div style={{fontSize:'11px',color:'#40d9a0',background:'rgba(64,217,160,.08)',border:'1px solid rgba(64,217,160,.2)',borderRadius:'7px',padding:'7px 12px',marginTop:'8px'}}>
          {submitMsg}
        </div>
      )}

      <div style={T.weekStrip}>
        <div style={T.wStat}><p style={{...T.wLbl,color:'#404040'}}>Week total</p><p style={{...T.wVal,color:'#fff'}}>{weekTotal.toFixed(1)}h</p></div>
        <div style={T.wStat}><p style={{...T.wLbl,color:'#f59e0b'}}>Overtime</p><p style={{...T.wVal,color:'#f59e0b'}}>{weekOt>0?weekOt.toFixed(1)+'h':'—'}</p></div>
        <div style={{...T.wStat,borderRight:'none'}}><p style={{...T.wLbl,color:'#404040'}}>Days worked</p><p style={{...T.wVal,color:'#fff'}}>{daysWorked} / 7</p></div>
      </div>

      {/* Detail modal */}
      {selectedDay && modalMode==='detail' && dayDetailData && (
        <DayDetailModal
          day={selectedDay}
          dayData={dayDetailData}
          onClose={()=>{ setSelectedDay(null); setModalMode(null); }}
          onLogOT={()=>setModalMode('log_ot')}
          onEditOT={()=>setModalMode('edit_ot')}
          onEditShift={()=>setModalMode('edit')}
        />
      )}

      {/* Log/Edit modal */}
      {selectedDay && (modalMode==='log'||modalMode==='edit'||modalMode==='log_ot'||modalMode==='edit_ot') && (
        <ShiftModal
          mode={modalMode}
          day={selectedDay}
          existingData={modalMode==='edit'?dayDetailData?.manualRecords?.find(r=>r.status==='pending_manual'):modalMode==='edit_ot'?dayDetailData?.otRecord:null}
          occupiedSlots={occupiedSlots}
          isClockedIn={isClockedIn}
          onClose={()=>{ setSelectedDay(null); setModalMode(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

const T = {
  dayGrid:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'5px',marginTop:'10px'},
  dayBox:{borderRadius:'9px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',padding:'0 0 6px',position:'relative',overflow:'hidden',minHeight:'72px',transition:'transform .12s'},
  dayBoxFuture:{opacity:.2,cursor:'default',pointerEvents:'none'},
  pendingDot:{position:'absolute',top:'6px',right:'6px',width:'6px',height:'6px',borderRadius:'50%',background:'#f59e0b'},
  hoursWrap:{position:'absolute',top:'7px',left:0,right:0,display:'flex',alignItems:'baseline',justifyContent:'center',gap:'2px'},
  hMain:{fontSize:'12px',fontWeight:'800',color:'rgba(255,255,255,.95)',letterSpacing:'-.02em'},
  hPlus:{fontSize:'9px',fontWeight:'800',color:'rgba(255,255,255,.3)',margin:'0 1px'},
  hOt:{fontSize:'12px',fontWeight:'800',color:'#f59e0b',letterSpacing:'-.02em'},
  plusSign:{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-60%)',fontSize:'18px',color:'#1e1e1e',fontWeight:'300',lineHeight:1},
  lockedMsg:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3px',padding:'4px'},
  lockedText:{fontSize:'7px',color:'#444',fontWeight:'600',textAlign:'center',lineHeight:1.3},
  dayBottom:{display:'flex',flexDirection:'column',alignItems:'center',gap:'1px'},
  dayName:{fontSize:'8px',fontWeight:'700',letterSpacing:'.03em'},
  dayDate:{fontSize:'11px',fontWeight:'700'},
  weekStrip:{display:'flex',background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:'8px',overflow:'hidden',marginTop:'8px'},
  wStat:{flex:1,padding:'8px 12px',borderRight:'1px solid #1a1a1a'},
  wLbl:{fontSize:'9px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'.07em',margin:'0 0 3px'},
  wVal:{fontSize:'14px',fontWeight:'800',letterSpacing:'-.02em',margin:0},
};

// ── Main Dashboard ────────────────────────────────────────────
function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState('activity');
  const [weekOffset, setWeekOffset] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activityLightbox, setActivityLightbox] = useState(null); // { src, label }
  const userMenuRef = useRef();

  useEffect(() => {
    fetchMyRecords();
    const tick = setInterval(()=>setNow(new Date()),60000);
    const onVisible = ()=>{ if(document.visibilityState==='visible') fetchMyRecords(); };
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',fetchMyRecords);
    return ()=>{ clearInterval(tick); document.removeEventListener('visibilitychange',onVisible); window.removeEventListener('focus',fetchMyRecords); };
  },[]);

  useEffect(()=>{
    const h = e=>{ if(userMenuRef.current&&!userMenuRef.current.contains(e.target)) setShowUserMenu(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  const fetchMyRecords = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/my-records`,{headers:{Authorization:`Bearer ${token}`}});
      setRecords(res.data);
    } catch {} finally { setLoading(false); }
  };

  const today = now.toDateString();
  const todayKeyPh = dateKey(now);
  // Filter by PH date key so OT and all record types are included correctly
  const todayRecords = records.filter(r => r.timestamp && dateKey(new Date(r.timestamp)) === todayKeyPh);
  const hoursToday = (()=>{
    // Use all records for pairing so cross-midnight OT sessions are handled correctly
    const sessions = pairRecords(records).filter(sess => dateKey(sess.inTs) === todayKeyPh);
    const ms = sessions.reduce((acc, sess) => acc + sessionHours(sess, now.getTime()) * 3600000, 0);
    if (ms <= 0) return '—';
    return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`;
  })();

  // todayIn shows the MOST RECENT clock-in of the day (last IN/IN_OVERTIME)
  const todayIn = [...todayRecords.filter(r=>r.type==='IN'||r.type==='IN_OVERTIME')]
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))[0];
  const todayOut = [...todayRecords.filter(r=>r.type==='OUT')]
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))[0];
  const totalHoursAllTime = (()=>{
    const sessions = pairRecords(records);
    const ms = sessions.reduce((acc, sess) => acc + sessionHours(sess, now.getTime()) * 3600000, 0);
    const h=Math.floor(ms/3600000), mn=Math.floor((ms%3600000)/60000);
    return ms>0?`${h}h ${mn}m`:'—';
  })();

  const lastRecord = records[0];
  const isClockedIn = lastRecord?.type==='IN'||lastRecord?.type==='IN_OVERTIME';
  const fmtTime = ts=>ts?new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—';
  const fmtDate = ts=>{
    if(!ts) return '';
    const d=new Date(ts);
    if(d.toDateString()===today) return 'Today';
    const yest=new Date(now); yest.setDate(now.getDate()-1);
    if(d.toDateString()===yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([],{month:'short',day:'numeric'});
  };
  const greeting=(()=>{const h=now.getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';})();
  const mondayDate = addDays(weekStart(phToday()),weekOffset*7);

  const tagStyle = type => {
    if(type==='IN') return s.tagIn;
    if(type==='OUT') return s.tagOut;
    if(type==='OUT_OT') return s.tagOutOt;
    if(type==='IN_OVERTIME'||type==='IN_OT') return s.tagOt;
    if(type==='MANUAL') return s.tagManual;
    return s.tagPending;
  };
  const buildLabelMap = (recs) => {
    const map = {};
    let lastInType = null;
    const sorted = [...recs].filter(r => r.timestamp).sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
    for (const r of sorted) {
      if (r.type === 'IN') lastInType = 'IN';
      else if (r.type === 'IN_OVERTIME') lastInType = 'IN_OVERTIME';
      else if (r.type === 'OUT') {
        map[r.id] = lastInType === 'IN_OVERTIME' ? 'OUT_OT' : 'OUT';
        lastInType = null;
      }
    }
    return map;
  };
  const labelMap = buildLabelMap(records);
  const tagLabel = (type, id) => {
    if (type === 'IN_OVERTIME') return 'IN_OT';
    if (type === 'OUT' && labelMap[id]) return labelMap[id];
    return type;
  };

  return (
    <div style={s.page}>
      {/* Navbar */}
      <nav style={s.navbar}>
        <img src={logoImg} alt="Retina" style={s.navLogo}/>
        <div style={s.navRight}>
          <div ref={userMenuRef} style={{position:'relative'}}>
            <div onClick={()=>setShowUserMenu(v=>!v)} style={{...s.navAvatar,cursor:'pointer'}} title={`${user?.firstName} ${user?.lastName}`}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            {showUserMenu&&(
              <div style={s.userMenu}>
                <div style={s.userMenuHeader}>
                  <p style={s.userMenuName}>{user?.firstName} {user?.lastName}</p>
                  {user?.employeeId&&<p style={s.userMenuId}>{user.employeeId}</p>}
                </div>
                <button onClick={async()=>{setShowUserMenu(false);await logout();navigate('/login');}} style={s.userMenuSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main style={s.main}>
        {/* Welcome */}
        <div style={s.welcomeRow}>
          <div>
            <h1 style={s.greeting}>{greeting}, {user?.firstName}!</h1>
            <p style={s.dateText}>{now.toLocaleDateString([],{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
          </div>
          <span style={isClockedIn?s.badgeIn:s.badgeOut}><span style={s.dot}/>{isClockedIn?'Clocked In':'Clocked Out'}</span>
        </div>

        {/* Stat bar */}
        <div style={s.statBarWrap}>
          <div style={s.statBoxMain}>
            <div style={s.statCell}>
              <p style={s.statCellLabel}>Clocked in</p>
              <p style={s.statCellValue}>{fmtTime(todayIn?.timestamp)}</p>
            </div>
            <div style={{...s.statCell, borderRight:'none'}}>
              <p style={s.statCellLabel}>Hours today</p>
              <p style={s.statCellValue}>{hoursToday}{todayIn&&!todayOut&&<span style={s.liveBadge}>LIVE</span>}</p>
            </div>
          </div>
          <div style={s.statBoxAccent}>
            <p style={s.statCellLabelAccent}>Total hours</p>
            <p style={s.statCellValueAccent}>{totalHoursAllTime}</p>
            <p style={s.statSubAccent}>all time</p>
          </div>
        </div>

        {/* Quick Actions */}
        <section style={{flexShrink:0}}>
          <h2 style={s.sectionTitle}>Quick Actions</h2>
          <div style={s.actionsRow}>
            <Link to="/clock" style={{...s.actionCard,...(isClockedIn?s.actionPrimaryOut:s.actionPrimary)}}>
              <div style={s.actionIconWrap}>
                {isClockedIn
                  ?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>
                  :<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                }
              </div>
              <div>
                <p style={s.actionTitle}>{isClockedIn?'Clock Out':'Clock In'}</p>
                <p style={s.actionSub}>{isClockedIn?`Since ${fmtTime(lastRecord?.timestamp)}`:'Verify with face recognition'}</p>
              </div>
            </Link>
            <Link to="/face-enrollment" style={{...s.actionCard,...s.actionSecondary}}>
              <div style={{...s.actionIconWrap,background:'rgba(255,255,255,0.06)'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div>
                <p style={{...s.actionTitle,color:'#a3a3a3'}}>Update Face Data</p>
                <p style={s.actionSub}>Re-enroll your face</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Toggle section */}
        <section style={s.activitySection}>
          <div style={s.tabRow}>
            <div style={s.segmented}>
              <button onClick={()=>setActiveTab('activity')} style={{...s.segBtn,...(activeTab==='activity'?s.segBtnOn:s.segBtnOff)}}>Recent Activity</button>
              <button onClick={()=>setActiveTab('timesheet')} style={{...s.segBtn,...(activeTab==='timesheet'?s.segBtnOn:s.segBtnOff)}}>Timesheet</button>
            </div>
            {activeTab==='timesheet'&&(
              <div style={s.weekNav}>
                <button onClick={()=>setWeekOffset(o=>o-1)} style={s.navBtn}>‹</button>
                <span style={s.weekLabel}>{window.innerWidth<500?fmtWeekShort(mondayDate):fmtWeekRange(mondayDate)}</span>
                <button onClick={()=>setWeekOffset(o=>Math.min(0,o+1))} disabled={weekOffset>=0} style={{...s.navBtn,opacity:weekOffset>=0?.3:1,cursor:weekOffset>=0?'default':'pointer'}}>›</button>
              </div>
            )}
          </div>

          {activeTab==='activity'?(
            <div style={s.activityFeed}>
              {activityLightbox && <PhotoLightbox src={activityLightbox.src} faceScan={true} onClose={()=>setActivityLightbox(null)}/>}
              {loading ? (
                <p style={s.emptyMsg}>Loading records...</p>
              ) : records.length===0 ? (
                <p style={s.emptyMsg}>No records yet. Clock in to get started.</p>
              ) : (()=>{
                const clockSessions = pairRecords(records).slice(0, 20);
                const manualRecs = records
                  .filter(r => r.type==='MANUAL' || r.type==='OT_MANUAL')
                  .sort((a,b) => new Date(b.timestamp||0) - new Date(a.timestamp||0))
                  .slice(0, 5);

                // Sort by session start time, most recent first (invisible — no duration ordering)
                const sorted = [...clockSessions].sort((a,b) => b.inTs.getTime() - a.inTs.getTime());

                const dotColor = (sess) => {
                  const inRej  = IS_REJECTED(sess.inRec.status);
                  const outRej = sess.outRec && IS_REJECTED(sess.outRec.status);
                  if (inRej || outRej) return '#f87171';
                  if (!sess.outRec && COUNTS_STATUS(sess.inRec.status)) return '#86efac';
                  if (!COUNTS_STATUS(sess.inRec.status)) return '#f59e0b';
                  if (sess.outRec && !COUNTS_STATUS(sess.outRec.status)) return '#f59e0b';
                  return '#40d9a0';
                };

                return (
                  <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
                    <div style={s.cardList}>
                      {sorted.map(sess => {
                        const inRej   = IS_REJECTED(sess.inRec.status);
                        const outRej  = sess.outRec && IS_REJECTED(sess.outRec.status);
                        const disq    = inRej || outRej;
                        const isLive  = !sess.outRec && !inRej;
                        const isCurrent = !sess.outRec;
                        const durH    = sessionHours(sess, now.getTime());
                        const durLabel = durH > 0 ? `${Math.floor(durH)}h ${Math.floor((durH%1)*60)}m` : null;
                        const dc      = dotColor(sess);
                        const typeColor = sess.isOt ? '#f59e0b' : '#40d9a0';
                        return (
                          <div key={sess.inRec.id} style={{
                            display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                            background: isCurrent ? 'rgba(245,158,11,0.05)' : '#111',
                            border: isCurrent ? '1px solid rgba(245,158,11,0.28)' : disq ? '1px solid rgba(239,68,68,0.12)' : '1px solid #1a1a1a',
                            borderRadius:9,
                            boxShadow: isCurrent ? '0 0 14px rgba(245,158,11,0.07)' : 'none',
                            opacity: disq ? 0.7 : 1, flexShrink:0,
                          }}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:dc,flexShrink:0,
                              boxShadow: isCurrent||isLive ? `0 0 7px ${dc}` : 'none'}}/>
                            <span style={{fontSize:10,fontWeight:800,color:typeColor,letterSpacing:'0.05em',flexShrink:0,minWidth:24}}>
                              {sess.isOt ? 'OT' : 'REG'}
                            </span>
                            <div style={{flex:1,display:'flex',alignItems:'center',gap:5,minWidth:0}}>
                              <span style={{fontSize:13,fontWeight:700,letterSpacing:'-0.02em',
                                color: disq ? '#f87171' : '#e5e5e5',
                                textDecoration: disq ? 'line-through' : 'none',whiteSpace:'nowrap'}}>
                                {fmtTime(sess.inRec.timestamp)}
                              </span>
                              <span style={{fontSize:9,color:'#2a2a2a',fontWeight:700,flexShrink:0}}>→</span>
                              {sess.outRec
                                ? <span style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.3)',letterSpacing:'-0.02em',whiteSpace:'nowrap'}}>{fmtTime(sess.outRec.timestamp)}</span>
                                : isLive ? <span style={s.liveBadge}>LIVE</span>
                                : <span style={{fontSize:11,color:'#333'}}>—</span>}
                            </div>
                            <div style={{textAlign:'right',flexShrink:0}}>
                              {disq
                                ? <div style={{fontSize:11,fontWeight:700,color:'#f87171'}}>0h</div>
                                : durLabel
                                  ? <div style={{fontSize:14,fontWeight:800,color:typeColor,letterSpacing:'-0.03em'}}>{durLabel}</div>
                                  : <div style={{fontSize:10,color:'#555',fontStyle:'italic'}}>—</div>}
                              <div style={{fontSize:9,color:'#383838',marginTop:1}}>{fmtDate(sess.inRec.timestamp)}</div>
                            </div>
                            {(sess.inRec.proofPhotoUrl || (sess.outRec && sess.outRec.proofPhotoUrl)) && (
                              <div style={{display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
                                {sess.inRec.proofPhotoUrl && (
                                  <button onClick={()=>setActivityLightbox({src:sess.inRec.proofPhotoUrl,label:'Clock In'})} style={{background:'rgba(64,217,160,0.08)',border:'1px solid rgba(64,217,160,0.2)',borderRadius:5,padding:'3px 7px',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#40d9a0" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span style={{fontSize:8,fontWeight:700,color:'#40d9a0',letterSpacing:'0.04em'}}>IN</span>
                                  </button>
                                )}
                                {sess.outRec?.proofPhotoUrl && (
                                  <button onClick={()=>setActivityLightbox({src:sess.outRec.proofPhotoUrl,label:'Clock Out'})} style={{background:'rgba(160,140,255,0.08)',border:'1px solid rgba(160,140,255,0.2)',borderRadius:5,padding:'3px 7px',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a08cff" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span style={{fontSize:8,fontWeight:700,color:'#a08cff',letterSpacing:'0.04em'}}>OUT</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {manualRecs.map(r => {
                        const dc = r.status==='approved' ? '#40d9a0' : '#f59e0b';
                        const typeColor = r.type==='OT_MANUAL' ? '#f59e0b' : '#818cf8';
                        return (
                          <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,
                            padding:'10px 12px',background:'#111',border:'1px solid #1a1a1a',borderRadius:9,flexShrink:0}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:dc,flexShrink:0}}/>
                            <span style={{fontSize:10,fontWeight:800,color:typeColor,letterSpacing:'0.05em',flexShrink:0}}>
                              {r.type==='OT_MANUAL' ? 'OT MNL' : 'MNL'}
                            </span>
                            <span style={{flex:1,fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.35)',letterSpacing:'-0.02em'}}>
                              {r.clockInTime ? `${r.clockInTime} → ${r.clockOutTime}` : '—'}
                            </span>
                            <div style={{textAlign:'right',flexShrink:0}}>
                              <div style={{fontSize:9,color:'#383838'}}>{r.manualDate||fmtDate(r.timestamp)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={s.legend}>
                      {[['#86efac','Live'],['#40d9a0','Matched'],['#f59e0b','Pending'],['#f87171','Rejected']].map(([color,label]) => (
                        <div key={label} style={{display:'flex',alignItems:'center',gap:4}}>
                          <div style={{width:6,height:6,borderRadius:'50%',background:color}}/>
                          <span style={{fontSize:9,color:'#3a3a3a',fontWeight:600}}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ):(
            <div style={s.timesheetWrap}>
              <TimesheetPanel records={records} weekOffset={weekOffset} isClockedIn={isClockedIn}/>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const s = {
  page:{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',background:'#0a0a0a'},
  navbar:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',height:'48px',background:'#0d0d0d',borderBottom:'1px solid #1a1a1a',flexShrink:0,zIndex:100},
  navLogo:{height:'22px',objectFit:'contain',filter:'brightness(0) invert(1)'},
  navRight:{display:'flex',alignItems:'center',gap:'14px'},
  navAvatar:{width:'28px',height:'28px',borderRadius:'7px',background:'linear-gradient(135deg,#5170ff 0%,#ff66c4 100%)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:'700',flexShrink:0,userSelect:'none'},
  userMenu:{position:'absolute',top:'36px',right:0,background:'#111',border:'1px solid #222',borderRadius:'10px',minWidth:'180px',zIndex:200,overflow:'hidden'},
  userMenuHeader:{padding:'12px 14px',borderBottom:'1px solid #1a1a1a'},
  userMenuName:{fontSize:'13px',fontWeight:'600',color:'#e5e5e5',margin:'0 0 2px'},
  userMenuId:{fontSize:'10px',color:'#404040',fontFamily:'monospace',margin:0},
  userMenuSignOut:{display:'block',width:'100%',padding:'10px 14px',background:'transparent',border:'none',textAlign:'left',fontSize:'12px',color:'#f87171',fontWeight:'600',cursor:'pointer'},
  main:{flex:1,padding:'16px 24px 14px',maxWidth:'1000px',width:'100%',margin:'0 auto',display:'flex',flexDirection:'column',gap:'12px',overflow:'hidden',minHeight:0,boxSizing:'border-box'},
  welcomeRow:{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px',flexShrink:0},
  greeting:{fontSize:'20px',fontWeight:'700',color:'#ffffff',letterSpacing:'-0.03em',margin:'0 0 2px'},
  dateText:{color:'#4a4a4a',fontSize:'12px',margin:0},
  badgeIn:{display:'inline-flex',alignItems:'center',gap:'6px',background:'rgba(34,197,94,0.1)',color:'#86efac',padding:'6px 14px',borderRadius:'100px',fontSize:'12px',fontWeight:'600',border:'1px solid rgba(34,197,94,0.2)'},
  badgeOut:{display:'inline-flex',alignItems:'center',gap:'6px',background:'rgba(239,68,68,0.1)',color:'#f87171',padding:'6px 14px',borderRadius:'100px',fontSize:'12px',fontWeight:'600',border:'1px solid rgba(239,68,68,0.2)'},
  dot:{width:'6px',height:'6px',borderRadius:'50%',background:'currentColor',flexShrink:0},
  statBarWrap:{display:'flex',gap:'10px',flexShrink:0},
  statBoxMain:{flex:2,background:'#111111',border:'1px solid #1a1a1a',borderRadius:'12px',display:'flex',overflow:'hidden'},
  statCell:{flex:1,padding:'10px 16px',borderRight:'1px solid #1a1a1a'},
  statCellLabel:{fontSize:'10px',fontWeight:'700',color:'#404040',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 4px'},
  statCellValue:{fontSize:'18px',fontWeight:'800',color:'#ffffff',letterSpacing:'-0.03em',margin:0,display:'flex',alignItems:'center',gap:'7px'},
  statBoxAccent:{flex:1,padding:'10px 18px',background:'linear-gradient(135deg,rgba(81,112,255,0.12),rgba(64,217,160,0.06))',border:'1px solid rgba(81,112,255,0.2)',borderRadius:'12px'},
  statCellLabelAccent:{fontSize:'10px',fontWeight:'700',color:'#5170ff',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 4px'},
  statCellValueAccent:{fontSize:'22px',fontWeight:'800',color:'#40d9a0',letterSpacing:'-0.04em',margin:0},
  statSubAccent:{fontSize:'10px',color:'#1d5a3a',marginTop:'2px'},
  liveBadge:{fontSize:'9px',fontWeight:'700',color:'#86efac',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:'4px',padding:'1px 5px',letterSpacing:'0.04em'},
  sectionTitle:{fontSize:'11px',fontWeight:'700',color:'#404040',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 8px'},
  actionsRow:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'10px'},
  actionCard:{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderRadius:'12px',textDecoration:'none',cursor:'pointer',border:'none'},
  actionPrimary:{background:'linear-gradient(135deg,#5170ff 0%,#ff66c4 100%)',boxShadow:'0 4px 20px rgba(81,112,255,0.22)'},
  actionPrimaryOut:{background:'linear-gradient(135deg,#a08cff 0%,#ff66c4 100%)',boxShadow:'0 4px 20px rgba(160,140,255,0.22)'},
  actionSecondary:{background:'#111111',border:'1px solid #1a1a1a'},
  actionIconWrap:{width:'34px',height:'34px',borderRadius:'9px',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0},
  actionTitle:{fontSize:'13px',fontWeight:'700',color:'#ffffff',margin:'0 0 2px'},
  actionSub:{fontSize:'11px',color:'rgba(255,255,255,0.3)',margin:0},
  activitySection:{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'},
  tabRow:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px',flexShrink:0,gap:'10px',flexWrap:'wrap'},
  segmented:{display:'flex',background:'#1a1a1a',borderRadius:'8px',padding:'3px',gap:'2px'},
  segBtn:{padding:'4px 14px',borderRadius:'6px',fontSize:'11px',fontWeight:'700',cursor:'pointer',border:'none',transition:'all .15s'},
  segBtnOn:{background:'#fff',color:'#000'},
  segBtnOff:{background:'transparent',color:'#404040'},
  weekNav:{display:'flex',alignItems:'center',gap:'8px'},
  navBtn:{width:'24px',height:'24px',borderRadius:'5px',background:'#1a1a1a',border:'none',color:'#555',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px'},
  weekLabel:{fontSize:'11px',color:'#555',fontWeight:'600',whiteSpace:'nowrap'},
  activityFeed:{display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden',borderRadius:'12px',border:'1px solid #1a1a1a',background:'#0d0d0d'},
  cardList:{flex:1,overflowY:'auto',padding:'8px',display:'flex',flexDirection:'column',gap:'6px',maxHeight:'calc(5 * 56px + 4 * 6px + 16px)',WebkitOverflowScrolling:'touch',scrollbarWidth:'none'},
  legend:{display:'flex',flexWrap:'wrap',gap:'8px 14px',padding:'8px 12px',borderTop:'1px solid #141414',flexShrink:0},
  tableCard:{background:'#111111',border:'1px solid #1a1a1a',borderRadius:'12px',overflow:'auto',flex:1,minHeight:0},
  timesheetWrap:{flex:1,minHeight:0,overflow:'auto'},
  emptyMsg:{textAlign:'center',padding:'32px 20px',color:'#333',fontSize:'13px',margin:0},
  table:{width:'100%',borderCollapse:'collapse'},
  th:{padding:'10px 16px',textAlign:'left',fontSize:'10px',fontWeight:'700',color:'#333',textTransform:'uppercase',letterSpacing:'0.08em',background:'#0d0d0d',borderBottom:'1px solid #1a1a1a',position:'sticky',top:0},
  trBorder:{borderBottom:'1px solid #141414'},
  td:{padding:'10px 16px',fontSize:'13px',color:'#e5e5e5'},
  tdMuted:{padding:'10px 16px',fontSize:'12px',color:'#4a4a4a'},
  tagIn:{background:'rgba(34,197,94,0.1)',color:'#86efac',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(34,197,94,0.2)'},
  tagOut:{background:'rgba(239,68,68,0.1)',color:'#f87171',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(239,68,68,0.2)'},
  tagOutOt:{background:'rgba(251,113,133,0.08)',color:'#fb7185',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(251,113,133,0.25)'},
  tagOt:{background:'rgba(245,158,11,0.1)',color:'#f59e0b',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(245,158,11,0.2)'},
  tagManual:{background:'rgba(129,140,248,0.1)',color:'#818cf8',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(129,140,248,0.2)'},
  tagMatched:{background:'rgba(64,217,160,0.1)',color:'#40d9a0',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(64,217,160,0.2)'},
  tagApproved:{background:'rgba(160,140,255,0.1)',color:'#a08cff',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(160,140,255,0.2)'},
  tagPending:{background:'rgba(245,158,11,0.1)',color:'#f59e0b',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(245,158,11,0.2)'},
  tagRejected:{background:'rgba(239,68,68,0.1)',color:'#f87171',padding:'2px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:'700',letterSpacing:'0.05em',border:'1px solid rgba(239,68,68,0.2)'},
};

export default DashboardPage;