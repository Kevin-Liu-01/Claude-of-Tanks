# 0272 — The third modern fleet pack is strict TypeScript

## Decision

Keep the Chieftain, K2/K1A1, Type 10, Bradley/BMP, Puma, Type 89, and Ariete
procedural builders in `src/vehicles/modern3.ts`. The module exposes one
structural builder port covering its geometry groups, material roles, receipts,
and assembly methods. Reusing family adapters must declare the complete donor
surface they forward.

Non-uniform geometry transforms and variable-height turret lofts retain narrow
typed adapters around the legacy core helpers. Mixed numeric construction rows
use explicit tuple contracts instead of relying on JavaScript array widening.

## Why

This pack is a large visual authority shared by base tanks and family variants.
Strict contracts catch incomplete donor adapters and malformed geometry rows
without transferring the pack during boot or changing authored geometry.

## Consequences

- Browser demand loading and fleet registration now import `modern3.ts`.
- Bradley, Japanese, and Korean adapters state the runtime capabilities their
  inherited builders require.
- Geometry, transforms, ownership, visuals, and demand-loading behavior remain
  unchanged.
