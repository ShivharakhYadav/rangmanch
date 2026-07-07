import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@ticketing/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Readiness check. Probes Postgres with a trivial query; reports degraded
   * (not down) if the DB is unreachable so load balancers can still route
   * to a booting instance. Redis probe added in Phase 2.
   */
  async check(): Promise<HealthResponse> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      service: 'ticketing-api',
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
      dependencies: { postgres: db },
    };
  }
}
