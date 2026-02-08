/**
 * Thin Socket.IO helpers used by the playing-phase tests.
 *
 * Trick claiming is driven directly through the WebSocket so that
 * tricks can be distributed across players (4/3/3/3) without
 * requiring 13 separate browser interactions across 4 contexts.
 */

import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.WS_URL || 'http://localhost:8000';

/**
 * Open an authenticated Socket.IO connection.
 * The backend extracts the JWT from the `auth` handshake payload
 * and populates the connection context automatically.
 */
export function connectSocket(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      path: '/ws/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10_000,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/**
 * Emit `round:claim_trick` and wait for the server acknowledgment.
 * The trick is credited to the user who owns the socket's token.
 */
export function claimTrick(socket: Socket, roomCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('round:claim_trick', { room_code: roomCode }, (ack: { success?: boolean; error?: string }) => {
      if (ack?.success) resolve();
      else reject(new Error(ack?.error || 'round:claim_trick failed'));
    });
  });
}

/**
 * Generic helper: resolve when a named event fires on the socket.
 */
export function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for socket event "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
