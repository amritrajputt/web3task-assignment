const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
const API_BASE = `${BACKEND_URL}/api`;

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
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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

export const authApi = {
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<null>('/auth/logout', { method: 'POST' }),

  refresh: () =>
    request<{ user: User }>('/auth/refresh', { method: 'POST' }),

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

  getRoom: (roomId: string, password?: string) =>
    request<RoomDetails>(`/rooms/${roomId}`, {
      method: 'GET',
      ...(password
        ? { body: JSON.stringify({ password }) }
        : {}),
    }),

  getRoomDetails: (roomId: string) =>
    request<RoomSummary>(`/rooms/${roomId}/details`),

  getModerators: (roomId: string) =>
    request<Moderator[]>(`/rooms/${roomId}/moderators`),

  deleteRoom: (roomId: string) =>
    request<null>(`/rooms/${roomId}`, { method: 'DELETE' }),
};
