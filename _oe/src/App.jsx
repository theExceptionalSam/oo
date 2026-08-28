import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LookupProvider } from './context/LookupContext';
import { RealtimeProvider } from './context/RealtimeProvider';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import AcceptInvite from './pages/AcceptInvite';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Schools from './pages/Schools';
import Users from './pages/Users';
import Classes from './pages/Classes';
import Subjects from './pages/Subjects';
import Students from './pages/Students';
import Enrollments from './pages/Enrollments';
import AcademicYears from './pages/AcademicYears';
import Attendance from './pages/Attendance';
import Exams from './pages/Exams';
import Marks from './pages/Marks';
import FeeStructures from './pages/FeeStructures';
import Payments from './pages/Payments';
import Announcements from './pages/Announcements';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import AuditLog from './pages/AuditLog';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace' }}>
          <h2>Render error</h2>
          <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function Protected({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <div className="spinner" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Mirrors backend @Roles on the route level — wrong role lands on dashboard.
function RoleRoute({ allow, children }) {
  const { user } = useAuth();
  if (!allow.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<Protected><LookupProvider><RealtimeProvider /><Layout /></LookupProvider></Protected>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schools" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><Schools /></RoleRoute>} />
              <Route path="/users" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><Users /></RoleRoute>} />
              <Route path="/academic-years" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><AcademicYears /></RoleRoute>} />
              <Route path="/classes" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><Classes /></RoleRoute>} />
              <Route path="/subjects" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><Subjects /></RoleRoute>} />
              <Route path="/students" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'TEACHER']}><Students /></RoleRoute>} />
              <Route path="/enrollments" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><Enrollments /></RoleRoute>} />
              <Route path="/attendance" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'TEACHER']}><Attendance /></RoleRoute>} />
              <Route path="/exams" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER']}><Exams /></RoleRoute>} />
              <Route path="/marks" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'TEACHER']}><Marks /></RoleRoute>} />
              <Route path="/fee-structures" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER', 'ACCOUNTANT']}><FeeStructures /></RoleRoute>} />
              <Route path="/payments" element={<RoleRoute allow={['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER', 'ACCOUNTANT', 'PARENT', 'STUDENT']}><Payments /></RoleRoute>} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/audit-logs" element={<RoleRoute allow={['SUPER_ADMIN']}><AuditLog /></RoleRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
