'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const isHydrated = useStore((state) => state.isHydrated);
  const user = useStore((state) => state.user);

  useEffect((): void | (() => void) => {
    if (typeof window === 'undefined') {
      return;
    }

    const state = useStore.getState();

    if (!state.isHydrated) {
      const checkInterval = setInterval(() => {
        const currentState = useStore.getState();
        if (currentState.isHydrated) {
          clearInterval(checkInterval);
          if (!currentState.isAuthenticated) {
            router.push('/login');
          }
        }
      }, 50);

      return () => clearInterval(checkInterval);
    }

    if (!state.isAuthenticated) {
      router.push('/login');
    }
  }, [router]);

  if (!isHydrated || !isAuthenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold uppercase tracking-[0.2em] text-foreground mb-8">
          WHISTER
        </h1>
        <div className="w-full max-w-sm space-y-4">
          <div className="h-20 border-2 border-muted animate-pulse" />
          <div className="h-20 border-2 border-muted animate-pulse" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      {/* Decorative ochre accent — top right */}
      <div className="absolute top-8 right-8">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <polygon points="40,0 40,40 0,40" fill="#D4A030" opacity="0.6" />
        </svg>
      </div>

      {/* Wordmark */}
      <h1 className="text-2xl font-bold uppercase tracking-[0.2em] text-foreground mb-16">
        WHISTER
      </h1>

      {/* Two bold action buttons */}
      <div className="w-full max-w-sm space-y-4">
        <Link href="/room/create" className="block">
          <button className="w-full py-8 border-2 border-foreground text-foreground text-xl font-bold uppercase tracking-[0.15em] hover:bg-foreground hover:text-background active:scale-[0.97] transition-all">
            Create
          </button>
        </Link>

        <Link href="/room/join" className="block">
          <button className="w-full py-8 border-2 border-foreground text-foreground text-xl font-bold uppercase tracking-[0.15em] hover:bg-foreground hover:text-background active:scale-[0.97] transition-all">
            Join
          </button>
        </Link>
      </div>

      {/* Welcome + Sign out */}
      <div className="mt-16 text-center">
        <p className="text-sm text-muted-foreground mb-2">
          {user?.displayName || 'Player'}
        </p>
        <button
          className="text-xs uppercase tracking-[0.1em] text-terracotta hover:underline"
          onClick={() => {
            const store = useStore.getState();
            store.logout();
            router.push('/login');
          }}
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
