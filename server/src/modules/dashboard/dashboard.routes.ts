import { Router } from 'express';

import { authorize, authenticate } from '../../shared/middleware/auth';
import { getAdminDashboard, getTenantDashboard } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get('/tenant', authenticate, authorize('tenant'), async (req, res) => {
  const data = await getTenantDashboard(req.user!);

  res.json({
    data,
  });
});

dashboardRouter.get('/admin', authenticate, authorize('admin'), async (_req, res) => {
  const data = await getAdminDashboard();

  res.json({
    data,
  });
});
