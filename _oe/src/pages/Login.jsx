import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Enter your email and password'); return; }
    setBusy(true); setError('');
    try {
      await login(email, password);
      nav('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><div className="mark">S</div></div>
        <div className="login-title">SchoolSync</div>
        <div className="login-sub">Sign in to your school workspace</div>
        {error && <div className="login-error">{error}</div>}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@demo-school.edu" autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
        <div style={{textAlign:"right",marginTop:6,fontSize:13}}>
          <Link to="/forgot-password" style={{color:"var(--text-2)",fontWeight:500}}>Forgot password?</Link>
        </div>
        <div style={{textAlign:"center",marginTop:14,fontSize:13}}>
          New school? <Link to="/register" style={{color:"var(--primary)",fontWeight:600}}>Register your school</Link>
        </div>
        <div className="login-hint">
          Demo account — <strong>admin@demo-school.edu</strong> / <strong>Demo!Pass123</strong>
        </div>
      </form>
    </div>
  );
}
