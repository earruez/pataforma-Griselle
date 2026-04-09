import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@store/authStore';
import LoginPage from '@pages/LoginPage';
import DashboardPage from '@pages/DashboardPage';
import AircraftPage from '@pages/AircraftPage';
import ComponentsPage from '@pages/ComponentsPage';
import CompliancePage from '@pages/CompliancePage';
import AppLayout from '@components/layout/AppLayout';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/aircraft" element={<AircraftPage />} />
          <Route path="/components" element={<ComponentsPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
