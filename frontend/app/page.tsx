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
  const isHydrated = useStore((state) => state.isHydrated);
  const user = useStore((state) => state.user);

  console.log('[HomePage] Render - isAuthenticated:', isAuthenticated, 'isHydrated:', isHydrated, 'user:', user?.email);

  // Redirect to login if not authenticated (only after hydration confirms we're not logged in)
  useEffect((): void | (() => void) => {
    if (typeof window === 'undefined') {
      return;
    }

    const state = useStore.getState();
    console.log('[HomePage] useEffect - current state - isHydrated:', state.isHydrated, 'isAuthenticated:', state.isAuthenticated);

    // Poll until hydration is complete
    if (!state.isHydrated) {
      console.log('[HomePage] Waiting for hydration...');
      const checkInterval = setInterval(() => {
        const currentState = useStore.getState();
        if (currentState.isHydrated) {
          console.log('[HomePage] Hydration complete - isAuthenticated:', currentState.isAuthenticated);
          clearInterval(checkInterval);

          if (!currentState.isAuthenticated) {
            console.log('[HomePage] Not authenticated, redirecting to login');
            router.push('/login');
          }
        }
      }, 50);

      return () => clearInterval(checkInterval);
    }

    if (!state.isAuthenticated) {
      console.log('[HomePage] Authenticated check passed - not authenticated, redirecting');
      router.push('/login');
    }
  }, [router]);

  // Show skeleton loading state while checking authentication or waiting for hydration
  if (!isHydrated || !isAuthenticated) {
    return (
      <main className="min-h-screen">
        {/* Skeleton Header */}
        <header className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 md:py-6 flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-7 w-48 bg-secondary/50 rounded animate-pulse" />
              <div className="h-4 w-32 bg-secondary/30 rounded animate-pulse" />
            </div>
            <div className="h-10 w-20 bg-secondary/30 rounded animate-pulse" />
          </div>
        </header>
        {/* Skeleton Content */}
        <section className="max-w-7xl mx-auto px-4 py-6 sm:py-8 md:py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="h-44 bg-secondary/30 rounded-lg animate-pulse" />
            <div className="h-44 bg-secondary/30 rounded-lg animate-pulse" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header - Reduced padding on mobile */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 md:py-6 flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Whist Score Keeper</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-0.5 sm:mt-1">Welcome, {user?.displayName || 'Player'}!</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
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

      {/* Hero Section - Reduced padding on mobile */}
      <section className="max-w-7xl mx-auto px-4 py-6 sm:py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Create Room Card */}
          <Card variant="interactive" padding="lg">
            <CardHeader>
              <CardTitle>Start a Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm sm:text-base">
                Host a new game and invite your friends to join.
              </p>
              <Link href="/room/create">
                <Button variant="primary" fullWidth>
                  Create Room
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card variant="interactive" padding="lg">
            <CardHeader>
              <CardTitle>Join a Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm sm:text-base">
                Enter a room code to join an existing game.
              </p>
              <Link href="/room/join">
                <Button variant="secondary" fullWidth>
                  Join Room
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Featured Info - Hidden on mobile, shown on tablet+ */}
        <div className="hidden md:grid mt-10 grid-cols-3 gap-6">
          <Card variant="outlined">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-foreground mb-2">Real-time Scoring</h3>
              <p className="text-sm text-muted-foreground">
                Watch scores update instantly as tricks are claimed and rounds complete.
              </p>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-foreground mb-2">Easy to Use</h3>
              <p className="text-sm text-muted-foreground">
                Simple interface designed for playing Whist without complicated rules to remember.
              </p>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-foreground mb-2">Play Anywhere</h3>
              <p className="text-sm text-muted-foreground">
                Play on any device with internet connection. Your scores are saved automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
