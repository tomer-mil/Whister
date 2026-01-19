'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-all ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-indigo-600 text-white hover:bg-indigo-700 ' +
          'focus-visible:ring-indigo-500',
        secondary:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 ' +
          'focus-visible:ring-gray-500',
        outline:
          'border-2 border-gray-300 bg-transparent hover:bg-gray-50 ' +
          'focus-visible:ring-gray-500',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 ' +
          'focus-visible:ring-red-500',
        ghost:
          'bg-transparent hover:bg-gray-100 ' +
          'focus-visible:ring-gray-500',
        success:
          'bg-emerald-600 text-white hover:bg-emerald-700 ' +
          'focus-visible:ring-emerald-500',
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
