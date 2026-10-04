import { Router } from 'express';
import { validateBody } from '../../common';
import { AuthController } from './auth.controller';
import { authenticate } from './auth.middleware';
import { loginSchema, registerSchema } from './auth.dto';

const authRouter = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  AuthController.register,
);
authRouter.post('/login', validateBody(loginSchema), AuthController.login);
authRouter.post('/refresh', AuthController.refresh);
authRouter.post('/logout', AuthController.logout);
authRouter.get('/me', authenticate, AuthController.me);

export default authRouter;