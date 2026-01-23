/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RoomState, RoomActions } from '@/types/store';

export interface RoomSlice extends RoomState, RoomActions {}

const initialRoomState: RoomState = {
  roomCode: null,
  roomId: null,
  players: [],
  isAdmin: false,
  maxPlayers: 4,
  isJoining: false,
  isCreating: false,
};

export const createRoomSlice: any = (set: any, get: any) => ({
  ...initialRoomState,

  createRoom: async () => {
    set({ isCreating: true });
    try {
      // TODO: Implement API call to POST /rooms
      // const response = await apiClient.post('/rooms');
      // const { room_code, room_id } = response.data;

      // Mock implementation
      const mockRoomCode = 'ABC123';
      const mockRoomId = 'room-' + Math.random().toString(36).substr(2, 9);
      const user = get().user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      set({
        roomCode: mockRoomCode,
        roomId: mockRoomId,
        isAdmin: true,
        isCreating: false,
        players: [
          {
            userId: user.id,
            displayName: user.displayName,
            seatPosition: null,
            isConnected: true,
            isAdmin: true,
          },
        ],
      });

      return mockRoomCode;
    } catch (error) {
      set({ isCreating: false });
      throw error;
    }
  },

  joinRoom: async (roomCode) => {
    set({ isJoining: true });
    try {
      // TODO: Implement API call to POST /rooms/{roomCode}/join
      // const response = await apiClient.post(`/rooms/${roomCode}/join`);
      // const { room_id, players, is_admin } = response.data;

      // Mock implementation
      const mockRoomId = 'room-' + Math.random().toString(36).substr(2, 9);
      const user = get().user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      set({
        roomCode,
        roomId: mockRoomId,
        players: [
          {
            userId: user.id,
            displayName: user.displayName,
            seatPosition: null,
            isConnected: true,
            isAdmin: false,
          },
        ],
        isAdmin: false,
        isJoining: false,
      });
    } catch (error) {
      set({ isJoining: false });
      throw error;
    }
  },

  leaveRoom: () => {
    const roomCode = get().roomCode;
    if (roomCode) {
      // TODO: Implement API call to POST /rooms/{roomCode}/leave
      // apiClient.post(`/rooms/${roomCode}/leave`).catch(console.error);
    }
    set(initialRoomState);
  },

  setRoomData: (data: { roomCode: string; roomId?: string; isAdmin: boolean; players: any[] }) => {
    set({
      roomCode: data.roomCode,
      roomId: data.roomId || null,
      isAdmin: data.isAdmin,
      players: data.players,
      isJoining: false,
      isCreating: false,
    });
  },

  updateSeating: (playerId, position) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === playerId ? { ...p, seatPosition: position } : p
      ),
    }));
  },

  randomizeSeating: () => {
    const positions = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    set((state) => ({
      players: state.players.map((p, i) => ({
        ...p,
        seatPosition: positions[i] ?? null,
      })),
    }));
  },

  setPlayers: (players) => set({ players }),

  addPlayer: (player) => {
    set((state) => ({
      players: [...state.players, player],
    }));
  },

  removePlayer: (playerId) => {
    set((state) => ({
      players: state.players.filter((p) => p.userId !== playerId),
    }));
  },

  updatePlayerConnection: (playerId, isConnected) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === playerId ? { ...p, isConnected } : p
      ),
    }));
  },
});
