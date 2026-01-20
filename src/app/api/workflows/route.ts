/**
 * Workflows API
 *
 * GET /api/workflows?page=1&limit=20&folder_id=1&search=keyword
 * POST /api/workflows
 *
 * 工作流列表和创建接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken } from '@/lib/jwt';

interface ListResponse {
  success: boolean;
  workflows?: any[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
}

// 获取用户工作流列表
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

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '登录已过期' },
        { status: 401 }
      );
    }

    const userId = payload.userId;

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const folderId = searchParams.get('folder_id');
    const search = searchParams.get('search');
    const isFavorite = searchParams.get('is_favorite');
    const offset = (page - 1) * limit;

    console.log(`[Workflows:List:${requestId}] Listing workflows for user ${userId}, page ${page}...`);

    // 构建查询条件
    const conditions = ['user_id = ?'];
    const params: any[] = [userId];

    if (folderId) {
      conditions.push('folder_id = ?');
      params.push(folderId);
    }

    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (isFavorite === 'true') {
      conditions.push('is_favorite = TRUE');
    }

    const whereClause = conditions.join(' AND ');

    // 获取总数
    const countResult = await query<any>(
      `SELECT COUNT(*) as total FROM workflows WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // 获取分页数据
    const workflows = await query<any>(
      `SELECT
        id, workflow_id, name, description, folder_id,
        thumbnail, is_public, is_favorite, tags,
        created_at, updated_at
      FROM workflows
      WHERE ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    console.log(`[Workflows:List:${requestId}] ✓ Found ${workflows.length} workflows (total: ${total})`);

    return NextResponse.json({
      success: true,
      workflows,
      total,
      page,
      limit,
    } as ListResponse);

  } catch (error: any) {
    console.error(`[Workflows:List:${requestId}] ✗ List failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || '获取工作流列表失败',
      } as ListResponse,
      { status: 500 }
    );
  }
}

// 创建新工作流
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

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '登录已过期' },
        { status: 401 }
      );
    }

    const userId = payload.userId;

    // 解析请求体
    const body = await request.json();
    const { workflow_id, name, description, folder_id, workflow_data } = body;

    // 验证必填字段
    if (!name || !workflow_data) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段：name, workflow_data' },
        { status: 400 }
      );
    }

    // 生成或使用提供的 workflow_id
    const finalWorkflowId = workflow_id || crypto.randomUUID();

    console.log(`[Workflows:Create:${requestId}] Creating workflow "${finalWorkflowId}" for user ${userId}...`);

    // 插入工作流
    const result = await execute(
      `INSERT INTO workflows (user_id, workflow_id, name, description, folder_id, workflow_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, finalWorkflowId, name, description || null, folder_id || null, JSON.stringify(workflow_data)]
    );

    console.log(`[Workflows:Create:${requestId}] ✓ Workflow created with ID ${result.insertId}`);

    // 返回创建的工作流
    const created = await query<any>(
      'SELECT * FROM workflows WHERE id = ?',
      [result.insertId]
    );

    return NextResponse.json({
      success: true,
      workflow: created[0],
    });

  } catch (error: any) {
    console.error(`[Workflows:Create:${requestId}] ✗ Create failed:`, error);

    // 检查是否是唯一键冲突
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { success: false, error: '工作流 ID 已存在' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || '创建工作流失败',
      },
      { status: 500 }
    );
  }
}
