import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  // Clear the auth cookie properly by setting expires to past date
  // Using both maxAge: 0 and expires: new Date(0) for maximum compatibility
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0), // Set to epoch (Jan 1, 1970) to ensure deletion
    path: '/',
  });

  return response;
}
