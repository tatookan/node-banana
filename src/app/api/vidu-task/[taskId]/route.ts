import { NextRequest, NextResponse } from "next/server";
import { ViduGenerateResponse, ViduTaskResult } from "@/types";
import { getUserIdFromToken, recordViduGeneration } from "@/lib/usageTracker";

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  const { taskId } = await params;

  console.log(`\n[VIDU-POLL:${requestId}] ========== CHECK TASK RESULT ==========`);
  console.log(`[VIDU-POLL:${requestId}] Task ID: ${taskId}`);

  // Get user ID for usage tracking
  const token = request.cookies.get('auth_token')?.value;
  const userId = await getUserIdFromToken(token);
  if (!userId) {
    console.warn(`[VIDU-POLL:${requestId}] ⚠️ No valid user token found`);
  } else {
    console.log(`[VIDU-POLL:${requestId}] User ID: ${userId}`);
  }

  try {
    // First, check if we have a cached result from callback
    const callbackModule = await import('@/app/api/vidu-callback/route');
    const cachedResult = callbackModule.getTaskResult(taskId);

    if (cachedResult) {
      console.log(`[VIDU-POLL:${requestId}] ✓ Found cached result`);

      // Record usage if not already recorded (check if userId exists in callback)
      if (cachedResult.state === "success" && userId) {
        const hasImages = (cachedResult.images || []).length > 0;
        try {
          await recordViduGeneration(
            userId,
            cachedResult.model as any,
            (cachedResult.resolution || "1080p") as any,
            hasImages,
            1
          );
          console.log(`[VIDU-POLL:${requestId}] ✓ Usage recorded for user ${userId}`);
        } catch (recordError) {
          console.error(`[VIDU-POLL:${requestId}] Failed to record usage:`, recordError);
        }
      }

      return handleTaskResult(cachedResult, requestId);
    }

    // If no cached result and in production, callback will handle it
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.log(`[VIDU-POLL:${requestId}] ⏳ Waiting for callback (production mode)`);
      return NextResponse.json<ViduGenerateResponse>({
        success: false,
        error: `Task still processing`,
      });
    }

    // In development, poll VIDU API directly
    const apiKey = process.env.VIDU_API_KEY;
    if (!apiKey) {
      return NextResponse.json<ViduGenerateResponse>({
        success: false,
        error: "VIDU_API_KEY not configured",
      }, { status: 500 });
    }

    const VIDU_API_BASE_URL = process.env.VIDU_API_BASE_URL || "https://api.vidu.cn/ent/v2";
    const pollEndpoint = `${VIDU_API_BASE_URL}/tasks/${taskId}/creations`;

    console.log(`[VIDU-POLL:${requestId}] Polling VIDU API: ${pollEndpoint}`);

    const response = await fetch(pollEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${apiKey}`,
      },
    });

    console.log(`[VIDU-POLL:${requestId}] VIDU API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[VIDU-POLL:${requestId}] ❌ VIDU API error: ${response.status} ${errorText}`);
      return NextResponse.json<ViduGenerateResponse>({
        success: false,
        error: `Task still processing`,
      });
    }

    const viduResponse = await response.json();
    console.log(`[VIDU-POLL:${requestId}] VIDU API response:`, JSON.stringify(viduResponse, null, 2));

    // Check task state
    if (viduResponse.state === "success" && viduResponse.creations && viduResponse.creations.length > 0) {
      const creation = viduResponse.creations[0];
      const imageUrl = creation.url || creation.watermarked_url;

      if (imageUrl) {
        console.log(`[VIDU-POLL:${requestId}] ✓✓✓ TASK SUCCESS - Fetching image ✓✓✓`);

        // Fetch the image and convert to base64
        try {
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image: ${imageResponse.status}`);
          }

          const imageBuffer = await imageResponse.arrayBuffer();
          const imageBase64 = Buffer.from(imageBuffer).toString("base64");
          const dataUrl = `data:image/png;base64,${imageBase64}`;

          console.log(`[VIDU-POLL:${requestId}] Image fetched: ${(dataUrl.length / 1024).toFixed(2)}KB`);

          // Record usage for development mode (polling)
          if (userId) {
            const hasImages = (viduResponse.images || []).length > 0;
            try {
              await recordViduGeneration(
                userId,
                viduResponse.model as any,
                (viduResponse.resolution || "1080p") as any,
                hasImages,
                1
              );
              console.log(`[VIDU-POLL:${requestId}] ✓ Usage recorded for user ${userId}`);
            } catch (recordError) {
              console.error(`[VIDU-POLL:${requestId}] Failed to record usage:`, recordError);
            }
          }

          // Cache the result
          callbackModule.storeTaskResult(taskId, viduResponse);

          return NextResponse.json<ViduGenerateResponse>({
            success: true,
            image: dataUrl,
          });
        } catch (fetchError) {
          console.error(`[VIDU-POLL:${requestId}] ❌ Failed to fetch image:`, fetchError);
          return NextResponse.json<ViduGenerateResponse>(
            {
              success: false,
              error: `Task succeeded but failed to fetch result image: ${fetchError}`,
            },
            { status: 500 }
          );
        }
      }
    }

    // Task still processing or failed
    if (viduResponse.state === "failed") {
      console.error(`[VIDU-POLL:${requestId}] ❌ TASK FAILED`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "Task failed",
        },
        { status: 500 }
      );
    }

    // Still processing
    const progressValue = viduResponse.progress ?? null;
    console.log(`[VIDU-POLL:${requestId}] ⏳ Task still processing: ${viduResponse.state}, progress: ${viduResponse.progress}, returning: ${progressValue}`);
    return NextResponse.json<ViduGenerateResponse>({
      success: false,
      error: `Task still processing: ${viduResponse.state}`,
      progress: progressValue,
    });

  } catch (error) {
    console.error(`[VIDU-POLL:${requestId}] ❌ Error:`, error);
    return NextResponse.json<ViduGenerateResponse>(
      {
        success: false,
        error: "Failed to check task result",
      },
      { status: 500 }
    );
  }
}

async function handleTaskResult(result: ViduTaskResult, requestId: string): Promise<NextResponse<ViduGenerateResponse>> {
  console.log(`[VIDU-POLL:${requestId}] Task result:`);
  console.log(`[VIDU-POLL:${requestId}]   - state: ${result.state}`);
  console.log(`[VIDU-POLL:${requestId}]   - has image_url: ${!!result.image_url}`);
  console.log(`[VIDU-POLL:${requestId}]   - has error: ${!!result.error}`);

  // Handle different task states
  if (result.state === "success") {
    if (result.image_url) {
      console.log(`[VIDU-POLL:${requestId}] ✓✓✓ TASK SUCCESS - Fetching image ✓✓✓`);

      // Fetch the image from URL and convert to base64
      return fetch(result.image_url)
        .then(res => {
          if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
          return res.arrayBuffer();
        })
        .then(buffer => {
          const imageBase64 = Buffer.from(buffer).toString("base64");
          const dataUrl = `data:image/png;base64,${imageBase64}`;
          console.log(`[VIDU-POLL:${requestId}] Image fetched: ${(dataUrl.length / 1024).toFixed(2)}KB`);
          return NextResponse.json<ViduGenerateResponse>({
            success: true,
            image: dataUrl,
          });
        })
        .catch(fetchError => {
          console.error(`[VIDU-POLL:${requestId}] ❌ Failed to fetch image:`, fetchError);
          return NextResponse.json<ViduGenerateResponse>(
            {
              success: false,
              error: `Task succeeded but failed to fetch result image: ${fetchError}`,
            },
            { status: 500 }
          );
        });
    } else {
      console.warn(`[VIDU-POLL:${requestId}] ⚠️ Task success but no image_url`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "Task completed successfully but no image URL returned",
        },
        { status: 500 }
      );
    }
  } else if (result.state === "failed") {
    console.error(`[VIDU-POLL:${requestId}] ❌ TASK FAILED: ${result.error || "Unknown error"}`);
    return NextResponse.json<ViduGenerateResponse>(
      {
        success: false,
        error: result.error || "Task failed without error message",
      },
      { status: 500 }
    );
  } else {
    // Task still processing (created, queueing, processing)
    console.log(`[VIDU-POLL:${requestId}] ⏳ Task still processing: ${result.state}`);
    return NextResponse.json<ViduGenerateResponse>({
      success: false,
      error: `Task still processing: ${result.state}`,
    });
  }
}
