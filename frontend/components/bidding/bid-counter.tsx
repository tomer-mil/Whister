/**
 * Bid Counter Component
 * Number display with +/- buttons for bid selection
 */

'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export interface BidCounterProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}

export function BidCounter({
  value,
  min = 5,
  max = 13,
  onChange,
  disabled = false,
  label,
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
    <div className="flex flex-col items-center gap-2">
      {label && <p className="text-sm font-medium text-gray-600">{label}</p>}

      <div className="flex items-center gap-4 bg-gray-50 rounded-lg p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDecrement}
          disabled={!canDecrement || disabled}
          className="w-10 h-10 p-0"
        >
          −
        </Button>

        <motion.div
          key={value}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-16 text-center"
        >
          <div className="text-4xl font-bold text-gray-900">{value}</div>
        </motion.div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleIncrement}
          disabled={!canIncrement || disabled}
          className="w-10 h-10 p-0"
        >
          +
        </Button>
      </div>

      <div className="text-xs text-gray-500">
        Range: {min}–{max}
      </div>
    </div>
  );
}

export default BidCounter;
