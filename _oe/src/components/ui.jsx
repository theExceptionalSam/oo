import React from 'react';
import { useNavigate } from 'react-router-dom';

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="empty">
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="login-error">{error.message || String(error)}</div>;
}

export function Avatar({ name = '?' }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="avatar">{initials}</div>;
}

export function Pill({ tone = 'gray', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function PageHeader({ title, sub, actions }) {
  const nav = useNavigate();
  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h1>
          {sub && <div className="muted" style={{ color: 'var(--text-2)' }}>{sub}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>{actions}</div>
      </div>
    </>
  );
}
