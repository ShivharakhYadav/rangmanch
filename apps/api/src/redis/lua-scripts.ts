/**
 * All-or-nothing seat lock. Runs atomically in Redis's single thread, so no two
 * concurrent callers can both win the same seat.
 *
 * KEYS[1]        = holder set key  (holder:{token})
 * KEYS[2..N]     = seat lock keys  (seat:lock:{showId}:{seatRef})
 * ARGV[1]        = holder token (lock value / ownership marker)
 * ARGV[2]        = ttl seconds
 * ARGV[3]        = max seats allowed per holder
 *
 * Returns: 1 = acquired, -1 = at least one seat already locked, -2 = limit exceeded.
 */
export const LOCK_SEATS_LUA = `
local holderKey = KEYS[1]
local ttl = tonumber(ARGV[2])
local maxSeats = tonumber(ARGV[3])
local requested = #KEYS - 1

-- Count seats this holder currently owns, cleaning any that already expired.
local members = redis.call('SMEMBERS', holderKey)
local current = 0
for _, m in ipairs(members) do
  if redis.call('EXISTS', m) == 1 then
    current = current + 1
  else
    redis.call('SREM', holderKey, m)
  end
end
if current + requested > maxSeats then
  return -2
end

-- Fail fast if any requested seat is already locked (by anyone).
for i = 2, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    return -1
  end
end

-- Acquire all requested seats for this holder.
for i = 2, #KEYS do
  redis.call('SET', KEYS[i], ARGV[1], 'EX', ttl)
  redis.call('SADD', holderKey, KEYS[i])
end
redis.call('EXPIRE', holderKey, ttl + 5)
return 1
`;

/**
 * Release seats, but only those actually owned by this holder.
 *
 * KEYS[1]     = holder set key
 * KEYS[2..N]  = seat lock keys to release
 * ARGV[1]     = holder token
 *
 * Returns: number of seats released.
 */
export const RELEASE_SEATS_LUA = `
local released = 0
for i = 2, #KEYS do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    redis.call('DEL', KEYS[i])
    redis.call('SREM', KEYS[1], KEYS[i])
    released = released + 1
  end
end
return released
`;
