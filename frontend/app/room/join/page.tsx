/**
 * Join Room Page
 */

'use client';

import { JoinRoomForm } from '@/components/room/join-room-form';

export default function JoinRoomPage() {

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <JoinRoomForm />
      </div>
    </div>
  );
}
