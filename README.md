# YouTube Watch Party System

A synchronized watch-party platform built with React, Node.js, Express, Socket.IO, and PostgreSQL. It allows groups to watch YouTube videos in real time with synchronized playback, role-based controls (Host, Moderator, Participant), a shared video queue, participant request approvals, and in-room chat.

---

## Overview

In a typical video-sharing scenario, participants manually hit play or pause, leading to desynchronized playback across different internet connections. This system provides an authoritative room-based playback engine:

1. One user creates a room and becomes the **Host**.
2. Participants join using a room ID or shareable link.
3. Playback state (current video, play/pause state, elapsed time) is tracked on the server and synchronized across all connected clients via WebSockets.
4. When authorized users (Host or Moderator) play, pause, seek, or change videos, all clients receive state updates and mirror the action.
5. New joiners immediately start playing from the room's current playback position.

---

## Architecture and Data Flow

### System Components

```
+-------------------------------------------------------------+
|                        Client Layer                         |
|   React 19 + TypeScript + Vite                              |
|   - YouTube IFrame API wrapper                              |
|   - Socket.IO client (auto-reconnect, event dispatch)       |
|   - AuthContext & SocketContext                             |
+------------------------------+------------------------------+
                               |
               HTTP (REST) / WebSocket (Socket.IO)
                               |
+------------------------------v------------------------------+
|                        Server Layer                         |
|   Node.js / Bun + Express 5                                 |
|   - REST API: Authentication (/api/auth), Rooms (/api/rooms)|
|   - WebSocket Gateway: Socket.IO (/api/socket.io)           |
|   - Auth Middleware: JWT verification via HTTP-only cookie  |
|   - Room Manager: In-memory live state engine               |
+------------------------------+------------------------------+
                               |
                        Drizzle ORM
                               |
+------------------------------v------------------------------+
|                       Database Layer                        |
|   PostgreSQL (Neon / Local)                                 |
|   - users: account credentials (bcrypt) and refresh tokens  |
|   - rooms: room metadata, creator reference, passwords      |
|   - room_moderators: persistent moderator assignments       |
+-------------------------------------------------------------+
```

### Playback Synchronization Model

The server acts as the single source of truth for playback state. To avoid continuous polling and unnecessary bandwidth consumption:

1. **State Anchor:** The server stores:
   - `videoId`: Currently loaded YouTube video ID.
   - `playState`: Current status (`PLAYING` or `PAUSED`).
   - `currentTime`: Time offset in seconds at the moment of the last update.
   - `lastUpdated`: Server timestamp (`Date.now()`) when the state was recorded.

2. **Authoritative Time Calculation:** When a client joins or state is requested:
   - If `playState === 'PLAYING'`:
     `effectiveTime = currentTime + (Date.now() - lastUpdated) / 1000`
   - If `playState === 'PAUSED'`:
     `effectiveTime = currentTime`

3. **Drift Compensation:** When a client receives `sync_state`:
   - It checks the difference between its local player time and the server timestamp.
   - If the difference is greater than 1.5 seconds, the client seeks to the server time.
   - Differences under 1.5 seconds are ignored to prevent micro-stutter caused by normal network jitter.

4. **Autoplay Policy Handling:** Browsers restrict programmatic media playback with audio. When a user joins:
   - Playback starts muted to ensure the video begins playing immediately in sync.
   - An unmute prompt is displayed so the user can enable audio with a single interaction.

---

## Role-Based Access Control (RBAC)

Each room enforces a three-tier permission model. Permissions are validated on both the client (UI rendering) and the backend (WebSocket event guards).

| Action | Host (Creator) | Moderator | Participant |
| :--- | :---: | :---: | :---: |
| Play / Pause | Yes | Yes | No |
| Seek Timeline | Yes | Yes | No |
| Change Video (Direct) | Yes | Yes | No |
| Add to Queue | Yes | Yes | Yes |
| Skip / Remove from Queue | Yes | Yes | No |
| Approve / Reject Video Requests | Yes | Yes | No |
| Submit Video Request | N/A | N/A | Yes |
| Promote / Demote Roles | Yes | No | No |
| Kick Participant | Yes | No | No |
| Send Chat & Reactions | Yes | Yes | Yes |

*Note: For Participants, an interactive overlay shields the YouTube iframe to prevent manual pause/play actions that would desynchronize their local client from the room.*

---

## Tech Stack

### Frontend
- **React 19:** Functional UI components with hooks.
- **TypeScript:** Type safety across API responses and WebSocket payloads.
- **Vite:** Fast development server and production bundler.
- **React Router DOM v7:** Client-side routing with route guards for authenticated access.
- **Socket.IO Client v4:** Bidirectional communication with automatic reconnection.
- **Vanilla CSS:** Custom design system without heavy framework overhead.
- **YouTube IFrame Player API:** Direct programmatic video control (cue, load, play, pause, seek).

### Backend
- **Bun / Node.js:** JavaScript runtime.
- **Express 5:** REST routing for authentication and room management.
- **Socket.IO v4:** Real-time event handling, room isolation, and broadcasting.
- **Drizzle ORM:** Type-safe SQL schema definitions, migrations, and queries.
- **PostgreSQL:** Relational data store for users, persistent rooms, and role mappings.
- **Zod:** Runtime request payload validation.
- **JWT (`jsonwebtoken`) & `cookie-parser`:** Stateless authentication using HTTP-only cookies.
- **`bcryptjs`:** Password hashing.

---

## Features

### 1. Synchronized Video Playback
- Instant play, pause, seek, and video changes mirrored across all participants.
- Automatic synchronization for new users upon entering the room.

### 2. Video & Song Queue
- Background queuing (`+ Add to Queue`) allows users to queue upcoming videos without interrupting the current track.
- Automatic queue advance: listens to the YouTube player's `ENDED` state to automatically load the next queued video.
- Host and Moderator management: skip tracks (`Next`) or remove queued entries.

### 3. Video Request & Approval Workflow
- Participants cannot change the active video directly; instead, they submit a video request.
- Requests appear in a dedicated review modal for Hosts and Moderators with accept and reject options.
- Approving a request loads the video immediately for the room.

### 4. Real-Time Chat & Reactions
- In-room chat sidebar with participant roles and message timestamps.
- Floating emoji reactions for quick non-intrusive audience feedback.

### 5. Participant Management
- Real-time viewer count and participant drawer.
- Host can promote participants to Moderator, demote them, or remove them from the session.

---

## WebSocket Event Specification

Communication between client and server follows this event contract:

| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `join_room` | Client -> Server | `{ roomId, password? }` | Authenticated user joins room channel. |
| `leave_room` | Client -> Server | `{ roomId }` | User explicitly exits room channel. |
| `sync_state` | Server -> Client | `{ playState, currentTime, videoId, videoTitle }` | Authoritative playback broadcast. |
| `play` | Client -> Server | `{ roomId }` | Trigger play. Checked for Host/Mod. |
| `pause` | Client -> Server | `{ roomId }` | Trigger pause. Checked for Host/Mod. |
| `seek` | Client -> Server | `{ roomId, time }` | Trigger seek to timestamp (in seconds). |
| `change_video` | Client -> Server | `{ roomId, videoId }` | Immediately switch active video. |
| `assign_role` | Client -> Server | `{ roomId, userId, role }` | Change participant role (Host only). |
| `remove_participant`| Client -> Server | `{ roomId, userId }` | Disconnect and remove participant (Host only). |
| `user_joined` | Server -> Client | `{ username, userId, role, participants }` | Broadcast when a new participant connects. |
| `user_left` | Server -> Client | `{ username, userId, participants }` | Broadcast when a participant leaves. |
| `role_assigned` | Server -> Client | `{ userId, username, role, participants }` | Broadcast when a user's role changes. |
| `participant_removed`| Server -> Client | `{ userId, participants }` | Broadcast when a user is kicked. |
| `request_video` | Client -> Server | `{ roomId, videoId, title? }` | Participant submits video for approval. |
| `review_request` | Client -> Server | `{ roomId, requestId, action }` | Host/Mod approves or rejects video request. |
| `queue_add` | Client -> Server | `{ roomId, videoId, title? }` | Add item to room video queue. |
| `queue_skip` | Client -> Server | `{ roomId }` | Skip current video to next queue item. |
| `queue_remove` | Client -> Server | `{ roomId, queueId }` | Remove specific item from queue. |
| `send_message` | Client -> Server | `{ roomId, text }` | Send chat message to room members. |
| `send_reaction` | Client -> Server | `{ roomId, emoji }` | Broadcast reaction to room members. |

---

## Limitations and Trade-offs

1. **In-Memory State vs. Horizontal Scaling**
   - *Current Implementation:* Active room playback state and video queues are stored in process memory on the Node.js instance.
   - *Trade-off:* Delivers low-latency state updates with zero database query overhead per tick. However, running multiple server instances behind a load balancer requires integrating `@socket.io/redis-adapter` and a shared Redis cache to route events and share room state across nodes.

2. **Browser Autoplay Restrictions**
   - *Current Implementation:* Chromium and WebKit policies block unmuted video playback that starts without direct user interaction.
   - *Trade-off:* The application defaults to muted playback upon joining to preserve frame-level synchronization, requiring the user to click once to unmute.

3. **YouTube Third-Party Embed Restrictions**
   - *Current Implementation:* Relies on the standard YouTube IFrame API.
   - *Trade-off:* Certain music tracks and content owners restrict playback to youtube.com only (Error 150/101). These videos cannot be embedded and must be skipped.

4. **Network Latency & Clock Drift**
   - *Current Implementation:* Simple delta comparison with a 1.5-second buffer.
   - *Trade-off:* Sufficient for casual video viewing, but users on significantly high latency (>500ms RTT) will experience slight visual offset relative to users on low latency.

5. **Host Reconnection / Transfer**
   - *Current Implementation:* Rooms persist in PostgreSQL with the original creator ID. If a host disconnects temporarily, participants remain in the room. Host transfer can be initiated manually, but automatic election of the longest-standing moderator on extended host absence is a planned improvement.

---

## Local Development Setup

### Prerequisites
- [Bun](https://bun.sh/) (or Node.js v18+)
- [PostgreSQL](https://www.postgresql.org/) database

### 1. Server Configuration
```bash
cd server
bun install
```

Create `server/.env`:
```env
PORT=8000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/watchparty
JWT_SECRET=your_minimum_32_character_access_secret_key
JWT_REFRESH_SECRET=your_minimum_32_character_refresh_secret_key
```

Run database migrations:
```bash
bun run db:migrate
```

Start backend:
```bash
bun run dev
```

### 2. Client Configuration
Open a second terminal:
```bash
cd client
bun install
bun run dev
```

The Vite dev server runs at `http://localhost:3000` and proxies `/api` and `/api/socket.io` requests to the backend at `http://localhost:8000`.

---

## Production Build

To verify production builds:

```bash
# Build frontend
cd client
bun run build

# Build backend bundle
cd ../server
bun run build
```
