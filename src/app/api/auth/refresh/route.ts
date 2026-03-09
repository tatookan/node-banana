import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, generateToken } from '@/lib/jwt';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: '未提供认证令牌' },
        { status: 401 }
      );
    }

    // Verify token (supports dual-key during migration period)
    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: '无效或过期的令牌' },
        { status: 401 }
      );
    }

    // Verify user still exists
    const users = await query<any>(
      'SELECT id, username, email, role FROM users WHERE id = ?',
      [payload.userId]
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // Generate NEW token with current secret
    const newToken = generateToken({
      userId: users[0].id,
      username: users[0].username,
      email: users[0].email,
      role: users[0].role,
    });

    // Set new cookie
    const response = NextResponse.json({
      success: true,
      refreshed: true,
      user: users[0],
    });

    response.cookies.set('auth_token', newToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    console.log('[Auth:Refresh] Token refreshed for user:', users[0].username);
    return response;

  } catch (error) {
    console.error('[Auth:Refresh] Error:', error);
    return NextResponse.json(
      { error: '刷新令牌失败' },
      { status: 500 }
    );
  }
}
