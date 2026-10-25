import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PaymentHistory from './pages/PaymentHistory.jsx';
import PaymentPage from './pages/PaymentPage.jsx';
import MerchantLayout from './components/MerchantLayout.jsx';
import { getSession, saveSession } from './api';

export default function App() {
  const [session, setSession] = useState(getSession);

  const signIn = useCallback((s) => {
    saveSession(s);
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  // An expired/invalid token on any API call signs the merchant out.
  useEffect(() => {
    window.addEventListener('paylink:unauthorized', signOut);
    return () => window.removeEventListener('paylink:unauthorized', signOut);
  }, [signOut]);

  return (
    <Routes>
      <Route path="/pay/:linkId" element={<PaymentPage />} />
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login onSignIn={signIn} />} />
      <Route
        element={session ? <MerchantLayout session={session} onSignOut={signOut} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Dashboard />} />
        <Route path="history" element={<PaymentHistory />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
