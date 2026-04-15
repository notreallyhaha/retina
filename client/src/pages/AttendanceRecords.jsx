import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function AttendanceRecords() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    employeeId: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchRecords();
  }, []);

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

  const handleApplyFilters = () => {
    fetchRecords();
  };

  const handleClearFilters = () => {
    setFilters({ employeeId: '', startDate: '', endDate: '' });
    setTimeout(() => fetchRecords(), 0);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Attendance Records</h1>

        <div style={styles.filters}>
          <input
            type="text"
            name="employeeId"
            placeholder="Employee ID"
            value={filters.employeeId}
            onChange={handleFilterChange}
            style={styles.input}
          />
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
            style={styles.input}
          />
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
            style={styles.input}
          />
          <button onClick={handleApplyFilters} style={styles.filterBtn}>Apply</button>
          <button onClick={handleClearFilters} style={styles.clearBtn}>Clear</button>
        </div>

        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : records.length === 0 ? (
          <div style={styles.empty}>No records found</div>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Employee ID</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Timestamp</th>
                  <th style={styles.th}>Location</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
                  <tr key={record.id}>
                    <td style={styles.td}>#{record.id.slice(0, 8)}</td>
                    <td style={styles.td}>{record.employeeId}</td>
                    <td style={styles.td}>
                      <span style={record.type === 'IN' ? styles.badgeIn : styles.badgeOut}>
                        {record.type}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {record.timestamp ? new Date(record.timestamp).toLocaleString() : '-'}
                    </td>
                    <td style={styles.td}>
                      {record.location ? (
                        <a
                          href={`https://maps.google.com/?q=${record.location.latitude},${record.location.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.locationLink}
                        >
                          View
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={() => navigate('/admin')} style={styles.backBtn}>
          Back to Dashboard
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
    background: '#0a0a0a',
    padding: '20px'
  },
  card: {
    background: '#141414',
    borderRadius: '12px',
    padding: '40px',
    border: '1px solid #262626',
    maxWidth: '900px',
    width: '100%'
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: '24px',
    color: '#ffffff'
  },
  filters: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap'
  },
  input: {
    padding: '10px 12px',
    background: '#0a0a0a',
    border: '1px solid #262626',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#ffffff',
    outline: 'none'
  },
  filterBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  clearBtn: {
    padding: '10px 20px',
    background: '#0a0a0a',
    color: '#a3a3a3',
    border: '1px solid #262626',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  loading: {
    textAlign: 'center',
    padding: '32px',
    color: '#737373'
  },
  empty: {
    textAlign: 'center',
    padding: '32px',
    color: '#525252'
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '24px',
    border: '1px solid #262626',
    borderRadius: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    background: '#0a0a0a',
    padding: '14px 16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '500',
    color: '#737373',
    borderBottom: '1px solid #262626'
  },
  td: {
    padding: '14px 16px',
    borderBottom: '1px solid #262626',
    fontSize: '14px',
    color: '#ffffff'
  },
  badgeIn: {
    background: '#1a2a1a',
    color: '#86efac',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500'
  },
  badgeOut: {
    background: '#2a1a1a',
    color: '#f87171',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500'
  },
  locationLink: {
    color: '#ffffff',
    textDecoration: 'none',
    borderBottom: '1px solid #404040'
  },
  backBtn: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#737373',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default AttendanceRecords;
