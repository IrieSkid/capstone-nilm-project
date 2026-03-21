import { Router } from 'express';

import { authenticate, authorize } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { assertRoomAccess } from '../../shared/utils/room-access';
import { roomIdParamSchema } from '../readings/readings.schemas';
import {
  devicePortIdParamSchema,
  updateDevicePortBodySchema,
} from './device-ports.schemas';
import {
  getDevicePortsByRoomId,
  updateDevicePortSupplyState,
} from './device-ports.service';

export const devicePortsRouter = Router();

devicePortsRouter.get(
  '/room/:roomId',
  authenticate,
  authorize('admin', 'tenant'),
  validate({ params: roomIdParamSchema }),
  async (req, res) => {
    const roomId = Number(req.params.roomId);

    await assertRoomAccess(req.user!, roomId);
    const ports = await getDevicePortsByRoomId(roomId);

    res.json({
      data: ports,
    });
  },
);

devicePortsRouter.patch(
  '/:portId',
  authenticate,
  authorize('admin', 'tenant'),
  validate({
    params: devicePortIdParamSchema,
    body: updateDevicePortBodySchema,
  }),
  async (req, res) => {
    const port = await updateDevicePortSupplyState({
      portId: Number(req.params.portId),
      supplyState: req.body.supplyState,
      user: req.user!,
    });

    res.json({
      message: 'Device port supply state updated successfully.',
      data: port,
    });
  },
);
