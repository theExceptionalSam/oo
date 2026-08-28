import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { EmptyState, Modal, PageHeader, Pill, Spinner } from '../components/ui';

const METHODS = ['cash', 'card', 'bank_transfer', 'online'].map((m) => ({ value: m, label: m }));

export default function Payments() {
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [fees, setFees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [v, setV] = useState(0);

  useEffect(() => {
    api.list('/students?limit=200').then(setStudents).catch(() => {});
    api.list('/fee-structures?limit=100').then(setFees).catch(() => {});
  }, []);

  const { data: payments, loading } = useAsync(() => api.list('/payments?limit=200'), [v]);
  const { data: report } = useAsync(() => api.get('/payments/reports'), [v]);

  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
  const feeById = Object.fromEntries(fees.map((f) => [f.id, f]));

  const collected = (report || []).reduce((a, r) => a + r.collected, 0);
  const outstanding = (report || []).reduce((a, r) => a + r.outstanding, 0);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/payments', { ...form, amount: Number(form.amount) });
      toast('Payment recorded');
      setCreating(false); setV((x) => x + 1);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        sub="Fee collection register and financial summary (last 30 days)"
        actions={<button className="btn btn-primary" onClick={() => { setForm({ studentId: '', feeStructureId: '', amount: '', method: 'card' }); setCreating(true); }}>+ Record Payment</button>}
      />

      <div className="stats-grid">
        <div className="card stat"><div className="ic bg-green">💰</div><div><div className="v">₦{collected.toLocaleString()}</div><div className="l">Collected</div></div></div>
        <div className="card stat"><div className="ic bg-amber">⏳</div><div><div className="v">₦{outstanding.toLocaleString()}</div><div className="l">Outstanding</div></div></div>
        <div className="card stat"><div className="ic bg-indigo">🧾</div><div><div className="v">{(payments || []).length}</div><div className="l">Transactions</div></div></div>
      </div>

      <div className="card">
        {loading ? <Spinner /> : (!payments?.length ? (
          <EmptyState icon="🧾" title="No payments yet" hint="Record the first payment with “+ Record Payment”." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{studentById[p.studentId]?.rollNumber || p.studentId.slice(0, 8)}</td>
                    <td>{feeById[p.feeStructureId]?.name || '—'}</td>
                    <td>₦{Number(p.amount).toLocaleString()}</td>
                    <td>{p.method || '—'}</td>
                    <td><Pill tone={p.status === 'completed' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}>{p.status}</Pill></td>
                    <td className="muted">{(p.paidAt || p.createdAt || '').slice(0, 10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {creating && (
        <Modal title="Record Payment" onClose={() => setCreating(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.studentId || !form.feeStructureId || !form.amount}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>}>
          <div className="field"><label>Student *</label>
            <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">— select —</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.rollNumber || s.id.slice(0, 8)}</option>)}
            </select></div>
          <div className="field"><label>Fee Structure *</label>
            <select value={form.feeStructureId} onChange={(e) => {
              const fee = feeById[e.target.value];
              setForm({ ...form, feeStructureId: e.target.value, amount: fee ? fee.amount : form.amount });
            }}>
              <option value="">— select —</option>
              {fees.map((f) => <option key={f.id} value={f.id}>{f.name} (₦{Number(f.amount).toLocaleString()})</option>)}
            </select></div>
          <div className="form-row">
            <div className="field"><label>Amount *</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field"><label>Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select></div>
          </div>
        </Modal>
      )}
    </>
  );
}
