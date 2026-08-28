# 0160 — Typed map-dressing contract

Status: accepted

## Decision

The shared market and battlefield-dressing catalog is a strict TypeScript
boundary. Market builders use the same structure-builder contract as the
urban, rail, and village catalogs. Explicit-position dressing receives a
typed map layout, terrain sampler, geometry-bucket set, seeded random source,
and optional grounding-receipt sink.

## Why

This module composes five visually different systems—desert markets, winter
lakes, coastal shores, autumn rivers, and rail yards—into the same merged
world meshes. Implicit object shapes made a misspelled layout field or missing
material bucket fail only during a particular map build. A shared contract
makes those dependencies visible before the catalog is split by biome.

## Consequences

- Geometry, authored placement, seeded random-call order, and merged draw-call
  behavior are unchanged.
- Grounded boats and driftwood retain their support receipts.
- Market builders remain compatible with the common procedural-structure
  registry.
- Biome-specific dressing can now move into smaller modules without inventing
  new runtime interfaces.
