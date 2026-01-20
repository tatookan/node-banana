/**
 * Single Folder API
 *
 * PUT /api/workflow-folders/[id] - 更新文件夹
 * DELETE /api/workflow-folders/[id] - 删除文件夹
 *
 * 单个文件夹的更新、删除接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken } from '@/lib/jwt';

interface SingleResponse {
  success: boolean;
  folder?: any;
  error?: string;
}

// 更新文件夹
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // 验证用户身份
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '登录已过期' },
        { status: 401 }
      );
    }

    const userId = payload.userId;
    const { id } = await params;

    // 解析请求体
    const body = await request.json();
    const { name, icon, color, sort_order } = body;

    console.log(`[Folders:Update:${requestId}] Updating folder ${id} for user ${userId}...`);

    // 构建更新字段
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(icon);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(sort_order);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: '没有要更新的字段' },
        { status: 400 }
      );
    }

    values.push(id, userId);

    // 更新文件夹
    await execute(
      `UPDATE workflow_folders SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    console.log(`[Folders:Update:${requestId}] ✓ Folder updated`);

    // 获取更新后的文件夹
    const updated = await query<any>(
      'SELECT * FROM workflow_folders WHERE id = ?',
      [id]
    );

    return NextResponse.json({
      success: true,
      folder: updated[0],
    } as SingleResponse);

  } catch (error: any) {
    console.error(`[Folders:Update:${requestId}] ✗ Update failed:`, error);

    // 检查是否是唯一键冲突（同名文件夹）
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { success: false, error: '文件夹名称已存在' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || '更新文件夹失败',
      } as SingleResponse,
      { status: 500 }
    );
  }
}

// 删除文件夹
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // 验证用户身份
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '登录已过期' },
        { status: 401 }
      );
    }

    const userId = payload.userId;
    const { id } = await params;

    console.log(`[Folders:Delete:${requestId}] Deleting folder ${id} for user ${userId}...`);

    // 检查文件夹内是否有工作流
    const workflowsCount = await query<any>(
      'SELECT COUNT(*) as count FROM workflows WHERE folder_id = ?',
      [id]
    );

    if (workflowsCount[0]?.count > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `文件夹内还有 ${workflowsCount[0].count} 个工作流，请先移动或删除它们`,
        },
        { status: 409 }
      );
    }

    // 删除文件夹
    const result = await execute(
      'DELETE FROM workflow_folders WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      );
    }

    console.log(`[Folders:Delete:${requestId}] ✓ Folder deleted`);

    return NextResponse.json({
      success: true,
      message: '文件夹已删除',
    });

  } catch (error: any) {
    console.error(`[Folders:Delete:${requestId}] ✗ Delete failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || '删除文件夹失败',
      },
      { status: 500 }
    );
  }
}
