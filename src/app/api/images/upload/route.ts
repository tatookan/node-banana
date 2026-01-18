/**
 * Upload Image to R2 API
 *
 * POST /api/images/upload
 *
 * Uploads an image to Cloudflare R2 and saves metadata to database.
 * Returns the image key for reference.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createR2Client, uploadImageToR2, generateImageKey, extractExtensionFromDataUrl, extractFileSizeFromDataUrl, ImageType } from '@/lib/r2';
import { execute } from '@/lib/db';

interface UploadRequest {
  image: string; // Base64 data URL
  imageType: 'input' | 'generation' | 'annotation' | 'output';
  metadata?: {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    resolution?: string;
    workflowId?: string;
    nodeId?: string;
  };
}

interface UploadResponse {
  success: boolean;
  imageKey?: string;
  presignedUrl?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Get user from JWT (you'll need to implement this)
    const authHeader = request.headers.get('authorization');
    const token = request.cookies.get('auth_token')?.value || authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as UploadResponse,
        { status: 401 }
      );
    }

    // Verify JWT and get user ID (you'll need to import your JWT verify function)
    // For now, we'll get userId from the token verification
    const userId = 2; // TODO: Replace with actual JWT verification

    // Parse request body
    const body: UploadRequest = await request.json();

    if (!body.image || !body.imageType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: image, imageType' } as UploadResponse,
        { status: 400 }
      );
    }

    console.log(`[R2:Upload:${requestId}] Uploading image for user ${userId}...`);

    // Extract image info
    const extension = extractExtensionFromDataUrl(body.image);
    const fileSize = extractFileSizeFromDataUrl(body.image);

    // Generate storage key
    const imageKey = generateImageKey(userId, body.imageType as ImageType, extension);

    // Upload to R2
    const client = createR2Client();
    await uploadImageToR2(client, imageKey, body.image);

    // Save metadata to database
    await execute(
      `INSERT INTO user_images (
        user_id, image_key, image_type, file_size,
        prompt, model, aspect_ratio, resolution,
        workflow_id, node_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        imageKey,
        body.imageType,
        fileSize,
        body.metadata?.prompt || null,
        body.metadata?.model || null,
        body.metadata?.aspectRatio || null,
        body.metadata?.resolution || null,
        body.metadata?.workflowId || null,
        body.metadata?.nodeId || null,
      ]
    );

    console.log(`[R2:Upload:${requestId}] ✓ Upload successful: ${imageKey}`);

    // Get presigned URL for immediate access
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');

    const presignedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: imageKey,
      }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({
      success: true,
      imageKey,
      presignedUrl,
    } as UploadResponse);

  } catch (error: any) {
    console.error(`[R2:Upload:${requestId}] ✗ Upload failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to upload image',
      } as UploadResponse,
      { status: 500 }
    );
  }
}
