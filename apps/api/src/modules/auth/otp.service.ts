import { randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OtpRequestResultDto } from '@ticketing/shared';
import { redisKeys } from '@ticketing/shared';
import { RedisService } from '../../redis/redis.service';

/**
 * OTP issue/verify. Codes live in Redis with a TTL. The "delivery" here just
 * logs the code (dev). Swap in an SMS provider (e.g. MSG91) for production —
 * only the `deliver()` method changes.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttl: number;
  private readonly maxAttempts: number;
  private readonly isDev: boolean;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('OTP_TTL_SECONDS') ?? 300;
    this.maxAttempts = config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
    this.isDev = (config.get<string>('NODE_ENV') ?? 'development') !== 'production';
  }

  async request(phone: string): Promise<OtpRequestResultDto> {
    const code = String(randomInt(100000, 1000000)); // secure 6-digit
    await this.redis.redis.set(redisKeys.otp(phone), code, 'EX', this.ttl);
    await this.redis.redis.del(this.attemptsKey(phone)); // reset attempt counter
    this.deliver(phone, code);
    return { sent: true, ...(this.isDev ? { devCode: code } : {}) };
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const key = redisKeys.otp(phone);
    const attemptsKey = this.attemptsKey(phone);

    // Cap attempts so a 6-digit code can't be brute-forced within its TTL.
    const attempts = await this.redis.redis.incr(attemptsKey);
    if (attempts === 1) await this.redis.redis.expire(attemptsKey, this.ttl);
    if (attempts > this.maxAttempts) {
      await this.redis.redis.del(key); // burn the code after too many tries
      return false;
    }

    const stored = await this.redis.redis.get(key);
    if (!stored || stored !== code) return false;

    await this.redis.redis.del(key, attemptsKey); // single-use + reset
    return true;
  }

  private attemptsKey(phone: string): string {
    return `${redisKeys.otp(phone)}:attempts`;
  }

  private deliver(phone: string, code: string): void {
    // Only log the code in development. Production sends via SMS (MSG91) — TODO.
    if (this.isDev) this.logger.log(`OTP for ${phone}: ${code}`);
  }
}
