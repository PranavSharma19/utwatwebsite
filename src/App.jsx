import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FactionProvider } from './faction/FactionContext';
import AdmissionsAdminPage from './pages/AdmissionsAdminPage';
import AdmissionsPage from './pages/AdmissionsPage';
import LandingPage from './pages/LandingPage';

export default function App() {
  return (
    <FactionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/apply" element={<AdmissionsPage />} />
          <Route path="/apply/admin" element={<AdmissionsAdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FactionProvider>
  );
}
