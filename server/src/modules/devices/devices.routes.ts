import { Router } from 'express';

import { authorize, authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import { createDevice, listDevices, updateDevice } from './devices.service';
import {
  createDeviceBodySchema,
  deviceIdParamsSchema,
  updateDeviceBodySchema,
} from './devices.schemas';

export const devicesRouter = Router();

devicesRouter.use(authenticate, authorize('admin'));

devicesRouter.get('/', async (_req, res) => {
  const devices = await listDevices();

  res.json({
    data: devices,
  });
});

devicesRouter.post('/', validate({ body: createDeviceBodySchema }), async (req, res) => {
  const device = await createDevice(req.body);

  res.status(201).json({
    message: 'Device created successfully.',
    data: device,
  });
});

devicesRouter.patch(
  '/:id',
  validate({
    params: deviceIdParamsSchema,
    body: updateDeviceBodySchema,
  }),
  async (req, res) => {
    const device = await updateDevice(Number(req.params.id), req.body);

    res.json({
      message: 'Device updated successfully.',
      data: device,
    });
  },
);
