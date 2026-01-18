/**
 * Delete Image API
 *
 * DELETE /api/images/[key]
 *
 * Deletes an image from R2 and removes database record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createR2Client, deleteImageFromR2 } from '@/lib/r2';
import { query } from '@/lib/db';

interface DeleteResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Get user ID from JWT (simplified - use your actual auth)
    const userId = 2; // TODO: Replace with actual JWT verification

    // Get image key from URL
    const { key } = await params;
    const imageKey = decodeURIComponent(key);

    console.log(`[R2:Delete:${requestId}] Deleting image ${imageKey} for user ${userId}...`);

    // Verify image belongs to user
    const imageRecords = await query<any>(
      `SELECT id FROM user_images WHERE image_key = ? AND user_id = ?`,
      [imageKey, userId]
    );

    if (imageRecords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Image not found or access denied' } as DeleteResponse,
        { status: 404 }
      );
    }

    // Delete from R2
    const client = createR2Client();
    await deleteImageFromR2(client, imageKey);

    // Delete from database
    await query(
      `DELETE FROM user_images WHERE image_key = ? AND user_id = ?`,
      [imageKey, userId]
    );

    console.log(`[R2:Delete:${requestId}] ✓ Image deleted: ${imageKey}`);

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    } as DeleteResponse);

  } catch (error: any) {
    console.error(`[R2:Delete:${requestId}] ✗ Delete failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete image',
      } as DeleteResponse,
      { status: 500 }
    );
  }
}

/**
 * Get single image info
 *
 * GET /api/images/[key]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Get user ID from JWT (simplified - use your actual auth)
    const userId = 2; // TODO: Replace with actual JWT verification

    // Get image key from URL
    const { key } = await params;
    const imageKey = decodeURIComponent(key);

    console.log(`[R2:Get:${requestId}] Getting image ${imageKey}...`);

    // Get image metadata from database
    const images = await query<any>(
      `SELECT
        id, image_key, image_type, file_size,
        prompt, model, aspect_ratio, resolution,
        workflow_id, node_id, created_at
      FROM user_images
      WHERE image_key = ? AND user_id = ?`,
      [imageKey, userId]
    );

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Image not found' },
        { status: 404 }
      );
    }

    const img = images[0];

    // Generate presigned URL
    const client = createR2Client();
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

    console.log(`[R2:Get:${requestId}] ✓ Image found: ${imageKey}`);

    return NextResponse.json({
      success: true,
      image: {
        id: img.id,
        imageKey: img.image_key,
        imageType: img.image_type,
        fileSize: img.file_size,
        prompt: img.prompt,
        model: img.model,
        aspectRatio: img.aspect_ratio,
        resolution: img.resolution,
        workflowId: img.workflow_id,
        nodeId: img.node_id,
        createdAt: img.created_at,
        presignedUrl,
      },
    });

  } catch (error: any) {
    console.error(`[R2:Get:${requestId}] ✗ Get failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get image',
      },
      { status: 500 }
    );
  }
}
