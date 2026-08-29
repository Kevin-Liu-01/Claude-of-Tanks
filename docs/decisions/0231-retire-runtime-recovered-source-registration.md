# 0231 — Recovered source assets are not a runtime fleet path

Status: accepted

## Decision

Rename `userdrops5.js` to `additionalFleetSpecs.ts` and type its donor-copy,
patch, gun, armor, and registration boundaries. Remove the permanently disabled
local recovered-GLB registration branch and its empty sourced-id export.

The module now has one job: register first-party procedural combat rows. Source
assets remain offline comparison and authorship evidence only.

## Why

The disabled branch occupied more than 150 lines of boot-critical source and
described a local runtime mode that the project no longer permits. Its stale
GLB paths, articulation regexes, and source credits obscured the real invariant:
every playable uses repository-authored procedural geometry.

## Consequences

- Vehicle ids, balance data, armor fitting, visuals, roster order, and builders
  remain unchanged.
- No recovered GLB can be enabled by changing a source constant.
- TypeScript validates every donor patch while the emitted public runtime stays
  boot-light.
