/**
 * Security Headers Middleware for Backoffice (Wave 7-M7)
 * Implements strict CSP, X-Frame-Options, and other security headers
 * Pattern aligned with User Docs security-headers.ts implementation
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BACKOFFICE_CSP_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.kryptr.test; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Apply all security headers
  Object.entries(BACKOFFICE_CSP_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/ (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api_|_next/static|_next/image|favicon.ico).*)',
  ],
};
