export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  return String(score);
}

export function getScoreColor(score: number): 'positive' | 'negative' | 'zero' {
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'zero';
}
