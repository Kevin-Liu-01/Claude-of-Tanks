# Missing tank-work audit — 2026-09-09

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
