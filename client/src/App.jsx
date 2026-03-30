import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import ClockInOutPage from './pages/ClockInOutPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminUploadPage from './pages/AdminUploadPage';
import AttendanceRecords from './pages/AttendanceRecords';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/clock" element={<ClockInOutPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/upload" element={<AdminUploadPage />} />
        <Route path="/admin/records" element={<AttendanceRecords />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
