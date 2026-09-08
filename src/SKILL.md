---
name: src-skill
description: Navigate browser boot and shared source contracts while preserving subsystem and bundle boundaries.
---

# claude-of-tanks / src

## Purpose
<!-- agent-docs:fill:purpose -->
Compose the game and its public pages from independently owned subsystems.
Use the nearest child `SKILL.md` for implementation details; this directory's
root files supply boot wiring and small shared contracts.

## Mental model & key files
<!-- agent-docs:fill:model -->
`main.ts` wires strict typed lifecycle owners from `app/`, `game/`, and the
rendering subsystems. `runtimeTypes.ts` defines unvalidated runtime and JSON
boundary values, not domain models. `productStats.ts` supplies dependency-free
totals and template tokens; `authorship.ts` supplies first-party attribution.
`analytics.ts` is deferred public-page telemetry, separate from game boot.
Read `docs/SYSTEMS.md` and `docs/DECISIONS.md` for cross-subsystem contracts.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Keep `main.ts` surgical: compose existing owners rather than duplicating
  their state, lifecycle, or gameplay policy.
- Keep simulation/network logic Node-runnable and deterministic; DOM/WebGL
  belongs to presentation. Rendering does not authorize combat outcomes.
- Preserve demand-loaded phase boundaries and allocation-neutral frame loops.
- Narrow `RuntimeValue` at subsystem boundaries before accessing fields;
  keep domain-specific types with their actual owner.
- Keep product totals dependency-free and verify them against registries;
  do not pull fleet/map builders into lightweight public or boot modules.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- Boot or phase wiring: read `app/SKILL.md` and `game/SKILL.md`, then the
  affected lifecycle owner's selftest.
- Product counts: run `node src/productStats.selftest.mjs`.
- Authorship/provenance: inspect `NOTICE.md`, `docs/ATTRIBUTION.md`, and run
  `npm run attribution:check`.
- Shared typed integration: run `npm run typecheck` plus focused owner tests;
  use `package.json` for current full build/test commands.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`src/docs/` is the player-facing manual implementation; repository `docs/`
contains engineering documentation. Public pages must not import game boot,
and the latency-sensitive game entry must not schedule public analytics.
