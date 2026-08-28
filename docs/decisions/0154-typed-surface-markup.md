# 0154 — Typed surface-markup geometry review

Status: accepted

## Decision

The Tank Gallery's live face and coplanar-patch review system is a strict
TypeScript module. Its public boundary names renderer, camera, controls,
vehicle geometry, DOM controls, annotations, and export records explicitly.

## Why

Surface review joins ray intersections, indexed and non-indexed geometry,
instancing, articulated ownership, selection overlays, and downloadable
review packets. Implicit JavaScript shapes made it easy to confuse an
ordinary mesh, an instanced mesh, a nullable ray hit, or a DOM event target.

## Consequences

- Gallery markup remains a separate-page feature and adds nothing to game
  boot.
- Exact selection, articulation, JSON, and PNG behavior is unchanged.
- Missing required workbench controls now fail with a named selector instead
  of a later null-property exception.
