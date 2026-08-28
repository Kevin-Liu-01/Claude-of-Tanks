---
name: src-engine-skill
description: Work on renderer, lighting, camera, postprocessing, device quality, and frame diagnostics.
---

# claude-of-tanks / src/engine

## Purpose
<!-- agent-docs:fill:purpose -->
Own the Three.js rendering platform and adaptive quality without changing game
simulation.

## Mental model & key files
<!-- agent-docs:fill:model -->
`renderer.js` creates WebGL; `viewportRuntime.ts` owns atomic resize and 0x0
first-layout recovery; `frameLoopScheduler.ts` owns rAF delivery, bounded
hidden-pane recovery, and visible Garage clock sleep; `garageFramePacer.ts`
suppresses redundant settled Garage frames while keeping interaction at display
cadence; `lighting.js` reuses proven static Garage depth maps until explicit
presentation invalidation, then forces a complete refresh before motion;
`shadowStability.ts` owns texel snapping and cascade-scaled receiver bias;
`post.js` and `sky.js` build the frame, while `temporalAoPolicy.ts` owns the
asymmetric stale-dark release used by temporal GTAO; `renderLayers.ts` owns
presentation/shadow-only routing for authored proxy casters;
`phaseSceneResidency.ts` detaches mutually exclusive Garage and battlefield
roots while retaining their exact reusable objects;
`phaseGpuResidency.ts` owns renewable WebGL suspension and covered restoration;
`resourceLifetime.js` owns phase/cache disposal. Inactive retained phases may
release geometry buffers and textures, but preserve compiled materials and
restore through a covered real render rather than isolated `compileAsync`;
`cameraRig.js` owns player/cinematic poses; settled showroom framing is pumped
only by the Garage watchdog or visible motion; `quality.js` and `deviceDiag.js`
own tiering and rescue behavior.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Measure before adding passes, keep quality changes reversible, reuse render
targets/materials, and avoid shader compilation during live control windows.
Mark geometry built only to cast shadows with `markShadowOnly()`; a
color-write-disabled material alone does not stop Three.js from submitting it
in the forward pass.
Every asynchronous Garage producer that changes visible state must invalidate
presentation; the five-second paint is a safety watchdog, not its delivery
mechanism.
Do not dispose inactive-phase materials merely to lower the live program count:
returning can create a larger cache of light-count variants and a visible
compile spike. Gate programs, buffers, textures, heap, objects, calls and
triangles independently with `npm run perf:resources:gate`.
Keep each rate-capped far-cascade projection paired with the depth map rendered
from that pose. Do not move its light fit on an unscheduled frame. Shadow visual
changes must pass both the raw CSM motion comparison and composed temporal-AO
motion gate in `tools/render-stability-audit.mjs`.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Capture baseline boot/frame probes on the target tier, change one cost center,
then compare both visual evidence and worst-frame metrics. For a shadow flash,
first force all CSM cascades to distinguish raw shadow-map cadence from the
GTAO/post composition before changing quality or refresh policy.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Garage and battle have different active worlds/lights. A lower draw count is
not a win if it causes first-use shader or transition spikes. Passive Garage
dwell must not construct a battlefield or retain resources without a ceiling.
