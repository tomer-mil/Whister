'use client';

import { motion } from 'framer-motion';
import { PlayerShape } from '@/components/ui/player-shape';

export interface PlayerProgressRingProps {
  playerName: string;
  tricksWon: number;
  contract: number;
  seatIndex: number;
  maxTricks?: number;
  isYourPlayer?: boolean;
}

export function PlayerProgressRing({
  playerName,
  tricksWon,
  contract,
  seatIndex,
  isYourPlayer = false,
}: PlayerProgressRingProps) {
  const metContract = tricksWon >= contract && contract > 0;
  const exceededContract = tricksWon > contract;

  return (
    <div className={`flex-1 flex flex-col items-center gap-1.5 py-2 ${
      isYourPlayer ? 'border-b-2 border-ochre' : ''
    }`}>
      <PlayerShape
        playerIndex={seatIndex}
        size={16}
        filled={true}
        color={
          exceededContract ? '#C75233' :
          metContract ? '#6B8F5E' :
          undefined
        }
      />

      <motion.span
        key={tricksWon}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="text-lg font-bold"
        data-testid={`playing-trick-count-${seatIndex}`}
      >
        {tricksWon}
      </motion.span>

      <span className="text-xs text-muted-foreground">/ {contract}</span>

      <span className="text-[10px] text-muted-foreground truncate max-w-[4rem]">
        {playerName}
      </span>
    </div>
  );
}

export default PlayerProgressRing;
