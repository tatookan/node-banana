import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GenerateRequest, GenerateResponse, ModelType, Resolution } from "@/types";
import { recordImageGeneration, getUserIdFromToken } from "@/lib/usageTracker";
import { uploadGeneratedImageInBackground } from "@/lib/r2-upload";

export const maxDuration = 300; // 5 minute timeout
export const dynamic = 'force-dynamic';

// Map model types to Gemini model IDs
const MODEL_MAP: Record<ModelType, string> = {
  "nano-banana": "gemini-2.0-flash-exp",
  "nano-banana-pro": "gemini-3-pro-image-preview",
};

// Maximum number of input images allowed (Gemini API limit)
const MAX_IMAGES = 14;

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n[API:${requestId}] ========== NEW GENERATE REQUEST ==========`);
  console.log(`[API:${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    // Initialize Google GenAI client with API Key for Vertex AI
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      console.error(`[API:${requestId}] ❌ GOOGLE_CLOUD_API_KEY not configured`);
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: "GOOGLE_CLOUD_API_KEY not configured",
        },
        { status: 500 }
      );
    }

    console.log(`[API:${requestId}] Initializing Google GenAI client with API Key (Vertex AI mode)...`);

    // Use Cloudflare Worker as proxy for Vertex AI API
    const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';

    const ai = new GoogleGenAI({
      vertexai: true,
      apiKey: apiKey,
      httpOptions: {
        baseUrl: cloudflareWorkerUrl,
      },
    });

    console.log(`[API:${requestId}] Parsing request body...`);

    let body: GenerateRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error(`[API:${requestId}] ❌ JSON parse error:`, parseError);
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: "Request body too large or malformed. Please reduce the number or size of input images (max 14 images, each under 5MB recommended).",
        },
        { status: 413 }
      );
    }
    const { images, prompt, model = "nano-banana-pro", aspectRatio, resolution, useGoogleSearch } = body;

    const modelId = MODEL_MAP[model];
    console.log(`[API:${requestId}] Request parameters:`);
    console.log(`[API:${requestId}]   - Model: ${model} -> ${modelId}`);
    console.log(`[API:${requestId}]   - Images count: ${images?.length || 0}`);
    console.log(`[API:${requestId}]   - Prompt length: ${prompt?.length || 0} chars`);
    console.log(`[API:${requestId}]   - Aspect Ratio: ${aspectRatio || 'default'}`);
    console.log(`[API:${requestId}]   - Resolution: ${resolution || 'default'}`);
    console.log(`[API:${requestId}]   - Google Search: ${useGoogleSearch || false}`);

    // Validate image count limit
    const imageCount = images?.length || 0;
    if (imageCount > MAX_IMAGES) {
      console.error(`[API:${requestId}] ❌ Validation failed: too many images (${imageCount} > ${MAX_IMAGES})`);
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: `Maximum ${MAX_IMAGES} images allowed. You provided ${imageCount} images.`,
        },
        { status: 400 }
      );
    }

    if (!prompt) {
      console.error(`[API:${requestId}] ❌ Validation failed: missing prompt`);
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: "Prompt is required",
        },
        { status: 400 }
      );
    }

    console.log(`[API:${requestId}] Extracting image data...`);
    // Extract base64 data and MIME types from data URLs
    const imageData = (images || []).map((image, idx) => {
      if (image.includes("base64,")) {
        const [header, data] = image.split("base64,");
        // Extract MIME type from header (e.g., "data:image/png;" -> "image/png")
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        console.log(`[API:${requestId}]   Image ${idx + 1}: ${mimeType}, ${(data.length / 1024).toFixed(2)}KB base64`);
        return { data, mimeType };
      }
      console.log(`[API:${requestId}]   Image ${idx + 1}: No base64 header, assuming PNG, ${(image.length / 1024).toFixed(2)}KB`);
      return { data: image, mimeType: "image/png" };
    });

    // Build request parts array with prompt and all images
    console.log(`[API:${requestId}] Building request parts...`);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
      ...imageData.map(({ data, mimeType }) => ({
        inlineData: {
          mimeType,
          data,
        },
      })),
    ];
    console.log(`[API:${requestId}] Request parts count: ${parts.length} (1 text + ${imageData.length} images)`);

    // Build config object
    console.log(`[API:${requestId}] Building generation config...`);
    const config: any = {
      responseModalities: ["IMAGE", "TEXT"],
    };

    // Build imageConfig - both models support aspect ratio, Pro supports additional features
    // JavaScript SDK 使用 camelCase，Cloudflare Worker 会转换为 snake_case
    const imageConfig: any = {};

    if (aspectRatio) {
      imageConfig.aspectRatio = aspectRatio;
      console.log(`[API:${requestId}]   Added aspectRatio: ${aspectRatio}`);
    }

    // Add resolution only for Nano Banana Pro
    if (model === "nano-banana-pro" && resolution) {
      imageConfig.imageSize = resolution;
      console.log(`[API:${requestId}]   Added imageSize: ${resolution}`);
    }

    // Add outputMimeType for Pro
    if (model === "nano-banana-pro") {
      imageConfig.outputMimeType = "image/png";
      console.log(`[API:${requestId}]   Added outputMimeType: image/png`);
    }

    // Add imageConfig to config if it has any properties
    if (Object.keys(imageConfig).length > 0) {
      config.imageConfig = imageConfig;
    }

    // Add tools array for Google Search (only Nano Banana Pro)
    const tools = [];
    if (model === "nano-banana-pro" && useGoogleSearch) {
      tools.push({ googleSearch: {} });
      console.log(`[API:${requestId}]   Added Google Search tool`);
    }

    console.log(`[API:${requestId}] Final config:`, JSON.stringify(config, null, 2));
    if (tools.length > 0) {
      console.log(`[API:${requestId}] Tools:`, JSON.stringify(tools, null, 2));
    }

    // Make request to Gemini API
    console.log(`[API:${requestId}] Calling Gemini API...`);
    const geminiStartTime = Date.now();

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      config,
      ...(tools.length > 0 && { tools }),
    });

    const geminiDuration = Date.now() - geminiStartTime;
    console.log(`[API:${requestId}] Gemini API call completed in ${geminiDuration}ms`);

    // Extract image from response
    console.log(`[API:${requestId}] Processing response...`);
    const candidates = response.candidates;
    console.log(`[API:${requestId}] Candidates count: ${candidates?.length || 0}`);

    if (!candidates || candidates.length === 0) {
      console.error(`[API:${requestId}] ❌ No candidates in response`);
      console.error(`[API:${requestId}] Full response:`, JSON.stringify(response, null, 2));
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: "No response from AI model",
        },
        { status: 500 }
      );
    }

    const responseParts = candidates[0].content?.parts;
    console.log(`[API:${requestId}] Parts count in first candidate: ${responseParts?.length || 0}`);

    if (!responseParts) {
      console.error(`[API:${requestId}] ❌ No parts in candidate content`);
      console.error(`[API:${requestId}] Candidate:`, JSON.stringify(candidates[0], null, 2));
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: "No content in response",
        },
        { status: 500 }
      );
    }

    // Log all parts
    responseParts.forEach((part: any, idx: number) => {
      const partKeys = Object.keys(part);
      console.log(`[API:${requestId}] Part ${idx + 1}: ${partKeys.join(', ')}`);
    });

    // Find image part in response
    for (const part of responseParts) {
      if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        const imageData = part.inlineData.data;
        const imageSizeKB = (imageData.length / 1024).toFixed(2);
        console.log(`[API:${requestId}] ✓ Found image in response: ${mimeType}, ${imageSizeKB}KB base64`);

        const dataUrl = `data:${mimeType};base64,${imageData}`;
        const dataUrlSizeKB = (dataUrl.length / 1024).toFixed(2);
        console.log(`[API:${requestId}] Data URL size: ${dataUrlSizeKB}KB`);

        const responsePayload = { success: true, image: dataUrl };
        const responseSize = JSON.stringify(responsePayload).length;
        const responseSizeMB = (responseSize / (1024 * 1024)).toFixed(2);
        console.log(`[API:${requestId}] Total response payload size: ${responseSizeMB}MB`);

        if (responseSize > 4.5 * 1024 * 1024) {
          console.warn(`[API:${requestId}] ⚠️ Response size (${responseSizeMB}MB) is approaching Next.js 5MB limit!`);
        }

        console.log(`[API:${requestId}] ✓✓✓ SUCCESS - Returning image ✓✓✓`);

        // Upload to R2 in background (fire-and-forget, doesn't block response)
        const token = request.cookies.get('auth_token')?.value;
        if (token) {
          const userId = await getUserIdFromToken(token);
          if (userId) {
            // Record usage statistics
            // nano-banana only supports 1K resolution
            const actualResolution: Resolution = model === "nano-banana" ? "1K" : (resolution || "1K");
            await recordImageGeneration(userId, model, actualResolution, 1);

            // Upload to R2 in background
            uploadGeneratedImageInBackground(userId, dataUrl, {
              prompt,
              model,
              aspectRatio,
              resolution: actualResolution,
            });
          }
        }

        // Create response with explicit headers to handle large payloads
        const response = NextResponse.json<GenerateResponse>(responsePayload);
        response.headers.set('Content-Type', 'application/json');
        response.headers.set('Content-Length', responseSize.toString());

        console.log(`[API:${requestId}] Response headers set, returning...`);
        return response;
      }
    }

    // If no image found, check for text error
    console.warn(`[API:${requestId}] ⚠ No image found in parts, checking for text...`);
    for (const part of responseParts) {
      if (part.text) {
        console.error(`[API:${requestId}] ❌ Model returned text instead of image`);
        console.error(`[API:${requestId}] Text preview: "${part.text.substring(0, 200)}"`);
        return NextResponse.json<GenerateResponse>(
          {
            success: false,
            error: `Model returned text instead of image: ${part.text.substring(0, 200)}`,
          },
          { status: 500 }
        );
      }
    }

    console.error(`[API:${requestId}] ❌ No image or text found in response`);
    console.error(`[API:${requestId}] All parts:`, JSON.stringify(responseParts, null, 2));
    return NextResponse.json<GenerateResponse>(
      {
        success: false,
        error: "No image in response",
      },
      { status: 500 }
    );
  } catch (error) {
    const requestId = 'unknown';
    console.error(`[API:${requestId}] ❌❌❌ EXCEPTION CAUGHT IN API ROUTE ❌❌❌`);
    console.error(`[API:${requestId}] Error type:`, error?.constructor?.name);
    console.error(`[API:${requestId}] Error toString:`, String(error));

    // Extract detailed error information
    let errorMessage = "Generation failed";
    let errorDetails = "";

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || "";
      console.error(`[API:${requestId}] Error message:`, errorMessage);
      console.error(`[API:${requestId}] Error stack:`, error.stack);

      // Check for specific error types
      if ("cause" in error && error.cause) {
        console.error(`[API:${requestId}] Error cause:`, error.cause);
        errorDetails += `\nCause: ${JSON.stringify(error.cause)}`;
      }
    }

    // Try to extract more details from API errors
    if (error && typeof error === "object") {
      const apiError = error as Record<string, unknown>;
      console.error(`[API:${requestId}] Error object keys:`, Object.keys(apiError));

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
      if (apiError.response) {
        try {
          console.error(`[API:${requestId}] Error response:`, apiError.response);
          errorDetails += `\nResponse: ${JSON.stringify(apiError.response)}`;
        } catch {
          errorDetails += `\nResponse: [unable to stringify]`;
        }
      }

      // Log entire error object for debugging
      try {
        console.error(`[API:${requestId}] Full error object:`, JSON.stringify(apiError, null, 2));
      } catch {
        console.error(`[API:${requestId}] Could not stringify full error object`);
      }
    }

    console.error(`[API:${requestId}] Compiled error details:`, errorDetails);

    // Handle rate limiting
    if (errorMessage.includes("429")) {
      console.error(`[API:${requestId}] Rate limit error detected`);
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: "Rate limit reached. Please wait and try again.",
        },
        { status: 429 }
      );
    }

    console.error(`[API:${requestId}] Returning 500 error response`);
    return NextResponse.json<GenerateResponse>(
      {
        success: false,
        error: `${errorMessage}${errorDetails ? ` | Details: ${errorDetails.substring(0, 500)}` : ""}`,
      },
      { status: 500 }
    );
  }
}
