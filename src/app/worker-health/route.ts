import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Worker 专用的健康检查端点（不在 /api/ 路径下，避免 nginx 代理拦截）
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
