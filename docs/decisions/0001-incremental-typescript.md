# ADR 0001: Incremental strict TypeScript migration

- Status: accepted
- Date: 2026-08-25

## Context

The game grew as browser-native ES modules. Strong runtime tests protect many
behaviors, but large integration files and implicit object shapes make changes
harder for human and automated contributors to review. Converting the entire
runtime in one operation would combine type discovery, module movement, and
behavior changes into an unsafe diff.

## Decision

Migrate by stable subsystem boundary:

1. Extract one coherent owner from legacy JavaScript.
2. Express its public contract with strict TypeScript types.
3. Keep JavaScript interoperability enabled while migrated modules are sparse.
4. Add a focused behavioral self-test and run `npm run typecheck`.
5. Preserve runtime behavior before expanding the boundary.

New standalone infrastructure modules should be TypeScript. Large visual,
simulation, and vehicle files migrate only when their ownership boundary and
tests are already clear. The first migrated module is
`src/engine/frameScheduler.ts`. The next boundary, `src/game/stateCore.ts`,
owns the dependency-free session container, deterministic RNG, and synchronous
event bus used by garage, Studio, and the legacy solo battle runtime.
The next boundary, `src/game/rosterState.ts`, owns roster entities, lazy battle
visual construction policy, and deterministic participant/camouflage planning.
It deliberately excludes combat initialization so garage boot and battle-intent
preloading can depend on the roster without importing the solo simulation graph.
`src/game/soloBattleRuntime.ts` is the corresponding typed lazy boundary for
that graph: the composition root acquires legacy `state.js` only after solo
Battle or deterministic capture intent, while existing authority functions
remain behaviorally unchanged.
`src/game/soloBattleAccess.ts` owns the retryable dynamic-import lifecycle and
stable delegation surface so `src/main.js` no longer carries loader state.
`src/net/webrtcPeer.ts` is the first transport owner migrated in place. Its
public signal/session contract is explicit, while lobby and match runtimes
continue to consume the same transport seam.
`src/net/predictionCorrection.ts` and `src/net/localTankPrediction.ts` own the
typed local-control boundary: wire input, authority snapshots, shared movement
replay, collision callbacks, presentation correction, and telemetry now have
explicit contracts without moving combat authority into the browser client.

## Consequences

- Type coverage grows monotonically without blocking gameplay work.
- `src/main.js` shrinks through tested extractions rather than a rename-only
  conversion.
- Mixed `.js` and `.ts` imports are expected during the migration.
- Source imports may use explicit `.ts` extensions; `allowImportingTsExtensions`
  is enabled because Vite and the Node self-tests both consume source modules
  directly and the project does not emit JavaScript through TypeScript.
- A migration commit must not also redesign visuals or gameplay.

## Verification

    npm run typecheck
    node src/engine/frameScheduler.selftest.mjs
    node src/game/rosterPlanning.selftest.mjs
    node src/game/soloBattleRuntime.selftest.mjs
    node src/game/soloBattleAccess.selftest.mjs
    node src/net/localTankPrediction.selftest.mjs
    node src/net/net.selftest.mjs
    npm test
    npm run build
