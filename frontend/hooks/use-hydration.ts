/**
 * useHydration Hook
 * Detects when Zustand store is hydrated from localStorage
 * Uses a polling approach since onRehydrateStorage mutations don't trigger subscriptions reliably
 */

import { useEffect, useState } from 'react';
import { useStore } from '@/stores';
import { isPersistRehydrated } from '@/stores/middleware/persist';

export function useHydration() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    console.log('[useHydration] Hook mounted');

    // Check initial state from store
    const currentState = useStore.getState();
    console.log('[useHydration] Initial state - isHydrated:', currentState.isHydrated, 'persistRehydrated:', isPersistRehydrated());

    // Set initial state
    if (currentState.isHydrated || isPersistRehydrated()) {
      console.log('[useHydration] Already hydrated on mount');
      setIsHydrated(true);
      return;
    }

    // Poll for hydration completion since direct state mutations don't trigger subscriptions
    const interval = setInterval(() => {
      const state = useStore.getState();
      const persistHydrated = isPersistRehydrated();

      if (state.isHydrated || persistHydrated) {
        console.log('[useHydration] Hydration detected - isHydrated:', state.isHydrated, 'persistRehydrated:', persistHydrated);
        setIsHydrated(true);
        clearInterval(interval);
      }
    }, 50); // Check every 50ms

    // Also subscribe to store changes as a fallback
    const unsubscribe = useStore.subscribe(
      (state) => state.isHydrated,
      (isHydratedValue) => {
        console.log('[useHydration] Store subscription triggered - isHydrated:', isHydratedValue);
        setIsHydrated(isHydratedValue);
      }
    );

    // Cleanup
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  return isHydrated;
}
