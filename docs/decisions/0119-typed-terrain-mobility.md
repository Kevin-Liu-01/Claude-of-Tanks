# 0119 — Drivetrain and route planning share typed terrain capability

## Context

Authoritative movement and bot route planning must agree on whether a vehicle
can climb or control a slope. The shared policy is performance-sensitive scalar
math over engine power, weight, track traction, and per-ground resistance, but
its JavaScript spec shape and inputs were implicit.

## Decision

`terrainMobility.ts` is the strict TypeScript owner for resistance, available
drive acceleration, grip coefficient, force margins, signed-grade capability,
and travel-cost scaling. It accepts one minimal readonly vehicle capability
record and remains independent of Three.js, the DOM, and wall-clock time.

## Consequences

- Player movement, local bot planning, and authoritative bot planning consume
  one checked terrain-capability contract.
- Every coefficient, clamp, gravity term, and infinity rejection is unchanged.
- The hot scalar path retains its allocation-free implementation.
- Vehicle specifications need not duplicate a separate navigation slope limit.

## Verification

- `npm run typecheck`
- `node src/sim/movement.selftest.mjs`
- `node src/sim/botRoutePlanner.selftest.mjs`
- `node src/game/ai.selftest.mjs`
- `node server/authoritativeBots.selftest.mjs`
- `npm run build`
