# MBT-70 — upper-track fender sides

## Current status

Implementation: complete; focused fit, motion and asset checks PASS.
Publication: pushed to `origin/main` at
`1f412d2d28f3b55ac5cb0c64469a6907795a0d21` on 2026-09-09, with the
owner-authorized source-fidelity exception below. This is a scoped addition to FSP-05 in the
[fleet bodywork backlog](../tank-generation/fleet-style-performance-priority.md),
not completion of the wider fleet pass. The full release gate still fails
three source-comparison views that also failed on the untouched baseline.
Kevin subsequently explicitly requested publication of this task's work,
including MBT-70, after being shown these failures and asked to choose a
scoped exception or hold. This authorizes publication of the documented
MBT-70 source-view failures, not relabeling them PASS or waiving new failures.

## Owner contract and preserved inputs

Kevin B. Liu requested on 2026-09-09: “the mbt 70 needs the above tracks
fender sides as well!” Close the upper side openings with finite painted
bodywork attached to the existing shoulder/fender assembly. Keep the lower
road wheels visible, the single native track course, the complete existing
wheel layout, and the MBT-70's hydropneumatic articulation.

- Exact playable ID: `mbt70`; starting revision
  `6bba0ee6d2cba74942878e0e420c7bcc96db71c4`.
- Own isolated branch: `codex/mbt70-upper-fenders-20260909`.
- The existing model is an owner-directed M1A1 bare-hull composition; this
  request does not authorize changing that donor, turret or running gear.
- Source comparison remains the unchanged local-only `mbt70_usa.glb`;
  SHA-256 `2fe61a6bd2a44b58453fa4c8cfd07a6be07497a2fd5f0faece329652c4dd1c05`.
  No source mesh or texture enters runtime or the publication set.
- Dependency lock SHA-256:
  `53b8f49d80b0a51e9b77d46f11b68f69aeb27f73b46d1c7ad281c27cc8f3b1e0`.
  The linked installed dependencies use that same lockfile.

## Baseline — retained failure

On the unchanged starting revision, the maintained command
`node tools/procedural-fidelity.mjs --ids=mbt70 --check --board --neutral-board`
completed native rendering but exited **1**. Report timestamp:
`2026-09-09T12:15:30.559Z`.

- Aggregate: 91.36304122662092.
- Minimum view: left 89.18059676498531; required floor 90.
- Other failed views: right 89.7636068216623; rear 89.9920636700176.
- Whole masks are available; independently articulated hull/turret/gun
  component masks are unavailable on the fused comparison source.

The dated geometry ledger's earlier 90.1 result is not a fresh full-release
pass. These baseline failures must stay visible in the candidate comparison;
do not change the source, thresholds, or unrelated tank forms to erase them.

The unchanged baseline also completed
`node tools/track-clip-audit.mjs --ids=mbt70 --exact --strict`. It reports zero
band/front/rear contacts, but **eight complete-shoe sweep contacts with
`hullDetail`**. The command exits zero despite listing a shoe offender; that
exit code is not proof of a clean complete-shoe audit.

## Initial candidate review — superseded, not qualification

The initial two folded aprons add 304 triangles. Native shaded board and
24-angle turntable inspection show the continuous camouflaged upper band and
retained visible lower wheels. The source comparison on
`2026-09-09T12:22:28.137Z` still fails: aggregate 91.35688287372068; left
89.18059676498531 and right 89.7636068216623 are exactly unchanged from the
baseline. Rear improves to 90.0161547127834. Initial complete-shoe sweep
contacts also match the baseline's eight `hullDetail` contacts.

Independent review requires two corrections before final validation:

- Separate the new web's exposed outer plane from the existing end-cap plane
  to prevent coplanar flicker at their overlapping joints.
- Keep these thin fenders in persistent camouflage-bearing track-guard
  buckets, not primary `hull` armor; otherwise the generated convex collision
  cells could incorrectly bridge wheel-bay air.

These initial images/metrics are not final candidate acceptance. The final
stock needs independent clearance checks; a track-guard tag is not a waiver.

## Final implementation

- Reuse the existing finite `foldedShoulderReturn` primitive: one mirrored
  152-triangle apron per side, with a 16 mm roof lip and 14 mm outer web.
- Fit the inner lip at `|x| = 1.719 m`, outer web at `1.752 m`, bottom at
  `y = 1.125 m`, and longitudinal stations from `z = -2.62` to `2.60 m`,
  before the existing hull transform. Follow the actual varying deck height.
- Overlap the existing end caps physically, with 2 mm separation between
  their exposed side planes. Retain lower road-wheel openings.
- Use persistent painted `hullTrackGuardL/R` owners with non-primary-armor
  roles, native camouflage projection and native disposal.
- Remove only the two obsolete MBT-70 upper rail boxes. Their rear ends
  contain the old shoe-contact witness (`z = -2.6122 m` after hull seating).
- Add a finite inner riser under each rear roof tip. The full-width donor
  deck ends at `z = -2.50 m`, not its lower tail-rake datum `-2.60 m`; the
  support must bridge to the actual rear fender, not an assumed deck face.
  Each riser spans `|x| = 1.720..1.732`, `y = 1.635..1.706`, and
  `z = -2.618..-2.502 m` in hull-local coordinates, within the existing
  external outline. Its bottom and top require independent contact witnesses.
- Added 328 triangles, removed 24: **net +304 triangles** in HIGH and LOW.
- No shared donor, turret, wheel, track, suspension or spec changes.

The final `modern2.ts` SHA-256 is
`9f8dac9d968e40e8099df2a866c8196f608ab15632278cfdd847b8071f4da306`.
The first riser foot left a measured 2.9 mm gap over a beveled cap edge. Its
bottom was lowered 20 mm, leaving its roof and external outline unchanged.
The final test checks the complete foot against the actual closed rounded
cap: boundary exclusion plus odd-ray interior containment, not an assumed
convex box. Earlier failed test iterations are not acceptance evidence.

MBT-70 has no gameplay ERA clusters. Destructive-ERA qualification is **not
applicable** to this repair; an empty stripping loop is not test evidence.

## Final verification and release boundary

- Maintained `mbt70Fidelity.selftest.mjs` PASS, including the new upper-fender
  test and existing Abrams wheel-spacing tests. Four native HIGH/LOW builds,
  192 motion poses, 268 receiver samples and 24 negative controls pass.
  Minimum conservative whole-stock running-gear separation is approximately
  4.0 mm, including actual ±650 mm travel, pitch and track phases.
- Original authored emissions are authenticated against unchanged baseline
  hashes. Primary hull, native gear geometry and instance transforms remain
  identical. Camouflage materials, non-armor ownership, far LOD, exposed lower
  wheel windows, finite joints and disposal pass.
- Final `track-clip-audit --ids=mbt70 --exact --strict`: zero front/rear/sweep
  band contacts, zero complete-shoe contacts and zero blind spots.
- Final targeted icon generation and `tank-assets-check --ids=mbt70` PASS:
  nine required views, metadata, geometry and muzzle bores current. All 200
  unrelated tank manifest entries remain identical to the starting revision.
- Final native neutral comparison board and shaded side/angle renders were
  inspected. The continuous upper side band preserves the lower wheel view.
- The full `tank:anatomy:update` completed 174 rows / 56 groups and the full
  fleet technical-image generation, with **no anatomy receipt changes**.
  The subsequent `tank:anatomy:check` invocation passed anatomy, markings and
  all 174 module-hit checks (zero failures/outside modules), but failed its
  last asset phase because the MBT-70 geometry had since changed. That
  invocation is **not PASS**; final scoped regeneration/asset checks above
  recover the stale MBT-70 assets. Unrelated assets/receipts did not change.
- Type/unused checks passed after the risers were added, before the final
  buried foot's two numeric height changes; final native construction and
  maintained tests ran again after those changes.
- `tank:release:check -- --ids=mbt70 --gate` **FAIL** at source fidelity.
  Earlier phases passed fresh anatomy, centering, module alignment/hits,
  assets, track duplication, muzzle bore and circularity checks. This run
  preceded the buried-foot lowering; final focused tests, track audit,
  assets and source comparison were then rerun. Standard-check, full
  `npm test` and private build were not reached by the failed release run.

Final source report (`2026-09-09T12:54:08.765Z`): aggregate
**91.4005394877496**, but left **89.19100331394544**, right
**89.82201801800144** and rear **89.93702369587395** are below the required
per-view **90**. The same three views fail on the baseline; final values are
not exactly unchanged. No source or threshold was altered to hide failures.

## Owner-authorized publication follow-up

On 2026-09-09, after the explicit failed-view disclosure and publication-choice
question, Kevin requested: “commit asnd push origin main on everything you
worked on here including the mbt 70. but we need all the other fixes u did on
tanks”. The response stated that this is being treated as authorization for
the three documented pre-existing MBT-70 source-comparison failures. This is
an as-is source-fidelity exception for this bounded fender repair only.
It is not a source-fidelity pass or authorization to publish unrelated WIP.

The two local checkpoints were rebased without conflicts onto
`47e86743d098b868513aa841a9e9c00675ad49fd`, retaining all seven newer environment
commits. Rebased checkpoints: `a99d64271` (geometry/tests), `c95a1d5f4`
(assets/report). Post-rebase TypeScript 7/core-unused, private build and public
build **PASS**. The public asset strip confirms no registered playable refers
to a stripped path. Build chunk-size warnings remain. Final complete anatomy
verification **PASS**: 174 anatomy receipts, 174 marking receipts, the native
anatomy self-test, all 1,496 modules / 348 track sides (zero failures/outside
modules; 79 existing dimension warnings retained), and all 522 technical
images/metadata are current. This is a fresh full check, not a relabeling of
the earlier stale-asset failure.

Fresh `geometry-gate --ids=mbt70 --check` retains **FAIL** at 89.2/90 for
`wholeCurves`; dimensions and floaters are both 100. The generated MBT-70
packet and ledger now record this actual failed result instead of the stale
90.1 pass. All 160 other ledger rows are unchanged. The subsequent maintained
standard check completed every physical phase: `clip 0/0+0/0`, enclosed holes
`0`, and fitting census `mg1+8d`, all **PASS**. Its overall status remains
**FAIL solely on the same source floor**, covered by the scoped exception.
The original 862-entry npm lifecycle passed all 278 PRE entries, then stopped
at the first CORE test: `public-repo-hygiene` rejected the new fender test
because it was executed by import but absent from `SELFTEST_SUITES`. The 548
remaining CORE and 35 POST entries did not run. This is not a full-suite PASS.
The recovery now registers that test directly and removes its duplicate
parent import; the unchanged geometry test still runs once. The corrected
hygiene check passes on the current publication tree.

### Whole-task preservation inventory

Read-only ancestry reconciliation against `47e86743d` confirmed these existing
published checkpoints; do not duplicate them or describe the entire backlog
as uncommitted:

- `6bba0ee6d`: nine-tank bodywork/Leopard-roller release, complete 858-check
  lifecycle; includes the preceding seven-tank bodywork checkpoint.
- `57bf9fc13`, `b9c45b91b`, `e8ef757e2`, `d17d8adfa`: construction caches,
  fitting-buffer disposal and ERA reuse.
- `598b7be78`, `5adbd5930`, `d0d01a903`, `87353fd1f`, `965860648`,
  `0aada3574`: efficient-roller and fitted-track foundations.
- Earlier source-study fleet releases `c26b31942` and `099edfa49` are retained.

Additional local candidates are preserved, but have no complete passing release:

| Local work | Checkpoint locator | Outstanding qualification |
|---|---|---|
| T90 canvas, Leopard smoke frames, Leclerc/Strv wheel reduction | `916902f3e`, `f6689bde9`, `875525048`; combined `1338e180c` | Native/preflight passed; complete release pending |
| A4M/A5/KF51 efficient rollers | `bfdc4f1d1`, `0121238b2` | Focused/source passed; composed release pending |
| K2/T14 rollers | `67146638a`, `1b17c1eef` | K2 source gate failure |
| Merkava full-stroke rollers | `a6a3c8570`, `eac96616a` | Focused/types passed; source/count/release pending |
| Centurion supports | `1eddc3428`, `a65a7374f` | Physical checkpoint; native/release pending |
| Challenger shafts | `7a7c9d49f` | Source/portrait blockers |
| T90/T80 running gear | `eed11d3c4`, `744fab71e` | Unqualified pilots |
| Seven conventional Abrams X rebuilds | `codex/abrams-source-x-integrated-20260907` | Broad unfinished integration, not present on main |

After the separate disclosure of unfinished candidates and the seven-model
Abrams rebuild, Kevin clarified: “commit and push all our side /fender tank
changes and the abrams too”, then requested a full search for work that may
have been canceled without publication. This explicitly expands the as-is
publication scope to the recovered side/fender changes and seven conventional
Abrams X models. Known failed/incomplete quality checks must remain documented;
compilable, loadable integration and source-file exclusion are still required.
This does not authorize blindly merging superseded running-gear prototypes.

MBT-70 was authorized as an explicitly unqualified preservation checkpoint
after the final focused/build checks above, while the separate lifecycle was
still running. Its later failed result and registration correction are retained
above; do not relabel the original run PASS. Newer main changes were reconciled
in a separate publication tree, preserving the original run's runtime inputs.
Older branches are recovery locators, not a blanket merge list.

Source binaries, comparison boards and temporary logs stay ignored. Only
scoped runtime/test changes, maintained MBT-70 assets and this report belong
to the publication set. Final local receipts are
`.qa-dev/mbt70-fidelity-with-upper-fenders.log`,
`.qa-dev/mbt70-foot-seated-track-clip.log`, `.qa-dev/mbt70-final-assets.log`,
`.qa-dev/mbt70-foot-seated-fidelity.log` and `.qa-dev/mbt70-release.log`.

### Published preservation checkpoint

The scoped geometry/tests, assets and truthful failed-gate report were
integrated in `cot-tank-recovery-publication-20260909`. On the `5b3224204`
base, the focused MBT-70 fidelity test, scoped asset check, typecheck and
public build all passed (`.qa-dev/mbt70-latest-main-integration.log`). The
three commits were then rebased without conflicts over the independent road
lookup change `d9960ad92` and pushed without force. The remote main hash was
verified as `1f412d2d28f3b55ac5cb0c64469a6907795a0d21`.

This publishes the requested fenders, not a claim that every fleet repair or
the full lifecycle is complete. See the broader
[recovery inventory](tank-work-recovery-inventory-20260909.md) for missing,
already-published and superseded work.
