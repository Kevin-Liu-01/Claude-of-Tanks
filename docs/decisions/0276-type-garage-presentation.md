# 0276 — Garage presentation has a strict TypeScript boundary

## Decision

Keep the complete Garage roster, map, camouflage, loadout, service-record,
navigation, and battle-intent presentation in `src/ui/garage.ts`. Give its
fleet-facing inputs, optional intent callbacks, room status, DOM references,
and public runtime API explicit contracts while preserving the existing markup,
CSS cascade, image URLs, event order, and lazy editor transfers.

## Why

The Garage is a high-traffic composition boundary between the fleet registry,
local loadouts, responsive UI, optional authoring tools, and battle entry. Its
former JavaScript implementation relied on nullable DOM lookups and implicit
callback shapes, making refactors difficult to verify and allowing invalid
integration state to fail late during player interaction.

## Consequences

- Missing static Garage markup fails immediately at construction rather than
  producing a later null dereference.
- Fleet, shell, camouflage, map, room, and battle-intent contracts are checked
  without adding boot-critical runtime dependencies.
- The custom camouflage editor remains retryable and intent-loaded.
- Visual output, carousel behavior, responsive layout, loadout persistence,
  and battle launch semantics remain unchanged.
