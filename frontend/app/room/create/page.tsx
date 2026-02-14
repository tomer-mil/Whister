'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { roomsApi } from '@/lib/api';

export default function CreateRoomPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCodeState] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await roomsApi.createRoom();
      setRoomCodeState(response.room_code);

      setTimeout(() => {
        router.push(`/room/${response.room_code}`);
      }, 2000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create room';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  if (roomCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        {/* Hero room code */}
        <p className="text-7xl sm:text-8xl font-bold tracking-[0.3em] text-foreground mb-8">
          {roomCode}
        </p>

        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-8">
          Share this code
        </p>

        <button
          onClick={() => navigator.clipboard.writeText(roomCode)}
          className="mb-12 p-2 border border-muted hover:border-foreground transition-colors"
          aria-label="Copy room code"
        >
          {/* Two overlapping squares icon */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="6" y="6" width="12" height="12" />
            <rect x="2" y="2" width="12" height="12" />
          </svg>
        </button>

        <p className="text-sm text-muted-foreground mb-4">Redirecting...</p>
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-lg font-semibold uppercase tracking-[0.15em] text-foreground mb-12">
        Create a New Room
      </h1>

      {error && (
        <p className="text-sm text-terracotta text-center mb-6">{error}</p>
      )}

      <Button
        size="xl"
        onClick={handleCreateRoom}
        disabled={isLoading}
      >
        {isLoading ? 'Creating...' : 'Create'}
      </Button>
    </div>
  );
}
