# 0244 — Deterministic shot recipes have a strict TypeScript owner

Status: accepted

## Decision

`src/dev/shotViews.ts` owns the complete 34-view engineering capture table
behind explicit world, tank, combat, visual, HUD, FX, Garage, and replay ports.
`src/dev/shotRuntime.ts` remains the only acquisition owner and imports that
table only after an explicit `window.__SHOTS.set()` request.

The migration preserves every camera pose, staged entity mutation, HUD frame,
effect age, replay payload, and view name. It adds no ordinary boot import and
does not move capture policy into gameplay authority.

## Consequences

- Declared capture names and implemented recipes cannot drift silently.
- Required staging tanks and replay dependencies are visible contracts.
- Ordinary Garage and battle entry still transfer no shot-recipe chunk.

## Verification

    npm run typecheck
    node src/dev/shotViews.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    npm run build
