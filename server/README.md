# Server

Bun / Node.js backend providing REST APIs and WebSocket server for the Watch Party system.

## Setup

```bash
bun install
```

Configure `server/.env`:
- `PORT=8000`
- `FRONTEND_URL=http://localhost:3000`
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=your-32-character-secret`
- `JWT_REFRESH_SECRET=your-32-character-refresh-secret`

Apply migrations:
```bash
bun run db:migrate
```

Run dev server:
```bash
bun run dev
```

## API Modules

### Authentication (`/api/auth`)
| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/register` | Create account and set HTTP-only JWT cookies |
| `POST` | `/login` | Verify credentials and set HTTP-only JWT cookies |
| `POST` | `/refresh` | Rotate refresh token and set new tokens |
| `POST` | `/logout` | Revoke tokens and clear auth cookies |
| `GET` | `/me` | Get authenticated user profile |

### Rooms (`/api/rooms`)
| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | List all available rooms |
| `POST` | `/` | Create a new room (User becomes Host) |
| `GET` | `/:id` | Get room metadata and verify password if protected |

### Real-Time WebSockets (`/api/socket.io`)
Socket.IO connection authenticated via the user's HTTP-only JWT cookie. Manages real-time room presence, video state broadcasting, video queues, participant requests, chat messages, and reactions.
