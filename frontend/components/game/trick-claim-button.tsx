/**
 * Trick Claim Button Component
 * Large satisfying button for claiming tricks
 */

'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export interface TrickClaimButtonProps {
  onClaim: () => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
  error?: string;
}

export function TrickClaimButton({
  onClaim,
  disabled = false,
  isLoading = false,
  error,
}: TrickClaimButtonProps) {
  const isDisabled = disabled || isLoading;

  const handleClick = async () => {
    if (isDisabled) return;

    // Haptic feedback if available
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    try {
      await onClaim();
    } catch (err) {
      // Error is handled via error prop
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        whileHover={!isDisabled ? { scale: 1.05 } : {}}
        whileTap={!isDisabled ? { scale: 0.95 } : {}}
      >
        <Button
          onClick={handleClick}
          disabled={isDisabled}
          variant="primary"
          className="w-32 h-32 rounded-full text-3xl font-bold shadow-lg hover:shadow-xl transition-shadow"
        >
          {isLoading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              ⏳
            </motion.div>
          ) : (
            '🎯'
          )}
        </Button>
      </motion.div>

      {!isLoading && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {isDisabled ? (
            <span className="text-sm text-gray-500">Round complete</span>
          ) : (
            <>
              <span className="block text-lg font-bold text-gray-900">
                CLAIM TRICK
              </span>
              <span className="text-xs text-gray-600">Tap or Click</span>
            </>
          )}
        </motion.p>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-red-600 text-center max-w-xs"
        >
          {error}
        </motion.div>
      )}
    </div>
  );
}

export default TrickClaimButton;
