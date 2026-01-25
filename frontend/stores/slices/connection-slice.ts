/**
 * Connection Slice - Global WebSocket Connection State
 *
 * Tracks connection status and room membership globally.
 * Updated by WebSocketManager service.
 */

import type { StateCreator } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type RoomJoinStatus = 'idle' | 'joining' | 'joined' | 'leaving';

export interface ConnectionState {
  // Connection state
  connectionStatus: ConnectionStatus;
  isSocketConnected: boolean;

  // Room state
  currentRoomCode: string | null;
  roomJoinStatus: RoomJoinStatus;
  lastJoinError: string | null;

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSocketConnected: (connected: boolean) => void;
  setRoomJoinStatus: (status: RoomJoinStatus) => void;
  setCurrentRoomCode: (roomCode: string | null) => void;
  setJoinError: (error: string | null) => void;
  resetConnectionState: () => void;
}

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  isSocketConnected: false,
  currentRoomCode: null,
  roomJoinStatus: 'idle' as RoomJoinStatus,
  lastJoinError: null,
};

export const createConnectionSlice: StateCreator<
  ConnectionState,
  [],
  [],
  ConnectionState
> = (set) => ({
  ...initialState,

  setConnectionStatus: (status) =>
    set({ connectionStatus: status }),

  setSocketConnected: (connected) =>
    set({
      isSocketConnected: connected,
      connectionStatus: connected ? 'connected' : 'disconnected',
    }),

  setRoomJoinStatus: (status) =>
    set({ roomJoinStatus: status }),

  setCurrentRoomCode: (roomCode) =>
    set({ currentRoomCode: roomCode }),

  setJoinError: (error) =>
    set({ lastJoinError: error }),

  resetConnectionState: () =>
    set(initialState),
});
