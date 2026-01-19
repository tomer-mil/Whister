/**
 * Trick Counter Component
 * Displays tricks won vs contract with progress ring
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

export interface TrickCounterProps {
  tricksWon: number;
  contract: number;
  maxTricks?: number;
  playerName: string;
}

export function TrickCounter({
  tricksWon,
  contract,
  maxTricks = 13,
  playerName,
}: TrickCounterProps) {
  const progress = Math.min(tricksWon, maxTricks) / maxTricks;
  const isOnTrack = tricksWon >= contract;
  const remaining = maxTricks - tricksWon;

  return (
    <Card variant="elevated" className="p-6 text-center">
      <p className="text-sm text-gray-600 mb-4">{playerName}'s Progress</p>

      {/* Progress Ring */}
      <div className="relative w-32 h-32 mx-auto mb-4">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />

          {/* Progress circle */}
          <motion.circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={isOnTrack ? '#10b981' : '#ef4444'}
            strokeWidth="8"
            strokeLinecap="round"
            initial={{ strokeDasharray: 0, strokeDashoffset: 339.29 }}
            animate={{
              strokeDasharray: 339.29,
              strokeDashoffset: 339.29 * (1 - progress),
            }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            key={tricksWon}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center"
          >
            <p className="text-3xl font-bold text-gray-900">{tricksWon}</p>
            <p className="text-xs text-gray-500">/{contract}</p>
          </motion.div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <p className={`text-sm font-medium ${isOnTrack ? 'text-green-600' : 'text-red-600'}`}>
          {isOnTrack ? '✓ On Track' : '✗ Behind'}
        </p>
        <p className="text-xs text-gray-500">
          {remaining} tricks remaining
        </p>
      </div>
    </Card>
  );
}

export default TrickCounter;
