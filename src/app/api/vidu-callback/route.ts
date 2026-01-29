import { NextRequest, NextResponse } from "next/server";
import { ViduTaskResult } from "@/types";

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Extended task result with userId for usage tracking
interface ExtendedTaskResult extends ViduTaskResult {
  userId?: number;
}

// In-memory store for task results
// In production, this should be replaced with Redis or a database
const taskResults = new Map<string, ExtendedTaskResult>();

// Store a task result
export function storeTaskResult(taskId: string, result: ViduTaskResult, userId?: number): void {
  const extended: ExtendedTaskResult = {
    ...result,
    userId,
  };
  taskResults.set(taskId, extended);

  // Clean up old results after 1 hour
  setTimeout(() => {
    taskResults.delete(taskId);
  }, 60 * 60 * 1000);
}

// Get a task result
export function getTaskResult(taskId: string): ViduTaskResult | null {
  return taskResults.get(taskId) || null;
}

// Store task info when creating the task (for later usage recording)
export function storeTaskInfo(taskId: string, userId: number): void {
  const existing = taskResults.get(taskId);
  if (existing) {
    existing.userId = userId;
  } else {
    // Create a minimal task result that will be filled in later by callback
    taskResults.set(taskId, {
      task_id: taskId,
      state: 'created',
      model: 'viduq2',
      prompt: '',
      images: [],
      seed: 0,
      credits: 0,
      created_at: new Date().toISOString(),
      userId,
    } as ExtendedTaskResult);
  }
}

// Handle VIDU callback
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const body = await request.json();

    console.log(`\n[VIDU-CALLBACK:${requestId}] ========== TASK CALLBACK RECEIVED ==========`);
    console.log(`[VIDU-CALLBACK:${requestId}] Task ID: ${body.id || body.task_id}`);
    console.log(`[VIDU-CALLBACK:${requestId}] State: ${body.state}`);
    console.log(`[VIDU-CALLBACK:${requestId}] Raw body:`, JSON.stringify(body, null, 2));

    // Convert VIDU API callback format to our internal format
    const taskId = body.id || body.task_id;

    // Extract image URL from creations array
    let imageUrl: string | undefined;
    if (body.state === "success" && body.creations && body.creations.length > 0) {
      imageUrl = body.creations[0].url || body.creations[0].watermarked_url;
    }

    // Build our internal ViduTaskResult format
    const taskResult: ViduTaskResult = {
      task_id: taskId,
      state: body.state,
      model: body.model || "viduq2",
      prompt: body.prompt || "",
      images: body.images || [],
      seed: body.seed || 0,
      aspect_ratio: body.aspect_ratio,
      resolution: body.resolution || "1080p",
      callback_url: body.callback_url,
      payload: body.payload || "",
      credits: body.credits || 0,
      created_at: body.created_at || new Date().toISOString(),
      // Additional fields for our internal use
      image_url: imageUrl,
      error: body.state === "failed" ? (body.err_code || "Task failed") : undefined,
    };

    console.log(`[VIDU-CALLBACK:${requestId}] Converted result - has image_url: ${!!taskResult.image_url}`);
    console.log(`[VIDU-CALLBACK:${requestId}] Converted result - has error: ${!!taskResult.error}`);

    // Get the stored task info to retrieve userId
    const storedTask = taskResults.get(taskId);
    const userId = storedTask?.userId;

    // Record usage if task succeeded and we have userId
    if (body.state === "success" && userId) {
      try {
        const { recordViduGeneration } = await import('@/lib/usageTracker');
        const hasImages = (taskResult.images || []).length > 0;
        await recordViduGeneration(
          userId,
          taskResult.model as any,
          taskResult.resolution as any,
          hasImages,
          1
        );
        console.log(`[VIDU-CALLBACK:${requestId}] ✓ Usage recorded for user ${userId}`);
      } catch (recordError) {
        console.error(`[VIDU-CALLBACK:${requestId}] Failed to record usage:`, recordError);
        // Don't fail the callback for usage recording errors
      }
    } else if (body.state === "success" && !userId) {
      console.warn(`[VIDU-CALLBACK:${requestId}] ⚠️ Task succeeded but no userId found`);
    }

    // Store the task result (with userId if available)
    storeTaskResult(taskId, taskResult, userId);

    console.log(`[VIDU-CALLBACK:${requestId}] ✓ Task result stored`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[VIDU-CALLBACK:${requestId}] ❌ Error processing callback:`, error);
    return NextResponse.json(
      { success: false, error: "Failed to process callback" },
      { status: 500 }
    );
  }
}
