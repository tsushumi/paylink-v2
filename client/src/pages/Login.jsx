import { useState } from 'react';
import { api } from '../api';

export default function Login({ onSignIn }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: mode === 'login' ? { email: form.email, password: form.password } : form,
      });
      onSignIn({ token: data.token, user: data.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1 className="logo">PayLink</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to your merchant dashboard' : 'Create a merchant account'}</p>

        {mode === 'register' && (
          <label className="field">
            <span>Business name</span>
            <input value={form.name} onChange={set('name')} placeholder="Mama Njeri's Kitchen" required />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required autoComplete="email" />
        </label>
        {mode === 'register' && (
          <label className="field">
            <span>Phone (gets an SMS for every payment)</span>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="0712345678" autoComplete="tel" />
          </label>
        )}
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="link-btn center"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
