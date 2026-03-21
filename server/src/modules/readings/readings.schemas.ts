import { z } from 'zod';

export const roomIdParamSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const ingestReadingBodySchema = z.object({
  device_identifier: z.string().trim().min(3, 'Device identifier is required.'),
  timestamp: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Timestamp must be a valid ISO date string.',
  }),
  voltage: z.coerce.number().positive('Voltage must be greater than 0.'),
  current: z.coerce.number().nonnegative('Current must be 0 or greater.'),
  power_w: z.coerce.number().nonnegative('Power must be 0 or greater.'),
  frequency: z.coerce.number().min(45).max(65),
  power_factor: z.coerce.number().min(0).max(1),
  thd_percentage: z.coerce.number().min(0).max(100),
  energy_kwh: z.coerce.number().nonnegative('Energy kWh must be 0 or greater.'),
});
