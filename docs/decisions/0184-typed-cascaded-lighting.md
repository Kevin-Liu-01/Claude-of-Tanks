# 0184 — Cascaded lighting and shadow scheduling are strict TypeScript

Status: accepted

## Decision

The sun, hemisphere fill, cascaded-shadow fit, quality-resize queue, shadow
refresh scheduler, static-presentation dormancy, depth-packing compatibility
hook, coverage-preserving foliage mipmaps, and conservative per-instance shadow
culling are owned by `src/engine/lighting.ts` behind explicit Three.js contracts.

Near cascades continue at presentation cadence. Far cascades remain phase-spread,
and a far cascade's snapped transform advances only with the frame that redraws
its matching depth map. Covered transitions may prime cascades individually and
reuse that complete set for one visible frame.

## Why

Lighting is a high-cost, globally patched renderer boundary where unchecked
material, attribute, shadow-map, and CSM-private state could produce flicker,
invalid samplers, leaked registrations, or large recovery frames. Its former
JavaScript implementation hid those assumptions from both maintainers and the
compiler.

## Consequences

- Shadow ranges, map sizes, filter radii, color balance, ambient density,
  cadence, culling margins, and rendered appearance are unchanged.
- Instance-compaction records distinguish their pending and active states and
  retain typed snapshots of every affected instanced attribute.
- CSM material release no longer leaves an untracked compile-hook ownership
  path.
- A shadow render target may exist while its depth texture is still null;
  dormancy therefore remains blocked until every sampled cascade owns a native
  depth texture.
- Shadow stability, 60/120/144 Hz scheduling, deployment warming, device
  quality, static Garage dormancy, strict typecheck, and production build gates
  certify the migration.
