import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ticketing/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user';

/** Runs after JwtAuthGuard; checks req.user.role against @Roles(...). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user || !required.includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
