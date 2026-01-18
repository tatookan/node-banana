/**
 * List User Images API
 *
 * GET /api/images?page=1&limit=20&type=generation
 *
 * Returns paginated list of user's images from R2 with metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createR2Client, getTransformedUrl } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';

interface ListResponse {
  success: boolean;
  images?: ImageInfo[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
}

interface ImageInfo {
  id: number;
  imageKey: string;
  imageType: string;
  fileSize: number;
  isFavorite: boolean;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  workflowId?: string;
  nodeId?: string;
  createdAt: string;
  thumbnailUrl?: string;  // Cloudflare Images transformed URL
  presignedUrl?: string;  // Original image presigned URL (for preview)
}

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Get user ID from JWT (simplified - use your actual auth)
    const userId = 2; // TODO: Replace with actual JWT verification

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type'); // Filter by image type
    const offset = (page - 1) * limit;
    const includeUrls = searchParams.get('urls') !== 'false'; // Generate presigned URLs by default

    console.log(`[R2:List:${requestId}] Listing images for user ${userId}, page ${page}...`);

    // Build query conditions
    const conditions = ['user_id = ?'];
    const params: any[] = [userId];

    if (type && ['input', 'generation', 'annotation', 'output'].includes(type)) {
      conditions.push('image_type = ?');
      params.push(type);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await query<any>(
      `SELECT COUNT(*) as total FROM user_images WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Get paginated images - ensure limit and offset are integers for prepared statement
    const images = await query<any>(
      `SELECT
        id, image_key, image_type, file_size, is_favorite,
        prompt, model, aspect_ratio, resolution,
        workflow_id, node_id, created_at
      FROM user_images
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit.toString())} OFFSET ${parseInt(offset.toString())}`,
      params
    );

    // Generate presigned URLs if requested
    let imagesWithUrls: ImageInfo[] = images;

    if (includeUrls && images.length > 0) {
      const client = createR2Client();

      imagesWithUrls = await Promise.all(
        images.map(async (img: any) => {
          try {
            // Generate presigned URL for original image (for preview)
            const presignedUrl = await getSignedUrl(
              client,
              new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: img.image_key,
              }),
              { expiresIn: 3600 }
            );

            // Note: Cloudflare Images transformation requires public access on R2 bucket
            // For now, use presigned URL for both thumbnail and preview
            // To enable faster thumbnails, enable public access on R2 bucket
            const thumbnailUrl = presignedUrl;

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
              thumbnailUrl,    // Presigned URL (CSS will scale for list view)
              presignedUrl,    // Same URL for preview modal
            };
          } catch (err) {
            console.error(`[R2:List:${requestId}] Failed to generate URL for ${img.image_key}:`, err);
            return {
              id: img.id,
              imageKey: img.image_key,
              imageType: img.image_type,
              fileSize: img.file_size,
              isFavorite: img.is_favorite,
              createdAt: img.created_at,
            };
          }
        })
      );
    } else {
      imagesWithUrls = images.map((img: any) => ({
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
      }));
    }

    console.log(`[R2:List:${requestId}] ✓ Found ${imagesWithUrls.length} images (total: ${total})`);

    return NextResponse.json({
      success: true,
      images: imagesWithUrls,
      total,
      page,
      limit,
    } as ListResponse);

  } catch (error: any) {
    console.error(`[R2:List:${requestId}] ✗ List failed:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to list images',
      } as ListResponse,
      { status: 500 }
    );
  }
}
