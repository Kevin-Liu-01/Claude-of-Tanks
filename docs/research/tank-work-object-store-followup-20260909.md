# Missing tank-work audit — 2026-09-09

## Current publication boundary (supersedes the historical inventory below)

The current candidate restores `t90_x` as a fourteenth tank using the passing
rearward-stowed roof-weapon pose from `9bb4f29e6`, together with canonical
Shtora eyes and the recovered fitted tire/painted-skirt changes. In the isolated
weapon candidate, actual HIGH/LOW dual-rail contact, straight barrel and turret
articulation pass; full strict standard passes 93.8 minimum (turret 95.1),
zero track/gap failures and MG1; registered fidelity passes 95.9. The entire
weapon is parked rearward, not its barrel independently angled. The compound
fourteen-tank source still needs its final integrated checks and generation.
The thirteen-tank preflight below remains valid evidence for that earlier
boundary, not a claim that the fourteenth tank was tested in that run.

The second-wave source test now distinguishes the complete owner-added T-90 X
NSVT from its historically unarmed source carrier. Actual HIGH/LOW tests pass
with one physical recognized weapon; temporarily detaching only that named
addition retains all original carrier/open-channel witnesses and the unchanged
standard MG0 rejection. A marker-only fake weapon still fails. The separate
dual-rail contact, four-station barrel/host and articulation test also passes.
No source scalar witness, silhouette target or MG gate was weakened.
Independent read-only review of `809738a97` found no actionable blocker and
confirmed unchanged scalar/tolerance and five carrier stock/air witnesses.
The positive source test alone is not a complete weapon/contact proof; those
assertions remain in the separately passing mount-and-axis test.

The compound T-90 X preflight at `aacfda627` also passes: strict standard
93.8 minimum, zero clip/continuity failures and MG1; shared fitting defaults,
actual rail contact/straight-axis articulation, canonical Shtora and full
nine-model auxiliary-history tests pass. An added retained-stock exclusion
test passes at four barrel center stations across HIGH/LOW and three yaws.
It is not an exhaustive finite-volume collision proof.

The independent read-only recovery critic found no blocker in the stowed
runtime (`8de4996c…aa2b`) and test (`cc0cd89f…83c3`), verifying the two
authored rail witnesses have 2.18 mm positive overlap, unchanged shared
fitting defaults/ownership, and coherent native angle/top/side and neutral
board appearance. The critic did not rerun tests or certify all-volume
intersections. Final integrated generation/release remains pending.

### Earlier thirteen-tank isolation and qualification

The recovered release now contains thirteen tanks: `leclerc_x`,
`leclerc_classic_x`, `strv122_x`, `leo2a4m_x`, `leo2a5_x`, `kf51_x`,
`amx30_x`, `t72b_1987_x`, `t72b3_x`, `t62mv1_x`, `t72bu_x`,
`t90a_burlak_x`, and `t90ms_x`. Source and tests are integrated with the
three-tank Type 10/Shtora publication candidate and current main runtime.
The final combined generation/release is not yet qualified or published.

Fresh preflight at `37229963d` passes all thirteen strict standard rows:
minimum components 92.2–96, zero end/swept track intersections, zero continuity
cells, and one complete recognized weapon each. The focused integrated checks
also pass: two fixed-skirt profiles at HIGH/LOW factory/winter (24 posed/spent
whole-model differentials), six Soviet wheel-face profiles with actual visible
paint/closed-tire/unchanged-axle witnesses, and the complete nine-model auxiliary
armor history with all original whole-model hashes and 1,214 physical facets.

T-90 X is unchanged from published main in this boundary. Its recovered wheel
and skirt repairs remain in `6eb7c52a6`; its canonical Shtora/complete roof
weapon experiment remains in `8003760a6`. The weapon fits its real cradle but
fails the frozen source's strict turret-side metric (89.4838/92). T-72B3M
remains separately preserved at `68f978403` with the documented 268 continuity
cells. Neither failure was waived, and neither tank is a claimed repair here.

The release runner now checks strict standard/fidelity first, before expensive
full-fleet anatomy and the full test/build tail. Its exact twelve-command
inventory and all assertion flags remain covered by the passing plan selftest.
The documentation checker still reports pre-existing missing relative links
and unreachable historical recovery pages; this workflow edit adds/removes no
links and does not claim that checker passed.

## Current reconciliation — 2026-09-10 02:27 UTC

Remote `refs/heads/main` independently resolves to
`c0064aaae78a248c6e1a46886788e455c6098482`, matching the local remote-tracking
ref. A fresh full status scan from **02:26:50 to 02:27:05 UTC** covered
**298 existing directories out of 486 registered worktrees**, finding
**56 dirty trees and zero status errors**, with 884 local branches. It used
`git --no-optional-locks status --porcelain=v1 -z --untracked-files=all`
with four bounded concurrent readers. The 188 registered but absent directories
are not automatically lost commits; their retained branches and historical
classification must be consulted. Thirteen active/recovery locations were
also checked individually against the pinned remote. The shared root is still
conflicted, 1,816 commits behind its remote-tracking branch, and was not altered.
All eight stash identities remain unchanged, and all 96 recovery refs were
independently verified to resolve to existing commit objects.
The earlier branch/patch, reflog and raw-object analyses below supply the
historical classification; this refresh did not repeat the raw-object scan
or certify every historical patch equivalent. The only vehicle-path commit
found across retained refs since the previous 02:06 refresh was the T-72B3 X
shoulder checkpoint `67fe67bc3` described below. This time filter is not a
substitute for the earlier branch/blob/reflog reconciliation.

### Confirmed unpublished updates: 27 distinct vehicles

Every saved head below was resolved and checked as not an ancestor of the
remote. These are local changes to existing tanks, not 27 missing tank models.
Worktree names are relative to `/Users/kevinliu/.codex/worktrees/`.

| Vehicles | Worktree / current local head | Unpublished work |
|---|---|---|
| Leclerc X, Leclerc Classic X, Strv 122 X, Leopard 2A4M X, Leopard 2A5 X, KF51 X | `cot-fleet-running-gear-integration-20260909` / `1818285a0` | Wheel/shoe cost reductions and fitted return rollers. |
| Merkava Mk3D X, Mk4 X | `cot-merkava-return-rollers-20260909` / `eac96616a` | Return-roller fitting. |
| Centurion III, Centurion V, Strv 81 | `cot-centurion-roller-fit-20260909` / `a65a7374f` | Dual return rollers and physical supports. |
| Challenger 3, Challenger 3 X | `cot-challenger-roller-spindles-20260908` / `ec95e0daa` | Hull-to-hub supports; existing release limitations remain. |
| K2 X, T-14 X | `cot-k2-t14-roller-release-20260909` / `983e91a1e` | Roller and comparator work; K2 remains below the 92-point source gate. One fidelity-tool edit is also uncommitted. |
| T-80U X | `cot-t80u-x-outsole-pilot-20260908` / `6e3bbb3d5` | Fitted-gear pilot; unresolved intersections. |
| T-90A X | `cot-t90a-fitted-wheel-checkpoint-20260908` / `fd7669944` | Original-gauge tracks, fitted running gear, upper-fender closures and shadow inclusion; terrain issues remain. The curved front-fender returns are committed at `c9ee8029d`, with the eight-view render comparison at `2d482990b`. Subsequent `16ba4fc69` fixes delayed upward support, with measurements recorded at `fd7669944`. Three newer footprint-support source/test edits are uncommitted; their tests/types pass but the terrain trace still fails. Neither the saved pilot nor this continuation is published. |
| Type 10 X | `cot-fleet-painted-bodywork-20260909` / `2f996ae20` | Fourteen painted fixed skirt panels, scoped assets, historical census-test corrections, seven-Abrams product totals/roster integration and the exact loading assertion correction. Six commits are saved locally after rebase onto `7145bf3f1`; the new release retry is still running. |
| AMX-30 X, T-72B 1987 X, T-72B3 X, T-72B3M X, T-72BU X, T-90 X, T-90A Burlak X, T-90MS X, T-62MV-1 X | `cot-amx30-wheel-face-style-20260909` / `67fe67bc3` | Visible painted wheel faces; additional fixed-skirt paint work for T-90 X, T-72BU X and T-62MV-1 X. The omitted shadow bucket is repaired at `14a1800b6`; `1704c3e34` records all 72 final-source skirt views reviewed. The newer seven-path T-72B3 X upper-skirt/shoulder repair is now committed at `67fe67bc3`, with a clean working copy. Focused motion/attachment/history checks passed; 16 of its 48 final-source frames were reviewed. Full release remains pending and thin tracks remain explicitly unfinished. |

The six-vehicle and nine-vehicle groups are also composed in
`cot-tank-recovery-publication-20260909` at `726fac32d`, now including the
three fixed-skirt paint/shadow repairs and historical preservation-test
follow-ups. Its 109 dirty paths consist of this report plus 108 generated
receipts/assets, not 109 additional missing source implementations.
The first fifteen-ID release failed at stale presentation `projection.centerYM`
values for `leo2a4m_x` and `leo2a5_x`; hash-verified native/asset regeneration
corrected those entries. The subsequent fifteen-ID pipeline **failed at
00:07 UTC**, rather than being cancelled. Its completed terminal output was
recovered from this task's own execution record after the process handle had
closed. Anatomy, centering, module checks, 150 asset files, track duplication,
muzzle checks and all fifteen source/geometry score floors passed. However,
the complete standard check accepted only 13/15: `t72b3m_x` reported 268
continuity cells and `t90_x` reported `mg0` in the fittings census. Subsequent
source inspection resolved the latter ambiguity: `t90AwXAAReceiver.ts`
explicitly models an empty mounting cradle, not a complete machine gun.
`t72b3mXSideMounts.ts` explicitly preserves open source-reference side
channels. A separate target-choice question remains pending about completing
these in-game assemblies versus preserving those source features. Neither
shape was altered or its gate waived by this audit. The fifteen-ID full
test/private-build phases were not reached.

Type 10's previous separate full release **failed**, rather than being cancelled:
after source/standard and pre-test phases passed, the core suite stopped at
the obsolete `loadingIntent.selftest.mjs` assertion. Published world commit
`16269dc30` had added the `covered-battle` atmosphere argument without updating
that assertion. The precise test-only correction is now committed at
`b2e19921e`, and its focused test passed. Its subsequent core-only diagnostic
run (session 13156) also terminated with exit 1, this time at
`src/productStats.selftest.mjs:36`: saved counts of 164 production / 201
development / 203 saved / 174 playable vehicles disagree with registry counts
of 171 / 208 / 210 / 181. Doctor and the private build were not reached in
that diagnostic command. These are test/registry integration failures, not
proof that the paint geometry failed. The registry integration was subsequently
corrected at `372f8e0c8`: exact totals are 171 / 208 / 210 / 181, and the
maintained roster generator added the seven missing Abrams rows. Focused
product-stat, roster-freshness, loading-intent and SEO checks passed. The
already-started full retry (session 53131) is live: types, changed-scope Doctor
(91/100, no findings), anatomy, centering, modules, assets, tracks, muzzle,
circularity, source fidelity (95.3) and standard (93.6) passed, and the full
test suite is running. The pre-test phase has passed; core tests are now
running, including successful loading-intent, product-stat and roster checks.
No final release/private/public-build/attribution result
is claimed. This audit only observed the same driver; it did not cancel,
restart, or initiate another release job.
The final-source three-skirt capture completed all 72 expected images with
zero reported errors and matching before/after input hash
`5642c8b104b5f9d76e06182dd8cb8832b42be075d5f6b6db70334ab08078bacf`.
All 72 have now been reviewed at native size and documented in `1704c3e34`.
They support camouflage and lower-wheel-visibility findings, but the still-thin
tracks are visibly unfinished. They are not close-range seam, terrain or
whole-fleet release proof.

The T-90A support follow-up's existing focused driver completed successfully:
HIGH/LOW fixed-wheel, neutral-course and hit-envelope tests, types and runtime
code metrics passed. Doctor reported no diagnostics (score 84/100). Its
separate real-terrain trace also completed without changing the sampled
height field. These results do not clear the measured 2–3 mm terrain-contact
failures; that pilot is not a releasable fleet-track fix.

The newer already-running footprint-support driver (session 25514) subsequently
finished with exit 0: its helper selftest and types passed. The diagnostic
terrain script's exit status is not a contact certificate. Its receipt at
`.qa-dev/t90-maintained-gauge-ground-7JkMRA/receipt.json` still reports candidate
penetration: approximately 3.554 mm on cross-slope, 2.931 mm on the raised bump,
and 1.982 mm in the hollow (worst HIGH/LOW result). Flat contact passes. The
cross-slope result is worse than the prior approximately 2.930 mm result, so
this experiment must not be described as a finished support repair. The three
uncommitted files are `src/vehicles/continuousShoeFloor.ts`, its selftest, and
`src/vehicles/tankFactoryCore.ts` in that pilot tree. This audit observed the
existing driver; it did not start another test or alter those source files.

### Uncommitted work beyond the tank checkpoints

- `cot-interactive-performance-20260909`: **126 changed/untracked paths** on
  published base `47e86743d`. Loading, garage-return, rendering and performance
  work in the working copy is not published merely because its base is.
- `cot-amx30-wheel-face-style-20260909`: the seven previously uncommitted
  T-72B3 X shoulder paths are now preserved in **`67fe67bc3`**; the fresh scan
  found a clean working copy. The commit contains `t72b3X.ts`, the new
  `t72b3XSkirtReturns.ts` and its selftest, the exact-history helper, the
  Soviet auxiliary-armor regression update, suite registration, and
  `docs/research/t72b3-x-upper-skirt-closure-20260909.md`.
  Two outer returns and four inner shoulder-root returns add 536 triangles.
  The corrected all-gear test finished successfully (4987): HIGH/LOW ×
  factory/winter, measured +0.30 / −0.22 m axle travel, 1,512 finite-stock
  laps, 24 rear-joint bridges and 31.0 / 48.4 mm lateral clearance. The
  separate geometry/history/type/Doctor driver also finished (70264, exit 0);
  its three Doctor warnings are test-only. Sixteen of 48 final-source native
  frames were reviewed, with lower wheels still visible. These are focused
  checks, not full release acceptance. The subsequent source prequalification
  (17746) stopped at an unavailable/mismatched comparison oracle: the tree
  has no local `public/models` directory. No source score was established;
  standard checks in that driver were not reached. The audit did not repair
  the oracle path, change its certificate, rerun jobs, or publish the commit.
- `cot-fleet-all-tank-scope-20260908`: four additional uncommitted paths:
  `docs/tank-generation/fleet-style-performance-priority.md`,
  `tools/switch-latency-probe.mjs`, `tools/switch-cadence-evidence.mjs`, and
  `tools/switch-cadence-evidence.selftest.mjs`. The two cadence files do not
  exist on current main; the other two differ. They distinguish JS-visible
  readiness and deliberate idle cadence from actual presented-frame latency.
  This is unpublished documentation/measurement tooling, not proof that tank
  switching is fixed.
- The three T-90A front-fender source/test files formerly listed as uncommitted
  are now included in local commit `c9ee8029d`. Three different, newer
  footprint-support files are uncommitted, as detailed above.
  The K2/T-14 tree retains its uncommitted
  `tools/procedural-fidelity.mjs`; Type 10 has only a modified gate-ledger
  timestamp. Its loading test and product-count corrections are now committed.
- Old BWP-1 naming/decal work, T-44 geometry, T-90 donor cleanup,
  source-envelope/ground-up experiments, and mixed BMPT/M3A3/Upior drafts are
  still present in the older dirty trees listed in the detailed inventory.
  Their residual semantic disposition remains open; do not restore obsolete
  combinations wholesale.

Seven representative older authored files were rechecked on disk and retain
the exact blob hashes in the detailed inventory: BWP-1's profile and untracked
test, the Russia/T-44 profile, the T-90 donor-cleanup profile, both ground-up
and measurement prototypes, and `.wt-recheck`'s mixed AFV profile. They are
present, not newly recovered or qualified implementations.

### Already on origin/main, not missing

Rechecked actual ancestry for seven Abrams X source (`aecf3439c`) and assets
(`92b328a83`), MBT-70 fenders (`1f412d2d2`), nine-tank bodywork/A7V/Revolution
release history (`6bba0ee6d`), and six-tank canvas/smoke recovery (`9dc23a5a1`).
The MBT-70 dirty fidelity-test file also exactly matches current main; it is
not a missing fender fix. Published work retains its documented exceptions.

The additional historical T-62 compact-scale/track-wrap commit `f616f2c02`
and archived original-development Leopard 2A7 roller commit `1d5580d7e`
were resolved again as existing unpublished commits. They are separate from
the 27 current vehicles above; the original Leopard checkpoint is not playable.
Their presence does not establish that either old design should be reinstated.

The original T-62 checkpoint received an additional narrow source check:
current `profiles/russia.ts` still calls `buildT62Obr1975Chassis(P)` directly,
without that checkpoint's 0.90 root-scale/compact-track receipt. The historical
scale-and-wrap implementation is therefore a concrete retained local delta,
separate from the nine-model X wheel-face group. Later turret revisions exist,
so this finding does not authorize replacing the current profile wholesale.

### Older nonancestor branches: feature-level follow-up

The following authored changes were inspected against the same pinned remote.
These observations refine the older thirteen-head review bucket; they do not
certify every generated asset, deletion, or entire mixed commit equivalent.
No runtime was restored and no regression suite was launched for this audit.

| Historical head | Current-source disposition |
|---|---|
| `3be351db25d1` — original K2 wheel compression | `modern3.ts` retains the six stations `[2.48, 1.55, 0.62, -0.31, -1.24, -2.17]`, roller stations `[1.61, 0.20, -1.21]`, and `contactZR: -2.395`. This is not another missing K2 X roller pass. |
| `209b37fafb1e` — Strv 81 duplicate prism | `profiles/sweden.ts` retains the single donor shell and omits the identified duplicate full-size slab. The Swedish cheek continuations remain. |
| `e292b73c7c6c` — Type 10 mantlet fit | `profiles/type10GunSeat.ts`, `modern3.ts`, and `profiles/japan.ts` retain the compact shared mantlet dimensions and their callers. This is separate from the unpublished Type 10 X skirt-paint work. |
| `3a120e5a9437` — MBT-70 rollers / Abrams turret lift | `modern2.ts` retains MBT-70's three return stations; `profiles/abrams.ts` retains `ABRAMS_TURRET_LIFT_M = 0.012` and assembly-level callers. These identifiable features are not missing. Later fender work is separately confirmed published above. |
| `d3cc1c2e1532` — KF51B turret centering | The old 0.30 m seat has a later published successor, not a missing restoration: the current regression contract uses 0.65 m local / 0.6825 m scaled forward seating with gun ownership preserved. Published follow-ups include `a5bc9aaf5` and `b2f51b291`. Do not restore the old seat over them. |
| `191985d0dd28` — A6M field ERA | Current source uses the later frontal-only `addLeo2A6MFrontalERA` and explicit glacis/cheek sectors. It is not identical to the old full six-sector side/skirt package; the old package must not be silently reinstated. |
| `44a4900ef454` — mixed modern seating | Current source still contains the Vickers bow-lock, Challenger roof-seating, Ariete side-panel/C2 ERA, and shared Type 10 gun-seat implementations/receipts. Those features are present; other hunks in the mixed branch remain outside this narrow equivalence finding. |
| `0331b3d18574` / `53ab9fc47590` — autoloader correction | The examined four-round Italian magazine and loader removal survive in `modern3Specs.ts`, with later timing of 2.5 s / 21.0 s rather than the old 3.5 s / 28.0 s. This does not certify every other crew/spec hunk in those commits equivalent. |
| `05e83db2b110` — Challenger 2 family | Current `challengerSpecs.ts` retains FV4034, Challenger 2E and Ukrainian Challenger 2, including `CR2E_ERA` and the enhanced armor builder. The profile registry still routes all three to their shared variant builder. The family is not absent; this narrow check does not qualify every historical geometry/asset hunk. |
| `b58ae45bdef9` — German tier-10 MBT-70 | Current `tier.ts` retains tier 10, and `modern2.ts` retains the `buildM1A1BareHull` dependency/call. Later published MBT-70 fender changes are independently confirmed above. This is not another missing complete MBT-70 model. |

The remaining broad balance integrations and August mixed snapshots
remain explicitly indexed for semantic review, not counted as proven missing
features. Locating a commit, preserving it locally, publishing it, and passing
its release gates are four different states.

The thirteen named worktrees and their current heads in this section were
checked directly against remote `c0064aaae`, not inferred from their names.
All nine tank checkpoint heads remain unpublished; the two integration trees
do not add vehicles to the 27-count. The performance and all-tank-scope trees
have published base commits but unpublished working-copy edits. All eight
stash hashes and 96 recovery commit references were independently resolved.
The all-existing-worktree status scan was refreshed as described above; the
earlier raw-object and historical source classifications retain their own
timestamps. The seven representative older authored files were also rehashed
and all remain byte-identical to their recorded inventory values.

Only this report was updated by this read-only reconciliation. Earlier
implementation checkpoints retain their own validation and publication
boundaries. No source was restored by this audit,
no other task's files staged, no stash/ref changed, and nothing pushed. Local
preservation is not remote backup. The remaining 13 mixed historical branch
heads and protected 49 reflog / 47 raw-object combinations are indexed below,
not claimed to be that many missing features. Deleted untracked files or
already-pruned objects cannot be ruled out.

## Later September 9 preservation and integration

Rechecked against fetched `origin/main` `3cdbf6149` (the intervening commits
are world/reed work). The nine unpublished groups below still total 27
distinct vehicles. Abrams X and MBT-70 remain confirmed published ancestors.
This is a targeted checkpoint update, not another raw-object recovery sweep.

- All six Leclerc/Strv/Leopard changes and all nine wheel-face repairs are
  now committed locally and composed in the fifteen-tank publication tree
  at `dc7774394`. Its focused tests/types, anatomy/marking generation, fleet
  technical views and fifteen selected asset sets completed. Full release
  is running; no final pass or push. All fifteen ignored comparison GLBs
  were located and authenticated against their canonical hashes.
- Nine-model auxiliary-armor preservation passed HIGH/LOW at `d94d690b2`:
  1,214 actual facets and original whole-model hashes retained through exact
  declared repair inverses. This test-only follow-up is not yet composed in
  the frozen publication tree. The 216-frame wheel capture completed;
  selected frames were reviewed, not every frame approved.
- Type 10 X is saved through `6165d922a`. Its second release passed geometry
  and source gates but found another historical census test that omitted
  seven added Abrams IDs. The exact original 151 marking-anchor hash still
  passes after separating those IDs. Full release is rerunning.
- The T-90A X original-gauge pilot is maintained runtime at `834b2fe80`, not
  merely ignored QA. Neutral-course, fixed-wheel, hit-envelope and component
  budget tests passed, but terrain penetration remains. The new upper-fender
  return is saved at `c12b95b01`; both qualities pass physical attachment,
  open-lower-wheel and complete neutral-course clearance checks. Types passed;
  native review remains pending. Neither checkpoint is published.
- Native side review found remaining black fixed skirts on T-90 X, T-72BU X
  and T-62MV-1 X. The finish-only continuation is saved at `5c8579568` in the
  wheel tree, separate from the frozen fifteen-ID composition. Its initial
  regression caught an omitted shadow-proxy bucket; this remains an explicit
  failure to fix, not permission to publish. These are further repairs within
  the existing 27-vehicle inventory, not three additional missing tanks.

All source models, temporary QA and the other task's active performance edits
remain outside these commits. The shared conflicted checkout was not changed.
The earlier inventory's hashes and dirty counts below describe their original
observation times; the saved heads above supersede those entries.

## Reconciliation — 21:52 UTC

Independently queried `origin` / `refs/heads/main`:
`1db45b0adf445d83deda74fe04b161d9d970161c`.
The targeted location/ancestry recheck confirms **unpublished updates affecting
27 distinct tanks**, not 27 absent tank models or 27 finished releases.
This combines the previously located 17-vehicle backlog with later work on
Leclerc Classic X and nine wheel-face models. The latter are ongoing repairs,
not newly discovered historical cancellations. Earlier sections retain their
observation-time counts and must not override this section.

All worktree names below are under `/Users/kevinliu/.codex/worktrees/`.
None of the listed tank checkpoint heads is an ancestor of the queried remote.

| Vehicles / work | Worktree | Saved head / current state |
|---|---|---|
| Leclerc X, Leclerc Classic X, Strv 122 X wheel/shoe costs; A4M X, A5 X, KF51 X rollers | `cot-fleet-running-gear-integration-20260909` | `bb52edb98fe231822e8c642892c9ab1fa6f588be`; runtime committed locally, one updated cost-report file uncommitted; full release pending. |
| Merkava Mk3D X, Mk4 X rollers | `cot-merkava-return-rollers-20260909` | `eac96616a4c0241cbb3af3fa1e28037855f512c9`; clean local checkpoint, qualification pending. |
| Centurion III, V, Strv 81 rollers | `cot-centurion-roller-fit-20260909` | `a65a7374f2ab18feb5db387caa0cc1ff550fe35e`; clean local checkpoint, qualification pending. |
| Challenger 3, 3 X supports | `cot-challenger-roller-spindles-20260908` | `ec95e0daa777d20472dbd324899423343c0628d1`; clean local checkpoint, existing centering/oracle limitations retained. |
| K2 X, T-14 X rollers | `cot-k2-t14-roller-release-20260909` | `983e91a1eb74f5f5d76dee1dffa3c0cd98f6494d`; one fidelity-tool edit uncommitted; known K2 source-gate failure retained. |
| T-80U X fitted gear | `cot-t80u-x-outsole-pilot-20260908` | `6e3bbb3d5ff649dfd8de9dc352e8d33abd21cdaf`; clean local pilot, intersections unresolved. |
| T-90A X fitted gear | `cot-t90a-fitted-wheel-checkpoint-20260908` | `b6b05a8fe40a47bee4570720a6935711b8d3a2af`; clean local runtime checkpoint; newer original-gauge experiments remain ignored QA, not maintained/published runtime. |
| Type 10 X painted skirts | `cot-fleet-painted-bodywork-20260909` | `fce2cc00f31106f5bf7c9a2e8f5bcbcc487e838e`; source/assets committed locally; live release has modified its ledger. Source 95.3/92 and standard 93.6/92 passed; full test phase still running, no final release result. |
| AMX-30 X; T-72B 1987 X, B3 X, B3M X, BU X; T-90 X, Burlak X, MS X; T-62MV-1 X wheel faces | `cot-amx30-wheel-face-style-20260909` | `e5080105f0d6bc785d11aae2dd7a33042413ec59`; AMX/first two T-72 repairs committed locally, six additional profile repairs plus test/report uncommitted (eight paths total). Native capture and further regression drivers remain live/queued. |

The six uncommitted wheel profiles are `t72b3mX.ts`, `t72buX.ts`,
`t90AwX.ts`, `t90BurlakX.ts`, `t90msX.ts`, and `t62mv1X.ts` under
`src/vehicles/profiles/`. The eight-ID physical wheel-face regression finished
successfully with 2,256 first-visible painted-face rays across HIGH/LOW, plus
closed-ring, source-axle/radius and tire-budget checks. This is focused proof,
not completed native/anatomy/assets/release acceptance. Source remains frozen
while the existing native capture runs.

### Published, historical, and still-uncertain work

- The seven Abrams X source/asset recovery commits, MBT-70 fenders,
  nine-tank bodywork/A7V/Revolution release history, and six-tank canvas/smoke
  recovery were rechecked as ancestors of the remote. Their exact commits and
  retained release exceptions are listed below. Do not count them as lost.
- The active `cot-interactive-performance-20260909` working copy has **91
  uncommitted paths** on published base `47e86743d098b868513aa841a9e9c00675ad49fd`.
  Its base being published does not publish these changes. No other task's
  files were staged or altered, and switching-performance acceptance remains
  unproven here.
- Additional historical original-T-62 checkpoint
  `f616f2c02bcb04972e771af6dc29872f9b72f233` and archived, non-playable original
  Leopard-2A7 checkpoint `1d5580d7e0e7f9cf2ebeca918958f27ffd97f753` still resolve
  locally and are not remote ancestors. They are separate from the 27 above;
  their old design intent is not permission to restore obsolete trees.
- **Eight stashes and 96 recovery refs remain.** The existing broad
  worktree/branch/reflog/raw-object inventory below remains the historical
  coverage record. This refresh was targeted, not another exhaustive sweep.
  The 47 protected residual raw snapshots are not 47 proven missing features;
  older mixed patches still need semantic reconciliation. Deleted untracked
  files and already-pruned objects cannot be ruled out.

This reconciliation changed only this audit report. No runtime was restored,
no source or QA artifacts staged, no job cancelled, and nothing pushed.
Local preservation, remote publication, and release acceptance remain distinct.

## Current takeaway and preservation (20:55–20:58 UTC)

There is genuinely unpublished work: **nine previously identified groups / 17
vehicles**, plus an older original T-62 change and an archived non-playable
Leopard 2A7. The groups are Leclerc X/Strv 122 X wheel optimization; A4M X/A5 X/
KF51 X rollers; two Merkava X rollers; Centurion III/V/Strv 81 rollers;
Challenger 3/3X spindles; K2 X/T14 X rollers; T80U X and T90A X fitted-gear
pilots; and Type 10 X painted skirts. These are missing updates, not 17
entirely absent tanks. Their exact historical heads and qualification limits
remain in the tables below.

At `2026-09-09T20:55:44.099Z`, the remote was independently verified as
`9e9291ebe038ee6b859a0bdc5084cd6475021726`. All those saved commits still
resolve, remain reachable from local branches, and are not remote ancestors.
Type 10's branch now points to its newer preservation child, not its original
source head. The A7V X/Revolution portion of the old five-Leopard branch is
already published and must not be counted twice.

The seven Abrams X models, MBT-70 fenders, nine-tank bodywork/A7V/Revolution,
and six-tank canvas/smoke recovery are already published. Their documented
release exceptions are not erased by this audit.

### Newly preserved working copies

The following owned working copies were committed locally, with their pending
release status recorded. All three now have zero tracked/untracked Git changes;
ignored native QA remains on disk and is not in the commits.

| Scope | New local checkpoint | Qualification boundary |
|---|---|---|
| Five-tank gear integration | `c9db910e917a6730c31cb47e587edb0bb1816fec` | 14 focused checks and types passed; 120 native images captured. Full visual/anatomy/assets/release work remains. This composes two existing groups, not five new missing tanks. |
| Type 10 X assets/receipt | `7f6186647726a30312aca460a2eecbc7da846ba9` | Preserves the source parent `a4f09c1ef`, seven images, manifest, ledger timestamp and first release outcome. Geometry passed; the complete release rerun is pending. |
| AMX-30 X visible wheel-face repair | `5d2c1352163fb6ce08a3ec9f3a27e6a328d19b2e` | New work, not an older lost implementation. Both-quality physical rays, closed rings, wheel/track/suspension tests and types passed; 24 native images captured. Full release remains pending. |

Their worktrees are, respectively,
`cot-fleet-running-gear-integration-20260909`,
`cot-fleet-painted-bodywork-20260909`, and
`cot-amx30-wheel-face-style-20260909` under
`/Users/kevinliu/.codex/worktrees/`. None of these three model checkpoints was
pushed to main. Local preservation is not remote backup or release acceptance.

The stale ammunition census that stopped Type 10's first release was reproduced
on unchanged published vehicle source, corrected, and separately pushed at
`9e9291ebe`. It now explicitly tests 535 existing, 69 second-wave X and 21 Abrams
X channels (625 total). Both the ammunition-flow and seven-Abrams registry
tests pass. No ammunition runtime or geometry threshold changed.

### Other unfinished work and raw-object protection

The separate active performance tree,
`cot-interactive-performance-20260909`, has **85 uncommitted paths** at this
recheck on `47e86743d098b868513aa841a9e9c00675ad49fd`. These include loading,
garage return, shader readiness, HUD, grass and timing probes. Its owner is
still working; this audit did not stage or alter those files or certify a
latency improvement.

All eight stashes and the existing 49 recovery refs remain intact. Additionally,
all **47 residual raw snapshots** in the JSON appendix now have verified local
refs under `refs/recovery/tank-raw-audit-20260909/<full-commit-hash>`, protecting
their objects against ordinary unreachable-object pruning. The transaction
only created absent refs and verified each exact target. It did not restore
their trees, change any branch checkout, or push the snapshots. The JSON's
earlier “no new refs” field describes its original scan, before this preservation.

This does not prove 47 missing features: some are obsolete or already published
in later form, and other mixed historical deltas still need semantic review.
The earlier broad sweep covered branches, all then-existing worktrees, all eight
stashes, reflogs and raw Git objects; the final check here was targeted, not a
new full sweep. Deleted untracked files, already-pruned objects and unknown
external directories cannot be recovered or ruled out by this inventory.

Earlier sections below retain their original observation times and counts.

Read-only follow-up against fetched `origin/main` **7351f0b4ad92c97be03e7be0bb7a700a3f332484**. This is an inventory, not a new visual, geometry, or release certificate.

## Finding

There is real unpublished work: **eight active-model groups affecting sixteen vehicles**, plus one archived development-model group. Their source commits still exist locally. Some passed focused checks, some are blocked, and two are deliberately unactivated prototypes. This is not equivalent to sixteen entirely missing tanks.

The seven conventional Abrams X models, MBT-70 upper fenders, nine-tank bodywork/A7V/Revolution checkpoint, and six-tank canvas/smoke recovery are already in origin/main. Publication does not make the explicitly accepted as-is Abrams work a completed fidelity/performance release.

## Confirmed local groups

All listed worktrees were rechecked. Eight were clean; K2/T14 retained one modified fidelity-tool file. Complete commits below were confirmed locally and their branches compared with origin/main using Git ancestry and patch equivalence.

| Work | Local worktree | Checkpoint | Remaining boundary |
|---|---|---|---|
| Leclerc X / Strv 122 X wheel optimization | [cot-source-wheel-detail-budget-20260909](/Users/kevinliu/.codex/worktrees/cot-source-wheel-detail-budget-20260909) | `5ca30a7fe4dfae7632e5d37e00a061086d76a25b` | Focused/native proof passed; combined release not completed. |
| Leopard 2A4M X / 2A5 X / KF51 X efficient return rollers | [cot-leopard-efficient-rollers-20260909](/Users/kevinliu/.codex/worktrees/cot-leopard-efficient-rollers-20260909) | `0121238b29e9c3cb4e3fa930e9d2bf5c804da355` | Local. A7V X and Revolution portions were published separately. Remaining three still need native/anatomy/release qualification. |
| Merkava Mk3D X / Mk4 X return rollers | [cot-merkava-return-rollers-20260909](/Users/kevinliu/.codex/worktrees/cot-merkava-return-rollers-20260909) | `eac96616a4c0241cbb3af3fa1e28037855f512c9` | Measured fit/history/types passed; source/visual/combined release pending. Roller count is inferred. |
| Centurion III / V / Strv 81 dual return rollers | [cot-centurion-roller-fit-20260909](/Users/kevinliu/.codex/worktrees/cot-centurion-roller-fit-20260909) | `a65a7374f2ab18feb5db387caa0cc1ff550fe35e` | Native finite-stock and suspension-clamp proof passed; visual/source/release pending. |
| Challenger 3 / 3X return-roller spindles | [cot-challenger-roller-spindles-20260908](/Users/kevinliu/.codex/worktrees/cot-challenger-roller-spindles-20260908) | `ec95e0daa777d20472dbd324899423343c0628d1` | Blocked by existing portrait centering failure and no registered 3X source oracle. |
| K2 X / T-14 X rollers and scoring correction | [cot-k2-t14-roller-release-20260909](/Users/kevinliu/.codex/worktrees/cot-k2-t14-roller-release-20260909) | `983e91a1eb74f5f5d76dee1dffa3c0cd98f6494d` | Blocked: K2 baseline 90.8036 and candidate 90.8137 both below 92. Newer measured full-stroke verification also needed. One local fidelity-tool edit remains. |
| T-80U X fitted running gear | [cot-t80u-x-outsole-pilot-20260908](/Users/kevinliu/.codex/worktrees/cot-t80u-x-outsole-pilot-20260908) | `6e3bbb3d5ff649dfd8de9dc352e8d33abd21cdaf` | Unactivated WIP. Native guide/roller and pad/disc intersections remain. |
| T-90A X original-gauge running gear | [cot-t90a-fitted-wheel-checkpoint-20260908](/Users/kevinliu/.codex/worktrees/cot-t90a-fitted-wheel-checkpoint-20260908) | `b6b05a8fe40a47bee4570720a6935711b8d3a2af` | Unactivated WIP. Terrain/performance/bodywork work unfinished. |
| Original development Leopard 2A7 rollers | [cot-original-leo2a7-roller-release-20260909](/Users/kevinliu/.codex/worktrees/cot-original-leo2a7-roller-release-20260909) | `1d5580d7e0e7f9cf2ebeca918958f27ffd97f753` | Local archived non-playable model. Do not confuse with released A7V X rollers or add it to the playable roster just to publish it. |

## Confirmed published

These commits are ancestors of the fetched origin/main:

- `1f412d2d28f3b55ac5cb0c64469a6907795a0d21`: MBT-70 fenders and recorded source-gate exception.
- `9dc23a5a173e3d45a488b4b6ec3317150f63bd4d`: recovered T-90M X / Vladimir X canvas and A7V X / A6M X / A4M X / Revolution smoke, with scoped assets.
- `aecf3439c516ee4e01f43d8f3d83053555f06a8b`: seven conventional Abrams X source recovery.
- `92b328a83d4dca5cb9d155ca8ad69d37b5203bf4`: recovered Abrams asset sets/manifests.
- `6bba0ee6d`: verified nine-tank release history, including A7V X/Revolution rollers.

The existing Abrams qualification job was observed live. Its anatomy freshness, marking freshness, combat-anatomy selftest, and module-hit checks passed; technical assets and targeted release had not reached a reported final result when this audit was written. Module-hit output retained 83 dimension-drift warnings. No duplicate tests were started.

## Working-copy and branch sweep

- Registered worktrees: **466**; existing directories checked: **278**.
- Dirty worktrees: **55**; Git status errors: **0**.
- Local branches: **865**. The eight existing stashes retain the same hashes as the prior inventory.
- The shared checkout is **1,794 commits behind origin/main** and still conflicted. It was not modified.
- Old dirty Abrams/source-X trees are not independent missing fleet rebuilds; preserved source manifests and the earlier byte/patch audit account for their published and obsolete content.
- The old MBT-70 dirty test-registration delta is already incorporated by the published direct-registration fix; it is not a missing fender change.
- The ERA descriptor helper in orphan draft `5f1860d9` exactly matches main, and main calls it. The removed unused Jaguar prototype in `7676558b` is absent from main. These are not newly missing features.

For old uncommitted BWP-1 precursors, T-44 geometry, T-90 donor cleanup, source-ground-up experiments, BMPT/M3A3/Upiór combinations, thirteen mixed historical branch heads, all eight stashes, and the previous forty-nine protected commit combinations, use the [full repository recovery inventory](tank-work-recovery-inventory-20260909.md). They are preservation/review buckets, not a blind merge list.

## Additional object-store sweep

A read-only `git fsck --unreachable --no-reflogs` scan covered the object store as well as refs/reflogs. It found 1,524 unreachable commits, of which **413** were outside both current refs and reflogs. Source-byte classification of those 413:

- **305**: no changed authored vehicle-runtime files under the stated filter.
- **58**: all added/modified authored source blobs occur in published history.
- **3**: all added/modified authored source blobs occur under another local ref.
- **47**: older snapshot combinations with at least one unmatched authored blob or deletion-only boundary. These are not 47 proven missing features.

The filter excludes selftests, test-support, generated files/calibrations and named source-geometry payloads. Byte membership is not semantic patch equivalence; particularly, matching new blobs does not independently qualify deletions. Full residual locators are in [raw-object-audit.json](tank-work-raw-object-audit-20260909.json).

Five residual combinations date from September. Their relevant deltas were inspected:

| Object | Finding |
|---|---|
| `137ce92130efa670293eeafaf34594911de0b79a` | Old untracked IFV scaling helper. Main already has the 0.90 scaler and live callers. |
| `e6a0931a8d81e7d853d23f81c3d8829bdcefa470` | CV90/Puma scaling integration snapshot. Main retains those integrations. |
| `fabafbbde2a4a545865b20a3755fbbb17e2406b3` | Chieftain closed-shoulder/mudguard snapshot. Main has the helper and calls it for Mk5 and Mk10. |
| `c9bae3268ce51e6a739266805bca26b4876dfb5a` | Challenger1/KV2 balance snapshot. Main retains the tier and balance-revision edits. |
| `6afef13e9ac69bcc60974d283484481ba07b85ca` | Earlier original-development Leopard 2A7 roller implementation. Same already-identified archived local workstream, not a new X-model pass. |

The other 42 residual combinations predate September and include old camo, hull/gear, anatomy-display, fleet-centering, and integration/autostash snapshots. They have exact locators in the JSON; their full semantic disposition remains open. The previous 49 recovery refs remain present. This audit did not create new refs or push any of these additional raw snapshots.

## Boundaries

No reset, restore, stash pop/drop, cleanup, merge, cherry-pick, or push was performed in this follow-up. No model source or other task's work was changed. Only this local report and its JSON appendix were written. Deleted filesystem contents, already-pruned Git objects, and unregistered external directories cannot be ruled out by this audit. The remaining fleet-style/performance requirements are still unfinished and must not be presented as solved by locating old code.


## Post-snapshot receipt and additional feature checks

The existing Abrams qualification finished after the snapshot above. Its final
receipt was published at `b6708a7bcc19c704588781e98bf353c00c38b4cf`.
Complete anatomy and eight pre-source release phases passed. Source qualification
then failed at availability: seven unavailable references and zero measured
comparisons. Standard checks, full npm tests, and private build were unrun in
that driver. See [the complete receipt](abrams-recovered-publication-20260909.md).

Five additional older raw snapshots were inspected at the feature level against
the same pinned source. These identifiable behaviors survive on main; this is
not a claim that every historical byte or mixed patch is equivalent:

| Raw snapshot | Current-source observation |
|---|---|
| `074e511d45ba3eb336f2fec82b6d50f132f0a18f` | American M2/RWS fittings remain in `profiles/kit.ts`; Abrams TTS station variants and their callers remain in `profiles/abrams.ts`. TUSK/SEP3 now have later commander-tower implementations; do not restore the old heads over them. |
| `cd22a5182ca250df3bd5c76b1a8b5b67f166d1d0` | The shoulder-fill implementation and enabled Leopard 2A6M configuration (`upperShoulderFill`, floor 1.30 m) remain in `profiles/leopard.ts`. |
| `5ce53c50ea2ad3f1482a2222f8c959d47a855593` | `materials.ts` imports and calls `factoryCamoPatternIdFor(spec.nation, spec.era)`; the old per-nation lookup is not needed as a restoration. |
| `404b0856c7b919e6d9cebb796e0ac273cae35876` | `T64_FRONT_IDLER_LIFT_M = 0.04` and its BV idler/receipt calls remain in `profiles/russia.ts`. |
| `0c71bdcf79ef1ad239386969f12f6e93b2371d9a` | KF51's vertical rear-plane chevrons, retracted fore roof/core, and lowered gun lineage remain in `profiles/leopard.ts`, with subsequent full-height cheek and side-return revisions. This obsolete snapshot must not overwrite those successors. |

The full semantic disposition of the older mixed snapshots remains open. The
JSON appendix is an inventory of exact objects, not an automatic restore list.
Neither this document nor that appendix imports historical runtime geometry.

## Current recheck: unpublished does not mean deleted

The next read-only recheck pinned the actual remote `refs/heads/main` to
`25658c449dc5757af9549969507c6ff37b3cd862`. All nine current tank checkpoint
heads below resolved locally and were not ancestors of that remote. The
existing per-feature comparisons above still matter: the five-Leopard branch
contains two already-published models, so only its remaining three count here.

| Unpublished group | Vehicles still affected | Saved local head | Boundary |
|---|---|---|---|
| Wheel-detail optimization | Leclerc X, Strv 122 X | `5ca30a7fe4dfae7632e5d37e00a061086d76a25b` | Focused/native evidence retained; composed release pending. |
| Remaining Leopard-family rollers | Leopard 2A4M X, Leopard 2A5 X, KF51 X | `0121238b29e9c3cb4e3fa930e9d2bf5c804da355` | A7V X/Revolution already published; remaining three local. |
| Merkava return rollers | Merkava Mk3D X, Mk4 X | `eac96616a4c0241cbb3af3fa1e28037855f512c9` | Measured-fit checkpoint; complete qualification pending. |
| Dual return rollers | Centurion III, Centurion V, Strv 81 | `a65a7374f2ab18feb5db387caa0cc1ff550fe35e` | Measured-motion checkpoint; complete qualification pending. |
| Hull-to-hub supports | Challenger 3, Challenger 3 X | `ec95e0daa777d20472dbd324899423343c0628d1` | Existing centering failure and unavailable oracle remain. |
| K2/T14 rollers | K2 X, T-14 X | `983e91a1eb74f5f5d76dee1dffa3c0cd98f6494d` | K2 fails the unchanged source gate; updated full-stroke proof still required. |
| Fitted running-gear pilot | T-80U X | `6e3bbb3d5ff649dfd8de9dc352e8d33abd21cdaf` | Unactivated WIP with remaining intersections. |
| Original-gauge running-gear pilot | T-90A X | `b6b05a8fe40a47bee4570720a6935711b8d3a2af` | Unactivated WIP; terrain, bodywork and performance unfinished. |
| Fixed skirt camouflage | Type 10 X | `a4f09c1ef0111e5699eee0f11ddc98409d03d89f` | Fourteen fixed painted pieces reassigned; focused/native checks passed. Full qualification still running at this recheck. |

That is **nine groups / seventeen distinct vehicles**, not nine fully releasable
commits. Original-development Leopard 2A7 remains an additional archived,
non-playable checkpoint, not a missing new X variant.

Type 10 X is in
`/Users/kevinliu/.codex/worktrees/cot-fleet-painted-bodywork-20260909`.
Its source is committed locally; eight changed asset/manifest paths were still
uncommitted when scanned. The existing qualification driver completed the full
anatomy update and selected icon generation, then entered `tank:anatomy:check`.
It had not returned a final release result. No duplicate driver was started.

### Performance work is also still on disk

`/Users/kevinliu/.codex/worktrees/cot-interactive-performance-20260909` retains
**76 uncommitted paths** on base
`47e86743d098b868513aa841a9e9c00675ad49fd`, including source, regression tests,
probes and `docs/research/interactive-performance-20260909.md`. Its changes
include HUD observer/ammunition work, cooperative grass construction, covered
loading/return ownership, shader readiness and scene-watchdog work. They were
inspected without staging or modifying that worktree. Its own latest R4 receipt
states functional-only success and retains long-task/smoothness failures;
these are not certified tank-switch latency fixes merely because code exists.

The separate `cot-track-contact-materials-20260909` tree has eight dirty paths
in FX/world contact sampling and test registration. Those concern terrain
surface/contact effects, not vehicle track thickness or road-wheel geometry.
They must not be counted as the missing tank primitive rollout.

### Sweep coverage and remaining uncertainty

The refreshed all-existing-worktree status scan used `--no-optional-locks` and
`--porcelain=v1 -uall`: **471 registered worktrees, 283 existing directories,
57 dirty worktrees, zero status errors**. A subsequent ref check counted 869
local branches and confirmed the same eight stash hashes. Other tasks were
active, so these are observation-time counts. All 49 existing recovery refs
remained present. The shared conflicted checkout was not altered.

This recheck does not turn the 47 raw-object residual combinations, 13 older
mixed branch heads, or historical dirty-file buckets into proven missing
features. Their exact locators and unresolved boundaries remain in this report,
its JSON appendix and the original recovery inventory. No historical runtime
was restored, no stash was popped, and no source model or temporary QA was
staged. Only this ledger update is a publication candidate.

## Latest read-only reconciliation

Remote `refs/heads/main` was independently queried again and resolved to
**034bb8344c6b164fe943747c9eada604b942a699**. The all-existing-worktree scan
at **2026-09-09T20:04:39.944Z** covered 472 registered worktrees / 284 existing
directories, 58 dirty worktrees and 870 branches, with zero Git status errors.
All eight stashes remain. All 49 protected recovery refs still resolve to the
commit named in each ref. Other tasks are active; these are timestamped counts.

All nine current tank-group heads in the preceding table were resolved again
as actual commit objects with named local branches. None is an ancestor of
the queried remote. The previous partial-publication distinction still applies
to the five-Leopard branch: its A7V X/Revolution subset is already on main.

### Additional original T-62 checkpoint is genuinely absent

`codex/t62-obj1975-scale-tracks-r2` points to
**f616f2c02bcb04972e771af6dc29872f9b72f233**. It preserves the original
`t62mv1` / T-62 obr. 1975 change, not the separately rebuilt `t62mv1_x`:

- Uniform 0.90 hull/turret-root scale with corresponding contact and hitbox
  scaling.
- 0.135 m authored shoe pitch, 0.050 m return sag and 12-step terminal arcs.
- Adjusted dimensions, a focused scale/track selftest, and historical assets.

This was previously only an unresolved historical branch locator. The feature
was now compared with current source: `buildT62MV1` still calls the unchanged
shared chassis without those overrides or final scaling, and neither current
source nor published history contains `t62-obr1975-compact-track-wrap-r1`.
The local branch still exists, but has no worktree checked out at that head.
Its commit is not on origin/main. No current qualification was run, and Git
alone does not establish whether the old change was intentionally abandoned.
Do not reintroduce its old generated assets or JS-era files wholesale.

The located backlog is therefore **nine current groups / seventeen vehicles,
plus this additional historical T-62 change**. The archived original-development
Leopard 2A7 checkpoint is separate again and remains non-playable.

### Historical items that are not newly missing features

Read-only authored-diff and current-source checks further narrowed several
older branch/dirty-file buckets. These are feature observations, not whole-tree
equivalence or fresh geometry acceptance:

| Historical locator | Current-source disposition |
|---|---|
| K2 wheel/track seating `3be351db25d1` | `modern3.ts` retains the six compressed wheel stations, three roller stations, -2.395 rear contact and matching ISU decoration loop. |
| KF51B centering `d3cc1c2e1532` | Current owner-specific turret code has a later forward datum (0.65 m), superseding the old 0.30 m move. Do not move it backward to restore this old patch. |
| Strv 81 closure `209b37fafb1e` | `profiles/sweden.ts` retains the donor closed casting and removal of the duplicate full-size prism. |
| Type 10 mantlet `e292b73c7c6c` | The typed `TYPE10_MANTLET_FIT` and live Type 10/Type 10B callers retain the compact housing, face, cover and auxiliary-port placement. |
| MBT-70/Abrams roller/lift `3a120e5a9437` | `modern2.ts` retains MBT-70's three roller stations; `profiles/abrams.ts` retains the shared 0.012 m lift helper and its use. This is distinct from unfinished new Abrams-X gear work. |
| Dirty BWP-1 decal precursor | The `BWP-1` turret decal is already in `profiles/afvFamily.ts`; the old uncommitted renaming file is not a missing new paint feature. |
| Dirty Vladimir donor cleanup | Current `profiles/t90.ts` already removes the fixed raised turret/casemate island and old thin silhouette patches, using a later 1.50–1.51 m central deck and revised bow/stern. The older 1.48–1.49 m proposal should not overwrite it. |
| Dirty `.wt-recheck` AFV combination | Current source retains BMPT separated rack arms/tubes and the Upiór corrected prow, rear doors and running-gear direction. M3A3's symmetric skirt/apron behavior moved into shared Bradley dressing rather than remaining duplicated here. |

The Challenger-family, A6M field-ERA, modern-tank seating, fleet-balance and
German MBT-70 additions also have explicitly located published successors:
`ea8eff446`, `1d3bac072`, `0ce8c1614`, `27797d3f4` and `fe7f4919b`, respectively.
Their historical complete mixed patches are not certified byte-equivalent by
this note. The old autoloader branches are also mixed: current Carro/AbramsX
magazine settings and the published crew-layout system supersede parts of them,
while the old ZTZ-85 loader proposal differs from the current manual-crew layout.
That difference is an unresolved historical design decision, not authorization
to change crew rules during a recovery audit.

### Uncommitted work and live checks were not lost

- `cot-fleet-running-gear-integration-20260909` has **10 uncommitted source/test
  files** composing the already-listed Leclerc/Strv and three-Leopard changes
  onto current main. This is not a new five-tank group to double-count. Its
  existing focused-test driver was observed running; Leclerc passed and the
  next test was queued. No duplicate driver was started.
- `cot-interactive-performance-20260909` has **84 uncommitted paths** at the
  timestamp above, up from the prior 76 as its owner continues work. The
  previous functional-only/remaining-latency qualification boundary remains;
  these files were not staged, reverted or claimed released.
- Type 10 X's existing driver completed full anatomy/marking/module/technical
  checks and typecheck, and entered targeted release. No final release pass
  had been reported at this observation. Its local source commit and generated
  assets remain distinct from a published checkpoint.
- The existing 63-tank review job completed **378 native images**, contact
  sheets and **126 gallery/far-mode geometry-count rows**. These artifacts are
  still under `.qa-dev/fleet-style-review-20260909` in the publication worktree.
  Completion of capture is not completion of visual review or fleet fixes.

No runtime, source model, index, stash, branch or remote was changed in this
reconciliation. Only this local report was updated. The 47 raw-object residual
combinations remain located in the JSON appendix; selected identifiable
features above are now classified, but the full semantics of every historical
mixed snapshot are not resolved. Deleted untracked files and already-pruned
objects remain outside what this Git/on-disk audit can prove.

### Final location recheck (20:15 UTC)

The remote still resolves to `034bb8344c6b164fe943747c9eada604b942a699`.
All nine current checkpoint objects and the additional original T-62 object
were resolved independently again; each has a named local branch and none is
an ancestor of that remote. This confirms their saved locations, not blanket
patch absence: the previously identified partial Leopard publication still
applies.

The five-tank integration's existing driver has now finished successfully:
all 14 focused checks and final typecheck passed. Its ten source/test files
remain uncommitted; this does not complete its visual/anatomy/release work.
Type 10 X passed its measured source comparison (95.3 against 92) and standard
geometry gate (93.6 against 92), and its existing release driver is now running
the full test suite. There is still no final release result. Its source commit
is local and nine generated asset/ledger paths are currently uncommitted.

The active performance worktree now has **83 uncommitted paths**, measured at
`2026-09-09T20:15:20.727Z`; the earlier 84-path figure is its prior snapshot,
not an additional missing group. No files in that other task were changed.

This follow-up changes only the local audit report. It does not restore old
runtime code, activate failed pilots, commit their artifacts, or push them.

### Current publication and running-job reconciliation (20:28 UTC)

The actual remote now resolves to
`f363fbd5e6f7064eec4952f47d2c67635bd63fce`. Its two additional commits concern
rail coal and woody roots, not vehicle geometry. A targeted read-only recheck
at `2026-09-09T20:28:40.334Z` confirmed all nine tank checkpoint objects, the
historical T-62 checkpoint, and the archived original Leopard 2A7 checkpoint
still resolve under their named local branches and are not remote ancestors.
This was a targeted reconciliation, not another all-worktree/object-store scan.

- The five-tank integration still has ten uncommitted source/test files.
  Its fourteen focused checks and typecheck passed. Its already-running native
  driver completed 24 images each for Leclerc X, Strv 122 X, A4M X and A5 X;
  KF51 X was queued. Capture completion is not visual acceptance or release.
- Type 10 X's existing release driver has now **failed**, rather than being
  silently cancelled. Source comparison (95.3/92) and standard geometry
  (93.6/92) passed; the full suite stopped in
  `src/sim/ammunitionFlow.selftest.mjs:152`, whose ammunition-channel census
  reported 556 against expected 535. That observation does not attribute the
  failure to the paint change. The private-build phase did not run. The saved
  source commit and nine uncommitted generated paths remain on disk.
- A newly started AMX-30 X wheel-face regression is in
  `/Users/kevinliu/.codex/worktrees/cot-amx30-wheel-face-style-20260909`.
  Its sole changed file is `src/vehicles/profiles/amx30X.selftest.mjs`;
  the runtime remains unchanged. It is new test-only work, not a recovered
  implementation or an additional completed fix.
- The separate active performance worktree still has 83 uncommitted paths.
  Its owner reports that native timing acceptance remains constrained by
  machine load. It was not modified or counted as verified tank performance.

The distinction remains: saved locally, published remotely, and fully
qualified are three separate states. No runtime restore, staging, commit,
push, stash operation or cleanup was performed in this reconciliation.
