import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      nav('/login');
    } catch (err) {
      setError(err.message || 'Reset failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><div className="mark">S</div></div>
        <div className="login-title">Choose a new password</div>
        <div className="login-sub">All other sessions will be signed out</div>
        {!token && <div className="login-error">Missing reset token — use the link from your email.</div>}
        {error && <div className="login-error">{error}</div>}
        <div className="field">
          <label>New password (min 8 chars)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            minLength={8} required disabled={!token} autoFocus />
        </div>
        <div className="field">
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            required disabled={!token} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !token || password.length < 8}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
