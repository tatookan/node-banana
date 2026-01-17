import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { query } from '@/lib/db';
import { generateToken } from '@/lib/jwt';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterRequest = await request.json();
    const { username, email, password, inviteCode } = body;

    // Validate input
    if (!username || !email || !password || !inviteCode) {
      return NextResponse.json(
        { error: '所有字段都是必填的' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '邮箱格式不正确' },
        { status: 400 }
      );
    }

    // Validate username length
    if (username.length < 3 || username.length > 20) {
      return NextResponse.json(
        { error: '用户名长度必须在3-20个字符之间' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为6个字符' },
        { status: 400 }
      );
    }

    // Check if invite code exists and is not used
    const inviteCodes = await query<any>(
      'SELECT id, is_used FROM invite_codes WHERE code = ?',
      [inviteCode.toUpperCase()]
    );

    if (inviteCodes.length === 0) {
      return NextResponse.json(
        { error: '邀请码不存在' },
        { status: 400 }
      );
    }

    if (inviteCodes[0].is_used) {
      return NextResponse.json(
        { error: '该邀请码已被使用' },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existingUsers = await query<any>(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: '用户名或邮箱已存在' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await query<any>(
      'INSERT INTO users (username, email, password_hash, invite_code) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, inviteCode.toUpperCase()]
    );

    const userId = result.insertId;

    // Mark invite code as used
    await query(
      'UPDATE invite_codes SET is_used = TRUE, used_by = ?, used_at = NOW() WHERE code = ?',
      [userId, inviteCode.toUpperCase()]
    );

    // Generate JWT token
    const token = generateToken({
      userId,
      username,
      email,
    });

    console.log('[Auth:Register] User registered:', username);

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        username,
        email,
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

    console.log('[Auth:Register] Cookie set for user:', username);
    return response;

  } catch (error) {
    console.error('[Auth:Register] Error:', error);
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
}
