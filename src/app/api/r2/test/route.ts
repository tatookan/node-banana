/**
 * R2 Connection Test API
 *
 * POST /api/r2/test
 *
 * Tests the R2 storage connection and configuration.
 * Requires: R2 credentials in .env.local
 *
 * Note: This endpoint bypasses authentication for testing purposes only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createR2Client, testR2Connection } from '@/lib/r2';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[R2:Test:${requestId}] Testing R2 connection...`);

  try {
    // Check environment variables (without exposing secrets)
    const config = {
      hasAccountId: !!process.env.R2_ACCOUNT_ID,
      hasAccessKeyId: !!process.env.R2_ACCESS_KEY_ID,
      hasSecretAccessKey: !!process.env.R2_SECRET_ACCESS_KEY,
      bucketName: process.env.R2_BUCKET_NAME || 'bananan',
    };

    console.log(`[R2:Test:${requestId}] Config check:`, config);

    // Validate all required environment variables are set
    if (!config.hasAccountId || !config.hasAccessKeyId || !config.hasSecretAccessKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing R2 credentials',
          config: {
            ...config,
            accountId: config.hasAccountId ? process.env.R2_ACCOUNT_ID : undefined,
          },
        },
        { status: 500 }
      );
    }

    // Create client and test connection
    console.log(`[R2:Test:${requestId}] Creating R2 client...`);
    const client = createR2Client();

    console.log(`[R2:Test:${requestId}] Testing connection to bucket ${config.bucketName}...`);
    const isConnected = await testR2Connection();

    if (isConnected) {
      console.log(`[R2:Test:${requestId}] ✓ Connection successful!`);
      return NextResponse.json({
        success: true,
        message: 'R2 connection test successful',
        config: {
          accountId: process.env.R2_ACCOUNT_ID,
          bucketName: config.bucketName,
        },
      });
    } else {
      throw new Error('Connection test failed');
    }
  } catch (error: any) {
    console.error(`[R2:Test:${requestId}] ✗ Connection failed:`, error);

    // Provide helpful error messages
    let errorMessage = 'Failed to connect to R2';
    let errorDetails = error.message;

    if (error.message?.includes('InvalidAccessKeyId')) {
      errorMessage = 'Invalid R2 Access Key ID';
      errorDetails = 'Please check R2_ACCESS_KEY_ID in .env.local';
    } else if (error.message?.includes('SignatureDoesNotMatch')) {
      errorMessage = 'Invalid R2 Secret Access Key';
      errorDetails = 'Please check R2_SECRET_ACCESS_KEY in .env.local';
    } else if (error.message?.includes('NoSuchBucket')) {
      errorMessage = 'R2 bucket not found';
      errorDetails = `Bucket "${process.env.R2_BUCKET_NAME}" does not exist. Please create it in Cloudflare R2 console.`;
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot reach R2 endpoint';
      errorDetails = 'Please check R2_ACCOUNT_ID and network connection';
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: errorDetails,
        originalError: error.message,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for easy browser testing
export async function GET(request: NextRequest) {
  return POST(request);
}
