# 0193 — Fleet demand loading has a strict TypeScript boundary

Status: accepted

## Decision

`src/vehicles/fleetManifest.ts` is the import-free source of the exact vehicle
ID-to-family ownership map. `src/vehicles/fleetFactory.ts` owns the typed
profile-builder adapters, one promise per loading family, the ready-family set,
combat-anatomy and marking-seat convergence, and the synchronous create gate.

The authored geometry/profile modules remain behaviorally unchanged. Browser
callers must await `ensureTankBuilder()` or `ensureTankBuilders()` before
`createTank()`, while Studio and release tooling retain the explicit
`ensureFullFleet()` path.

## Why

This facade controls both first-visible Garage cost and first-battle roster
cost. Leaving its group keys, loader table, pending-promise cache, profile
adapter, and creation options implicit made it possible for a renamed family
or incomplete loader to fail only after a user selected that vehicle.

## Consequences

- Every manifest group must have one loader at compile time.
- Concurrent requests for a family still share one retryable promise; no new
  eager import, visual warm, geometry build, or fleet transfer is introduced.
- The full 117-vehicle demand sweep and 153-profile ownership audit certify the
  same outputs, and local-import integrity covers TypeScript paths used by JS,
  TS, Node tooling, and Vite.
- The remaining large authored builder/profile files can migrate incrementally
  behind this stable typed facade without widening the application root.

