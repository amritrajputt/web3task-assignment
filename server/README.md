# Server

Install dependencies from this directory:

```bash
bun install
```

Set `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `FRONTEND_URL` in
`server/.env`. Use different randomly generated values for the two JWT secrets.
Each JWT secret must be at least 32 characters. `FRONTEND_URL` must be the
frontend origin; `PORT` is optional and defaults to `3000`.

## Scripts

```bash
bun run dev
bun run build
bun run start
bun run test
bun run db:generate
bun run db:migrate
bun run db:studio
```

Run `db:generate` after changing `src/db/schema.ts`, then apply pending
migrations with `db:migrate`.

## Authentication API

All routes are mounted under `/api/auth`:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/register` | Create an account and set access and refresh cookies |
| `POST` | `/login` | Verify credentials and set access and refresh cookies |
| `POST` | `/refresh` | Rotate the refresh cookie and set new tokens |
| `POST` | `/logout` | Revoke the refresh cookie if present and clear both auth cookies |
| `GET` | `/me` | Return the current user; requires the access cookie |

Register accepts `{ "name": "...", "email": "...", "password": "..." }`;
login accepts `{ "email": "...", "password": "..." }`. Passwords must be
8-128 characters. Request validation uses the shared DTO middleware.

Tokens are not returned in JSON. Both are sent as HttpOnly cookies: the access
cookie is scoped to `/api`, and the refresh cookie is scoped to `/api/auth`.
Cookies use SameSite=Lax and Secure in production. Browser clients must send
credentialed requests (for example, `fetch` with `credentials: "include"`).
Refresh tokens expire after seven days and are rotated; only a SHA-256 hash is
stored in the database. Passwords are hashed using bcrypt. Access tokens expire
after 15 minutes.

The schema has nullable OTP fields for a future verification flow; the current
routes do not send or verify email OTPs.
