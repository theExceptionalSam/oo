import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorBox, PageHeader, Pill, Spinner } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useAsync(async () => {
    const [students, users, classes, announcements, attendance, payments] = await Promise.all([
      api.list('/students?limit=200').catch(() => []),
      api.list('/users?limit=200').catch(() => []),
      api.list('/classes?limit=200').catch(() => []),
      api.list('/announcements?limit=6').catch(() => []),
      api.get('/attendance/reports').catch(() => []),
      api.get('/payments/reports').catch(() => []),
    ]);
    return { students, users, classes, announcements, attendance, payments };
  }, []);

  if (loading) return <><PageHeader title="Dashboard" /><Spinner /></>;
  if (error) return <ErrorBox error={error} />;

  const teachers = data.users.filter((u) => u.role === 'TEACHER');
  const totalMarked = data.attendance.reduce((a, r) => a + r.present + r.absent + r.late + r.excused, 0);
  const presentish = data.attendance.reduce((a, r) => a + r.present + r.late, 0);
  const attRate = totalMarked ? Math.round((presentish / totalMarked) * 100) : null;
  const collected = data.payments.reduce((a, r) => a + (r.collected || 0), 0);
  const outstanding = data.payments.reduce((a, r) => a + (r.outstanding || 0), 0);

  const stats = [
    { ic: '🎓', cls: 'bg-indigo', v: data.students.length, l: 'Students' },
    { ic: '👩‍🏫', cls: 'bg-green', v: teachers.length, l: 'Teachers' },
    { ic: '🏫', cls: 'bg-blue', v: data.classes.length, l: 'Classes' },
    ...(attRate !== null ? [{ ic: '📋', cls: 'bg-amber', v: `${attRate}%`, l: 'Attendance Rate' }] : []),
    ...(collected || outstanding ? [{ ic: '💰', cls: 'bg-green', v: `₦${collected.toLocaleString()}`, l: `Collected (₦${outstanding.toLocaleString()} outstanding)` }] : []),
  ];

  return (
    <>
      <PageHeader title={`Welcome back, ${(user?.email || '').split('@')[0]}`} sub="Live data from your SchoolSync backend" />
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div className="card stat" key={i}>
            <div className={`ic ${s.cls}`}>{s.ic}</div>
            <div><div className="v">{s.v}</div><div className="l">{s.l}</div></div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Recent Announcements</h3><Link to="/announcements" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>View all →</Link></div>
          <div className="card-body" style={{ padding: 0 }}>
            {data.announcements.length ? data.announcements.slice(0, 5).map((a) => (
              <div key={a.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong>{a.title}</strong>
                  {a.priority === 'urgent' && <Pill tone="red">urgent</Pill>}
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 3 }}>{(a.content || '').slice(0, 120)}</div>
              </div>
            )) : <EmptyState icon="📣" title="No announcements" hint="Published announcements will appear here." />}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Attendance by Student</h3><Link to="/attendance" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>Mark attendance →</Link></div>
          <div className="card-body table-wrap" style={{ padding: 0 }}>
            {data.attendance.length ? (
              <table className="tbl">
                <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Rate</th></tr></thead>
                <tbody>
                  {data.attendance.slice(0, 6).map((r) => (
                    <tr key={r.studentId}>
                      <td className="strong" style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{r.studentId.slice(0, 8)}…</td>
                      <td>{r.present}</td><td>{r.absent}</td>
                      <td><Pill tone={r.rate >= 0.9 ? 'green' : r.rate >= 0.75 ? 'amber' : 'red'}>{Math.round(r.rate * 100)}%</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState icon="📋" title="No attendance records" hint="Mark attendance to see per-student rates." />}
          </div>
        </div>
      </div>
    </>
  );
}
