import { z } from 'zod';

export const monitoringRangeSchema = z.enum(['live', '1h', '24h', '7d', '30d']);

export const monitoringRoomParamsSchema = z.object({
  roomId: z.coerce.number().int().positive(),
});

export const monitoringDashboardQuerySchema = z.object({
  range: monitoringRangeSchema.default('live'),
});

export const monitoringReportQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('24h'),
});

export type MonitoringRange = z.infer<typeof monitoringRangeSchema>;
