# 0107 — Startup intent and vehicle selection have typed owners

## Context

`main.js` parsed Studio and room-invite URLs, accessed browser storage, validated
the remembered vehicle, and maintained mutable selection state. Those are
startup policies, not renderer composition, and storage restrictions or a room
link should never prevent the Garage from booting.

## Decision

`startupIntent.ts` resolves Garage, Studio, map, and room-link intent. It loads
the room-invite parser only when the URL actually contains a room. Ordinary
Garage and Studio boot do not acquire that network module.

`selectedVehicleSelection.ts` owns the current vehicle and durable visible-roster
selection. Storage access is guarded; denied or corrupt storage falls back to a
known visible vehicle. Diagnostic tools may stage a hidden vehicle transiently,
but hidden IDs are never persisted as a player selection.

## Consequences

- URL and storage policy leave the composition root.
- A restricted-storage browser still reaches a valid Garage selection.
- Room links retain lazy parsing and surface failures through the existing
  recoverable invitation path.
- Garage, solo, network, rematch, and diagnostic callers read one selection
  owner instead of mutating a shared string.

## Verification

- `npm run typecheck`
- `node src/game/startupIntent.selftest.mjs`
- `node src/game/selectedVehicleSelection.selftest.mjs`
- `node tools/selftest-suites.selftest.mjs`
- `npm run build`
