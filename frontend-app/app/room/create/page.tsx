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
      const response = await roomsApi.createRoom();
      setRoomCodeState(response.room_code);

      // Auto-join the created room
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle className="text-center">Room Created!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-center">
              <div>
                <p className="text-sm text-gray-600 mb-2">Your room code:</p>
                <div className="bg-gray-100 rounded-lg p-6">
                  <p className="text-4xl font-bold text-gray-900 tracking-widest font-mono">
                    {roomCode}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Redirecting to room lobby...
              </p>
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle className="text-center">Create New Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <p className="text-gray-600 text-center">
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
