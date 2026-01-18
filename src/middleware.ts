import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/verify',
  '/api/auth/me',
  '/api/r2/test', // R2 connection test endpoint (for debugging)
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Get token from cookie
  const token = request.cookies.get('auth_token')?.value;

  console.log('[Middleware] Path:', pathname, 'Token:', token ? 'exists' : 'none');

  if (!token) {
    console.log('[Middleware] No token, redirecting to login');
    // API routes return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '未授权，请先登录' },
        { status: 401 }
      );
    }
    // Page routes redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token exists - let the request through
  // Actual JWT verification happens in API routes (Node.js runtime)
  console.log('[Middleware] Token exists, allowing request');
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
