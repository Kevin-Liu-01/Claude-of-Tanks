# Source-study X fleet — 2026-09-05

Status: **registered release qualification passed, 2026-09-06 10:49:59 UTC**.
This batch preserves the existing models and adds thirteen independently
authored procedural builds. The X is a temporary name suffix, not a request
to assign every vehicle tier X.

## Final result

All thirteen pass the unchanged registered 92-point source-fidelity and
geometry gates, with zero front/rear/swept track intersections, zero enclosed
continuity holes and a supported machine-gun census for every vehicle. All
**510 self-test files** pass (143 preflight, 339 core, 28 postflight), followed
by the private build, typecheck and public build. Anatomy update/check and all
130 X icon/technical assets are current.

The exact final fidelity capture is **2026-09-06T10:06:54.116Z**, archived in
each packet's adjacent `.fidelity.json` with the common full-report SHA-256
`ee86f42a4a08b0fea48fb259e5e15ff6db91785e4a640b7f1305c2d261bac7df`.
The table rounds only for readability; acceptance uses the stored raw values.

| Variant | Fidelity | Minimum whole view | Geometry minimum |
|---|---:|---:|---:|
| [Leopard 2A7V X](../references/tanks/leo2a7v_x.md) | 94.17 | 92.05 | 92.05 |
| [Leopard 2A6M X](../references/tanks/leo2a6m_x.md) | 94.85 | 93.44 | 93.44 |
| [Leopard 2A4M X](../references/tanks/leo2a4m_x.md) | 95.33 | 93.02 | 93.02 |
| [Leopard 2A5 X](../references/tanks/leo2a5_x.md) | 96.73 | 96.44 | 93.01 |
| [Merkava Mk4 X](../references/tanks/merkava4_x.md) | 94.05 | 92.68 | 92.68 |
| [Merkava Mk3D X](../references/tanks/merkava3d_x.md) | 95.11 | 93.35 | 93.35 |
| [K2 Black Panther X](../references/tanks/k2_x.md) | 95.25 | 92.97 | 92.97 |
| [KF51 Panther X](../references/tanks/kf51_x.md) | 97.54 | 97.00 | 93.64 |
| [T-90A X](../references/tanks/t90a_x.md) | 97.37 | 96.13 | 92.33 |
| [T-90A Vladimir X](../references/tanks/t90a_vladimir_x.md) | 96.74 | 94.41 | 94.41 |
| [T-90M X](../references/tanks/t90m_x.md) | 97.56 | 97.52 | 93.15 |
| [T-90SM X](../references/tanks/t90sm_x.md) | 97.27 | 96.51 | 92.44 |
| [T-14 Armata X](../references/tanks/t14_x.md) | 96.97 | 94.55 | 94.55 |

Coverage limitation: the five segmented source registrations support separate
component gates; the eight fused/unsegmented registrations do not support
invented hull/turret masks. Whole-vehicle comparisons and independent physical
witnesses remain required. Expanded non-gated diagonals were also visually
reviewed: A5's additional front-left turret diagnostic remains **91.5**, with
both internal-basket and smaller exterior residuals. This is not a claim that
every possible diagnostic exceeds 92 or that these are perfect source copies.

The final read-only handoff audit verifies all thirteen exact archived rows,
their source-registration availability contracts and fresh geometry receipts.
It also verifies **165 original asset records and 1,650 original images** remain
byte-identical. The completed public artifact contains 2,745 files, no supplied
source model/archive or forbidden reference-loading path, and only the unchanged
original world-prop binary pack. The public registry contains 151 playable
vehicles and **zero GLB-sourced playables**. Local ignored comparison inputs
are retained for authoring; they are excluded from public distribution.

The full run log and additional local screenshots/audits are retained under
ignored `.qa-dev/reports/`. Geometry JSON freshness uses post-capture file times,
not an embedded native-buffer signature; the separate preservation, source-ray
and runtime tests supply the additional physical evidence. The development
checkpoints below retain their original failures and pending states as history;
this dated final section and the newly archived receipts are the current result.

## Reference-only authorization

The owner supplied the thirteen local source files and, after explicit notice
that T-90A and Merkava Mk.3D were confirmed commercial-game extractions, instructed
us to use those files because they would not be used in the actual game. This
is a **batch-specific local measurement/comparison exception**, not a claim that
the uploader owns those meshes or that they are licensed for redistribution.
The same restriction applies to Leopard 2A5's confirmed War Thunder source.
No supplied vertices, indices, textures, rigs, animations, source-derived baked
mesh arrays, or reference-loading paths may enter the playable runtime or public
distribution. Local comparison inputs remain ignored authoring artifacts; the
public build additionally strips their directories from the distribution.
Individual packets retain the actual provenance findings.

## Maintained local comparison tools

These CPU-only diagnostics are reusable authoring tools, not runtime imports or
release-score replacements. Run them from the repository root with the ignored
canonical reference GLBs already present in
`public/models/community-candidates/`. They do not download or redistribute
sources. Keep their JSON output under ignored `.qa-dev/reports/`; never turn the
reported source hit cells into playable mesh buffers.

- `node tools/source-world-registration-local.mjs` checks the registered source
  hashes and the reference/procedural hull, turret and gun world frames. It emits
  one JSON record per registered certificate and exits nonzero on a mismatch.
- `node tools/source-slab-study.mjs` compares fourteen longitudinal physical slabs
  of the KF51 X source and procedural model. This diagnostic is intentionally
  fixed to `kf51_x`, accepts no tank selector, and prints paired scalar bounds;
  it does not assign a fidelity pass.
- `node tools/t90x-component-ray-audit.mjs t90a_x turret` reports front/side
  occupancy discrepancies by physical object and quantized ray cell. The second
  argument can be `hull`; defaults are `t90a_x turret`. This requires genuinely
  segmented `OracleHull`/`OracleTurret`/`OracleGun` nodes in the canonical source.
  A fused source cannot supply valid component evidence, even if its ID passes
  the command's T-90-family argument filter.
- `node tools/t90x-lower-course-audit.mjs t90m_x` reports twenty-seven lower-course
  height bands and side-ray disagreements against a segmented `OracleHull`.
  `t90m_x` is the default. Output is a diagnostic, not a release receipt or a
  permission to exclude inconvenient track geometry from the registered gate.

## Work and evidence index

| New ID | Preserved original | Distinct source/build emphasis |
|---|---|---|
| `leo2a7v_x` | `leo2a7v` | Genuine deep optic recess, corrected source datums |
| `leo2a6m_x` | `leo2a6m` | L/55, mine-protected hull, VLO isolation |
| `leo2a4m_x` | `leo2a4m` | Canadian add-on cheeks and skirt geometry |
| `leo2a5_x` | `leo2a5` | Full-height wedge cheeks and source-specific equipment |
| `merkava4_x` | `merkava4` | Forward engine hull, tapered turret, width corroboration |
| `merkava3d_x` | `merkava3d` | Dor Dalet modular turret and rear access |
| `k2_x` | `k2` | Source-specific hull/turret proportions and running gear |
| `kf51_x` | `kf51` | Neutralized source yaw/elevation, independent Panther shell |
| `t90a_x` | `t90a` | Welded turret, Shtora/ERA seating |
| `t90a_vladimir_x` | `t90a_vladimir` | Separate owner source, independently measured geometry |
| `t90m_x` | `t90m` | Bustle, new turret and correctly seated roof equipment |
| `t90sm_x` | `t90sm` | Export turret and rear overhang, duplicate track phases excluded |
| `t14_x` | `t14` | Unmanned shroud, recessed sights, physical gun throat and APS spaces |

## Acceptance, not self-certification

- Source inventory, hash, component ownership and measured hull/turret/gun/gear
  datums precede first-party authoring. Raw and corrected dimensions are separate.
- A fused source cannot support invented component masks. Register only honest
  comparisons and explicitly record any unavailable component metric.
- Registered exemplar threshold: 92 overall and on every valid gated component
  and silhouette view (the minimum is mandatory, not the average). Coverage is
  nine whole-vehicle views and five cardinal hull/turret views where source
  segmentation permits them; expanded diagonal component diagnostics are also
  reviewed but are not gated. A5's remaining 91.5 optional diagonal is disclosed
  below. Other requirements are
  declared source/spec dimensions within 3%, zero track/body intersections,
  closed structural skins, real negative-space floors/reveals, proper supports,
  and real turret/gun articulation.
- Independent multi-view shaded inspection must accompany numeric overlap.
  Neither a high triangle count nor self-assigned scores establish fidelity.
- Re-run anatomy generation/check, targeted full release checks, public asset
  stripping, and focused regression tests before a release claim.

## Baseline scanner

Required Improve Three.js read-only scan at base `2c22d203d`: React Doctor 49/100,
232 pre-existing findings (5 errors, 227 warnings). This is a broad diagnostic
baseline, not a reason to alter unrelated rendering/gameplay code in this batch.
The changed-scope scan returned 84/100 over 24 tracked changed files, with one
low-priority chained-array warning in the cold `balanceAudit.ts` helper. Because
that scope omits untracked new builders, a complete follow-up scan also ran:
49/100, 236 findings, the same five existing errors. The four additional warnings
are that cold balance helper and three source-geometry test array operations;
none is a frame-loop or GPU lifetime finding. The overall score is unchanged
from baseline. No unrelated scanner findings are suppressed or changed.
Rendered checks and final release qualification are tracked independently.

The later changed-scope scan covered 28 tracked files and returned 83/100:
one error and four warnings. The new error is a confirmed cross-function
false positive: `placeSuspensionBoss` writes the instance matrices, and its
only caller `updateSuspensionLinks` marks `suspensionJointIM.instanceMatrix`
for upload once after both endpoint writes. Per-joint upload flags would be
redundant; no rule suppression was added. The additional warnings concern
cold track-support construction and offline geometry comparisons, not a
frame-loop regression. The raw changed-scope score is one point lower and
is recorded as such, not represented as an improved score. The source-fitted
running-gear tests also exercise transformed live suspension endpoints.

## Dimensional datum separation

Core armor length, exterior equipment envelope and the gate's filtered side
silhouette span are different quantities. The `silhouette*` metadata below is
measured from the **source**, never from the candidate. Source and native use
the unchanged 1024-pixel / 96-column geometry-gate pipeline and thresholds.
Physical armor surfaces, fitted equipment and wheel datums have separate
source-fixed mesh/ray assertions in each profile's tests.

| ID | Structural hull (m) | Exterior hull/fittings (m) | Source filtered span (m) | Source occupied P95 height (m) |
|---|---:|---:|---:|---:|
| `k2_x` | 7.3418 | 7.8535 | 7.566 | 3.020 |
| `t90a_x` | 6.86 | 7.9922 | 7.888 | 2.727 |
| `t90a_vladimir_x` | 6.86 | 8.1115 | 8.016 | 2.881 |
| `t90m_x` | 6.86 | 7.8329 | 7.686 | 2.828 |
| `t90sm_x` | 6.86 | 8.0598 | 7.770 | 3.113 |

For Merkava Mk.4 X, the source's four thin whips enter enough coarse-column
bins to yield a 4.655 m occupied P95 height at the actual gate raster, whereas
the independent 1536-pixel extractor reports 2.996 m. Neither is roof height.
The fixed gate datum is 4.655 m; the physical raised armor roof remains 2.565 m
and is independently tested. Antennas are not shortened to force this statistic.

## Independent source-world curve registration

The A5, T-90A/M/SM and KF51 canonical oracles have independently measured
ground-zero, hull-centered metre frames and actual turret/trunnion datums.
`tools/source-world-registration.mjs` pins their local oracle hashes and those
source datums. A missing/mismatched hash, shifted/rotated/scaled root or misplaced
articulation anchor fails closed. These comparisons retain the physical source
frame: no candidate width scaling, outline-midpoint translation or mean-height
refit. Cross-sections also retain the exact source Z slice planes and ground
datum, so a longer body cannot rescale the sampling stations. The source
loader's width normalization must independently remain unit
scale within numerical tolerance; the measured shape is never fitted to pass.

This corrects a demonstrated methodological defect: the old hull-span midpoint
introduced a 0.113 m A5 offset despite independently coincident world datums.
Identical source-self renders score 100; 10 cm root/turret/gun displacements
fail the datum checks. The authoritative curve scorer also has source-self and
displaced-outline regressions. The mask extraction, 96 stations, 1024 raster,
92 floor and missing-volume penalties are unchanged. Actual residual A5 plan
and T-90M contour failures remained work orders at that checkpoint; subsequent
physical revisions passed scoped recaptures and await the composed final run.
Other registrations retain their
existing behavior; no source's semantic ownership is inferred from these tests.

### Physical station intersections

The certified-world station check now intersects actual triangles with the
same 14 source Z slabs for both models. An uncapped front-camera clip projects
Z-parallel flanks to zero pixels; KF51 source/native widths spuriously measured
3.373/3.120 m in one slab and 3.192/3.530 m in another. Independent triangle
intersections establish 3.560312 m on both surfaces. The diagnostic works on
active visible geometry and instance transforms, returning scalar bounds and
part names only. It does not fill gaps, add model caps or import source data
into playable geometry. Source-self, parallel-wall, empty-space, visibility,
instance and 10 cm displacement regressions cover it. Station thresholds,
whole/hull/turret outline scores and original non-certified registrations are
unchanged; method identifiers are included in new receipts.

## Combat-equivalent presentation variants

The X variants retain their donor's combat settings and tier. Their verified
`balancePeerOf` relationship gives the donor one peer-median vote, not fourteen
weighted votes caused by extra visual IDs. Every X still undergoes the full
outlier audit. Any changed metric, missing peer or cyclic hint counts as an
independent row; copies of an outlier are each reported. The floor/ceiling
thresholds and all original combat settings remain unchanged.

## Source-exact roof weapon ownership

The four T-90 X variants retain their independently authored receivers, barrels,
cases and support parts. `sourceMachineGun.ts` merges those existing primitives
into two visible material meshes per weapon and uses the existing
`FITTINGS.markExact` contract (BUILD-STANDARD §K.4). This is not a marker-only
override or a substitution of a generic weapon. Independent high/low tests
verify all four source barrel endpoints, forward axes, turret rig ownership,
visible geometry, and exactly-once resource disposal. The shared fitting census
and its minimum are unchanged. The physical mounts outside the weapon groups
remain attached to the same turret rig.

Final geometry/fidelity recaptures and the full release pass must include this
ownership migration; prior passing images alone do not qualify later changes.

## Interactive Gallery review (pre-release)

The isolated worktree's live Gallery was reviewed with agent-browser at
1600×1000 and 430×932. A7V camera presets initially cropped the long barrel
in side view; a narrow viewport also cropped T-14. `cameraFit.ts` now fits
the actual full visible bounding envelope to both frustum axes and preserves
the user's relative orbit/zoom across aspect changes. Eight directions,
asymmetric long-gun bounds, four aspect ratios and resize round trips have
focused projection tests. Independent review also reproduced OrbitControls'
old 38 m limit clipping the 320 px side view and the fixed fog hiding a
correctly fitted model. Fit-relative control limits, far clipping and fog now
cover the full allowed zoom range; regression tests use the real OrbitControls
update cycle and test all corners before the fog, including at maximum zoom.
The 320×844 right view and return to desktop were visually rechecked. This
changes only the interactive Gallery camera,
not reference registration, model dimensions, or comparison render cameras.

The same A7V right view and T-14 narrow view were recaptured and inspected:
the entire model remains within the viewport. T-14 elevated-right and
K2, Merkava Mk4 and KF51 live appearance also rendered without browser script
errors. At that preliminary checkpoint, scoped portrait/diagram generation was
still pending; the missing
new dossier thumbnails in these preliminary captures are not accepted as
release-ready. Browser sessions and the shared capture lock were released.

At this checkpoint the 337-file core run stopped at a stale generated A7V
marking-seat position in `vehicleMarkings.selftest.mjs`. The source geometry
support test passes, but generated marking seats must be refreshed by the
mandatory anatomy procedure before rerunning the full suite. The separate
28-file post suite, all thirteen original-geometry preservation checks,
high/low X articulation/support checks and native provenance audit passed.
These partial results are not a full release PASS.

The unchanged muzzle-bore and turret-barrel-circularity tools also passed for
all thirteen X variants. The latest changed-scope React Doctor scan remains
83/100 (one caller-owned instance-buffer-upload false positive and four cold
path warnings); it did not regress after the Gallery fix. A separate explicit
scan of all 33 new runtime TypeScript files at that checkpoint found 512
functions, zero complexity violations, and no explicit `any`/`unknown`.

## Pre-release provenance and loading audit

The independent final registry audit constructed all thirteen X variants through
their actual lazy loaders. All six geometry groups and both generated-receipt
loader sets resolve, and all thirteen original geometry fingerprints remain
unchanged. The 189-module runtime import closure has no reference-tool or source
mesh dependency; the 65-module static boot closure does not eagerly import X
geometry. All thirteen local comparison GLBs are ignored under the directory
removed by the public-build stripper. The new JSON evidence contains scalar
measurements and fidelity results, not embedded media or playable topology.
These checks passed before the final asset/build pipeline and do not replace it.

## Exact decision arithmetic and release composition

The independent final tooling review found that displayed component means and
station/dimensional errors were rounded before some decisions. This could turn
91.996 into a displayed 92.00 and incorrectly accept it. The corrected browser
path feeds raw component values to fidelity, retains raw station/dimension
errors through scoring, and passes unrounded curve registration downstream.
Receipts retain both display values and `rawScores`/`rawComponents` with raw
minima. Regression cases at 91.996 and 91.96 fail; an actual 92 passes. No score
formula, floor, camera, source ownership or missing-volume penalty is relaxed.

`tank-release-check --gate` now requires a fresh strict per-view fidelity run
as well as the existing geometry, track, continuity and fitting checks. The
tested release plan serializes each otherwise-unlocked browser subprocess,
without wrapping the self-locking standard checker and deadlocking its queue.
Browser errors also invalidate fidelity instead of merely being recorded.
All thirteen must complete the final pipeline under these corrected decisions;
the earlier rounded receipts are not the final release evidence.

## Final integration checkpoint

The T-90SM major-form checkpoint cleared unrounded geometry 92.4444746658 and
fidelity 97.2588451726, with zero front/rear/full-sweep track intersections,
zero continuity failures and one actual roof weapon. Independent neutral review
then identified a bounded equipment refinement: six partial barrel saddles,
shallow glacis ribs/latches, supported edge tabs and two genuine recessed
overlay seams. Those fittings required the fresh round-fourteen capture below;
their passing major-form predecessor was not substituted for that evidence.

The full 151-row anatomy and marking-seat generation now completes, and
`vehicleMarkings.selftest.mjs` passes for all 151 tanks. The next core preflight
got past that old failure and stopped at `tankAssets.selftest.mjs`: the new X
entries did not yet have their nine generated presentation views. The asset
stage below subsequently closed that failure. These partial checkpoints were
not a full test-suite PASS; the all-thirteen release pipeline remains required.

The final fourteenth T-90SM capture now includes those fittings: exact geometry
minimum 92.44447466576615, fidelity 97.26765174089836 and whole-view minimum
96.5156561812139. Every valid component/view passes; front/rear/full-sweep track
intersections and continuity failures are zero. Independent neutral-image
review passed. This is the frozen model used by the composed release pipeline.

### Asset-stage findings

The composed anatomy update/check passed: 151 current anatomy/marking receipts,
453 current technical images, 1,300 authored modules and 302 track sides, with
zero failed modules or outside-envelope modules. Its 69 advisory dimensional
warnings are retained. The five X warnings compare non-ERA armor-plate bounds
with structural dimensions: A6M skirts span 3.760 m while its exterior cage
datum is 3.980 m; the T-90 guard/cage-inclusive spans are 7.382/7.5245/7.335/7.592 m
against the separate 6.860 m structural hull. These are not source silhouette
measurements or per-surface collision verification; no threshold or model was
changed to silence them.

The first scoped asset run correctly rejected KF51 X's portrait (114.9 card
pixels high). Its new portrait alone now shows more chassis side, retaining
the physical antennas, dense-core normalization, baseline and unchanged audit
limits. The scoped retry passed. Independent image review also identified
Merkava Mk.3D X/Mk.4 X technical silhouettes crowding their footer/legend.
Their technical camera alone now fits the complete vehicle inside the actual
312×164 px content opening, with at least 9 px above the footer. Actual high/low
builders reproduce the old overlap and pass the corrected projection tests;
all six corrected images passed independent visual review. Metadata/anchors
and 528 unrelated side images remained byte-identical. All thirteen scoped
asset sets and their freshness checks subsequently passed. The composed full
release run remains in progress.

The subsequent fresh, composed source-fidelity run passed twelve variants and
correctly stopped on KF51 X: its unrounded gun score was 91.3285668547 and its
turret left/right views 91.7417402269/91.7539841125, below the unchanged 92 floor.
The whole-tank result (96.4909703212) does not override those failures. Its old
round-seven receipt is therefore not final evidence; source-frame/physical
geometry diagnosis and a new full release run are required before qualification.

### KF51 comparison-coordinate regression and assembled gun check

The no-model-edit GPU counterfactual established the cause. Marking planes
extended visible width from structural 3.5603120327 m to 3.5642235840 m. The
ordinary comparison's additional width normalization scaled every candidate
vertex by 0.9989026267. The unchanged reference gun occupied 919 pixels, while
the candidate dropped from 916 to 859. Holding the independently certified
source metre frame restored exactly the prior 916 pixels and gun score
96.6602278655, with turret sides 92.9473/92.8709. The markings remained rendered;
generated-seat and live-solver paths had identical hull/turret/gun buffers.

All five existing hash-pinned source-world certificates now apply equally to
ordinary fidelity and geometry, instead of only `geo` mode. No certificate was
added just for a failure, and no mask, score formula or floor was relaxed.
Tests execute the real HTML selector and fit branch in both modes: a marking
extent cannot shrink certified geometry, unknown legacy references retain
their old behavior, and incorrect hashes, roots or displaced pivots fail.
Receipts also retain registration mode and unrounded normalization anchors.

The same inspection found that the legacy `/shadow/i` name filter incorrectly
removed real, visible cannon rims/annuli named `muzzleBoreShadowFallback...`.
Shadow-only proxies remain excluded; actual tagged cannon-mouth geometry now
remains in the masks. A new actual-builder test covers all thirteen high/low
representations, including the low-detail merged lip/disc implementation.

The bare KF51 neck's apparent 20 mm shortfall was not an assembled-muzzle
defect: its native lip reaches within 2.40 mm of the source endpoint. That
assembly was preserved, avoiding a false proud extension. Only the separately
measured collar changed, from 85 mm to the source's 202.599 mm axial span and
measured radius. High/low tests verify its source-fixed edges, five held-out
rays, neighboring jacket/neck continuity, actual terminal rim seating and
shared 100 mm recoil. The final pipeline was restarted after this refinement;
the earlier failed run remains documented rather than relabeled as passing.

The following CPU preflight found one additional stale fleet census in
`ammunitionFlow.selftest.mjs`: 494 preserved ammunition channels plus thirteen
three-channel additions now require 533. Only that expected count changed.
The test then passed all 533 actual final-round launches, 1,056 depleted-slot
transitions and the unchanged 22 guided-authority launches. No ammunition or
combat behavior was modified to obtain the result.

### ERA depletion and canonical articulation preflight

The next preflight stopped the release before visual qualification: 36 inherited
ERA zones across nine X variants had no removable visual binding. Their actual
first-party cassettes now bind to those existing gameplay zones; fixed turret
shells, hulls and mounting structures remain permanent. A7V/A6M concealed cover
depth is explicitly an authoring inference, not a source explosive-technology
claim. No donor reduction values or original-tank geometry were changed.

The old rectangular point-cloud fit also extended protection into empty corners
of bent or trapezoidal armor. X cassettes now select exact triangle offsets from
their own first-party geometry; transformed vertices define the hit faces, and
attached expendable hardware cannot enlarge that field. Legacy unannotated
parts keep their existing fitter. Indexed/nonindexed, invalid-index, actual-hit,
spent-state and missing-corner controls pass without widening tolerances.

The same real-hit tests exposed inherited donor yaw/trunnion coordinates in all
thirteen combat specs. The independently measured source datums and physical
barrel lengths now survive both initial registration and later donor balance
synchronization. The visible muzzle matches the canonical combat transform at
three yaw angles and every legal elevation endpoint in high and low detail;
all thirteen original donor geometry fingerprints remain unchanged.

Unmodified integration tests pass 72 high/low ERA zone flows and 2,836 actual
fitted-face witnesses: first-hit activation, removal of the correct cassette,
unchanged permanent backing, spent second-hit exclusion and exact reset.
Markings are additionally checked for complete physical support after all ERA
is depleted. These changes invalidate earlier anatomy/material/asset receipts;
the complete mandatory generation and release chain must pass again before
this batch is called release-qualified.

The exact-facet audit also reproduced a real T-90SM shared-edge collision:
two triangles of one cassette incorrectly counted 30 mm rather than 15 mm
for HE, and applied its reactive reduction twice in the HUD/AI estimate.
The live KE activation already spent the zone once. The HE path now excludes
only coincident same-zone surfaces; the estimator follows the live per-zone
activation rule. Real high/low rays, different banks and 0.1 mm-separated
physical layers are independent controls. The existing damage coverage gate
still passes 100% statements, branches, functions and lines, without exclusions
or threshold changes.

Fully annotated zones also publish their complete receipt once per owner/name
after generated anatomy expands them into hit faces. The SM case retains all
231 actual faces in four rows, avoiding the former 23,245 duplicated entries
and 5.7 MB of receipt JSON. Legacy and mixed per-plate fitting frames remain
byte-identical. This is construction/receipt work, not a new per-frame loop.

The refreshed full-fleet ERA audit passes 64 vehicles, 299 depletable zones,
6,490 fitted faces and 400 reactive visual sectors. The post-fix Three.js scan
remains 83/100 on changed files. Its additional array-chain warning is the
construction-only exact receipt compaction above; the instanced-upload finding
still points to a helper whose caller sets both dirty flags, independently
tested through actual moving and reset instance-buffer versions. No scanner
rule was suppressed or weakened. Final browser rubric and source renders
remain part of the composed release run, not inferred from these CPU results.

### Final composed-run rejection and independent visual review

The 07:23 UTC fresh fidelity run correctly rejected T-90A X: its overall score
was 96.4243, but the gun component was only **91.63858786699103** against the
unchanged raw 92 floor. All other twelve entries passed. The newly included
physical muzzle geometry exposed a residual generic barrel/sight mismatch;
the source audit found 10–14 mm excess barrel thickness and an approximately
50 mm proud generic muzzle-reference fixture. This is a model correction,
not grounds to exclude the real mouth or relax the metric.

Independent shaded inspection additionally identified a broad missing crown
on the Vladimir forward guards (up to 162 mm at held-out source ray stations).
The A7V/KF51/T14 boards otherwise retained the major recessed structures,
supported equipment and coherent articulation. Fine grille/fastener and native
running-gear surface simplifications remain visible; silhouette scores do not
establish exact reproduction of every small fitting.

Technical-card review found label-gutter overlap on all thirteen X builds.
Only their technical cameras now fit the complete visible envelope into the
actual 312×164 px content opening, including whip tips, muzzle and shoes. The
high/low test proves each old-layout overlap and the new clearances, while all
original fleet cameras, ordinary portraits, source comparison rigs, physical
dimensions and presentation anchors remain unchanged.

The T-90A gun now uses independent source-measured circular sections, the real
evacuator and seam strips; the unsupported generic sight fixture is removed.
Its scoped rerun passes gun fidelity 99.5765052954 and raw geometry minimum
92.3276416642. High/low held-out rays, the actual mouth and recoil remain tested.
The Vladimir guard correction replaces only the two old ramp solids with thin
closed, rolled covers and noses. Source crown heights/normals, transverse folds,
real wheel-well air and positive lap contacts pass independent tests. All other
Vladimir vertices retain their pre-correction fingerprint. Its fresh scoped
render passes raw fidelity 96.7445432070 and raw geometry/whole-view minimum
94.4078658968. The source has fused hull/turret ownership, so those component
scores remain explicitly unavailable rather than invented. The composed final
regeneration remains required.

### Frozen-model scanner and preservation audit

React Doctor 0.9.13 reports 83/100 on the 35 tracked changed files, with the
same six diagnostics as the preceding scan. Including untracked tests gives
82/100 over 155 files; the additional ten findings are test-only. An explicit
scan of all 40 newly authored TypeScript files (including the final gun and
guard helpers) reports 100/100 with zero findings. The full repository remains
49/100, with 246 findings; this is not a globally clean-code claim. The camera
projection finding is another helper-boundary false positive: its immediately
called assertion helper updates the projection matrix before testing it.
Actual camera, suspension-buffer and ERA multiplicity regressions pass.

The independent frozen-model asset audit verifies all 165 original manifest
records, 495 original technical images and 1,155 ordinary images byte-for-byte.
Only thirteen X entries are added. All thirteen canonical reference GLBs remain
ignored, no source binary/archive/non-icon texture is Git-eligible, and the six
X loader groups' 63-module dependency closure contains no reference loader or
source-asset import. No unrelated shared-checkout work has been changed.

The last independent shaded review reopened Merkava Mk4 X before final
regeneration: the two rear hull stations formed an exposed shoulder shelf.
At X 1.5, held-out source/native roof heights were 1.533695/1.653636 m at
Z −3.4, 1.565644/1.660066 m at Z −3.25, and 1.224095/1.568409 m at Z −3.7.
The same error occurs on both sides and is hull-owned, so it cannot be explained
by the source's corrected turret pose. The narrow basket floor is already
aligned (source/native 1.82628/1.827 m); it must not be changed to hide the shelf.
This measured rear-hull correction is required before qualification.

The correction now passes nineteen held-out source rays in high/low detail,
including the real asymmetric cover and recessed right channel. The basket,
non-hull mesh buffers/transforms, forward hull triangles and lower keel remain
unchanged. The unseen central core remains an explicitly documented closed
runtime construction, not a claimed exact source skin. Fresh scoped fidelity
passes 94.0478197190, minimum whole view 92.6765303559 and tracks 93.4914122477;
unavailable fused component masks remain null. Independent shaded review of
the new board confirms the projecting wing is gone, the basket remains open,
and no new major/medium defect is visible. Full standard/release verification
remains separate and is running from these frozen shapes.

The final scanner snapshot includes the new rear-fold helper and regression:
35 tracked files remain 83/100 with the same six diagnostics; 157 files including
untracked work remain 82/100 with the same sixteen diagnostics. Exact diagnostic
comparison reports zero additions/removals. All 41 newly authored TypeScript
paths are covered; the two changed Mk4 runtime files additionally scan 100/100.
No warnings were suppressed and no unrelated code was changed for the score.

### Frozen regeneration checkpoint

The corrected Mk4 also passes the complete scoped standard check: raw geometry
minimum 92.6765303559, zero front/rear/sweep track intersections, zero continuity
holes, and two registered roof machine guns. This is separate from, and does
not replace, the final thirteen-vehicle release run.

A parallel CPU preflight retained the previous Mk4 marking receipts while the
last rear-hull regeneration completed. It failed the exact generated-position
assertion; the failure is retained rather than counted as a passing full suite.
Fresh, unmodified checks subsequently pass all 151 playable marking receipts
and all thirteen high/low X marking-support cases, including depleted ERA.
The two current Mk4 seat errors are below 4.5e-8 m against the actual surface
solver, with all nine support samples clear. No tolerance, geometry, anchor, or
test expectation was changed. The final release suite must start after the
generation sequence, in a fresh process.

Independent final review inspected all 39 regenerated X armor/module/crew PNGs
(2026-09-06 08:36 UTC): every model is present, full visible envelopes retain
margins, and no geometry enters the label gutters or footer. This includes the
corrected Mk4 rear hull and the longest A7V, KF51 and T14 envelopes.

The final read-only runtime audit verifies all thirteen preserved original
geometry fingerprints, deep equality of all 138 original public specs, and
169 donor combat-field comparisons across the X variants. Repeated registry
synchronization leaves the donors unchanged. All thirteen X demand loaders
instantiate and dispose successfully without loading a donor builder. The
69-module boot closure imports no X geometry; the six X groups' 64-module
runtime closure includes the new rear-fold helper but no supplied-model loader.
No supplied media/archive binary or non-icon texture is Git-eligible, and all
thirteen canonical source GLBs remain ignored. Final generated-asset hashes and
the complete composed release/build result are still checked separately.

### A5 reopened by the final composed gate

The 08:49 UTC thirteen-vehicle run passes all thirteen fidelity rows, but the
separate geometry gate rejects A5: hull 91.3715164181 and turret 91.8551547580.
An isolated rerun reproduces the failure. This is not a passing release, and
the earlier scoped passes do not supersede this result.

Independent source triangle measurements identify two missing rear-deck service
covers, a narrow raised roof handle with air beneath its bridge, and a thin
canted roof hood. A separate lower-profile anomaly is a real basket-contour
error: the source floor is slightly elliptical, ending at Z -0.314575 m, while
the circular native floor extends to -0.325 m. Correct inclusion of the actual
muzzle rim shifts the shared sampling camera by a few millimetres, exposing that
10.4 mm axial excess as a full-height difference in one discrete column. The
muzzle, real basket geometry, fixed source frame and thresholds remain included
and unchanged; the correction must address the actual source contour. Fresh
generation, geometry/fidelity checks, and composed release verification are
required after the source-backed physical corrections.

The 09:03–09:08 UTC live gallery check loads all thirteen X records with correct
names and nonempty dossier icons. All five layers switch correctly: exterior
and markup have zero diagnostic overlays, armor/modules/crew have populated
vehicle-specific overlays, and markup activates its real mesh selector. No
supplied-reference resource request or application JavaScript error occurs.
T14 yaw 75 degrees/elevation 12 degrees retains its twelve module volumes.
At 430×932 its full hero model remains visible; at 320×740 the A7V retains its
full envelope and document width equals viewport width (320 px). OrbitControls
responds to a DOM wheel event through its existing event handler; this is not
a hardware-wheel or touch-device certification. A5 in this UI checkpoint
predates the final detail correction; its post-repair verification is below.

The A5 correction is now physically frozen. The new high/low regression checks
source-fixed cover and roof rays, the basket's axial ellipse, closed and
correctly wound fitting skins, real lifting-eye/hood air, positive roof joints,
four turret-yaw poses and exactly-once geometry disposal. Independent review
confirms the two corrected arch underside witnesses within 0.2 micrometres,
hood-leg held-outs within 0.61–1.36 mm, and actual base/leg roof overlaps of
4.095/3.000 mm. The main A5 hull/shell, gun, running gear and non-target existing
assemblies retain their pre-repair fingerprints. Only the measured basket
contour and separately named local fittings change.

The post-freeze preservation probe passes all 48 complete other-model
snapshots: twelve X vehicles, two detail levels and runtime/receipt paths.
It includes all visible/hidden graph nodes, transforms, vertex/index/instance
buffers and real muzzle parts without appearance masks. The archived baseline
SHA-256 is `72f7ae9cb27021ac93338493993d119a1f4a7fd1e74f564b150e96c61bb9dc5f`.
The changed A5 runtime helper and Leopard builder scan 100/100 with no React
Doctor findings. Fresh render/release qualification remains required.

The final changed-code scanner comparison includes the A5 helper/regression:
all sixteen diagnostics exactly match the prior snapshot, with zero additions
or removals. The wider `files` scope also reports twelve pre-existing findings;
it is not the same comparison as `changed` scope and is retained separately.
No scanner suppression or threshold was introduced. Fresh root-process runs
of the A5 detail regression, all four Leopard X source-geometry tests, all
thirteen high/low articulation checks, and post-ERA marking support also pass.

The fresh A5 scoped run passes fidelity 96.7300873323 and raw geometry minimum
93.0074139731 (hull 93.0074139731, turret 93.4988260285, whole curves
93.1096765825). All track-intersection counts and continuity holes are zero;
the physical roof machine gun is registered. These results supersede the
rejected 08:49 A5 geometry, but do not replace the composed batch release.

Gate coverage is specifically nine whole-vehicle views, five cardinal
hull/turret component views where the source permits segmentation, and the
registered gun/track and independent geometry checks. Optional diagonal
component overlays are additional visual diagnostics, not part of the five
cardinal component aggregate or gate. For example, A5's front-left direct
turret diagnostic reads 91.5 on the expanded board; do not describe the
registered gate pass as every possible diagnostic exceeding 92. The expanded
shaded/diagonal board remains subject to independent visual review.

Independent review of the fresh 09:30:58 A5 board closes the bounded repair:
no new major/medium exterior assembly defect, unsupported block or filled
aperture is visible through hero, articulation and turntable views. The optional
front-left diagnostic still includes prominent internal basket-window/divider
residuals and smaller mast/roof, rear-outline and gun residuals. It is neither
a passing 92-point optional diagonal nor solely an internal-basket difference.

The final source-isolation audit includes the new A5 helper. All six complete
X dependency chains contain no reference loader, source-model/source-texture
or image-asset literal. Seven fresh-process hooks confirm no X builder is
evaluated at boot and only the requested group becomes ready. All thirteen
canonical comparison GLBs remain ignored. The 130 eligible new/changed images
are native generated icons/thumbnails matching manifest SHA-256 values; no
source binary/archive is eligible. The existing world-prop gzip is unchanged
from the base commit. The native-playable audit passes 151 models, zero errors.

The post-freeze anatomy regeneration completed at 09:48 UTC. Independent review
of all three fresh A5 armor/module/crew cards confirms complete vehicle envelopes
and clear label gutters/footer legends; the fine roof-eye and hood openings
remain supported by the separate geometry and close-up evidence. The subsequent
byte-preservation audit passes all 165 original asset records, 495 original
technical images and 1,155 ordinary images. These checks were subsequently
followed by the completed composed release and final public build above.

The final A5 live Gallery check at 10:10–10:12 UTC uses the post-freeze model
and regenerated assets. All five layers switch correctly: 70 armor overlays,
21 module overlays, four crew overlays, and 56 selectable markup meshes.
Real DOM sliders set turret yaw to 75 degrees and gun elevation to 12 degrees;
the visible gun and turret-mounted module geometry articulate together. Desktop
1440×1000 and mobile 320×740 hero screenshots retain the complete envelope,
with no mobile horizontal overflow. No application JavaScript errors or
supplied-reference resource requests occur. This closes the earlier A5 UI
follow-up; it does not certify physical touch hardware. Images are retained in
the ignored `.qa-dev/reports/final-a5x-*` evidence set.
