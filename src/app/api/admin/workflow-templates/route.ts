/**
 * 管理员工作流模板审核 API
 *
 * GET /api/admin/workflow-templates - 获取待审核/所有模板列表
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import type { TemplateStatus, TemplateCategory } from "@/types";

// 管理员模板列表响应
interface AdminTemplatesListResponse {
  success: boolean;
  templates?: any[];
  total?: number;
  error?: string;
}

// GET - 获取待审核或所有模板（仅管理员）
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // 验证管理员权限
    const adminUser = await requireAdmin(request);
    if (adminUser instanceof NextResponse) {
      return adminUser; // 返回错误响应
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as TemplateStatus | null;
    const category = searchParams.get('category') as TemplateCategory | 'all' | null;

    console.log(`[AdminTemplates:List:${requestId}] Admin ${adminUser.userId} listing templates with status=${status}, category=${category}`);

    const pool = getPool();

    // 构建查询 - 优化查询以避免内存问题
    let query = `
      SELECT
        t.id,
        t.workflow_id,
        t.name,
        t.description,
        t.category,
        t.thumbnail,
        t.status,
        t.rejection_reason,
        t.created_at,
        t.updated_at,
        t.reviewed_at,
        t.submitted_by,
        t.reviewed_by,
        u1.username as submitted_by_username,
        u1.email as submitted_by_email,
        u2.username as reviewed_by_username
      FROM workflow_templates t
      LEFT JOIN users u1 ON t.submitted_by = u1.id
      LEFT JOIN users u2 ON t.reviewed_by = u2.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    } else {
      // 默认只显示待审核的模板
      query += ` AND t.status = 'pending'`;
    }

    if (category && category !== 'all') {
      query += ` AND t.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY t.created_at DESC LIMIT 100`;

    const [rows] = await pool.execute(query, params);

    console.log(`[AdminTemplates:List:${requestId}] ✓ Found ${(rows as any[]).length} templates`);

    const response: AdminTemplatesListResponse = {
      success: true,
      templates: rows as any[],
      total: (rows as any[]).length,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[AdminTemplates:List:${requestId}] ✗ Error:`, error);
    return NextResponse.json(
      { success: false, error: '获取模板列表失败' },
      { status: 500 }
    );
  }
}
