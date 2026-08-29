# 0232 — Classic fleet registration is procedural-only and typed

Status: accepted

## Decision

Rename `userdrops6.js` to `classicFleetSpecs.ts`, type its donor-copy and
nested patch contracts, and remove the permanently disabled recovered-model
registration branch and unused sourced-id export.

## Why

The runtime name and disabled GLB helpers described an abandoned ingestion
phase rather than the module's current responsibility. Every registered tank
now has a first-party procedural builder; retained third-party files are
offline comparison inputs, not a selectable runtime implementation.

## Consequences

- All fourteen ids, stats, armor transforms, visuals, and roster positions are
  unchanged.
- Donor, armor, gun, dimensions, and visual patches are checked by TypeScript.
- The boot path contains no dormant switch back to recovered model geometry.
