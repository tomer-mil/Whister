import { extractErrorMessage } from './errors';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface UserBrief {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
}

interface LoginResponse {
  user: UserBrief;
  tokens: TokenResponse;
}

interface RegisterResponse {
  id: string;
  username: string;
  email: string;
  display_name: string;
  tokens: TokenResponse;
}

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
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
  return res.json() as Promise<T>;
}

export const authApi = {
  login(credentials: { email: string; password: string }): Promise<LoginResponse> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  register(data: {
    username: string;
    email: string;
    password: string;
    display_name: string;
  }): Promise<RegisterResponse> {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  refreshToken(token: string): Promise<RefreshResponse> {
    return request('/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refresh_token: token }),
    });
  },

  logout(): Promise<void> {
    return request('/auth/logout', { method: 'POST' });
  },
};
