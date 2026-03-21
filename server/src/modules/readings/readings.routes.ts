import { Router } from 'express';

import { authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { assertRoomAccess } from '../../shared/utils/room-access';
import { getReadingHistoryByRoomId, getLatestReadingByRoomId, ingestReading } from './readings.service';
import { ingestReadingBodySchema, roomIdParamSchema } from './readings.schemas';

export const readingsRouter = Router();

readingsRouter.post('/ingest', validate({ body: ingestReadingBodySchema }), async (req, res) => {
  const result = await ingestReading(req.body);

  res.status(201).json({
    message: 'Reading ingested successfully.',
    data: result,
  });
});

readingsRouter.get(
  '/latest/:roomId',
  authenticate,
  validate({ params: roomIdParamSchema }),
  async (req, res) => {
    const roomId = Number(req.params.roomId);

    await assertRoomAccess(req.user!, roomId);
    const reading = await getLatestReadingByRoomId(roomId);

    res.json({
      data: reading,
    });
  },
);

readingsRouter.get(
  '/history/:roomId',
  authenticate,
  validate({ params: roomIdParamSchema }),
  async (req, res) => {
    const roomId = Number(req.params.roomId);

    await assertRoomAccess(req.user!, roomId);
    const history = await getReadingHistoryByRoomId(roomId);

    res.json({
      data: history,
    });
  },
);
