import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import FaceEnrollmentPage from './pages/FaceEnrollmentPage';
import ClockInOutPage from './pages/ClockInOutPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminUploadPage from './pages/AdminUploadPage';
import AttendanceRecords from './pages/AttendanceRecords';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import ShiftCalendarPage from './pages/ShiftCalendarPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/face-enrollment" element={<FaceEnrollmentPage />} />
          <Route path="/clock" element={<ClockInOutPage />} />
          <Route path="/admin" element={<ProtectedAdminRoute><AdminDashboard /></ProtectedAdminRoute>} />
          <Route path="/admin/upload" element={<ProtectedAdminRoute><AdminUploadPage /></ProtectedAdminRoute>} />
          <Route path="/admin/records" element={<ProtectedAdminRoute><AttendanceRecords /></ProtectedAdminRoute>} />
          <Route path="/shift-calendar" element={<ShiftCalendarPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;