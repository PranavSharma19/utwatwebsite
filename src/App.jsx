import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import CursorGlow from './faction/CursorGlow';
import { FactionProvider } from './faction/FactionContext';
import AdmissionsAdminPage from './pages/AdmissionsAdminPage';
import AdmissionsPage from './pages/AdmissionsPage';
import ApplicationStatusPage from './pages/ApplicationStatusPage';
import CheckInPage from './pages/CheckInPage';
import ClaimPage from './pages/ClaimPage';
import LandingPage from './pages/LandingPage';
import LegalPage from './pages/LegalPage';
import {
  codeOfConduct,
  participantWaiver,
  privacyPolicy,
  termsOfService,
} from './legal/legalContent';
import { portalConfig } from './admissions/portalConfig';

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
          {/* Signup-code claim. Same token-is-the-credential model as the
              status page: see src/pages/ClaimPage.jsx. */}
          <Route path="/claim/:token" element={<ClaimPage />} />
          <Route
            path={portalConfig.adminPath}
            element={<AdmissionsAdminPage />}
          />
          <Route path={`${portalConfig.adminPath}/checkin`} element={<CheckInPage />} />
          <Route path="/privacy" element={<LegalPage document={privacyPolicy} />} />
          <Route path="/terms" element={<LegalPage document={termsOfService} />} />
          <Route path="/waiver" element={<LegalPage document={participantWaiver} />} />
          <Route
            path={portalConfig.policyLinks.codeOfConduct}
            element={<LegalPage document={codeOfConduct} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FactionProvider>
  );
}
