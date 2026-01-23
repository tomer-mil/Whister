/**
 * Register Form Component
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { registerSchema, type RegisterFormData } from '@/lib/validation/schemas';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';

export function RegisterForm() {
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);

    try {
      await registerUser(data);
      // Redirect to home on success
      router.push('/');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Registration failed. Please try again.';
      setServerError(errorMessage);
    }
  };

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle className="text-center">Create Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Server Error */}
          {serverError && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg">
              {serverError}
            </div>
          )}

          {/* Username Input */}
          <Input
            label="Username"
            type="text"
            placeholder="john_doe"
            helperText="3-32 characters, letters, numbers, underscores, hyphens"
            error={errors.username?.message}
            {...register('username')}
          />

          {/* Display Name Input */}
          <Input
            label="Display Name"
            type="text"
            placeholder="John Doe"
            error={errors.displayName?.message}
            {...register('displayName')}
          />

          {/* Email Input */}
          <Input
            label="Email"
            type="email"
            placeholder="your@email.com"
            error={errors.email?.message}
            {...register('email')}
          />

          {/* Password Input */}
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            helperText="Must be at least 8 characters with uppercase, lowercase, and number"
            error={errors.password?.message}
            {...register('password')}
          />

          {/* Confirm Password Input */}
          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          {/* Submit Button */}
          <Button
            type="submit"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Button>

          {/* Login Link */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-primary hover:text-primary-hover font-medium"
            >
              Sign in here
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default RegisterForm;
