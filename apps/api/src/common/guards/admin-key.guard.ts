import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * TEMPORARY guard for admin write endpoints. Checks a shared secret in the
 * `x-admin-api-key` header. This is a stopgap until real JWT auth + RBAC lands
 * (Phase 3+), at which point admin routes move behind role-based guards.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-admin-api-key') ?? '';
    const expected = this.config.get<string>('ADMIN_API_KEY') ?? '';

    if (!expected || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing admin API key');
    }
    return true;
  }

  /** Constant-time comparison to avoid leaking the key via timing. */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
