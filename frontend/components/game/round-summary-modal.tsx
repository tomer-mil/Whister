'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerShape } from '@/components/ui/player-shape';
import { formatScore, getScoreColor } from '@/lib/utils/score-calculator';

export interface PlayerResult {
  playerId: string;
  playerName: string;
  contract: number;
  tricksWon: number;
  score: number;
  made: boolean;
}

export interface RoundSummaryModalProps {
  isOpen: boolean;
  roundNumber: number;
  results: PlayerResult[];
  onContinue: () => void;
  isLoading?: boolean;
}

export function RoundSummaryModal({
  isOpen,
  roundNumber,
  results,
  onContinue,
  isLoading = false,
}: RoundSummaryModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
          />

          {/* Modal — slides up, dark background */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh]"
          >
            <div className="bg-[#1A1A1A] text-[#F5F0EB] p-6 space-y-6">
              {/* Header */}
              <div className="text-center">
                <p className="text-2xl font-bold uppercase tracking-[0.2em]">
                  Round {roundNumber}
                </p>
              </div>

              {/* Results grid */}
              <div className="space-y-3">
                {results.map((result, index) => {
                  const scoreColor = getScoreColor(result.score);
                  const colorClass = scoreColor === 'positive'
                    ? 'text-ochre'
                    : scoreColor === 'negative'
                    ? 'text-terracotta'
                    : 'text-[#8A8078]';

                  return (
                    <motion.div
                      key={result.playerId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.2 }}
                      className="flex items-center gap-3 py-2"
                    >
                      <PlayerShape
                        playerIndex={index}
                        size={20}
                        filled={true}
                        color="#F5F0EB"
                      />
                      <span className="text-sm flex-1 truncate">{result.playerName}</span>
                      <span className="text-xs text-[#8A8078]">
                        {result.tricksWon}/{result.contract}
                      </span>
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + index * 0.1, duration: 0.15, ease: 'easeOut' }}
                        className={`text-xl font-bold ${colorClass}`}
                      >
                        {formatScore(result.score)}
                      </motion.span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Continue button — inverted (light on dark) */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  onClick={onContinue}
                  disabled={isLoading}
                  fullWidth
                  size="lg"
                  className="bg-[#F5F0EB] text-[#1A1A1A] hover:bg-[#EAE4DD]"
                >
                  {isLoading ? 'Loading...' : 'Continue'}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default RoundSummaryModal;
