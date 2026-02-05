import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getUser } from "@/lib/auth";
import type { SubmitTemplateRequest, WorkflowTemplate, TemplatesListResponse, TemplateCategory } from "@/types";

// GET - 获取已审核通过的模板列表（公开访问）
export async function GET(request: NextRequest) {
  try {
    const pool = getPool();

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as TemplateCategory | 'all' | null;

    // 构建查询 - 简化查询避免内存问题
    let query = `
      SELECT
        t.id,
        t.workflow_id,
        t.name,
        t.description,
        t.category,
        t.thumbnail,
        t.status,
        t.created_at,
        t.updated_at,
        u1.username as submitted_by_username,
        u1.email as submitted_by_email,
        u2.username as reviewed_by_username
      FROM workflow_templates t
      LEFT JOIN users u1 ON t.submitted_by = u1.id
      LEFT JOIN users u2 ON t.reviewed_by = u2.id
      WHERE t.status = 'approved'
    `;

    const params: any[] = [];

    if (category && category !== 'all') {
      query += ` AND t.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY t.created_at DESC LIMIT 100`;

    const [rows] = await pool.execute(query, params);

    const response: TemplatesListResponse = {
      success: true,
      templates: rows as any[],
      total: (rows as any[]).length,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[WorkflowTemplates API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取模板列表失败' },
      { status: 500 }
    );
  }
}

// POST - 提交模板到审核队列（需要登录）
export async function POST(request: NextRequest) {
  try {
    // 验证用户登录
    const user = await getUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      );
    }

    const body = await request.json() as SubmitTemplateRequest;
    const { name, description, category, workflow_data } = body;

    // 验证必填字段
    if (!name || !workflow_data) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const workflow_id = crypto.randomUUID();

    // 管理员提交的模板自动批准
    const isAdmin = user.role === 'admin';
    const status = isAdmin ? 'approved' : 'pending';

    // 插入模板记录
    const [result] = await pool.execute(
      `INSERT INTO workflow_templates (workflow_id, name, description, category, workflow_data, status, submitted_by${isAdmin ? ', reviewed_by, reviewed_at' : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?${isAdmin ? ', ?, NOW()' : ''})`,
      isAdmin
        ? [workflow_id, name, description || null, category || 'other', JSON.stringify(workflow_data), status, user.userId, user.userId]
        : [workflow_id, name, description || null, category || 'other', JSON.stringify(workflow_data), status, user.userId]
    );

    // 获取完整的模板记录
    const [rows] = await pool.execute(
      `SELECT
        t.*,
        u1.username as submitted_by_username,
        u1.email as submitted_by_email,
        u2.username as reviewed_by_username
       FROM workflow_templates t
       LEFT JOIN users u1 ON t.submitted_by = u1.id
       LEFT JOIN users u2 ON t.reviewed_by = u2.id
       WHERE t.id = ?`,
      [(result as any).insertId]
    );

    const template = (rows as any[])[0] as WorkflowTemplate & { submitted_by_username: string; submitted_by_email: string };

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error: any) {
    console.error('[WorkflowTemplates API] Error:', error);
    return NextResponse.json(
      { success: false, error: '提交模板失败' },
      { status: 500 }
    );
  }
}
