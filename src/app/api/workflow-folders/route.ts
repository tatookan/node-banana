/**
 * Workflow Folders API
 *
 * GET /api/workflow-folders - 获取用户文件夹列表
 * POST /api/workflow-folders - 创建新文件夹
 *
 * 文件夹列表和创建接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken } from '@/lib/jwt';

interface ListResponse {
  success: boolean;
  folders?: any[];
  error?: string;
}

// 获取用户文件夹列表
export async function GET(request: NextRequest) {
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

    console.log(`[Folders:List:${requestId}] Listing folders for user ${userId}...`);

    // 获取文件夹列表，按排序顺序
    const folders = await query<any>(
      `SELECT
        id, name, icon, color, sort_order, created_at,
        (SELECT COUNT(*) FROM workflows WHERE workflows.folder_id = workflow_folders.id) as workflow_count
      FROM workflow_folders
      WHERE user_id = ?
      ORDER BY sort_order ASC, created_at ASC`,
      [userId]
    );

    console.log(`[Folders:List:${requestId}] ✓ Found ${folders.length} folders`);

    return NextResponse.json({
      success: true,
      folders,
    } as ListResponse);

  } catch (error: any) {
    console.error(`[Folders:List:${requestId}] ✗ List failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || '获取文件夹列表失败',
      } as ListResponse,
      { status: 500 }
    );
  }
}

// 创建新文件夹
export async function POST(request: NextRequest) {
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

    // 解析请求体
    const body = await request.json();
    const { name, icon, color } = body;

    // 验证必填字段
    if (!name) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段：name' },
        { status: 400 }
      );
    }

    console.log(`[Folders:Create:${requestId}] Creating folder "${name}" for user ${userId}...`);

    // 获取当前最大排序值
    const maxOrderResult = await query<any>(
      'SELECT MAX(sort_order) as max_order FROM workflow_folders WHERE user_id = ?',
      [userId]
    );
    const nextSortOrder = (maxOrderResult[0]?.max_order || 0) + 1;

    // 插入文件夹
    const result = await execute(
      `INSERT INTO workflow_folders (user_id, name, icon, color, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, name, icon || 'folder', color || '#6366f1', nextSortOrder]
    );

    console.log(`[Folders:Create:${requestId}] ✓ Folder created with ID ${result.insertId}`);

    // 返回创建的文件夹
    const created = await query<any>(
      'SELECT * FROM workflow_folders WHERE id = ?',
      [result.insertId]
    );

    return NextResponse.json({
      success: true,
      folder: created[0],
    });

  } catch (error: any) {
    console.error(`[Folders:Create:${requestId}] ✗ Create failed:`, error);

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
        error: error.message || '创建文件夹失败',
      },
      { status: 500 }
    );
  }
}
