# 0216 — Type 99 combat envelopes are strict TypeScript

Status: accepted

## Decision

Implement the Type 99A and ZTZ-99A2 armor constructors in
`src/vehicles/profiles/type99Armor.ts`. Type every quad, plate option, ERA
reduction, internal module, crew volume, helper profile station, variant key,
and returned `ArmorEnvelope`.

Have both the base Type 99 row and Chinese variant pack import the TypeScript
constructor directly. Remove the temporary `unknown` assertion from the
ZTZ-99A2 registration.

## Why

This module defines shell-traced combat surfaces shared by local and
authoritative-server simulation. Leaving the 331-line envelope constructor
unchecked allowed malformed winding, module coordinates, or variant keys to
cross the most important armor boundary even after its caller was typed.

## Consequences

- Type 99A and ZTZ-99A2 keep their distinct segmented hulls and welded arrow
  turrets without importing render-heavy builders.
- Unsupported armor variant keys now fail at compile time and still fail
  defensively at runtime.
- Type 99 planar/alignment proof, both ZTZ geometry suites, full anatomy,
  lazy-fleet parity, and production build are required gates.
