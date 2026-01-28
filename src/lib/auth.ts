import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TokenPayload } from './jwt';
import type { DbUser } from '@/types/auth';
import { query } from './db';

/**
 * Verify admin token and return payload
 * Returns null if not authenticated or not an admin
 */
export async function getAdminUser(request: NextRequest): Promise<TokenPayload | null> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    return null;
  }
  return payload;
}

/**
 * Require admin authentication
 * Returns NextResponse for error, or TokenPayload for success
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | TokenPayload> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: '未授权，请先登录' },
      { status: 401 }
    );
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: '无效或过期的令牌' },
      { status: 401 }
    );
  }

  if (payload.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: '需要管理员权限' },
      { status: 403 }
    );
  }

  return payload;
}

/**
 * Get current user from database
 * Returns null if not authenticated
 */
export async function getCurrentUser(request: NextRequest): Promise<DbUser | null> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  try {
    const users = await query<any>(
      'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
      [payload.userId]
    );

    if (users.length === 0) return null;

    return users[0] as DbUser;
  } catch (error) {
    console.error('[Auth] Error fetching user:', error);
    return null;
  }
}

/**
 * Check if a user has admin role
 */
export function isAdmin(user: DbUser | null): boolean {
  return user?.role === 'admin';
}
