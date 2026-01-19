/**
 * Scores Page
 * Displays cumulative score table across all rounds
 */

'use client';

import { useStore } from '@/stores';
import { GameHeader } from '@/components/game/game-header';
import { ScoreTable } from '@/components/scores/score-table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ScoresPage() {
  // Get game state
  const currentRound = useStore((state) => state.currentRound);
  const totalRounds = useStore((state) => state.totalRounds);
  const gamePlayers = useStore((state) => state.gamePlayers);
  const rounds = useStore((state) => state.rounds);
  const playerTotals = useStore((state) => state.playerTotals);

  // Transform round data for score table
  const processedRounds = rounds.map((round) =>
    gamePlayers.map((player) => {
      const playerScore = round.playerScores.find((s) => s.playerId === player.userId);
      return {
        playerId: player.userId,
        contract: playerScore?.contractBid ?? 0,
        tricksWon: playerScore?.tricksWon ?? 0,
        score: playerScore?.score ?? 0,
      };
    })
  );

  // Calculate total scores from playerTotals
  const totalScores: Record<string, number> = {};
  playerTotals.forEach((total) => {
    totalScores[total.playerId] = total.totalScore;
  });

  // Find winner
  const sortedPlayers = [...playerTotals].sort((a, b) => b.totalScore - a.totalScore);
  const winner = sortedPlayers[0];

  const isGameOver = currentRound > totalRounds;
  const canReturnToGame = currentRound <= totalRounds;

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Game header */}
        <GameHeader
          roundNumber={currentRound}
          totalRounds={totalRounds}
        />

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Score Table</h1>
          <p className="text-gray-600">
            {currentRound - 1} of {totalRounds} rounds completed
          </p>
        </div>

        {/* Score table */}
        <ScoreTable
          players={gamePlayers.map((p) => ({
            playerId: p.userId,
            displayName: p.displayName,
          }))}
          rounds={processedRounds}
          totalScores={totalScores}
          currentRoundIndex={currentRound - 1}
        />

        {/* Game over banner */}
        {isGameOver && winner && (
          <Card variant="elevated" className="bg-gradient-to-r from-amber-50 to-amber-50 border-2 border-amber-300 p-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-900 mb-2">🏆 Game Complete!</p>
              <p className="text-lg text-amber-800 mb-4">
                {winner.displayName} wins with {winner.totalScore} points!
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/">
                  <Button variant="primary" fullWidth>
                    Return to Home
                  </Button>
                </Link>
                <Link href={`/room/new`}>
                  <Button variant="secondary" fullWidth>
                    Start New Game
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Return to game button */}
        {canReturnToGame && (
          <div className="flex justify-center">
            <Link href={`/room`}>
              <Button variant="primary">← Back to Game</Button>
            </Link>
          </div>
        )}

        {/* Player standings */}
        <Card variant="outlined" className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Current Standings</h2>
          <div className="space-y-3">
            {playerTotals.map((player, index) => {
              const medal =
                index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
              return (
                <div
                  key={player.playerId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{medal}</span>
                    <span className="font-medium text-gray-900">{player.displayName}</span>
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      player.totalScore > 0
                        ? 'text-green-600'
                        : player.totalScore < 0
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {player.totalScore > 0 ? `+${player.totalScore}` : player.totalScore}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </main>
  );
}
