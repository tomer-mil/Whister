/**
 * Create Room Page
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
      console.log('[CreateRoom] Creating room...');
      const accessToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      console.log('[CreateRoom] Have accessToken:', !!accessToken);

      const response = await roomsApi.createRoom();
      console.log('[CreateRoom] Room created:', response);
      setRoomCodeState(response.room_code);

      // Auto-join the created room
      setTimeout(() => {
        router.push(`/room/${response.room_code}`);
      }, 2000);
    } catch (err) {
      console.log('[CreateRoom] Error:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create room';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  if (roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card variant="elevated" className="glow">
            <CardHeader>
              <CardTitle className="text-center">Room Created!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-center">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Your room code:</p>
                <div className="bg-secondary rounded-lg p-6 border border-border">
                  <p className="text-4xl font-bold text-primary tracking-widest font-mono">
                    {roomCode}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Redirecting to room lobby...
              </p>
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle className="text-center">Create New Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <p className="text-muted-foreground text-center">
              Create a new Whist game room. You'll be the admin and can manage
              the game.
            </p>
            <Button
              fullWidth
              onClick={handleCreateRoom}
              disabled={isLoading}
            >
              {isLoading ? 'Creating Room...' : 'Create Room'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
