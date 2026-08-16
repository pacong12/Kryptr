# Launchpad Decision — Team Vote (Option 3)

Status: **GO — approved as Wave 5**, start after Wave 4 closes.
Mandate: the user delegated the go/no-go decision to the team (2026-08-16).

## Vote: 5/5 GO

| Agent     | Vote | Strongest reason (domain)                                                                                                                                                                                       |
| --------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VaultAPI  | GO   | Marginal architecture load ~zero: `kind='deploy'` already first-class, deploy→HITL already merged; fee split frozen on-chain keeps the API out of the fee path entirely                                         |
| OpsCI     | GO   | CI plan is purely incremental: contracts/ as an Nx project, Slither required-gate, label-gated fork tests on the nightly pattern; disjoint from the wave-4 redis surface                                        |
| DeckUI    | GO   | HITL/audit surface is almost entirely REUSE (intent review, decision timeline, kill-switch audit pattern); additive UI only, no new controls                                                                    |
| FaceUI    | GO   | Consent is the product: the gate's unconditional HITL IS the launch consent screen (fee preview, permanence acknowledgment); inherits waves 1–4 degradation discipline                                          |
| Web3Intel | GO   | Option A eliminates (not just mitigates) the three vectors behind the worst agent-platform incidents: frozen fees + API outside fee path, unconditional HITL deploy, immutable clones with no upgrade authority |

## Binding conditions (accepted as wave-5 entry gates)

1. **T21 pre-deploy gate (Web3Intel, FaceUI)** — the factory + template MUST pass
   the full verification battery BEFORE the factory address goes live on mainnet:
   fee-split math + bond accounting invariant tests, clean Slither, fork tests,
   and on-chain proof that deploys are admin-key-free / non-upgradeable.
   The consent UI may only render what this verification artifact proves.
   After live, the only "patch" is a new factory address + allowlist migration —
   deliberately expensive.
2. **CI from the first contracts PR (OpsCI)** — Slither triage baseline +
   label-gated fork tests exist from PR #1 of contracts/, never retrofitted;
   the master implementation passes audit-grade review + fork tests before the
   first clone deploy.
3. **Automation firewall (VaultAPI)** — STRUCTURAL prohibition (not config):
   the order worker / automation origins can never produce `kind='deploy'`
   intents; deploys remain interactive-only + HITL forever. Factory allowlist
   pinned from the ops deploy manifest as the single source of truth
   (schema-validated in CI).
4. **Contract freeze first (DeckUI)** — a `DeployContext` type (mirroring
   SwapContext) is frozen in shared-types via a prep PR BEFORE any UI build:
   name/symbol/supply, TokenFeeSchedule + recipients, chain, deploying wallet,
   bond-paid status.
5. **Sequencing** — Wave 4 closes first (stage-B worker merged); the vault
   deploy-HITL branch lands before the factory work (launchpad memo §3 ruling 3).

## Scope anchors (unchanged from the discussion memo)

EIP-1167 immutable clones; fee splits constructor-frozen on-chain; API never
in the fee path; deploy→HITL unconditional; two-layer rate limiting
(per-origin API + on-chain bond); Base-first (Robinhood Chain shown-but-disabled);
threat slots T17–T21 apply.
