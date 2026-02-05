/**
 * 管理员拒绝工作流模板 API
 *
 * POST /api/admin/workflow-templates/[id]/reject - 拒绝模板
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import type { ReviewTemplateRequest } from "@/types";

interface RejectResponse {
  success: boolean;
  template?: any;
  error?: string;
}

// POST - 拒绝模板（仅管理员）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  const { id } = await params;
  const templateId = parseInt(id);

  try {
    // 验证管理员权限
    const adminUser = await requireAdmin(request);
    if (adminUser instanceof NextResponse) {
      return adminUser; // 返回错误响应
    }

    // 解析请求体
    const body = await request.json() as ReviewTemplateRequest;
    const { rejection_reason } = body;

    if (!rejection_reason || rejection_reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供拒绝原因' },
        { status: 400 }
      );
    }

    console.log(`[AdminTemplates:Reject:${requestId}] Admin ${adminUser.userId} rejecting template ${templateId}`);

    const pool = getPool();

    // 检查模板是否存在
    const [templates] = await pool.execute(
      'SELECT * FROM workflow_templates WHERE id = ?',
      [templateId]
    );

    if ((templates as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '模板不存在' },
        { status: 404 }
      );
    }

    const template = (templates as any[])[0];

    // 检查模板状态
    if (template.status === 'rejected') {
      return NextResponse.json(
        { success: false, error: '模板已经是已拒绝状态' },
        { status: 400 }
      );
    }

    // 更新模板状态为已拒绝
    await pool.execute(
      `UPDATE workflow_templates
       SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
       WHERE id = ?`,
      [adminUser.userId, rejection_reason.trim(), templateId]
    );

    // 获取更新后的完整模板记录
    const [updated] = await pool.execute(
      `SELECT
        t.*,
        u1.username as submitted_by_username,
        u1.email as submitted_by_email,
        u2.username as reviewed_by_username
       FROM workflow_templates t
       LEFT JOIN users u1 ON t.submitted_by = u1.id
       LEFT JOIN users u2 ON t.reviewed_by = u2.id
       WHERE t.id = ?`,
      [templateId]
    );

    console.log(`[AdminTemplates:Reject:${requestId}] ✓ Template ${templateId} rejected`);

    const response: RejectResponse = {
      success: true,
      template: (updated as any[])[0],
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[AdminTemplates:Reject:${requestId}] ✗ Error:`, error);
    return NextResponse.json(
      { success: false, error: '拒绝模板失败' },
      { status: 500 }
    );
  }
}
