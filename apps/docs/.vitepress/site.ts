/**
 * Anti-phishing pin (Web3Intel binding ruling, 2026-08-17).
 *
 * This constant is the SINGLE SOURCE OF TRUTH for the official Kryptr docs
 * domain. It must match:
 *
 * - the frontoffice deep-link base (`VITE_DOCS_URL`, fail-closed: docs links
 *   are hidden, never guessed, when the env is absent or mismatched),
 * - every docs link rendered by the backoffice,
 * - `/llms.txt`, generated at build time from .vitepress/llms.template.txt
 *   (the template must never hardcode a docs domain),
 * - the footer of this site.
 *
 * OpsCI confirms the final `docs.*` domain before the first deploy and
 * updates it HERE — nowhere else. Do not hardcode docs URLs in apps.
 */
export const CANONICAL_DOCS_DOMAIN = 'docs.robinmood.xyz'; // interim domain provided by the user (verified & attached to the Vercel project `kryptr-docs`); replace here — and only here — when the final domain lands

export const CANONICAL_DOCS_URL = `https://${CANONICAL_DOCS_DOMAIN}`;

/**
 * Verification posture shown to users: consent and verification always happen
 * INSIDE the Kryptr app (consent screen, launch-detail, footer) — never via a
 * link a user is asked to trust blindly.
 */
export const VERIFICATION_POSTURE =
  'Always verify inside the Kryptr app — consent screens, launch detail, and the app footer are the sources of truth.';
