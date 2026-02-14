'use client';

import { PlayerShape } from '@/components/ui/player-shape';
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
}: ScoreTableProps) {
  const normalizedRounds = rounds.map((round) => {
    const roundMap = new Map(round.map((score) => [score.playerId, score]));
    return players.map((player) => roundMap.get(player.playerId));
  });

  // Find leading player
  const maxScore = Math.max(...Object.values(totalScores), 0);
  const leadingPlayerId = Object.entries(totalScores).find(([, s]) => s === maxScore)?.[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border-2 border-foreground">
        {/* Header — PlayerShape markers */}
        <thead>
          <tr>
            <th className="border-2 border-foreground p-3 text-left text-xs font-bold uppercase tracking-[0.1em] bg-background w-16">
              #
            </th>
            {players.map((player, index) => (
              <th
                key={player.playerId}
                className="border-2 border-foreground p-3 text-center min-w-[5rem]"
              >
                <div className="flex flex-col items-center gap-1">
                  <PlayerShape playerIndex={index} size={28} filled={true} />
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {normalizedRounds.map((round, roundIndex) => (
            <tr key={roundIndex}>
              <td className="border-2 border-foreground p-3 text-sm font-bold text-center">
                {roundIndex + 1}
              </td>
              {round.map((scoreData, playerIndex) => (
                <td key={`${roundIndex}-${playerIndex}`} className="border-2 border-foreground p-0">
                  <ScoreCell
                    contract={scoreData?.contract}
                    tricksWon={scoreData?.tricksWon}
                    score={scoreData?.score}
                  />
                </td>
              ))}
            </tr>
          ))}

          {/* Total row */}
          <tr>
            <td className="border-2 border-foreground border-t-4 p-3 text-xs font-bold uppercase tracking-[0.1em] text-center">
              Total
            </td>
            {players.map((player) => {
              const score = totalScores[player.playerId] ?? 0;
              const isLeader = player.playerId === leadingPlayerId && score > 0;
              return (
                <td
                  key={`total-${player.playerId}`}
                  className={`border-2 border-foreground border-t-4 p-3 text-center ${
                    isLeader ? 'bg-ochre/10' : ''
                  }`}
                >
                  <span className={`text-xl font-bold ${
                    score > 0 ? 'text-ochre' : score < 0 ? 'text-terracotta' : 'text-muted-foreground'
                  }`}>
                    {score > 0 ? `+${score}` : score}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default ScoreTable;
