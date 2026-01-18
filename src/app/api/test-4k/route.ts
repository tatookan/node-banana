import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n[TEST-4K:${requestId}] ========== TESTING 4K PURE TEXT GENERATION ==========`);

  try {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "API Key not configured" }, { status: 500 });
    }

    const useProxy = process.env.USE_PROXY !== 'false';
    const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';

    const clientConfig: any = {
      vertexai: true,
      apiKey: apiKey,
    };

    if (useProxy) {
      clientConfig.httpOptions = {
        baseUrl: cloudflareWorkerUrl,
      };
      console.log(`[TEST-4K:${requestId}] Using proxy: ${cloudflareWorkerUrl}`);
    } else {
      console.log(`[TEST-4K:${requestId}] Direct connection (no proxy)`);
    }

    const ai = new GoogleGenAI(clientConfig);

    // Test 1K, 2K, 4K resolutions
    const resolutions = ["1K", "2K", "4K"];
    const results = [];

    for (const resolution of resolutions) {
      console.log(`[TEST-4K:${requestId}] Testing ${resolution}...`);

      const config: any = {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          aspectRatio: "9:16",
          imageSize: resolution,
          outputMimeType: "image/png",
        },
        seed: 12345,
      };

      console.log(`[TEST-4K:${requestId}] Config:`, JSON.stringify(config, null, 2));

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: "A simple landscape with mountains and a lake",
        config,
      });

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        results.push({ resolution, error: "No candidates" });
        continue;
      }

      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) {
        results.push({ resolution, error: "No parts" });
        continue;
      }

      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const imageData = part.inlineData.data;

          // Detect dimensions
          let dimensions = "unknown";
          try {
            const buffer = Buffer.from(imageData, 'base64');
            if (buffer[0] === 0x89 && buffer[1] === 0x50) {
              const width = buffer.readUInt32BE(16);
              const height = buffer.readUInt32BE(20);
              dimensions = `${width}x${height}`;
            }
          } catch (e) {
            // Ignore
          }

          results.push({
            resolution,
            dimensions,
            size: `${(imageData.length / 1024).toFixed(2)}KB`,
          });
          console.log(`[TEST-4K:${requestId}] ${resolution}: ${dimensions}`);
          break;
        }
      }
    }

    console.log(`[TEST-4K:${requestId}] Results:`, JSON.stringify(results, null, 2));

    return NextResponse.json({
      success: true,
      useProxy,
      results,
    });

  } catch (error) {
    console.error(`[TEST-4K:${requestId}] Error:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
