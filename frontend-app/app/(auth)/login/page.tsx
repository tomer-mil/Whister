/**
 * Login Page
 */

import { LoginForm } from '@/components/auth/login-form';

export const metadata = {
  title: 'Login - Whist',
  description: 'Sign in to your Whist account',
};

export default function LoginPage() {
  return <LoginForm />;
}
