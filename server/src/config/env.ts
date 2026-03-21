import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('nilm_capstone_mvp'),
  JWT_SECRET: z.string().min(8).default('nilm-capstone-mvp-secret'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGIN: z.string().default('*'),
  DETECTION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.65),
  DEVICE_OFFLINE_MINUTES: z.coerce.number().int().positive().default(15),
  FEEDER_PORT: z.coerce.number().int().positive().default(4010),
  FEEDER_DEFAULT_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  FEEDER_AUTOSTART: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  FEEDER_INGEST_URL: z.url().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
