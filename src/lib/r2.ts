/**
 * Cloudflare R2 Storage Client
 *
 * Uses AWS SDK v3 (S3-compatible) for R2 operations.
 * All images are stored under: {userId}/{imageType}/{key}
 *
 * @see r2_findings.md for design decisions
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bananan';

// Image types for categorization
export enum ImageType {
  INPUT = 'input',           // User uploaded images
  GENERATION = 'generation', // AI generated images
  ANNOTATION = 'annotation', // Annotated images
  OUTPUT = 'output',         // Final workflow outputs
}

// Image metadata for database
export interface ImageMetadata {
  userId: number;
  imageKey: string;
  imageType: ImageType;
  fileSize: number;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  workflowId?: string;
  nodeId?: string;
}

/**
 * Validate R2 environment variables
 */
function validateR2Config(): void {
  if (!R2_ACCOUNT_ID) {
    throw new Error('R2_ACCOUNT_ID environment variable is not set');
  }
  if (!R2_ACCESS_KEY_ID) {
    throw new Error('R2_ACCESS_KEY_ID environment variable is not set');
  }
  if (!R2_SECRET_ACCESS_KEY) {
    throw new Error('R2_SECRET_ACCESS_KEY environment variable is not set');
  }
}

/**
 * Create and configure R2 S3 client
 */
export function createR2Client(): S3Client {
  validateR2Config();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Generate image storage key
 * Format: {userId}/{imageType}/{timestamp}-{random}.{ext}
 *
 * @example
 * generateImageKey(123, ImageType.GENERATION, 'png') // "123/generation/1704567890123-abc123.png"
 */
export function generateImageKey(userId: number, imageType: ImageType, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}/${imageType}/${timestamp}-${random}.${extension}`;
}

/**
 * Extract file extension from base64 data URL
 */
export function extractExtensionFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  return match ? match[1] : 'png';
}

/**
 * Extract file size from base64 data URL (in bytes)
 */
export function extractFileSizeFromDataUrl(dataUrl: string): number {
  const base64Data = dataUrl.split(',')[1] || '';
  return Math.floor(base64Data.length * 0.75);
}

/**
 * Upload image to R2
 *
 * @param client - R2 S3 client
 * @param key - Storage key (path)
 * @param dataUrl - Base64 data URL
 * @returns The storage key
 */
export async function uploadImageToR2(
  client: S3Client,
  key: string,
  dataUrl: string
): Promise<string> {
  // Extract base64 data
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) {
    throw new Error('Invalid data URL format');
  }

  // Convert to buffer
  const buffer = Buffer.from(base64Data, 'base64');

  // Detect content type
  const contentTypeMatch = dataUrl.match(/^data:([^;]+);/);
  const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/png';

  // Upload to R2
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);
  return key;
}

/**
 * Generate presigned URL for private image access
 * Valid for 1 hour by default
 *
 * @param client - R2 S3 client
 * @param key - Storage key
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 * @returns Presigned URL
 */
export async function getPresignedUrl(
  client: S3Client,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Delete image from R2
 *
 * @param client - R2 S3 client
 * @param key - Storage key
 */
export async function deleteImageFromR2(client: S3Client, key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  await client.send(command);
}

/**
 * List all images for a user
 *
 * @param client - R2 S3 client
 * @param userId - User ID
 * @returns Array of image keys
 */
export async function listUserImages(
  client: S3Client,
  userId: number
): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: `${userId}/`,
  });

  const response = await client.send(command);
  return (response.Contents || []).map(obj => obj.Key!);
}

/**
 * Test R2 connection
 *
 * @returns true if connection successful
 */
export async function testR2Connection(): Promise<boolean> {
  try {
    const client = createR2Client();
    await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      MaxKeys: 1,
    }));
    return true;
  } catch (error) {
    console.error('[R2] Connection test failed:', error);
    throw error;
  }
}

/**
 * Get public R2 URL (if bucket has public access)
 * Note: We use presigned URLs for private access
 */
export function getPublicR2Url(key: string): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;
}

/**
 * Get Cloudflare Images transformed URL (for thumbnails)
 * Requires: Public Access enabled on R2 bucket OR Custom Domain with Images enabled
 *
 * @param key - Image storage key
 * @param options - Transform options
 * @returns Transformed image URL
 */
export function getTransformedUrl(
  key: string,
  options: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'scale-down' | 'crop';
    quality?: number;
    format?: 'auto' | 'json' | 'webp' | 'jpeg' | 'png' | 'gif' | 'avif';
  } = {}
): string {
  const {
    width = 200,
    height = 200,
    fit = 'cover',
    quality = 80,
    format = 'auto',
  } = options;

  // Build Cloudflare Images transformation parameters
  const params = [];
  if (width) params.push(`width=${width}`);
  if (height) params.push(`height=${height}`);
  if (fit) params.push(`fit=${fit}`);
  if (quality) params.push(`quality=${quality}`);
  if (format) params.push(`format=${format}`);

  const transformPath = params.join(',');

  // Use public URL with Cloudflare Images transformation
  // Format: https://<account-id>.r2.cloudflarestorage.com/cdn-cgi/image/<options>/<bucket>/<key>
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/cdn-cgi/image/${transformPath}/${R2_BUCKET_NAME}/${key}`;
}

/**
 * Get both thumbnail and original URLs for an image
 *
 * @param key - Image storage key
 * @param usePresigned - Whether to use presigned URL for original (for private access)
 * @returns Object with thumbnail and original URL getters
 */
export function getImageUrls(key: string, usePresigned: boolean = true) {
  return {
    // Thumbnail: Use Cloudflare Images transformation (fast, cached)
    thumbnail: getTransformedUrl(key, { width: 200, height: 200, fit: 'cover' }),

    // Medium: Use Cloudflare Images transformation
    medium: getTransformedUrl(key, { width: 800, height: 800, fit: 'contain' }),

    // Original: Use presigned URL for private access or public URL
    original: usePresigned ? '' : getPublicR2Url(key),
  };
}
