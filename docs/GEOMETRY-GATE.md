# The Geometry Gate

The authoritative, ruthless scoring mechanism for the from-scratch rebuild
program. A tank ships only when it passes **BOTH** gates:

1. **Geometric gate** — `node tools/geometry-gate.mjs --ids=<id>` reports
   **every component ≥ 90** (the minimum is the headline; nothing averages
   away a failure).
2. **Visual gate** — the independent shaded-parity critic scores the tank
   ≥ 9.0/10 on every view of its board (`&board=1`), i.e. "same vehicle,
   same tier" against the reference render.

IoU (`npm run model:fidelity`) remains a regression floor, not a pass bar.

## What the geometric gate measures

Run per tank: `tools/procedural-fidelity.html?id=<id>&geo=1`, driven by
`tools/geometry-gate.mjs`. Both models — reference GLB and procedural build —
go through the **identical** measurement pipeline (1024-px ortho masks →
column polylines). Nothing is self-reported; the procedural build can only
score by actually matching the measured reference geometry.

### Components (all must be ≥ 90)

| Component | What it is |
|---|---|
| `hullCurves` | min of side/plan/front hull-only silhouette curve scores |
| `wholeCurves` | min of side/plan/front whole-vehicle curve scores |
| `turretCurves` | min of side/plan turret-only (mask below `rig_turret`) curve scores, trimmed to each model's hull footprint ±0.6 m — barrels leave the turret comparison (they belong to wholeCurves + overallLengthM) while bustles and mantlets stay; vacuous 100 for `fixedMount` casemates (spec-driven — an emptied rig cannot fake it) |
| `stations` | 14 hull cross-sections: width + roof-height error, trimmed mean |
| `dims` | published real-vehicle dimensions vs the procedural build |
| `floaters` | disconnected-geometry islands across 5 articulation poses |

### Curve scoring

Each curve is ~90 columns of `[along, top, bottom]` in metres, traced from
the mask. Registration is translation-only (span midpoint along the axis,
mean-Δy vertical) — rotation/scale are NOT compensated, so a mis-scaled or
listing build fails. The registration is computed ONCE per view from the
**hull curves** (the hull mask contains no barrel, so gun-length deltas
cannot shift the frame — building the published-length gun against a
short-barrelled oracle stays satisfiable) and **reused** for that view's
whole and turret rows: a turret 40 cm out of position (or floating high)
cannot self-register the error away. Coverage counts BOTH directions —
reference columns the build misses AND build columns the reference lacks —
so excess geometry is as visible as missing geometry. Errors are per-column
band-edge deviations, normalised by the reference's governing dimension
(height for side/front, length for plan):

```
score = 100 − 12·meanPct − 0.6·p95Pct − 1.5·coverPct
```

- `meanPct` — mean per-column error. The dominant term: 90 requires the
  build to track the reference within ≈0.6% (≈2 cm on a 3.3 m tank).
- `p95Pct` — 95th-percentile error. Catches systematic regional misses
  without letting one aliased column own the score (raw max was gamed by
  noise, p95 cannot be gamed by hiding a bad region under 5% of columns
  wider than one feature).
- `coverPct` — columns where only one model has geometry (overhang/length
  mismatch), with a margin of 0.75 column-pitch so sub-pixel edge jitter
  never counts as missing volume.

Every curve row in the report carries `worst`: the 12 worst columns with
`at / refTop / refBot / procTop / procBot / errM` — the exact work order
("at z=+4.36 your bow bottom is 0.58 m too deep").

### Stations

14 slices along each model's own hull **z-range measured from its side
hull mask** (gun-invariant — a long barrel cannot skew the slice positions
onto empty air), comparing width% and roof-height% (relative to height).
Trimmed mean (2 worst slices dropped — a bustle overhang must not mask
everything else, but systematic width error still fails):
`100 − 10·trimW − 10·trimTop`.

**Station-slice visibility (edge-on prism law, russia r7c):** the
station cameras render a ~0.52 m near/far-clipped z-slab, so an
axis-aligned long thin box presents ONLY its end caps to the front
camera — its side/top faces project to zero width and the part is
invisible at every mid-span slice. Any gate-facing thin/long kit
(sidewall strips, full-length fender prisms, rails) authored as a
single axis-aligned prism will silently depress `stations` width rows
even though the silhouette views see it fine. Author such kit
segmented (per-bin boxes with real end faces, like actual stowage) or
give it front-facing geometry. This is a build defect pattern, not a
measurement artifact — the pipeline measures correctly (probe:
`tools/tmp-r7ru-stations.mjs` precedent, t62mv1 stations 54.2 → 76.1
from segmentation alone).

### Dims — the published-spec anchor

Measured **from the procedural build's curves** against `spec.dims`
(published real-vehicle data): `heightM` and `hullLengthM` from the side
body extent (columns with band > 12% of height, so gun barrels don't count;
roof = p95 of column tops, so a 2-column antenna mast doesn't define the
height), `overallLengthM` from the full side span (gun included), `widthM`
at PIXEL resolution from the plan mask (trace columns quantize to ~11 cm
when a long gun pins the frame; lit-pixel extent resolves ~2-3 cm) over
pixel columns with > 0.35 m of band — skirts and fenders count toward
width (published widths include them); whip antennas don't. Score:
`100 − Σ max(0, pct − 1)·8` — 1% grace per dim, then 8 points per percent.

This is the anti-gaming anchor: a build that "matches" a defective oracle
(sunken hull, sky-high fused turret) still fails dims, and a build that
matches dims but not the curves fails the curves. You cannot satisfy both
without being actually right.

### Floaters

Articulation poses (turret 0/90/180, gun full depression/elevation), 2-pass
dilated mask, any disconnected island > 400 px in any pose = fail. Turrets
that leave their baskets, guns that separate from mantlets.

## The loop

```
node tools/geometry-gate.mjs --ids=<family ids>
  → docs/geometry-gate/<id>.json   (scores + per-column work orders)
  → docs/geometry-gate/ledger.json (tool-written only, never by hand)
```

1. Builder reads its family's JSONs, fixes the worst component using the
   `worst` columns and station/dim rows as the work order.
2. Re-run the gate. Repeat until every component ≥ 90. There is no
   iteration cap — the gate defines done.
3. Then the visual gate: regenerate boards, independent critic scores
   shaded parity ≥ 9.0/10 per view. Geometry ≥ 90 with a failed critic
   means readability/material work, not silhouette work — fix and re-run
   BOTH (any geometry edit invalidates the previous critic verdict).
4. Family commit only when both gates pass (or a defect cap is certified).

### Certified oracle-defect caps

Some references are physically defective (fused rigs, yawed bodies,
short-modelled barrels — see `tools/repair_oracles*.py`). If a component is
provably capped by an oracle defect: document the cap in
`docs/references/tanks/<id>.md`, repair the oracle if a rigid transform can
(batch queue), and the build must then match **published dims + the
undamaged views**. A cap certification never excuses `dims`. Because
registration is hull-anchored, a short-barrelled oracle caps ONLY
`wholeCurves` (via the symmetric-coverage penalty on the build's correct,
longer gun) — hull, turret, stations and dims all remain fully satisfiable,
and a cap claiming more than wholeCurves on such an oracle is invalid.

The dual defect — a fused tube authored provably LONG (beyond the
published overall length, e.g. m46's reused m26 tube at +6.6%) — caps
`wholeCurves` AND exactly those `turretCurves` plan columns the tube
itself occupies (the plan trim is lateral, so a fused tube's forward
extent stays inside the trimmed centre columns; the capped columns must
be listed per-column in the tank's packet). Hull, stations and dims
remain fully satisfiable, and side-view turret rows are NOT covered by
this cap.

Graduated tanks (dual-gate passes whose in-game GLB registration has
been retired) remain measurement-bound: their reference files stay on
disk as oracles, and until the harness grows a graduate-reference
override, freeze verification is by geometry-hash invariance of the
procedural build (`tools/tmp-hashgeo.mjs`) — a gate run against a
missing reference writes a false 0 row and must not be recorded in the
ledger.

### Anti-gaming rules

- Both models are measured by the same pipeline; builders never hand the
  gate numbers.
- `min()` everywhere — no averaging across views, components, or tanks.
- Published dims anchor the scale; width normalisation in the game loader
  means exceeding the committed max width silently rescales the whole tank
  (WIDTH GUARD comments in the profile files).
- The ledger is tool-written; hand edits are a program violation.
- Reference GLBs remain **measurement oracles**: dimensions may be read,
  vertices may never be extracted, traced, or embedded (HANDOFF-FABLE §
  licensing; measured polylines in `docs/references/profiles/` are
  dimension data, like reading a blueprint).

## Current baseline

See `docs/geometry-gate/ledger.json`. At gate freeze the fleet's best tank
(m60a1) scores min 40 — the gate is deliberately far ahead of the fleet.
That is the point: it is the definition of done, not a description of today.
