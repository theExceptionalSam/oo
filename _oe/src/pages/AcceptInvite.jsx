import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/accept-invite', { token, password });
      setDone(res?.email || true);
    } catch (err) {
      setError(err.message || 'Could not accept invitation');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><div className="mark">S</div></div>
        <div className="login-title">Set your password</div>
        <div className="login-sub">You've been invited to SchoolSync</div>
        {done ? (
          <>
            <div className="login-hint" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
              {typeof done === 'string' ? `Password set for ${done}.` : 'Password set.'} You can sign in now.
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => nav('/login')}>Go to Sign In</button>
          </>
        ) : (
          <>
            {!token && <div className="login-error">Missing invitation token — use the link from your invitation.</div>}
            {error && <div className="login-error">{error}</div>}
            <div className="field">
              <label>New password (min 8 chars)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" minLength={8} required disabled={!token} />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••" required disabled={!token} />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy || !token}>{busy ? 'Saving…' : 'Set Password'}</button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
              <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Back to sign in</Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
