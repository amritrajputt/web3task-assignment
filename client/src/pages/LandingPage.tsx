import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Landing.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="landing">
      <div className="bg-mesh" />

      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <span className="landing-brand-icon">▶</span>
            <span>Watch Party</span>
          </div>
          <div className="landing-nav-actions">
            {user ? (
              <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
                Dashboard
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={() => navigate('/login')}>
                  Sign In
                </button>
                <button className="btn btn-primary" onClick={() => navigate('/register')}>
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-glow" />
        <div className="hero-content animate-fade-in-up">
          <span className="hero-chip">Real-time Synchronized Viewing</span>
          <h1 className="hero-title">
            Watch Together,
            <br />
            <span className="hero-gradient">Anywhere.</span>
          </h1>
          <p className="hero-desc">
            Create private watch party rooms, sync YouTube videos in real time
            with friends, and control playback with role-based permissions.
          </p>
          <div className="hero-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate(user ? '/dashboard' : '/register')}
            >
              {user ? 'Go to Dashboard' : 'Create Your Room'}
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => navigate(user ? '/dashboard' : '/login')}
            >
              {user ? 'My Rooms' : 'Sign In'}
            </button>
          </div>
        </div>

        <div className="hero-features animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="feature-card">
            <div className="feature-icon">🎬</div>
            <h3 className="feature-title">Synced Playback</h3>
            <p className="feature-desc">
              Play, pause, and seek in real time across all participants.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">👑</div>
            <h3 className="feature-title">Role-Based Control</h3>
            <p className="feature-desc">
              Hosts and Moderators control playback. Participants can request videos.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3 className="feature-title">Live Chat</h3>
            <p className="feature-desc">
              Chat with your party in real time while watching together.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3 className="feature-title">Private Rooms</h3>
            <p className="feature-desc">
              Secure rooms with optional passwords. Share codes with friends.
            </p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>Watch Party — Built with React, Socket.IO & Express</p>
      </footer>
    </div>
  );
}
