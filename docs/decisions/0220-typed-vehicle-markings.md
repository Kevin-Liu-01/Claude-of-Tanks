# 0220 — Vehicle marking anchors and painters are strict TypeScript

Status: accepted

## Decision

Keep all per-vehicle plate-search anchors, national marking metadata,
deterministic tactical numbers, and Canvas2D insignia painters in
`src/vehicles/vehicleMarkings.ts` under explicit contracts.

Generated marking seats remain a separate generated registry. The authored
anchor map continues to be checked against every battle-playable vehicle.

## Why

Markings cross several sensitive boundaries: nation identity, articulation
ownership, armor-surface seating, generated icons, runtime paint textures, and
impact/decal depth. Unchecked anchor owners or draw records could create
floating paint, wrong-country art, or inconsistent Garage and battle assets.

## Consequences

- Hull/turret and left/right anchor choices are compile-time constrained.
- Canvas contexts, dimensions, paint records, and nation metadata are explicit.
- Draw order, numeric anchor values, hashes, and generated-seat ownership are
  unchanged.
- Typecheck, all-fleet physical marking verification, impact decals, asset
  metadata, import integrity, and production build certify this boundary.
