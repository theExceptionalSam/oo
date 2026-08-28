import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setSent(true); // identical response either way (no account enumeration)
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><div className="mark">S</div></div>
        <div className="login-title">Reset your password</div>
        <div className="login-sub">We'll email you a reset link (valid 1 hour)</div>
        {sent ? (
          <>
            <div className="login-hint" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
              If that email has an account, a reset link is on its way.
              Check your inbox (and spam folder).
            </div>
            <Link to="/login" className="btn btn-outline btn-block" style={{ marginTop: 12 }}>Back to sign in</Link>
          </>
        ) : (
          <>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourschool.edu" required autoFocus />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy || !email.includes('@')}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
              Remembered it? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
