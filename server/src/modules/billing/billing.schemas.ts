import { z } from 'zod';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export const billingCycleIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const billingStatementIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const billingPaymentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const billingNotificationIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createBillingCycleBodySchema = z
  .object({
    room_id: z.coerce.number().int().positive(),
    period_start: z
      .string()
      .regex(dateOnlyPattern, 'Billing period start must use YYYY-MM-DD format.')
      .optional(),
    period_end: z
      .string()
      .regex(dateOnlyPattern, 'Billing period end must use YYYY-MM-DD format.')
      .optional(),
  })
  .refine(
    (value) => {
      const hasStart = Boolean(value.period_start);
      const hasEnd = Boolean(value.period_end);

      if (hasStart !== hasEnd) {
        return false;
      }

      if (!hasStart && !hasEnd) {
        return true;
      }

      return (value.period_end as string) >= (value.period_start as string);
    },
    {
      message: 'Provide both billing dates or leave both blank for automatic monthly billing.',
      path: ['period_end'],
    },
  );

export const closeBillingCycleBodySchema = z.object({
  open_next_cycle: z.boolean().optional(),
});

export const updateBillingCycleBodySchema = z.object({
  period_end: z
    .string()
    .regex(dateOnlyPattern, 'Cycle end date must use YYYY-MM-DD format.'),
});

export const generateBillingStatementBodySchema = z.object({});

export const issueBillingStatementBodySchema = z.object({
  due_date: z
    .string()
    .regex(dateOnlyPattern, 'Due date must use YYYY-MM-DD format.')
    .optional(),
});

const paymentMethods = ['cash', 'gcash', 'maya', 'bank_transfer', 'other'] as const;

export const submitBillingPaymentBodySchema = z
  .object({
    amount: z.coerce.number().positive('Payment amount must be greater than zero.'),
    payment_method: z.enum(paymentMethods, {
      message: 'Select a valid payment method.',
    }),
    reference_number: z
      .string()
      .trim()
      .max(120, 'Reference number must be 120 characters or fewer.')
      .optional()
      .or(z.literal('')),
    notes: z
      .string()
      .trim()
      .max(500, 'Payment notes must be 500 characters or fewer.')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.payment_method !== 'cash' && !value.reference_number?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reference_number'],
        message: 'Reference number is required for digital or bank payments.',
      });
    }
  });

export const verifyBillingPaymentBodySchema = z
  .object({
    action: z.enum(['approve', 'reject'], {
      message: 'Select whether to approve or reject this payment.',
    }),
    rejection_reason: z
      .string()
      .trim()
      .max(255, 'Rejection reason must be 255 characters or fewer.')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && !value.rejection_reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejection_reason'],
        message: 'Enter a rejection reason before rejecting this payment.',
      });
    }
  });
