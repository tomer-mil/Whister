'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { roomsApi } from '@/lib/api';

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
    <div>
      <h1 className="text-lg font-semibold uppercase tracking-[0.15em] text-foreground text-center mb-10">
        Join a Room
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {serverError && (
          <p className="text-sm text-terracotta text-center">{serverError}</p>
        )}

        <Input
          type="text"
          placeholder="Room Code"
          maxLength={6}
          className="text-2xl font-bold tracking-[0.2em] uppercase"
          error={errors.roomCode?.message}
          autoCorrect="off"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          {...register('roomCode')}
        />

        <Input
          type="text"
          placeholder="Your Name"
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <div className="pt-4">
          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? 'Joining...' : 'Join'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default JoinRoomForm;
