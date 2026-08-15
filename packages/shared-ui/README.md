# @kryptr/shared-ui

Framework UI primitives shared across Kryptr apps. Clean architecture rule:
**apps compose, this package provides** — no app-local copies of shadcn
components, no hand-rolled native controls.

## Layout

```
src/
├── react/                  # consumed by apps/backoffice (Next.js)
│   ├── components/ui/*.tsx # shadcn/ui (radix-nova style)
│   └── lib/utils.ts        # cn() helper
└── vue/                    # consumed by apps/frontoffice (Vue 3 + Vite)
    ├── components/ui/*/    # shadcn-vue (reka-nova style), dir per component
    └── lib/utils.ts        # cn() helper
```

## Imports

```ts
// backoffice (React)
import { Button } from '@kryptr/shared-ui/react/button';
import { cn } from '@kryptr/shared-ui/react/lib/utils';

// frontoffice (Vue)
import { Button } from '@kryptr/shared-ui/vue/button';
import { cn } from '@kryptr/shared-ui/vue/lib/utils';
```

Resolution flows through the `exports` map in `package.json`; each app also
mirrors the mapping in its tsconfig `paths` (used by the shadcn CLIs and as
a typecheck fallback). Next.js compiles this package via
`transpilePackages`; Vite treats the linked package as source.

## Adding a component

Run the CLI from the owning app — aliases in each app's `components.json`
already point into this package:

```bash
# backoffice (React): uses `shadcn`
cd apps/backoffice && npx shadcn@latest add <component>

# frontoffice (Vue): uses `shadcn-vue` (NOT the react `shadcn` CLI —
# it cannot detect Vue and would generate .tsx files)
cd apps/frontoffice && npx shadcn-vue@latest add <component>
```

If a CLI ever writes into the app instead of this package, move the files
here and fix imports manually.

## Rules inside this package

1. Internal imports are **relative** (`../../lib/utils`, `../button`) —
   never `@/…` or self-referencing `@kryptr/shared-ui/…`.
2. No app logic, no data fetching, no i18n strings — presentation only.
3. Peer/runtime libraries (radix-ui, reka-ui, lucide-*, sonner,
   vue-sonner, …) are declared by the consuming apps; keep this package's
   own deps limited to styling helpers (clsx, tailwind-merge, cva).
4. Any change here affects both apps — run
   `npx nx run-many -t typecheck test build` before opening a PR.
