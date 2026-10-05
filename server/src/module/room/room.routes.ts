import { Router } from 'express';
import { validateBody } from '../../common';
import { authenticate } from '../auth/auth.middleware';
import { RoomController } from './room.controller';
import { createRoomSchema, transferHostSchema } from './room.dto';

const roomRouter = Router();

roomRouter.post(
  '/create',
  authenticate,
  validateBody(createRoomSchema),
  RoomController.createRoom,
);

roomRouter.get('/', authenticate, RoomController.getUserRooms);

roomRouter.get('/:roomId', authenticate, RoomController.getRoom);

roomRouter.get('/:roomId/details', RoomController.getRoomDetails);

roomRouter.get(
  '/:roomId/moderators',
  authenticate,
  RoomController.getRoomModerators,
);

roomRouter.put(
  '/:roomId/moderators/:moderatorId',
  authenticate,
  RoomController.setModerator,
);

roomRouter.post(
  '/:roomId/transfer-host',
  authenticate,
  validateBody(transferHostSchema),
  RoomController.transferHost,
);

roomRouter.delete('/:roomId', authenticate, RoomController.deleteRoom);

export default roomRouter;