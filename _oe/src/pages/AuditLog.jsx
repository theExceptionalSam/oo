import React from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { EmptyState, PageHeader, Pill, Spinner } from '../components/ui';

const actionTone = { CREATE: 'green', UPDATE: 'amber', DELETE: 'red' };

export default function AuditLog() {
  const { data, loading, error } = useAsync(() => api.list('/audit-logs?limit=100'), []);

  const items = data ?? [];

  return (
    <>
      <PageHeader title="Audit Log" sub="Every create, update and delete — who, what, when (passwords redacted)" />
      <div className="card">
        {loading ? <Spinner /> : error ? (
          <EmptyState icon="⚠️" title="Could not load audit log" hint={error.message} />
        ) : !items.length ? (
          <EmptyState icon="🧾" title="No audit entries yet" hint="Entries appear as users create, update or delete records." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Record</th><th>Payload</th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {(a.createdAt || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="strong">{a.userEmail || 'anonymous'}</td>
                    <td><Pill tone={actionTone[a.action] || 'gray'}>{a.action}</Pill></td>
                    <td>{a.entity || '—'}</td>
                    <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {a.entityId ? a.entityId.slice(0, 13) + '…' : '—'}
                    </td>
                    <td className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(a.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
