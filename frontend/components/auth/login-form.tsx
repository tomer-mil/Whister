/**
 * Login Form Component
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { loginSchema, type LoginFormData } from '@/lib/validation/schemas';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';

export function LoginForm() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);

    try {
      await login(data);
      // Navigate to home and refresh to ensure home page can see the authenticated state
      router.push('/');
      router.refresh();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Login failed. Please try again.';
      setServerError(errorMessage);
    }
  };

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle className="text-center">Login to Whist</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Server Error */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {serverError}
            </div>
          )}

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
            error={errors.password?.message}
            {...register('password')}
          />

          {/* Submit Button */}
          <Button
            type="submit"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>

          {/* Register Link */}
          <p className="text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link
              href="/register"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Register here
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default LoginForm;
