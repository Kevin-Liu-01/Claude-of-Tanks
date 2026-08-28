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
sample; dark history may never make a newly exposed current sample darker.
`post.ts` applies that policy inside the existing reprojection shader, with no
new pass or target.

`src/engine/shadowStability.ts` owns texel snapping and a bounded normal-bias
law. Bias remains at least 4.5 cm for near contact, scales to 0.35 of a physical
shadow texel, and caps at 28 cm for the horizon cascade.

`lighting.ts` prepares every snapped light fit but applies a rate-capped far fit
only on the frame that renders that cascade's depth map. Near fits remain
continuous. Teleports, sun changes, captures, and covered transitions still
apply and render every cascade together.

## Consequences

- Moving tree, structure, and contact shadows no longer trail stale darkness.
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
