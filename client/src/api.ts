const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = 'watch_party_access_token';
const REFRESH_KEY = 'watch_party_refresh_token';

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  } catch {
  }
}

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  data: T | null;
  message: string;
  errors?: unknown;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });

  const json: ApiResponse<T> = await res.json();

  if (!res.ok || !json.success) {
    throw new ApiError(json.message || 'Request failed', res.status, json.errors);
  }

  return json;
}

export class ApiError extends Error {
  statusCode: number;
  errors?: unknown;

  constructor(message: string, statusCode: number, errors?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthData {
  user: User;
  accessToken?: string;
  refreshToken?: string;
}

export const authApi = {
  register: async (name: string, email: string, password: string) => {
    const res = await request<AuthData>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (res.data?.accessToken) setAccessToken(res.data.accessToken);
    if (res.data?.refreshToken) setRefreshToken(res.data.refreshToken);
    return res;
  },

  login: async (email: string, password: string) => {
    const res = await request<AuthData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.accessToken) setAccessToken(res.data.accessToken);
    if (res.data?.refreshToken) setRefreshToken(res.data.refreshToken);
    return res;
  },

  logout: async () => {
    try {
      const refreshToken = getRefreshToken();
      await request<null>('/auth/logout', {
        method: 'POST',
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
      });
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
    }
  },

  refresh: async () => {
    const refreshToken = getRefreshToken();
    const res = await request<AuthData>('/auth/refresh', {
      method: 'POST',
      body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
    });
    if (res.data?.accessToken) setAccessToken(res.data.accessToken);
    if (res.data?.refreshToken) setRefreshToken(res.data.refreshToken);
    return res;
  },

  me: () =>
    request<User>('/auth/me'),
};

export interface RoomSummary {
  id: string;
  name: string;
  hostId: string;
  hasPassword: boolean;
  createdAt: string;
}

export interface RoomDetails {
  room: RoomSummary;
  participant: {
    id: string;
    name: string;
    role: 'host' | 'moderator' | 'participant';
  };
}

export interface Moderator {
  id: string;
  name: string;
  email: string;
}

export const roomApi = {
  create: (name: string, password?: string) =>
    request<RoomSummary>('/rooms/create', {
      method: 'POST',
      body: JSON.stringify({ name, password: password || undefined }),
    }),

  getUserRooms: () =>
    request<RoomSummary[]>('/rooms'),

  getRoom: (roomId: string, password?: string) => {
    const query = password ? `?password=${encodeURIComponent(password)}` : '';
    return request<RoomDetails>(`/rooms/${roomId}${query}`);
  },

  getRoomDetails: (roomId: string) =>
    request<RoomSummary>(`/rooms/${roomId}/details`),

  getModerators: (roomId: string) =>
    request<Moderator[]>(`/rooms/${roomId}/moderators`),

  deleteRoom: (roomId: string) =>
    request<null>(`/rooms/${roomId}`, { method: 'DELETE' }),
};
