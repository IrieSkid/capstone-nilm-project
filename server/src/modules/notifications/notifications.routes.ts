import { Router } from 'express';

import { authenticate } from '../../shared/middleware/auth';
import { AuthenticatedUser } from '../../shared/types/auth';
import { validate } from '../../shared/middleware/validate';
import { syncDueSoonAndOverdueNotificationsForTenant } from '../billing/billing.service';
import {
  getNotificationSummary,
  listNotifications,
  listNotificationPreferences,
  markNotificationAsRead,
  updateNotificationPreference,
} from './notifications.service';
import {
  notificationIdParamsSchema,
  updateNotificationPreferenceBodySchema,
} from './notifications.schemas';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

async function syncUserNotificationsIfNeeded(user: AuthenticatedUser) {
  if (user.roleName === 'tenant') {
    await syncDueSoonAndOverdueNotificationsForTenant(user.userId);
  }
}

notificationsRouter.get('/summary', async (req, res) => {
  await syncUserNotificationsIfNeeded(req.user!);
  const data = await getNotificationSummary(req.user!);

  res.json({
    data,
  });
});

notificationsRouter.get('/', async (req, res) => {
  await syncUserNotificationsIfNeeded(req.user!);
  const data = await listNotifications(req.user!);

  res.json({
    data,
  });
});

notificationsRouter.get('/preferences', async (req, res) => {
  const data = await listNotificationPreferences(req.user!);

  res.json({
    data,
  });
});

notificationsRouter.patch(
  '/preferences',
  validate({ body: updateNotificationPreferenceBodySchema }),
  async (req, res) => {
    const data = await updateNotificationPreference(req.user!, req.body);

    res.json({
      message: 'Notification preference updated successfully.',
      data,
    });
  },
);

notificationsRouter.patch(
  '/:id/read',
  validate({ params: notificationIdParamsSchema }),
  async (req, res) => {
    const data = await markNotificationAsRead(req.user!, Number(req.params.id));

    res.json({
      message: 'Notification marked as read.',
      data,
    });
  },
);
