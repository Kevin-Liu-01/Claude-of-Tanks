# 0274 — Deterministic vehicle decorations are strict TypeScript

## Decision

Keep fleet-wide cosmetic kit construction, manifests, exact surface probes,
placement guards, merged material buckets, and disposal ownership in
`src/vehicles/decorations.ts`. The module uses explicit contracts for kit
arguments and parts, manifest rows, projected ray grids, surface hits,
placement slots, collision ledgers, material families, and attachment results.

## Why

Decoration placement is not a loose visual script. It measures completed tank
geometry, accelerates repeated ray tests through temporary projected grids,
checks the depressed gun and rotating turret envelopes, and transfers geometry
into frame-specific merged draw calls. Strict types make these performance and
clearance contracts reviewable without expanding the initial fleet bundle or
changing authored kit output.

## Consequences

- Decoration manifests and procedural kits retain their deterministic seeds.
- The 3,000-triangle per-vehicle budget, 150 m detail horizon, and no-caster
  policy remain unchanged.
- Hull and turret buckets cannot exchange geometry or unsupported material
  families accidentally.
- Surface-probe acceleration remains temporary and exact; it does not add
  resident Garage or battle resources.
- Existing Garage, Studio, battle, and diagnostic consumers import the typed
  module directly.
