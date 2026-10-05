import 'dotenv/config';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './src/common';
import { assertTokenSecrets } from './src/common/tokens/jwt.auth.tokens';
import authRouter from './src/module/auth/auth.routes';
import roomRouter from './src/module/room/room.routes';
import { attachRoomSockets } from './src/module/room/room.socket';

assertTokenSecrets();

const rawFrontendUrl = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
let frontendOrigin = 'http://localhost:3000';
try {
  frontendOrigin = new URL(rawFrontendUrl).origin;
} catch {
  frontendOrigin = rawFrontendUrl;
}

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomRouter);

const clientDist = resolve(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3000);
const server = createServer(app);
attachRoomSockets(server, frontendOrigin);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
