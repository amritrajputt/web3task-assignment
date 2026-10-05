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

const frontendUrl = process.env.FRONTEND_URL;
if (!frontendUrl) {
  throw new Error('FRONTEND_URL must be configured for credentialed CORS');
}
const frontendOrigin = new URL(frontendUrl).origin;

const app = express();
app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomRouter);
app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3000);
const server = createServer(app);
attachRoomSockets(server, frontendOrigin);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
