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
first-layout recovery; `frameLoopScheduler.ts` owns rAF delivery and bounded
hidden-pane recovery; `lighting.js`, `post.js`, and `sky.js` build the frame;
`cameraRig.js` owns player/cinematic poses; `quality.js` and `deviceDiag.js`
own tiering and rescue behavior.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Measure before adding passes, keep quality changes reversible, reuse render
targets/materials, and avoid shader compilation during live control windows.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Capture baseline boot/frame probes on the target tier, change one cost center,
then compare both visual evidence and worst-frame metrics.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Garage and battle have different active worlds/lights. A lower draw count is
not a win if it causes first-use shader or transition spikes.
