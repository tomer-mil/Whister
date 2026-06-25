'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { PlayerShape } from '@/components/ui/player-shape';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
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

  useEffect(() => {
    async function fetchScoreTable() {
      try {
        const response = await fetch(`/api/v1/games/${gameId}/score-table`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to fetch score table');
        const data = await response.json();
        setScoreData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scores');
      } finally {
        setIsLoading(false);
      }
    }
    fetchScoreTable();
  }, [gameId]);

  useEffect(() => {
    if (!scoreData?.room_code) return;
    const store = useStore.getState();
    if (!store.roomCode) {
      store.setRoomData({
        roomCode: scoreData.room_code,
        roomId: gameId,
        isAdmin: false,
        players: scoreData.players.map((p) => ({
          userId: p.user_id,
          displayName: p.display_name,
          seatPosition: p.seat_position,
          isConnected: true,
          isAdmin: false,
        })),
      });
    }
  }, [scoreData, gameId]);

  const handleNewRound = async () => {
    if (!scoreData) return;
    setIsStartingRound(true);
    try {
      const response = await fetch(`/api/v1/rooms/${scoreData.room_code}/next-round`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to start next round');
      router.push(`/game/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start next round');
    } finally {
      setIsStartingRound(false);
    }
  };

  const handleEndGame = async () => {
    setIsEndingGame(true);
    try {
      const response = await fetch(`/api/v1/games/${gameId}/end`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to end game');
      await response.json();
      router.push(`/game/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end game');
    } finally {
      setIsEndingGame(false);
    }
  };

  const getTrumpSymbol = (suit: string): string => {
    const symbols: Record<string, string> = {
      clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', no_trump: 'NT',
    };
    return symbols[suit] || '?';
  };

  const getTrumpColor = (suit: string): string => {
    if (suit === 'hearts' || suit === 'diamonds') return 'text-terracotta';
    if (suit === 'clubs' || suit === 'spades') return 'text-foreground';
    return 'text-steel';
  };

  const getScoreColor = (score: number): string => {
    if (score > 0) return 'text-ochre';
    if (score < 0) return 'text-terracotta';
    return 'text-muted-foreground';
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (error && !scoreData) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-sm text-terracotta">{error}</p>
        <Button onClick={() => router.push(`/game/${gameId}`)}>
          Back to Game
        </Button>
      </main>
    );
  }

  if (!scoreData) return null;

  // Find leading player
  const maxScore = Math.max(...Object.values(scoreData.cumulative_scores), 0);
  const leadingPlayerId = Object.entries(scoreData.cumulative_scores).find(([, s]) => s === maxScore)?.[0];

  return (
    <main className="min-h-screen pb-safe-bottom">
      {/* Header info */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-[0.1em]">
          {scoreData.room_code}
        </span>
        <span className="text-xs text-muted-foreground">
          Round {scoreData.current_round}
        </span>
      </div>

      {/* Mondrian Score Grid */}
      <div className="px-2 overflow-x-auto">
        <table className="w-full border-collapse border-2 border-foreground">
          <thead>
            <tr>
              <th className="border-2 border-foreground p-2 text-xs font-bold uppercase tracking-[0.1em] w-12">#</th>
              <th className="border-2 border-foreground p-2 text-xs font-bold uppercase tracking-[0.1em] w-10">T</th>
              {scoreData.players.map((player, index) => (
                <th key={player.user_id} className="border-2 border-foreground p-2 text-center min-w-[4.5rem]">
                  <div className="flex flex-col items-center gap-0.5">
                    <PlayerShape playerIndex={index} size={24} filled={true} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scoreData.rounds.map((round) => (
              <tr key={round.round_number} data-testid={`scores-row-r${round.round_number}`}>
                <td className="border-2 border-foreground p-2 text-sm font-bold text-center">
                  {round.round_number}
                </td>
                <td className={`border-2 border-foreground p-2 text-center text-lg ${getTrumpColor(round.trump_suit)}`}>
                  {getTrumpSymbol(round.trump_suit)}
                </td>
                {round.players.map((player) => {
                  const playerInfo = scoreData.players.find((p) => p.user_id === player.user_id);
                  const seat = playerInfo?.seat_position ?? 0;
                  return (
                  <td key={player.user_id} className="border-2 border-foreground p-2 text-center">
                    <span data-testid={`scores-cell-r${round.round_number}-p${seat}`} className={`text-lg font-semibold ${getScoreColor(player.score)}`}>
                      {player.score > 0 ? `+${player.score}` : player.score}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {player.tricks_won}/{player.contract_bid}
                    </span>
                  </td>
                  );
                })}
              </tr>
            ))}

            {/* Totals row */}
            <tr>
              <td colSpan={2} className="border-2 border-foreground border-t-4 p-3 text-xs font-bold uppercase tracking-[0.1em] text-center">
                Total
              </td>
              {scoreData.players.map((player) => {
                const score = scoreData.cumulative_scores[player.user_id] || 0;
                const isLeader = player.user_id === leadingPlayerId && score > 0;
                return (
                  <td
                    key={player.user_id}
                    data-testid={`scores-total-p${player.seat_position}`}
                    className={`border-2 border-foreground border-t-4 p-3 text-center ${
                      isLeader ? 'bg-ochre/10' : ''
                    }`}
                  >
                    <span className={`text-xl font-bold ${getScoreColor(score)}`}>
                      {score > 0 ? `+${score}` : score}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Winner indicator (for e2e selectors) */}
      {leadingPlayerId && (
        <div
          data-testid="scores-winner"
          data-seat={scoreData.players.find((p) => p.user_id === leadingPlayerId)?.seat_position ?? ''}
          className="sr-only"
        />
      )}

      {/* Action buttons */}
      <div className="px-4 py-6 space-y-3">
        {error && (
          <p className="text-sm text-terracotta text-center">{error}</p>
        )}

        <Button
          onClick={handleNewRound}
          disabled={isStartingRound || isEndingGame}
          loading={isStartingRound}
          fullWidth
          size="lg"
          data-testid="scores-new-round"
        >
          New Round
        </Button>

        <Button
          onClick={handleEndGame}
          disabled={isStartingRound || isEndingGame}
          loading={isEndingGame}
          variant="outline"
          fullWidth
          className="border-terracotta text-terracotta hover:bg-terracotta hover:text-background"
        >
          End Game
        </Button>
      </div>
    </main>
  );
}
