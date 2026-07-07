import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '@ticketing/shared';
import type { AuthUser } from '../types/auth-user';

interface AccessPayload {
  sub: string;
  phone: string;
  role: UserRole;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      req.user = { userId: payload.sub, phone: payload.phone, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
