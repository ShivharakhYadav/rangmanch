import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user';

/** Injects the authenticated user (set by JwtAuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    return context.switchToHttp().getRequest<{ user: AuthUser }>().user;
  },
);
