/**
 * Single Workflow API
 *
 * GET /api/workflows/[id] - 获取工作流详情
 * PUT /api/workflows/[id] - 更新工作流
 * DELETE /api/workflows/[id] - 删除工作流
 *
 * 单个工作流的详情、更新、删除接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken } from '@/lib/jwt';

interface SingleResponse {
  success: boolean;
  workflow?: any;
  error?: string;
}

// 获取工作流详情
export async function GET(
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

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '登录已过期' },
        { status: 401 }
      );
    }

    const userId = payload.userId;
    const { id } = await params;

    console.log(`[Workflows:Get:${requestId}] Getting workflow ${id} for user ${userId}...`);

    // 获取工作流
    const workflows = await query<any>(
      `SELECT * FROM workflows WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (workflows.length === 0) {
      return NextResponse.json(
        { success: false, error: '工作流不存在' },
        { status: 404 }
      );
    }

    console.log(`[Workflows:Get:${requestId}] ✓ Workflow found`);

    return NextResponse.json({
      success: true,
      workflow: workflows[0],
    } as SingleResponse);

  } catch (error: any) {
    console.error(`[Workflows:Get:${requestId}] ✗ Get failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || '获取工作流失败',
      } as SingleResponse,
      { status: 500 }
    );
  }
}

// 更新工作流
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

    const payload = await verifyToken(token);
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
    const { name, description, folder_id, workflow_data, is_favorite, tags } = body;

    console.log(`[Workflows:Update:${requestId}] Updating workflow ${id} for user ${userId}...`);

    // 构建更新字段
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (folder_id !== undefined) {
      updates.push('folder_id = ?');
      values.push(folder_id);
    }
    if (workflow_data !== undefined) {
      updates.push('workflow_data = ?');
      values.push(JSON.stringify(workflow_data));
    }
    if (is_favorite !== undefined) {
      updates.push('is_favorite = ?');
      values.push(is_favorite);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(tags));
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: '没有要更新的字段' },
        { status: 400 }
      );
    }

    values.push(id, userId);

    // 更新工作流
    await execute(
      `UPDATE workflows SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    console.log(`[Workflows:Update:${requestId}] ✓ Workflow updated`);

    // 获取更新后的工作流
    const updated = await query<any>(
      'SELECT * FROM workflows WHERE id = ?',
      [id]
    );

    return NextResponse.json({
      success: true,
      workflow: updated[0],
    } as SingleResponse);

  } catch (error: any) {
    console.error(`[Workflows:Update:${requestId}] ✗ Update failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || '更新工作流失败',
      } as SingleResponse,
      { status: 500 }
    );
  }
}

// 删除工作流
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

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '登录已过期' },
        { status: 401 }
      );
    }

    const userId = payload.userId;
    const { id } = await params;

    console.log(`[Workflows:Delete:${requestId}] Deleting workflow ${id} for user ${userId}...`);

    // 删除工作流
    const result = await execute(
      'DELETE FROM workflows WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { success: false, error: '工作流不存在' },
        { status: 404 }
      );
    }

    console.log(`[Workflows:Delete:${requestId}] ✓ Workflow deleted`);

    return NextResponse.json({
      success: true,
      message: '工作流已删除',
    });

  } catch (error: any) {
    console.error(`[Workflows:Delete:${requestId}] ✗ Delete failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || '删除工作流失败',
      },
      { status: 500 }
    );
  }
}
