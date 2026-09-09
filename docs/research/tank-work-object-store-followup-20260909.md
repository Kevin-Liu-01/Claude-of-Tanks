# Missing tank-work audit — 2026-09-09

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
