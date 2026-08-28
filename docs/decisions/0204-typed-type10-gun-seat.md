# 0204 — Type 10 gun-seat receipts are strict TypeScript

Status: accepted

## Decision

Keep the Type 10 and Type 10B trunnion, muzzle, throat, and mantlet fit datums
in `src/vehicles/profiles/type10GunSeat.ts`. Export immutable structural
contracts for the three-value pivot and each certified scalar measurement.

The module remains pure data: it must not import Three.js, builders, the fleet
registry, or browser APIs. JavaScript consumers use the explicit `.ts`
specifier so direct Node verification and the browser bundler share one source.

## Why

These values couple the articulated gun to the authored turret throat. A
malformed pivot or omitted fit dimension can create a daylight seam, move the
muzzle, or alter elevation/depression geometry. Strict tuple and object
contracts catch those mistakes without changing runtime data or vehicle
appearance.

## Consequences

- Type 10 gun seating has a small, reusable type boundary.
- Runtime values and object freezing remain unchanged.
- The focused articulation test remains the geometry and muzzle-position gate.
