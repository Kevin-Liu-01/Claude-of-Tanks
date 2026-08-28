# 0214 — Swedish siege-line registration is strict TypeScript

Status: accepted

## Decision

Register the Swedish variants and stable Strv 103B identity in
`src/vehicles/sweden.ts`. Bound donor deltas and the siege-gun recipe with
strict types, route new rows through the validated fleet registry, and return
an explicit armor envelope for hull-aimed UDES 03 and Strv 103 vehicles.

Keep all siege-line modules and crew in hull space, remove conventional turret
plates, and retain the authored hydropneumatic aim, terrain resistance, gun
arc, ammunition, and damage values.

## Why

The former JavaScript pack combined unchecked variants with armor rescaling,
canonical Strv 103 mutation, and a custom hull-only combat envelope. These
fields affect both local and authoritative-server hit resolution; typing the
boundary makes the shared target model auditable without changing geometry or
gameplay.

## Consequences

- UDES 03, Strv 103A, and Strv 103B remain genuine hull-aimed vehicles with no
  invisible rotating turret volume.
- The stable `strv103` save/protocol ID continues to publish the 103B identity.
- Swedish siege behavior, geometry fidelity, tow ropes, suspension, lazy-fleet
  parity, and full anatomy are required proof for this boundary.
