'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { messagingApi, usersApi, Conversation, Message, DirectoryUser, ApiError } from '@/lib/api-client';

export default function MessagesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showNewConvo, setShowNewConvo] = useState(false);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');

  const loadConversations = (token: string) => {
    messagingApi
      .listConversations(token)
      .then(setConversations)
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load conversations.'));
  };

  useEffect(() => {
    if (accessToken) loadConversations(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedId) return;
    messagingApi
      .listMessages(accessToken, selectedId)
      .then(setMessages)
      .catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load messages.'));
  }, [accessToken, selectedId]);

  const openNewConversation = async () => {
    setShowNewConvo(true);
    if (!accessToken || directory.length > 0) return;
    try {
      const list = await usersApi.directory(accessToken);
      setDirectory(list.filter((u) => u.id !== me?.id));
    } catch (err) {
      setDirectoryError(err instanceof ApiError ? err.message : 'Failed to load colleagues.');
    }
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const onCreateConversation = async () => {
    if (!accessToken || selectedRecipients.length === 0) return;
    setCreating(true);
    setPageError(null);
    try {
      const conversation = await messagingApi.createConversation(accessToken, {
        type: selectedRecipients.length === 1 ? 'DIRECT' : 'GROUP',
        title: selectedRecipients.length > 1 ? groupTitle || undefined : undefined,
        memberIds: selectedRecipients,
      });
      setShowNewConvo(false);
      setSelectedRecipients([]);
      setGroupTitle('');
      setDirectorySearch('');
      loadConversations(accessToken);
      setSelectedId(conversation.id);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to start conversation.');
    } finally {
      setCreating(false);
    }
  };

  const onSend = async () => {
    if (!accessToken || !selectedId || !draft.trim()) return;
    setSending(true);
    try {
      await messagingApi.sendMessage(accessToken, selectedId, draft);
      setDraft('');
      const updated = await messagingApi.listMessages(accessToken, selectedId);
      setMessages(updated);
      loadConversations(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const filteredDirectory = directory.filter((u) =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(directorySearch.toLowerCase()),
  );

  return (
    <DashboardShell me={me}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-paddy-900">Messages</h1>
        {hasPermission('messages.send') && (
          <button type="button" onClick={openNewConversation} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
            New conversation
          </button>
        )}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {showNewConvo && (
        <div className="mt-4 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <h3 className="font-display text-lg text-paddy-900">Start a conversation</h3>
          {directoryError && <p className="mt-2 text-sm text-red-600">{directoryError}</p>}
          <input
            value={directorySearch}
            onChange={(e) => setDirectorySearch(e.target.value)}
            placeholder="Search colleagues by name…"
            className="mt-3 w-full max-w-sm rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500"
          />
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-paddy-100 bg-white">
            {filteredDirectory.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 border-b border-paddy-100 px-3 py-2 text-sm last:border-b-0 hover:bg-rice-50">
                <input type="checkbox" checked={selectedRecipients.includes(u.id)} onChange={() => toggleRecipient(u.id)} />
                <span className="text-ink-900">{u.firstName} {u.lastName}</span>
                <span className="ml-auto text-xs text-ink-500">{u.roleName}</span>
              </label>
            ))}
            {directory.length === 0 && !directoryError && <p className="px-3 py-4 text-sm text-ink-500">Loading colleagues…</p>}
            {filteredDirectory.length === 0 && directory.length > 0 && <p className="px-3 py-4 text-sm text-ink-500">No match.</p>}
          </div>
          {selectedRecipients.length > 1 && (
            <input
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Group name (optional)"
              className="mt-3 w-full max-w-sm rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500"
            />
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onCreateConversation}
              disabled={creating || selectedRecipients.length === 0}
              className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50"
            >
              {creating ? 'Starting…' : `Start ${selectedRecipients.length > 1 ? 'group' : 'conversation'}`}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewConvo(false); setSelectedRecipients([]); setDirectorySearch(''); }}
              className="rounded-full border border-paddy-100 px-4 py-1.5 text-sm font-medium text-ink-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-0 overflow-hidden rounded-2xl border border-paddy-100 bg-white md:grid-cols-[280px_1fr]" style={{ minHeight: 480 }}>
        <div className="max-h-64 divide-y divide-paddy-100 overflow-y-auto border-b border-paddy-100 md:max-h-none md:border-b-0 md:border-r">
          {conversations?.map((c) => {
            const other = c.members.find((m) => m.user.id !== me.id)?.user;
            const label = c.title ?? (other ? `${other.firstName} ${other.lastName}` : c.type);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`block w-full px-4 py-3 text-left text-sm hover:bg-rice-50 ${selectedId === c.id ? 'bg-husk-100/40' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-900">{label}</span>
                  {c.unreadCount > 0 && (
                    <span className="rounded-full bg-husk-500 px-1.5 text-xs font-medium text-white">{c.unreadCount}</span>
                  )}
                </div>
                {c.messages[0] && <p className="mt-0.5 truncate text-xs text-ink-500">{c.messages[0].body}</p>}
              </button>
            );
          })}
          {conversations?.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-500">No conversations yet — start one above.</p>
          )}
        </div>

        <div className="flex flex-col p-4">
          {!selectedId ? (
            <p className="m-auto text-sm text-ink-500">Select a conversation to view messages.</p>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto" style={{ maxHeight: 360 }}>
                {messages?.map((m) => {
                  const isMe = m.sender.id === me.id;
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-2xl px-3 py-2 text-sm ${isMe ? 'bg-paddy-900 text-rice-50' : 'bg-rice-50 text-ink-900'}`}>
                        {!isMe && <p className="text-xs font-medium text-husk-500">{m.sender.firstName}</p>}
                        <p>{m.body}</p>
                      </div>
                    </div>
                  );
                })}
                {messages?.length === 0 && <p className="text-sm text-ink-500">No messages yet — say hello.</p>}
              </div>
              {hasPermission('messages.send') && (
                <div className="mt-3 flex gap-2 border-t border-paddy-100 pt-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSend()}
                    placeholder="Type a message…"
                    className="flex-1 rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500"
                  />
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={sending || !draft.trim()}
                    className="rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
