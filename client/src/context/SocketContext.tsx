import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getAccessToken } from '../api';

export interface Participant {
  id: string;
  name: string;
  role: 'host' | 'moderator' | 'participant';
  canControl: boolean;
}

export interface PlaybackState {
  videoId: string | null;
  playing: boolean;
  currentTime: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  sender: Participant;
  message: string;
  timestamp: number;
}

export interface VideoRequest {
  id: string;
  videoId: string;
  requester: Participant;
  createdAt: number;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title?: string;
  addedBy: Participant;
  addedAt: number;
}

export interface RoomState {
  room: {
    id: string;
    name: string;
    hostId: string;
    hasPassword?: boolean;
    createdAt: string;
  } | null;
  participant: Participant | null;
  participants: Participant[];
  playback: PlaybackState;
  messages: ChatMessage[];
  pendingRequests: VideoRequest[];
  queue: QueueItem[];
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  roomState: RoomState;
  joinRoom: (roomId: string, password?: string) => void;
  leaveRoom: () => void;
  play: (time?: number) => void;
  pause: (time?: number) => void;
  seek: (time: number) => void;
  changeVideo: (videoIdOrUrl: string) => void;
  requestVideo: (url: string) => void;
  approveVideo: (requestId: string, approved: boolean) => void;
  assignRole: (userId: string, enabled: boolean) => void;
  removeParticipant: (userId: string) => void;
  sendChat: (message: string) => void;
  addToQueue: (videoIdOrUrl: string, playNow?: boolean) => void;
  removeFromQueue: (itemId: string) => void;
  nextSong: () => void;
  lastError: string | null;
  clearError: () => void;
}

const defaultPlayback: PlaybackState = {
  videoId: null,
  playing: false,
  currentTime: 0,
  updatedAt: Date.now(),
};

const defaultRoomState: RoomState = {
  room: null,
  participant: null,
  participants: [],
  playback: defaultPlayback,
  messages: [],
  pendingRequests: [],
  queue: [],
};

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState>(defaultRoomState);
  const [lastError, setLastError] = useState<string | null>(null);

  const clearError = useCallback(() => setLastError(null), []);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      setRoomState(defaultRoomState);
      return;
    }

    const backendUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
    const socketUrl = backendUrl || window.location.origin;

    const token = getAccessToken();
    const socket = io(socketUrl, {
      path: '/api/socket.io',
      auth: token ? { token } : undefined,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('room:state', (data) => {
      setRoomState((prev) => ({
        ...prev,
        room: data.room,
        participant: data.participant,
        participants: data.participants || prev.participants,
        playback: data.playback || prev.playback,
        queue: data.queue || prev.queue,
      }));
    });

    const handleQueueUpdate = (queue: QueueItem[]) => {
      setRoomState((prev) => ({
        ...prev,
        queue: Array.isArray(queue) ? queue : prev.queue,
      }));
    };
    socket.on('queue:update', handleQueueUpdate);
    socket.on('queue_update', handleQueueUpdate);

    socket.on('room:participants', (participants: Participant[]) => {
      setRoomState((prev) => {

        const me = prev.participant;
        const updated = me
          ? participants.find((p) => p.id === me.id) || me
          : prev.participant;
        return { ...prev, participants, participant: updated };
      });
    });

    socket.on('user_joined', (data) => {
      if (data.participants) {
        setRoomState((prev) => ({ ...prev, participants: data.participants }));
      }
    });

    socket.on('user_left', (data) => {
      if (data.participants) {
        setRoomState((prev) => ({ ...prev, participants: data.participants }));
      }
    });

    socket.on('playback:sync', (data: PlaybackState & { action?: string }) => {
      setRoomState((prev) => ({
        ...prev,
        playback: {
          videoId: data.videoId,
          playing: data.playing,
          currentTime: data.currentTime,
          updatedAt: data.updatedAt,
        },
      }));
    });

    socket.on('sync_state', (data) => {
      setRoomState((prev) => ({
        ...prev,
        playback: {
          ...prev.playback,
          videoId: data.videoId ?? prev.playback.videoId,
          playing: data.playState === 'playing',
          currentTime: data.currentTime ?? prev.playback.currentTime,
          updatedAt: Date.now(),
        },
      }));
    });

    socket.on('change_video', (data: { videoId: string }) => {
      setRoomState((prev) => ({
        ...prev,
        playback: {
          ...prev.playback,
          videoId: data.videoId,
          currentTime: 0,
          playing: false,
          updatedAt: Date.now(),
        },
      }));
    });

    socket.on('role_assigned', (data) => {
      if (data.participants) {
        setRoomState((prev) => {
          const me = prev.participant;
          const updated = me
            ? data.participants.find((p: Participant) => p.id === me.id) || me
            : prev.participant;
          return { ...prev, participants: data.participants, participant: updated };
        });
      }
    });

    socket.on('host_transferred', (data) => {
      if (data.participants) {
        setRoomState((prev) => ({
          ...prev,
          participants: data.participants,
          room: prev.room ? { ...prev.room, hostId: data.newHostId } : null,
        }));
      }
    });

    socket.on('room:kicked', () => {
      setRoomState(defaultRoomState);
      setLastError('You have been removed from the room');
    });

    const handleIncomingMessage = (msg: ChatMessage) => {
      setRoomState((prev) => {
        if (prev.messages.some((m) => m.id === msg.id)) {
          return prev;
        }
        return {
          ...prev,
          messages: [...prev.messages, msg],
        };
      });
    };

    socket.on('chat:message', handleIncomingMessage);
    socket.on('chat_message', handleIncomingMessage);

    const handleApprovalNeeded = (req: VideoRequest) => {
      setRoomState((prev) => {
        if (prev.pendingRequests.some((r) => r.id === req.id)) {
          return prev;
        }
        return {
          ...prev,
          pendingRequests: [...prev.pendingRequests, req],
        };
      });
    };

    socket.on('video:approval-needed', handleApprovalNeeded);
    socket.on('video_approval_needed', handleApprovalNeeded);

    socket.on('video:request-result', (data: { id: string; approved: boolean }) => {
      setRoomState((prev) => ({
        ...prev,
        pendingRequests: prev.pendingRequests.filter((r) => r.id !== data.id),
      }));
    });

    socket.on('room:error', (data: { message: string }) => {
      setLastError(data.message);
    });
    socket.on('error', (data: { message: string }) => {
      setLastError(data.message);
    });

    socket.on('room:notice', (data: { message: string }) => {
      setLastError(data.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const joinRoom = useCallback((roomId: string, password?: string) => {
    socketRef.current?.emit('room:join', { roomId, password }, (res: { ok: boolean; message?: string }) => {
      if (!res.ok) setLastError(res.message || 'Failed to join room');
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    setRoomState(defaultRoomState);
  }, []);

  const play = useCallback((time?: number) => {
    socketRef.current?.emit('play', { currentTime: time });
  }, []);

  const pause = useCallback((time?: number) => {
    socketRef.current?.emit('pause', { currentTime: time });
  }, []);

  const seek = useCallback((time: number) => {
    socketRef.current?.emit('seek', { time });
  }, []);

  const changeVideo = useCallback((videoIdOrUrl: string) => {
    socketRef.current?.emit('change_video', { url: videoIdOrUrl, videoId: videoIdOrUrl });
  }, []);

  const requestVideo = useCallback((url: string) => {
    socketRef.current?.emit('video:request', { url });
  }, []);

  const approveVideo = useCallback((requestId: string, approved: boolean) => {
    socketRef.current?.emit('video:approve', { requestId, approved });
    setRoomState((prev) => ({
      ...prev,
      pendingRequests: prev.pendingRequests.filter((r) => r.id !== requestId),
    }));
  }, []);

  const assignRole = useCallback((userId: string, enabled: boolean) => {
    socketRef.current?.emit('assign_role', { userId, enabled, role: enabled ? 'moderator' : 'participant' });
  }, []);

  const removeParticipant = useCallback((userId: string) => {
    socketRef.current?.emit('remove_participant', { userId });
  }, []);

  const sendChat = useCallback((message: string) => {
    socketRef.current?.emit('chat_message', { message });
  }, []);

  const addToQueue = useCallback((videoIdOrUrl: string, playNow = false) => {
    socketRef.current?.emit('queue:add', { url: videoIdOrUrl, videoId: videoIdOrUrl, playNow });
  }, []);

  const removeFromQueue = useCallback((itemId: string) => {
    socketRef.current?.emit('queue:remove', { itemId });
  }, []);

  const nextSong = useCallback(() => {
    socketRef.current?.emit('queue:next');
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        roomState,
        joinRoom,
        leaveRoom,
        play,
        pause,
        seek,
        changeVideo,
        requestVideo,
        approveVideo,
        assignRole,
        removeParticipant,
        sendChat,
        addToQueue,
        removeFromQueue,
        nextSong,
        lastError,
        clearError,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
