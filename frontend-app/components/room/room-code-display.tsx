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
    <Card variant="elevated" className="p-6">
      <div className="text-center space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Room Code</h3>
        <div className="bg-gray-100 rounded-lg p-6">
          <p className="text-4xl font-bold text-gray-900 tracking-widest font-mono">
            {roomCode}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleCopy}
            className="flex-1"
          >
            {copied ? '✓ Copied' : 'Copy Code'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleShare}
            className="flex-1"
          >
            Share
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Share this code with friends to join the game
        </p>
      </div>
    </Card>
  );
}

export default RoomCodeDisplay;
