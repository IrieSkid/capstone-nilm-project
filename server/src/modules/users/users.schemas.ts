import { z } from 'zod';

const roleSchema = z.enum(['admin', 'landlord', 'tenant']);
const statusSchema = z.enum(['active', 'inactive', 'suspended']);

const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Phone number must be at least 7 characters long.')
  .optional()
  .or(z.literal(''));

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createUserBodySchema = z.object({
  user_name: z.string().trim().min(3, 'Name must be at least 3 characters long.'),
  user_email: z.string().trim().email('Please enter a valid email address.'),
  user_password: z.string().min(8, 'Password must be at least 8 characters long.'),
  user_phone: phoneSchema,
  role_name: roleSchema,
  status_name: statusSchema.default('active'),
});

export const updateUserBodySchema = z
  .object({
    user_name: z.string().trim().min(3, 'Name must be at least 3 characters long.').optional(),
    user_email: z.string().trim().email('Please enter a valid email address.').optional(),
    user_password: z.string().min(8, 'Password must be at least 8 characters long.').optional(),
    user_phone: phoneSchema.optional(),
    role_name: roleSchema.optional(),
    status_name: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });
