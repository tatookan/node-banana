import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { getUserQuota } from '@/lib/quotaManager';

export const runtime = 'nodejs';

/**
 * GET /api/user/quota
 * 获取当前用户的配额信息
 */
export async function GET(request: NextRequest) {
  // 获取当前用户
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

  try {
    // 获取配额信息
    const quota = await getUserQuota(payload.userId);

    return NextResponse.json({
      success: true,
      quota: quota ? {
        ...quota,
        hasLimit: true,
      } : {
        quotaLimit: 0,
        quotaUsed: 0,
        quotaRemaining: 0,
        hasLimit: false,
      },
    });
  } catch (error: any) {
    console.error('[API:GetUserQuota] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取配额信息失败' },
      { status: 500 }
    );
  }
}
