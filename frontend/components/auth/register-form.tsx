'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      router.push('/');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Registration failed. Please try again.';
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <p className="text-sm text-terracotta text-center">{serverError}</p>
        )}

        <Input
          type="text"
          placeholder="Username"
          error={errors.username?.message}
          {...register('username')}
        />

        <Input
          type="text"
          placeholder="Display Name"
          error={errors.displayName?.message}
          {...register('displayName')}
        />

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

        <Input
          type="password"
          placeholder="Confirm Password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="pt-4">
          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Account'}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Have an account?{' '}
          <Link
            href="/login"
            className="text-foreground font-semibold uppercase tracking-[0.05em] hover:underline"
          >
            Sign In
          </Link>
        </p>
      </form>
    </div>
  );
}

export default RegisterForm;
