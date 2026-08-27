# 0073 — Inactive Garage phases release renewable GPU residency

Status: accepted

## Context

Detaching the complete Garage scene removes it from battle traversal but leaves
its uploaded buffers, textures, and programs in the renderer. Rebuilding the
workshop would save residency at the cost of an expensive return and risk
changing procedural content. Disposing every retained material looked
attractive, but the return path then compiled dozens of unused light-count
variants: the measured returned-Garage program count rose from 254 to 295.

## Decision

When battle takes ownership, `phaseGpuResidency.ts` uses
`releaseObject3DGpuResources()` to release the detached workshop's geometry and
texture WebGL allocations without detaching or changing its CPU-side objects.
Compiled materials remain resident. Returning to Garage performs one real
covered warm frame, which reuploads only resources the actual presentation
needs. It must not call isolated `compileAsync` for the workshop.

`liveHeightFieldProxy.ts` gives ordinary non-authoring terrain consumers the
warmed one-metre height cache while deterministic captures retain the analytic
sampler. Deferred midfield grass prepares half a chunk beyond the unchanged
visible fade band, avoiding multiple invisible construction jobs during
rollout.

## Consequences

- The pinned 14-tank battle falls from 723 to 556 renderer geometries and from
  321 to 292 textures with identical visible calls and triangles.
- The retained workshop remounts exactly; no procedural content is rebuilt.
- Returned Garage holds 256 programs rather than the rejected 295-program
  isolated-compile path.
- The production gate independently caps CPU, heap, objects, programs,
  geometries, textures, calls, triangles, shadow submissions, scene content,
  and phase ownership. It rejects an accidental all-four-cascade frame.

## Verification

```sh
node src/engine/resourceLifetime.selftest.mjs
node src/engine/phaseGpuResidency.selftest.mjs
node src/world/liveHeightFieldProxy.selftest.mjs
node src/world/terrainFastGrid.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
```
