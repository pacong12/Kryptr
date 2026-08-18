// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the workspace packages (TS source) into the app bundle so the
  // Vercel build never depends on their nx-built dist output.
  transpilePackages: ['@kryptr/shared-ui', '@kryptr/shared-types'],
  
  // Security Headers Configuration (Wave 7-M7)
  // These are applied via middleware.ts for runtime flexibility
  async headers() {
    return [
      {
        source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.kryptr.test; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests",
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
