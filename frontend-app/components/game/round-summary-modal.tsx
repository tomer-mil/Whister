/**
 * Round Summary Modal Component
 * Shows results after round completion
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <Card variant="elevated" className="max-w-md w-full">
              <div className="p-6 space-y-4">
                {/* Header */}
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <p className="text-3xl font-bold text-gray-900 mb-1">
                    Round {roundNumber} Complete!
                  </p>
                  <p className="text-sm text-gray-600">📊 Results</p>
                </motion.div>

                {/* Results list */}
                <div className="space-y-2">
                  {results.map((result, index) => {
                    const scoreColor = getScoreColor(result.score);
                    const colorClass = scoreColor === 'positive'
                      ? 'text-green-600'
                      : scoreColor === 'negative'
                      ? 'text-red-600'
                      : 'text-gray-600';

                    return (
                      <motion.div
                        key={result.playerId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {result.playerName}
                          </p>
                          <p className="text-xs text-gray-600">
                            {result.tricksWon}/{result.contract} {result.made ? '✓' : '✗'}
                          </p>
                        </div>
                        <motion.p
                          key={result.score}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`text-lg font-bold ${colorClass}`}
                        >
                          {formatScore(result.score)}
                        </motion.p>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Continue button */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Button
                    onClick={onContinue}
                    disabled={isLoading}
                    variant="primary"
                    fullWidth
                    className="mt-2"
                  >
                    {isLoading ? '⏳ Starting new round...' : '▶ Continue to Next Round'}
                  </Button>
                </motion.div>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default RoundSummaryModal;
