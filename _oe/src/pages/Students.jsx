import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { Modal } from '../components/ui';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { downloadCsv } from '../api/download';
import { useLookups } from '../context/LookupContext';

// Students join the users table for account info.
export default function Students() {
  const toast = useToast();
  const lookups = useLookups();
  const [users, setUsers] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState({ classId: '', csv: '', defaultPassword: '' });
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadUsers = () => api.list('/users?limit=200')
    .then((u) => setUsers(u.filter((x) => x.role === 'STUDENT'))).catch(() => {});
  useEffect(() => { loadUsers(); }, []);

  const runImport = async () => {
    setBusy(true); setImportResult(null);
    try {
      const payload = { csv: importForm.csv };
      if (importForm.classId) payload.classId = importForm.classId;
      if (importForm.defaultPassword) payload.defaultPassword = importForm.defaultPassword;
      const result = await api.post('/import/students', payload);
      setImportResult(result);
      toast(`Imported ${result.imported}/${result.total} students`);
      loadUsers();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const doExport = async () => {
    try {
      await downloadCsv('/api/v1/export/students', 'schoolsync-students.csv');
      toast('Students exported');
    } catch (e) { toast(e.message, 'error'); }
  };

  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <>
      <ResourcePage
        title="Students"
        sub="Student profiles linked to user accounts"
        endpoint="/students"
        createTitle="Student"
        searchKeys={['rollNumber', 'name']}
        toolbarExtra={<>
          <button className="btn btn-outline" onClick={doExport}>⬇ Export CSV</button>
          <button className="btn btn-outline" onClick={() => { setImportForm({ classId: '', csv: '', defaultPassword: '' }); setImportResult(null); setImporting(true); }}>⬆ Import CSV</button>
        </>}
        fields={[
          {
            name: 'userId', label: 'User Account', type: 'select', required: true,
            options: () => users.map((u) => ({ value: u.id, label: u.email })),
            render: (r) => r.name || r.userId,
          },
          { name: 'rollNumber', label: 'Roll Number' },
          { name: 'admissionDate', label: 'Admission Date', type: 'date' },
        ]}
        transformRow={(r) => ({
          ...r,
          name: userById[r.userId]?.email || r.userId?.slice(0, 13) + '…' || '—',
        })}
      />

      {importing && (
        <Modal title="Import Students (CSV)" onClose={() => setImporting(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setImporting(false)}>Close</button>
            <button className="btn btn-primary" onClick={runImport}
              disabled={busy || !importForm.csv.trim()}>
              {busy ? 'Importing…' : 'Import'}
            </button>
          </>}>
          <div className="field">
            <label>CSV — columns: fullName, email, rollNumber, guardianName, guardianPhone</label>
            <textarea rows="8" value={importForm.csv} placeholder={'fullName,email,rollNumber,guardianName,guardianPhone\nAda Obi,ada@demo-school.edu,STD-010,Mrs Obi,+2348000000010'}
              onChange={(e) => setImportForm({ ...importForm, csv: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="field"><label>Enroll into class (optional)</label>
              <select value={importForm.classId} onChange={(e) => setImportForm({ ...importForm, classId: e.target.value })}>
                <option value="">— none —</option>
                {lookups.options.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
            <div className="field"><label>Default password (optional, min 8)</label>
              <input type="text" value={importForm.defaultPassword} placeholder="Student!123"
                onChange={(e) => setImportForm({ ...importForm, defaultPassword: e.target.value })} /></div>
          </div>
          {importResult && (
            <div className="field">
              <p><strong>{importResult.imported}</strong> of {importResult.total} rows imported
                {importResult.defaultPassword && <> — default password: <code>{importResult.defaultPassword}</code></>}.</p>
              {importResult.skipped?.length > 0 && (
                <div style={{ color: 'var(--warning)', fontSize: 12.5 }}>
                  Skipped:<ul style={{ margin: '4px 0 0 16px' }}>{importResult.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
