import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './src/common';
import { assertTokenSecrets } from './src/common/tokens/jwt.auth.tokens';
import authRouter from './src/module/auth/auth.routes';
import roomRouter from './src/module/room/room.routes';

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
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomRouter);
app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
