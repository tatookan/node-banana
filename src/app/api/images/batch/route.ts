/**
 * Batch Operations API for Images
 *
 * POST /api/images/batch
 *
 * Supports: toggleFavorite, delete, getPresignedUrls
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { deleteImageFromR2, createR2Client } from '@/lib/r2';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

interface BatchRequest {
  action: 'toggleFavorite' | 'delete' | 'getPresignedUrls';
  imageKeys: string[];
  favorite?: boolean; // For toggleFavorite: true to set favorite, false to unset, undefined to toggle
}

interface BatchResponse {
  success: boolean;
  results?: Array<{
    imageKey: string;
    success: boolean;
    error?: string;
    presignedUrl?: string;
    isFavorite?: boolean;
  }>;
  error?: string;
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Get user ID from JWT (simplified)
    const userId = 2; // TODO: Replace with actual JWT verification

    const body: BatchRequest = await request.json();

    if (!body.action || !body.imageKeys || body.imageKeys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: action, imageKeys' } as BatchResponse,
        { status: 400 }
      );
    }

    console.log(`[R2:Batch:${requestId}] ${body.action} on ${body.imageKeys.length} images...`);

    const results: BatchResponse['results'] = [];

    if (body.action === 'toggleFavorite') {
      // Toggle favorite status
      for (const imageKey of body.imageKeys) {
        try {
          // Check if image belongs to user
          const images = await query<any>(
            `SELECT id, is_favorite FROM user_images WHERE image_key = ? AND user_id = ?`,
            [imageKey, userId]
          );

          if (images.length === 0) {
            results.push({ imageKey, success: false, error: 'Image not found' });
            continue;
          }

          const currentFavorite = images[0].is_favorite;
          const newFavorite = body.favorite !== undefined ? body.favorite : !currentFavorite;

          await execute(
            `UPDATE user_images SET is_favorite = ? WHERE image_key = ? AND user_id = ?`,
            [newFavorite, imageKey, userId]
          );

          results.push({ imageKey, success: true, isFavorite: newFavorite });
        } catch (error: any) {
          results.push({ imageKey, success: false, error: error.message });
        }
      }

    } else if (body.action === 'delete') {
      // Batch delete
      const client = createR2Client();

      for (const imageKey of body.imageKeys) {
        try {
          // Verify ownership
          const images = await query<any>(
            `SELECT id FROM user_images WHERE image_key = ? AND user_id = ?`,
            [imageKey, userId]
          );

          if (images.length === 0) {
            results.push({ imageKey, success: false, error: 'Image not found' });
            continue;
          }

          // Delete from R2
          await deleteImageFromR2(client, imageKey);

          // Delete from database
          await query(
            `DELETE FROM user_images WHERE image_key = ? AND user_id = ?`,
            [imageKey, userId]
          );

          results.push({ imageKey, success: true });
        } catch (error: any) {
          results.push({ imageKey, success: false, error: error.message });
        }
      }

    } else if (body.action === 'getPresignedUrls') {
      // Get presigned URLs for multiple images
      const client = createR2Client();

      for (const imageKey of body.imageKeys) {
        try {
          const presignedUrl = await getSignedUrl(
            client,
            new GetObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: imageKey,
            }),
            { expiresIn: 3600 }
          );

          results.push({ imageKey, success: true, presignedUrl });
        } catch (error: any) {
          results.push({ imageKey, success: false, error: error.message });
        }
      }
    }

    console.log(`[R2:Batch:${requestId}] ✓ Completed ${results.length} operations`);

    return NextResponse.json({
      success: true,
      results,
    } as BatchResponse);

  } catch (error: any) {
    console.error(`[R2:Batch:${requestId}] ✗ Batch operation failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Batch operation failed',
      } as BatchResponse,
      { status: 500 }
    );
  }
}

/**
 * Get favorite images
 *
 * GET /api/images/batch?action=getFavorites
 */
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const userId = 2; // TODO: Replace with actual JWT verification
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'getFavorites') {
      // Get favorite images
      const images = await query<any>(
        `SELECT
          id, image_key, image_type, file_size, is_favorite,
          prompt, model, aspect_ratio, resolution,
          workflow_id, node_id, created_at
        FROM user_images
        WHERE user_id = ? AND is_favorite = TRUE
        ORDER BY created_at DESC`,
        [userId]
      );

      // Generate presigned URLs
      const client = createR2Client();
      const imagesWithUrls = await Promise.all(
        images.map(async (img: any) => {
          try {
            const presignedUrl = await getSignedUrl(
              client,
              new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: img.image_key,
              }),
              { expiresIn: 3600 }
            );

            return {
              id: img.id,
              imageKey: img.image_key,
              imageType: img.image_type,
              fileSize: img.file_size,
              isFavorite: img.is_favorite,
              prompt: img.prompt,
              model: img.model,
              aspectRatio: img.aspect_ratio,
              resolution: img.resolution,
              workflowId: img.workflow_id,
              nodeId: img.node_id,
              createdAt: img.created_at,
              presignedUrl,
            };
          } catch (err) {
            return {
              id: img.id,
              imageKey: img.image_key,
              imageType: img.image_type,
              isFavorite: img.is_favorite,
              createdAt: img.created_at,
            };
          }
        })
      );

      return NextResponse.json({
        success: true,
        images: imagesWithUrls,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error(`[R2:Batch:${requestId}] ✗ Get favorites failed:`, error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
