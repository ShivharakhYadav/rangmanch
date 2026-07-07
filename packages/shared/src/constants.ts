/**
 * Cross-cutting constants. Values that are environment-tunable live in env config,
 * not here — these are stable business/domain constants.
 */

/** Default seat-hold duration if not overridden by env. Set to 1 minute per client decision. */
export const DEFAULT_SEAT_HOLD_TTL_SECONDS = 60;

/** Per-user limits enforced at API + Redis to deter scalping (see plan §4.3). */
export const MAX_SEATS_PER_LOCK = 10;
export const MAX_ACTIVE_LOCKS_PER_USER = 3;

/** Redis key builders — keep key shapes in one place. */
export const redisKeys = {
  seatLock: (showId: string, seatRef: string) => `seat:lock:${showId}:${seatRef}`,
  holderLocks: (token: string) => `hold:${token}`,
  userActiveLocks: (userId: string) => `user:locks:${userId}`,
  otp: (phone: string) => `otp:${phone}`,
  rateLimit: (scope: string, id: string) => `rl:${scope}:${id}`,
} as const;
