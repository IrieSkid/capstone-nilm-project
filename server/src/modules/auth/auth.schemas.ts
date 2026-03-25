import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.email('Please enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
});

export const registerTenantBodySchema = z
  .object({
    user_name: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters long.')
      .max(100, 'Full name must be at most 100 characters long.'),
    user_email: z
      .string()
      .trim()
      .email('Please enter a valid email address.')
      .max(100, 'Email must be at most 100 characters long.'),
    user_phone: z
      .string()
      .trim()
      .min(7, 'Phone must be at least 7 characters long.')
      .max(20, 'Phone must be at most 20 characters long.'),
    user_password: z
      .string()
      .min(8, 'Password must be at least 8 characters long.'),
    confirm_password: z
      .string()
      .min(8, 'Confirm password must be at least 8 characters long.'),
  })
  .refine(
    (data) => data.user_password === data.confirm_password,
    {
      path: ['confirm_password'],
      message: 'Password and confirm password must match.',
    },
  );

export const forgotPasswordBodySchema = z
  .object({
    user_email: z
      .string()
      .trim()
      .email('Please enter a valid email address.')
      .max(100, 'Email must be at most 100 characters long.'),
    user_phone: z
      .string()
      .trim()
      .min(7, 'Phone must be at least 7 characters long.')
      .max(20, 'Phone must be at most 20 characters long.'),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters long.'),
    confirm_new_password: z
      .string()
      .min(8, 'Confirm password must be at least 8 characters long.'),
  })
  .refine(
    (data) => data.new_password === data.confirm_new_password,
    {
      path: ['confirm_new_password'],
      message: 'New password and confirm password must match.',
    },
  );

export const updateProfileBodySchema = z.object({
  user_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters long.')
    .max(100, 'Full name must be at most 100 characters long.'),
  user_email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .max(100, 'Email must be at most 100 characters long.'),
  user_phone: z
    .string()
    .trim()
    .max(20, 'Phone must be at most 20 characters long.')
    .optional()
    .or(z.literal('')),
});

export const changePasswordBodySchema = z
  .object({
    current_password: z
      .string()
      .min(8, 'Current password must be at least 8 characters long.'),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters long.'),
    confirm_new_password: z
      .string()
      .min(8, 'Confirm password must be at least 8 characters long.'),
  })
  .refine(
    (data) => data.new_password === data.confirm_new_password,
    {
      path: ['confirm_new_password'],
      message: 'New password and confirm password must match.',
    },
  )
  .refine(
    (data) => data.current_password !== data.new_password,
    {
      path: ['new_password'],
      message: 'New password must be different from the current password.',
    },
  );
