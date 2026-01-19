/**
 * Player Progress Ring Component
 * Circular progress indicator for a single player
 */

'use client';

import { motion } from 'framer-motion';

export interface PlayerProgressRingProps {
  playerName: string;
  tricksWon: number;
  contract: number;
  maxTricks?: number;
  isYourPlayer?: boolean;
}

export function PlayerProgressRing({
  playerName,
  tricksWon,
  contract,
  maxTricks = 13,
  isYourPlayer = false,
}: PlayerProgressRingProps) {
  const progress = Math.min(tricksWon, maxTricks) / maxTricks;
  const isOnTrack = tricksWon >= contract;
  const ringColor = isOnTrack ? '#10b981' : '#ef4444';

  return (
    <div className={`flex flex-col items-center gap-2 p-3 rounded-lg ${
      isYourPlayer ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50'
    }`}>
      {/* Mini progress ring */}
      <div className="relative w-16 h-16">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 60 60">
          {/* Background */}
          <circle cx="30" cy="30" r="27" fill="none" stroke="#e5e7eb" strokeWidth="4" />

          {/* Progress */}
          <motion.circle
            cx="30"
            cy="30"
            r="27"
            fill="none"
            stroke={ringColor}
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ strokeDasharray: 0, strokeDashoffset: 169.6 }}
            animate={{
              strokeDasharray: 169.6,
              strokeDashoffset: 169.6 * (1 - progress),
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            key={tricksWon}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <p className="text-xs font-bold text-gray-900">{tricksWon}</p>
            <p className="text-[10px] text-gray-600">{contract}</p>
          </motion.div>
        </div>
      </div>

      {/* Player info */}
      <div className="text-center w-full">
        <p className="text-xs font-semibold text-gray-900 truncate">
          {playerName}
        </p>
        <p className={`text-[10px] font-medium ${isOnTrack ? 'text-green-600' : 'text-red-600'}`}>
          {isOnTrack ? '✓' : '✗'}
        </p>
      </div>
    </div>
  );
}

export default PlayerProgressRing;
