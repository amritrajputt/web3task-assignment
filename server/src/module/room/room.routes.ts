import { Router } from 'express';
import { validateBody } from '../../common';
import { authenticate } from '../auth/auth.middleware';
import { RoomController } from './room.controller';
import { createRoomSchema } from './room.dto';

const roomRouter = Router();

roomRouter.post(
  '/create',
  authenticate,
  validateBody(createRoomSchema),
  RoomController.createRoom,
);

export default roomRouter;