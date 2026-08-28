# 0132 — Prop placement shares typed terrain support

## Status

Accepted — 2026-08-28

## Context

Buildings, utility poles, logs, roadside props, and anti-tank obstacles must
share exact visual and collision placement on irregular terrain. The pure
placement helpers were Node-testable but structurally implicit JavaScript.

## Decision

`src/world/propPlacement.ts` owns strict height-field, support footprint,
utility-station, segment, rigid OBB, and compound hedgehog contracts. It remains
renderer-free and runs during world construction only. The rigid-plane solver
indexes its fixed nine support samples directly instead of allocating a lookup
closure per placed object.

## Consequences

- Visual meshes and collision records retain one terrain-support source.
- Paired poles still collapse to one independently grounded post on shelves.
- Rigid props report embedding/floating error instead of hiding bad terrain fit.
- The change preserves geometry and collision shapes while reducing world-build
  helper overhead.
