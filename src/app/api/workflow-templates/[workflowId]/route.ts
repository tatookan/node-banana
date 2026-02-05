/**
 * 获取单个模板的完整详情（包含 workflow_data）
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    const pool = getPool();

    const [rows] = await pool.execute(
      `SELECT
        t.*,
        u1.username as submitted_by_username,
        u1.email as submitted_by_email
       FROM workflow_templates t
       LEFT JOIN users u1 ON t.submitted_by = u1.id
       WHERE t.workflow_id = ? AND t.status = 'approved'`,
      [workflowId]
    );

    if ((rows as any[]).length === 0) {
      return NextResponse.json(
        { success: false, error: '模板不存在' },
        { status: 404 }
      );
    }

    const template = (rows as any[])[0];

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error: any) {
    console.error('[WorkflowTemplate Detail API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取模板详情失败' },
      { status: 500 }
    );
  }
}
