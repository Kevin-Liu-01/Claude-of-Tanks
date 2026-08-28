# 0198 — Lazy fleet receipts have typed runtime owners

Status: accepted

## Decision

Combat-anatomy calibrations and vehicle-marking seats enter the runtime through
strict TypeScript registries. Each registry validates generated data before it
becomes observable and exposes only lookup and readiness operations.

Separate strict TypeScript loaders map a vehicle ID to its fleet group and own
one shared, retryable import promise per receipt group. The generated grouped
payloads and loader tables remain generator-owned JavaScript; authored browser
and tooling code must not import those payloads directly.

The browser loads only receipt groups required by the requested vehicle IDs.
The eager `tankFactory.ts` tooling facade registers the complete generated set
for release audits that intentionally inspect every vehicle.

## Why

Armor/module/crew calibration and exact marking placement are release receipts,
not independent vehicle behavior. Eagerly importing every receipt regresses the
first Garage visit, while unvalidated JavaScript maps allow malformed generated
records to fail later during rendering. Keeping registration and acquisition
separate preserves demand loading and gives each responsibility a small owner.

## Consequences

- Concurrent requests for a family converge on one import and failed imports
  clear their pending entry so a later request can retry.
- Unknown groups fail explicitly instead of silently omitting calibrated armor
  or paint placement.
- Generated payload formats are checked at the runtime boundary without making
  generated artifacts hand-maintained TypeScript sources.
- The full lazy-fleet sweep certifies that all demand-owned profiles remain
  reachable without adding all-fleet data to player boot.
