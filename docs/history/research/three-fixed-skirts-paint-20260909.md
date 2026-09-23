# Fixed skirt finish continuation — 2026-09-09

Status: local preservation, not a released or qualified checkpoint.

Native 14 m full-size side images confirmed broad black fixed panels on
T-90 X, T-72BU X and T-62MV-1 X. Eight, twelve and twenty existing sheets,
respectively, now use the common camouflage material and spatial UVs.
The opt-in `hullFixedPaintedBodywork` bucket retains their old full-distance
visibility and non-armor role. It does not use a track-exclusion tag. Genuine
flexible rear flaps, running gear, canvas and hardware keep their finishes.
No panel geometry, axle positions, tire openings or armor values changed.

The test-only exact finish inverse authenticates the complete original source
files at `d94d690b2` against independently saved SHA-256 values. It preserves
the older complete-model armor hashes by reversing only these explicit paint
assignments (and the already declared tire-opening changes). Actual candidate
facets, projectile checks and stock/air grids still run on the real camouflaged
panels. No expected geometry hash or gap threshold is refreshed.

The first whole-model differential caught the new painted bucket being omitted
from `installProceduralShadowProxies`. Including it in the hull sources repairs
that actual shadow regression. No geometry fingerprint or expected shadow
buffer was changed to make the check pass.

Completed after the shadow repair:

- `fixedSourceSkirtPaint.selftest.mjs`: all three profiles, HIGH/LOW,
  factory/winter, 36 posed/all-ERA-depleted comparisons passed. Every physical
  skirt triangle and every other mesh buffer/material/transform, including
  the shadow proxy, retains its pre-finish value except the declared paint.
- `sourceXSovietAuxArmor.selftest.mjs`: nine models at HIGH/LOW, 1,214 physical
  facets, real stock/air grids and original whole-model hashes passed.
- `sovietSecondWaveGeometry.selftest.mjs` and `npm run typecheck`: passed.
- React Doctor changed scope versus `2d1f12e86`: nine files, score 84/100,
  three non-frame-loop array-iteration warnings in test code. No new runtime
  finding. These warnings were retained, not suppressed or called fixed.

The 72-frame native HIGH/LOW, factory/winter, six-view capture completed before
the shadow correction. Root reviewed all three HIGH factory left views and
LOW winter front-left views: the fixed skirts now carry camouflage and lower
wheels remain visible. This is not a claim that all 72 frames were approved
or that the corrected shadow has fresh native proof. The earlier 216 wheel
capture remains the pre-finish visual evidence. A new final-source capture,
anatomy/assets and release qualification remain open. This does not repair the
still-thin tracks or certify full-fleet performance.

Owning tree: `/Users/kevinliu/.codex/worktrees/cot-amx30-wheel-face-style-20260909`.
New native output: `.qa-dev/three-fixed-skirts-native-20260909-r1/` (ignored).
Source models and temporary QA files are excluded from the commit.
# Integrated recovery preflight — 2026-09-10

At `d0455875c`, the recovered batch is based on the corrected T-90 X
direct-cradle NSVT and canonical Shtora source. Fixed-skirt HIGH/LOW,
factory/winter and posed/depleted checks pass; painted wheel-face witnesses
pass on the seven affected Soviet profiles; all nine auxiliary-armor models
pass HIGH/LOW with their unchanged frozen whole-model fingerprints and
1,214 actual physical-facet witnesses. These focused passes do not replace
the remaining regenerated assets and fourteen-ID release gate.
