/**
 * Frisch Indicator Component
 * Shows frisch round and card exchange status
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

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
    <Card variant="outlined" className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200">
      <div className="space-y-3">
        {/* Frisch round indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Frisch Round</span>
          <motion.div
            key={frischRound}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex gap-1"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < frischRound ? 'bg-amber-500' : 'bg-gray-300'
                }`}
              />
            ))}
          </motion.div>
        </div>

        {/* Exchange status */}
        {isExchanging && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="bg-amber-100 border border-amber-300 rounded px-3 py-2"
          >
            <p className="text-xs text-amber-900 font-medium">
              🔄 Exchanging cards...
            </p>
          </motion.div>
        )}

        {/* Minimum bid reminder */}
        <div className="bg-white rounded px-3 py-2 border border-gray-200">
          <p className="text-xs text-gray-600">
            <span className="font-medium">Minimum bid:</span> {minimumBid}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default FrischIndicator;
