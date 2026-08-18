---
name: kryptr-clean-architecture
description: 'Kryptr layering rules for NestJS api, Vue frontoffice, Next backoffice. USE WHEN: creating modules/services/components, reviewing where code belongs, or refactoring toward testability.'
---

# Kryptr Clean Architecture

Dependency rule: **outer layers depend inward, never the reverse.**

## apps/api (NestJS) — layer per module

```
apps/api/src/<module>/
├── domain/          # entities, value objects, errors. NO imports from
│                    # @nestjs/*, no I/O, no decorators. Pure TS.
├── application/     # use cases / services. Depend on domain + port
│                    # interfaces only.
├── infrastructure/  # port implementations: repositories (Prisma), chain
│                    # clients (viem), queues (BullMQ), external APIs.
└── <module>.module.ts   # composition root: wires infra into application
```

Rules:
1. Domain never imports application/infrastructure.
2. Application defines ports (interfaces); infrastructure implements them.
3. Controllers are thin: validate input (DTO + class-validator), call one
   use case, return `ApiEnvelope` via `ok()/err()` from `@kryptr/shared-types`.
4. All cross-app shapes live in `@kryptr/shared-types` — never redeclare.
5. Security gate (`SecurityPolicy` check) is mandatory before any intent
   reaches signing. No controller may bypass it.
6. Unit tests per use case (mock ports); infra tested separately.

## apps/frontoffice (Vue 3)

```
src/
├── components/ui/   # shadcn-vue primitives — no business logic
├── components/      # feature components, props-in/emits-out
├── composables/     # state + API calls (fetch via libs/api-client)
├── pages or views/  # route screens, compose components
└── lib/             # api client, formatters, chain utils
```

Rules: components never fetch directly; composables own data flow.
Use shadcn-vue primitives; never style raw HTML elements for UI controls.

## apps/backoffice (Next.js)

```
src/app/             # routes (app router)
src/components/ui/   # shadcn/ui primitives
src/components/      # feature components (server components by default)
src/lib/             # api client, auth helpers, formatters
```

Rules: server components fetch; client components handle interaction.
Same "no native controls" rule: shadcn/ui primitives only.

## Shared contracts

- `@kryptr/shared-types` is the single source of truth for domain shapes.
- API responses always use `ApiEnvelope<T>`.
- Agents/automation produce `TransactionIntent` objects — NEVER raw
  transactions. Execution is a separate gated step.
