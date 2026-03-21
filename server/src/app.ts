import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { detectionsRouter } from './modules/detections/detections.routes';
import { devicePortsRouter } from './modules/device-ports/device-ports.routes';
import { devicesRouter } from './modules/devices/devices.routes';
import { readingsRouter } from './modules/readings/readings.routes';
import { roomsRouter } from './modules/rooms/rooms.routes';
import { usersRouter } from './modules/users/users.routes';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
    }),
  );
  app.use(helmet());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({
      message: 'NILM backend is running.',
    });
  });

  app.use(`${env.API_PREFIX}/auth`, authRouter);
  app.use(`${env.API_PREFIX}/users`, usersRouter);
  app.use(`${env.API_PREFIX}/rooms`, roomsRouter);
  app.use(`${env.API_PREFIX}/devices`, devicesRouter);
  app.use(`${env.API_PREFIX}/device-ports`, devicePortsRouter);
  app.use(`${env.API_PREFIX}/readings`, readingsRouter);
  app.use(`${env.API_PREFIX}/detections`, detectionsRouter);
  app.use(`${env.API_PREFIX}/dashboard`, dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
