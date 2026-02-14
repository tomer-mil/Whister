'use client';

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
}: ScoreCellProps) {
  if (contract === undefined || tricksWon === undefined) {
    return (
      <div className="h-14 flex items-center justify-center text-muted-foreground">
        -
      </div>
    );
  }

  const scoreColor = getScoreColor(score ?? 0);
  const scoreColorClass = scoreColor === 'positive'
    ? 'text-ochre'
    : scoreColor === 'negative'
    ? 'text-terracotta'
    : 'text-muted-foreground';

  return (
    <div className="h-14 flex flex-col items-center justify-center px-2">
      <span className="text-xs text-muted-foreground">
        {tricksWon}/{contract}
      </span>
      {score !== undefined && (
        <span className={`text-lg font-semibold ${scoreColorClass}`}>
          {score > 0 ? `+${score}` : score}
        </span>
      )}
    </div>
  );
}

export default ScoreCell;
