import { z } from 'zod';

const landlordRoomStatusSchema = z.enum(['available', 'occupied']);
const nullableForeignKeySchema = z.preprocess(
  (value) => (value === null || value === undefined || value === '' ? null : value),
  z.union([z.null(), z.coerce.number().int().positive()]),
);

export const landlordRoomIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const landlordTenantRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createLandlordRoomBodySchema = z.object({
  room_name: z.string().trim().min(2, 'Room name must be at least 2 characters long.'),
  room_rate_per_kwh: z.coerce.number().positive('Rate per kWh must be greater than 0.'),
});

export const updateLandlordRoomBodySchema = z
  .object({
    room_tenant_id: nullableForeignKeySchema.optional(),
    room_device_id: nullableForeignKeySchema.optional(),
    room_rate_per_kwh: z.coerce.number().positive('Rate per kWh must be greater than 0.').optional(),
    room_status: landlordRoomStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const updateLandlordRoomAlertSettingsBodySchema = z
  .object({
    warning_power_w: z.coerce.number().positive('Warning threshold must be greater than 0.'),
    overload_power_w: z.coerce.number().positive('Overload threshold must be greater than 0.'),
    notify_tenant: z.boolean(),
    notify_landlord: z.boolean(),
    notify_admin: z.boolean(),
  })
  .refine((value) => value.overload_power_w > value.warning_power_w, {
    message: 'Overload threshold must be greater than the warning threshold.',
    path: ['overload_power_w'],
  });
