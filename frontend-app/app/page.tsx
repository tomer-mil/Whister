/**
 * Home Page / Landing Page
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const user = useStore((state) => state.user);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Whist Score Keeper</h1>
            <p className="text-gray-600 mt-1">Welcome, {user?.displayName || 'Player'}!</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              const store = useStore.getState();
              store.logout();
              router.push('/login');
            }}
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create Room Card */}
          <Card variant="interactive">
            <CardHeader>
              <CardTitle>Create New Room</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Host a new game and invite your friends to join. You'll be the admin and can manage the game.
              </p>
              <Link href="/room/create">
                <Button variant="primary" fullWidth>
                  Create Room
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card variant="interactive">
            <CardHeader>
              <CardTitle>Join Room</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Join an existing game using a room code. Enter the code to start playing with others.
              </p>
              <Link href="/room/join">
                <Button variant="secondary" fullWidth>
                  Join Room
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Featured Info */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card variant="outlined">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-gray-900 mb-2">Real-time Scoring</h3>
              <p className="text-sm text-gray-600">
                Watch scores update instantly as tricks are claimed and rounds complete.
              </p>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-gray-900 mb-2">Easy to Use</h3>
              <p className="text-sm text-gray-600">
                Simple interface designed for playing Whist without complicated rules to remember.
              </p>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-gray-900 mb-2">Play Anywhere</h3>
              <p className="text-sm text-gray-600">
                Play on any device with internet connection. Your scores are saved automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
