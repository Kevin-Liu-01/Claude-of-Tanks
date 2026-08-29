# 0262 — Combat intelligence has a strict TypeScript owner

Status: accepted

## Decision

`src/ui/shotInfo.ts` owns the resolved-hit cards, incoming-fire alerts,
collapsible combat log, armor mini-diagrams, event-derived battle ledger, and
the killcam-aware handoff to `endScreen.ts`.

The port defines explicit contracts for shell hits, spotting, destroyed tanks,
the authoritative end roster, per-target and per-shell totals, team inference,
schematic resources, report timers, and the public HUD runtime. It preserves
the existing markup, CSS, event sums, schematic bake cadence, and report gate.
It does not recalculate penetration, damage, spotting, or match results.

## Consequences

- Nullable network identities and optional legacy event metadata are handled
  at the event-bus boundary instead of leaking into report construction.
- Team and report rows cannot silently lose damage, kill, death, or player
  identity fields.
- The existing bounded, one-vehicle-per-frame schematic warmup remains outside
  boot and Garage work.

## Verification

    npm run typecheck
    node src/ui/hitEventFormat.selftest.mjs
    node src/ui/shotDiagramProjection.selftest.mjs
    node src/ui/endScreen.selftest.mjs
    node src/ui/mobileLayout.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
