import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import CursorGlow from './faction/CursorGlow';
import { FactionProvider } from './faction/FactionContext';
import AdmissionsAdminPage from './pages/AdmissionsAdminPage';
import AdmissionsPage from './pages/AdmissionsPage';
import ApplicationStatusPage from './pages/ApplicationStatusPage';
import LandingPage from './pages/LandingPage';
import LegalPage from './pages/LegalPage';
import { privacyPolicy, termsOfService } from './legal/legalContent';

export default function App() {
  return (
    <FactionProvider>
      <CursorGlow />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/apply" element={<AdmissionsPage />} />
          {/* The token is the credential: there is no account to sign into,
              and email cannot be relied on to reach applicants at either
              school. See src/pages/ApplicationStatusPage.jsx. */}
          <Route path="/apply/status/:token" element={<ApplicationStatusPage />} />
          <Route path="/apply/admin" element={<AdmissionsAdminPage />} />
          <Route path="/privacy" element={<LegalPage document={privacyPolicy} />} />
          <Route path="/terms" element={<LegalPage document={termsOfService} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FactionProvider>
  );
}
