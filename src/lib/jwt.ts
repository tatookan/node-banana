import jwt from 'jsonwebtoken';
import type { TokenPayload } from '@/types/auth';
import { query } from '@/lib/db';

// Use environment variable for JWT secret (security fix)
// Fallback to dev secret for local development only
const JWT_SECRET = process.env.JWT_SECRET || 'node-banana-dev-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Security: Require JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production');
}

// Warn if secret is too weak
if (JWT_SECRET.length < 32) {
  console.warn('[JWT] WARNING: JWT_SECRET is too weak. Use at least 32 characters. Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"');
}

// Re-export TokenPayload from types/auth for backward compatibility
export type { TokenPayload };

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log('[JWT] Token verified for user:', decoded.username);

    // If role is missing from old token, fetch from database
    if (!decoded.role) {
      try {
        const users = await query<any>(
          'SELECT role FROM users WHERE id = ?',
          [decoded.userId]
        );
        if (users.length > 0 && users[0].role) {
          decoded.role = users[0].role;
          console.log('[JWT] Fetched role from database:', decoded.role);
        } else {
          decoded.role = 'user';
        }
      } catch (dbError) {
        console.error('[JWT] Error fetching role from database:', dbError);
        decoded.role = 'user';
      }
    }

    return decoded as TokenPayload;
  } catch (error) {
    console.log('[JWT] Token verification failed:', error);
    return null;
  }
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}
