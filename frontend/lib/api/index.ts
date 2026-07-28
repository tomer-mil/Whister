import { extractErrorMessage } from './errors';

interface CreateRoomResponse {
  room_code: string;
  game_id: string;
  admin_id: string;
  status: string;
  ws_endpoint: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(extractErrorMessage(await res.text(), res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const roomsApi = {
  createRoom(): Promise<CreateRoomResponse> {
    return request('/rooms', { method: 'POST', body: '{}' });
  },

  joinRoom(roomCode: string, body: { display_name: string }): Promise<void> {
    return request(`/rooms/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  startGame(roomCode: string): Promise<void> {
    return request(`/rooms/${roomCode}/start`, { method: 'POST', body: '{}' });
  },
};
