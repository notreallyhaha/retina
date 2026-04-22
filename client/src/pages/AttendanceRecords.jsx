import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function AttendanceRecords() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ employeeId: '', startDate: '', endDate: '' });

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.employeeId) params.append('employeeId', filters.employeeId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const response = await axios.get(`${API_URL}/api/records?${params}`);
      setRecords(response.data);
    } catch (error) {
      console.error('Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleApplyFilters = () => { fetchRecords(); };
  const handleClearFilters = () => {
    setFilters({ employeeId: '', startDate: '', endDate: '' });
    setTimeout(() => fetchRecords(), 0);
  };

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <header style={styles.header}>
            <h1 style={styles.title}>Attendance Records</h1>
            <p style={styles.subtitle}>Filter and view all clock in/out records</p>
          </header>

          <div style={styles.filters}>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Employee ID</label>
              <input
                type="text" name="employeeId" placeholder="e.g. EMP-001"
                value={filters.employeeId} onChange={handleFilterChange} style={styles.input}
              />
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Start date</label>
              <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} style={styles.input} />
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>End date</label>
              <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} style={styles.input} />
            </div>
            <div style={styles.filterActions}>
              <button onClick={handleApplyFilters} style={styles.filterBtn}>Apply</button>
              <button onClick={handleClearFilters} style={styles.clearBtn}>Clear</button>
            </div>
          </div>

          {loading ? (
            <div style={styles.loading}>Loading records...</div>
          ) : records.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyIcon}>📋</p>
              <p>No records found</p>
            </div>
          ) : (
            <div style={styles.tableContainer}>
              <p style={styles.resultCount}>{records.length} record{records.length !== 1 ? 's' : ''}</p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Employee</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Timestamp</th>
                    <th style={styles.th}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(record => (
                    <tr key={record.id}>
                      <td style={styles.td}>
                        <span style={styles.mono}>#{record.id.slice(0, 8)}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.mono}>{record.employeeId}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={record.type === 'IN' ? styles.badgeIn : styles.badgeOut}>
                          {record.type}
                        </span>
                      </td>
                      <td style={styles.tdSecondary}>
                        {record.timestamp ? new Date(record.timestamp).toLocaleString() : '—'}
                      </td>
                      <td style={styles.td}>
                        {record.location ? (
                          <a
                            href={`https://maps.google.com/?q=${record.location.latitude},${record.location.longitude}`}
                            target="_blank" rel="noopener noreferrer"
                            style={styles.locationLink}
                          >
                            View on map ↗
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <button onClick={() => navigate('/admin')} style={styles.backBtn}>
          ← Back to dashboard
        </button>
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
    padding: '24px'
  },
  wrapper: {
    maxWidth: '920px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  card: {
    background: '#111111',
    borderRadius: '12px',
    padding: '40px',
    border: '1px solid #1f1f1f',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)'
  },
  header: {
    marginBottom: '32px',
    textAlign: 'center'
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '-0.025em',
    marginBottom: '8px',
    color: '#ffffff'
  },
  subtitle: {
    color: '#737373',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    padding: '16px',
    background: '#0a0a0a',
    borderRadius: '10px',
    border: '1px solid #1f1f1f'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1',
    minWidth: '140px'
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#525252',
    letterSpacing: '0.02em',
    textTransform: 'uppercase'
  },
  input: {
    padding: '9px 12px',
    background: '#111111',
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#ffffff',
    outline: 'none'
  },
  filterActions: {
    display: 'flex',
    gap: '8px',
    paddingBottom: '2px'
  },
  filterBtn: {
    padding: '9px 18px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
    transition: 'opacity 0.15s ease, transform 0.15s ease'
  },
  clearBtn: {
    padding: '9px 18px',
    background: 'transparent',
    color: '#737373',
    border: '1px solid #262626',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.15s ease'
  },
  loading: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#525252',
    fontSize: '14px'
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#525252',
    fontSize: '14px'
  },
  emptyIcon: {
    fontSize: '32px',
    marginBottom: '12px',
    display: 'block'
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '10px',
    border: '1px solid #1f1f1f'
  },
  resultCount: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#525252',
    padding: '10px 16px',
    background: '#0a0a0a',
    borderBottom: '1px solid #1f1f1f',
    letterSpacing: '0.02em'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    background: '#0a0a0a',
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#525252',
    borderBottom: '1px solid #1f1f1f',
    letterSpacing: '0.02em',
    textTransform: 'uppercase'
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #1f1f1f',
    fontSize: '14px',
    color: '#ffffff'
  },
  tdSecondary: {
    padding: '12px 16px',
    borderBottom: '1px solid #1f1f1f',
    fontSize: '13px',
    color: '#737373'
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#a3a3a3'
  },
  badgeIn: {
    background: 'rgba(34, 197, 94, 0.1)',
    color: '#86efac',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    border: '1px solid rgba(34, 197, 94, 0.2)'
  },
  badgeOut: {
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    border: '1px solid rgba(239, 68, 68, 0.2)'
  },
  locationLink: {
    color: '#5170ff',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'opacity 0.15s ease'
  },
  backBtn: {
    display: 'block',
    width: '100%',
    padding: '10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#525252',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'color 0.15s ease'
  }
};

export default AttendanceRecords;
