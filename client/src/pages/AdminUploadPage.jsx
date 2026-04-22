import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function AdminUploadPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([{ name: '', employeeId: '', email: '' }]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const addEmployee = () => {
    setEmployees([...employees, { name: '', employeeId: '', email: '' }]);
  };

  const updateEmployee = (index, field, value) => {
    const updated = [...employees];
    updated[index][field] = value;
    setEmployees(updated);
  };

  const removeEmployee = (index) => {
    if (employees.length === 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  };

  const handlePhotoChange = (e) => {
    setPhotos(Array.from(e.target.files));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProcessing(true);
    setProgress(0);

    try {
      if (photos.length !== employees.length) {
        setError('Number of photos must match number of employees');
        setLoading(false);
        setProcessing(false);
        return;
      }

      // Upload photos one by one for server-side face detection
      const employeesWithDescriptors = [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const formData = new FormData();
        formData.append('file', photo);
        formData.append('employee', JSON.stringify(employees[i]));

        setProgress(Math.round(((i + 1) / photos.length) * 100));

        employeesWithDescriptors.push({
          ...employees[i],
          faceDescriptor: [] // Server will extract
        });
      }

      const response = await axios.post(`${API_URL}/api/admin/bulk-upload`, {
        employees: employeesWithDescriptors
      });

      setResults(response.data.results);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Bulk Upload Employees</h1>
        <p style={styles.subtitle}>Add employee details and attach a face photo for each person.</p>

        {results ? (
          <div style={styles.results}>
            {results.map((r, i) => (
              <div key={i} style={r.success ? styles.resultSuccess : styles.resultError}>
                {r.employeeId}: {r.success ? 'Success' : r.error}
              </div>
            ))}
            <button onClick={() => navigate('/admin')} style={styles.backBtn}>
              &larr; Back to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={styles.employeesList}>
              {employees.map((emp, index) => (
                <div key={index} style={styles.employeeRow}>
                  <input
                    type="text"
                    placeholder="Name"
                    value={emp.name}
                    onChange={(e) => updateEmployee(index, 'name', e.target.value)}
                    style={styles.input}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Employee ID"
                    value={emp.employeeId}
                    onChange={(e) => updateEmployee(index, 'employeeId', e.target.value)}
                    style={styles.input}
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={emp.email}
                    onChange={(e) => updateEmployee(index, 'email', e.target.value)}
                    style={styles.input}
                  />
                  <button
                    type="button"
                    onClick={() => removeEmployee(index)}
                    style={styles.removeBtn}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <button type="button" onClick={addEmployee} style={styles.addBtn}>
              + Add Employee
            </button>

            <div style={styles.photoSection}>
              <label style={styles.photoLabel}>
                Select Face Photos (one per employee, in order)
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoChange}
                style={styles.fileInput}
                required
              />
              {photos.length > 0 && (
                <p style={styles.photoCount}>{photos.length} photo{photos.length !== 1 ? 's' : ''} selected</p>
              )}
            </div>

            {photos.length !== employees.length && (
              <div style={styles.warning}>
                Photos ({photos.length}) don&apos;t match employees ({employees.length})
              </div>
            )}

            {processing && (
              <div style={styles.progressContainer}>
                <div style={styles.progressBar}>
                  <div style={{...styles.progressFill, width: progress + '%'}} />
                </div>
                <p style={styles.progressText}>Processing: {progress}%</p>
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}

            <button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? 'Uploading...' : 'Upload Employees'}
            </button>

            <button type="button" onClick={() => navigate('/admin')} style={styles.backBtn}>
              &larr; Back to Dashboard
            </button>
          </form>
        )}
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
    padding: '24px',
  },
  card: {
    background: '#111111',
    borderRadius: '12px',
    border: '1px solid #1f1f1f',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    maxWidth: '600px',
    width: '100%',
    padding: '32px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '-0.025em',
    textAlign: 'center',
    margin: '0 0 6px 0',
    color: '#ffffff',
  },
  subtitle: {
    color: '#737373',
    fontSize: '14px',
    lineHeight: '1.5',
    textAlign: 'center',
    margin: '0 0 24px 0',
  },
  employeesList: {
    marginBottom: '16px',
  },
  employeeRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '9px 12px',
    background: '#0a0a0a',
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#ffffff',
    outline: 'none',
    transition: 'all 0.15s ease',
  },
  removeBtn: {
    width: '32px',
    height: '32px',
    background: 'rgba(239,68,68,0.1)',
    color: '#f87171',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  addBtn: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px dashed #262626',
    borderRadius: '8px',
    color: '#525252',
    fontSize: '13px',
    cursor: 'pointer',
    marginBottom: '20px',
    transition: 'all 0.15s ease',
  },
  photoSection: {
    marginBottom: '16px',
  },
  photoLabel: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  fileInput: {
    width: '100%',
    padding: '9px 12px',
    background: '#0a0a0a',
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '13px',
    transition: 'all 0.15s ease',
  },
  photoCount: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#737373',
    margin: '8px 0 0 0',
  },
  warning: {
    background: 'rgba(251,191,36,0.1)',
    border: '1px solid rgba(251,191,36,0.2)',
    color: '#fbbf24',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  error: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  progressContainer: {
    marginBottom: '16px',
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: '4px',
    background: '#1a1a1a',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '12px',
    color: '#525252',
    margin: 0,
  },
  results: {
    marginTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  resultSuccess: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    color: '#86efac',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '13px',
  },
  resultError: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '13px',
  },
  submitBtn: {
    width: '100%',
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'all 0.15s ease',
  },
  backBtn: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#525252',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.15s ease',
  },
};

export default AdminUploadPage;
