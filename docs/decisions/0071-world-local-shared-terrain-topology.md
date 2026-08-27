# 0071 — Terrain chunks share world-local index topology

Status: accepted

## Context

Terrain positions and normals differ per chunk, but triangle topology depends
only on LOD resolution. Each streamed 96×96, 48×48, or 24×24 chunk previously
allocated and uploaded another identical 32-bit index buffer. That duplication
increased JavaScript heap and GPU buffer residency without changing one
triangle.

## Decision

Each battlefield owns one immutable index attribute for each of its three LOD
resolutions. Every chunk geometry at that resolution references the same
attribute. Pools are world-local so evicting one cached world cannot invalidate
another world's live WebGL buffer.

All terrain grids, including their crack-hiding perimeter skirts, contain fewer
than 65,536 vertices. Their exact indices use `Uint16Array`; positions,
normals, winding, materials, LOD policy, collision, and rendered triangles are
unchanged.

The terrain root also registers every streamed LOD geometry it owns, including
levels not currently mounted on a mesh. Generic world eviction therefore
disposes dormant uploaded buffers instead of seeing only the active tree.

## Consequences

- The pinned Verdant 7v7 lifecycle uses three attributes across 116 terrain
  geometry references.
- The shared attributes occupy 153,216 bytes. Pooling avoids 3,888,000 bytes
  of duplicate Uint16 topology; pooling plus the safe Uint32-to-Uint16 change
  removes 7,929,216 bytes from the prior live CPU/GPU index footprint.
- The measured active-battle heap fell from 265.4 MB to 260.5 MB; returned
  Garage with the cached world fell from 191.2 MB to 183.7 MB. Heap samples
  include normal browser variance, so the exact avoided-byte receipt is the
  release invariant.
- Repeated map switching cannot strand off-tree terrain LOD buffers in the
  renderer cache.

## Verification

```sh
node src/world/terrainIndexPool.selftest.mjs
node src/world/terrainLodPolicy.selftest.mjs
node src/engine/resourceLifetime.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
```
