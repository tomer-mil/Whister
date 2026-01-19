'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: React.ReactNode;
  initials?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt,
      size = 'md',
      fallback,
      initials,
      className,
      ...props
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [hasError, setHasError] = React.useState(false);

    const showImage = src && !hasError && !isLoading;
    const showFallback = !showImage;

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex items-center justify-center rounded-full ' +
          'overflow-hidden bg-gradient-to-br from-indigo-400 to-indigo-600 ' +
          'flex-shrink-0',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {showImage && (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {showFallback && (
          <div className="flex items-center justify-center w-full h-full">
            {fallback ? (
              fallback
            ) : (
              <span className="font-semibold text-white select-none">
                {initials || alt.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';
