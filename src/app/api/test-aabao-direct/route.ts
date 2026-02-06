import { NextRequest, NextResponse } from "next/server";
import { ModelType } from "@/types";

export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

const MODEL_MAP: Record<ModelType, string> = {
  "nano-banana": "gemini-2.5-flash-image",
  "nano-banana-pro": "gemini-3-pro-image-preview",
};

/**
 * Test: Next.js backend → Cloudflare Worker → AABao API
 * This bypasses the frontend → Worker 100s timeout limit
 */
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n[TEST-BACKEND-WORKER:${requestId}] ========== BACKEND TO WORKER TEST ==========`);

  try {
    const body = await request.json();
    const {
      prompt = "a cute cat",
      model = "nano-banana",
      resolution,
      aspectRatio = "1:1"
    } = body;

    // Use Cloudflare Worker as proxy (same as current generateWithAabao)
    const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';
    let modelId = MODEL_MAP[model as ModelType];

    // AABao uses specific model for 4K
    if (model === "nano-banana-pro" && resolution === "4K") {
      modelId = "gemini-3-pro-image-preview-4k";
    }

    const endpoint = `${cloudflareWorkerUrl}/aabao/v1beta/models/${modelId}:generateContent/`;

    console.log(`[TEST-BACKEND-WORKER:${requestId}] Configuration:`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Worker: ${cloudflareWorkerUrl}`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Model: ${model} -> ${modelId}`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Resolution: ${resolution || 'default'}`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Aspect Ratio: ${aspectRatio}`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Prompt: ${prompt}`);

    console.log(`[TEST-BACKEND-WORKER:${requestId}] Route: Next.js Backend → Worker → AABao API`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}] This bypasses frontend → Worker 100s timeout!`);

    const startTime = Date.now();

    // Build request body in Gemini format
    const requestBody: any = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {},
      },
    };

    // Add aspect ratio and resolution to config
    if (aspectRatio) {
      requestBody.generationConfig.imageConfig.aspectRatio = aspectRatio;
    }
    if (resolution) {
      requestBody.generationConfig.imageConfig.imageSize = resolution;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "node-banana-backend/1.0",
        "X-API-Provider": "aabao",
      },
      body: JSON.stringify(requestBody),
    });

    const duration = Date.now() - startTime;
    console.log(`[TEST-BACKEND-WORKER:${requestId}] Response received in ${duration}ms (${(duration/1000).toFixed(2)}s)`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}] Status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[TEST-BACKEND-WORKER:${requestId}] ❌ Error:`, JSON.stringify(errorData));

      if (response.status === 524) {
        return NextResponse.json({
          success: false,
          error: "Cloudflare Worker timeout (524)",
          message: "This confirms the 100s limit exists when calling from frontend, but backend calls should work",
          duration,
        });
      }

      return NextResponse.json({
        success: false,
        error: `Worker error (${response.status}): ${JSON.stringify(errorData)}`,
        duration,
      }, { status: response.status });
    }

    const responseText = await response.text();
    console.log(`[TEST-BACKEND-WORKER:${requestId}] Response size: ${(responseText.length / 1024).toFixed(2)}KB`);

    const data = JSON.parse(responseText);

    // Extract image
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No candidates in response",
        responsePreview: JSON.stringify(data).substring(0, 500),
        duration,
      });
    }

    const responseParts = candidates[0].content?.parts;
    if (!responseParts) {
      return NextResponse.json({
        success: false,
        error: "No parts in response",
        duration,
      });
    }

    let imageDataUrl: string | null = null;
    for (const part of responseParts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        imageDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageDataUrl) {
      return NextResponse.json({
        success: false,
        error: "No image found in response",
        duration,
      });
    }

    console.log(`[TEST-BACKEND-WORKER:${requestId}] ✓✓✓ SUCCESS ✓✓✓`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Image size: ${(imageDataUrl.length / 1024).toFixed(2)}KB`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}]   - Total time: ${duration}ms (${(duration/1000).toFixed(2)}s)`);
    console.log(`[TEST-BACKEND-WORKER:${requestId}] ✓ Backend → Worker → AABao API works! Can exceed 100s!`);

    return NextResponse.json({
      success: true,
      image: imageDataUrl,
      duration,
      durationSeconds: (duration / 1000).toFixed(2),
      message: "Backend → Worker → AABao API successful! This bypasses the frontend 100s timeout.",
    });

  } catch (error) {
    console.error(`[TEST-BACKEND-WORKER:${requestId}] ❌ Exception:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Backend → Worker test endpoint",
    description: "Tests Next.js backend calling Cloudflare Worker (bypasses frontend 100s timeout)",
    usage: {
      method: "POST",
      body: {
        prompt: "a beautiful landscape",
        model: "nano-banana",
        resolution: "4K",  // Test with 4K to see if we can exceed 100s
        aspectRatio: "16:9"
      }
    },
    architecture: {
      frontend: "Frontend → /api/generate-aabao-async → returns taskId immediately",
      backend: "Backend → Cloudflare Worker → AABao API (can wait >100s)",
      polling: "Frontend polls /api/aabao-task/[taskId] for result"
    }
  });
}
