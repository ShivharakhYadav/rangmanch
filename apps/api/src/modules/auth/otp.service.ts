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
  private readonly isDev: boolean;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('OTP_TTL_SECONDS') ?? 300;
    this.isDev = (config.get<string>('NODE_ENV') ?? 'development') !== 'production';
  }

  async request(phone: string): Promise<OtpRequestResultDto> {
    const code = String(randomInt(100000, 1000000)); // secure 6-digit
    await this.redis.redis.set(redisKeys.otp(phone), code, 'EX', this.ttl);
    this.deliver(phone, code);
    return { sent: true, ...(this.isDev ? { devCode: code } : {}) };
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const key = redisKeys.otp(phone);
    const stored = await this.redis.redis.get(key);
    if (!stored || stored !== code) return false;
    await this.redis.redis.del(key); // single-use
    return true;
  }

  private deliver(phone: string, code: string): void {
    // TODO(Phase later): send via MSG91 / WhatsApp OTP template.
    this.logger.log(`OTP for ${phone}: ${code}`);
  }
}
