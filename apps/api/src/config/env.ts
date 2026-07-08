import { z } from 'zod';
import { DEFAULT_SEAT_HOLD_TTL_SECONDS } from '@ticketing/shared';

// Dev-only default secrets — must NOT be used in production.
const DEV_ACCESS_SECRET = 'dev_access_secret_change_me';
const DEV_REFRESH_SECRET = 'dev_refresh_secret_change_me';
const DEV_ADMIN_KEY = 'dev_admin_key_change_me';

/**
 * Environment schema. Fail fast at boot if config is invalid/missing.
 * Loaded once by ConfigModule via the `validate` hook below.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(6002),

  DATABASE_URL: z.string().url().default('postgresql://ticketing:ticketing_dev_pw@localhost:5432/ticketing'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(8).default(DEV_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(8).default(DEV_REFRESH_SECRET),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),

  SEAT_HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_SEAT_HOLD_TTL_SECONDS),

  // Temporary guard for admin write endpoints (kept as a fallback; real RBAC via JWT now).
  ADMIN_API_KEY: z.string().min(8).default(DEV_ADMIN_KEY),

  // OTP
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Rate limiting (per IP)
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  // CORS — comma-separated allowed origins.
  CORS_ORIGINS: z.string().default('http://localhost:6001'),

  // Payments
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  PAYMENT_WINDOW_SECONDS: z.coerce.number().int().positive().default(120),
  PAYMENT_CURRENCY: z.string().default('INR'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Ticketing + WhatsApp
  TICKET_STORAGE_DIR: z.string().default('storage/tickets'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:6002'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'gupshup']).default('mock'),
  GUPSHUP_API_KEY: z.string().optional(),
  GUPSHUP_SOURCE: z.string().optional(), // sender WhatsApp number
  GUPSHUP_APP_NAME: z.string().optional(),
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

  // Never boot production with dev-default secrets.
  if (parsed.data.NODE_ENV === 'production') {
    const weak: string[] = [];
    if (parsed.data.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET) weak.push('JWT_ACCESS_SECRET');
    if (parsed.data.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET) weak.push('JWT_REFRESH_SECRET');
    if (parsed.data.ADMIN_API_KEY === DEV_ADMIN_KEY) weak.push('ADMIN_API_KEY');
    if (weak.length) {
      throw new Error(
        `Refusing to start in production with default secret(s): ${weak.join(', ')}. Set strong values.`,
      );
    }
  }

  return parsed.data;
}
