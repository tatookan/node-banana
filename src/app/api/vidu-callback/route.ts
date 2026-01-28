import { NextRequest, NextResponse } from "next/server";
import { ViduTaskResult } from "@/types";

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// In-memory store for task results
// In production, this should be replaced with Redis or a database
const taskResults = new Map<string, ViduTaskResult>();

// Store a task result
export function storeTaskResult(taskId: string, result: ViduTaskResult): void {
  taskResults.set(taskId, result);

  // Clean up old results after 1 hour
  setTimeout(() => {
    taskResults.delete(taskId);
  }, 60 * 60 * 1000);
}

// Get a task result
export function getTaskResult(taskId: string): ViduTaskResult | null {
  return taskResults.get(taskId) || null;
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
      resolution: body.resolution,
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

    // Store the task result
    storeTaskResult(taskId, taskResult);

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
