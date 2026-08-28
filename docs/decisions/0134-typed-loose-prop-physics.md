# 0134: Loose-prop physics has a strict fixed-step contract

## Status

Accepted — 2026-08-28

## Decision

`src/world/loosePropPhysics.ts` owns the typed, deterministic 60 Hz body model
for lightweight battlefield dressing. Body construction, impulses, quaternion
integration, terrain support, sleep, static obstacle contact, pair response,
and rematch reset share one explicit state contract.

This remains a deliberately bounded solver rather than a general physics
engine. The hot step mutates caller-owned bodies and consumes scalar callbacks;
it does not allocate temporary vectors or collision objects.

## Consequences

- Invalid kick causes and incomplete body state fail during development.
- Client and future server consumers can share the same fixed-step contract.
- Visual mesh complexity remains independent of cheap collision primitives.
