# 0215 — Sheridan armor and missile registration is strict TypeScript

Status: accepted

## Decision

Define M551 Sheridan and M551A1 TTS combat rows in
`src/vehicles/sheridan.ts` with strict fleet, armor, plate, module, crew, ERA,
and guided-shell contracts. Register both rows through the validated fleet
registry while keeping playable geometry demand-owned by
`profiles/sheridan.js`.

Clone armor plates and internal volumes structurally before building the TTS
derivative, then append its physical engine-deck, bustle, and destructible ERA
sectors.

## Why

These complete combat rows were previously unchecked JavaScript even though
they define guided ammunition, module hit volumes, crew, armor and ERA. A
strict boundary makes local and authoritative-server state share a reviewable
schema without changing a numerical value or visual builder.

## Consequences

- The two Sheridan rows keep their distinct Shillelagh missiles, health,
  handling, armor and presentation.
- TTS armor changes remain real damage-model sectors rather than cosmetic
  geometry.
- Sheridan missile, anatomy, ERA, fleet-balance, lazy-fleet, and production
  build suites are required proof for this boundary.
