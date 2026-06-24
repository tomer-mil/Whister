'use client';

import { useState } from 'react';

export interface RoomCodeDisplayProps {
  roomCode: string;
}

export function RoomCodeDisplay({ roomCode }: RoomCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="flex items-center gap-3" data-testid="room-code">
      <span className="text-3xl tracking-[0.2em] font-bold text-foreground">
        {roomCode}
      </span>
      <button
        onClick={handleCopy}
        className="p-1.5 border border-muted hover:border-foreground transition-colors"
        aria-label={copied ? 'Copied' : 'Copy room code'}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="2 7 5.5 10.5 12 3.5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="6" y="6" width="12" height="12" />
            <rect x="2" y="2" width="12" height="12" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default RoomCodeDisplay;
