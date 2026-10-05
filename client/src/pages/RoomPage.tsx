import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket, type Participant, type VideoRequest, type QueueItem } from '../context/SocketContext';
import './Room.css';

declare global {
  interface Window {
    YT: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: Record<string, (e: unknown) => void>;
        },
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  isMuted: () => boolean;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const existing = document.getElementById('yt-iframe-api');
    if (existing) {
      const check = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      return;
    }
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    window.onYouTubeIframeAPIReady = () => resolve();
    document.head.appendChild(tag);
  });
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const AVATAR_COLORS = [
  '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6',
  '#06b6d4', '#f97316', '#14b8a6', '#3b82f6', '#ef4444'
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const QUICK_EMOJIS = ['😍', '😆', '😂', '😱', '🔥', '❤️'];

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
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
  } = useSocket();

  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const ignoreStateChange = useRef(false);

  const [videoUrl, setVideoUrl] = useState('');
  const [chatMsg, setChatMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'requests' | 'queue'>('chat');
  const [roomPassword, setRoomPassword] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [showUnmuteBanner, setShowUnmuteBanner] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const { room, participant, participants, playback, messages, pendingRequests, queue } = roomState;

  useEffect(() => {
    if (!roomId || !connected) return;
    const pw = searchParams.get('password') || undefined;
    joinRoom(roomId, pw);
    return () => { leaveRoom(); };

  }, [roomId, connected]);

  useEffect(() => {
    if (!playback.videoId) return;
    let mounted = true;

    (async () => {
      await loadYouTubeAPI();
      if (!mounted) return;

      let targetTime = playback.currentTime || 0;
      if (playback.playing && playback.updatedAt) {
        targetTime += (Date.now() - playback.updatedAt) / 1000;
      }

      if (playerRef.current && playerReady) {
        ignoreStateChange.current = true;
        playerRef.current.loadVideoById(playback.videoId!, targetTime);
        if (playback.playing) {
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
        setTimeout(() => { ignoreStateChange.current = false; }, 500);
        return;
      }

      playerRef.current = new window.YT.Player('yt-player', {
        videoId: playback.videoId!,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          disablekb: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: unknown) => {
            if (!mounted) return;
            const ev = event as { target: YTPlayer };
            const player = ev.target;
            playerRef.current = player;
            setPlayerReady(true);

            let liveTime = playback.currentTime || 0;
            if (playback.playing && playback.updatedAt) {
              liveTime += (Date.now() - playback.updatedAt) / 1000;
            }

            ignoreStateChange.current = true;
            player.seekTo(liveTime, true);

            if (playback.playing) {
              try {
                player.playVideo();
              } catch {

              }

              setTimeout(() => {
                if (mounted) {
                  const state = player.getPlayerState?.();
                  if (state !== window.YT?.PlayerState?.PLAYING) {

                    player.mute();
                    setIsMuted(true);
                    setShowUnmuteBanner(true);
                    player.playVideo();
                  }
                }
                ignoreStateChange.current = false;
              }, 350);
            } else {
              player.pauseVideo();
              setTimeout(() => { ignoreStateChange.current = false; }, 300);
            }
          },
          onStateChange: (event: unknown) => {
            if (ignoreStateChange.current) return;
            const e = event as { data: number };
            const player = playerRef.current;
            if (!player) return;

            if (participant?.canControl) {

              if (e.data === window.YT.PlayerState.PLAYING) {
                play(player.getCurrentTime());
              } else if (e.data === window.YT.PlayerState.PAUSED) {
                pause(player.getCurrentTime());
              } else if (e.data === window.YT.PlayerState.ENDED) {

                if (queue.length > 0) {
                  nextSong();
                }
              }
            } else {

              if (playback.playing && e.data === window.YT.PlayerState.PAUSED) {
                let liveTime = playback.currentTime;
                if (playback.updatedAt) {
                  liveTime += (Date.now() - playback.updatedAt) / 1000;
                }
                ignoreStateChange.current = true;
                player.seekTo(liveTime, true);
                player.playVideo();
                setTimeout(() => { ignoreStateChange.current = false; }, 300);
              } else if (!playback.playing && e.data === window.YT.PlayerState.PLAYING) {
                ignoreStateChange.current = true;
                player.pauseVideo();
                setTimeout(() => { ignoreStateChange.current = false; }, 300);
              }
            }
          },
        },
      });
    })();

    return () => { mounted = false; };

  }, [playback.videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playback.videoId || !playerReady) return;

    ignoreStateChange.current = true;

    try {
      if (playback.playing) {
        let targetTime = playback.currentTime;
        if (playback.updatedAt) {
          targetTime += (Date.now() - playback.updatedAt) / 1000;
        }
        const curr = player.getCurrentTime?.() ?? 0;
        if (Math.abs(curr - targetTime) > 2) {
          player.seekTo(targetTime, true);
        }
        if (player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) {
          player.playVideo();
        }
      } else {
        const curr = player.getCurrentTime?.() ?? 0;
        if (Math.abs(curr - playback.currentTime) > 1) {
          player.seekTo(playback.currentTime, true);
        }
        if (player.getPlayerState?.() !== window.YT?.PlayerState?.PAUSED) {
          player.pauseVideo();
        }
      }
    } finally {
      setTimeout(() => { ignoreStateChange.current = false; }, 300);
    }
  }, [playerReady, playback.playing, playback.currentTime, playback.videoId, playback.updatedAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !playerReady) return;

      if (typeof player.getCurrentTime === 'function') {
        const curr = player.getCurrentTime() || 0;
        const dur = player.getDuration() || 0;
        setCurrentTime(curr);
        setDuration(dur);

        if (!participant?.canControl && playback.playing && playback.updatedAt) {
          const liveTime = playback.currentTime + (Date.now() - playback.updatedAt) / 1000;
          if (Math.abs(curr - liveTime) > 3) {
            ignoreStateChange.current = true;
            player.seekTo(liveTime, true);
            setTimeout(() => { ignoreStateChange.current = false; }, 300);
          }
          if (player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) {
            ignoreStateChange.current = true;
            player.playVideo();
            setTimeout(() => { ignoreStateChange.current = false; }, 300);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [playerReady, participant?.canControl, playback.playing, playback.currentTime, playback.updatedAt]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (lastError) {
      const t = setTimeout(clearError, 5000);
      return () => clearTimeout(t);
    }
  }, [lastError, clearError]);

  const handleAddToQueue = (playNow = false) => {
    if (!videoUrl.trim()) return;
    if (participant?.canControl) {
      if (playNow || !playback.videoId) {
        changeVideo(videoUrl.trim());
      } else {
        addToQueue(videoUrl.trim(), false);
      }
    } else {
      requestVideo(videoUrl.trim());
    }
    setVideoUrl('');
    setShowVideoModal(false);
  };

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    sendChat(chatMsg.trim());
    setChatMsg('');
  };

  const handleQuickEmoji = (emoji: string) => {
    sendChat(emoji);
  };

  const togglePlayPause = () => {
    if (!participant?.canControl) return;
    if (playback.playing) {
      pause(currentTime);
    } else {
      play(currentTime);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!participant?.canControl) return;
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    seek(target);
    playerRef.current?.seekTo(target, true);
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/dashboard');
  };

  const handleCopyCode = () => {
    if (room?.id) {
      navigator.clipboard.writeText(room.id);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    }
  };

  if (!connected) {
    return (
      <div className="center-page tonbar-bg">
        <div className="tonbar-card animate-fade-in" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
          <span className="spinner" style={{ margin: '0 auto var(--space-4)' }} />
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Connecting to Server…</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
            Establishing real-time connection
          </p>
        </div>
      </div>
    );
  }

  if (!room) {
    const isPasswordError = Boolean(lastError?.toLowerCase().includes('password'));

    const handlePasswordSubmit = (e: FormEvent) => {
      e.preventDefault();
      if (!roomId) return;
      clearError();
      joinRoom(roomId, roomPassword);
    };

    return (
      <div className="center-page tonbar-bg">
        <div className="tonbar-card animate-fade-in-up" style={{ maxWidth: 420, width: '100%', padding: 'var(--space-8)', textAlign: 'center' }}>
          {!isPasswordError && <span className="spinner" style={{ margin: '0 auto var(--space-4)' }} />}
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isPasswordError ? 'Password Protected Room' : 'Joining Watch Party…'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
            {isPasswordError ? 'This room requires a password to enter.' : 'Preparing real-time sync…'}
          </p>

          {lastError && (
            <div className="auth-error" style={{ marginTop: 'var(--space-4)' }}>
              {lastError}
            </div>
          )}

          {isPasswordError && (
            <form onSubmit={handlePasswordSubmit} style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Enter Room Password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                Enter Room
              </button>
            </form>
          )}

          <button className="btn btn-ghost" onClick={handleLeave} style={{ marginTop: 'var(--space-6)', width: '100%' }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const hostParticipant = participants.find((p) => p.role === 'host');
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="tonbar-workspace">

      {copyToast && (
        <div className="tonbar-toast animate-fade-in">
          Room ID copied to clipboard!
        </div>
      )}

      {lastError && (
        <div className="tonbar-toast error animate-fade-in" onClick={clearError}>
          {lastError}
        </div>
      )}

      <div className="tonbar-container">

        <header className="tonbar-header">

          <div className="tonbar-channel">
            <div className="tonbar-avatar">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"
                  fill="#121316"
                />
              </svg>
            </div>
            <div className="tonbar-channel-info">
              <h1 className="tonbar-title">{room.name}</h1>
              <span className="tonbar-subtitle">
                {hostParticipant ? `Host: ${hostParticipant.name}` : 'Live Watch Party'} • {participants.length} joined
              </span>
            </div>
          </div>

          <div className="tonbar-header-actions">
            <button
              className="btn btn-secondary tonbar-pill-btn"
              onClick={handleCopyCode}
              title="Click to copy room code"
            >
              Share Code
            </button>
            <button
              className="btn btn-primary tonbar-pill-btn"
              onClick={handleLeave}
            >
              Leave Room
            </button>
          </div>
        </header>

        <div className="tonbar-subbar">
          <div className="tonbar-video-info">
            <span className="tonbar-video-title">
              {playback.videoId ? `Watching YouTube: ${playback.videoId}` : 'The Last Anjay The Movie (2021)'}
            </span>
          </div>
          <div className="tonbar-viewers-count">
            <span className="tonbar-viewers-text">
              {participants.length > 10 ? `${(participants.length / 10).toFixed(1)}K` : participants.length} Viewers
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="tonbar-eye-icon">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
          </div>
        </div>

        <div className={`tonbar-body ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>

          <div className="tonbar-video-col">
            <div className="tonbar-video-wrapper" ref={playerContainerRef}>
              {playback.videoId ? (
                <div className="tonbar-video-player">
                  <div id="yt-player" />

                  {!participant?.canControl && (
                    <div
                      className="viewer-video-overlay"
                      onClick={() => {
                        if (isMuted && playerRef.current) {
                          playerRef.current.unMute();
                          setIsMuted(false);
                          setShowUnmuteBanner(false);
                        }
                      }}
                      title="Playback is synchronized by the Host. Click to unmute."
                    />
                  )}

                  {showUnmuteBanner && (
                    <button
                      type="button"
                      className="unmute-banner animate-fade-in"
                      onClick={() => {
                        if (playerRef.current) {
                          playerRef.current.unMute();
                          setIsMuted(false);
                          setShowUnmuteBanner(false);
                        }
                      }}
                    >
                      🔊 Video playing muted for autoplay. Click to unmute!
                    </button>
                  )}
                </div>
              ) : (
                <div className="tonbar-video-placeholder">
                  <div className="placeholder-content">
                    <div className="placeholder-icon">▶</div>
                    <h3>No Active Video</h3>
                    <p>
                      {participant?.canControl
                        ? 'Paste a YouTube video URL or ID to start synchronized viewing'
                        : 'Waiting for the host to select a movie or video'}
                    </p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowVideoModal(true)}
                      style={{ marginTop: 'var(--space-4)' }}
                    >
                      {participant?.canControl ? 'Set Video URL' : 'Request Video'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="tonbar-controls-bar">

              <button
                className="tonbar-control-btn play-pause-btn"
                onClick={togglePlayPause}
                title={participant?.canControl ? (playback.playing ? 'Pause' : 'Play') : 'Playback controlled by Host'}
                disabled={!participant?.canControl}
              >
                {playback.playing ? (
                  <span className="icon-pause">❚❚</span>
                ) : (
                  <span className="icon-play">▶</span>
                )}
              </button>

              {participant?.canControl && queue.length > 0 && (
                <button
                  className="tonbar-control-btn skip-btn"
                  onClick={nextSong}
                  title={`Skip to next song (${queue.length} in queue)`}
                >
                  ⏭
                </button>
              )}

              <div className="tonbar-scrub-track">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.5"
                  value={currentTime}
                  onChange={handleSeekChange}
                  disabled={!participant?.canControl}
                  className="tonbar-slider"
                  style={{
                    background: `linear-gradient(to right, #f5b82e ${progressPercent}%, #2d303a ${progressPercent}%)`,
                  }}
                />
              </div>

              <div className="tonbar-timecode">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <div className="tonbar-right-controls">
                <button
                  className="tonbar-control-btn"
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>
                <button
                  className="tonbar-control-btn"
                  onClick={() => setShowVideoModal(true)}
                  title="Add Song / Video"
                >
                  ⚙
                </button>
                <button
                  className="tonbar-control-btn"
                  onClick={toggleFullscreen}
                  title="Fullscreen"
                >
                  ⛶
                </button>
              </div>
            </div>

            {showVideoModal && (
              <div className="tonbar-video-modal animate-fade-in-up">
                <div className="video-modal-header">
                  <h4>{participant?.canControl ? 'Add Song / Video' : 'Request YouTube Video'}</h4>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowVideoModal(false)}>✕</button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddToQueue(false);
                  }}
                  className="video-modal-form"
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  <input
                    className="form-input"
                    placeholder="https://www.youtube.com/watch?v=... or Video ID"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    autoFocus
                  />
                  <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {participant?.canControl ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAddToQueue(false)}
                          title="Add to queue without pausing current song"
                        >
                          + Add to Queue
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAddToQueue(true)}
                          title="Interrupt and play immediately"
                        >
                          ▶ Play Now
                        </button>
                      </>
                    ) : (
                      <button type="submit" className="btn btn-primary btn-sm">
                        Send Request
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {participant?.canControl && pendingRequests.length > 0 && (
              <div className="tonbar-requests-banner animate-fade-in">
                <span>🔔 {pendingRequests.length} pending video request(s)</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setActiveTab('requests');
                    setSidebarOpen(true);
                  }}
                >
                  Review
                </button>
              </div>
            )}
          </div>

          <button
            className="tonbar-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide Chat' : 'Show Chat'}
          >
            {sidebarOpen ? '›' : '‹'}
          </button>

          {sidebarOpen && (
            <aside className="tonbar-sidebar animate-fade-in">

              <div className="tonbar-sidebar-header">
                <div className="sidebar-tab-left">
                  <button
                    className={`sidebar-title-btn ${activeTab === 'chat' ? 'active' : ''}`}
                    onClick={() => setActiveTab('chat')}
                  >
                    <span className="chat-yellow-icon">💬</span>
                    <span>Chat</span>
                  </button>
                </div>
                <div className="sidebar-tab-right">
                  <button
                    className={`sidebar-icon-btn ${activeTab === 'queue' ? 'active' : ''}`}
                    onClick={() => setActiveTab('queue')}
                    title={`Song Queue (${queue.length})`}
                  >
                    🎵
                    {queue.length > 0 && (
                      <span className="sidebar-pill-badge">{queue.length}</span>
                    )}
                  </button>
                  <button
                    className={`sidebar-icon-btn ${activeTab === 'participants' ? 'active' : ''}`}
                    onClick={() => setActiveTab('participants')}
                    title={`Viewers (${participants.length})`}
                  >
                    👥
                  </button>
                  {participant?.canControl && (
                    <button
                      className={`sidebar-icon-btn ${activeTab === 'requests' ? 'active' : ''}`}
                      onClick={() => setActiveTab('requests')}
                      title="Video Requests"
                    >
                      🎬
                      {pendingRequests.length > 0 && (
                        <span className="sidebar-pill-badge">{pendingRequests.length}</span>
                      )}
                    </button>
                  )}
                  <button
                    className="sidebar-icon-btn"
                    onClick={handleCopyCode}
                    title="Gift / Share"
                  >
                    🎁
                  </button>
                </div>
              </div>

              {activeTab === 'chat' && (
                <div className="tonbar-chat-panel">

                  <div className="tonbar-messages-list">
                    {messages.length === 0 ? (
                      <div className="chat-empty-state">
                        <p>No messages yet. Say hi to the room! 👋</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isSelf = msg.sender.id === user?.id;
                        const avatarBg = getAvatarColor(msg.sender.name);
                        const initial = msg.sender.name.charAt(0).toUpperCase();

                        return (
                          <div
                            key={msg.id}
                            className={`tonbar-message-item ${isSelf ? 'msg-self' : 'msg-other'}`}
                          >

                            <div className="msg-avatar-col">
                              <div
                                className="msg-avatar"
                                style={{ backgroundColor: avatarBg }}
                              >
                                {initial}
                              </div>
                              <span className="msg-author-name">{msg.sender.name}</span>
                            </div>

                            <div className="msg-bubble-wrap">
                              <div className="msg-bubble">
                                <p className="msg-text">{msg.message}</p>
                              </div>
                              <span className={`msg-timestamp ${isSelf ? 'timestamp-self' : ''}`}>
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="tonbar-floating-emojis">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="quick-emoji-btn"
                        onClick={() => handleQuickEmoji(emoji)}
                        title={`Send ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <form className="tonbar-chat-input-form" onSubmit={handleChatSubmit}>
                    <div className="tonbar-input-wrapper">
                      <input
                        className="tonbar-input"
                        placeholder="Type comment..."
                        value={chatMsg}
                        onChange={(e) => setChatMsg(e.target.value)}
                        maxLength={500}
                        id="chat-comment-input"
                      />
                      <div className="tonbar-input-buttons">
                        <button
                          type="submit"
                          className="input-action-btn send-btn"
                          title="Send message"
                          disabled={!chatMsg.trim()}
                        >
                          ➤
                        </button>
                        <button
                          type="button"
                          className="input-action-btn smiley-btn"
                          onClick={() => handleQuickEmoji('😊')}
                          title="Emoji"
                        >
                          😊
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'participants' && (
                <div className="tonbar-participants-panel">
                  <div className="participants-panel-header">
                    <h4>Room Participants ({participants.length})</h4>
                  </div>
                  <div className="participants-scroll">
                    {participants.map((p: Participant) => (
                      <div className="tonbar-p-item" key={p.id}>
                        <div className="p-item-left">
                          <div
                            className="msg-avatar"
                            style={{ backgroundColor: getAvatarColor(p.name) }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="p-info">
                            <span className="p-name">
                              {p.name} {p.id === user?.id && '(You)'}
                            </span>
                            <span className={`badge badge-${p.role}`}>
                              {p.role.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {participant?.role === 'host' && p.id !== user?.id && (
                          <div className="p-actions">
                            {p.role === 'participant' ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => assignRole(p.id, true)}
                                title="Promote to Moderator"
                              >
                                ⬆ Make Mod
                              </button>
                            ) : p.role === 'moderator' ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => assignRole(p.id, false)}
                                title="Demote to Viewer"
                              >
                                ⬇ Demote
                              </button>
                            ) : null}
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => removeParticipant(p.id)}
                              title="Remove from room"
                              style={{ color: 'var(--error)' }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="tonbar-requests-panel">
                  <div className="requests-panel-header">
                    <h4>Pending Video Requests</h4>
                  </div>
                  {pendingRequests.length === 0 ? (
                    <div className="chat-empty-state">
                      <p>No video requests pending.</p>
                    </div>
                  ) : (
                    <div className="requests-scroll">
                      {pendingRequests.map((req: VideoRequest) => (
                        <div className="tonbar-req-card" key={req.id}>
                          <div className="req-card-body">
                            <span className="req-name">{req.requester.name} requested:</span>
                            <span className="req-url">ID: {req.videoId}</span>
                          </div>
                          <div className="req-card-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => approveVideo(req.id, true)}
                            >
                              ✓ Approve
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => approveVideo(req.id, false)}
                            >
                              ✕ Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'queue' && (
                <div className="tonbar-queue-panel animate-fade-in">
                  <div className="queue-panel-header">
                    <h4>Upcoming Songs ({queue.length})</h4>
                    {participant?.canControl && queue.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={nextSong} title="Skip to next song in queue">
                        Next ⏭
                      </button>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!videoUrl.trim()) return;
                      addToQueue(videoUrl.trim(), false);
                      setVideoUrl('');
                    }}
                    className="queue-add-form"
                  >
                    <input
                      className="tonbar-input"
                      placeholder="Paste YouTube URL to add to queue..."
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!videoUrl.trim()}>
                      + Queue
                    </button>
                  </form>

                  {playback.videoId && (
                    <div className="queue-now-playing">
                      <span className="now-playing-tag">▶ CURRENTLY PLAYING</span>
                      <span className="now-playing-title">YouTube: {playback.videoId}</span>
                    </div>
                  )}

                  {queue.length === 0 ? (
                    <div className="chat-empty-state">
                      <p>Queue is empty! Add songs to play next without pausing.</p>
                    </div>
                  ) : (
                    <div className="queue-scroll">
                      {queue.map((item: QueueItem, idx: number) => (
                        <div className="queue-item-card" key={item.id}>
                          <div className="queue-item-index">#{idx + 1}</div>
                          <div className="queue-item-details">
                            <span className="queue-item-title">
                              YouTube ({item.videoId})
                            </span>
                            <span className="queue-item-meta">
                              Added by {item.addedBy.name}
                            </span>
                          </div>
                          <div className="queue-item-actions">
                            {participant?.canControl && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  removeFromQueue(item.id);
                                  changeVideo(item.videoId);
                                }}
                                title="Play now"
                              >
                                ▶
                              </button>
                            )}
                            {(participant?.canControl || item.addedBy.id === user?.id) && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => removeFromQueue(item.id)}
                                title="Remove from queue"
                                style={{ color: 'var(--error)' }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
