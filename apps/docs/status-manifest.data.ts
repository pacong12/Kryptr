import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * VitePress data loader: reads the single status manifest
 * (status-manifest.json) at build time so the "What's live today" page can
 * never drift from the manifest.
 */

export type PageStatus = 'live' | 'preview' | 'planned';

export interface ManifestPage {
  path: string;
  title: string;
  status: PageStatus;
  summary: string;
}

export interface StatusManifest {
  _meta: {
    purpose: string;
    statuses: Record<PageStatus, string>;
    globalPhase: string;
  };
  pages: ManifestPage[];
}

export default {
  load(): StatusManifest {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(resolve(here, 'status-manifest.json'), 'utf8');
    return JSON.parse(raw) as StatusManifest;
  },
};
