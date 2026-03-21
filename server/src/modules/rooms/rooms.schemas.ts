import { z } from 'zod';

const roomStatusSchema = z.enum(['available', 'occupied']);

export const roomIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createRoomBodySchema = z.object({
  room_name: z.string().trim().min(2, 'Room name must be at least 2 characters long.'),
  room_tenant_id: z.coerce.number().int().positive(),
  room_device_id: z.coerce.number().int().positive(),
  room_rate_per_kwh: z.coerce.number().positive('Rate per kWh must be greater than 0.'),
  room_status: roomStatusSchema.default('occupied'),
});

export const updateRoomBodySchema = z
  .object({
    room_name: z.string().trim().min(2, 'Room name must be at least 2 characters long.').optional(),
    room_tenant_id: z.coerce.number().int().positive().optional(),
    room_device_id: z.coerce.number().int().positive().optional(),
    room_rate_per_kwh: z.coerce.number().positive('Rate per kWh must be greater than 0.').optional(),
    room_status: roomStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });
