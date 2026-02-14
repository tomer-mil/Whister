'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, ...props }, ref) => {
    const inputId = React.useId();

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            'w-full bg-transparent border-0 border-b-2 border-muted px-0 py-3 text-base text-foreground ' +
            'placeholder:text-muted-foreground focus:border-foreground focus:outline-none ' +
            'disabled:cursor-not-allowed disabled:opacity-40 ' +
            'transition-colors',
            error && 'border-terracotta focus:border-terracotta',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-xs text-terracotta mt-1">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
