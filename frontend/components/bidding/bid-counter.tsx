'use client';

import { motion } from 'framer-motion';

export interface BidCounterProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function BidCounter({
  value,
  min = 5,
  max = 13,
  onChange,
  disabled = false,
}: BidCounterProps) {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = () => {
    if (canDecrement && !disabled) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (canIncrement && !disabled) {
      onChange(value + 1);
    }
  };

  return (
    <div className="flex items-center justify-center gap-6">
      <button
        data-testid="bidding-counter-minus"
        onClick={handleDecrement}
        disabled={!canDecrement || disabled}
        className="w-12 h-12 rounded-full border-2 border-foreground flex items-center justify-center text-xl font-bold
          disabled:opacity-30 disabled:cursor-not-allowed
          hover:bg-foreground hover:text-background active:scale-95 transition-all"
      >
        −
      </button>

      <motion.div
        key={value}
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-16 text-center"
      >
        <span className="text-5xl font-semibold text-foreground" data-testid="bidding-counter-value">{value}</span>
      </motion.div>

      <button
        data-testid="bidding-counter-plus"
        onClick={handleIncrement}
        disabled={!canIncrement || disabled}
        className="w-12 h-12 rounded-full border-2 border-foreground flex items-center justify-center text-xl font-bold
          disabled:opacity-30 disabled:cursor-not-allowed
          hover:bg-foreground hover:text-background active:scale-95 transition-all"
      >
        +
      </button>
    </div>
  );
}

export default BidCounter;
