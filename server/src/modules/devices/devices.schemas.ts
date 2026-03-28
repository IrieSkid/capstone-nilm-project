import { z } from 'zod';

const deviceStatusSchema = z.enum(['online', 'offline']);
const nullableForeignKeySchema = z.preprocess(
  (value) => (value === null || value === undefined || value === '' ? null : value),
  z.union([z.null(), z.coerce.number().int().positive()]),
);

export const deviceIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createDeviceBodySchema = z.object({
  device_name: z.string().trim().min(3, 'Device name must be at least 3 characters long.'),
  device_identifier: z
    .string()
    .trim()
    .min(3, 'Device identifier must be at least 3 characters long.')
    .regex(/^[A-Za-z0-9-]+$/, 'Device identifier may only contain letters, numbers, and dashes.'),
  device_owner_landlord_id: nullableForeignKeySchema.default(null),
  device_status: deviceStatusSchema.default('offline'),
});

export const updateDeviceBodySchema = z
  .object({
    device_name: z.string().trim().min(3, 'Device name must be at least 3 characters long.').optional(),
    device_identifier: z
      .string()
      .trim()
      .min(3, 'Device identifier must be at least 3 characters long.')
      .regex(/^[A-Za-z0-9-]+$/, 'Device identifier may only contain letters, numbers, and dashes.')
      .optional(),
    device_owner_landlord_id: nullableForeignKeySchema.optional(),
    device_status: deviceStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });
