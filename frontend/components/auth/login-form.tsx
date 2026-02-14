'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      await new Promise(resolve => setTimeout(resolve, 100));
      router.push('/');
      router.refresh();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Login failed. Please try again.';
      setServerError(errorMessage);
    }
  };

  return (
    <div>
      {/* Wordmark with geometric accent */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-3 h-3 bg-terracotta rotate-45" />
          <h1 className="text-4xl font-bold uppercase tracking-[0.2em]">
            WHISTER
          </h1>
          <div className="w-3 h-3 bg-ochre" />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {serverError && (
          <p className="text-sm text-terracotta text-center">{serverError}</p>
        )}

        <Input
          type="email"
          placeholder="Email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          type="password"
          placeholder="Password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="pt-4">
          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link
            href="/register"
            className="text-foreground font-semibold uppercase tracking-[0.05em] hover:underline"
          >
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}

export default LoginForm;
