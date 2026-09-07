'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { messagingApi, usersApi, callsApi, Conversation, Message, DirectoryUser, CallRequest, ApiError } from '@/lib/api-client';
import { useCall } from '@/lib/call-context';

export default function MessagesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const { startCall } = useCall();
  const [callRequestReason, setCallRequestReason] = useState('');
  const [showCallRequest, setShowCallRequest] = useState(false);
  const [callActionError, setCallActionError] = useState<string | null>(null);
  const [pendingCallRequests, setPendingCallRequests] = useState<CallRequest[]>([]);
  const [showGroupCall, setShowGroupCall] = useState(false);
  const [groupCallTitle, setGroupCallTitle] = useState('');
  const [groupCallParticipantIds, setGroupCallParticipantIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  // Voice notes - recorded genuinely in-browser via MediaRecorder,
  // encoded as a data: URI and sent through the same attachmentUrl
  // field a document link uses, distinguished by attachmentType. Not
  // real-time calling (this project has no WebRTC signaling/TURN
  // infrastructure to make that actually work) - a real, working
  // recorded voice message instead.
  const MAX_RECORDING_SECONDS = 120;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // TOP_MANAGEMENT_ROLES mirrors the backend's own definition exactly
  // (CallsService) - the frontend only ever uses this to decide which
  // button to show (Call vs Request a call); the real enforcement that
  // actually matters happens server-side regardless of what this
  // shows.
  const TOP_MANAGEMENT_ROLES = new Set(['MD', 'CEO']);
  const isTopManagement = (userId: string) => directory.find((u) => u.id === userId)?.roleCode && TOP_MANAGEMENT_ROLES.has(directory.find((u) => u.id === userId)!.roleCode!);
  const iAmTopManagement = me ? TOP_MANAGEMENT_ROLES.has(me.roles.map((r) => r.code).find((c) => TOP_MANAGEMENT_ROLES.has(c)) ?? '') : false;

  const selectedConversation = conversations?.find((c) => c.id === selectedId) ?? null;
  const otherMember = selectedConversation?.type === 'DIRECT' ? selectedConversation.members.find((m) => m.user.id !== me?.id)?.user ?? null : null;
  const otherIsTopManagement = otherMember ? isTopManagement(otherMember.id) : false;

  const onCallOrRequest = async () => {
    if (!otherMember) return;
    setCallActionError(null);
    if (otherIsTopManagement && !iAmTopManagement) {
      setShowCallRequest(true);
      return;
    }
    await startCall([otherMember.id]);
  };

  const onSendCallRequest = async () => {
    if (!accessToken || !otherMember) return;
    try {
      await callsApi.requestCall(accessToken, otherMember.id, callRequestReason.trim() || undefined);
      setShowCallRequest(false);
      setCallRequestReason('');
    } catch (err) {
      setCallActionError(err instanceof ApiError ? err.message : 'Failed to send call request.');
    }
  };

  const onRespondToCallRequest = async (id: string, approve: boolean) => {
    if (!accessToken) return;
    try {
      await callsApi.respondToCallRequest(accessToken, id, approve);
      setPendingCallRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setCallActionError(err instanceof ApiError ? err.message : 'Failed to respond to call request.');
    }
  };

  const toggleGroupParticipant = (userId: string) => {
    setGroupCallParticipantIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const onStartGroupCall = async () => {
    if (!groupCallTitle.trim() || groupCallParticipantIds.length === 0) return;
    setCallActionError(null);
    await startCall(groupCallParticipantIds, 'GROUP', groupCallTitle.trim());
    setShowGroupCall(false);
    setGroupCallTitle('');
    setGroupCallParticipantIds([]);
  };

  useEffect(() => {
    if (accessToken) loadConversations(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    usersApi.directory(accessToken).then((list) => setDirectory(list.filter((u) => u.id !== me?.id))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !me) return;
    const TOP = new Set(['MD', 'CEO']);
    const isTop = me.roles.some((r) => TOP.has(r.code));
    if (!isTop) return;
    callsApi.listMyCallRequests(accessToken).then((reqs) => setPendingCallRequests(reqs.filter((r) => r.status === 'PENDING'))).catch(() => {});
  }, [accessToken, me]);

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
      await messagingApi.sendMessage(accessToken, selectedId, draft, attachmentUrl.trim() || undefined, attachmentUrl.trim() ? 'DOCUMENT' : undefined);
      setDraft('');
      setAttachmentUrl('');
      setShowAttach(false);
      const updated = await messagingApi.listMessages(accessToken, selectedId);
      setMessages(updated);
      loadConversations(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const onStartRecording = async () => {
    setVoiceError(null);
    setVoiceNoteUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => setVoiceNoteUrl(reader.result as string);
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS) {
            mediaRecorderRef.current?.stop();
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setVoiceError('Microphone access was denied or is unavailable.');
    }
  };

  const onStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const onDiscardVoiceNote = () => setVoiceNoteUrl(null);

  const onSendVoiceNote = async () => {
    if (!accessToken || !selectedId || !voiceNoteUrl) return;
    setSending(true);
    try {
      await messagingApi.sendMessage(accessToken, selectedId, '🎤 Voice message', voiceNoteUrl, 'VOICE_NOTE');
      setVoiceNoteUrl(null);
      const updated = await messagingApi.listMessages(accessToken, selectedId);
      setMessages(updated);
      loadConversations(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to send voice message.');
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
        <div className="flex gap-2">
          {iAmTopManagement && (
            <button type="button" onClick={() => setShowGroupCall((v) => !v)} className="rounded-full border border-paddy-900 px-5 py-2 text-sm font-medium text-paddy-900">
              📞 Start group call
            </button>
          )}
          {hasPermission('messages.send') && (
            <button type="button" onClick={openNewConversation} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              New conversation
            </button>
          )}
        </div>
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {iAmTopManagement && pendingCallRequests.length > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-4">
          <h2 className="font-display text-base text-paddy-900">Call requests waiting on you</h2>
          <div className="mt-2 space-y-2">
            {pendingCallRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{r.requestedBy.firstName} {r.requestedBy.lastName}</p>
                  {r.reason && <p className="text-xs text-ink-500">{r.reason}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onRespondToCallRequest(r.id, true)} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50">
                    Call them back
                  </button>
                  <button type="button" onClick={() => onRespondToCallRequest(r.id, false)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showGroupCall && (
        <div className="mt-4 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-4">
          <h2 className="font-display text-base text-paddy-900">Start a group call</h2>
          <input
            value={groupCallTitle}
            onChange={(e) => setGroupCallTitle(e.target.value)}
            placeholder="What's this call about?"
            className="mt-2 w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
          />
          <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-soil-500">Who should join</p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {directory.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleGroupParticipant(u.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${groupCallParticipantIds.includes(u.id) ? 'border-paddy-500 bg-paddy-100 text-paddy-900' : 'border-paddy-100 text-ink-500'}`}
              >
                {u.firstName} {u.lastName}
              </button>
            ))}
          </div>
          {callActionError && <p className="mt-2 text-xs text-red-600">{callActionError}</p>}
          <button
            type="button"
            onClick={onStartGroupCall}
            disabled={!groupCallTitle.trim() || groupCallParticipantIds.length === 0}
            className="mt-3 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            Call {groupCallParticipantIds.length > 0 ? `${groupCallParticipantIds.length} people` : ''}
          </button>
        </div>
      )}

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
            <p className="px-4 py-6 text-sm text-ink-500">No conversations yet - start one above.</p>
          )}
        </div>

        <div className="flex flex-col p-4">
          {!selectedId ? (
            <p className="m-auto text-sm text-ink-500">Select a conversation to view messages.</p>
          ) : (
            <>
              {otherMember && (
                <div className="mb-2 flex items-center justify-between border-b border-paddy-100 pb-2">
                  <p className="text-sm font-medium text-ink-900">{otherMember.firstName} {otherMember.lastName}</p>
                  <button
                    type="button"
                    onClick={onCallOrRequest}
                    className="flex items-center gap-1 rounded-full bg-paddy-100 px-3 py-1.5 text-xs font-medium text-paddy-900"
                  >
                    📞 {otherIsTopManagement && !iAmTopManagement ? 'Request a call' : 'Call'}
                  </button>
                </div>
              )}
              {callActionError && <p className="mb-2 text-xs text-red-600">{callActionError}</p>}
              {showCallRequest && (
                <div className="mb-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
                  <p className="text-xs text-ink-700">A call request will be sent to {otherMember?.firstName} - they&rsquo;ll approve it and call you back.</p>
                  <input
                    value={callRequestReason}
                    onChange={(e) => setCallRequestReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="mt-2 w-full rounded-lg border border-paddy-100 px-3 py-1.5 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={onSendCallRequest} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50">
                      Send request
                    </button>
                    <button type="button" onClick={() => setShowCallRequest(false)} className="text-xs text-ink-500">Cancel</button>
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-3 overflow-y-auto" style={{ maxHeight: 360 }}>
                {messages?.map((m) => {
                  const isMe = m.sender.id === me.id;
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-2xl px-3 py-2 text-sm ${isMe ? 'bg-paddy-900 text-rice-50' : 'bg-rice-50 text-ink-900'}`}>
                        {!isMe && <p className="text-xs font-medium text-husk-500">{m.sender.firstName}</p>}
                        <p>{m.body}</p>
                        {m.attachmentUrl && m.attachmentType === 'VOICE_NOTE' ? (
                          <audio controls src={m.attachmentUrl} className="mt-1 h-8 max-w-full" style={{ width: 220 }} />
                        ) : m.attachmentUrl && (
                          <a
                            href={m.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`mt-1 flex items-center gap-1 text-xs underline ${isMe ? 'text-rice-100' : 'text-paddy-700'}`}
                          >
                            📎 Download document
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                {messages?.length === 0 && <p className="text-sm text-ink-500">No messages yet - say hello.</p>}
              </div>
              {hasPermission('messages.send') && (
                <div className="mt-3 border-t border-paddy-100 pt-3">
                  {voiceError && <p className="mb-2 text-xs text-red-600">{voiceError}</p>}
                  {isRecording ? (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
                      <span className="text-sm text-red-700">Recording… {recordingSeconds}s / {MAX_RECORDING_SECONDS}s</span>
                      <button type="button" onClick={onStopRecording} className="ml-auto rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">
                        Stop
                      </button>
                    </div>
                  ) : voiceNoteUrl ? (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-husk-100/50 px-3 py-2">
                      <audio controls src={voiceNoteUrl} className="h-8" style={{ width: 200 }} />
                      <button type="button" onClick={onSendVoiceNote} disabled={sending} className="rounded-full bg-paddy-900 px-3 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                        {sending ? 'Sending…' : 'Send'}
                      </button>
                      <button type="button" onClick={onDiscardVoiceNote} className="text-xs text-ink-500">Discard</button>
                    </div>
                  ) : showAttach && (
                    <input
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                      placeholder="Document link (Drive, Dropbox, etc.)"
                      className="mb-2 w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAttach((v) => !v)}
                      title="Attach a document"
                      disabled={isRecording || !!voiceNoteUrl}
                      className={`rounded-full border px-3 py-2 text-sm disabled:opacity-40 ${showAttach || attachmentUrl ? 'border-paddy-500 bg-paddy-100 text-paddy-900' : 'border-paddy-100 text-ink-500'}`}
                    >
                      📎
                    </button>
                    <button
                      type="button"
                      onClick={isRecording ? onStopRecording : onStartRecording}
                      title="Record a voice message"
                      disabled={!!voiceNoteUrl}
                      className={`rounded-full border px-3 py-2 text-sm disabled:opacity-40 ${isRecording ? 'border-red-500 bg-red-100 text-red-700' : 'border-paddy-100 text-ink-500'}`}
                    >
                      🎤
                    </button>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onSend()}
                      placeholder="Type a message…"
                      disabled={isRecording || !!voiceNoteUrl}
                      className="flex-1 rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 disabled:opacity-40"
                    />
                    <button
                      type="button"
                      onClick={onSend}
                      disabled={sending || !draft.trim() || isRecording || !!voiceNoteUrl}
                      className="rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
