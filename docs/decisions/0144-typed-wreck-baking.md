# 0144: Static wreck baking has a typed geometry contract

## Status

Accepted — 2026-08-28

## Decision

`src/world/wrecks.ts` owns deterministic battlefield-wreck baking. It accepts a
first-party procedural tank visual, settles the normal destroyed pose, filters
inspection-only geometry, and merges visible and shadow-only geometry into
static world assets. It also owns deterministic merged track, wheel, and armor
debris.

The boundary uses explicit geometry, material, return, and disposal contracts.
Wrecks remain construction-time dressing and never enter the per-frame tank or
spotting systems.

## Consequences

- Type checking now protects the wreck merge and shadow-proxy lifecycle.
- Battlefield wrecks retain their existing silhouettes, colors, and one-mesh
  runtime cost.
- Failed vehicle bakes remain isolated and cannot abort a battlefield build.
