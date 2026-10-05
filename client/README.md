# Watch Party Frontend Client

React + TypeScript + Vite web client for the YouTube Watch Party System.

## Architecture & Modules

- **`src/context/AuthContext.tsx`**: Manages user authentication state, login, registration, and session persistence via HTTP-only cookies.
- **`src/context/SocketContext.tsx`**: Manages real-time bidirectional WebSocket connectivity via Socket.IO Client.
- **`src/pages/RoomPage.tsx`**: Core Watch Party experience:
  - Custom YouTube IFrame Player integration with timestamp synchronization and auto-play logic.
  - Video queue panel for adding, auto-advancing, and skipping videos.
  - Video request approval modal for Hosts and Moderators.
  - Real-time room chat and floating emoji reactions.
  - Connected participant drawer with role-based controls (Promote, Demote, Kick).
- **`src/pages/DashboardPage.tsx`**: Room discovery, search, code-based join, and room creation interface.
- **`src/pages/LandingPage.tsx`**: Public landing page introducing platform capabilities.

## Build and Run

```bash
bun install
bun run dev
```

Production build:
```bash
bun run build
```
