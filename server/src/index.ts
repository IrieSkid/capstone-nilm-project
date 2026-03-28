import { pool } from './config/db';
import { env } from './config/env';
import { createApp } from './app';
import { startNotificationJob } from './modules/notifications/notification-alerts.service';

async function bootstrap() {
  await pool.query('SELECT 1');

  const app = createApp();
  startNotificationJob();

  app.listen(env.PORT, () => {
    console.log(`NILM backend listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start NILM backend.', error);
  process.exit(1);
});
