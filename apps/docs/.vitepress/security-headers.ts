/**
 * SINGLE SOURCE OF TRUTH for the deploy security headers of the Kryptr docs
 * site (Web3Intel binding ruling, 2026-08-17: strict CSP, no third-party
 * scripts ever). Edit ONLY this object.
 *
 * Consumers:
 * - Cloudflare Pages: the VitePress build emits `dist/_headers` from this
 *   object (`writeCloudflareHeaders` in config.mts). Cloudflare does not
 *   read vercel.json, so the build output must carry the headers itself.
 * - Vercel: the committed apps/docs/vercel.json (used until the Cloudflare
 *   migration completes). The build FAILS when vercel.json drifts from this
 *   object (`checkVercelHeadersDrift` in config.mts).
 *
 * The build externalizes VitePress' inline boot scripts (config.mts
 * buildEnd), so `script-src 'self'` holds without 'unsafe-inline'.
 * `style-src` keeps 'unsafe-inline' only because Vue applies some element
 * style attributes at runtime; scripts are the protected surface.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
};
