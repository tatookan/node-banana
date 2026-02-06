import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * API endpoint to proxy R2 images to avoid CORS issues
 *
 * This endpoint fetches the image from R2 using a presigned URL
 * and returns it to the browser, avoiding direct browser-to-R2
 * requests which can fail due to CORS.
 *
 * GET /api/proxy-image?url=<presignedUrl>
 * Response: Image blob with proper CORS headers
 */
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const { searchParams } = new URL(request.url);
    const presignedUrl = searchParams.get('url');

    if (!presignedUrl) {
      return NextResponse.json(
        { error: "url parameter is required" },
        { status: 400 }
      );
    }

    console.log(`[R2:Proxy:${requestId}] Fetching image from R2...`);

    // Fetch the image from R2
    const response = await fetch(presignedUrl);

    if (!response.ok) {
      console.error(`[R2:Proxy:${requestId}] R2 fetch failed: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the image blob
    const blob = await response.blob();

    console.log(`[R2:Proxy:${requestId}] ✓ Image fetched: ${(blob.size / 1024).toFixed(2)}KB, type: ${blob.type}`);

    // Return the image with proper CORS headers
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error(`[R2:Proxy:${requestId}] Error:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
