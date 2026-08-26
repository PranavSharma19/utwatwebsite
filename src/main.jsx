import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { authErrorLanding, captureAuthError } from './admissions/authError'

// Must run before anything imports the Supabase client: supabase-js clears the
// URL fragment while it initialises, taking the failure reason with it.
const authFailure = captureAuthError()

// Rewritten before the router mounts, so there is no flash of the landing page
// and no history entry to bounce back into.
const landing = authErrorLanding(window.location.pathname, authFailure)
if (landing) {
  window.history.replaceState(window.history.state, '', landing)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
