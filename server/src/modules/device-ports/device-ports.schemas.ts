import { z } from 'zod';

export const devicePortIdParamSchema = z.object({
  portId: z.coerce.number().int().positive(),
});

export const updateDevicePortBodySchema = z.object({
  supplyState: z.enum(['on', 'off']),
});
