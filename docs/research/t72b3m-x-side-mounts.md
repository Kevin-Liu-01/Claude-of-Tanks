# T-72B3M X side-armor mounting audit

This bounded correction changes only permanent `hullDetail` construction in
`t72b3mX.ts`/`t72b3mXSideMounts.ts`. The unchanged complete source is
`t72b3m_x_source.glb`, SHA-256
`1df241160448443c6cde0e13be959720acdf7b5ce3e21185ed82b0b308c744e2`.
No source owner, triangle, camera, classifier, threshold, or rig datum changed.

## Physical evidence and correction

The source top view has genuine continuous air between its narrow deck edge and
outer side armor. At X ±1.86, Z 0 and Z −0.28/−0.29, complete-source and native
vertical rays are both empty. A broad receiving shoulder would be false.

The old six round diagonal beams per side were replaced with source-stationed
mounting stock:

- Eighteen upper crossbars per side, approximately 157×28×25 mm, including the
  source's two lower forward bars. They connect to side-armor backing or the
  narrow open rail fields, not to an invented solid shelf.
- Seven bent lower straps per side at measured, nonuniform stations. Typical
  footprint 158×39 mm, height variation 55 mm. Separate inner lugs, rounded outer
  jaws, ear pairs and transverse pins provide real attachment. The inner jaw
  lip retains air below it.
- The asymmetric narrow deck returns: left Object6 island 28341 spans
  Z −3.150…2.404 and X −1.795…−1.760; right island 28330 is only the aft
  Z −3.120…−2.258 segment. The right exhaust interruption remains open.
- Thin receiving edge/case-wall stock supports the lower mounts. Existing deck
  roofs, boxes, native running gear, all ERA fields and their combat values,
  turret, gun, articulation, markings and shadows remain unchanged.

These are original closed solids and analytic bent/rounded profiles. Some source
straps are zero-thickness surfaces; their concealed 3 mm backing is an explicit
construction inference. A concealed inner 3 mm overlap seats the narrow returns
on the retained deck. Neither inference spans the source's open channel.
Small source latch/jaw differences and subsidiary inboard lugs remain simplified;
this is not an exact reconstruction of every fastener.

## Independent held-outs

Complete-source vertical first surfaces (meters):

| X | Z | Source Y | Feature |
|---:|---:|---:|---|
|1.86|1.05|1.469705|Upper crossbar|
|−1.86|1.0522|1.469751|Left upper crossbar|
|1.86|1.01|1.465224|Crossbar sloping edge|
|−1.86|1.01|1.469455|Left crossbar edge|
|1.80|−0.50|1.392597|Bent strap inner face|
|1.86|−0.50|1.372752|Bent strap outer slope|
|−1.80|0.20|1.392627|Left bent strap|
|−1.86|0.20|1.372901|Left outer slope|
|−1.78|−1.20|1.532391|Left narrow return|
|1.78|−2.50|1.521907|Right aft return|
|1.90|−0.55|1.342102|Lower jaw face|
|1.925|−0.53|1.339834|Strap/jaw junction|

The actual high/low test holds these surfaces within 2 mm, checks a real outer-ear
plane, the rounded ear's corner air, the under-clamp air, and both long channels.
It also verifies every helper vertex exists in the actual permanent owner and
positive strap/lug/jaw/ear/backing contact after all ERA is spent. Reset is tested.
The pre-change versus current CPU construction comparison proves all non-target
mesh buffers, native instance matrices and world frames unchanged; their hashes
are retained in `t72b3m_x.side-mount-preservation.json`.

## Continuity is still an explicit failure

The unchanged committed top-plan sampler was reproduced in CPU, including its
60 mm nominal cells, 3×3 subpixels and outside flood. Both complete source and
native were projected on exactly the same native-derived world grid.

| Checkpoint | Native enclosed cells | Source on same grid | Shared enclosed cells | Native-empty/source-covered cells |
|---|---:|---:|---:|---:|
|Before supports|247|249|151|96|
|Final supports|268|251|246|22|

The final grid spans the genuine additional upper-bar extrema, shifting its
horizontal cell spacing from 59.6857 to 59.8754 mm; this is a diagnostic consequence
of real geometry, not a changed sampling rule. All 22 residual differential cell
centers are themselves empty in the source; their classification differs because
some source inboard hardware occupies another subpixel in the same cell. They
are not waived or called a pass. The dominant 246 coincident openings are genuine
source air. Filling the channels to manufacture continuity 0 would be incorrect.

Ignored, full local evidence:
`reports/t72b3m-shoulder-continuity.json` and
`reports/t72b3m-side-mount-preservation.json` under `.qa-dev/`, plus source-only
scalar census/sections and the unchanged source top/quarter images.

High/low actual geometry/attachment/source tests pass; the unchanged strict CPU
track sampler reports front/rear/sweep band 0 and shoe 0, 404 actual link instances,
no anomaly in both LODs. Typecheck and the 43-function scoped quality gate pass.
These CPU results do not replace a fresh GPU fidelity/geometry/standard proof.
The earlier 95.0 fidelity/92.7 geometry checkpoint predates this mounting change.

## Fresh frozen-runtime proof

The scoped proof ran from 2026-09-07 01:19:16.330 UTC through 01:25:42.727 UTC,
using the shared FIFO for fidelity/geometry and the standard check's own capture
locking. Exact results are archived under
`.qa-dev/reports/t72b3m-side-mounts-proof-4Wv1MD/`; `archive-index.json` hashes the
raw reports, before/after runtime/source hashes, prior checkpoint reports,
same-frame source-air comparison, preservation evidence and new neutral board.
The runtime and complete-source hashes were identical before and after capture.

- Fidelity passed every valid registered view: raw composite
  **95.20387688995982**, whole **95.1204386287985**, minimum whole view
  **93.35362234064864**, tracks **95.56891928254055**. The fused-source direct
  hull/turret/gun components remain unavailable; no new semantic masks were made.
- Geometry passed: raw minimum **92.67099703553386**, whole curves
  **93.35362234064864**, dimensions **92.67099703553386**, floaters **100**.
- The official standard check exited **2**, retaining **268 enclosed cells** as
  a failure. Front/rear/sweep band and shoe violations were all **0**; MG census
  was **1**. This is not a full standard pass or a source-air waiver.

The fresh neutral board shows coherent mounting stock and retained open shoulder
channels, without a new broad shelf or obvious detached support. This bounded
render review does not assert exact reconstruction of the finer roof equipment
or every fastener. The source-air comparison above explains the dominant shared
openings while retaining the 22 differential cells and the unchanged failure.

Runtime freeze SHA-256:

- `t72b3mX.ts`: `b82c82bf47f208dd736245294182c1cf9ca636b3836cee348247f0112c23d2de`
- `t72b3mXSideMounts.ts`: `419b17c179fdf5dde1c8803deac7ccc1fcc0e1721677fa600478b97b0e1dfd2e`
