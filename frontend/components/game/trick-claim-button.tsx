'use client';

import { motion } from 'framer-motion';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

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

    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    try {
      await onClaim();
    } catch {
      // Error is handled via error prop
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        onClick={handleClick}
        disabled={isDisabled}
        whileTap={!isDisabled ? { scale: 0.97 } : {}}
        className={`
          w-full py-8 text-xl font-bold uppercase tracking-[0.1em] transition-all
          ${isDisabled
            ? 'border-2 border-muted text-muted-foreground cursor-not-allowed'
            : 'bg-foreground text-background hover:bg-primary-hover active:scale-[0.97]'
          }
        `}
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <LoadingSpinner size="sm" className="border-background" />
          </div>
        ) : isDisabled ? (
          'Round Complete'
        ) : (
          'Claim Trick'
        )}
      </motion.button>

      {error && (
        <p className="text-xs text-terracotta text-center">{error}</p>
      )}
    </div>
  );
}

export default TrickClaimButton;
