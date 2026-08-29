# 0227 — KF51 combat registration is a typed first-party boundary

Status: accepted

## Decision

Rename the historical `userdrops3.js` registry to `kf51Specs.ts`, type both
combat rows with the shared fleet contracts, and keep source-model provenance
in attribution and authoring tools rather than executable playable code.

Remove the obsolete T-80U source-credit mutation and the commented model-source
override. The active T-80U and KF51 families remain procedural in every build.

## Why

The old file mixed current KF51 combat data, retired GLB migration notes, and a
credit mutation that roster finalization immediately deleted. Its name and
comments incorrectly implied that a third-party model pack still owned live
playable geometry.

## Consequences

- KF51 and KF51B preserve their ids, ordering, combat values, visuals, armor,
  and self-variant compatibility markers.
- No T-80U field that survives roster finalization changes.
- TypeScript now checks both family rows and their registration boundary.
- Source GLBs remain attributed local comparison inputs and cannot be enabled
  by changing a runtime flag.
