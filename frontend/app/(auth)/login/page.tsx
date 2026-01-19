/**
 * Login Page
 */

import { LoginForm } from '@/components/auth/login-form';

export const metadata = {
  title: 'Login - Whist',
  description: 'Sign in to your Whist account',
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
        <p className="text-gray-600">Sign in to your account to continue</p>
      </div>
      <LoginForm />
    </div>
  );
}
