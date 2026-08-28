# 0142: Bot routes share a typed terrain-capability grid

## Status

Accepted — 2026-08-28

## Decision

`src/sim/botRoutePlanner.ts` owns the typed immutable navigation grid and seeded
A* route contract shared by local and authoritative bots. Height, ground type,
solid cover, vehicle drivetrain capability, role detours, and route points are
explicit inputs and outputs.

The eight neighbor steps are module constants rather than allocations inside
each of the up-to-three A* solves per planned route.

## Consequences

- Bot routes accepted by planning remain traversable by the same drivetrain
  policy used in fixed-step movement.
- Navigation grids stay reusable by every bot in a match.
- Seeded opening variety and existing route geometry remain deterministic.
