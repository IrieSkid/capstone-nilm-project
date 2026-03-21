import { Router } from 'express';

import { authorize, authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { createRoom, listRooms, updateRoom } from './rooms.service';
import { createRoomBodySchema, roomIdParamsSchema, updateRoomBodySchema } from './rooms.schemas';

export const roomsRouter = Router();

roomsRouter.use(authenticate, authorize('admin'));

roomsRouter.get('/', async (_req, res) => {
  const rooms = await listRooms();

  res.json({
    data: rooms,
  });
});

roomsRouter.post('/', validate({ body: createRoomBodySchema }), async (req, res) => {
  const room = await createRoom(req.body);

  res.status(201).json({
    message: 'Room created successfully.',
    data: room,
  });
});

roomsRouter.patch(
  '/:id',
  validate({
    params: roomIdParamsSchema,
    body: updateRoomBodySchema,
  }),
  async (req, res) => {
    const room = await updateRoom(Number(req.params.id), req.body);

    res.json({
      message: 'Room updated successfully.',
      data: room,
    });
  },
);
