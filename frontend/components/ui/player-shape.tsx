'use client';

import { cn } from '@/lib/utils/cn';

export interface PlayerShapeProps {
  /** Player index 0-3 determines shape: hexagon, cross, star, triangle */
  playerIndex: number;
  /** Size in pixels */
  size?: number;
  /** Whether to fill the shape or just outline */
  filled?: boolean;
  /** Custom color (defaults to foreground) */
  color?: string;
  className?: string;
}

const SHAPES = {
  // Hexagon
  0: 'M50 5 L90 27.5 L90 72.5 L50 95 L10 72.5 L10 27.5 Z',
  // Cross/Plus
  1: 'M35 5 L65 5 L65 35 L95 35 L95 65 L65 65 L65 95 L35 95 L35 65 L5 65 L5 35 L35 35 Z',
  // 6-point Star
  2: 'M50 5 L62 35 L95 35 L68 55 L78 90 L50 70 L22 90 L32 55 L5 35 L38 35 Z',
  // Triangle
  3: 'M50 5 L95 90 L5 90 Z',
} as const;

export function PlayerShape({
  playerIndex,
  size = 24,
  filled = true,
  color,
  className,
}: PlayerShapeProps) {
  const shapeIndex = (playerIndex % 4) as 0 | 1 | 2 | 3;
  const path = SHAPES[shapeIndex];
  const strokeColor = color || 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('inline-block flex-shrink-0', className)}
      aria-label={`Player ${playerIndex + 1} shape`}
    >
      <path
        d={path}
        fill={filled ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={filled ? 0 : 6}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default PlayerShape;
