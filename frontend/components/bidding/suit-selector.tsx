'use client';

import type { TrumpSuit } from '@/types/game';

export interface SuitSelectorProps {
  value: TrumpSuit | null;
  onChange: (suit: TrumpSuit) => void;
  disabled?: boolean;
}

const SUITS: Array<{ suit: TrumpSuit; symbol: string; color: string }> = [
  { suit: 'clubs', symbol: '♣', color: 'text-suit-clubs' },
  { suit: 'diamonds', symbol: '♦', color: 'text-suit-diamonds' },
  { suit: 'hearts', symbol: '♥', color: 'text-suit-hearts' },
  { suit: 'spades', symbol: '♠', color: 'text-suit-spades' },
  { suit: 'no_trump', symbol: 'NT', color: 'text-steel' },
];

export function SuitSelector({
  value,
  onChange,
  disabled = false,
}: SuitSelectorProps) {
  return (
    <div className="flex gap-2 justify-center">
      {SUITS.map((s) => {
        const isSelected = value === s.suit;
        return (
          <button
            key={s.suit}
            data-testid={`bidding-suit-${s.suit === 'no_trump' ? 'notrump' : s.suit}`}
            onClick={() => !disabled && onChange(s.suit)}
            disabled={disabled}
            className={`
              w-14 h-14 flex items-center justify-center text-2xl
              border-2 transition-all active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isSelected
                ? 'border-foreground scale-105'
                : 'border-muted hover:border-foreground'
              }
              ${s.suit === 'no_trump' ? 'text-base font-bold' : ''}
            `}
          >
            <span className={s.color}>{s.symbol}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SuitSelector;
