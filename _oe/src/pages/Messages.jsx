import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { REALTIME_EVENT } from '../context/RealtimeProvider';

export default function Messages() {
  const { user } = useAuth();
  const toast = useToast();
  const [recipients, setRecipients] = useState([]);
  const [active, setActive] = useState(null); // user id
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [v, setV] = useState(0);
  const threadRef = useRef(null);

  useEffect(() => {
    api.list('/users?limit=200')
      .then((u) => setRecipients(u.filter((x) => x.id !== user?.id)))
      .catch(() => {});
  }, [user?.id]);

  // Live refresh when a new message arrives over the socket gateway.
  useEffect(() => {
    const onRealtime = () => setV((x) => x + 1);
    window.addEventListener(REALTIME_EVENT, onRealtime);
    return () => window.removeEventListener(REALTIME_EVENT, onRealtime);
  }, []);

  const { data: messages, loading } = useAsync(() => api.list('/messages?limit=200'), [v]);

  const byUser = {};
  (messages || []).forEach((m) => {
    const other = m.senderId === user?.id ? m.receiverId : m.senderId;
    (byUser[other] = byUser[other] || []).push(m);
  });
  const threads = Object.entries(byUser).sort((a, b) => b[1].length - a[1].length);
  const userById = Object.fromEntries(recipients.map((r) => [r.id, r]));
  const activeThread = active ? byUser[active] || [] : [];

  useEffect(() => { threadRef.current?.scrollTo(0, threadRef.current.scrollHeight); }, [active, v]);

  const send = async () => {
    if (!active || !text.trim()) return;
    setSending(true);
    try {
      await api.post('/messages', { receiverId: active, content: text.trim() });
      setText(''); setV((x) => x + 1);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSending(false); }
  };

  return (
    <>
      <PageHeader title="Messages" sub="Direct messages — sender is identified by your access token" />
      <div className="grid-2" style={{ gridTemplateColumns: '320px 1fr' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head"><h3>Conversations</h3></div>
          <div className="msg-list">
            {loading ? <Spinner /> : !threads.length ? (
              <EmptyState icon="💬" title="No conversations" hint="Pick a recipient and send the first message." />
            ) : threads.map(([uid, thread]) => (
              <div key={uid} className="msg-item" style={{ cursor: 'pointer', background: active === uid ? 'var(--primary-soft)' : undefined }}
                onClick={() => setActive(uid)}>
                <div className="avatar">{(userById[uid]?.email || '?')[0].toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{userById[uid]?.email || uid.slice(0, 12) + '…'}</div>
                  <div style={{ color: 'var(--text-2)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {thread[thread.length - 1].content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head"><h3>{active ? userById[active]?.email || 'Conversation' : 'New Message'}</h3>
            <select value={active || ''} onChange={(e) => setActive(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
              <option value="">— choose recipient —</option>
              {recipients.map((r) => <option key={r.id} value={r.id}>{r.email}</option>)}
            </select>
          </div>
          <div className="msg-thread" ref={threadRef}>
            {activeThread.map((m) => (
              <div key={m.id} className={`msg-bubble ${m.senderId === user?.id ? 'sent' : 'received'}`}>{m.content}</div>
            ))}
            {active && !activeThread.length && <EmptyState icon="✉️" title="No messages yet" hint="Say hello 👋" />}
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
            <input value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={active ? 'Type a message…' : 'Select a recipient first'}
              disabled={!active}
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', outline: 'none' }} />
            <button className="btn btn-primary" onClick={send} disabled={!active || !text.trim() || sending}>Send</button>
          </div>
        </div>
      </div>
    </>
  );
}
