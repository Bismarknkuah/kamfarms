'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { callsApi, SOCKET_URL, CallSession, MeResponse } from './api-client';

// Free, public STUN servers only - no TURN server (that needs a paid,
// hosted relay this project has no infrastructure for). This means
// two peers on very restrictive networks (symmetric NAT, some
// corporate firewalls) may fail to find a direct path to each other
// even though signaling itself succeeds correctly - a real, disclosed
// limitation, not a bug.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface CallManagerState {
  incomingCall: CallSession | null;
  activeCall: CallSession | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  callError: string | null;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  startCall: (participantIds: string[], type?: string, title?: string) => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
}

export function useCallManager(me: MeResponse | null, accessToken: string | null): CallManagerState {
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);

  const cleanupAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setRemoteStreams(new Map());
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const createPeerConnection = useCallback(
    (otherUserId: string, callId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      localStreamRef.current?.getTracks().forEach((track) => {
        if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
      });

      pc.ontrack = (event) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(otherUserId, event.streams[0]);
          return next;
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('call:signal', { toUserId: otherUserId, callId, signal: { type: 'ice-candidate', candidate: event.candidate } });
        }
      };

      peersRef.current.set(otherUserId, pc);
      return pc;
    },
    [],
  );

  // The signaling protocol: whoever is already in the call sends the
  // WebRTC offer to whoever just became "ready" (just joined) - never
  // the other way around. This one-directional rule is what avoids
  // both sides racing to offer each other at once (glare), without
  // needing a more complex negotiation scheme.
  const handleSignal = useCallback(
    async (data: { fromUserId: string; callId: string; signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      const { fromUserId, callId, signal } = data;

      if (signal.type === 'ready') {
        const pc = createPeerConnection(fromUserId, callId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('call:signal', { toUserId: fromUserId, callId, signal: { type: 'offer', sdp: offer } });
        return;
      }

      if (signal.type === 'offer' && signal.sdp) {
        const pc = peersRef.current.get(fromUserId) ?? createPeerConnection(fromUserId, callId);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('call:signal', { toUserId: fromUserId, callId, signal: { type: 'answer', sdp: answer } });
        return;
      }

      if (signal.type === 'answer' && signal.sdp) {
        const pc = peersRef.current.get(fromUserId);
        await pc?.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        return;
      }

      if (signal.type === 'ice-candidate' && signal.candidate) {
        const pc = peersRef.current.get(fromUserId);
        await pc?.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    },
    [createPeerConnection],
  );

  useEffect(() => {
    if (!accessToken || !me) return;
    const socket = io(`${SOCKET_URL}/calls`, { auth: { token: accessToken }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('call:incoming', (call: CallSession) => {
      // Ignore an echo of a call this same user already initiated.
      if (call.initiatedBy.id === me.id) return;
      setIncomingCall(call);
    });

    socket.on('call:signal', handleSignal);

    socket.on('call:ended', ({ callId }: { callId: string }) => {
      if (activeCallRef.current?.id === callId) {
        cleanupAllPeers();
        setActiveCall(null);
        activeCallRef.current = null;
      }
      setIncomingCall((prev) => (prev?.id === callId ? null : prev));
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me?.id]);

  const acceptIncomingCall = useCallback(async () => {
    if (!accessToken || !incomingCall) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const updated = await callsApi.joinCall(accessToken, incomingCall.id);
      setActiveCall(updated);
      activeCallRef.current = updated;
      setIncomingCall(null);
      // Announce readiness to every other already-joined participant -
      // each of them will now send this client an offer.
      updated.participants
        .filter((p) => p.user.id !== me?.id && p.status === 'JOINED')
        .forEach((p) => socketRef.current?.emit('call:signal', { toUserId: p.user.id, callId: updated.id, signal: { type: 'ready' } }));
    } catch {
      setCallError('Microphone access was denied or is unavailable - cannot join the call.');
    }
  }, [accessToken, incomingCall, me?.id]);

  const declineIncomingCall = useCallback(async () => {
    if (!accessToken || !incomingCall) return;
    await callsApi.declineCall(accessToken, incomingCall.id).catch(() => {});
    setIncomingCall(null);
  }, [accessToken, incomingCall]);

  const startCall = useCallback(
    async (participantIds: string[], type?: string, title?: string) => {
      if (!accessToken) return;
      setCallError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        const call = await callsApi.initiateCall(accessToken, participantIds, type, title);
        setActiveCall(call);
        activeCallRef.current = call;
      } catch (err) {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setCallError(err instanceof Error && err.message ? err.message : 'Could not start the call.');
      }
    },
    [accessToken],
  );

  const hangUp = useCallback(async () => {
    if (!accessToken || !activeCall) return;
    await callsApi.leaveCall(accessToken, activeCall.id).catch(() => {});
    cleanupAllPeers();
    setActiveCall(null);
    activeCallRef.current = null;
  }, [accessToken, activeCall, cleanupAllPeers]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nowMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => { track.enabled = !nowMuted; });
    setIsMuted(nowMuted);
  }, [isMuted]);

  return {
    incomingCall,
    activeCall,
    localStream,
    remoteStreams,
    isMuted,
    callError,
    acceptIncomingCall,
    declineIncomingCall,
    startCall,
    hangUp,
    toggleMute,
  };
}
