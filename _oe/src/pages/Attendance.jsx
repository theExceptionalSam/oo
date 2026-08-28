import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorBox, PageHeader, Pill, Spinner } from '../components/ui';

const STATUSES = ['present', 'absent', 'late', 'excused'];

export default function Attendance() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState([]); // [{student, status}]
  const [saving, setSaving] = useState(false);
  const [reportV, setReportV] = useState(0);

  useEffect(() => { api.list('/classes?limit=200').then(setClasses).catch(() => {}); }, []);

  const loadRoster = async (cid) => {
    setRoster([]);
    if (!cid) return;
    try {
      const enrollments = await api.list(`/enrollments?limit=200`);
      const students = await api.list('/students?limit=200');
      const inClass = enrollments.filter((e) => e.classId === cid && e.status === 'active');
      setRoster(inClass.map((e) => ({
        student: students.find((s) => s.id === e.studentId) || { id: e.studentId },
        status: 'present',
      })));
    } catch (e) { toast(e.message, 'error'); }
  };

  const save = async () => {
    if (!classId || !roster.length) return;
    setSaving(true);
    try {
      await api.post('/attendance/bulk-mark', {
        date,
        classId,
        entries: roster.map((r) => ({ studentId: r.student.id, status: r.status })),
      });
      toast(`Attendance saved for ${roster.length} students`);
      setReportV((x) => x + 1);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const { data: report, loading: repLoading } = useAsync(
    () => api.get('/attendance/reports'), [classId, reportV]
  );

  return (
    <>
      <PageHeader title="Attendance" sub="Bulk-mark a class register — saved atomically to the backend" />
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Daily Register</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }} />
              <select value={classId} onChange={(e) => { setClassId(e.target.value); loadRoster(e.target.value); }}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                <option value="">— choose class —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="card-body">
            {!classId ? (
              <EmptyState icon="🏫" title="Select a class" hint="Pick a class to load its enrolled students." />
            ) : roster.length === 0 ? (
              <EmptyState icon="👥" title="No students enrolled" hint="Enroll students into this class first." />
            ) : (
              <>
                {roster.map((r, i) => (
                  <div className="att-row" key={r.student.id}>
                    <div className="att-name">
                      <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: 'var(--text-2)' }}>
                        {r.student.rollNumber || r.student.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="att-btns">
                      {STATUSES.map((s) => (
                        <button key={s} className={`att-btn ${r.status === s ? `on-${s}` : ''}`}
                          onClick={() => setRoster(roster.map((x, j) => (j === i ? { ...x, status: s } : x)))}>
                          {s[0].toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : `Save Register (${roster.length})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Per-Student Rates (30 days)</h3></div>
          <div className="card-body table-wrap" style={{ padding: 0 }}>
            {repLoading ? <Spinner /> : (report?.length ? (
              <table className="tbl">
                <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th>Rate</th></tr></thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.studentId}>
                      <td className="strong" style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{r.studentId.slice(0, 13)}…</td>
                      <td>{r.present}</td><td>{r.absent}</td><td>{r.late}</td>
                      <td><Pill tone={r.rate >= 0.9 ? 'green' : r.rate >= 0.75 ? 'amber' : 'red'}>{Math.round(r.rate * 100)}%</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState icon="📋" title="No data in range" />)}
          </div>
        </div>
      </div>
    </>
  );
}
