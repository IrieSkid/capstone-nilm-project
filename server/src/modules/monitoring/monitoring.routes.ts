import { Router } from 'express';

import { authenticate } from '../../shared/middleware/auth';
import { validate } from '../../shared/middleware/validate';
import {
  monitoringDashboardQuerySchema,
  monitoringReportQuerySchema,
  monitoringRoomParamsSchema,
} from './monitoring.schemas';
import {
  getMonitoringDashboard,
  getMonitoringReport,
  listMonitoringRooms,
} from './monitoring.service';

export const monitoringRouter = Router();

monitoringRouter.use(authenticate);

monitoringRouter.get('/rooms', async (req, res) => {
  const rooms = await listMonitoringRooms(req.user!);

  res.json({ data: rooms });
});

monitoringRouter.get(
  '/rooms/:roomId/dashboard',
  validate({
    params: monitoringRoomParamsSchema,
    query: monitoringDashboardQuerySchema,
  }),
  async (req, res) => {
    const dashboard = await getMonitoringDashboard(
      req.user!,
      Number(req.params.roomId),
      res.locals.validatedQuery.range as 'live' | '1h' | '24h' | '7d' | '30d',
    );

    res.json({ data: dashboard });
  },
);

monitoringRouter.get(
  '/rooms/:roomId/report',
  validate({
    params: monitoringRoomParamsSchema,
    query: monitoringReportQuerySchema,
  }),
  async (req, res) => {
    const report = await getMonitoringReport(
      req.user!,
      Number(req.params.roomId),
      res.locals.validatedQuery.range as '24h' | '7d' | '30d',
    );

    res.json({ data: report });
  },
);
