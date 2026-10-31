'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCurrentUser } from '@/lib/use-current-user';
import { notificationHref } from '@/lib/links';
import { DashboardShell } from '@/components/DashboardShell';
import { notificationsApi, Notification, ApiError } from '@/lib/api-client';

type Clear = { scope: 'read' | 'older' | 'all'; days?: number; label: string; confirm: string };
const CLEARS: Clear[] = [
  { scope: 'read', label: 'Clear read', confirm: 'Delete every notification you have already read?' },
  { scope: 'older', days: 30, label: 'Older than 30 days', confirm: 'Delete every notification older than 30 days, read or not?' },
  { scope: 'all', label: 'Clear all', confirm: 'Delete ALL your notifications? This cannot be undone.' },
];

export default function NotificationsPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Clear | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);

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

  const onDelete = async (id: string) => {
    if (!accessToken) return;
    setListError(null); setNotice(null);
    try {
      await notificationsApi.remove(accessToken, id);
      setNotifications((cur) => (cur ?? []).filter((n) => n.id !== id));
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'That notification could not be deleted.');
    }
  };

  const onClear = async () => {
    if (!accessToken || !pending) return;
    setBusy(true); setListError(null);
    try {
      const r = await notificationsApi.clear(accessToken, pending.scope, pending.days);
      const n = r?.deleted ?? 0;
      setNotice(n > 0 ? `${n} notification${n === 1 ? '' : 's'} deleted.` : 'There was nothing to delete.');
      setPending(null);
      loadNotifications(accessToken);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'The notifications could not be cleared.');
    } finally { setBusy(false); }
  };

  const shown = useMemo(() => (notifications ?? []).filter((n) => filter === 'all' || !n.isRead), [notifications, filter]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Notifications</h1>
          <p className="mt-1 text-sm text-ink-500">
            {notifications ? `${unreadCount} unread of ${notifications.length}` : 'Loading…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="notif-tools">
          <div className="flex overflow-hidden rounded-full border border-paddy-100 text-xs font-medium">
            {(['all', 'unread'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`notif-filter-${f}`}
                className={`px-4 py-2 ${filter === f ? 'bg-paddy-900 text-rice-50' : 'bg-white text-paddy-900'}`}>{f === 'all' ? 'All' : 'Unread'}</button>
            ))}
          </div>
          {CLEARS.map((c) => (
            <button key={c.scope} type="button" onClick={() => { setNotice(null); setPending(c); }} disabled={!notifications || notifications.length === 0}
              data-testid={`notif-clear-${c.scope}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-paddy-100 bg-white px-4 py-2 text-xs font-medium text-paddy-900 hover:bg-rice-50 disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> {c.label}
            </button>
          ))}
        </div>
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Confirm delete" data-testid="notif-confirm" className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="flex-1 text-sm text-red-800">{pending.confirm}</p>
          <button type="button" onClick={onClear} disabled={busy} data-testid="notif-confirm-yes" className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Deleting…' : 'Yes, delete'}</button>
          <button type="button" onClick={() => setPending(null)} className="rounded-full border border-red-300 bg-white px-5 py-2 text-sm font-medium text-red-800">Cancel</button>
        </div>
      )}
      {notice && <p role="status" data-testid="notif-notice" className="mt-4 text-sm font-medium text-paddy-700">{notice}</p>}
      {listError && <p className="mt-4 text-sm text-red-600">{listError}</p>}

      {notifications && (
        <div className="mt-6 space-y-2">
          {shown.map((n) => (
            <div
              key={n.id}
              data-testid="notif-row"
              className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${
                n.isRead ? 'border-paddy-100 bg-white' : 'border-husk-300 bg-husk-100/30'
              }`}
            >
              <div>
                <p className="text-sm font-medium text-ink-900">{n.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">{n.body}</p>
                <p className="mt-1 text-xs text-ink-500">{new Date(n.createdAt).toLocaleString()}</p>
                {notificationHref(n) && <a href={notificationHref(n) as string} data-testid="open-notification" onClick={() => { if (!n.isRead) onMarkRead(n.id); }} className="mt-2 inline-block rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50">Open</a>}
              </div>
              <div className="flex flex-col items-end gap-2">
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(n.id)}
                    className="whitespace-nowrap rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
                  >
                    Mark read
                  </button>
                )}
                <button type="button" onClick={() => onDelete(n.id)} aria-label={`Delete: ${n.title}`} data-testid="notif-delete"
                  className="rounded-full p-2 text-ink-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </div>
          ))}
          {shown.length === 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
              {notifications.length === 0 ? 'No notifications yet.' : 'Nothing unread.'}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
