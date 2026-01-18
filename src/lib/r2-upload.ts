/**
 * R2 Upload Helper for Generated Images
 *
 * Provides functions to automatically upload generated images to R2
 * and return image references for use in workflows.
 */

import { createR2Client, uploadImageToR2, generateImageKey, extractExtensionFromDataUrl, extractFileSizeFromDataUrl, ImageType } from '@/lib/r2';
import { execute } from '@/lib/db';

export interface UploadResult {
  success: boolean;
  imageKey?: string;
  imageRef?: string;
  error?: string;
}

/**
 * Upload a generated image to R2 with metadata
 *
 * This function is designed to be called after image generation.
 * It can be awaited or run in the background (fire-and-forget).
 *
 * @param userId - User ID from JWT
 * @param imageDataUrl - Base64 data URL of the generated image
 * @param metadata - Generation metadata (prompt, model, etc.)
 * @returns Upload result with image key for referencing
 */
export async function uploadGeneratedImage(
  userId: number,
  imageDataUrl: string,
  metadata: {
    prompt: string;
    model: string;
    aspectRatio?: string;
    resolution?: string;
    workflowId?: string;
    nodeId?: string;
  }
): Promise<UploadResult> {
  const requestId = Math.random().toString(36).substring(7);

  try {
    console.log(`[R2:AutoUpload:${requestId}] Uploading generated image for user ${userId}...`);

    // Extract image info
    const extension = extractExtensionFromDataUrl(imageDataUrl);
    const fileSize = extractFileSizeFromDataUrl(imageDataUrl);

    // Generate storage key
    const imageKey = generateImageKey(userId, ImageType.GENERATION, extension);

    // Upload to R2
    const client = createR2Client();
    await uploadImageToR2(client, imageKey, imageDataUrl);

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
        ImageType.GENERATION,
        fileSize,
        metadata.prompt || null,
        metadata.model || null,
        metadata.aspectRatio || null,
        metadata.resolution || null,
        metadata.workflowId || null,
        metadata.nodeId || null,
      ]
    );

    console.log(`[R2:AutoUpload:${requestId}] ✓ Upload successful: ${imageKey}`);

    return {
      success: true,
      imageKey,
      imageRef: `r2:${imageKey}`, // Prefix to indicate R2 storage
    };

  } catch (error: any) {
    console.error(`[R2:AutoUpload:${requestId}] ✗ Upload failed:`, error);

    return {
      success: false,
      error: error.message || 'Failed to upload to R2',
    };
  }
}

/**
 * Upload an image in the background (fire-and-forget)
 *
 * Use this when you want to upload asynchronously without blocking the response.
 * Errors are logged but not thrown.
 *
 * @param userId - User ID from JWT
 * @param imageDataUrl - Base64 data URL
 * @param metadata - Generation metadata
 */
export function uploadGeneratedImageInBackground(
  userId: number,
  imageDataUrl: string,
  metadata: {
    prompt: string;
    model: string;
    aspectRatio?: string;
    resolution?: string;
    workflowId?: string;
    nodeId?: string;
  }
): void {
  // Run upload in background without awaiting
  uploadGeneratedImage(userId, imageDataUrl, metadata).catch(error => {
    console.error('[R2:BackgroundUpload] Background upload failed:', error);
  });
}

/**
 * Convert an imageRef to a presigned URL
 *
 * @param imageRef - Image reference (e.g., "r2:123/generation/xxx.png")
 * @returns Presigned URL or null if not an R2 reference
 */
export async function resolveImageRef(imageRef: string): Promise<string | null> {
  if (!imageRef.startsWith('r2:')) {
    // Not an R2 reference (might be base64 or local)
    return null;
  }

  const imageKey = imageRef.substring(3); // Remove "r2:" prefix

  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');

    const client = createR2Client();
    const presignedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: imageKey,
      }),
      { expiresIn: 3600 }
    );

    return presignedUrl;
  } catch (error) {
    console.error('[R2:ResolveRef] Failed to resolve image reference:', error);
    return null;
  }
}

/**
 * Batch upload multiple images
 *
 * @param userId - User ID
 * @param imageDataUrls - Array of base64 data URLs
 * @param metadata - Metadata to apply to all images
 * @returns Array of upload results
 */
export async function uploadGeneratedImagesBatch(
  userId: number,
  imageDataUrls: string[],
  metadata: {
    prompt: string;
    model: string;
    aspectRatio?: string;
    resolution?: string;
    workflowId?: string;
    nodeId?: string;
  }
): Promise<UploadResult[]> {
  const results = await Promise.allSettled(
    imageDataUrls.map(dataUrl =>
      uploadGeneratedImage(userId, dataUrl, metadata)
    )
  );

  return results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        success: false,
        error: result.reason?.message || 'Upload failed',
      };
    }
  });
}
