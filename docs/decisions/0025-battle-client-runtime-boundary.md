# ADR 0025: Demand-load the battle client runtime

## Status

Accepted — 2026-08-26

## Context

The garage composition root statically imported aiming, movement dispersion,
armor tracing, damage, ballistics, special-action mutation, and rendered QA
controls. None is required to show or operate the garage, but all of it was
transferred, parsed, and evaluated for every first-time visitor.

## Decision

`src/game/battleClientAccess.ts` is the retryable typed boundary for client-side
combat helpers. It exposes one stable aim-controller proxy during composition
and acquires `battleClientRuntime.ts` on Battle intent or at the explicit solo,
network, debug, and screenshot battle barriers. A rejected chunk request is not
cached, so the next intent can recover without a page refresh.

Garage dossier metadata lives in `src/sim/specialActionPolicy.ts`; battle-only
special-action mutation continues in `specialActions.js`. Rendered drive-test
controls are acquired only for development, debug, or automation sessions.

## Consequences

- Ordinary garage boot no longer imports damage, ballistics, armor tracing, or
  the drive-test runtime.
- Battle entry explicitly awaits the complete client combat contract before
  simulation starts; combat methods otherwise fail closed.
- The initial first-visit JavaScript transfer is about 23 KB smaller in the
  constrained cold probe.
- This is another strict-TypeScript ownership seam out of `src/main.js`; it is
  not a rename-only migration.

## Verification

- `node src/game/battleClientAccess.selftest.mjs`
- `npm run typecheck`
- `node tools/bootgate-probe.mjs`
- `node tools/loading-budget-probe.mjs --mode battle --maps steppe --tier mobile`
- `npm run build`
