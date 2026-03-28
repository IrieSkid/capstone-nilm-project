import { z } from 'zod';

import {
  getPhilippinePhoneValidationMessage,
  isValidPhilippinePhone,
} from '../../shared/utils/philippine-phone';

const roleSchema = z.enum(['admin', 'landlord', 'tenant']);
const statusSchema = z.enum(['active', 'inactive', 'suspended', 'pending_approval', 'rejected']);
const nullableForeignKeySchema = z.preprocess(
  (value) => (value === null || value === undefined || value === '' ? null : value),
  z.union([z.null(), z.coerce.number().int().positive()]),
);

const phoneSchema = z
  .string()
  .trim()
  .refine(isValidPhilippinePhone, getPhilippinePhoneValidationMessage())
  .optional()
  .or(z.literal(''));

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createUserBodySchema = z
  .object({
    user_name: z.string().trim().min(3, 'Name must be at least 3 characters long.'),
    user_email: z.string().trim().email('Please enter a valid email address.'),
    user_password: z.string().min(8, 'Password must be at least 8 characters long.'),
    user_phone: phoneSchema,
    user_landlord_id: nullableForeignKeySchema.optional(),
    role_name: roleSchema,
    status_name: statusSchema.default('active'),
  })
  .superRefine((value, ctx) => {
    if (value.role_name === 'tenant' && value.user_landlord_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['user_landlord_id'],
        message: 'Tenant accounts must be assigned to a landlord owner.',
      });
    }
  });

export const updateUserBodySchema = z
  .object({
    user_name: z.string().trim().min(3, 'Name must be at least 3 characters long.').optional(),
    user_email: z.string().trim().email('Please enter a valid email address.').optional(),
    user_password: z.string().min(8, 'Password must be at least 8 characters long.').optional(),
    user_phone: phoneSchema.optional(),
    user_landlord_id: nullableForeignKeySchema.optional(),
    role_name: roleSchema.optional(),
    status_name: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });
