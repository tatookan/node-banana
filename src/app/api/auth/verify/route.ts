import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { authenticated: false, error: '未提供认证令牌' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { authenticated: false, error: '无效或过期的令牌' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: payload.userId,
        username: payload.username,
        email: payload.email,
      },
    });

  } catch (error) {
    console.error('[Auth:Verify] Error:', error);
    return NextResponse.json(
      { authenticated: false, error: '验证失败' },
      { status: 500 }
    );
  }
}
