# 0218 — Soviet-family chevron ERA construction is strict TypeScript

Status: accepted

## Decision

Implement the shared two-row turret ERA carrier in
`src/vehicles/profiles/sovietChevronEra.ts`. Type the cheek plans, row
stations, tile ranges, optional center closure, builder capabilities, and
exported measurement receipt while preserving the existing geometry loop.

T-72, T-80, T-90, Russian, Ukrainian, and miscellaneous procedural profiles
import the typed helper directly.

## Why

The helper defines the support plane, gasket offset, tile offset, ridge, and
frontmost measurement for several visually and mechanically distinct tank
families. An unchecked plan or row shape could create floating ERA, coplanar
flicker, or a false technical receipt across all of them at once.

## Consequences

- Every consumer shares one compile-time geometry vocabulary without becoming
  coupled to another family profile.
- The runtime still creates the same carriers, gaskets, tiles, and immutable
  receipt in the same order.
- Shared chevron, exact-surface seating, ERA lifecycle, anatomy, import, and
  production-build gates certify changes to this boundary.
