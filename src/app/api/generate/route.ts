import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GenerateRequest, GenerateResponse, ModelType, Resolution, ImageProvider } from "@/types";
import { recordImageGeneration, getUserIdFromToken } from "@/lib/usageTracker";
import { uploadGeneratedImageInBackground } from "@/lib/r2-upload";
import { enhancePrompt, logPromptEnhancement } from "@/utils/promptEnhancer";
import { checkRateLimit, DEFAULT_RATE_LIMITS } from "@/lib/rateLimiter";

export const maxDuration = 300; // 5 minute timeout
export const dynamic = 'force-dynamic';

// Map model types to Gemini model IDs (same for both providers)
const MODEL_MAP: Record<ModelType, string> = {
  "nano-banana": "gemini-2.5-flash-image",
  "nano-banana-pro": "gemini-3-pro-image-preview",
};

// AABao API configuration
// Recommended CloudFlare accelerated endpoint: https://cf-api.aabao.top
const AABAO_API_BASE = process.env.AABAO_API_BASE || "https://cf-api.aabao.top";

// Maximum number of input images allowed (Gemini API limit)
const MAX_IMAGES = 14;

// Helper function: extract base64 image data
function extractImageData(images: string[], requestId: string) {
  return (images || []).map((image, idx) => {
    if (image.includes("base64,")) {
      const [header, data] = image.split("base64,");
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      console.log(`[API:${requestId}]   Image ${idx + 1}: ${mimeType}, ${(data.length / 1024).toFixed(2)}KB base64`);
      return { data, mimeType };
    }
    console.log(`[API:${requestId}]   Image ${idx + 1}: No base64 header, assuming PNG, ${(image.length / 1024).toFixed(2)}KB`);
    return { data: image, mimeType: "image/png" };
  });
}

// Helper function: build request parts
function buildRequestParts(prompt: string, imageData: Array<{ data: string; mimeType: string }>) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
    ...imageData.map(({ data, mimeType }) => ({
      inlineData: { mimeType, data },
    })),
  ];
  return parts;
}

// Helper function: extract image from Gemini response
function extractImageFromResponse(response: any, requestId: string): string | null {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    console.error(`[API:${requestId}] ❌ No candidates in response`);
    return null;
  }

  const responseParts = candidates[0].content?.parts;
  if (!responseParts) {
    console.error(`[API:${requestId}] ❌ No parts in candidate content`);
    return null;
  }

  console.log(`[API:${requestId}] Parts count in first candidate: ${responseParts.length}`);
  responseParts.forEach((part: any, idx: number) => {
    const partKeys = Object.keys(part);
    console.log(`[API:${requestId}] Part ${idx + 1}: ${partKeys.join(', ')}`);
  });

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || "image/png";
      const imageData = part.inlineData.data;
      const imageSizeKB = (imageData.length / 1024).toFixed(2);
      console.log(`[API:${requestId}] ✓ Found image in response: ${mimeType}, ${imageSizeKB}KB base64`);
      return `data:${mimeType};base64,${imageData}`;
    }
  }

  // Check for text error
  for (const part of responseParts) {
    if (part.text) {
      console.error(`[API:${requestId}] ❌ Model returned text instead of image`);
      console.error(`[API:${requestId}] Text preview: "${part.text.substring(0, 200)}"`);
      throw new Error(`Model returned text instead of image: ${part.text.substring(0, 200)}`);
    }
  }

  console.error(`[API:${requestId}] ❌ No image or text found in response`);
  return null;
}

// Generate with Google Vertex AI (via Cloudflare Worker proxy)
async function generateWithGoogle(
  images: string[],
  prompt: string,
  model: ModelType,
  aspectRatio?: string,
  resolution?: Resolution,
  useGoogleSearch?: boolean,
  resonanceMode?: boolean,
  systemPrompt?: string,
  topP?: number,
  requestId?: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_API_KEY not configured");
  }

  const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';

  const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: apiKey,
    httpOptions: {
      baseUrl: cloudflareWorkerUrl,
    },
  });

  const modelId = MODEL_MAP[model];
  console.log(`[API:${requestId}] Using Google Vertex AI via Cloudflare Worker`);
  console.log(`[API:${requestId}]   Model: ${model} -> ${modelId}`);
  console.log(`[API:${requestId}]   Proxy: ${cloudflareWorkerUrl}`);

  const imageData = extractImageData(images, requestId!);
  const parts = buildRequestParts(prompt, imageData);
  console.log(`[API:${requestId}] Request parts count: ${parts.length} (1 text + ${imageData.length} images)`);

  // Build config for Google (includes outputMimeType)
  const config: any = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      outputMimeType: "image/png",  // Google supports this
    },
  };

  if (systemPrompt && systemPrompt.trim()) {
    config.systemInstruction = {
      parts: [{ text: systemPrompt.trim() }]
    };
    console.log(`[API:${requestId}]   System prompt: ${systemPrompt.substring(0, 100)}${systemPrompt.length > 100 ? "..." : ""}`);
  }

  if (topP !== undefined) {
    config.topP = topP;
    console.log(`[API:${requestId}]   Top P: ${topP}`);
  }

  if (aspectRatio) {
    config.imageConfig.aspectRatio = aspectRatio;
    console.log(`[API:${requestId}]   Added aspectRatio: ${aspectRatio}`);
  }

  if (resolution) {
    config.imageConfig.imageSize = resolution;
    console.log(`[API:${requestId}]   Added imageSize: ${resolution}`);
  }

  const tools: any[] = [];
  if (model === "nano-banana-pro" && useGoogleSearch) {
    tools.push({ googleSearch: {} });
    console.log(`[API:${requestId}]   Added Google Search tool`);
  }

  console.log(`[API:${requestId}] Final config:`, JSON.stringify(config, null, 2));
  if (tools.length > 0) {
    console.log(`[API:${requestId}] Tools:`, JSON.stringify(tools, null, 2));
  }

  console.log(`[API:${requestId}] Calling Gemini API...`);
  const geminiStartTime = Date.now();

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: "user", parts }],
    config,
    ...(tools.length > 0 && { tools }),
  });

  const geminiDuration = Date.now() - geminiStartTime;
  console.log(`[API:${requestId}] Gemini API call completed in ${geminiDuration}ms`);

  const dataUrl = extractImageFromResponse(response, requestId || '');
  if (!dataUrl) {
    throw new Error("No image in response");
  }

  return dataUrl;
}

// Generate with AABao API (direct call, no proxy)
async function generateWithAabao(
  images: string[],
  prompt: string,
  model: ModelType,
  aspectRatio?: string,
  resolution?: Resolution,
  useGoogleSearch?: boolean,
  resonanceMode?: boolean,
  systemPrompt?: string,
  topP?: number,
  requestId?: string,
  userId?: number | null  // NEW: Pass userId for Worker R2 upload
): Promise<{ dataUrl: string; imageRef?: string }> {
  // Use the same Cloudflare Worker as Google (with /aabao/ path prefix)
  const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';

  // AABao uses specific model ID for 4K resolution
  let modelId = MODEL_MAP[model];
  if (model === "nano-banana-pro" && resolution === "4K") {
    modelId = "gemini-3-pro-image-preview-4k";
    console.log(`[API:${requestId}]   Using 4K-specific model: ${modelId}`);
  }

  // Use Worker with /aabao/ path prefix to trigger AABao routing
  const endpoint = `${cloudflareWorkerUrl}/aabao/v1beta/models/${modelId}:generateContent/`;

  console.log(`[API:${requestId}] Using AABao API via Cloudflare Worker`);
  console.log(`[API:${requestId}]   Model: ${model} -> ${modelId}`);
  console.log(`[API:${requestId}]   Worker: ${cloudflareWorkerUrl}`);
  console.log(`[API:${requestId}]   Endpoint: ${endpoint}`);

  const imageData = extractImageData(images, requestId!);
  const parts = buildRequestParts(prompt, imageData);
  console.log(`[API:${requestId}] Request parts count: ${parts.length} (1 text + ${imageData.length} images)`);

  // Build config for AABao (does NOT include outputMimeType - not supported)
  const config: any = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {},
  };

  if (systemPrompt && systemPrompt.trim()) {
    config.systemInstruction = {
      parts: [{ text: systemPrompt.trim() }]
    };
    console.log(`[API:${requestId}]   System prompt: ${systemPrompt.substring(0, 100)}${systemPrompt.length > 100 ? "..." : ""}`);
  }

  if (topP !== undefined) {
    config.topP = topP;
    console.log(`[API:${requestId}]   Top P: ${topP}`);
  }

  if (aspectRatio) {
    config.imageConfig.aspectRatio = aspectRatio;
    console.log(`[API:${requestId}]   Added aspectRatio: ${aspectRatio}`);
  }

  if (resolution) {
    config.imageConfig.imageSize = resolution;
    console.log(`[API:${requestId}]   Added imageSize: ${resolution}`);
  }

  // Note: AABao does NOT support outputMimeType or Google Search
  if (useGoogleSearch) {
    console.warn(`[API:${requestId}] ⚠ Google Search requested but AABao provider may not support it`);
  }

  console.log(`[API:${requestId}] Final config:`, JSON.stringify(config, null, 2));

  // Build request body in Gemini native format
  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig: config,
  };

  console.log(`[API:${requestId}] Calling AABao API...`);
  const aabaoStartTime = Date.now();

  // AABao API can take 40-90 seconds for 2K, longer for 4K
  // Set up extended timeout handling
  const controller = new AbortController();
  const timeout = 300000; // 5 minutes for 4K generation
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build headers for Worker request
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "node-banana/1.0",
      "X-API-Provider": "aabao",  // Tells Worker to route to AABao
    };

    // Add X-User-Id for Worker R2 upload (Paid plan feature)
    if (userId) {
      headers["X-User-Id"] = String(userId);
    }

    // Fetch request through Worker
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const aabaoDuration = Date.now() - aabaoStartTime;
    console.log(`[API:${requestId}] AABao API call completed in ${aabaoDuration}ms`);
    console.log(`[API:${requestId}] Response status: ${response.status}, headers: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[API:${requestId}] ❌ AABao API error: ${response.status}`);
      console.error(`[API:${requestId}] Error details:`, JSON.stringify(errorData));

      // Special handling for Cloudflare timeout errors
      if (response.status === 524) {
        throw new Error(`AABao API 超时。服务响应太慢（>100秒），请尝试：\n1. 切换到 Google Vertex AI provider\n2. 降低分辨率（1K/2K 比 4K 更快）\n3. 减少输入图片数量\n4. 稍后重试`);
      }

      throw new Error(`AABao API error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    // Check if Worker returned imageRef (Paid plan: Worker already processed JSON and uploaded to R2)
    const isWorkerFallback = response.headers.get('X-Worker-Fallback') === 'json-only';

    // Read response body (can only read once!)
    const responseText = await response.text();

    // First, try to parse as Worker response (with imageRef)
    let dataUrl: string;
    let imageRef: string | undefined;

    try {
      const result = JSON.parse(responseText);

      // Check if Worker processed and uploaded to R2
      if (result.success && result.imageRef && !isWorkerFallback) {
        console.log(`[API:${requestId}] ✓ Worker processed JSON and uploaded to R2: ${result.imageRef}`);
        if (result._workerMetrics) {
          console.log(`[API:${requestId}]   Worker metrics:`, result._workerMetrics);
        }
        // Return empty dataUrl (Worker already has the image) and the imageRef
        return { dataUrl: '', imageRef: result.imageRef };
      }
    } catch (e) {
      // Not a Worker response, fall through to regular JSON parsing
      console.log(`[API:${requestId}] Not a Worker response, parsing JSON locally...`);
    }

    // Fallback: Worker didn't process, parse JSON locally
    console.log(`[API:${requestId}] Parsing JSON response (this may take a while for large images)...`);
    console.log(`[API:${requestId}] Response body received, size: ${(responseText.length / 1024 / 1024).toFixed(2)}MB`);
    const data = JSON.parse(responseText);
    console.log(`[API:${requestId}] JSON parsed, extracting image...`);

    const extractedDataUrl = extractImageFromResponse(data, requestId || '');
    if (!extractedDataUrl) {
      throw new Error("No image in AABao API response");
    }
    dataUrl = extractedDataUrl;

    console.log(`[API:${requestId}] ✓ Image extracted successfully, size: ${(dataUrl.length / 1024).toFixed(2)}KB`);
    return { dataUrl };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[API:${requestId}] ❌ AABao API timeout after ${timeout}ms`);
      throw new Error(`AABao API request timeout (${timeout/1000}s). 4K generation may take longer - please try again or use a lower resolution.`);
    }

    throw error;
  }
}

// Main POST handler
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n[API:${requestId}] ========== NEW GENERATE REQUEST ==========`);
  console.log(`[API:${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    let body: GenerateRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error(`[API:${requestId}] ❌ JSON parse error:`, parseError);
      return NextResponse.json<GenerateResponse>(
        { success: false, error: "Request body too large or malformed. Please reduce the number or size of input images (max 14 images, each under 5MB recommended)." },
        { status: 413 }
      );
    }

    const {
      images = [],
      prompt,
      provider = "google",  // Default to Google for backward compatibility
      aspectRatio,
      resolution,
      model = "nano-banana-pro",
      useGoogleSearch,
      resonanceMode = true,
      systemPrompt,
      topP,
    } = body;

    console.log(`[API:${requestId}] Request parameters:`);
    console.log(`[API:${requestId}]   - Provider: ${provider}`);
    console.log(`[API:${requestId}]   - Model: ${model}`);
    console.log(`[API:${requestId}]   - Images count: ${images.length}`);
    console.log(`[API:${requestId}]   - Prompt length: ${prompt?.length || 0} chars`);
    console.log(`[API:${requestId}]   - Aspect Ratio: ${aspectRatio || 'default'}`);
    console.log(`[API:${requestId}]   - Resolution: ${resolution || 'default'}`);
    console.log(`[API:${requestId}]   - Google Search: ${useGoogleSearch || false}`);
    console.log(`[API:${requestId}]   - Resonance Mode: ${resonanceMode}`);

    // Validate image count
    const imageCount = images.length;
    if (imageCount > MAX_IMAGES) {
      console.error(`[API:${requestId}] ❌ Validation failed: too many images (${imageCount} > ${MAX_IMAGES})`);
      return NextResponse.json<GenerateResponse>(
        { success: false, error: `Maximum ${MAX_IMAGES} images allowed. You provided ${imageCount} images.` },
        { status: 400 }
      );
    }

    if (!prompt) {
      console.error(`[API:${requestId}] ❌ Validation failed: missing prompt`);
      return NextResponse.json<GenerateResponse>(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Apply prompt enhancement (resonance mode: repeat 3 times)
    const finalPrompt = resonanceMode
      ? (() => {
          const enhancementResult = enhancePrompt(prompt, 3);
          if (enhancementResult.wasEnhanced) {
            logPromptEnhancement(enhancementResult, `Generate:${requestId}`);
          }
          return enhancementResult.enhanced;
        })()
      : prompt;

    // Quota check: verify user has enough quota before making API call
    const token = request.cookies.get('auth_token')?.value;
    let userId: number | null = null;
    if (token) {
      userId = await getUserIdFromToken(token);
      if (userId) {
        // ===== Rate limiting check (before quota check) =====
        const rateLimitResult = await checkRateLimit(
          userId,
          '/api/generate',
          DEFAULT_RATE_LIMITS['/api/generate']
        );

        if (!rateLimitResult.allowed) {
          console.error(`[API:${requestId}] ❌ Rate limit exceeded:`, {
            userId,
            endpoint: '/api/generate',
            resetAt: rateLimitResult.resetAt,
          });
          return NextResponse.json<GenerateResponse>(
            {
              success: false,
              error: `请求过于频繁，请在 ${Math.ceil(rateLimitResult.retryAfter! / 60)} 分钟后重试`
            },
            {
              status: 429,
              headers: {
                'Retry-After': String(rateLimitResult.retryAfter),
                'X-RateLimit-Limit': String(DEFAULT_RATE_LIMITS['/api/generate'].maxRequests),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(rateLimitResult.resetAt).toISOString(),
              }
            }
          );
        }

        console.log(`[API:${requestId}] ✓ Rate limit check passed:`, {
          remaining: rateLimitResult.remaining,
          resetAt: rateLimitResult.resetAt,
        });

        // ===== Quota check (after rate limit) =====
        try {
          const { checkQuota } = await import('@/lib/quotaManager');
          const { calculateGenerationCost } = await import('@/utils/costCalculator');
          const providerValue = provider || "google";
          const estimatedCost = calculateGenerationCost(model, resolution || '1K', providerValue);
          const quotaCheck = await checkQuota(userId, estimatedCost);

          if (!quotaCheck.allowed) {
            console.error(`[API:${requestId}] ❌ Quota exceeded:`, quotaCheck);
            return NextResponse.json<GenerateResponse>(
              {
                success: false,
                error: `配额已用尽。已用: ¥${quotaCheck.quotaUsed.toFixed(2)}，上限: ¥${quotaCheck.quotaLimit.toFixed(2)}。请联系管理员增加配额。`
              },
              { status: 403 }
            );
          }
          console.log(`[API:${requestId}] ✓ Quota check passed:`, {
            quotaLimit: quotaCheck.quotaLimit,
            quotaUsed: quotaCheck.quotaUsed,
            quotaRemaining: quotaCheck.quotaRemaining,
            estimatedCost
          });
        } catch (quotaError) {
          console.error(`[API:${requestId}] ⚠️ Quota check error:`, quotaError);
          // Continue anyway if quota check fails
        }
      }
    }

    // Route to appropriate provider
    let dataUrl: string;
    let workerImageRef: string | undefined;  // NEW: Worker may return R2 ref directly

    if (provider === "google") {
      dataUrl = await generateWithGoogle(
        images, finalPrompt, model, aspectRatio, resolution,
        useGoogleSearch, resonanceMode, systemPrompt, topP, requestId
      );
    } else if (provider === "aabao") {
      const result = await generateWithAabao(
        images, finalPrompt, model, aspectRatio, resolution,
        useGoogleSearch, resonanceMode, systemPrompt, topP, requestId,
        userId  // Pass userId for Worker R2 upload
      );
      dataUrl = result.dataUrl;
      workerImageRef = result.imageRef;
    } else {
      console.error(`[API:${requestId}] ❌ Unknown provider: ${provider}`);
      return NextResponse.json<GenerateResponse>(
        { success: false, error: `Unknown provider: ${provider}` },
        { status: 400 }
      );
    }

    const dataUrlSizeKB = (dataUrl.length / 1024).toFixed(2);
    console.log(`[API:${requestId}] Data URL size: ${dataUrlSizeKB}KB`);

    // Check if Worker already uploaded to R2 (Paid plan feature)
    if (workerImageRef) {
      console.log(`[API:${requestId}] ✓✓✓ Worker already uploaded to R2: ${workerImageRef}`);
      console.log(`[API:${requestId}] Skipping local R2 upload, returning Worker's R2 ref`);

      // Record usage
      if (userId) {
        const actualResolution: Resolution = resolution || "1K";
        const providerValue = provider || "google";
        try {
          await recordImageGeneration(userId, model, actualResolution, 1, providerValue);

          // Update quota usage
          const { updateQuotaUsage } = await import('@/lib/quotaManager');
          const { calculateGenerationCost } = await import('@/utils/costCalculator');
          const actualCost = calculateGenerationCost(model, actualResolution, providerValue);
          await updateQuotaUsage(userId, actualCost);
          console.log(`[API:${requestId}] ✓ Quota updated:`, { userId, cost: actualCost });
        } catch (err) {
          console.error(`[API:${requestId}] ⚠️ Usage record error:`, err);
        }
      }

      const responsePayload: GenerateResponse = {
        success: true,
        imageRef: workerImageRef,
      };
      const responseSize = JSON.stringify(responsePayload).length;
      const responseSizeKB = (responseSize / 1024).toFixed(2);
      console.log(`[API:${requestId}] Response size: ${responseSizeKB}KB (R2 ref)`);
      console.log(`[API:${requestId}] ✓✓✓ COMPLETE (Worker R2 mode)`);

      return NextResponse.json<GenerateResponse>(responsePayload);
    }

    // Fallback: Worker didn't upload, need to upload locally
    console.log(`[API:${requestId}] ✓✓✓ SUCCESS - Generated image, uploading to R2 locally...`);

    // ===== NEW: Upload to R2 synchronously and return URL reference =====
    let responsePayload: GenerateResponse;
    let responseSize: number;

    if (token) {
      if (userId) {
        const actualResolution: Resolution = resolution || "1K";
        const providerValue = provider || "google";

        // Record usage first
        await recordImageGeneration(userId, model, actualResolution, 1, providerValue);

        // Update quota usage
        try {
          const { updateQuotaUsage } = await import('@/lib/quotaManager');
          const { calculateGenerationCost } = await import('@/utils/costCalculator');
          const actualCost = calculateGenerationCost(model, actualResolution, providerValue);
          await updateQuotaUsage(userId, actualCost);
          console.log(`[API:${requestId}] ✓ Quota updated:`, { userId, cost: actualCost });
        } catch (quotaError) {
          console.error(`[API:${requestId}] ⚠️ Quota update error:`, quotaError);
        }

        // Upload to R2 synchronously
        try {
          const { uploadGeneratedImage } = await import('@/lib/r2-upload');
          console.log(`[API:${requestId}] Uploading to R2...`);

          const uploadResult = await uploadGeneratedImage(userId, dataUrl, {
            prompt,
            model,
            aspectRatio,
            resolution: actualResolution,
          });

          if (uploadResult.success && uploadResult.imageRef) {
            // Success: Return R2 reference
            console.log(`[API:${requestId}] ✓✓✓ R2 UPLOAD SUCCESS: ${uploadResult.imageRef}`);

            responsePayload = {
              success: true,
              imageRef: uploadResult.imageRef,  // "r2:userId/generation/xxx.png"
            };
            responseSize = JSON.stringify(responsePayload).length;
            const responseSizeKB = (responseSize / 1024).toFixed(2);
            console.log(`[API:${requestId}] Response size: ${responseSizeKB}KB (R2 ref vs ${dataUrlSizeKB}KB Base64)`);
          } else {
            // Fallback: R2 upload failed, return Base64
            console.error(`[API:${requestId}] ⚠️⚠️ R2 upload failed, using Base64 fallback:`, uploadResult.error);

            responsePayload = {
              success: true,
              image: dataUrl,  // Base64 fallback
              _r2UploadError: uploadResult.error,
            };
            responseSize = JSON.stringify(responsePayload).length;
          }
        } catch (r2Error) {
          // Exception during R2 upload: fallback to Base64
          console.error(`[API:${requestId}] ⚠️⚠️ R2 upload exception, using Base64 fallback:`, r2Error);

          responsePayload = {
            success: true,
            image: dataUrl,  // Base64 fallback
            _r2UploadError: r2Error instanceof Error ? r2Error.message : String(r2Error),
          };
          responseSize = JSON.stringify(responsePayload).length;
        }
      } else {
        // No token/user: return Base64 directly
        console.warn(`[API:${requestId}] ⚠️ No user token, returning Base64 directly`);
        responsePayload = { success: true, image: dataUrl };
        responseSize = JSON.stringify(responsePayload).length;
      }
    } else {
      // No token: return Base64
      responsePayload = { success: true, image: dataUrl };
      responseSize = JSON.stringify(responsePayload).length;
    }

    const responseSizeMB = (responseSize / (1024 * 1024)).toFixed(2);
    console.log(`[API:${requestId}] Total response payload size: ${responseSizeMB}MB`);

    const response = NextResponse.json<GenerateResponse>(responsePayload);
    response.headers.set('Content-Type', 'application/json');
    response.headers.set('Content-Length', responseSize.toString());
    return response;

  } catch (error) {
    console.error(`[API:${requestId}] ❌❌❌ EXCEPTION CAUGHT IN API ROUTE ❌❌❌`);
    console.error(`[API:${requestId}] Error type:`, error?.constructor?.name);
    console.error(`[API:${requestId}] Error toString:`, String(error));

    let errorMessage = "Generation failed";
    let errorDetails = "";

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || "";
      console.error(`[API:${requestId}] Error message:`, errorMessage);
      console.error(`[API:${requestId}] Error stack:`, error.stack);

      if ("cause" in error && error.cause) {
        console.error(`[API:${requestId}] Error cause:`, error.cause);
        errorDetails += `\nCause: ${JSON.stringify(error.cause)}`;
      }
    }

    if (error && typeof error === "object") {
      const apiError = error as Record<string, unknown>;
      if (apiError.status) {
        console.error(`[API:${requestId}] Error status:`, apiError.status);
        errorDetails += `\nStatus: ${apiError.status}`;
      }
      if (apiError.statusText) {
        console.error(`[API:${requestId}] Error statusText:`, apiError.statusText);
        errorDetails += `\nStatusText: ${apiError.statusText}`;
      }
      if (apiError.errorDetails) {
        console.error(`[API:${requestId}] Error errorDetails:`, apiError.errorDetails);
        errorDetails += `\nDetails: ${JSON.stringify(apiError.errorDetails)}`;
      }
    }

    console.error(`[API:${requestId}] Compiled error details:`, errorDetails);

    if (errorMessage.includes("429")) {
      console.error(`[API:${requestId}] Rate limit error detected`);
      return NextResponse.json<GenerateResponse>(
        { success: false, error: "Rate limit reached. Please wait and try again." },
        { status: 429 }
      );
    }

    console.error(`[API:${requestId}] Returning 500 error response`);
    return NextResponse.json<GenerateResponse>(
      { success: false, error: `${errorMessage}${errorDetails ? ` | Details: ${errorDetails.substring(0, 500)}` : ""}` },
      { status: 500 }
    );
  }
}
