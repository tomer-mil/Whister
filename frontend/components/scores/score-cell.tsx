/**
 * Score Cell Component
 * Individual cell in score table showing contract/tricks and score
 */

'use client';

import { motion } from 'framer-motion';
import { getScoreColor } from '@/lib/utils/score-calculator';

export interface ScoreCellProps {
  contract?: number;
  tricksWon?: number;
  score?: number;
  isTotal?: boolean;
  isCurrent?: boolean;
}

export function ScoreCell({
  contract,
  tricksWon,
  score,
  isTotal = false,
  isCurrent = false,
}: ScoreCellProps) {
  // Empty cell for placeholder rounds
  if (contract === undefined || tricksWon === undefined) {
    return (
      <div className="h-16 px-2 py-3 text-center text-gray-300">
        -
      </div>
    );
  }

  const made = contract > 0 ? tricksWon >= contract : tricksWon <= -contract;
  const indicator = made ? '✓' : '✗';
  const scoreColor = getScoreColor(score ?? 0);
  const scoreColorClass = scoreColor === 'positive'
    ? 'text-green-600'
    : scoreColor === 'negative'
    ? 'text-red-600'
    : 'text-gray-600';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`h-16 px-2 py-3 text-center border-l flex flex-col justify-center items-center ${
        isCurrent ? 'bg-blue-50 border-blue-300' : 'border-gray-200'
      } ${isTotal ? 'bg-gray-50 font-bold border-t-2 border-t-gray-300' : ''}`}
    >
      <div className="text-xs text-gray-600 mb-1">
        {tricksWon}/{contract} {indicator}
      </div>
      {score !== undefined && (
        <motion.div
          key={score}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`text-sm font-bold ${scoreColorClass}`}
        >
          {score > 0 ? `+${score}` : score}
        </motion.div>
      )}
    </motion.div>
  );
}

export default ScoreCell;
