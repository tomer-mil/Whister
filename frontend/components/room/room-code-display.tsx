/**
 * Room Code Display Component
 * Shows room code with copy and share functionality
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface RoomCodeDisplayProps {
  roomCode: string;
}

export function RoomCodeDisplay({ roomCode }: RoomCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShare = async () => {
    const shareText = `Join my Whist game! Room code: ${roomCode}`;
    const shareUrl = `${window.location.origin}/room/join?code=${roomCode}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Whist Game',
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    } else {
      // Fallback: copy the URL
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy URL:', error);
      }
    }
  };

  return (
    <Card variant="elevated" className="p-4 sm:p-6 glow">
      <div className="text-center space-y-3 sm:space-y-4">
        <h3 className="text-sm sm:text-lg font-semibold text-muted-foreground">Room Code</h3>
        {/* Tap-to-copy room code */}
        <button
          onClick={handleCopy}
          className="w-full bg-secondary rounded-lg p-4 sm:p-6 border border-border hover:border-primary/50 active:scale-[0.98] transition-all cursor-pointer group"
          aria-label="Tap to copy room code"
        >
          <p className="text-3xl sm:text-4xl font-bold text-primary tracking-widest font-mono group-hover:text-primary/80">
            {roomCode}
          </p>
          <p className="text-xs text-muted-foreground mt-2 group-hover:text-foreground/70">
            {copied ? '✓ Copied!' : 'Tap to copy'}
          </p>
        </button>
        {/* Share button - full width on mobile */}
        <Button
          variant="secondary"
          onClick={handleShare}
          fullWidth
          size="lg"
        >
          Share with Friends
        </Button>
        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
          Share this code with friends to join the game
        </p>
      </div>
    </Card>
  );
}

export default RoomCodeDisplay;
