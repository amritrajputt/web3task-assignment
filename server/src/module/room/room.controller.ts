import type { Request, Response } from 'express';
import { ApiResponse } from '../../common';
import { RoomService } from './room.service';

export class RoomController {
  static createRoom = async (req: Request, res: Response) => {
    const { name, password } = req.body;
    const room = await RoomService.createRoom(
      name,
      password,
      res.locals.auth.id,
    );

    res.status(201).json(ApiResponse.created(room, 'Room created'));
  };
}