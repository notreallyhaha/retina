import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function AdminDashboard() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/employees`);
      setEmployees(response.data);
    } catch (error) {
      console.error('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    try {
      await axios.delete(`${API_URL}/api/employees/${id}`);
      fetchEmployees();
    } catch (error) {
      alert('Failed to delete employee');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Admin Dashboard</h1>

        <div style={styles.buttonGroup}>
          <Link to="/admin/upload" style={styles.button}>Bulk Upload</Link>
          <Link to="/admin/records" style={styles.button}>View Records</Link>
        </div>

        <h2 style={styles.sectionTitle}>Employees ({employees.length})</h2>

        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : employees.length === 0 ? (
          <div style={styles.empty}>No employees registered yet</div>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Employee ID</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <td style={styles.td}>{emp.employeeId}</td>
                    <td style={styles.td}>{emp.name}</td>
                    <td style={styles.td}>{emp.email || '-'}</td>
                    <td style={styles.td}>
                      <button onClick={() => handleDelete(emp.id)} style={styles.deleteBtn}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={() => navigate('/')} style={styles.backBtn}>Back to Home</button>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: '20px' },
  card: { background: '#141414', borderRadius: '12px', padding: '40px', border: '1px solid #262626', maxWidth: '800px', width: '100%' },
  title: { fontSize: '20px', fontWeight: '600', textAlign: 'center', marginBottom: '24px', color: '#ffffff' },
  buttonGroup: { display: 'flex', gap: '12px', marginBottom: '24px', justifyContent: 'center' },
  button: { padding: '12px 20px', background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)', color: '#ffffff', textDecoration: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500' },
  sectionTitle: { fontSize: '15px', fontWeight: '500', marginBottom: '16px', color: '#a3a3a3' },
  loading: { textAlign: 'center', padding: '32px', color: '#737373' },
  empty: { textAlign: 'center', padding: '32px', color: '#525252' },
  tableContainer: { overflowX: 'auto', marginBottom: '24px', border: '1px solid #262626', borderRadius: '8px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { background: '#0a0a0a', padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '500', color: '#737373', borderBottom: '1px solid #262626' },
  td: { padding: '14px 16px', borderBottom: '1px solid #262626', fontSize: '14px', color: '#ffffff' },
  deleteBtn: { padding: '6px 12px', background: '#2a1a1a', color: '#f87171', border: '1px solid #451a1a', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  backBtn: { display: 'block', width: '100%', padding: '12px', background: 'transparent', border: 'none', borderRadius: '8px', color: '#737373', cursor: 'pointer', fontSize: '14px' }
};

export default AdminDashboard;
