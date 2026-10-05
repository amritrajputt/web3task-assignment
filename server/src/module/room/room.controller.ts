import type { Request, Response } from 'express';
import { ApiResponse, AppError } from '../../common';
import { RoomService } from './room.service';

function requireStringParam(param: unknown, name: string): string {
  if (typeof param !== 'string' || param.trim().length === 0) {
    throw AppError.badRequest(`${name} is required`);
  }
  return param;
}

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

  static getUserRooms = async (_req: Request, res: Response) => {
    const userId = res.locals.auth.id;
    const rooms = await RoomService.getUserRooms(userId);
    res.status(200).json(ApiResponse.ok(rooms, 'User rooms found'));
  };

  static getRoom = async (req: Request, res: Response) => {
    const roomId = requireStringParam(req.params.roomId, 'Room ID');
    const userId = res.locals.auth.id;
    const password =
      typeof req.query.password === 'string'
        ? req.query.password
        : typeof req.body?.password === 'string'
          ? req.body.password
          : undefined;

    const room = await RoomService.getRoom(roomId, userId, password);
    res.status(200).json(ApiResponse.ok(room, 'Room found'));
  };

  static getRoomDetails = async (req: Request, res: Response) => {
    const roomId = requireStringParam(req.params.roomId, 'Room ID');
    const details = await RoomService.getRoomDetails(roomId);
    res.status(200).json(ApiResponse.ok(details, 'Room details found'));
  };

  static getRoomModerators = async (req: Request, res: Response) => {
    const roomId = requireStringParam(req.params.roomId, 'Room ID');
    const moderators = await RoomService.getRoomModerators(roomId);
    res.status(200).json(ApiResponse.ok(moderators, 'Moderators found'));
  };

  static setModerator = async (req: Request, res: Response) => {
    const roomId = requireStringParam(req.params.roomId, 'Room ID');
    const moderatorId = requireStringParam(
      req.params.moderatorId,
      'Participant ID',
    );
    const hostUserId = res.locals.auth.id;
    const enabled =
      typeof req.body?.enabled === 'boolean'
        ? req.body.enabled
        : req.body?.role === 'moderator'
          ? true
          : false;

    await RoomService.setModerator(roomId, hostUserId, moderatorId, enabled);
    res.status(200).json(
      ApiResponse.ok(
        null,
        enabled ? 'Moderator assigned' : 'Moderator removed',
      ),
    );
  };

  static transferHost = async (req: Request, res: Response) => {
    const roomId = requireStringParam(req.params.roomId, 'Room ID');
    const hostUserId = res.locals.auth.id;
    const { newHostId } = req.body;
    if (!newHostId || typeof newHostId !== 'string') {
      throw AppError.badRequest('New host ID is required');
    }
    await RoomService.transferHost(roomId, hostUserId, newHostId);
    res.status(200).json(ApiResponse.ok(null, 'Host transferred successfully'));
  };

  static deleteRoom = async (req: Request, res: Response) => {
    const roomId = requireStringParam(req.params.roomId, 'Room ID');
    const hostUserId = res.locals.auth.id;
    await RoomService.deleteRoom(roomId, hostUserId);
    res.status(200).json(ApiResponse.ok(null, 'Room deleted successfully'));
  };
}