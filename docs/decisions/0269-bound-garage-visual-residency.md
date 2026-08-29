# 0269 — Bound Garage visual residency

## Status

Accepted; alternate-layout clauses superseded by
[0295](0295-open-map-garage-staging.md).

## Context

A pristine browser paid a multi-second first-GPU submission for the selected
Garage hero even though its hull, turret, and gun are the only articulation
owners. After the quiet workshop stream completed, both complete workshop
layouts also remained in the live Three.js scene. The default Verdant layout
therefore retained hundreds of invisible alternate-layout objects and exact
fleet-display leaf meshes.

The visible content is intentional and must not be simplified. The problem was
ownership and residency, not polygonal art.

## Decision

- Build the hero with the existing exact `batchStatic` representation. Hull,
  turret, and gun articulation remains available, including direct battle
  lending, while static fittings under those owners share submissions.
- Attach the single shared four-bay maintenance layout to the live scene.
  Verdant-only interior clutter and one lightweight map-staging root are the
  only selection-dependent scene residents.
- Collapse compatible opaque leaves inside explicitly immutable decorative
  display owners. Preserve every vertex, material, shadow flag, render state,
  and movable bay owner.
- Bound merge duplication to 1,200 vertex/index elements per removed draw. A
  large hull batch that saves one call stays in its authored buffers.
- Include detached roots when releasing shared source geometry.
- Build the shared maintenance bays behind the existing quiet leases. Lazy
  canonical map slices derive in a worker, reveal draw owners across frames,
  and keep the Garage light topology stable across selection changes.

## Evidence

On the constrained 4× CPU / 1.6 Mbps cold probe, the coldest fresh browser
improved from 8.55 s wall / 3.85 s application boot to approximately 6.36 s /
1.65 s. The first scene upload fell from 1.77 s to roughly 0.08 s.

The settled 1280×577 Garage changed from 1,102 to 817 live objects and from 533
to 446 scene geometry owners. The bounded workshop receipt removes 260 exact
draws while duplicating only 26,172 elements. Idle CPU remains approximately
0.005 core-equivalent. Under 4× CPU throttling, all ten environment selections
stay below 67 ms in the release probe after quiet warming.

## Consequences

The first switch made before quiet warming can still submit unfinished shared
dressing; the synchronous selection path remains a correctness fallback.
Normal idle construction spreads that cost across leases. Generated merge
geometries are owned by the dressing lifecycle and disposed with it.
