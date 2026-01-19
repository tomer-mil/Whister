/**
 * Score Table Component
 * Displays game scores across rounds with player columns and round rows
 * Responsive with horizontal scroll on mobile
 */

'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { ScoreCell } from './score-cell';

export interface RoundScore {
  playerId: string;
  contract: number;
  tricksWon: number;
  score: number;
}

export interface ScoreTableProps {
  players: Array<{
    playerId: string;
    displayName: string;
  }>;
  rounds: Array<RoundScore[]>;
  totalScores: Record<string, number>;
  currentRoundIndex?: number;
}

export function ScoreTable({
  players,
  rounds,
  totalScores,
  currentRoundIndex,
}: ScoreTableProps) {
  // Ensure all rounds have entries for all players
  const normalizedRounds = rounds.map((round) => {
    const roundMap = new Map(round.map((score) => [score.playerId, score]));
    return players.map((player) => roundMap.get(player.playerId));
  });

  // Pad with empty rounds if needed
  const maxRounds = Math.max(normalizedRounds.length, 10);
  const paddedRounds = [
    ...normalizedRounds,
    ...Array(Math.max(0, maxRounds - normalizedRounds.length)).fill(
      players.map(() => undefined)
    ),
  ];

  return (
    <Card variant="elevated" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {/* Header */}
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 bg-gray-50 sticky left-0 z-10">
                Round
              </th>
              {players.map((player) => (
                <th
                  key={player.playerId}
                  className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-24"
                >
                  {player.displayName}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {paddedRounds.map((round, roundIndex) => (
              <motion.tr
                key={roundIndex}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: roundIndex * 0.05 }}
                className={`border-b ${
                  currentRoundIndex === roundIndex
                    ? 'bg-blue-50'
                    : roundIndex % 2 === 0
                    ? 'bg-white'
                    : 'bg-gray-50'
                }`}
              >
                {/* Round number */}
                <td className="px-3 py-3 text-sm font-medium text-gray-900 bg-gray-50 sticky left-0 z-10">
                  Round {roundIndex + 1}
                </td>

                {/* Player scores */}
                {round.map((scoreData, playerIndex) => (
                  <td key={`${roundIndex}-${playerIndex}`} className="p-0">
                    <ScoreCell
                      contract={scoreData?.contract}
                      tricksWon={scoreData?.tricksWon}
                      score={scoreData?.score}
                      isCurrent={currentRoundIndex === roundIndex}
                    />
                  </td>
                ))}
              </motion.tr>
            ))}

            {/* Total row */}
            <motion.tr
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gray-100 border-t-2 border-t-gray-300 font-bold"
            >
              <td className="px-3 py-3 text-sm font-bold text-gray-900 bg-gray-100 sticky left-0 z-10">
                Total
              </td>
              {players.map((player) => (
                <td key={`total-${player.playerId}`} className="p-0">
                  <div className="h-16 px-2 py-3 text-center border-l border-gray-200 flex items-center justify-center">
                    <motion.div
                      key={totalScores[player.playerId] ?? 0}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`text-lg font-bold ${
                        (totalScores[player.playerId] ?? 0) > 0
                          ? 'text-green-600'
                          : (totalScores[player.playerId] ?? 0) < 0
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {totalScores[player.playerId] ?? 0 > 0
                        ? `+${totalScores[player.playerId]}`
                        : totalScores[player.playerId] ?? 0}
                    </motion.div>
                  </div>
                </td>
              ))}
            </motion.tr>
          </tbody>
        </table>
      </div>

      {/* Mobile helper text */}
      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600 md:hidden">
        📱 Scroll horizontally to see all players
      </div>
    </Card>
  );
}

export default ScoreTable;
