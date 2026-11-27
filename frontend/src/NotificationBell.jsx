import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { apiRequest } from './api.js';

export default function NotificationBell({ token, onSelectResource }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest('/notifications?limit=20', { token });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not load notifications.');
    }
  }, [token]);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  async function markAllRead() {
    try {
      await apiRequest('/notifications/read-all', { token, method: 'PATCH' });
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setUnreadCount(0);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not update notifications.');
    }
  }

  async function openNotification(notification) {
    if (!notification.readAt) {
      try {
        await apiRequest(`/notifications/${notification._id}/read`, { token, method: 'PATCH' });
        setNotifications((current) => current.map((item) =>
          item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item
        ));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (requestError) {
        setError(requestError.message || 'Could not update this notification.');
        return;
      }
    }
    setOpen(false);
    if (notification.resource) onSelectResource(notification.resource);
  }

  return (
    <div className="notification-center">
      <button
        type="button"
        className="icon-button notification-toggle"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); if (!open) loadNotifications(); }}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Notifications">
          <div className="notification-panel-heading">
            <div><strong>Notifications</strong><span>{unreadCount} unread</span></div>
            {unreadCount > 0 && <button type="button" className="text-button" onClick={markAllRead}><CheckCheck size={14} /> Mark all read</button>}
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <button
                  type="button"
                  className={`notification-item ${notification.readAt ? '' : 'notification-unread'}`}
                  key={notification._id}
                  onClick={() => openNotification(notification)}
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <small>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.createdAt))}</small>
                </button>
              ))}
            </div>
          ) : !error ? <p className="notification-empty">You’re all caught up.</p> : null}
        </section>
      )}
    </div>
  );
}
