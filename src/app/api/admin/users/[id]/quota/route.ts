import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { setUserQuota, getUserQuota, deleteUserQuota } from '@/lib/quotaManager';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/users/[id]/quota
 * 获取用户配额信息（管理员）
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  // 权限验证
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: userIdStr } = await params;
  const userId = parseInt(userIdStr);

  if (isNaN(userId)) {
    return NextResponse.json(
      { success: false, error: '无效的用户ID' },
      { status: 400 }
    );
  }

  try {
    const quota = await getUserQuota(userId);

    return NextResponse.json({
      success: true,
      quota: quota || {
        quotaLimit: 0,
        quotaUsed: 0,
        quotaRemaining: 0,
      },
    });
  } catch (error: any) {
    console.error('[API:GetUserQuota] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取配额信息失败' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/users/[id]/quota
 * 设置或更新用户配额（管理员）
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {
  // 权限验证
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: userIdStr } = await params;
  const userId = parseInt(userIdStr);

  if (isNaN(userId)) {
    return NextResponse.json(
      { success: false, error: '无效的用户ID' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { quotaLimit, resetUsed = false } = body;

    // 验证配额值
    if (typeof quotaLimit !== 'number' || quotaLimit < 0) {
      return NextResponse.json(
        { success: false, error: '配额值必须是非负数' },
        { status: 400 }
      );
    }

    // 设置配额
    await setUserQuota(userId, quotaLimit, resetUsed);

    // 获取更新后的配额信息
    const quota = await getUserQuota(userId);

    return NextResponse.json({
      success: true,
      quota: quota || {
        quotaLimit: 0,
        quotaUsed: 0,
        quotaRemaining: 0,
      },
    });
  } catch (error: any) {
    console.error('[API:SetUserQuota] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '设置配额失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]/quota
 * 删除用户配额（移除限制）
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  // 权限验证
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: userIdStr } = await params;
  const userId = parseInt(userIdStr);

  if (isNaN(userId)) {
    return NextResponse.json(
      { success: false, error: '无效的用户ID' },
      { status: 400 }
    );
  }

  try {
    await deleteUserQuota(userId);

    return NextResponse.json({
      success: true,
      message: '配额已删除，用户不再受限',
    });
  } catch (error: any) {
    console.error('[API:DeleteUserQuota] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除配额失败' },
      { status: 500 }
    );
  }
}
