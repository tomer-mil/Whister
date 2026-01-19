/**
 * Register Page
 */

import { RegisterForm } from '@/components/auth/register-form';

export const metadata = {
  title: 'Register - Whist',
  description: 'Create a new Whist account',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
