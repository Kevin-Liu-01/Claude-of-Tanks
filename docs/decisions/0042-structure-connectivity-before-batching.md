# ADR 0042: Structure connectivity is certified before batching

- Status: accepted
- Date: 2026-08-26

## Context

Battlefield buildings deliberately collapse many authored parts into a small
number of merged material buckets or `InstancedMesh` families. This keeps the
twenty battlefields fast, but the merge erases the identity of individual roof
sheets, window surrounds, awnings, posts, ladders, conduits, and service
equipment. A disconnected part can therefore look plausible in code, survive
ordinary geometry tests, and only reveal itself as floating from a particular
camera angle or terrain placement.

## Decision

Connectivity is an authoring-time invariant. Heavy structures register each
exterior fixture against the wall envelope, ground, or an already-supported
fixture. Lightweight destructible structures build a support graph from their
unmerged part bounds and a physical ground plane before producing their single
instanced geometry. The build fails when any intact part is outside the
connection tolerance.

`src/world/structureConnectivity.ts` is the shared strict TypeScript gate. Its
fleet-style census constructs all 38 heavyweight and site-building families
with two deterministic variants before release. The pass also corrected four
concrete authoring defects: granary treads gained grounded risers, courtyard
wells gained a real bucket rope, and rail gantries gained both tower cap beams
and cabin hangers. Exterior profiles now carry bounded, connected signatures:
framed entrances plus shutters, balconies, service ladders, roof equipment, or
adobe buttresses as appropriate to the building family. Broad urban,
industrial, civic, and desert elevations also carry connected bay piers and
framed apertures; industrial openings use louver geometry, while large
side-wall windows retain recessed surrounds and crossed mullions.

The merged lightweight geometry retains a compact connectivity receipt for
tests and audits. Broken-state wreckage is exempt because detached collapsed
panels and debris are intentional after destruction.

## Consequences

- Floating parts fail deterministically before reaching a battlefield.
- Grounded accessories remain legal without pretending they are welded to the
  main shell.
- Connectivity work runs once while a structure family is built; it adds no
  per-frame scene nodes, traversal, material, or draw-call cost.
- Material merging, intact/broken instancing, collision capture, and rematch
  reset behavior remain unchanged.
- Repeated destructible families vary through a deterministic instance-color
  multiplier. The broken packed slot receives the same multiplier as its intact
  authored slot, with no cloned material or frame-loop work.
- Small ground clutter may opt out of cascaded-shadow submissions, but complete
  structures, walls, fences, cover, and toppling actors retain their shadows.
  The policy changes renderer work only; it never removes visible geometry.

## Verification

    node src/world/structureKit.selftest.mjs
    node src/world/structureConnectivity.selftest.mjs
    node src/world/structureInstanceAppearance.selftest.mjs
    node src/world/exteriorDetailKit.selftest.mjs
    node src/world/destructibleRenderPolicy.selftest.mjs
    npm run qa:maps -- --gate
    npm test
    npm run build
