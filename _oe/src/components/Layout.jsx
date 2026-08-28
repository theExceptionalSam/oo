import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';
import { api } from '../api/client';
import { useToast } from './Toast';
import { Avatar, Modal } from './ui';

const NAV = [
  {
    section: 'Overview',
    roles: ['ADMIN', 'SUPER_ADMIN', 'TEACHER', 'PARENT', 'STUDENT'],
    items: [{ to: '/', label: 'Dashboard', end: true }],
  },
  {
    section: 'Administration',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    items: [
      { to: '/schools', label: 'Schools' },
      { to: '/users', label: 'Users' },
      { to: '/academic-years', label: 'Academic Years' },
    ],
  },
  {
    section: 'Academics',
    roles: ['ADMIN', 'SUPER_ADMIN', 'TEACHER'],
    items: [
      { to: '/classes', label: 'Classes' },
      { to: '/subjects', label: 'Subjects' },
      { to: '/students', label: 'Students' },
      { to: '/enrollments', label: 'Enrollments' },
    ],
  },
  {
    section: 'Operations',
    roles: ['ADMIN', 'SUPER_ADMIN', 'TEACHER'],
    items: [
      { to: '/attendance', label: 'Attendance' },
      { to: '/exams', label: 'Exams' },
      { to: '/marks', label: 'Marks & Reports' },
    ],
  },
  {
    section: 'Finance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_OWNER', 'ACCOUNTANT'],
    items: [
      { to: '/fee-structures', label: 'Fee Structures' },
      { to: '/payments', label: 'Payments' },
    ],
  },
  {
    section: 'Communication',
    roles: ['ADMIN', 'SUPER_ADMIN', 'TEACHER', 'PARENT', 'STUDENT'],
    items: [
      { to: '/announcements', label: 'Announcements' },
      { to: '/messages', label: 'Messages' },
      { to: '/notifications', label: 'Notifications' },
    ],
  },
  {
    section: 'Governance',
    roles: ['SUPER_ADMIN'],
    items: [
      { to: '/audit-logs', label: 'Audit Log' },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async () => {
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', pwForm);
      toast('Password changed — please sign in again');
      setPwOpen(false);
      await logout();
      nav('/login');
    } catch (e) {
      toast(e.message, 'error');
    } finally { setPwBusy(false); }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="mark">S</div>SchoolSync</div>
        <nav className="sidebar-nav">
          {NAV.filter((s) => s.roles.includes(user?.role)).map((s) => (
            <div className="nav-section" key={s.section}>
              <div className="nav-label">{s.section}</div>
              {s.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Avatar name={user?.email || '?'} />
          <div className="who">
            <div className="n">{user?.email}</div>
            <div className="r">{ROLE_LABELS[user?.role] || user?.role}</div>
          </div>
          <button className="icon-btn" title="Change password" onClick={() => { setPwForm({ currentPassword: '', newPassword: '' }); setPwOpen(true); }}>🔑</button>
          <button className="icon-btn" title="Log out" onClick={async () => { await logout(); nav('/login'); }}>⏻</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>

      {pwOpen && (
        <Modal title="Change password" onClose={() => setPwOpen(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setPwOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={changePassword}
              disabled={pwBusy || pwForm.currentPassword.length < 1 || pwForm.newPassword.length < 8}>
              {pwBusy ? 'Saving…' : 'Change password'}
            </button>
          </>}>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 14 }}>
            Changing your password signs you out of all devices.
          </p>
          <div className="field"><label>Current password</label>
            <input type="password" value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} /></div>
          <div className="field"><label>New password (min 8 chars)</label>
            <input type="password" value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  );
}
