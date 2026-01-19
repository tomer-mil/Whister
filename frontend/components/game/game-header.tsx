/**
 * Game Header Component
 * Displays round number, trump suit, and game type
 */

'use client';

import { Card } from '@/components/ui/card';
import { ConnectionStatus } from '@/components/shared/connection-status';
import type { TrumpSuit, GameType } from '@/types/game';

export interface GameHeaderProps {
  roundNumber: number;
  totalRounds: number;
  trumpSuit?: TrumpSuit;
  gameType?: GameType;
}

export function GameHeader({
  roundNumber,
  totalRounds,
  trumpSuit,
  gameType,
}: GameHeaderProps) {
  return (
    <Card variant="elevated" className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
      <div className="flex items-center justify-between gap-4">
        {/* Round info */}
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-1">Round</p>
          <p className="text-2xl font-bold text-gray-900">
            {roundNumber} <span className="text-sm text-gray-500">/ {totalRounds}</span>
          </p>
        </div>

        {/* Trump suit and game type */}
        <div className="flex-1 text-center">
          {trumpSuit ? (
            <div>
              <p className="text-sm text-gray-600 mb-1">Trump Suit</p>
              <p className="text-2xl font-bold">{getSuitSymbol(trumpSuit)}</p>
              {gameType && (
                <p className="text-xs text-gray-500 mt-1 capitalize">{gameType}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600">Trump Suit</p>
              <p className="text-lg text-gray-400">Not Set</p>
            </div>
          )}
        </div>

        {/* Connection status */}
        <div className="flex-1 flex justify-end">
          <ConnectionStatus />
        </div>
      </div>
    </Card>
  );
}

function getSuitSymbol(suit: TrumpSuit): string {
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
    no_trump: 'NT',
  };
  return symbols[suit] || '';
}

export default GameHeader;
