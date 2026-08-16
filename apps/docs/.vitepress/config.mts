import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitepress';
import { CANONICAL_DOCS_DOMAIN, VERIFICATION_POSTURE } from './site';

/**
 * CSP hardening (Web3Intel binding ruling, 2026-08-17): the deployed site
 * must satisfy `script-src 'self'`. VitePress emits three small inline
 * scripts per page (dark-mode check, macOS check, SPA hash map). This
 * build-only pass extracts every inline script into a SELF-HOSTED asset and
 * rewrites the HTML to reference it, so the strict CSP in
 * apps/docs/vercel.json holds without 'unsafe-inline' for scripts.
 * It only moves bytes — no third-party code is introduced.
 *
 * NOTE: never give home-page `features:` a named string `icon` — the default
 * theme would fetch it from an external icon API. Use inline SVG objects only
 * (CSP `img-src` blocks it anyway, but do not rely on that).
 */
function externalizeInlineScripts(outDir: string): void {
  const htmlFiles: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith('.html')) htmlFiles.push(full);
    }
  }

  const written = new Map<string, number>();
  walk(outDir);

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    let changed = false;
    const next = html.replace(
      /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g,
      (match, attrs: string, code: string) => {
        if (!code.trim()) return match;
        const digest = createHash('sha256')
          .update(code)
          .digest('base64url')
          .slice(0, 16);
        const fileName = `assets/inline-${digest}.js`;
        const target = resolve(outDir, fileName);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, code);
        written.set(fileName, (written.get(fileName) ?? 0) + 1);
        changed = true;
        const keep = attrs.trim();
        return `<script${keep ? ` ${keep}` : ''} src="/${fileName}"></script>`;
      },
    );
    if (changed) writeFileSync(file, next);
  }

  const total = [...written.values()].reduce((a, b) => a + b, 0);
  console.log(
    `[csp] externalized ${total} inline script tag(s) into ${written.size} ` +
      `self-hosted asset(s) across ${htmlFiles.length} page(s)`,
  );
}

/**
 * Kryptr user documentation — VitePress config.
 *
 * BINDING (Web3Intel, 2026-08-17):
 * - NO third-party scripts, NO analytics, NO external search — ever.
 *   Search is the built-in LOCAL provider (self-hosted, zero network).
 * - The only client JS shipped is VitePress' own self-hosted bundle
 *   (inline boot scripts externalized by the pass above).
 * - Deploy headers (strict CSP + HSTS) live in apps/docs/vercel.json.
 * - The official docs domain is pinned in ./site.ts (anti-phishing).
 */
export default defineConfig({
  title: 'Kryptr Docs',
  titleTemplate: ':title · Kryptr Docs',
  description:
    'User documentation for Kryptr — security-gated finance for autonomous agents on Base and Robinhood Chain.',
  lang: 'en-US',

  // Stable, explicit .html URLs for deep links (FaceUI `VITE_DOCS_URL`,
  // fail-closed). Do not switch to cleanUrls — links must stay stable.
  cleanUrls: false,

  buildEnd(siteConfig) {
    externalizeInlineScripts(siteConfig.outDir);
  },

  themeConfig: {
    nav: [
      { text: 'Getting started', link: '/getting-started/' },
      {
        text: 'Core concepts',
        link: '/core-concepts/wallet-and-security',
      },
      { text: 'Features', link: '/features/balances-and-history' },
      { text: 'Honest edges', link: '/honest-edges/limitations' },
      { text: "What's live today", link: '/whats-live' },
    ],

    sidebar: [
      {
        text: 'Getting started',
        items: [{ text: 'What is Kryptr', link: '/getting-started/' }],
      },
      {
        text: 'Core concepts',
        items: [
          {
            text: 'Wallet & security model',
            link: '/core-concepts/wallet-and-security',
          },
          { text: 'Fee transparency', link: '/core-concepts/fee-transparency' },
        ],
      },
      {
        text: 'Features',
        items: [
          {
            text: 'Balances & history',
            link: '/features/balances-and-history',
          },
          { text: 'Swaps & quotes', link: '/features/swaps-and-quotes' },
          {
            text: 'Orders & kill switch',
            link: '/features/orders-and-kill-switch',
          },
          { text: 'Launchpad consent', link: '/features/launchpad-consent' },
        ],
      },
      {
        text: 'Honest edges',
        items: [
          { text: 'Limitations by phase', link: '/honest-edges/limitations' },
          { text: 'FAQ', link: '/honest-edges/faq' },
          { text: 'Glossary', link: '/honest-edges/glossary' },
        ],
      },
      { text: "What's live today", link: '/whats-live' },
    ],

    // Local/self-hosted search ONLY (binding). Never swap this for a
    // third-party search provider — that would add an external script.
    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
      label: 'On this page',
    },

    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },

    lastUpdated: {
      text: 'Last updated',
    },

    footer: {
      message: `${CANONICAL_DOCS_DOMAIN} is the official Kryptr documentation domain. ${VERIFICATION_POSTURE}`,
      copyright:
        'Kryptr — phase-honest documentation. Security claims on this site are traceable to the Kryptr research corpus.',
    },
  },
});
