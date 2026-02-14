'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { PlayerShape } from '@/components/ui/player-shape';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  initials?: string;
  /** Player index for geometric shape display */
  playerIndex?: number;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

const shapeSizes = {
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      alt,
      size = 'md',
      initials,
      playerIndex,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative flex items-center justify-center ' +
          'overflow-hidden bg-foreground ' +
          'flex-shrink-0',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {playerIndex !== undefined ? (
          <PlayerShape
            playerIndex={playerIndex}
            size={shapeSizes[size]}
            filled={true}
            color="hsl(var(--background))"
          />
        ) : (
          <span className="font-semibold text-background select-none">
            {initials || alt.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';
