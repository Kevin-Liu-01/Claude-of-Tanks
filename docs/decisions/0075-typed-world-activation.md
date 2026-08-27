# ADR 0075: Active battlefield presentation has one typed owner

- Status: accepted
- Date: 2026-08-27

## Context

`worldBuildCoordinator.ts` already owned deterministic map construction and
cache eviction, but `src/main.js` still retained the active world, pending map,
prepared-service map, sky key, collider, dormancy latch, minimap upgrade, GPU
warm sequence, and activation trace. Those values formed one order-sensitive
lifecycle. Keeping them beside unrelated UI, input, and networking composition
made a map change risky and left the lifecycle outside strict type checking.

## Decision

`src/world/worldActivationRuntime.ts` owns browser battlefield presentation.
Its public interface exposes active-world reads plus `ensure`, `switchMap`,
`prepareBattleServices`, `setDormant`, minimap refresh, prefetch, and bounded
cache operations.

The runtime composes the existing build coordinator and minimap asset owner. It
preserves the production order:

1. join or build one deterministic cached world;
2. keep it hidden across the progress-frame seam;
3. submit programs against the production HDR target;
4. warm shadow depth in bounded child cohorts;
5. finish cloud textures;
6. atomically swap scene residency and re-key atmosphere;
7. prepare collision, garage placement, and minimap only when requested.

The composition root supplies renderer, sky, lighting, HUD, garage, and
simulation capabilities as ports. It does not retain a second copy of world
lifecycle state.

## Consequences

- `src/main.js` loses active-world policy and 171 lines.
- Type checking covers activation state, warm options, services, and traces.
- Production visuals, map geometry, collision, warm order, and residency limits
  are unchanged.
- The boot graph gains roughly 1 KB gzip for the typed owner; constrained cold
  boot and phase-resource gates remain required to reject a bad trade.

## Verification

    node src/world/worldActivationRuntime.selftest.mjs
    node src/world/worldBuildCoordinator.selftest.mjs
    node src/ui/minimapAssetRuntime.selftest.mjs
    npm run typecheck
    npm run perf:cold -- --sessions 4 --summary 1 --timeout 180
    npm run perf:resources:gate
    npm run test:net:seven:full
    npm test
    npm run build
