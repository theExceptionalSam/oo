import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from '../components/Toast';

// Broadcast to open pages so they can refetch (window event keeps this decoupled).
export const REALTIME_EVENT = 'schoolsync:realtime';

/**
 * Connects to the notification gateway once the user is authenticated.
 * Incoming notifications show a toast and ping any listening page.
 */
export function RealtimeProvider() {
  const { user } = useAuth();
  const toast = useToast();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const socket = io('/notifications', {
      auth: { token: api.tokens.access },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => console.info('[realtime] connected', socket.id));
    socket.on('connect_error', (err) => console.warn('[realtime]', err.message));
    socket.on('notification', (n) => {
      toast(`🔔 ${n.title}`, 'info');
      window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: n }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // Reconnect when the user identity changes.
  }, [user?.id]);

  return null;
}
