import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login'];
// Paths that are API routes (handled separately)
const API_PATHS = ['/api/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes to pass through (they do their own auth)
  if (API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Check for Firebase auth session cookie
  // We use a simple check: if __session cookie exists, allow through.
  // The actual auth validation happens in each page/layout via useAuth().
  // For server-side protection we rely on the session cookie set by Firebase.
  const sessionCookie = request.cookies.get('__session')?.value;
  const firebaseAuthCookie = request.cookies.get('firebase-auth-token')?.value;

  if (!sessionCookie && !firebaseAuthCookie) {
    // No session – redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
