'use client';

import { motion } from 'framer-motion';

export interface FrischIndicatorProps {
  frischRound: number;
  minimumBid: number;
  isExchanging?: boolean;
}

export function FrischIndicator({
  frischRound,
  minimumBid,
  isExchanging = false,
}: FrischIndicatorProps) {
  return (
    <div className="bg-ochre/10 border-l-4 border-ochre px-4 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ochre">
          Frisch
        </span>
        <motion.div
          key={frischRound}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex gap-1"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 ${
                i < frischRound ? 'bg-ochre' : 'bg-muted'
              }`}
            />
          ))}
        </motion.div>
      </div>

      {isExchanging && (
        <p className="text-xs text-ochre mt-1 uppercase tracking-[0.1em]">
          Exchanging cards...
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-1">
        Minimum bid: {minimumBid}
      </p>
    </div>
  );
}

export default FrischIndicator;
