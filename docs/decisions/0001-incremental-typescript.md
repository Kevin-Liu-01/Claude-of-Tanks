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
    npm test
    npm run build
