import { NextRequest, NextResponse } from "next/server";
import { AabaoGenerateAsyncResponse } from "@/types";
import { getTaskResult, getCacheSize } from "@/app/api/aabao-task/route";

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

  console.log(`[AABao-POLL:${requestId}] ========== CHECKING TASK ==========`);
  console.log(`[AABao-POLL:${requestId}] Task ID: ${taskId}`);
  console.log(`[AABao-POLL:${requestId}] Cache size: ${getCacheSize()}`);

  // ========================================
  // 从内存缓存获取任务结果
  // ========================================
  const taskResult = getTaskResult(taskId);

  if (!taskResult) {
    // Task not found - could be due to:
    // 1. Race condition: task just created but not yet stored
    // 2. Next.js serverless: different module instances don't share memory
    // Return "still processing" instead of error to allow polling to continue
    console.log(`[AABao-POLL:${requestId}] ⏳ Task not found in cache (may be initializing): ${taskId}`);
    return NextResponse.json<AabaoGenerateAsyncResponse>({
      success: false,
      error: "Task pending", // Use "pending" instead of "not found"
    });
  }

  console.log(`[AABao-POLL:${requestId}] Task state: ${taskResult.state}`);

  // ========================================
  // 根据状态返回响应
  // ========================================

  if (taskResult.state === "success") {
    // 任务成功完成 - 优先返回 R2 引用，否则返回 Base64
    console.log(`[AABao-POLL:${requestId}] ✓✓✓ TASK SUCCESS ✓✓✓`);

    if (taskResult.imageRef) {
      console.log(`[AABao-POLL:${requestId}]   R2 reference: ${taskResult.imageRef}`);
      console.log(`[AABao-POLL:${requestId}]   Duration: ${taskResult.completedAt ? ((taskResult.completedAt - taskResult.createdAt) / 1000).toFixed(2) : 'N/A'}s`);

      return NextResponse.json<AabaoGenerateAsyncResponse>({
        success: true,
        imageRef: taskResult.imageRef,
      });
    } else if (taskResult.image) {
      console.log(`[AABao-POLL:${requestId}]   Image size: ${(taskResult.image.length / 1024).toFixed(2)}KB`);
      console.log(`[AABao-POLL:${requestId}]   Duration: ${taskResult.completedAt ? ((taskResult.completedAt - taskResult.createdAt) / 1000).toFixed(2) : 'N/A'}s`);

      return NextResponse.json<AabaoGenerateAsyncResponse>({
        success: true,
        image: taskResult.image,
      });
    } else {
      console.error(`[AABao-POLL:${requestId}] ❌ Task success but no image data`);
      return NextResponse.json<AabaoGenerateAsyncResponse>({
        success: false,
        error: "Task completed but no image data found",
      }, { status: 500 });
    }
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
