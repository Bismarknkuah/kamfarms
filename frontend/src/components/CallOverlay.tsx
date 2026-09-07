'use client';

import { useEffect, useRef } from 'react';
import { useCall } from '@/lib/call-context';
import { MeResponse } from '@/lib/api-client';

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

export function CallOverlay({ me }: { me: MeResponse }) {
  const { incomingCall, activeCall, remoteStreams, isMuted, callError, acceptIncomingCall, declineIncomingCall, hangUp, toggleMute } = useCall();

  if (!incomingCall && !activeCall && !callError) return null;

  return (
    <>
      {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} />
      ))}

      {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-paddy-100 text-2xl">
              📞
            </div>
            <p className="mt-4 font-display text-lg text-paddy-900">
              {incomingCall.type === 'GROUP' ? incomingCall.title : `${incomingCall.initiatedBy.firstName} ${incomingCall.initiatedBy.lastName}`}
            </p>
            <p className="text-sm text-ink-500">{incomingCall.type === 'GROUP' ? 'Group call' : 'Incoming call'}</p>
            <div className="mt-6 flex justify-center gap-4">
              <button
                type="button"
                onClick={declineIncomingCall}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-xl text-white"
                title="Decline"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={acceptIncomingCall}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-paddy-700 text-xl text-white"
                title="Accept"
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-2xl bg-paddy-900 px-5 py-3 text-rice-50 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {activeCall.type === 'GROUP' ? activeCall.title : (
                  activeCall.participants.find((p) => p.user.id !== me.id)
                    ? `${activeCall.participants.find((p) => p.user.id !== me.id)?.user.firstName} ${activeCall.participants.find((p) => p.user.id !== me.id)?.user.lastName}`
                    : 'On a call'
                )}
              </p>
              <p className="text-xs text-paddy-200">
                {activeCall.status === 'RINGING' ? 'Ringing…' : `${activeCall.participants.filter((p) => p.status === 'JOINED').length} on the call`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm ${isMuted ? 'bg-husk-500 text-white' : 'bg-paddy-700 text-rice-50'}`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🎙️'}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-sm text-white"
                title="Hang up"
              >
                📴
              </button>
            </div>
          </div>
        </div>
      )}

      {callError && !incomingCall && !activeCall && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-xl">
          {callError}
        </div>
      )}
    </>
  );
}
