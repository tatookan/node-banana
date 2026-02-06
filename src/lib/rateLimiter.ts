import { query, execute } from '@/lib/db';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number;           // Max requests per time window
  windowMs: number;              // Time window in milliseconds
  skipFailedRequests?: boolean;  // Whether to count failed requests
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;  // Seconds until reset
}

/**
 * Default rate limit rules for API endpoints
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/generate': {
    maxRequests: 10,
    windowMs: 60 * 1000,  // 1 minute
    skipFailedRequests: true,
  },
  '/api/llm': {
    maxRequests: 30,
    windowMs: 60 * 1000,
    skipFailedRequests: true,
  },
  '/api/generate-vidu': {
    maxRequests: 5,
    windowMs: 60 * 1000,
    skipFailedRequests: true,
  },
  '/api/generate-aabao-async': {
    maxRequests: 10,
    windowMs: 60 * 1000,
    skipFailedRequests: false,  // Count task submissions
  },
};

/**
 * Check and update rate limit for a user
 * @param userId User ID
 * @param endpoint API endpoint path (e.g., '/api/generate')
 * @param config Optional custom limit config
 * @returns Rate limit result
 */
export async function checkRateLimit(
  userId: number,
  endpoint: string,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  // Environment variable toggle
  if (process.env.RATE_LIMIT_ENABLED === 'false') {
    return {
      allowed: true,
      remaining: Infinity,
      resetAt: new Date(Date.now() + 86400000),
    };
  }

  const limitConfig = config || DEFAULT_RATE_LIMITS[endpoint];
  if (!limitConfig) {
    // No limit for this endpoint
    return {
      allowed: true,
      remaining: Infinity,
      resetAt: new Date(Date.now() + 86400000),
    };
  }

  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / limitConfig.windowMs) * limitConfig.windowMs
  );

  try {
    // Check existing rate limit record
    const existing = await query<any>(
      `SELECT request_count FROM rate_limits
       WHERE user_id = ? AND endpoint = ? AND window_start = ?`,
      [userId, endpoint, windowStart]
    );

    if (existing.length > 0) {
      const currentCount = existing[0].request_count;

      if (currentCount >= limitConfig.maxRequests) {
        // Rate limit exceeded
        const resetAt = new Date(windowStart.getTime() + limitConfig.windowMs);
        const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);

        console.log(`[RateLimit] Blocked user ${userId} on ${endpoint}: ${currentCount}/${limitConfig.maxRequests}`);

        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter,
        };
      }

      // Increment counter
      await execute(
        `UPDATE rate_limits
         SET request_count = request_count + 1, updated_at = NOW()
         WHERE user_id = ? AND endpoint = ? AND window_start = ?`,
        [userId, endpoint, windowStart]
      );

      return {
        allowed: true,
        remaining: limitConfig.maxRequests - currentCount - 1,
        resetAt: new Date(windowStart.getTime() + limitConfig.windowMs),
      };
    } else {
      // Create new rate limit record
      await execute(
        `INSERT INTO rate_limits (user_id, endpoint, request_count, window_start)
         VALUES (?, ?, 1, ?)`,
        [userId, endpoint, windowStart]
      );

      return {
        allowed: true,
        remaining: limitConfig.maxRequests - 1,
        resetAt: new Date(windowStart.getTime() + limitConfig.windowMs),
      };
    }
  } catch (error) {
    console.error('[RateLimit] Error:', error);
    // Degrade gracefully: allow request on error
    return {
      allowed: true,
      remaining: limitConfig.maxRequests,
      resetAt: new Date(Date.now() + limitConfig.windowMs),
    };
  }
}

/**
 * Clean up expired rate limit records (older than 1 hour)
 */
export async function cleanExpiredRateLimits() {
  try {
    const pool = await import('@/lib/db').then(m => m.getPool());
    const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    const [result] = await pool.execute(
      'DELETE FROM rate_limits WHERE updated_at < ?',
      [cutoff]
    );

    const affectedRows = (result as any).affectedRows;
    if (affectedRows > 0) {
      console.log(`[RateLimit] Cleaned ${affectedRows} expired records`);
    }
  } catch (error) {
    console.error('[RateLimit] Cleanup error:', error);
  }
}
