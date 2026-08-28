# 0112 — The graphics quality ladder is strict TypeScript

## Context

Device classification, texture allocation, scene resolution, post-processing,
and four shadow cascades all consume one quality policy. Its JavaScript shape
allowed preset keys, mobile-only texture fields, shadow tuples, storage values,
and adaptive listener payloads to drift independently across renderer, world,
vehicle, HUD, and settings modules.

## Decision

`quality.ts` is the strict TypeScript owner for device tiers, desktop and mobile
preset names, four-cascade budgets, texture caps, persisted choices, adaptive
fallback, and change subscriptions. Every consumer imports that canonical
owner. Existing numeric values and selection algorithms remain unchanged.

## Consequences

- Invalid preset names cannot cross typed callers or mutate stored policy.
- Every shadow budget is checked as an exact four-entry tuple.
- Mobile texture and output decisions remain centralized and explicit.
- The default High, explicit Ultra, mobile, and overload behavior are
  unchanged; this migration does not reduce visual quality.

## Verification

- `npm run typecheck`
- `node src/engine/quality.selftest.mjs`
- `node src/engine/shadowStability.selftest.mjs`
- `node src/engine/renderScalePolicy.selftest.mjs`
- `node src/ui/touchControls.selftest.mjs`
- `node tools/selftest-suites.selftest.mjs`
- `npm run build`
