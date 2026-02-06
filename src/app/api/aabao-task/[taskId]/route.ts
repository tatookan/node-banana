import { NextRequest, NextResponse } from "next/server";
import { AabaoGenerateAsyncResponse } from "@/types";
import { getTaskResult } from "@/app/api/aabao-task/route";

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// ============================================================================
// AABao 任务轮询端点
// ============================================================================
// 前端/后端轮询此端点以获取任务状态和结果

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  const { taskId } = await params;

  console.log(`[AABao-POLL:${requestId}] Checking task: ${taskId}`);

  // ========================================
  // 从内存缓存获取任务结果
  // ========================================
  const taskResult = getTaskResult(taskId);

  if (!taskResult) {
    console.log(`[AABao-POLL:${requestId}] ❌ Task not found: ${taskId}`);
    return NextResponse.json<AabaoGenerateAsyncResponse>({
      success: false,
      error: "Task not found",
    }, { status: 404 });
  }

  console.log(`[AABao-POLL:${requestId}] Task state: ${taskResult.state}`);

  // ========================================
  // 根据状态返回响应
  // ========================================

  if (taskResult.state === "success" && taskResult.image) {
    // 任务成功完成
    console.log(`[AABao-POLL:${requestId}] ✓✓✓ TASK SUCCESS ✓✓✓`);
    console.log(`[AABao-POLL:${requestId}]   Image size: ${(taskResult.image.length / 1024).toFixed(2)}KB`);
    console.log(`[AABao-POLL:${requestId}]   Duration: ${taskResult.completedAt ? ((taskResult.completedAt - taskResult.createdAt) / 1000).toFixed(2) : 'N/A'}s`);

    return NextResponse.json<AabaoGenerateAsyncResponse>({
      success: true,
      image: taskResult.image,
    });
  }

  if (taskResult.state === "failed") {
    // 任务失败
    console.log(`[AABao-POLL:${requestId}] ❌ TASK FAILED: ${taskResult.error}`);
    return NextResponse.json<AabaoGenerateAsyncResponse>({
      success: false,
      error: taskResult.error || "Task failed",
    }, { status: 500 });
  }

  // 仍在处理中 (pending 或 processing)
  const elapsed = Date.now() - taskResult.createdAt;
  console.log(`[AABao-POLL:${requestId}] ⏳ Task still ${taskResult.state} (${(elapsed / 1000).toFixed(1)}s elapsed)`);

  return NextResponse.json<AabaoGenerateAsyncResponse>({
    success: false,
    error: `Task ${taskResult.state}`,
  });
}
