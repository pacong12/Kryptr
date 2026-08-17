---
status: live
title: "What's live today"
---

# What's live today

<StatusBanner />

This page is rendered from the site's single status manifest
(`apps/docs/status-manifest.json`) at build time, so it cannot drift from the
per-page banners.

**Global phase boundary (Wave 6):** S1-S3 complete; Tier D postponed pending decision. Factory remains DARK until Tier D PASS + soak completion. No mainnet deployment ETA announced.
**Phase 1 boundary:** Signing is dry-run only — nothing is broadcast on-chain yet. Every feature below inherits that boundary.

<script setup>
import { data as manifest } from './status-manifest.data';

const groups = ['live', 'preview', 'planned'].map((status) => ({
  status,
  label: manifest._meta.statuses[status],
  pages: manifest.pages.filter((page) => page.status === status),
}));

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
</script>

<div v-for="group in groups" :key="group.status">
  <h2 :id="group.status" tabindex="-1">{{ capitalize(group.status) }}</h2>
  <p><em>{{ group.label }}</em></p>
  <table>
    <thead>
      <tr>
        <th>Page</th>
        <th>What it covers</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="page in group.pages" :key="page.path">
        <td><a :href="page.path">{{ page.title }}</a></td>
        <td>{{ page.summary }}</td>
      </tr>
    </tbody>
  </table>
</div>

## Status vocabulary (frozen)

- **live** — available in Kryptr today, within the phase boundaries stated on
  the page.
- **preview** — built and visible in the app, but not fully enabled yet; it
  degrades fail-closed.
- **planned** — designed and contract-frozen, but not available yet.
