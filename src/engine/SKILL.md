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
`renderer.ts` creates WebGL; `viewportRuntime.ts` owns atomic resize and 0x0
first-layout recovery; `frameLoopScheduler.ts` owns rAF delivery, bounded
hidden-pane recovery, and visible Garage clock sleep; `garageFramePacer.ts`
suppresses redundant settled Garage frames while keeping interaction at display
cadence; `lighting.ts` reuses proven static Garage depth maps until explicit
presentation invalidation, then forces a complete refresh before motion;
`shadowStability.ts` owns texel snapping and cascade-scaled receiver bias;
`simplexFast.ts` owns allocation-free, reference-identical terrain noise;
`post.ts` and `sky.ts` build the frame; `lightModel.ts` (2026-10-01) turns a
map's sky preset and the atmosphere's summary into the light — the sun through
the atmosphere, the sky's own image-based light (the environment baked without
the sun disc, the shaded ground below the horizon), the overcast deck, the
exposure law and the per-map grade — and `lighting.ts` applies it (the Garage,
an enclosed presentation, a galaxy sky and the Preetham tier keep the authored
rig). The physical sun is derived on every preset from its elevation,
atmosphere and cloudscape (a map's authored `sunIntensity`/`sunColorHex` light
only the legacy rig and the night's moon); a sky block's `lighting` block holds
the map levers (ground albedo, exposure EV, grade); the output pass tone-maps
with AgX. `cinemaPost.ts` is the Studio-only picture stack (depth of field, HDR
highlights/exposure/white balance, display grade, per-output-frame finish)
inserted into post.ts' composer at runtime only while a stage is non-neutral and
removed on Studio exit; `filmAccumulation.ts` is the Studio-only float
accumulation pass the film renderer inserts after late FX for the length of a
film (never constructed in battle or Garage), and `LensFlarePass.fixedDt` lets it
ease the flare on the film clock. `temporalAoPolicy.ts` owns the
asymmetric stale-dark release used by temporal GTAO; `renderLayers.ts` owns
presentation/shadow-only routing for authored proxy casters;
`phaseSceneResidency.ts` detaches mutually exclusive Garage and battlefield
roots while retaining their exact reusable objects;
`phaseGpuResidency.ts` owns renewable WebGL suspension and covered restoration;
`resourceLifetime.ts` owns phase/cache disposal. Inactive retained phases may
release geometry buffers and textures, but preserve compiled materials and
restore through a covered real render rather than isolated `compileAsync`;
`cameraRig.ts` owns player/cinematic poses; settled showroom framing is pumped
only by the Garage watchdog or visible motion; `quality.ts` and `deviceDiag.ts`
own tiering and rescue behavior. `adaptiveQualityPolicy.ts` owns the typed,
side-effect-free decision ladder for measured shading trim, resolution relief,
and hardware-capped auto-tier recovery; `post.ts` only samples frames and
applies the returned WebGL action.

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
Studio picture passes must stay out of the battle composer: never import
`cinemaPost.ts` from boot or battle modules, and keep its stage gating in
`game/studioPicture.ts` so the neutral picture stays byte-identical.
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
A material's `envMapIntensity` only reaches the screen through
`setupShadowMaterial` (`materialEnvIntensity.ts`): three overwrites the uniform
with `scene.environmentIntensity` for every material that reads the scene
environment. Below 1 it takes a share of the sky light, which is 80–99 % of a
shaded matte face's light, so a trim is a visible change, not a no-op.
