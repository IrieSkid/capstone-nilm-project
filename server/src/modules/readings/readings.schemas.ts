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
  thd_percentage: z.coerce.number().min(0).max(100).nullable().optional(),
  energy_kwh: z.coerce.number().nonnegative('Energy kWh must be 0 or greater.'),
});

export const ingestHeartbeatBodySchema = z.object({
  device_identifier: z.string().trim().min(3, 'Device identifier is required.'),
  timestamp: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Timestamp must be a valid ISO date string.',
  }).nullable().optional(),
  uptime_seconds: z.coerce.number().int().nonnegative(),
  wifi_rssi_dbm: z.coerce.number().int().min(-127).max(0).nullable().optional(),
  pzem_ok: z.boolean(),
  last_reading_http_status: z.coerce.number().int().min(-1000).max(599).nullable().optional(),
  firmware_version: z.string().trim().min(1).max(30),
  error_code: z.string().trim().min(1).max(100).nullable().optional(),
});
