import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { query, execute } from '@/lib/db';
import { generateToken } from '@/lib/jwt';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface LoginRequest {
  email: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: '邮箱和密码都是必填的' },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await query<any>(
      'SELECT id, username, email, password_hash FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      );
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      );
    }

    // Update last login
    await execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    console.log('[Auth:Login] Token generated for user:', user.username);

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });

    // Set httpOnly cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: false, // Set to false for localhost
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    console.log('[Auth:Login] Cookie set, returning response');
    return response;

  } catch (error) {
    console.error('[Auth:Login] Error:', error);
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}
