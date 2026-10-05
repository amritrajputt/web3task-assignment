import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roomApi, type RoomSummary, ApiError } from '../api';
import './Dashboard.css';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await roomApi.getUserRooms();
        if (res.data) setRooms(res.data);
      } catch {

      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await roomApi.create(roomName, roomPassword || undefined);
      if (res.data) {
        navigate(`/room/${res.data.id}`);
      }
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    setJoinError('');
    const code = joinCode.trim();
    if (!code) {
      setJoinError('Enter a room code');
      return;
    }

    const params = joinPassword ? `?password=${encodeURIComponent(joinPassword)}` : '';
    navigate(`/room/${code}${params}`);
  };

  const handleDelete = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      await roomApi.deleteRoom(roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch {

    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-layout">
      <div className="bg-mesh" />

      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand" onClick={() => navigate('/')}>
            <span className="dashboard-brand-icon">▶</span>
            <span className="dashboard-brand-text">Watch Party</span>
          </div>
          <div className="dashboard-user">
            <div className="dashboard-avatar">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="dashboard-username">{user?.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main page-container">
        <div className="dashboard-hero animate-fade-in-up">
          <h1 className="dashboard-title">Your Watch Parties</h1>
          <p className="dashboard-subtitle">
            Create a room or join one with a code
          </p>
        </div>

        <div className="dashboard-actions animate-fade-in-up" style={{ animationDelay: '0.1s' }}>

          <div className="action-card">
            <h2 className="action-card-title">
              <span className="action-icon">🔗</span>
              Join a Room
            </h2>
            <form className="action-form" onSubmit={handleJoin}>
              {joinError && <div className="auth-error">{joinError}</div>}
              <div className="form-group">
                <input
                  className="form-input"
                  placeholder="Paste room code or ID"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  id="join-code-input"
                />
              </div>
              <div className="form-group">
                <input
                  className="form-input"
                  type="password"
                  placeholder="Room password (if required)"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  id="join-password-input"
                />
              </div>
              <button className="btn btn-secondary" type="submit" id="join-room-btn">
                Join Room →
              </button>
            </form>
          </div>

          <div className="action-card action-card-accent">
            <h2 className="action-card-title">
              <span className="action-icon">✨</span>
              Create a Room
            </h2>
            {!showCreate ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => setShowCreate(true)}
                style={{ width: '100%' }}
                id="show-create-room-btn"
              >
                + New Room
              </button>
            ) : (
              <form className="action-form" onSubmit={handleCreate}>
                {createError && <div className="auth-error">{createError}</div>}
                <div className="form-group">
                  <input
                    className="form-input"
                    placeholder="Room name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    required
                    minLength={3}
                    autoFocus
                    id="room-name-input"
                  />
                </div>
                <div className="form-group">
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Password (optional)"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    id="room-password-input"
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={creating}
                    id="create-room-btn"
                  >
                    {creating ? <span className="spinner spinner-sm" /> : null}
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <section className="rooms-section animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="section-title">Your Rooms</h2>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
              <span className="spinner" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎬</div>
              <p className="empty-text">No rooms yet. Create one above to get started!</p>
            </div>
          ) : (
            <div className="rooms-grid">
              {rooms.map((room) => (
                <div className="room-card" key={room.id}>
                  <div className="room-card-header">
                    <h3 className="room-card-name">{room.name}</h3>
                    <div className="room-card-badges">
                      <span className="badge badge-host">Host</span>
                      {room.hasPassword && <span className="badge badge-locked">🔒</span>}
                    </div>
                  </div>
                  <p className="room-card-id" title={room.id}>
                    {room.id}
                  </p>
                  <p className="room-card-date">
                    Created {new Date(room.createdAt).toLocaleDateString()}
                  </p>
                  <div className="room-card-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/room/${room.id}`)}
                      id={`enter-room-${room.id}`}
                    >
                      Enter Room
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(room.id);
                      }}
                    >
                      Copy Code
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(room.id)}
                      style={{ color: 'var(--error)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
