# Docs deploy — Vercel operations notes

This file carries the operational context that previously lived in a
`$comment` key inside `vercel.json` (rejected by Vercel's schema
verification — `vercel.json` accepts no additional properties).

## Deployment shape

- Deploy the docs site as a **SEPARATE Vercel project** (`kryptr-docs`),
  never as a route of the backoffice/frontoffice projects.
- Root directory: `apps/docs` (standalone `package.json`; VitePress).
- The production domain is pinned in `apps/docs/.vitepress/site.ts`
  (`CANONICAL_DOCS_DOMAIN`). The build fails closed when the pin is
  empty/invalid — there is no localhost fallback by design.

## Security ruling (Web3Intel, 2026-08-17 — binding)

- Strict CSP, **no third-party scripts ever**, no analytics.
- The build externalizes VitePress' inline boot scripts (see
  `config.mts` `buildEnd`), so `script-src 'self'` holds without
  `'unsafe-inline'`.
- `style-src` keeps `'unsafe-inline'` only because Vue applies some
  element style attributes at runtime; scripts are the protected
  surface.
- Headers in `vercel.json` apply to every route: CSP, HSTS (preload),
  `nosniff`, `no-referrer`, locked-down Permissions-Policy, and
  `X-Frame-Options: DENY`.
