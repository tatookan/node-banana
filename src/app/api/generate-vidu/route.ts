import { NextRequest, NextResponse } from "next/server";
import { ViduGenerateRequest, ViduGenerateResponse, ViduTaskResponse } from "@/types";

export const maxDuration = 300; // 5 minute timeout
export const dynamic = 'force-dynamic';

const VIDU_API_BASE_URL = process.env.VIDU_API_BASE_URL || "https://api.vidu.cn/ent/v2";
const MAX_IMAGES = 7; // VIDU API limit

// Get the callback URL for VIDU to notify us when task is complete
function getCallbackUrl(): string {
  // Use the request's origin to construct the callback URL
  // In production, this should be your public-facing URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  return `${baseUrl}/api/vidu-callback`;
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n[VIDU:${requestId}] ========== NEW GENERATE REQUEST ==========`);
  console.log(`[VIDU:${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    // Check API key
    const apiKey = process.env.VIDU_API_KEY;
    if (!apiKey) {
      console.error(`[VIDU:${requestId}] ❌ VIDU_API_KEY not configured`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "VIDU_API_KEY not configured",
        },
        { status: 500 }
      );
    }

    console.log(`[VIDU:${requestId}] Parsing request body...`);

    let body: ViduGenerateRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error(`[VIDU:${requestId}] ❌ JSON parse error:`, parseError);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "Request body malformed",
        },
        { status: 413 }
      );
    }

    const { images = [], prompt, model = "viduq2", aspect_ratio, resolution, seed, payload, offPeak = true } = body;

    console.log(`[VIDU:${requestId}] Request parameters:`);
    console.log(`[VIDU:${requestId}]   - Model: ${model}`);
    console.log(`[VIDU:${requestId}]   - Images count: ${images.length}`);
    console.log(`[VIDU:${requestId}]   - Prompt length: ${prompt?.length || 0} chars`);
    console.log(`[VIDU:${requestId}]   - Aspect Ratio: ${aspect_ratio || 'default'}`);
    console.log(`[VIDU:${requestId}]   - Resolution: ${resolution || 'default'}`);
    console.log(`[VIDU:${requestId}]   - Seed: ${seed || 'random'}`);
    console.log(`[VIDU:${requestId}]   - Off-peak mode: ${offPeak ? 'enabled (cheaper)' : 'disabled (faster)'}`);

    // Validate image count limit
    const imageCount = images.length;
    if (imageCount > MAX_IMAGES) {
      console.error(`[VIDU:${requestId}] ❌ Validation failed: too many images (${imageCount} > ${MAX_IMAGES})`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: `Maximum ${MAX_IMAGES} images allowed. You provided ${imageCount} images.`,
        },
        { status: 400 }
      );
    }

    // Validate model
    if (model !== "viduq2" && model !== "viduq1") {
      console.error(`[VIDU:${requestId}] ❌ Validation failed: invalid model ${model}`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: `Invalid model: ${model}. Must be viduq2 or viduq1.`,
        },
        { status: 400 }
      );
    }

    // Validate: viduq1 requires at least 1 image
    if (model === "viduq1" && imageCount === 0) {
      console.error(`[VIDU:${requestId}] ❌ Validation failed: viduq1 requires at least 1 image`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "viduq1 model requires at least 1 input image.",
        },
        { status: 400 }
      );
    }

    if (!prompt) {
      console.error(`[VIDU:${requestId}] ❌ Validation failed: missing prompt`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "Prompt is required",
        },
        { status: 400 }
      );
    }

    // Check prompt length (VIDU limit: 2000 chars)
    if (prompt.length > 2000) {
      console.error(`[VIDU:${requestId}] ❌ Validation failed: prompt too long (${prompt.length} > 2000)`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: "Prompt is too long. Maximum 2000 characters allowed.",
        },
        { status: 400 }
      );
    }

    // Build request payload for VIDU API
    console.log(`[VIDU:${requestId}] Building VIDU API request...`);

    // Process images: extract data URLs or use as-is
    const processedImages = images.map((img, idx) => {
      if (img.includes("base64,")) {
        // Already a data URL, use as-is
        console.log(`[VIDU:${requestId}]   Image ${idx + 1}: data URL, ${(img.length / 1024).toFixed(2)}KB`);
        return img;
      }
      // Assume raw base64, add prefix
      console.log(`[VIDU:${requestId}]   Image ${idx + 1}: raw base64, ${(img.length / 1024).toFixed(2)}KB`);
      return `data:image/png;base64,${img}`;
    });

    const viduPayload: any = {
      model,
      images: processedImages,
      prompt,
      seed: seed || 0,
      off_peak: offPeak,  // 错峰模式
    };

    if (aspect_ratio) {
      viduPayload.aspect_ratio = aspect_ratio;
    }

    if (resolution) {
      viduPayload.resolution = resolution;
    }

    if (payload) {
      viduPayload.payload = payload;
    }

    // Add callback URL for VIDU to notify us when task is complete
    viduPayload.callback_url = getCallbackUrl();
    console.log(`[VIDU:${requestId}]   Callback URL: ${viduPayload.callback_url}`);

    console.log(`[VIDU:${requestId}] Calling VIDU API: ${VIDU_API_BASE_URL}/reference2image`);

    const response = await fetch(`${VIDU_API_BASE_URL}/reference2image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${apiKey}`,
      },
      body: JSON.stringify(viduPayload),
    });

    console.log(`[VIDU:${requestId}] VIDU API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[VIDU:${requestId}] ❌ VIDU API error: ${response.status} ${errorText}`);
      return NextResponse.json<ViduGenerateResponse>(
        {
          success: false,
          error: `VIDU API error: ${response.status} - ${errorText.substring(0, 200)}`,
        },
        { status: response.status }
      );
    }

    const viduResponse: ViduTaskResponse = await response.json();

    console.log(`[VIDU:${requestId}] VIDU API response:`);
    console.log(`[VIDU:${requestId}]   - task_id: ${viduResponse.task_id}`);
    console.log(`[VIDU:${requestId}]   - state: ${viduResponse.state}`);
    console.log(`[VIDU:${requestId}]   - credits: ${viduResponse.credits}`);

    console.log(`[VIDU:${requestId}] ✓✓✓ SUCCESS - Task created ✓✓✓`);

    return NextResponse.json<ViduGenerateResponse>({
      success: true,
      taskId: viduResponse.task_id,
    });

  } catch (error) {
    console.error(`[VIDU:${requestId}] ❌❌❌ EXCEPTION CAUGHT IN API ROUTE ❌❌❌`);
    console.error(`[VIDU:${requestId}] Error type:`, error?.constructor?.name);
    console.error(`[VIDU:${requestId}] Error toString:`, String(error));

    let errorMessage = "VIDU generation failed";
    let errorDetails = "";

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || "";
      console.error(`[VIDU:${requestId}] Error message:`, errorMessage);
      console.error(`[VIDU:${requestId}] Error stack:`, error.stack);
    }

    if (error && typeof error === "object") {
      const apiError = error as Record<string, unknown>;
      console.error(`[VIDU:${requestId}] Error object keys:`, Object.keys(apiError));

      if (apiError.cause) {
        console.error(`[VIDU:${requestId}] Error cause:`, apiError.cause);
        errorDetails += `\nCause: ${JSON.stringify(apiError.cause)}`;
      }
    }

    console.error(`[VIDU:${requestId}] Compiled error details:`, errorDetails);

    return NextResponse.json<ViduGenerateResponse>(
      {
        success: false,
        error: `${errorMessage}${errorDetails ? ` | Details: ${errorDetails.substring(0, 500)}` : ""}`,
      },
      { status: 500 }
    );
  }
}
