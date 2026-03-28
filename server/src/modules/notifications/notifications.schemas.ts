import { z } from 'zod';

export const notificationIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateNotificationPreferenceBodySchema = z.object({
  preference_key: z.string().min(1),
  enabled: z.boolean(),
});
