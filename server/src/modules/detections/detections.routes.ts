import { Router } from 'express';

import { authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { assertRoomAccess } from '../../shared/utils/room-access';
import { roomIdParamSchema } from '../readings/readings.schemas';
import { getLatestDetectionByRoomId } from './detections.service';

export const detectionsRouter = Router();

detectionsRouter.get(
  '/latest/:roomId',
  authenticate,
  validate({ params: roomIdParamSchema }),
  async (req, res) => {
    const roomId = Number(req.params.roomId);

    await assertRoomAccess(req.user!, roomId);
    const detection = await getLatestDetectionByRoomId(roomId);

    res.json({
      data: detection,
    });
  },
);
