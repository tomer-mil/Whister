'use client';

import { PlayerShape } from '@/components/ui/player-shape';
import type { TrumpSuit } from '@/types/game';

export interface DashboardPlayer {
  playerId: string;
  playerName: string;
  tricksWon: number;
  contract: number;
  seatIndex: number;
}

export interface GameHeaderProps {
  roundNumber: number;
  totalRounds: number;
  trumpSuit?: TrumpSuit;
  players?: DashboardPlayer[];
  currentUserId?: string;
}

export function GameHeader({
  trumpSuit,
  players = [],
  currentUserId,
}: GameHeaderProps) {
  return (
    <div className="px-4 py-3 border-b-2 border-foreground">
      <div className="flex items-center justify-between gap-2">
        {/* Player dashboard entries */}
        <div className="flex items-center gap-4 flex-1 overflow-x-auto">
          {players.map((player) => {
            const isCurrentUser = player.playerId === currentUserId;
            const metContract = player.tricksWon >= player.contract && player.contract > 0;
            const exceededContract = player.tricksWon > player.contract;

            return (
              <div
                key={player.playerId}
                className={`flex items-center gap-2 py-1 ${
                  isCurrentUser ? 'border-b-2 border-ochre' : ''
                }`}
              >
                <PlayerShape
                  playerIndex={player.seatIndex}
                  size={16}
                  filled={true}
                  color={
                    exceededContract ? '#C75233' :
                    metContract ? '#6B8F5E' :
                    undefined
                  }
                />
                <span className="text-lg font-bold">{player.tricksWon}</span>
                <span className="text-xs text-muted-foreground">/ {player.contract}</span>
              </div>
            );
          })}
        </div>

        {/* Trump suit icon */}
        {trumpSuit && (
          <div className="flex-shrink-0 text-right">
            <span className={`text-2xl ${getSuitColorClass(trumpSuit)}`}>
              {getSuitSymbol(trumpSuit)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function getSuitSymbol(suit: TrumpSuit): string {
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', no_trump: 'NT',
  };
  return symbols[suit] || '';
}

function getSuitColorClass(suit: TrumpSuit): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'text-terracotta';
  if (suit === 'clubs' || suit === 'spades') return 'text-foreground';
  return 'text-steel';
}

export default GameHeader;
