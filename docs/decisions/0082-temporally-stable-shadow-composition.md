# ADR 0082: Shadow projection, depth, and temporal darkness stay coherent

- Status: accepted
- Date: 2026-08-27

## Context

Camera motion produced intermittent dark flashes around overlapping trees,
structures, and terrain. The existing raw shadow audit showed byte-stable CSM
output when every cascade was current, which isolated two separate defects:

1. half-resolution GTAO retained stale dark history across a disocclusion; and
2. one fixed 4.5 cm receiver normal bias was adequate for the near cascade but
   sub-texel across broad far cascades, leaving terrain and canopy acne.

The far-cascade round robin also prepared every new snapped projection before
its matching depth map was scheduled. A rate-capped map could therefore be
sampled with a pose that did not create it.

## Decision

`src/engine/temporalAoPolicy.ts` owns the temporal GTAO current-frame weight and
an asymmetric release invariant. Bright history may soften a transient dark
sample, but is capped to 3% above the current sample so high-contrast AO edges
cannot retain a pale neighbor. Dark history may never make a newly exposed
current sample darker. The current-frame weight remains continuous across an
isolated repeated camera pose; a binary moved/still switch made alternating
render frames snap between retained history and current AO. Four consecutive
identical poses retire history so a genuinely stopped view becomes byte-stable.
`post.ts` applies that policy inside the existing reprojection shader. The AO
history texture stores current device depth in its otherwise-unused alpha
channel. On the next frame, reprojected history is accepted only when its
stored depth matches the depth predicted for the current world point, with a
two-footprint tolerance for sloped surfaces. This rejects a trunk, leaf,
building, or vehicle that merely occupied the same screen pixel last frame.
It adds no pass, target, draw call, or texture allocation.

`src/engine/shadowStability.ts` owns texel snapping and a bounded normal-bias
law. Bias remains at least 4.5 cm for near contact, scales to 0.35 of a physical
shadow texel, and caps at 28 cm for the horizon cascade.

`lighting.ts` prepares every snapped light fit but applies a rate-capped far fit
only on the frame that renders that cascade's depth map. Near fits remain
continuous. Teleports, sun changes, captures, and covered transitions still
apply and render every cascade together.

## Consequences

- Moving tree, structure, and contact shadows no longer trail stale darkness.
- Camera-motion frames no longer retain large bright AO patches and snap dark
  when the next presented frame repeats the same camera pose.
- Overlapping geometry cannot lend AO history across a depth disocclusion.
- Far terrain avoids acne without detaching close vehicle contact shadows.
- A far cascade may remain one scheduled frame old, but its projection and
  depth stay internally coherent.
- The ordinary 60 Hz ceiling remains two continuous near maps plus one
  alternating far map; no fourth shadow submission or new GPU resource is
  added.
- Shadow QA must exercise both raw CSM motion and final temporal composition.

## Verification

    node src/engine/temporalAoPolicy.selftest.mjs
    node src/engine/shadowStability.selftest.mjs
    node src/engine/shadowRefresh.selftest.mjs
    node tools/render-stability-audit.mjs <browser-session>
    node tools/map-shadow-audit.mjs <browser-session>
    npm run perf:resources:gate
    npm run typecheck
    npm run build

The depth-disocclusion addition was compared in the same high-preset rendered
motion audit: strong dark mismatches fell from 1,613 to 763, strong bright
mismatches from 2,563 to 1,110, and repeated-pose mismatches from 769 to 550.
All four presets and the live-drive gate remained passing with zero shader or
WebGL errors.
