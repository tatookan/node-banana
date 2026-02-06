import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * API endpoint to resolve R2 image references to presigned URLs
 *
 * This endpoint is called by the frontend when it needs to display
 * an image stored in R2 (identified by an imageRef like "r2:userId/generation/xxx.png")
 *
 * POST /api/resolve-image-ref
 * Body: { imageRef: string }
 * Response: { success: boolean, presignedUrl?: string, error?: string }
 */
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const body = await request.json();
    const { imageRef } = body;

    if (!imageRef) {
      return NextResponse.json(
        { success: false, error: "imageRef is required" },
        { status: 400 }
      );
    }

    if (!imageRef.startsWith('r2:')) {
      return NextResponse.json(
        { success: false, error: "Invalid imageRef format" },
        { status: 400 }
      );
    }

    console.log(`[R2:ResolveRef:${requestId}] Resolving: ${imageRef}`);

    // Import on demand to avoid client-side bundling issues
    const { resolveImageRef } = await import('@/lib/r2-upload');
    const presignedUrl = await resolveImageRef(imageRef);

    if (!presignedUrl) {
      console.error(`[R2:ResolveRef:${requestId}] Failed to resolve: ${imageRef}`);
      return NextResponse.json(
        { success: false, error: "Failed to resolve image reference" },
        { status: 500 }
      );
    }

    console.log(`[R2:ResolveRef:${requestId}] ✓ Resolved: ${imageRef}`);
    console.log(`[R2:ResolveRef:${requestId}] Presigned URL: ${presignedUrl.substring(0, 100)}...`);

    return NextResponse.json({
      success: true,
      presignedUrl,
    });

  } catch (error) {
    console.error(`[R2:ResolveRef:${requestId}] Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
