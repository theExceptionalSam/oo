import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { EmptyState, PageHeader, Pill, Spinner } from '../components/ui';
import { REALTIME_EVENT } from '../context/RealtimeProvider';

const tone = { queued: 'gray', sent: 'green', failed: 'red' };
const channelIc = { email: '📧', sms: '📱', in_app: '🔔' };

export default function Notifications() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const onRealtime = () => setV((x) => x + 1);
    window.addEventListener(REALTIME_EVENT, onRealtime);
    return () => window.removeEventListener(REALTIME_EVENT, onRealtime);
  }, []);
  const { data: items, loading } = useAsync(() => api.list('/notifications?limit=200'), [v]);

  return (
    <>
      <PageHeader title="Notifications" sub="Event-driven notifications produced by the BullMQ workers" />
      <div className="card">
        {loading ? <Spinner /> : (!items?.length ? (
          <EmptyState icon="🔔" title="No notifications" hint="Notifications appear when events (absences, announcements, registrations) fire." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Channel</th><th>Title</th><th>Body</th><th>Status</th><th>Sent</th></tr></thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id}>
                    <td>{channelIc[n.channel] || '🔔'} {n.channel}</td>
                    <td className="strong">{n.title}</td>
                    <td className="muted" style={{ maxWidth: 380 }}>{n.body}</td>
                    <td><Pill tone={tone[n.status] || 'gray'}>{n.status}</Pill></td>
                    <td className="muted">{(n.sentAt || n.createdAt || '').slice(0, 16).replace('T', ' ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
