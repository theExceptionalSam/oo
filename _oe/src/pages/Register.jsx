import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ schoolName: '', subdomain: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const user = await api.login(form.email, form.password).catch(() => null);
      if (user) {
        // Account existed — a duplicate registration attempt; show conflict.
        setError('This email already has an account — sign in instead.');
        return;
      }
    } catch { /* expected when email is new */ }
    try {
      await api.post('/auth/register', { ...form, role: 'ADMIN' });
      // Auto-login after registration
      await api.login(form.email, form.password);
      nav('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><div className="mark">S</div></div>
        <div className="login-title">Register your school</div>
        <div className="login-sub">Create a SchoolSync workspace in under a minute</div>
        {error && <div className="login-error">{error}</div>}
        <div className="field">
          <label>School name</label>
          <input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
            placeholder="Bountiful Seed Academy" required />
        </div>
        <div className="field">
          <label>Subdomain (unique)</label>
          <input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            placeholder="bountiful-seed" required />
        </div>
        <div className="field">
          <label>Your email (administrator)</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="principal@yourschool.edu" required />
        </div>
        <div className="field">
          <label>Password (min 8 chars)</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••" minLength={8} required />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create School Workspace'}</button>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
          Already registered? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
        </div>
      </form>
    </div>
  );
}
