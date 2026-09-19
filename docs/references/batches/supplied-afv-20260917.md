# Owner-supplied fleet batch — 2026-09-17

Status: IMPLEMENTED DRAFTS, NOT QUALIFIED, NOT PUBLISHED.

Latest evidence is in **Final visual closure and release verification** below.
Earlier sections retain historical checkpoints and must not be read as current
passes, costs or pending repairs.

## Final visual closure and release verification — 2026-09-18

All thirteen vehicles now have an accepted independent visual review: 182
canonical comparison views and 26 actual Garage views, with all 208 image
hashes verified. The final Kurganets folded bow face and lower return resolve
its previous 8.7 hold. The earlier failed review remains preserved. See the
[final visual review](../../research/supplied-fleet-final-visual-review-20260918.md)
for the exact model identities, neutral-render equivalence bridges and limits.

The isolated branch includes `origin/main` at `12b5dc936`, including the
independently landed Merkava 3D turret repair. Final verification started with
a fresh remote fetch and confirmed that main is contained in this branch.
The complete anatomy command passed: 193 current anatomy and marking records,
1,664 authored modules and 386 track sides, with no module outside its envelope.
The module probe retains 89 advisory dimension warnings; these do not replace
the stricter supplied-source comparison or its recorded dimension results.

The selected thirteen pass the combined machine-checkable geometry, strict
track, continuity and source-equipment gates. Every geometry minimum exceeds
92; the lowest is Warrior at 92.3. Warrior retains 294 raw continuity cells and
AFT-10 retains 30, with zero unexpected openings under the approved measured
opening policy. No numerical gate was reduced.

The first composed release failed: 363 of 367 preliminary test files passed;
four Merkava tests failed after the separately landed cheek repair. The core
and post suites did not run. Two module probes also timed out before launch
because concurrent queue entries collided. Both probes passed when rerun with
the queue correction; those separate results do not replace the failed release.
The failed run and its unchanged-input receipt remain under
`.qa-dev/tank-run/final-corrections/qualification/`.

The branch now includes `31d08f673`: permanent Merkava cheek ownership and
exact historical-test authentication, following queue fix `209af0754`.
Fresh complete anatomy generation and a complete release rerun are underway
in `qualification-r2/`. All thirteen selected vehicles already pass the
separate HIGH/LOW strict track checks and geometry budgets: 26 native builds,
zero band/shoe intersections in the front, rear and sweep zones, and each LOW
model below 75% of its HIGH triangle count. These are geometry-cost checks,
not a frame-rate certificate. Builds and actual UI selection checks remain
required before publication.

The owner requested Kurganets-25 and ODZTZ-20, then eleven more supplied
vehicle sources, using the tank-generation procedure and committing/pushing
origin/main. This publication authorization does not describe a scoped as-is
exception. No failing draft is approved for main.

## Work ownership and baseline

- Isolated worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`.
- Branch: `codex/kurganets-odztz-generation-20260917`.
- Starting remote main: `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Shared `/Users/kevinliu/claude-of-tanks` was dirty/conflicted and remains untouched.
- Requested IDs: `kurganets25_x`, `ztz100_x`, `fv510_milan_x`, `aft10_x`,
  `bmp3m_dragun125_x`, `griffin50_x`, `kf41_lynx_x`, `k21_x`, `cv90_mkiv_x`,
  `ajax_x`, `sabra_mk2_x`, `cv90105_tml_x`, `type96b_x`.
- Regional profile owners write only new profile/helper/study files and per-ID
  packets. The root integrator owns shared catalogs, tooling and generated data.
- New visual profiles are independent first-party section solids, fittings and
  the native suspension/track system. Existing vehicles are balance peers only.
  Modified weapons have their own gameplay contract and cannot claim exact
  balance equivalence to their chassis peer.

## Reference contract

Raw files remain in the owner's Downloads. The CV90105 source is the OBJ/MTL
inside the verified nested ZIP. Source inventories, connected-component scalar
measurements, recipes, native source views and canonical hash receipts are
ignored under `.qa-dev/tank-run/{kurganets-odztz,british-us-source,eastern-source,europe-source}`.
All source binaries remain ignored in `public/models/community-candidates`.
Neither raw meshes nor source textures/topology enter the playable runtime.

The supplied models are the comparison targets; real-world dimensions and
redistribution permissions have not been certified. Generic material-fused
exports do not provide defensible separate hull/turret/gun truth. Comparison
therefore retains the whole source with unavailable component masks recorded.
No source is resized to match its candidate.

All thirteen use local-only reference overrides and a hash-verified
canonical frame. The dimension method compares identical source-only fixed
camera measurements and complete physical 3D envelopes, matching the procedure
already used for recent source-X builds. It catches oversized or missing thin
antennas as well as body dimensions. Legacy fleet policies remain unchanged.
Official 14-view visual-evaluator registration uses the same source overrides.

The following were the three initial target conflicts (all resolved by the owner on2026-09-18; retained here as history):

The [concrete decision table](../../research/supplied-source-target-decisions-20260918.md)
pins exact affected parts, source hashes, recommendations and unavailable
placement evidence. The latest owner prompt consolidates these three choices;
it does not ask again for publication authority.

1. Kurganets, Warrior, Griffin, BMP-3M and K21 contain below-ground unseated
   export hardware. Warrior has an exact duplicate door translated into the
   origin; Griffin has an unseated door at the origin, far from the rear hinge.
   Full originals are retained. No filtering is authorized yet.
2. Warrior, AFT-10, Type96B, KF41, K21, CV90 Mk.IV and CV90105 have no separate
   source roof MG, conflicting with the older mandatory-MG fleet checklist.
   Do not invent a weapon or manufacture a fitting-census pass while pending.
   Kurganets has its actual offset coaxial weapon; that is not a roof MG.
3. Warrior's source-real standoff gaps and AFT's sixteen measured rear slots
   conflict with the older zero-continuity-hole requirement. Their final scans
   retain 663 and 30 reported cells respectively. A reviewed target/checker
   decision is required; do not close genuine air or silently waive the test.

## Evidence and remaining work

Per-ID packets contain local round results. Do not conflate a silhouette pass
with qualification. Several models have passed all silhouette views; others
still fail, and strict track/seat/continuity/independent critic/performance,
combat anatomy and complete release checks remain required.

The initial Kurganets/ODZTZ anatomy/marking/interior-fill/presentation records
were generated before discovering a cylinder-helper argument mismatch. They
are STALE. Marking seats are being refreshed to remove displaced decals, but
all geometry-dependent receipts need final regeneration after profiles freeze.
Do not stage those old generated records as if they qualified current geometry.

Next actions:

1. Resolve pending source targets; retain original reports if a corrected oracle
   is selected. Record exact component selections and both hashes.
2. Continue per-ID coarse-form, strict band/shoe, physical contact and detail
   corrections; keep official failed receipts in the local round directories.
3. Run independent 14-view review, high/low articulated checks, native Gallery,
   and cold/warm/rapid switch performance. Source-only renders are not verdicts.
4. Fit actual main/auxiliary armor and inferred crew/modules. Generate anatomy,
   marking/interior-fill records, scoped cosmetic assets and full technical cards.
5. Run complete anatomy check, targeted composed release gate, full test suite,
   typecheck, public/private builds, source exclusion and attribution.
6. Fetch/rebase current origin/main, inspect exact owned diff, revalidate,
   commit exact files and ordinary push only after qualification or a new,
   explicit scoped as-is approval. Verify the remote commit.

## Main integration — 2026-09-18

Fast-forwarded the isolated branch to `3f6fc4ad8`, preserving new shared track behavior.
The original ODZTZ source SHA matches the already-landed `ztz100_x` exactly.
That existing entry fulfills this source; the unpublished duplicate `odztz20_x`
was removed and preserved privately. The batch therefore adds twelve vehicles
and improves one existing vehicle. Its original source registration stays fixed;
the current procedure requires exemplar 92 in every view, which its prior
fleet-90 receipt does not satisfy. No as-is exception is implied.
All pre-integration running-gear evidence requires revalidation. Stale generated
draft anatomy/marking/assets were backed up privately; final generation is pending.

## Verification in progress — 2026-09-18

These are diagnostic receipts, not publication approvals:

- The native physical-bore contract now checks an actual annular rim, inward
  bore wall, recessed termination and any forward-projecting metal. It runs
  again after generated interior fills. The rendered probe independently checks
  the aperture and rim. The latest eleven-model proof is under
  `.qa-dev/tank-run/physical-bore-proof-r3`; newly added vehicles still need
  their final interior fills generated and the proof repeated with those fills.
- ZTZ-100 now retains the source's open stern cage, angular shroud, separated
  brake baffles and real receiver/yoke. Native paired tire stock and recessed
  wheel dishes follow source measurements, including the 90.18 mm stagger of
  the right-hand road-wheel stations. Its latest aggregate silhouette result is
  about 93.1; side views remain below the required 92. The raw and canonical
  source hashes and registration are unchanged.
- Fresh Kurganets and ZTZ-100 HIGH/LOW front, rear and sweep clip reports have
  zero band/shoe intersections (`.qa-dev/tank-run/root-track-r3-{high,low}`).
  This does not establish full moving finite contact or release readiness.
- A shared native shoe-material defect multiplied two absolute dark colors.
  The explicit instance palette now keeps a white material multiplier, with
  neutral-color enforcement on the actual instance buffer. HIGH/LOW native
  Ajax, Challenger 3 and Leclerc checks retain identical stock, placement and
  palette hashes. The first three Ajax browser images were byte-identical
  to earlier captures, exposing a second defect: vertex coloring was enabled
  without a geometry color attribute, zeroing albedo before the instance tint.
  Disabling that unavailable attribute preserves instance colors. Fresh
  `track-palette-proof/ajax-r2` images now show the shoe relief. The actual
  native near/far material contract and unchanged parked/moving upload cadence
  are covered by `runningGearCadence.selftest.mjs`.
- Independent findings remain in
  `docs/research/regional-source-independent-critic-20260918.md`,
  `docs/research/physical-bore-independent-critic-20260918.md`, and
  `docs/research/ajax-track-wrap-independent-diagnosis-20260918.md`.
  Failed and superseded images are retained privately with hashes.

The pending assembled-source and roof-weapon choices above still prevent final
qualification of the affected vehicles. All edits remain isolated and unstaged;
no feature commit or push has been made from this batch.

## Batch performance budgets fixed before optimization

The matched 10 m native Gallery census (HIGH and LOW, one browser worker,
seed4242) is retained in
`.qa-dev/tank-run/performance-controls/geometry.json`. Established controls:

| Vehicle | HIGH selected triangles | LOW selected triangles | HIGH objects |
|---|---:|---:|---:|
| M3A3 Bradley | 73,746 | 68,042 | 82 |
| CV90 Mk.IV | 75,676 | 69,176 | 77 |
| T-90M | 95,736 | 89,568 | 62 |
| M60A1 | 80,884 | 75,632 | 63 |

For this batch, tracked IFV/light chassis use an 80,000 selected-triangle and
85 visible-object HIGH ceiling; MBT chassis (Sabra, Type96B and ZTZ-100) use
100,000 and 65. These round up the larger established control in each class.
LOW must reduce selected triangles by at least 25% at the same 10 m viewing
distance. The controls' weak 6–9% reductions are not the target for new work.
These are fixed authoring budgets, not an FPS or switching-latency pass, and
must not be raised to accommodate a later candidate result. Source stock,
contact and silhouette requirements remain unchanged. Gallery/Garage cold,
warm, rapid-switch, frame-gap and resource checks remain to be completed.

## Historical detail and lighting checkpoint — 2026-09-18

The isolated branch is now based on `29c9ecefd` (deploy 36). The upstream
roster/wave/terrain changes and new test registrations were retained. Shared
checkout remains untouched. Backup is private at
`.qa-dev/tank-run/integration-20260918-r2`. Nothing from this draft is pushed.

- All thirteen candidates met the fixed selected HIGH/LOW geometry budgets
  before final interior-fill generation. AFT's measured paired wheel stock is
  70,708/40,922 triangles; Ajax is 79,820/47,936, with only 180 HIGH triangles
  of headroom. Repeat the census with final generated fills; these are not
  final cost receipts.
- ZTZ r6 passed all nine source views (93.274 aggregate, minimum 92.147), at
  95,888/67,818 selected triangles. The independent fourteen-view review then
  identified the misplaced panoramic head and smoke-mouth row. The measured
  r7 corrections improve the aggregate to 93.37 but the right view falls to
  91.83. The failed view remains a release blocker; r6 is not the final model.
- AFT's sealed launch covers were correct in its profile. The shared cannon
  fallback added circular bore/rim decorations to eight missile canisters.
  Fixed canisters now retain the same eight independent firing tips without
  that decorative cannon geometry. Recoil/fire-location regressions pass.
- Added native road-wheel detail layers now receive their actual rest instance
  matrices before construction-time bounds are queried. This fixes stale
  origin-centered bounds; installed ZTZ fastener ray checks and unchanged
  parked/moving upload cadence cover the defect.
- The shared wheel readability shader previously flattened physically exposed
  dishes with two brightness clamps. Painted wheels now use bounded additive
  bounce from unmodified received light. The existing 0.075 paint floor and
  camouflage remain intact. Eighteen independent HIGH/LOW × factory/winter/
  desert × lit/shaded/dim GPU comparisons passed; armor, rubber and other
  pixels are unchanged and restored frames are exact. Dim factory wheel faces
  remain darker than the unchanged tires. Actual CSM/night checks are separate.
  `vehicleReadability.selftest.mjs` retains the exact historical ordinary
  shader fingerprint and exercises both direct and chained shadow hooks.
- Final shader originals: Europe/AFT seventy views under
  `.qa-dev/tank-run/europe-source/final-shader-r18`; Kurganets/Type96/BMP/K21
  fifty-six views under `.qa-dev/tank-run/final-shader-root-r7`. Independent
  reviews remain necessary, and final generated interior fills must not
  invalidate visible openings or physical bore stock.
- `tools/tank-selection-probe.mjs` measures actual pointer-driven Gallery and
  Garage selections, repeat cycles and rapid-selection convergence. UI-ready
  timing and screenshot-completion upper bounds are reported separately; RAF
  intervals are not FPS. Initial established-control runs converge with no
  browser errors. They are baseline observations, not a new smoothness waiver.
- At this checkpoint, scoped interior-fill generation refreshed complete
  affected families. That implementation was subsequently replaced by the
  exact scoped merge described below; it must not be reused.

The two owner target choices above remain pending. Full anatomy/assets,
post-fill physical verification, full suite/build and composed release gates
are still required. No aggregate or narrow diagnostic is a qualification pass.

## Frozen authored models and final verification — 2026-09-18

This section supersedes earlier candidate costs and detail findings above;
historical failed captures remain intact. All thirteen requested source entries
now have a frozen authored model. The ODZTZ source still maps to the existing
`ztz100_x`, so there are twelve additions, not a second ODZTZ catalog entry.
These are implemented drafts; owner targets and composed qualification remain
open. No feature commit or push has been made.

| ID | Selected HIGH triangles | Selected LOW triangles |
|---|---:|---:|
| kurganets25_x | 54,020 | 34,318 |
| ztz100_x | 99,536 | 69,754 |
| fv510_milan_x | 63,074 | 36,810 |
| aft10_x | 71,068 | 41,282 |
| bmp3m_dragun125_x | 60,200 | 36,568 |
| griffin50_x | 61,820 | 36,090 |
| kf41_lynx_x | 76,404 | 52,812 |
| k21_x | 54,956 | 34,470 |
| cv90_mkiv_x | 51,122 | 33,498 |
| ajax_x | 79,788 | 47,904 |
| sabra_mk2_x | 73,602 | 47,204 |
| cv90105_tml_x | 50,300 | 33,398 |
| type96b_x | 65,146 | 39,094 |

These are native selected-LOD, instance-expanded counts with generated fills
loaded, not stored vertex counts or frame-rate claims. The fixed class budgets
above remain unchanged. AFT/KF41/CV90 current-filled image confirmation passed
all 42 independent image reviews under `europe-source/filled-r21`; a census
that overlapped centering generation is explicitly invalidated and retained separately.

- Kurganets detail10 restores the measured turret drum, rounded optical head,
  sloping crown, seated smoke row and stern receiver. Independent all-fourteen
  review passes the scoped assembled visual bar; the raw export conflict stays
  unresolved. Evidence: `kurg-detail10-final` and the regional critic report.
- ZTZ detail10 replaces the incorrect vertical rear grille with the measured
  three-bay inclined open standoff screen. Native first-hit and open-cell rays,
  strict HIGH/LOW contact and all nine silhouette views pass (93.52 aggregate,
  92.39 weakest). Independent fourteen-view review passes; see
  `docs/research/ztz-r10-independent-review-20260918.md`.
- Griffin detail5 fixes optical receivers and their receiving pockets; Ajax
  detail12 retains its wheel stock while reducing hidden axle segmentation;
  K21 restores measured closed curved launcher caps. Independent fourteen-view
  reviews pass, without waiving Griffin/K21 source-policy conflicts.
- Actual CSM shadows and night readability checks pass in the controlled GPU
  fixture. See `docs/research/wheel-csm-night-independent-check-20260918.md`.
  This is not a full-battle frame-rate certification.
- Thirty-five rough-terrain motion cases (all thirteen HIGH/LOW plus nine
  legacy controls) pass the unchanged cut/daylight/travel limits; retained
  output: `.qa-dev/tank-run/supplied-motion-with-fills.log`.
- Scoped interior-fill generation now measures only requested IDs and merges
  their records into the existing family. Every unselected record and its
  absence are preserved. Only `ztz100_x` changes in the existing modern2 group;
  `type100` remains exact. `--stats` is explicitly a dry run, not generation.
  Earlier reports that used old fills are historical. Focused merge/invalid-ID
  tests and actual emitted-fill counts cover the final behavior.
- QA render pages now await the same interior fills used by the playable path.
  The physical muzzle verifier rejects invisible backstops, and new IDs cannot
  silently bypass sealed-hull checking through an absent ledger entry. These
  are measurement corrections, with negative fixtures; thresholds are intact.
- Full anatomy and marking generation completed for 193 playable vehicles,
  followed by all 660 technical views for 220 development entries. Only ZTZ
  changes among existing anatomy/marking records. Thirteen native centering
  pairs were generated after fixing first-time scoped registration; incomplete
  existing pairs still fail. Asset checks, full tests, builds, actual selection
  performance and composed release are running under
  `.qa-dev/tank-run/final-integration/jobs.json`. Failures remain recorded there
  even when a later corrected rerun passes.


## Release audit and corrective round — 2026-09-18

The complete scoring stage was run and **failed**, retaining fresh raw receipts.
All thirteen passed the sealed-model gate. Geometry passed seven of thirteen;
fidelity passed eight. A separate standard run completed the subgates skipped
by the early geometry failure: all thirteen passed strict track containment;
Warrior retained 663 continuity cells in source-real standoff regions and AFT
retained 30 cells around its rear perforated plate. Those are unresolved gate
conflicts, not permission to fill real openings. Only ZTZ and Ajax passed the
complete machine standard at that checkpoint.

The floater failures also exposed independently repairable source omissions,
which must not be hidden behind the pending raw-export choices: Warrior's
obsolete straight cage post, Kurganets' smoke-bank receivers, BMP/K21 antenna
seats and Type96's roof mast. Type96 also lacks measured bow blocks and rear
latches. These repairs are in progress; the earlier frozen profiles and their
geometry-dependent receipts are now historical. Sabra's actual source cupola
weapon also needs real fitting ownership registration, preserving its stock.

The first full suite passed 329/335 pretest files and exposed six integration
failures. The next full run passed 335/337 and exposed two additional assertions
behind the repaired earlier failures: inherited AFT/Sabra reactive-armor metadata
and a historical guided-channel census. The three passive source configurations
(Type96B, AFT and Sabra) now omit unsupported donor reactive zones while retaining
permanent protection and leaving donor vehicles untouched. The focused filled
HIGH/LOW stale-event/reset audit passes. Ammunition coverage preserves the old
625 channels separately and checks all 32 new ones; focused validation passes
27 guided authority launches and 657 final-round launches. Neither failed suite
is reported as a complete `npm test` pass; another full run follows this round.

Griffin's crew layout has two hull stations backed by the cited manufacturer
interview, with source-specific uncertainty retained. The four new internal
layout families have primary source trails and explicitly inferred station
locations; see `docs/research/supplied-layout-source-audit-20260918.md`.

All thirteen completed 27 real-pointer selections per surface in Gallery,
desktop Garage and mobile graphics tier Garage, with no convergence, resource
or browser errors. These are Vite-served production UI paths on desktop Chromium,
not physical mobile measurements or a production-bundle certification. Original
model-ready medians/p95 were Gallery 581.9/671.9ms, desktop Garage 347/578.8ms,
and mobile-tier Garage 329.4/620.8ms at 4× CPU throttling. Independent subsequent
thumbnail checks prove eventual image readiness; they do not fold thumbnail
waits into model-ready timing. See `docs/research/garage-thumbnail-readiness-20260918.md`.

The production phase-resource probe fails the same 19/62 checks on the candidate
and untouched main at `29c9ecefd`; no newly failing check was found. All scene-owner
geometry totals match. A single extra wheel-paint shader program is expected;
single-run timing/heap differences are inconclusive. The fixed budgets remain
unmet. See `docs/research/supplied-afv-performance-comparison-20260918.md`.

Earlier full technical assets, anatomy/module checks, typecheck, public/private
builds, source exclusion and attribution passed. Final regeneration and repeat
checks must cover the newly repaired geometry and combat metadata. Raw stage
results remain under `.qa-dev/tank-run/final-integration/`; no feature commit or
push has been made, and no qualification/publishing exception was inferred.

## Final repaired geometry and qualification — 2026-09-18

This section supersedes earlier frozen costs and outstanding attachment repairs.
The isolated base remains `29c9ecefd22a978a4508700408ed7fa5d9fbc468`.
All source files remain private comparison inputs, and all edits are unstaged.

Source-measured corrections are complete: Warrior's obsolete cage post was
removed; Kurganets' smoke-bank receivers and BMP/K21 antenna seats were restored;
Type96's mast base, rear latches, bow blocks and receiving glacis were corrected.
Sabra's existing roof gun now has real fitting ownership with unchanged stock.
AFT's rear slots now use the measured source boundaries. None of these repairs
resolves or conceals the separate raw-export or qualification-policy conflicts.

Actual scoped interior fills were regenerated for the seven repaired vehicles.
Only Kurganets and Type96 changed relative to the prior fills; all unselected
records are byte-identical. Full anatomy/marking generation covered 193 playable
vehicles, full technical generation covered 220 development entries/660 images,
and all thirteen received final scoped assets. Generation completed successfully.

| ID | Final selected HIGH triangles | Final selected LOW triangles |
|---|---:|---:|
| kurganets25_x | 54,964 | 35,230 |
| ztz100_x | 99,536 | 69,754 |
| fv510_milan_x | 63,050 | 36,786 |
| aft10_x | 71,068 | 41,282 |
| bmp3m_dragun125_x | 60,432 | 36,704 |
| griffin50_x | 61,820 | 36,090 |
| kf41_lynx_x | 76,404 | 52,812 |
| k21_x | 55,324 | 34,670 |
| cv90_mkiv_x | 51,122 | 33,498 |
| ajax_x | 79,788 | 47,904 |
| sabra_mk2_x | 73,602 | 47,204 |
| cv90105_tml_x | 50,300 | 33,398 |
| type96b_x | 65,564 | 39,512 |

All selected geometry and object budgets pass without raising their limits.
Final regenerated-fill seating fixtures pass in HIGH/LOW. Fresh independent
fourteen-view reviews pass for Warrior, Kurganets, BMP, K21 and AFT, with raw
source discrepancies and fine-detail limitations retained. Sabra's reviewed
fourteen-view capture remains applicable: its fill, per-ID marking record and
individual presentation rows are unchanged. Type96's final independent
fourteen-view review also passes; its missing per-ID fill hash in the capture
manifest is corroborated by the root's earlier complete source identity.
The complete validation chain is still in progress at this checkpoint.

The complete pre-release group now passes **339/339**. The subsequent core
group exposed two additional integration failures: CV90/Sabra display labels
use a period after `Mk`, violating the existing label convention, and CV90105
does not expose its visible pitching housing as the required `gunMount` stock.
Neither failure is waived. Diagnosis and focused repairs follow the current run;
the full suite is not yet a pass, and affected metadata/articulation evidence
must be refreshed after correction.

That run completed with **339/339 pre tests and 669/671 core tests passing**;
post tests did not run because core failed. All remaining pipeline jobs passed:
typecheck, public/private builds, source exclusion, attribution and all thirteen
real-pointer selections on each of Gallery, desktop Garage and mobile graphics
tier Garage, including separate thumbnail readiness. The source/tool identity
drift contains exactly the three intentionally corrected sealed-checker files.

The naming correction now uses `CV90 Mk IV X` and `Sabra Mk 2 X`; their asset
metadata must be regenerated. The ownership diagnosis found a real defect in
all twelve additions: eleven cannon housings rode barrel recoil (60–135.417mm),
while AFT's non-recoiling launcher supports lacked the correct pitching bucket.
ZTZ already has the correct owner. Corrections are in progress with one writer
per profile, real existing cradle stock and neutral geometry/material preservation;
see `docs/research/supplied-gun-ownership-diagnosis-20260918.md`.
The completed pipeline is now a pre-correction receipt, not final qualification.

All twelve ownership repairs are now frozen. Actual HIGH/LOW world triangles,
normals, UV/color data and materials match the preceding neutral models exactly.
Native tests verify real cradle stock, barrel movement/return, legal pitch,
negative wrong-parent cases and dark optics/coax visibility/disposal. The tiny
shared profile helper preserves existing barrel paint when stock changes owner.
KF41 also exposed a real short-tube case: its 481.49mm moving tube is shorter
than the old length heuristic once the stationary shroud is removed. A short
tube now requires successful native physical-bore verification and enough axial
stock for the recess, diameter and presentation stroke. Existing long-tube
behavior and hidden-stub/fixed-hull suppression remain unchanged; native KF41
HIGH/LOW, ISU, T95, AFT, Bradley and Leclerc recoil regressions pass.

The three new ownership fixtures are registered, bringing the full test manifest
to 1,055 files. Final post-ownership generation and validation are prepared under
`.qa-dev/tank-run/final-gun-ownership/`; these supersede the prior full-suite
attempt only when actually completed. Source target decisions remain pending.

The final composed release remains **FAIL**. Geometry now passes eight of
thirteen, including repaired Type96; fidelity passes eight; all thirteen pass
the sealed-model gate. Raw exported components remain the five source failures.
The separate standard run retains source-opening and roof-weapon conflicts.
Fresh anatomy, tests, builds and UI-selection results are recorded incrementally
in `.qa-dev/tank-run/final-seating/validation-jobs.json`.

Independent tool review found one additional failure path: a skipped tank build
could allow a partial sealed-ledger update. The update now requires a complete,
unique set of requested measurements before saving anything. Mixed successful/
missing builds, duplicate/unknown rows and repeated failures leave the ledger
unchanged. Measured thresholds are unchanged. This three-file tool correction
was made before the full test stage; the intentional input drift is recorded.
The composed release was repeated on the final checker and retains the same
eight geometry/fidelity passes, thirteen sealed passes and overall failure.
Runtime profiles and image inputs remained frozen.

## Post-ownership shadow correction — 2026-09-18

Post-ownership fills, full anatomy and all selected assets regenerated
successfully. The complete gun-articulation test passes 184 turreted and nine
hull-aimed guns. The following asset test exposed the old primary-source
shadow-richness assertion on Warrior. Diagnosis also found actual omissions:
the moved dark gun stock lost historical shadow participation, and substantial
permanent hull armor/selected roof structures had never supplied the new
models' simplified shadows.

The dark-stock repair now reproduces original Kurganets/Ajax/TML HIGH/LOW
gun shadow vertices and support receipts exactly. Measured permanent armor
receives explicit profile opt-ins; arbitrary detail and legacy defaults stay
excluded. The performance assertion is being corrected to count the actual
near-detail caster submissions replaced, while preserving the eightfold
savings requirement and existing absolute budgets. The original source-ratio
failures remain recorded; see `docs/research/shadow-work-accounting-20260918.md`
and `docs/research/supplied-shadow-support-audit-20260918.md`.

Final generation/validation now belongs in `.qa-dev/tank-run/final-shadow/`,
with a new independent fourteen-view capture after the runtime freeze. Earlier
generation and visual receipts are historical until freshness/parity is proved.

No feature commit, push or as-is publication approval has occurred. Finish the
remaining checks and resolve the three target questions before qualifying the
batch or preparing a main push.

## Final validation after shadow correction — 2026-09-18

Fresh fetch still places this isolated branch exactly at current `origin/main`
`29c9ecefd22a978a4508700408ed7fa5d9fbc468`, with the complete candidate unstaged.
No source binary is among the proposed changes. The twelve new entries and
existing ZTZ-100 X are implemented, but are not qualified or published.

The measured shadow corrections are complete. All 26 HIGH/LOW builds retain
three articulation-owned casters, at most 90 triangles per part and 228 total.
An independent count of the actual replaced submissions agrees with the new
diagnostic; the reduction is 47.01–219.24 times and 14–22 casting draws become
three. This is bounded submitted geometry, not measured FPS. All visible stock,
materials and neutral transforms are unchanged by the shadow opt-ins.

Final generation refreshed the twelve repaired fill groups, all fleet anatomy
and technical diagrams, and all thirteen selected asset sets. The fill groups
are byte-identical to their preceding generated values. Source/tool identity
stayed fixed during generation. The new anatomy check covers 193 vehicles,
1,661 modules and 386 track sides: zero failures/outside modules; 89 inherited
dimension warnings remain. All 579 technical images are current.

The final composed release still fails: eight of thirteen pass geometry and
fidelity, all thirteen pass the sealed-model gate, and the five raw-export
target conflicts remain. The separate standard checker passes three of thirteen
(ZTZ-100 X, Ajax X and Sabra Mk 2 X); the other results retain the roof-weapon
and source-real-opening conflicts described above. Strict track overlap remains
zero for all thirteen. No failed result has been relabeled as a pass.

The independent final assembled review covers 182 original images with stable
identities. Every changed image was opened; exact PNG matches carry forward
explicit prior independent evidence. Type96 and K21 have a separate reviewer.
The canonical evaluator has no cast shadows, so the separate real Garage review
covers 26 enabled-shadow originals. A fixed-camera Kurganets diagnostic verifies
real shadow contribution and byte-exact restoration in the bounded model ROI.
See [assembled review](../../research/final-regenerated-assembled-visual-review-20260918.md)
and [Garage shadow review](../../research/final-garage-shadow-independent-review-20260918.md).
These are scoped visual results, not battle/night/FPS certification.

The completed validation pipeline passes anatomy, centering, selected assets,
module alignment, duplicate tracks, bore, barrel circularity, all selected
HIGH/LOW geometry budgets, typecheck, public/private builds, public reference
exclusion and attribution. Each of Gallery, desktop Garage and mobile-tier
Garage completes all thirteen first/repeat selections plus rapid final selection.
Both Garage tiers separately pass all thirteen thumbnail checks; that protocol
does not apply to Gallery. Reports remain in `.qa-dev/tank-run/final-shadow/`.

The first final full-suite attempt passes 343/344 pre checks and stops before
core/post. Its sole failure is the Type96 ownership preservation fixture:
the intentional invisible hull-shadow change was included in its full stock
hash. Replaying the authenticated original profile reproduces all four original
HIGH/LOW × factory/winter hashes and proves that only `procShadow_hull` changed.
The fixture retains those original full hashes and compares additional
original-derived native-stock hashes; only two explicitly validated invisible
authored proxies are excluded. The actual gun shadow remains hash-protected,
and separate shadow tests retain real coverage and budgets. All recoil, seating
and wrong-parent checks remain, with eight new tag-misuse negatives. The focused
repair passes. No runtime/profile/generated file changed for this repair.

The full 1,057-file suite finished with result-cache reuse disabled: **344/344
pre, 671/671 core and 40/42 post passed**. Its final result is
`final-shadow/test-recheck.json` (26m26s, exit 1, zero source/tool drift).
The post failures are the legacy factory-staging preservation snapshot and
Warrior's rear mudguard support receipt (151.5mm reported gap). An exhaustive
HIGH/LOW census of all thirteen finds Sabra's front flaps also unsupported
(189.322mm); the early-exit fleet test had not reached that ID. These are real
missing source fenders, not audit omissions: Warrior's Object_21 rear folded
fenders and Sabra's Object_4 curved front covers are being reconstructed from
source-only calipers. Their prior visual acceptance is explicitly withdrawn;
see the addendum in the final assembled/Garage review records. Correction: that
census also records both Ajax rear flaps failing in HIGH/LOW. Those rows were
missed in the earlier summary, not introduced by a later build-state change.
No tolerance or source target changed.

An authenticated replay of main `29c9ecefd` reproduces all six original staging
goldens. Exactly eight scalar receipt fields changed: the two canonical shoes'
RGB multipliers and missing-vertex-color flags. Every geometry, order, instance,
pose and other material field remains exact. The repaired fixture preserves all
original goldens, reconstructs only those fields in a copied historical receipt,
and retains raw staged/synchronous equality plus misuse/geometry/pose negatives.
All 3,828 original checks pass on the focused run; no runtime edit was needed.
Evidence is `.qa-dev/tank-run/staging-golden-diagnosis/`. This is not a full
suite pass, and earlier passing prefixes cannot be combined into that claim.
The only intentional source/tool drift during the preceding pipeline is this
single test-fixture repair. Generation, runtime captures and build evidence
remain tied to unchanged runtime inputs.

The earlier whole-game resource probe retains the same 19/62 failures on both
candidate and untouched main, with no new failing checks. That baseline failure
is still open and is not converted into a performance pass by the selected-model
budgets or selection results. The three owner target questions remain pending;
their answers and a final passing/adjudicated release are needed before a main
push under the requested generation procedure.

## Final fender correction and validation — 2026-09-18

Warrior's missing folded rear fenders and Sabra's curved front fenders are now
authored from the original canonical source measurements. These are thin,
closed sheets with real channels, physically overlapping mounting stock and
seated rubber flaps. The source models, comparison frames and existing gate
thresholds remain unchanged. Both profiles are frozen for regeneration.

Warrior's HIGH/LOW fixture checks all ten registered seats, independent source
roof stations, finite hull/web and lip/flap contacts, open channels and rejected
shifted-flap controls. Actual instanced shoe bounds sampled through five phases
clear every guard triangle by 10 mm. Other visible native stock remains exact;
two derived HIGH marking transforms reseat and require regenerated records.
Sabra's HIGH/LOW fixture passes 142 checks, including finite joints and a real
displaced-flap control. Its 16-phase near/far shoe samples retain at least
116.31/116.84 mm of vertical air under the repaired region; this is a sampled
vertex witness, not a full triangle-intersection certificate. Actual gear
buffers/matrices and 36 aft-body rays per quality remain exact. Both new tests
are registered; the complete manifest contains 1,059 checks.

The exact pre-generation freezes and retained failed experiments are in
`.qa-dev/tank-run/warrior-mudguard-seat/` and
`.qa-dev/tank-run/sabra-front-fender/`. Root's independent focused rerun passes.
The diagnostic post run passes 41/42 files, including the preserved staging
fixture; it stops the fleet seating test at Ajax's rear flaps (82.970 mm gap).
This failure was already present in the earlier HIGH/LOW census and was missed
in its summary. The initial explanation involving loaded fills was incorrect:
seat receipts are calculated before fills are applied. A complete fresh-process
default/HIGH/LOW filled/unfilled census and Ajax source diagnosis are underway.
All earlier raw receipts remain intact. The completed clean-process census
covers 78 builds and 444 registered-part receipts, with Ajax as the only
remaining failed ID; cold/filled receipts are identical. ZTZ and KF41 register
no parts in this particular audit, so it supplies no attachment coverage for
them. See [the corrected census](../../research/supplied-fender-cold-filled-census-20260918.md).

Ajax is now repaired and frozen as well: the low detached box is replaced by
the source's warped/sloped thin sheet and folded mounting root. The receiving
module's measured sloped underside exposes the flap instead of burying it.
All six default/HIGH/LOW cold/filled builds pass 296 focused checks, including
actual source stations, finite contact, a displaced-sheet control and sampled
moving-track air. All 18 gear meshes per quality remain exact. The preceding
fill's selected HIGH/LOW costs are 79,812/47,928 triangles, within the unchanged
80,000/75% limits; final generated costs remain to be checked. Detailed evidence
is in [the Ajax repair report](../../research/ajax-rear-flap-20260918.md).
All three focused fixtures are registered; the final manifest has 1,060 checks.

The second diagnostic post run passes all 42 files with zero source/tool drift.
Full generation also passes: three fills, all 193 anatomy/marking records and
579 technical diagrams, then three scoped centering and presentation asset
sets. Only eight expected selected generated source paths change; the three
authored profiles remain at their frozen hashes. All three focused attachment
fixtures pass again with the newly generated fills actually loaded.

Final evidence belongs in `.qa-dev/tank-run/final-fenders/`; complete validation
and honest executed/reused full-suite counts are still in progress. Fresh
42-view and six native Garage shadow reviews belong in `final-fenders-review/`.
Their first acquisition hit a Vite graphics-dependency 504 and produced no
usable new originals. That failed attempt is retained; an unchanged retry is
pending. Prior visual approval for Warrior, Sabra and Ajax remains withdrawn
until the fresh originals are actually reviewed.

At this historical checkpoint the target questions were pending. The following
owner decisions supersede that state. No feature commit or push had occurred.


## Owner target decisions accepted — 2026-09-18

The owner explicitly approved correctly assembled supplied comparison models, preservation of their actual weapon configurations, and real source slat/vent openings. A separate answer specifically approved the Warrior stand-off air and AFT-10 vents. See the [exact bounded scope and source selectors](../../research/supplied-source-target-decisions-20260918.md). These choices supersede earlier “awaiting owner target” notes in this historical packet.

Source-only assembly preparation and a measured exterior-opening/equipment policy are now authorized. Existing raw-source failures remain historical failures; no oracle is silently overwritten, no failed score is called passing, and publication still requires fresh qualification. The current frozen fender validation is continuing independently while the target work is prepared privately.


### Approved-target preparation and new Warrior finding

The original frozen fender result now includes independent review of all42 refreshed canonical originals and6 Garage originals: [review](../../research/final-fenders-independent-review-20260918.md). All13 current HIGH/LOW builds also pass the unchanged selected geometry/object/detail-reduction budgets. These results apply to that frozen state, before the further Warrior side-stock correction below.

After the owner approved source-real openings, exact current raster centers were checked against full source geometry. AFT agrees on all30 actual hole centers, and a private measured policy passes146 source/native air, edge-web and plate-thickness witnesses. Warrior has307 genuine-air cells but356 missing-source-stock cells:282 Object_5 side-ledge hits,62 Object_27 upper-lip hits and12 Object_21 forward-ledge hits. Its663-cell count is therefore not wholly intentional; the earlier broad source-air description was incomplete. The [source-only study](../../research/warrior-side-ledge-source-study-20260918.md) defines the required correction, preserving the real corridor. No blanket continuity exception has been adopted.

All13 private proposed equipment configurations match their original source hashes, and the improved physical census passes all26 HIGH/LOW builds. It rejects empty, hidden, degenerate and undrawn weapon markers. The source-target/policy changes are still privately prepared and require integration plus fresh qualification; this is not a publication receipt.


## Approved-target integration and measured corrections — 2026-09-18

All target decisions are resolved. Five separately replayable assembled
comparison files are now registered, with the originals and failed original
gate receipts retained. Independent review accepts the source-only assembly
proofs; no registration, comparison camera or 92-point threshold changes.
The actual weapon counts are pinned to each original source hash.

The earlier frozen fender run completed all1,060 manifest checks:
347 pre +671 core +42 post, with1,055 executions and5 legitimate unchanged-input
cache receipts; zero failures. Its other native, anatomy, asset, build and
selection checks also passed. Its composed release remained failed against
the then-unresolved raw targets. That result is historical evidence rather
than qualification of the subsequent changes.

Warrior's356 missing-stock cells are repaired using measured side ledges,
upper lips, inset-panel rims and the small source service-cover fitting.
All307 original source-air cells remain air in the original-grid replay, and
47 independent stock/air checks agree within .909 mm in HIGH/LOW. The new live
raster reports294 cells, all classified against complete source/native geometry;
all47 physical guards pass. AFT reports30 intentional cells with146 passing
guards. The raw counts remain in each report, with zero unexpected openings.
The checker rejects invisible material stock and malformed witness records;
[independent review](../../research/source-openings-independent-review-20260918.md)
accepts those fixes. Final regenerated qualification must repeat these checks.

The assembled targets exposed additional native errors: Kurganets' mast
sections and unsupported side fasteners, Griffin's rear recess and bow floor,
BMP-3M's aft deck/rear wings and four front wedge modules, and K21's rear shell
and hatch. Source-only calipers drive these repairs. Fresh initial Kurganets,
Griffin and BMP-3M view/dimension checks pass; K21 is still being corrected.
The first three retain identical HIGH/LOW running-gear buffers and placement.
Warrior retains35 unaffected native meshes and all existing rear fenders.

Griffin's strict voxel test reports a separate quantization issue: the measured
7.40 mm hull/band air gap shares a2 cm cell. Complete closed-component and
bidirectional noncontainment proof is being integrated into the exact audit;
raw voxel evidence will remain visible. No geometry is shrunk to evade a grid.
Final anatomy/assets, composed release, fresh independent visuals, current
performance budgets and main integration remain required before publication.


### Current main integration — 2026-09-18

Before final qualification, the isolated branch fast-forwarded from
`29c9ecefd22a978a4508700408ed7fa5d9fbc468` to
`88592876f84eb1794f2a6d5505bd39d7c51c4ecd`. This includes the upstream
end-wheel track-ramp relay (`b08328157`) and its test. The fleet's existing
core and test-manifest edits reapplied without conflict; their added/deleted
lines match the retained pre-integration files exactly. The integration did
not stage or discard unrelated work. Private identity receipt:
`.qa-dev/tank-run/main-track-integration/integration.json`.

The final release and selection checks must use this integrated core. Earlier
whole-game performance measurements remain historical evidence at their named
baseline, not a performance certificate for this newer build. The handbook
link checker also has identical archived-Abrams failures on the original
baseline and candidate; all changed current-procedure links resolve.


### Regenerated approved-target checkpoint — 2026-09-18

K21's source-measured rear shell, front lamp hoods, receiver fittings and hidden
track relief are complete. The fresh filled source/contact test and geometry
gate pass. Generation then refreshed all193 playable anatomy/marking records,
all660 keyed technical diagrams (220 registry entries), and scoped centering/art
for the five changed targets. The older579-image statement above described the
playable-row count and was incorrect for the unscoped technical-image command.

The frozen automated run passes all13 geometry, standard, sealed-body and
silhouette-fidelity checks; anatomy also confirms all193 current receipts.
Warrior retains294 measured intentional raster cells and AFT30, each with zero
unexpected cells. Full release, final budgets and selection are still running
in `.qa-dev/tank-run/final-approved-targets/`.

Independent inspection of the freshly assembled Kurganets target found a real
remaining omission: the native rear panel does not reproduce the moved source
access door's physical relief, port, hinges and lower step. The stale profile
comment still treated the target as unresolved. The canonical rear and rear
quarter views therefore FAIL detail acceptance despite passing outlines. A
source-measured correction is being prepared privately while the frozen
validation/capture run finishes. Kurganets is not qualified, and no publication
is authorized by the automated scores alone. Its current originals and the
first Vite dependency-timeout capture remain preserved.


## Final validation failures and bounded corrections

The first frozen final run on main `88592876f84eb1794f2a6d5505bd39d7c51c4ecd`
failed its pre-test group: three of359 checks failed, so the later671 core and42
post checks did not execute in that run. The private build passed. Source, tool
and package fingerprints were unchanged throughout the run (zero drift).
Historical successful prefixes are retained in
`.qa-dev/tank-run/final-approved-targets`; they are not an overall release pass.

The failures identified a live staggered-track regression and two stale QA
witnesses. The shared end-ramp relay reset an unsupported side without a
matching road wheel. A narrow missing-wheel guard restores TML's prior left
band trace byte-for-byte while retaining the new right trace, with unchanged
wheel matrices,0.1mm cut,0mm steady daylight and249mm travel in both qualities.
Its3mm cut/30mm daylight/travel gates remain unchanged. The fitting-census test
now calls the actual physical census and source policy instead of extracting
a retired inline function. Shadow coverage witnesses are being reconciled
against measured source repairs, retaining the50mm inset, three draws, triangle
caps and byte-exact legacy caster checks.

The independent final images accepted Warrior and Griffin but exposed finite
remaining detail omissions in Kurganets, BMP-3M and K21. Kurganets now has a
measured rear door, shield-shaped port, working-sized hinge stock and open
step. K21 now has the low towing shackles, folded bow and descending fourteen
armor blocks on their real receiving deck. Their new generated fills and
focused installed-stock checks are running. BMP-3M's two roof fittings require
a closed local well and corrected shallow-roof/steep-shoulder receiver; its
rear door and bow lamp cages also require source-shaped relief. That work
remains private until finite seating and source comparison pass.

All target questions remain resolved by the owner. Real standoff gaps, vents
and supplied weapons are retained. No source transform, camera or quality
threshold is being changed to force these corrections through. Final full
validation, refreshed affected visual review, costs, selection checks and
publication remain pending.


### Filled-body boundary repair and readability checkpoint

All12 newly authored profiles passed exact HIGH/LOW native stock identity
comparisons across their readability extraction. Geometry attributes, draw
order, transforms, real materials/camouflage pixels and shadow meshes are
unchanged. New runtime modules satisfy the strict complexity limits; inherited
untouched tool functions remain documented diagnostic failures.

The final regeneration then correctly stopped on a BMP-3M filled-source ray:
`hullInteriorFill` occupied exterior air around its bow lamps. The authored
cold body and fittings pass their measured source/seat checks. A diagnostic
using the actual primary hull/turret shells finds zero body leakage; the
rejected fill boxes were generated between separated exterior attachments.
The production boundary policy is being corrected without changing source
witnesses, model triangles, cameras, openings or qualification thresholds.
The first failed generated record/log remain preserved. The full release is
still pending and this checkpoint is not publication qualification.


### Final source-configuration integration — 2026-09-18

The BMP boundary repair now passes freshly filled HIGH/LOW hull and roof
fixtures. The real closed primary hull/turret need zero fill; negative controls
still detect a removed primary plate. No model triangles or source witnesses
changed, and all71 non-target fill records remained identical.

Final weapon review added K21's source-visible two-round auxiliary launcher
while retaining its40mm cannon. It also made Warrior/K21/CV90 Mk.IV launcher
anatomy explicit and corrected CV90105 TML to an inferred front powerpack and
manual four-person layout. Real lazy finalization, guided inventory/reload,
full balance and authoritative ammunition-flow checks pass. See the
[weapon/layout review](../../research/supplied-fleet-weapon-layout-review-20260918.md).

The post-repair generation/capture/qualification pipeline is now running in
`.qa-dev/tank-run/final-corrections/`. Publication remains pending its completion
and independent review; earlier failed artifacts are preserved separately.

### Source weapon reconciliation before the final capture freeze

The exact supplied Armored Warfare configurations exposed two inherited donor
calibers: Kurganets' short Epokha gun is57mm, and this CV90 Mk.IV turret uses50mm.
The metadata is corrected. Kurganets also now has separate Kornet and Bulat
selection, inventory and reload channels. The three-slot loadout is main-gun
AP, Kornet and Bulat; Bulat's nominal70mm/effect tuning is explicitly gameplay
inference rather than a measured caliber or a thermobaric simulation. The
[source-bound independent audit](../../research/supplied-13-caliber-independent-audit-20260918.md)
records all13 configurations, including the remaining stated uncertainties.

Fresh all13 weapon/selector checks,27-IFV balance, full-fleet balance and29
actual authoritative guided launches pass. Each launch consumes only its own
inventory. The CV90 physical throat correction preserves the measured exterior
brake and its99.60mm projecting lip. Its physical annular-seat proof is being
reconciled with that real projecting stock, retaining the5mm seating limit and
negative geometry controls.

The first post-repair generation attempt stopped during technical-image
construction on the CV90 annular-rim assertion. Its FAIL and generated prefix
remain in `final-corrections/pipeline.json` and `generation-final.log`.
Those partial records are not current qualification. The next run uses
`final-corrections/equipment-pipeline.json`, starting with a complete receipt
refresh before four changed models are captured and all13 are qualified.

### Final visual review and Kurganets bow correction

The equipment-generation pass completed the full 193-playable anatomy refresh,
660 technical diagrams for 220 entries, four updated presentation anchors and
40 scoped UI assets. All 56 original canonical comparisons and eight real
Garage images captured afterward have zero acquisition input drift.

BMP-3M, K21 and CV90 Mk.IV pass their independent fourteen-view reviews at
9.0/10 per required view. Their ordinary Garage images retain visible wheel,
track and hull relief with actual shadow maps active. These are scoped visual
passes, not a claim that the full release or production performance passed.
See the [independent review](../../research/final-corrections-independent-review-20260918.md)
and [K21 review](../../research/k21-final-corrections-review-20260918.md).

Kurganets' rear repair passes, but its frontal detail remains 8.7/10. Fresh
source/native rays confirmed that the original broad bow cap buries a real
closed bent plate by approximately 90–110 mm at representative central rays.
The source also contains a lower rolled return and finite side receiving arms.
The specialist is correcting only that local forward contour and authored
plate stock; the roof, aft body, running gear and preceding failed images are
preserved. Final Kurganets images will use the separate
`final-corrections/bow-final-review/` archive.

`equipment-pipeline.json` records successful generation, canonical and Garage
stages, then an intentional preflight exit before qualification because this
visual hold remains unresolved. No complete anatomy check, final composed
release or new full-suite PASS is claimed by that pipeline. The validator
requires a final visual-ready record before starting those jobs.

The [bounded publication audit](../../research/supplied-fleet-publication-review-20260918.md)
found no additional runtime/source-boundary blocker. It verified that source
binaries and private captures remain excluded, new profiles remain demand
loaded, and numerical gates are unchanged. Exact staging hashes must be
refreshed after the remaining geometry, generated records and validation.

The parallel Israeli task's Merkava3D right-cheek repair `12b5dc936` landed
on main during this final review. The integrator pulled it with a clean
nonoverlapping fast-forward; its profile, focused test and packet remain
intact. The next complete anatomy refresh includes that repaired vehicle.
The thirteen supplied-fleet changes remain uncommitted pending qualification.

The final Kurganets bow now passes actual filled HIGH/LOW physical checks.
The repaired source comparison passes a 94.6/92 minimum view score, with
dimensions 100 and floaters 100. The measured backing plates and roof
continuation are structural hull armor; the folded trim, hollow return and
supports remain equipment. Geometry costs are 59,334 HIGH / 38,752 LOW including
23 generated fill boxes. The old rear scalar fixture was corrected to the
approved source datum while retaining its 1 mm tolerance; the same discrepancy
was demonstrated in the preserved pre-bow model. See the
[bow correction record](../../research/kurganets-bow-stock-correction-20260918.md).
Fresh bow images and the composed release remain pending.
