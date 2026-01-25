/**
 * WebSocket Manager - Global Connection and Room Management
 *
 * Singleton service that manages ALL WebSocket operations.
 * Replaces component-level connection management with centralized state.
 *
 * Key features:
 * - Single source of truth for connection state
 * - Request deduplication (only 1 join in flight at a time)
 * - Promise-based API for async operations
 * - Direct Zustand store updates
 */

import { io, Socket } from 'socket.io-client';
import { useStore } from '@/stores';
import type { TypedSocket, SocketResponse, RoomJoinedPayload } from '@/types/socket-events';

const WS_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000'
    : 'http://localhost:8000';

const WS_PATH = '/ws/socket.io';

class WebSocketManager {
  private socket: TypedSocket | null = null;
  private currentRoom: string | null = null;
  private joinInProgress: Promise<RoomJoinedPayload> | null = null;
  private isConnecting: boolean = false;

  /**
   * Initialize WebSocket connection with auth token
   */
  async connect(accessToken: string): Promise<TypedSocket> {
    // Validate token before attempting connection
    if (!accessToken) {
      throw new Error('No access token provided');
    }

    // If already connected with valid socket, return it
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // If connection in progress, wait for it
    if (this.isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.connect(accessToken);
    }

    this.isConnecting = true;

    try {
      // Disconnect existing socket if any
      if (this.socket) {
        this.socket.disconnect();
      }

      // Create new socket
      this.socket = io(WS_URL, {
        path: WS_PATH,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        timeout: 10000,
        auth: (cb) => {
          const token = useStore.getState().accessToken || accessToken;
          if (!token) {
            console.error('[SocketManager] No token available for auth');
          }
          cb({ token });
        },
      }) as TypedSocket;

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.socket!.on('connect', () => {
          clearTimeout(timeout);
          console.log('[SocketManager] Connected');
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeout);
          console.error('[SocketManager] Connection error:', error);
          reject(error);
        });
      });

      // Set up global error handler
      this.socket.on('error', (error) => {
        console.error('[SocketManager] Socket error:', error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[SocketManager] Disconnected:', reason);
        // Clear room state on disconnect
        if (this.currentRoom) {
          this.currentRoom = null;
          this.joinInProgress = null;
        }
      });

      return this.socket;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Join a room (idempotent - safe to call multiple times)
   */
  async joinRoom(roomCode: string, displayName: string): Promise<RoomJoinedPayload> {
    if (!this.socket || !this.socket.connected) {
      throw new Error('Socket not connected. Call connect() first.');
    }

    // Already in this room - return immediately
    if (this.currentRoom === roomCode) {
      console.log('[SocketManager] Already in room:', roomCode);
      // Return a resolved promise with current room state
      // In real scenario, we'd fetch current state from store
      return Promise.resolve({} as RoomJoinedPayload);
    }

    // Join already in progress for this room - wait for it
    if (this.joinInProgress && this.currentRoom === roomCode) {
      console.log('[SocketManager] Join already in progress, waiting...');
      return this.joinInProgress;
    }

    // Leave previous room if different
    if (this.currentRoom && this.currentRoom !== roomCode) {
      console.log('[SocketManager] Leaving previous room:', this.currentRoom);
      await this.leaveRoom(this.currentRoom);
    }

    console.log('[SocketManager] Joining room:', roomCode, 'as', displayName);

    // Create join promise
    this.joinInProgress = new Promise<RoomJoinedPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.joinInProgress = null;
        reject(new Error('Join room timeout'));
      }, 10000);

      // Emit join event
      this.socket!.emit(
        'room:join',
        { room_code: roomCode, display_name: displayName },
        (response: SocketResponse) => {
          clearTimeout(timeout);

          if (response.success) {
            console.log('[SocketManager] Join successful');
            this.currentRoom = roomCode;
            this.joinInProgress = null;
            resolve(response.data as RoomJoinedPayload);
          } else {
            console.error('[SocketManager] Join failed:', response.error);
            this.joinInProgress = null;
            reject(new Error(response.error || 'Failed to join room'));
          }
        }
      );
    });

    return this.joinInProgress;
  }

  /**
   * Leave current room
   */
  async leaveRoom(roomCode?: string): Promise<void> {
    const targetRoom = roomCode || this.currentRoom;

    if (!targetRoom) {
      console.log('[SocketManager] No room to leave');
      return;
    }

    if (!this.socket || !this.socket.connected) {
      console.warn('[SocketManager] Cannot leave room - socket not connected');
      this.currentRoom = null;
      return;
    }

    console.log('[SocketManager] Leaving room:', targetRoom);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Leave room timeout'));
      }, 5000);

      this.socket!.emit(
        'room:leave',
        { room_code: targetRoom },
        (response: SocketResponse) => {
          clearTimeout(timeout);

          if (response.success) {
            console.log('[SocketManager] Leave successful');
            if (this.currentRoom === targetRoom) {
              this.currentRoom = null;
              this.joinInProgress = null;
            }
            resolve();
          } else {
            console.error('[SocketManager] Leave failed:', response.error);
            // Clear state anyway
            if (this.currentRoom === targetRoom) {
              this.currentRoom = null;
              this.joinInProgress = null;
            }
            reject(new Error(response.error || 'Failed to leave room'));
          }
        }
      );
    });
  }

  /**
   * Get current socket instance
   */
  getSocket(): TypedSocket | null {
    return this.socket;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Check if in a specific room
   */
  isInRoom(roomCode: string): boolean {
    return this.currentRoom === roomCode;
  }

  /**
   * Get current room code
   */
  getCurrentRoom(): string | null {
    return this.currentRoom;
  }

  /**
   * Disconnect socket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentRoom = null;
      this.joinInProgress = null;
    }
  }
}

// Export singleton instance
export const socketManager = new WebSocketManager();

// For testing/debugging
if (typeof window !== 'undefined') {
  (window as any).socketManager = socketManager;
}
