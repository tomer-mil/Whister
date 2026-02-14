'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold uppercase tracking-[0.08em] transition-all ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary:
          'bg-foreground text-background hover:bg-primary-hover',
        secondary:
          'border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background',
        outline:
          'border border-muted bg-transparent text-foreground hover:border-foreground',
        destructive:
          'bg-terracotta text-background hover:bg-terracotta/90',
        ghost:
          'bg-transparent text-foreground hover:bg-background-secondary',
        success:
          'bg-success text-success-foreground hover:bg-success/90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-base',
        lg: 'h-14 px-6 text-lg',
        xl: 'h-16 px-8 text-xl',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
        'icon-lg': 'h-14 w-14',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, fullWidth, className })
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner className="mr-2 h-4 w-4" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
