# ADR 0067: Solo battle loading has one typed lifecycle owner

- Status: accepted
- Date: 2026-08-27

## Context

The remaining solo entry path in `src/main.js` coordinated the opaque loader,
ten independent cold dependencies, exact roster and camouflage planning, world
and FX texture upload, player visual promotion, deployment warming, minimum
loader dwell, reveal fallback, countdown calculation, and diagnostics. Its
ordering was performance- and correctness-sensitive but could only be tested
through the complete browser composition root.

This was policy rather than dependency wiring, and it kept roughly two hundred
lines of lifecycle implementation in the legacy JavaScript entry point after
the inner deployment warm had already gained a typed owner.

## Decision

`src/game/soloBattleLoadingRuntime.ts` owns the complete covered solo loading
transition. It accepts narrow capabilities from the composition root and
exposes one `begin()` operation. The owner:

- starts the battle interface, world, exact vehicle builders, authority,
  client, audio, FX, killcam and camouflage work behind one acquisition
  barrier;
- stages the active world and player textures before streaming the remaining
  opening cohort;
- delegates exact shader, shadow, terrain, FX and reveal warming to
  `soloBattleDeploymentRuntime.ts`;
- preserves the minimum branded-loader dwell and safe reveal fallback; and
- publishes the existing battle and visual timing receipts unchanged.

`src/main.js` only connects concrete ports and invokes the owner from the
shared battle-entry lifecycle.

## Consequences

- The composition root falls from 3,802 to 3,616 lines.
- Cold-entry ordering and fallback behavior are executable in Node without a
  renderer, DOM, battlefield, or vehicle fleet.
- The runtime remains a static Garage-safe module; it receives battle-only
  loaders as callbacks and does not import the solo authority graph.
- Rendering, simulation, maps, vehicles, materials, countdown timing, and
  visible loading presentation do not change.

## Verification

```sh
node src/game/soloBattleLoadingRuntime.selftest.mjs
node src/game/soloBattleDeploymentRuntime.selftest.mjs
node src/game/battleEntryLifecycle.selftest.mjs
npm run typecheck
npm run build
node tools/loading-budget-probe.mjs --mode battle --maps verdant \
  --limit 12000 --rollout-limit 16000 --stall-limit 700
```
