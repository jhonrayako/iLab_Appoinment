import { useEffect, useState } from 'react';
import { API_URL } from '../visitorApi';

function useAppointmentNotifications(token) {
  const [latestNotification, setLatestNotification] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    const socketUrl = new URL(API_URL);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.pathname = '/ws';
    socketUrl.search = '';
    socketUrl.searchParams.set('token', token);

    const socket = new WebSocket(socketUrl.toString());
    socket.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data);
        if (notification.type !== 'new_appointment_request') return;
        const payload = { ...notification.data, occurred_at: notification.timestamp || new Date().toISOString() };
        setLatestNotification(payload);
        window.dispatchEvent(new CustomEvent('ilab:appointment-request', { detail: payload }));
      } catch {
        // Ignore malformed messages and keep the portal usable.
      }
    };

    return () => socket.close();
  }, [token]);

  const dismissNotification = () => setLatestNotification(null);
  return { latestNotification, dismissNotification };
}

export default useAppointmentNotifications;