/**
 * Suit Selector Component
 * 5 suit buttons for trump selection
 */

'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { TrumpSuit } from '@/types/game';

export interface SuitSelectorProps {
  value: TrumpSuit | null;
  onChange: (suit: TrumpSuit) => void;
  disabled?: boolean;
  label?: string;
}

const SUITS: Array<{ suit: TrumpSuit; label: string; symbol: string; color: string }> = [
  { suit: 'clubs', label: 'Clubs', symbol: '♣', color: 'text-gray-900' },
  { suit: 'diamonds', label: 'Diamonds', symbol: '♦', color: 'text-red-600' },
  { suit: 'hearts', label: 'Hearts', symbol: '♥', color: 'text-red-600' },
  { suit: 'spades', label: 'Spades', symbol: '♠', color: 'text-gray-900' },
  { suit: 'no_trump', label: 'No Trump', symbol: 'NT', color: 'text-blue-600' },
];

export function SuitSelector({
  value,
  onChange,
  disabled = false,
  label,
}: SuitSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {label && <p className="text-sm font-medium text-gray-600">{label}</p>}

      <div className="flex gap-2 flex-wrap justify-center">
        {SUITS.map((suit) => (
          <motion.div
            key={suit.suit}
            whileHover={{ scale: disabled ? 1 : 1.05 }}
            whileTap={{ scale: disabled ? 1 : 0.95 }}
          >
            <Button
              onClick={() => !disabled && onChange(suit.suit)}
              disabled={disabled}
              variant={value === suit.suit ? 'primary' : 'outline'}
              className={`flex flex-col items-center gap-1 px-4 py-3 h-auto ${
                value === suit.suit ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <span className={`text-2xl ${suit.color}`}>{suit.symbol}</span>
              <span className="text-xs">{suit.label}</span>
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default SuitSelector;
