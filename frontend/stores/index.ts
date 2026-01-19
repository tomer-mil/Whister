import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import type { Store } from '@/types/store';
import { createAuthSlice } from './slices/auth-slice';
import { createRoomSlice } from './slices/room-slice';
import { createGameSlice } from './slices/game-slice';
import { createBiddingSlice } from './slices/bidding-slice';
import { createScoresSlice } from './slices/scores-slice';
import { createUISlice } from './slices/ui-slice';
import { persistConfig } from './middleware/persist';
import { devtoolsConfig } from './middleware/devtools';

/**
 * Combined Zustand Store
 * Composes all slices with middleware:
 * - devtools: Redux DevTools integration
 * - subscribeWithSelector: Selector-based subscriptions
 * - persist: localStorage persistence for auth state
 */
const stateCreator = ((set: any, get: any) => ({
  ...createAuthSlice(set, get),
  ...createRoomSlice(set, get),
  ...createGameSlice(set, get),
  ...createBiddingSlice(set, get),
  ...createScoresSlice(set, get),
  ...createUISlice(set, get),
})) as any;

console.log('[Store] Creating Zustand store...');

export const useStore = create<Store>()(
  devtools(
    persist(subscribeWithSelector(stateCreator), persistConfig as any),
    devtoolsConfig as any
  )
);

console.log('[Store] Zustand store created');

export { Store };
export * from './slices/index';
export * from './selectors/index';
