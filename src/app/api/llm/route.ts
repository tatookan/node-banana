import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { LLMGenerateRequest, LLMGenerateResponse, LLMModelType } from "@/types";
import { logger } from "@/utils/logger";
import { recordLLMUsage, getUserIdFromToken } from "@/lib/usageTracker";

export const maxDuration = 60; // 1 minute timeout

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Map model types to actual API model IDs
const GOOGLE_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3-pro-preview": "gemini-3-pro-preview",
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  "gpt-4.1-mini": "gpt-4.1-mini",
  "gpt-4.1-nano": "gpt-4.1-nano",
};

async function generateWithGoogle(
  prompt: string,
  model: LLMModelType,
  temperature: number,
  maxTokens: number,
  images?: string[],
  requestId?: string
): Promise<string> {
  // Initialize Google GenAI client with API Key for Vertex AI
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'GOOGLE_CLOUD_API_KEY not configured', { requestId });
    throw new Error("GOOGLE_CLOUD_API_KEY not configured");
  }

  // Use Cloudflare Worker as proxy for Vertex AI API
  const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';

  const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: apiKey,
    httpOptions: {
      baseUrl: cloudflareWorkerUrl,
    },
  });

  const modelId = GOOGLE_MODEL_MAP[model];

  logger.info('api.llm', 'Calling Google GenAI API', {
    requestId,
    model: modelId,
    temperature,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build multimodal content if images are provided
  let contents: string | Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  if (images && images.length > 0) {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Add images first
    for (const img of images) {
      // Extract base64 data and mime type from data URL
      const matches = img.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        parts.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        });
      } else {
        // Fallback: assume PNG if no data URL prefix
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: img,
          },
        });
      }
    }

    // Add text prompt
    parts.push({ text: prompt });

    contents = parts;
  } else {
    contents = prompt;
  }

  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  const duration = Date.now() - startTime;

  // Extract text from response
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    logger.error('api.error', 'No candidates in Google GenAI response', { requestId });
    throw new Error("No candidates in Google GenAI response");
  }

  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    logger.error('api.error', 'No parts in Google GenAI response', { requestId });
    throw new Error("No parts in Google GenAI response");
  }

  // Concatenate all text parts
  const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
  const text = textParts.join('');

  if (!text) {
    logger.error('api.error', 'No text in Google GenAI response', { requestId });
    throw new Error("No text in Google GenAI response");
  }

  logger.info('api.llm', 'Google GenAI API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

async function generateWithOpenAI(
  prompt: string,
  model: LLMModelType,
  temperature: number,
  maxTokens: number,
  images?: string[],
  requestId?: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'OPENAI_API_KEY not configured', { requestId });
    throw new Error("OPENAI_API_KEY not configured");
  }

  const modelId = OPENAI_MODEL_MAP[model];

  logger.info('api.llm', 'Calling OpenAI API', {
    requestId,
    model: modelId,
    temperature,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build content array for vision if images are provided
  let content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  if (images && images.length > 0) {
    content = [
      { type: "text", text: prompt },
      ...images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img },
      })),
    ];
  } else {
    content = prompt;
  }

  const startTime = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  const duration = Date.now() - startTime;

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error('api.error', 'OpenAI API request failed', {
      requestId,
      status: response.status,
      error: error.error?.message,
    });
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    logger.error('api.error', 'No text in OpenAI response', { requestId });
    throw new Error("No text in OpenAI response");
  }

  logger.info('api.llm', 'OpenAI API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body: LLMGenerateRequest = await request.json();
    const {
      prompt,
      images,
      provider,
      model,
      temperature = 0.7,
      maxTokens = 1024
    } = body;

    logger.info('api.llm', 'LLM generation request received', {
      requestId,
      provider,
      model,
      temperature,
      maxTokens,
      hasImages: !!(images && images.length > 0),
      imageCount: images?.length || 0,
      prompt,
    });

    if (!prompt) {
      logger.warn('api.llm', 'LLM request validation failed: missing prompt', { requestId });
      return NextResponse.json<LLMGenerateResponse>(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    let text: string;

    if (provider === "google") {
      text = await generateWithGoogle(prompt, model, temperature, maxTokens, images, requestId);
    } else if (provider === "openai") {
      text = await generateWithOpenAI(prompt, model, temperature, maxTokens, images, requestId);
    } else {
      logger.warn('api.llm', 'Unknown provider requested', { requestId, provider });
      return NextResponse.json<LLMGenerateResponse>(
        { success: false, error: `Unknown provider: ${provider}` },
        { status: 400 }
      );
    }

    logger.info('api.llm', 'LLM generation successful', {
      requestId,
      responseLength: text.length,
    });

    // Record usage statistics
    const token = request.cookies.get('auth_token')?.value;
    if (token) {
      const userId = await getUserIdFromToken(token);
      if (userId) {
        // Estimate token count (rough approximation: ~4 chars per token)
        const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);
        await recordLLMUsage(userId, provider, model, estimatedTokens);
      }
    }

    return NextResponse.json<LLMGenerateResponse>({
      success: true,
      text,
    });
  } catch (error) {
    logger.error('api.error', 'LLM generation error', { requestId }, error instanceof Error ? error : undefined);

    // Handle rate limiting
    if (error instanceof Error && error.message.includes("429")) {
      return NextResponse.json<LLMGenerateResponse>(
        { success: false, error: "Rate limit reached. Please wait and try again." },
        { status: 429 }
      );
    }

    return NextResponse.json<LLMGenerateResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "LLM generation failed",
      },
      { status: 500 }
    );
  }
}
