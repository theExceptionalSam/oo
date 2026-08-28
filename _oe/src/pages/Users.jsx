import React, { useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { Modal } from '../components/ui';
import { Pill } from '../components/ui';
import { useToast } from '../components/Toast';
import { api } from '../api/client';

const ROLES = ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'].map((r) => ({ value: r, label: r }));

export default function Users() {
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'TEACHER' });
  const [inviteResult, setInviteResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [schools, setSchools] = React.useState([]);
  React.useEffect(() => { api.list('/schools?limit=100').then(setSchools).catch(() => {}); }, []);
  const schoolOpts = schools.map((s) => ({ value: s.id, label: s.name }));

  const sendInvite = async () => {
    setBusy(true); setInviteResult(null);
    try {
      const result = await api.post('/users/invite', inviteForm);
      setInviteResult(result);
      toast(`Invitation created for ${result.user.email}`);
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <ResourcePage
        title="Users"
        sub="Accounts across all roles — invite staff by email"
        endpoint="/users"
        createTitle="User"
        searchKeys={['email', 'role']}
        toolbarExtra={
          <button className="btn btn-outline" onClick={() => { setInviteForm({ email: '', role: 'TEACHER' }); setInviteResult(null); setInviting(true); }}>
            ✉ Invite User
          </button>
        }
        fields={[
          { name: 'email', label: 'Email', type: 'email', required: true },
          {
            name: 'role', label: 'Role', type: 'select', options: ROLES, required: true,
            render: (r) => <Pill tone={r.role === 'ADMIN' ? 'blue' : r.role === 'TEACHER' ? 'green' : 'gray'}>{r.role}</Pill>,
          },
          { name: 'password', label: 'Password (min 8 chars)', type: 'password', formOnly: true },
          { name: 'schoolId', label: 'School', type: 'select', options: schoolOpts },
          { name: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'green' : 'amber'}>{r.status}</Pill> },
          { name: 'emailVerified', label: 'Verified', render: (r) => (r.emailVerified ? '✅' : '—') },
        ]}
        transformRow={(r) => ({ ...r, emailVerified: r.emailVerified })}
      />

      {inviting && (
        <Modal title="Invite a user" onClose={() => setInviting(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setInviting(false)}>Close</button>
            <button className="btn btn-primary" onClick={sendInvite}
              disabled={busy || !inviteForm.email.includes('@')}>
              {busy ? 'Creating…' : 'Create invitation'}
            </button>
          </>}>
          <div className="field"><label>Email</label>
            <input type="email" value={inviteForm.email} placeholder="teacher@yourschool.edu"
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
          <div className="field"><label>Role</label>
            <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
              {ROLES.filter(r => r.value !== 'ADMIN').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p style={{ color: 'var(--text-2)', fontSize: 12.5, marginTop: 6 }}>
              The account is locked to your school. The recipient sets their own password via the link.
            </p>
          </div>
          {inviteResult && (
            <div className="field">
              <label>Set-password link (valid 72 h) — share it with the invitee</label>
              <textarea rows="3" readOnly value={inviteResult.inviteUrl}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 8 }}
                onClick={() => { navigator.clipboard?.writeText(inviteResult.inviteUrl); toast('Link copied'); }}>
                Copy link
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
