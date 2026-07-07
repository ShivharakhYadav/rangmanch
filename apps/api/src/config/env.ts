import { z } from 'zod';
import { DEFAULT_SEAT_HOLD_TTL_SECONDS } from '@ticketing/shared';

/**
 * Environment schema. Fail fast at boot if config is invalid/missing.
 * Loaded once by ConfigModule via the `validate` hook below.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(6002),

  DATABASE_URL: z.string().url().default('postgresql://ticketing:ticketing_dev_pw@localhost:5432/ticketing'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(8).default('dev_access_secret_change_me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev_refresh_secret_change_me'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),

  SEAT_HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_SEAT_HOLD_TTL_SECONDS),

  // Temporary guard for admin write endpoints (kept as a fallback; real RBAC via JWT now).
  ADMIN_API_KEY: z.string().min(8).default('dev_admin_key_change_me'),

  // OTP
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Payments
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  PAYMENT_WINDOW_SECONDS: z.coerce.number().int().positive().default(120),
  PAYMENT_CURRENCY: z.string().default('INR'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Passed to `ConfigModule.forRoot({ validate })`. Throws on invalid config. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
