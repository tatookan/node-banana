import { NextRequest, NextResponse } from "next/server";
import { AabaoTaskState, ModelType, Resolution, AspectRatio } from "@/types";

export const dynamic = 'force-dynamic';

// ============================================================================
// 内存任务存储 (In-Memory Task Storage)
// ============================================================================
// In production, this should be replaced with Redis or a database.
// Tasks are automatically cleaned up after 1 hour.

const taskResults = new Map<string, AabaoTaskResult>();

// ============================================================================
// 类型定义 (Type Definitions)
// ============================================================================

export interface AabaoTaskResult {
  taskId: string;
  state: AabaoTaskState;
  createdAt: number;
  completedAt?: number;
  userId: number;
  image?: string;
  error?: string;
  requestParams: {
    model: ModelType;
    resolution?: Resolution;
    aspectRatio: AspectRatio;
  };
}

// ============================================================================
// 缓存操作函数 (Cache Operations)
// ============================================================================

/**
 * 存储任务结果（1小时后自动清理）
 * Store task result with automatic cleanup after 1 hour
 */
export function storeTaskResult(taskId: string, result: AabaoTaskResult): void {
  taskResults.set(taskId, result);

  // Auto-cleanup after 1 hour
  setTimeout(() => {
    const deleted = taskResults.delete(taskId);
    if (deleted) {
      console.log(`[AABao-CACHE] Cleaned up task: ${taskId}`);
    }
  }, 60 * 60 * 1000);
}

/**
 * 获取任务结果
 * Get task result by ID
 */
export function getTaskResult(taskId: string): AabaoTaskResult | null {
  return taskResults.get(taskId) || null;
}

/**
 * 更新任务状态
 * Update task state with optional additional data
 */
export function updateTaskState(
  taskId: string,
  state: AabaoTaskState,
  updates?: Partial<Omit<AabaoTaskResult, 'taskId' | 'state'>>
): void {
  const existing = taskResults.get(taskId);
  if (existing) {
    const updated: AabaoTaskResult = {
      ...existing,
      state,
      ...updates,
    };
    // Set completion timestamp for terminal states
    if (state === 'success' || state === 'failed') {
      updated.completedAt = Date.now();
    }
    taskResults.set(taskId, updated);
    console.log(`[AABao-CACHE] Updated task ${taskId}: ${state}`);
  } else {
    console.warn(`[AABao-CACHE] Task not found for update: ${taskId}`);
  }
}

// ============================================================================
// API 端点 (API Endpoints)
// ============================================================================

/**
 * GET 端点：查看当前缓存状态
 * GET endpoint: View current cache status (for debugging)
 */
export async function GET() {
  return NextResponse.json({
    status: "AABao task cache",
    totalTasks: taskResults.size,
    tasks: Array.from(taskResults.values()).map(t => ({
      taskId: t.taskId,
      state: t.state,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      userId: t.userId,
    })),
  });
}

/**
 * DELETE 端点：清空缓存（仅用于调试）
 * DELETE endpoint: Clear all tasks (debug only)
 */
export async function DELETE() {
  const count = taskResults.size;
  taskResults.clear();
  return NextResponse.json({
    status: "AABao task cache cleared",
    tasksDeleted: count,
  });
}
