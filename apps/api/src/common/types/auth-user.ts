import type { UserRole } from '@ticketing/shared';

/** Shape attached to `req.user` by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  phone: string;
  role: UserRole;
}
