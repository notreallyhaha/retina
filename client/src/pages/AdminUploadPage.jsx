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

        {results ? (
          <div style={styles.results}>
            <h2 style={styles.resultsTitle}>Results</h2>
            {results.map((r, i) => (
              <div key={i} style={r.success ? styles.resultSuccess : styles.resultError}>
                {r.employeeId}: {r.success ? 'Success' : r.error}
              </div>
            ))}
            <button onClick={() => navigate('/admin')} style={styles.backBtn}>
              Back to Dashboard
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
                    ✕
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
                <p style={styles.photoCount}>{photos.length} photos selected</p>
              )}
            </div>

            {photos.length !== employees.length && (
              <div style={styles.warning}>
                Photos ({photos.length}) don't match employees ({employees.length})
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
              Back to Dashboard
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: '20px' },
  card: { background: '#141414', borderRadius: '12px', padding: '40px', border: '1px solid #262626', maxWidth: '600px', width: '100%' },
  title: { fontSize: '20px', fontWeight: '600', textAlign: 'center', marginBottom: '24px', color: '#ffffff' },
  employeesList: { marginBottom: '16px' },
  employeeRow: { display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' },
  input: { flex: 1, padding: '10px 12px', background: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', fontSize: '14px', color: '#ffffff', outline: 'none' },
  removeBtn: { padding: '10px 12px', background: '#2a1a1a', color: '#f87171', border: '1px solid #451a1a', borderRadius: '8px', cursor: 'pointer' },
  addBtn: { width: '100%', padding: '12px', background: '#0a0a0a', border: '1px dashed #404040', borderRadius: '8px', color: '#737373', cursor: 'pointer', marginBottom: '20px', fontSize: '14px' },
  photoSection: { marginBottom: '16px' },
  photoLabel: { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#a3a3a3' },
  fileInput: { width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#ffffff', fontSize: '14px' },
  photoCount: { marginTop: '8px', fontSize: '13px', color: '#737373' },
  warning: { background: '#2a2614', color: '#fbbf24', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  error: { background: '#2a1a1a', color: '#f87171', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  progressContainer: { marginBottom: '16px', textAlign: 'center' },
  progressBar: { width: '100%', height: '6px', background: '#0a0a0a', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px', border: '1px solid #262626' },
  progressFill: { height: '100%', background: '#ffffff', transition: 'width 0.3s' },
  progressText: { fontSize: '13px', color: '#737373' },
  results: { marginBottom: '20px' },
  resultsTitle: { fontSize: '16px', fontWeight: '500', marginBottom: '16px', color: '#ffffff' },
  resultSuccess: { background: '#1a2a1a', color: '#86efac', padding: '12px', borderRadius: '8px', marginBottom: '8px', fontSize: '14px' },
  resultError: { background: '#2a1a1a', color: '#f87171', padding: '12px', borderRadius: '8px', marginBottom: '8px', fontSize: '14px' },
  submitBtn: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #5170ff 0%, #ff66c4 100%)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', marginBottom: '12px' },
  backBtn: { display: 'block', width: '100%', padding: '12px', background: 'transparent', border: 'none', borderRadius: '8px', color: '#737373', cursor: 'pointer', fontSize: '14px' }
};

export default AdminUploadPage;
