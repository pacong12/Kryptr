import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from 'vitepress';
import {
  CANONICAL_DOCS_DOMAIN,
  CANONICAL_DOCS_URL,
  VERIFICATION_POSTURE,
} from './site';

/**
 * Fail-closed domain pin guard. The anti-phishing pin in ./site.ts is the
 * single source of truth for the docs domain; an empty or implausible pin
 * must never reach a built artifact (llms.txt links, footer). The build
 * fails instead of guessing — deliberately NO localhost fallback: this site
 * only ships under the pinned official domain (OpsCI confirms it before the
 * first deploy).
 */
const DOMAIN_PIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
if (!DOMAIN_PIN_PATTERN.test(CANONICAL_DOCS_DOMAIN)) {
  throw new Error(
    `CANONICAL_DOCS_DOMAIN is empty or invalid (${JSON.stringify(
      CANONICAL_DOCS_DOMAIN,
    )}) — fix the pin in apps/docs/.vitepress/site.ts; refusing to build ` +
      `with an unpinned docs domain.`,
  );
}
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
 * Generate `/llms.txt` (AI-agent summary of the docs, bankr-docs pattern)
 * at build time from the pinned official domain in ./site.ts — the
 * anti-phishing pin stays the SINGLE source of truth for the docs domain.
 * The template lives at .vitepress/llms.template.txt and must never contain
 * a hardcoded docs domain.
 */
function writeLlmsTxt(outDir: string, templatePath: string): void {
  const rendered = readFileSync(templatePath, 'utf8')
    .replaceAll('{{DOCS_URL}}', CANONICAL_DOCS_URL)
    .replaceAll('{{DOCS_DOMAIN}}', CANONICAL_DOCS_DOMAIN);
  writeFileSync(join(outDir, 'llms.txt'), rendered, 'utf8');
  console.log(
    `[llms] wrote llms.txt from template (domain pin: ${CANONICAL_DOCS_DOMAIN})`,
  );
}

/** First YAML front-matter `status:` of a page, or null when absent. */
function extractFrontMatterStatus(source: string): string | null {
  const block = source.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!block) return null;
  const status = block[0].match(/^status:\s*(live|preview|planned)\s*$/m);
  return status ? (status[1] as string) : null;
}

/** All markdown content pages under srcDir, relative POSIX paths. */
function walkMarkdown(root: string): string[] {
  const found: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (entry.endsWith('.md')) found.push(abs.slice(root.length + 1));
    }
  }
  walk(root);
  return found;
}

/**
 * Build-time cross-check (single manifest = single source of truth): every
 * manifest entry must match its page's front-matter `status`, and every
 * markdown content page must appear in the manifest. Any mismatch fails the
 * build, so CI rejects status drift instead of publishing it.
 */
function checkStatusManifest(srcDir: string): void {
  const manifest = JSON.parse(
    readFileSync(join(srcDir, 'status-manifest.json'), 'utf8'),
  ) as { pages: { path: string; status: string }[] };
  const errors: string[] = [];

  const manifestByFile = new Map<string, string>();
  for (const page of manifest.pages) {
    const file =
      page.path === '/'
        ? 'index.md'
        : page.path.endsWith('/')
          ? `${page.path.slice(1)}index.md`
          : page.path.slice(1).replace(/\.html$/, '.md');
    manifestByFile.set(file, page.status);
  }

  for (const [file, status] of manifestByFile) {
    const abs = join(srcDir, file);
    if (!existsSync(abs)) {
      errors.push(`manifest entry has no page file: ${file}`);
      continue;
    }
    const frontStatus = extractFrontMatterStatus(readFileSync(abs, 'utf8'));
    if (frontStatus === null) {
      errors.push(`${file}: missing \`status\` front matter`);
    } else if (frontStatus !== status) {
      errors.push(
        `${file}: front matter \`${frontStatus}\` != manifest \`${status}\``,
      );
    }
  }

  for (const file of walkMarkdown(srcDir)) {
    if (!manifestByFile.has(file)) {
      errors.push(`${file}: missing from status-manifest.json`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `status-manifest cross-check failed:\n- ${errors.join('\n- ')}`,
    );
  }
  console.log(
    `[manifest] cross-checked ${manifestByFile.size} page(s) against front matter`,
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
    writeLlmsTxt(
      siteConfig.outDir,
      resolve(siteConfig.srcDir, '.vitepress/llms.template.txt'),
    );
    checkStatusManifest(siteConfig.srcDir);
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
