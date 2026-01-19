/**
 * Join Room Form Component
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { roomsApi } from '@/lib/api';

// Validation schema for join room
const joinRoomSchema = z.object({
  roomCode: z
    .string()
    .min(1, 'Room code is required')
    .length(6, 'Room code must be 6 characters')
    .toUpperCase(),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must be less than 50 characters'),
});

type JoinRoomFormData = z.infer<typeof joinRoomSchema>;

export function JoinRoomForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinRoomFormData>({
    resolver: zodResolver(joinRoomSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (data: JoinRoomFormData) => {
    setServerError(null);
    setIsLoading(true);

    try {
      await roomsApi.joinRoom(data.roomCode, {
        display_name: data.displayName,
      });

      // Redirect to room lobby
      router.push(`/room/${data.roomCode}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to join room';
      setServerError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle className="text-center">Join Room</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Server Error */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {serverError}
            </div>
          )}

          {/* Room Code Input */}
          <Input
            label="Room Code"
            type="text"
            placeholder="ABC123"
            maxLength={6}
            error={errors.roomCode?.message}
            {...register('roomCode')}
          />

          {/* Display Name Input */}
          <Input
            label="Your Display Name"
            type="text"
            placeholder="Your name"
            error={errors.displayName?.message}
            {...register('displayName')}
          />

          {/* Submit Button */}
          <Button
            type="submit"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Joining...' : 'Join Room'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default JoinRoomForm;
