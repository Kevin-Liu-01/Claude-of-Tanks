# 0171 — Spotting authority is strict TypeScript

Status: accepted

## Decision

The renderer-free spotting module is strict TypeScript and exports the shared
contracts for observable tanks, concealment discs, line-of-sight probes,
spotting events, team radio contacts, and the reusable HUD concealment
snapshot. Solo play, bots, multiplayer authority, and presentation continue to
consume the same implementation.

## Why

Visibility is both combat logic and a security boundary. The server must never
serialize a hidden enemy transform, while the local HUD must not reveal a spot
before the sixth-sense delay. Leaving this boundary duck-typed made it too easy
for entity, equipment, radio, or raycast shapes to drift between browser and
server callers.

## Consequences

- View range, concealment, firing bloom, foliage, 15 metre transparency,
  proximity detection, radio sharing, and sixth-sense timing are unchanged.
- Authoritative code receives an explicit spotting-event contract and normal
  clients still receive viewer-filtered snapshots without hidden coordinates.
- The update loop retains its reused event, contact, camo, ray, and HUD
  scratch objects; the migration adds no frame allocations.
- The module remains independent of the DOM, WebGL, and Three.js.
- Formula, authority, bridge, HUD, import-integrity, build, and full-suite
  checks certify the migration.
