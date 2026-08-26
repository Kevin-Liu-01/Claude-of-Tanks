# 0012 — Camera and physical-bore aim share one typed owner

## Context

Camera anchoring, sticky vehicle acquisition, physical gun-ray projection,
terrain-clearance warnings, and plate penetration sampling accumulated in the
application composition root. Headless aim gates reused only some of those
helpers. That made an already large `main.js` harder to reason about and made
it possible for solo, network presentation, and diagnostics to disagree about
where the articulated gun could actually fire.

## Decision

`src/game/aimController.ts` owns the complete presentation-side aim contract.

- The camera marker remains an exact world/tank ray with the existing
  1.15-radius soft acquisition and 300 ms hysteresis.
- The gun marker, penetration query, and obstruction warning all originate at
  the visual muzzle and follow the articulated bore.
- Live HUD updates and headless aim gates call the same controller methods.
- Authoritative firing and damage remain in the simulation; this controller
  only derives presentation and diagnostic state from current tank state.
- The owner is strict TypeScript and accepts its world, visibility, shell-card,
  dispersion, clock, and state dependencies explicitly.

## Consequences

The composition root loses more than 250 lines of mutable aim state without
changing reticle visuals, gun limits, dispersion, armor resolution, firing, or
network authority. Future aim changes have one boundary and one dependency
surface. The controller continues to reuse vector and pose scratch state, so
the extraction adds no per-frame allocation to the established hot path.

## Verification

- `src/game/aimController.selftest.mjs` covers soft acquisition, physical-bore
  projection, obstruction sampling, dwell behavior, and HUD state transfer.
- Existing movement, mobile-auto-aim, AI-aim, armor, network-prediction, and
  deterministic screenshot checks remain the behavioral regression gates.
- `npm run typecheck`, `npm test`, and the public production build must pass.
