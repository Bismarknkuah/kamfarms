'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { notificationsApi, Notification, ApiError } from '@/lib/api-client';

export default function NotificationsPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadNotifications = (token: string) => {
    notificationsApi
      .list(token)
      .then(setNotifications)
      .catch((err: unknown) => setListError(err instanceof ApiError ? err.message : 'Failed to load notifications.'));
  };

  useEffect(() => {
    if (accessToken) loadNotifications(accessToken);
  }, [accessToken]);

  const onMarkRead = async (id: string) => {
    if (!accessToken) return;
    try {
      await notificationsApi.markRead(accessToken, id);
      loadNotifications(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to mark as read.');
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Notifications</h1>
      <p className="mt-1 text-sm text-ink-500">
        {notifications ? `${unreadCount} unread of ${notifications.length}` : 'Loading…'}
      </p>

      {listError && <p className="mt-4 text-sm text-red-600">{listError}</p>}

      {notifications && (
        <div className="mt-6 space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${
                n.isRead ? 'border-paddy-100 bg-white' : 'border-husk-300 bg-husk-100/30'
              }`}
            >
              <div>
                <p className="text-sm font-medium text-ink-900">{n.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">{n.body}</p>
                <p className="mt-1 text-xs text-ink-500">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => onMarkRead(n.id)}
                  className="whitespace-nowrap rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
              No notifications yet.
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
