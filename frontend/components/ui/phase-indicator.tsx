'use client';

import { cn } from '@/lib/utils/cn';

export interface PhaseIndicatorProps {
  /** Current phase index (0 = seating, 1 = bidding, 2 = playing) */
  currentPhase: number;
  className?: string;
}

const PHASES = ['SEATING', 'BIDDING', 'PLAYING'];

export function PhaseIndicator({ currentPhase, className }: PhaseIndicatorProps) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-2', className)}>
      {PHASES.map((phase, index) => (
        <div key={phase} className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'w-2.5 h-2.5 border-2 border-foreground transition-colors',
                index <= currentPhase ? 'bg-foreground' : 'bg-transparent'
              )}
            />
            <span
              className={cn(
                'text-[9px] font-semibold tracking-[0.15em] uppercase',
                index === currentPhase ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {phase}
            </span>
          </div>
          {index < PHASES.length - 1 && (
            <div className="w-6 h-[2px] bg-foreground mb-3" />
          )}
        </div>
      ))}
    </div>
  );
}

export default PhaseIndicator;
