# T-90 X canonical Shtora — 2026-09-10

## Subsequent T-90 X release

T-90 X's canonical round red Shtora and complete rearward-stowed NSVT now pass
the frozen fourteen-tank release: all twelve stages, 933 uninterrupted npm
checks, types, and private/public builds. Its final geometry/assets are part
of that checkpoint; see
[`fourteen-tank-recovery-release-20260910.md`](fourteen-tank-recovery-release-20260910.md).
The earlier T-90A X/Vladimir X release below remains separate. Historical
pending/failed T-90 X statements describe those earlier attempts, not this
latest qualified checkpoint. The separate optical sensor is preserved, and
non-Shtora variants do not gain emitters.

## Completed three-tank release — 2026-09-10

The official composed release for `type10_x,t90a_x,t90a_vladimir_x`
finished **PASS** at 08:22:11 UTC. Its single uninterrupted `npm test`
invocation passed all 923 entries (296 pre, 590 core, 37 post); no interrupted
prefix was substituted. All twelve release stages, including private build,
passed. Separate typecheck, scoped Doctor (zero findings), and public build
passed by 08:22:22 UTC. Geometry minima remain 93.6 / 92.3 / 94.5;
registered fidelity remains 95.3 / 97.4 / 96.8. All three have zero measured
track collisions and continuity holes and a recognized complete roof weapon.

**Provenance qualification:** the auxiliary frozen-tree wrapper remains
`FAIL` and has not been rewritten. It began at `573781c41`; the sole
573781c41..f2e80586b change replaced the standalone crop test's `new Function`
loader with an exact-URL source-owned module. The production declaration,
source slice, `P={}`, assertions, and thresholds did not change. That commit
landed before this test's first execution at core 510/590. Independent review
found no earlier nested import. The preceding sequential timing rows total
2,868,543 ms child time plus 1,440,897 ms FIFO wait: even excluding all other
overhead, execution could not precede 08:09:10 UTC, after the 07:05:09 commit.
All runtime/vehicle inputs remained unchanged;
this is a successful composed release, **not an immutable-snapshot run**.
The consumed fixture SHA-256 is
`f33f31e69fc21a57b1247ffe17b63435f8ac6f55cbe6b5dff19a74545abe7b9f`.

Publication is a separate one-commit rebase onto `063514d51`, preserving newer
main changes. Vehicle code, selected assets and geometry packets are identical
to the qualified owner tree (only the normal ledger timestamp refreshed).
The additional main-integration checks passed: six Garage checks; six foundry
checks; seven engine/runner checks including the native twelve-case pixel
matrix; and eight final terrain/registry/hygiene checks. Types, scoped Doctor
and public build passed again on the final rebase. The two-worker opt-in was
used for the last focused integration, not retroactively for the full run.

Raw local evidence is retained in the owner worktree at
`.qa-dev/reports/three-tank-clean-release-mVGqVl/{receipt.json,release.log}`
and in the publication worktree's main/foundry/engine/terrain integration
receipts. The wrapper's metadata failure and all older failures below remain
visible. No source models, temporary QA, or failed T-90 X experiment is shipped.
T-90 X's canonical Shtora/whole-weapon fit belongs to the following fourteen-tank
checkpoint and is not claimed as published by this three-tank release.

## Historical clean-run qualification boundary

The corrected three-tank candidate is frozen after `6a8151df1`, incorporating
published main `43321e687`. Every individual pre/core/post check has now executed
successfully across the interrupted diagnostic attempts, including the separately
added main tests. **That is not a successful `npm test` invocation or a completed
composed release.** A fresh, uninterrupted composed release is required and is
the next publication gate; the earlier runs remain interrupted evidence.

The diagnostic runs exposed unrelated published-main harness drift: two Autumn
palette fixtures lacked the new strict-true birch/aspen flag projection; the
legacy crop extractor lacked its actual `P` binding; the wharf release guard
assumed adjacency before Autumn dressing was inserted; and the wreck profiler
still looked for stage calls in the former synchronous factory body. Corrections
preserve the original palette hashes and assertions. Exact consumer ordering,
missing/conditional/wrong release negatives, actual three-seed wharf ownership,
and the profiler's unchanged 30-stage minimum plus generator-owner rejection
all pass. Independent review found and corrected the initial consumer-order
negative gap before final re-execution. No rendered tank source changed.

Local diagnostic receipts: `three-tank-final-tail-bwrEfN` (interrupted at crop),
`three-tank-last-regressions-bePbfl` (interrupted at wharf), and
`three-tank-last-regressions-rQrCmO` (core tail passed; post stopped at profiler).
Final wharf order and the two last post tools passed separately. World integration
`three-tank-world-integration-H33Hbg` and Garage integration
`three-tank-garage-integration-uIXrsW` passed all eight and six selected checks.
Current registry has 923 ordered checks: 296 pre, 590 core, 37 post. These results
are explicitly diagnostic history, not cached acceptance for the clean run.

## Historical publication candidate

Only `type10_x`, `t90a_x` and `t90a_vladimir_x` are in the next release.
Their fresh strict standard preflight passes: all geometry components meet
92, exact track sweeps are clear, continuity scans find zero holes, and each
has a complete recognized roof weapon. Full final qualification/publication
is still pending. T-90 X has been restored byte-for-byte to published main;
its fresh geometry recheck passes 93.8, and it is not a changed tank here.

The complete T-90 X Shtora/weapon experiment described below is saved at
`8003760a6`, not shipped. Its failed raw curve gate remains documented below.
The three-tank driver `three-tank-publication-lsjLfn` began at `0fc5bbfc6`.
The separately tested release-step ordering/docs changed afterward
(`b49ec6a0d`, now published as `1c0ad3146`). Main's autumn world/collision/
minimap work through `c4b3c14ac` was then integrated as `00b4cf991` before
the full npm suite. Authored vehicle geometry stayed frozen throughout.

Every final vehicle-specific release phase passes: strict standard, registered
fidelity (Type 10 95.3, T-90A 97.4, Vladimir 96.8), full anatomy freshness,
centering, module alignment/hits, asset freshness, duplicate-track detection,
muzzle and barrel circularity. The complete preceding anatomy check also
passes: 181 calibrated vehicles, 1,552 modules, 362 track sides and zero
failed/outside-envelope probes. Full npm tests/private build remain pending.
The asset manifest differs from current main only for these three IDs.

T-90 X's subsequent whole-weapon rearward-stowed candidate is preserved at
`9bb4f29e6` and integrated with the recovered wheel/skirt work at `aacfda627`.
That compound preflight passes strict standard 93.8 (turret 95.1), with zero
track/continuity failures. Its isolated registered fidelity passes 95.9.
It is not part of this three-tank release and is not yet published. The old
forward-facing failed experiment below remains historical evidence, not the
current candidate's outcome.

## Preserved three-model Shtora experiment

### Regression continuation after the historical ERA witness

The three-tank run completed all vehicle-specific release phases, then stopped
at pretest 231/296: `t90XEraBindings.selftest.mjs` compared the new classic
Shtora equipment against its immutable pre-repair world-vertex fingerprint.
The other 230 pretests passed. This was not an ERA contact/depletion failure;
the fingerprint assertion ran before those assertions in that file.

`classicShtoraHistory.test-support.mjs` now reconstructs only the exact former
first-party two-projector recipe for that historical witness. It matches all
22 current stock/seat calls, both exact red discs and the single added viewing
lens; no spatial/bucket exclusion, source mesh or new golden is used. The
original A/V fingerprints pass unchanged at both LODs. All strip/reset,
physical-facet and fixed-backing checks still run on the actual new geometry,
and the canonical Shtora/aperture tests pass separately. Rendered source and
the already-passed vehicle release phases are unchanged by this test-only fix.
The remaining regression phases and final build still need completion.

The resumed pretest tail passed through 296/296. Core then stopped at its first
test because the retained `height-canvas-readback-probe.mjs` from main lacked
a documentation reference. Its real reproduction command is now documented;
the hygiene rule and maintained-tool allowlist are unchanged. Core restarts
at file 1 against main through `09a58b3d3`, including the newer UI/world work.
The historical helper now disposes the shared two-eye material once per
construction, after use; its focused ERA and canonical Shtora tests pass again.
Independent review found no golden/ERA-coverage blocker. Its limitation remains:
the inverse recipe checks current exact signatures; independent new-fitting
protection comes from the twelve frozen legacy recipes and live-aperture tests.
No vehicle geometry changed during either continuation.

Owner request: use our proper Shtora eyes on T-90 X and other equipped T-90s.

`t90_x`, `t90a_x`, and `t90a_vladimir_x` now use the original fleet's
round red OTShU fitting: closed dark body, drum, painted rim, red optical
disc, visor, cheek plates, fins and lower bracket. Narrow carriers connect
the source-specific turret seats to the new bodies. These are cosmetic
equipment, not extra armor. Their frames follow turret yaw, not gun pitch.
M/MS/SM and other non-equipped variants do not acquire invented emitters.

The exact existing `ruShtora` construction was extracted into a small shared
module instead of importing the entire Russian family into X packs. Twelve
frozen pre-extraction hashes cover scale/round/kit combinations; all match
primitive buffers, index data, seats, material colors and buckets exactly.
Legacy callers retain their options and material customization.

The X emitter faces intentionally depart from the supplied files to satisfy
the owner's fleet-style correction. T-90 X's optical face is now at authored
z=1.7255 m instead of 1.71717 m. Historical raw source measurements are not
rewritten. The former projector-face-only ray assertions are superseded by
the actual canonical emitter test; unrelated source sensor, rear case,
carrier and six side-cassette geometry/air assertions remain unchanged.

Passed: new high/low tests on the three changed variants and two original
controls, two physical apertures even when low detail batches both into one
mesh, canonical red/amber material, round disc dimensions, turret ownership
and yaw, exposed-aperture rays; existing T-90 X detail test; typecheck and
unused-code check; shared-helper complexity gate (zero violations).

Nine native front/angle/side images for the three changed variants were
generated and inspected in `.qa-dev/shtora-native-20260910-r1`. Red eyes are
visible and seated. Side images crop the distal main gun and are not muzzle
or whole-silhouette evidence. No all-angle fidelity, full-release or tank
switching-speed claim follows from these images. Anatomy/asset refresh and
targeted release qualification remain pending.

## Complete T-90 X roof weapon

Current fit: the complete, full-scale shared NSVT is seated directly on the
existing AA cradle at authored (-0.58325, 2.650, 0.14202) m. The opt-in
`external-cradle` fitting omits only the duplicate pedestal/fork; its receiver,
feed, barrel and sights retain canonical dimensions. Both receiver edges
contact the retained channel rails through their lower chamfer. Existing fleet fittings keep
the default pintle geometry unchanged. The actual HIGH/LOW dual-contact,
straight-axis and articulation checks pass. The focused registered fidelity
recheck passes at 95.8 overall with all registered views above their gate;
the full release and regenerated post-fit assets remain pending.

The `shtora-type10-release-nruyMF` run began at `589a1679b`. During its
already-loaded anatomy measurement, published runtime checkpoint
`18e519d35` was integrated as `97d36589d`; no authored tank/profile/fitting
geometry changed. Subsequent markings, assets, anatomy-check, render gates,
full tests and private build consume that integrated source. The run's
initial-head field is not a claim that later phases used the older runtime.

The full post-integration anatomy check passes (181 tanks, 1,552 modules,
362 track sides; zero failed hits/outside-envelope modules). An independent
read-only review of `589a1679b` found no release blocker: default fitting
arithmetic/geometry is preserved, all child meshes remain equipment-owned,
and actual dual-rail contact is tested rather than inferred from AABBs.
The reviewer did not independently rerun the rendering/fidelity gates.

The first full release attempt passed anatomy and the other three tanks'
fidelity gates but stopped at T-90 X turret-side scores 89.66/89.93 (overall
95.20). The added pintle had stacked a second pedestal onto the existing
source cradle. No gate threshold, registration, mask or golden was changed.
The corrected direct-cradle placement is checked first, before repeating
expensive anatomy/assets/release stages.

### Previous elevated placement (superseded, not published)

The former empty AA stock is now completed by the shared NSVT primitive,
with receiver, connected feed, flanged bearing and an explicit breech/barrel
bridge. The bearing is seated inside the existing rear channel web at
authored (-0.58325, 2.63428, 0.154) m. The whole fitting faces +Z and belongs
to the turret, independently of main-gun pitch. This intentional fleet-style
addition is not represented as source-authored geometry or a fake MG marker.

Four focused tests pass together: Shtora, T-90 X details, the 175 historical
receiver/optic rays, and the new complete-weapon check. Historical stock/air
rays exclude only the newly added named weapon; the source stock itself is
unchanged. New HIGH/LOW tests inspect actual bearing/web shared material,
bridged straight barrel at three turret yaws, rig ownership, and exactly one
recognized complete weapon. Native review, anatomy/assets and the integrated
release gate still remain before publication.

The first integrated anatomy check stopped at Vladimir X's missing optics
receipt after the old blue dazzlers were removed. Its forward sight bezel
had no glass of its own. Both classic X variants now receive a 180×70×12 mm
viewing lens seated into that existing bezel. This separates actual viewing
optics from the red Shtora emitters; no anatomy assertion is waived and no
generated calibration is hand-edited. The failed run remains recorded in
`.qa-dev/reports/shtora-type10-release-d4Nlfn/receipt.json`.

The corrected run's complete 181-tank anatomy/marking/module/technical-asset
check passes. The auxiliary-armor history test retains its original T-90 X
HIGH/LOW fingerprints (`04c35f68…` / `392827c7…`): a test-only scalar inverse
matches all 24 current projector-part calls and both exact red discs, restores
only their prior first-party recipe, and omits the separately tested named
complete NSVT. Both original whole-model hashes pass unchanged. No spatial
exclusion, refreshed golden, production override or source mesh is involved.
These test-only compatibility edits do not alter the frozen rendered runtime.

## Terminal release result and publication split

The integrated `shtora-type10-release-nruyMF` run terminated at the strict
geometry gate: T-90 X turret side curves scored 89.4838 against 92. Its new
complete roof weapon extends the side envelope beyond the source's incomplete
AA stock. The independent silhouette gate passed 95.8; it does not override
the failed metric-curve gate. Full npm tests and private build were not reached.
Type 10 X, T-90A X and T-90A Vladimir X passed their fresh geometry components.

The complete T-90 X experiment and generated failure packet are preserved on
`codex/fleet-painted-bodywork-20260909`. A separate publication branch restores
T-90 X to published main and ships only the other three qualified tanks after
their remaining checks. This is a scope split, not a gate waiver; T-90 X still
needs its canonical Shtora and complete weapon delivered in a later checkpoint.
