/**
 * Score Table Page
 * Shows all completed rounds with cumulative scores
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ScoreTableResponse } from '@/types/score';

export default function ScoreTablePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = React.use(params);
  const router = useRouter();

  const [scoreData, setScoreData] = useState<ScoreTableResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStartingRound, setIsStartingRound] = useState(false);
  const [isEndingGame, setIsEndingGame] = useState(false);

  // Fetch score table data
  useEffect(() => {
    async function fetchScoreTable() {
      try {
        const response = await fetch(`/api/v1/games/${gameId}/score-table`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch score table');
        }

        const data = await response.json();
        setScoreData(data);
      } catch (err) {
        console.error('Error fetching score table:', err);
        setError(err instanceof Error ? err.message : 'Failed to load scores');
      } finally {
        setIsLoading(false);
      }
    }

    fetchScoreTable();
  }, [gameId]);

  // Handle starting new round
  const handleNewRound = async () => {
    if (!scoreData) return;

    setIsStartingRound(true);
    try {
      const response = await fetch(`/api/v1/rooms/${scoreData.room_code}/next-round`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to start next round');
      }

      // Navigate back to game page
      router.push(`/game/${gameId}`);
    } catch (err) {
      console.error('Error starting next round:', err);
      setError(err instanceof Error ? err.message : 'Failed to start next round');
    } finally {
      setIsStartingRound(false);
    }
  };

  // Handle ending game
  const handleEndGame = async () => {
    setIsEndingGame(true);
    try {
      const response = await fetch(`/api/v1/games/${gameId}/end`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to end game');
      }

      const result = await response.json();
      console.log('Game ended:', result);

      // TODO: Navigate to game results/summary page
      router.push(`/game/${gameId}`);
    } catch (err) {
      console.error('Error ending game:', err);
      setError(err instanceof Error ? err.message : 'Failed to end game');
    } finally {
      setIsEndingGame(false);
    }
  };

  // Helper to get trump symbol
  const getTrumpSymbol = (suit: string): string => {
    const symbols: Record<string, string> = {
      clubs: '♣',
      diamonds: '♦',
      hearts: '♥',
      spades: '♠',
      no_trump: 'NT',
    };
    return symbols[suit] || '?';
  };

  // Helper to get score color
  const getScoreColor = (score: number): string => {
    if (score > 0) return 'text-green-600';
    if (score < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <p className="text-lg text-gray-600">Loading score table...</p>
      </main>
    );
  }

  if (error || !scoreData) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card variant="elevated" className="p-6 max-w-md">
          <p className="text-red-600">{error || 'Failed to load score table'}</p>
          <Button
            onClick={() => router.push(`/game/${gameId}`)}
            className="mt-4"
            fullWidth
          >
            Back to Game
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Game Score Table</h1>
          <p className="text-gray-600 mt-1">Room: {scoreData.room_code}</p>
        </div>

        {/* Score Table */}
        <Card variant="elevated" className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="p-3 text-left font-semibold text-gray-700">Round</th>
                <th className="p-3 text-center font-semibold text-gray-700">Trump</th>
                {scoreData.players.map((player) => (
                  <th key={player.user_id} className="p-3 text-center font-semibold text-gray-700">
                    {player.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoreData.rounds.map((round) => (
                <tr key={round.round_number} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-3 text-center font-medium">{round.round_number}</td>
                  <td className="p-3 text-center text-2xl">
                    {getTrumpSymbol(round.trump_suit)}
                  </td>
                  {round.players.map((player) => (
                    <td key={player.user_id} className="p-3 text-center">
                      <div className={`text-lg font-bold ${getScoreColor(player.score)}`}>
                        {player.score}
                      </div>
                      <div className="text-xs text-gray-500">
                        ({player.tricks_won}/{player.contract_bid})
                      </div>
                    </td>
                  ))}
                </tr>
              ))}

              {/* Totals Row */}
              <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                <td colSpan={2} className="p-4 text-center text-lg">TOTAL</td>
                {scoreData.players.map((player) => (
                  <td key={player.user_id} className="p-4 text-center">
                    <div className={`text-xl ${getScoreColor(scoreData.cumulative_scores[player.user_id] || 0)}`}>
                      {scoreData.cumulative_scores[player.user_id] || 0}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button
            onClick={handleNewRound}
            disabled={isStartingRound || isEndingGame}
            variant="primary"
            className="min-w-[180px]"
          >
            {isStartingRound ? '⏳ Starting...' : '▶ NEW ROUND'}
          </Button>
          <Button
            onClick={handleEndGame}
            disabled={isStartingRound || isEndingGame}
            variant="secondary"
            className="min-w-[180px]"
          >
            {isEndingGame ? '⏳ Ending...' : '🏁 END GAME'}
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <Card variant="outlined" className="p-4 border-red-300 bg-red-50">
            <p className="text-red-700 text-center">{error}</p>
          </Card>
        )}
      </div>
    </main>
  );
}
