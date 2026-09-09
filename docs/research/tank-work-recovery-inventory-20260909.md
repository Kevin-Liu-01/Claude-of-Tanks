# Tank work recovery inventory — 2026-09-09

Status: preservation inventory, not a release certificate. This audit found
both unpublished work and many historical copies of already-published work.
No candidate was restored, deleted, cleaned, cherry-picked or pushed by this
audit. The sole file write is this report; the parent owns its commit. The
subsequently authorized local recovery refs are recorded below.

## Snapshot and method

Pinned comparison: origin/main **5b322420483210485dc802bf3f40af0f250ca59e**.
Metadata and contents were inspected on 2026-09-09; detailed classification
was recorded at approximately 17:26–17:35 UTC. Other tasks continued creating
worktrees, so the counts below are snapshots, not a frozen repository lease.
Post-snapshot publication: MBT-70 fender checkpoint
**1f412d2d28f3b55ac5cb0c64469a6907795a0d21** was verified at origin/main
at 17:34 UTC. This does not change the pinned comparison used for the counts.
Subsequent publication through **9dc23a5a173e3d45a488b4b6ec3317150f63bd4d**
also preserved the six-ID canvas/smoke integration, refreshed only those
assets, and published this inventory. **3398ecaa2** corrected direct MBT-70
test registration. These are published checkpoints, not missing local work.
The seven conventional Abrams X source/support/history and regenerated asset
sets are now also published at **92b328a83d4dca5cb9d155ca8ad69d37b5203bf4**,
under the owner's explicit as-is instruction. Types/public build, fourteen
native constructions, focused physical/default/simulation tests, the anatomy
refresh and the 100 selected asset hashes passed. The strict qualification
checks remain in progress and the known failures remain documented in
[the Abrams publication record](abrams-recovered-publication-20260909.md).

- Initial registry: 458 worktrees, 270 existing; 149 tank/fleet/gear/fidelity
  name matches. The subsequent all-existing status scan covered 271 paths,
  found 53 dirty worktrees, and had zero status errors.
- All 856 local branch heads, all eight stashes (including untracked third
  parents), and reflog-only candidates were considered. No-worktree means
  no registered worktree with that exact HEAD; it does not imply lost objects.
- Git ancestry was checked against the pinned commit. Git cherry classified
  whole-patch equivalence; stable patch IDs restricted to src/vehicles then
  distinguished source-equivalent commits whose generated assets differed.
  Current and historical Git blob IDs additionally authenticated dirty files.
- Authored-runtime refinement excludes selftests/test-support, generated
  anatomy/anchor files and the explicitly generated calibration tables.
  It does not equate a matching subject or branch name with equivalent code.
- Ignored QA was inspected only for identified candidate worktrees. No GPU,
  native capture, tests, anatomy, asset generation or full release was rerun.

Read alongside [the prior WIP inventory](fleet-wip-recovery-20260908.md),
[the published nine-tank boundary](nine-tank-bodywork-rollers-integration-20260909.md),
and [the seven-bodywork evidence](seven-tank-bodywork-integration-20260909.md).
The separately owned canvas/smoke recovery is documented in
[its recovery note](side-fender-recovery-20260909.md).

W below means /Users/kevinliu/.codex/worktrees/. Every W-relative directory
in the next table existed and was inspected. Unless noted, its tracked and
untracked Git status was clean.

## Current-task candidates: published versus preserved locally

| Work / location under W | Exact local checkpoint | Classification and remaining boundary |
|---|---|---|
| Seven conventional Abrams X | cot-abrams-seven-preservation-20260909, source 194afae70 + proof fd6557bd1; published through 92b328a83 | Recovered and pushed as-is with complete assets and preserved history. Not a completed source/visual/performance release. The two raw snapshot branches below remain local forensic archives. |
| Nine-tank bodywork + A7V/Revolution | cot-nine-tank-verified-integration-20260909, 6bba0ee6d2cba74942878e0e420c7bcc96db71c4 | Published history. The priority source/anatomy/assets patches at 79d887d19 / 748c38092 / ae57717a8 are git-cherry equivalent to origin. Old f4512b2f5 is an unpublished *hold note*, superseded by the completed release, not a missing runtime implementation. |
| Canvas and smoke, separately owned | cot-side-fender-preservation-20260909, 9c3bd346a; canvas 91987740f + cf80be36d, smoke 22409bce7, evidence 381a9fec8 | Published after the pinned scan, through 9dc23a5a1: T-90M X / Vladimir X canvas and A7V X / A6M X / A4M X / Revolution smoke. Three focused tests, types, scoped assets/geometry/muzzle checks PASS. Original smoke 0ef0abbb9 and integrated f6689bde are copies of this same work, not two missing fixes. |
| Leclerc X / Strv 122 X wheel tessellation | cot-source-wheel-detail-budget-20260909, 648518cf99fa6ad4d7e6207d9ee43a34177a6a06 + 5ca30a7fe4dfae7632e5d37e00a061086d76a25b | Local completed focused/native checkpoint; composed release pending. Integrated 875525048 + Strv history 2bffdc13a are the same feature lineage, not another optimization. |
| Five-model efficient rollers | cot-leopard-efficient-rollers-20260909, bfdc4f1d131d1ea6b4c75ee44db8658936c6042d + 0121238b29e9c3cb4e3fa930e9d2bf5c804da355 | Partially published: A7V/Revolution released separately. A4M X, A5 X and KF51 X remain local. Full-five measured-motion/source-contract/type proof passed; native/anatomy/composed qualification pending for the remaining three. Old 2748eca9c / 9c7ea6059 fittings are superseded, not preferred restore targets. |
| Merkava Mk3D/Mk4 X rollers | cot-merkava-return-rollers-20260909, eac96616a4c0241cbb3af3fa1e28037855f512c9; runtime repair a6a3c85708bbd7d0e660a2484fb706972c1813e9 | Local completed measured-fit/history/types checkpoint, not released. Preserve earlier failed e901/65f262bb3 evidence; variant-specific roller count remains inferred. GPU/source scoring and composed release pending. |
| Centurion III/V + Strv 81 dual rollers | cot-centurion-roller-fit-20260909, a65a7374f2ab18feb5db387caa0cc1ff550fe35e; primitive 1eddc34284411fc9a4234cb22a79237d399a8536 | Local completed native geometry proof, not released. Actual +0.30/−0.22 m clamps and finite guide/shaft checks documented; native visual/anatomy/source release remains open. |
| Challenger 3 / 3X hull-to-hub spindles | cot-challenger-roller-spindles-20260908, 7a7c9d49f1d2ddc1db42b47bbf7595b7e510fa2d + ec95e0daa777d20472dbd324899423343c0628d1 | Local completed shaft delta, release BLOCKED. Existing Challenger 3 centering fails identically without the change; 3X has no registered fidelity oracle. Not a qualified broad gear redesign. |
| K2 X / T14 X rollers and comparator | cot-k2-t14-roller-release-20260909, e81a12f16cee0c9a512cd34f7a9bc4ddbd63b8fe + 983e91a1eb74f5f5d76dee1dffa3c0cd98f6494d | Local geometry and isolated scoring-tool checkpoint, release BLOCKED. Corrected K2 source gate fails for both baseline and candidate; never waive 92. One dirty tools/procedural-fidelity.mjs cache/lifecycle edit belongs to parent; later lifecycle recovery is separately published. K2/T14 motion claims require the newer measured-clamp helper before full-stroke certification. |
| Original saved Leopard 2A7 rollers | cot-original-leo2a7-roller-release-20260909, 1d5580d7e0e7f9cf2ebeca918958f27ffd97f753; fit c5702ab2cc89f90d65bfeabfc5d375e9890acfeb | Local archived development-model checkpoint. Anatomy generation completed; subsequent check/icon phases were stopped. The ID is outside the 174 playable roster and has no fidelity oracle. Do not register it simply to publish this work. |
| T-80U X fitted primitive continuation | cot-t80u-x-outsole-pilot-20260908, 6e3bbb3d5ff649dfd8de9dc352e8d33abd21cdaf; WIP 744fab71e73b6d2d69f95342743cdc04827d3b0f | Local WIP, explicitly unactivated. Native guide/roller and far-pad/disc intersections remain; later neutral-floor and shaft passes do not fix those failures. Rejected terrain experiment also survives in stash 31a35235. |
| T-90A X neutral/original-gauge successor | cot-t90a-fitted-wheel-checkpoint-20260908, b6b05a8fe40a47bee4570720a6935711b8d3a2af; pilot eed11d3c4b3d9eed75def030d66ed23625010d68 | Local WIP, original-gauge successor unactivated. Receiver/native evidence exists; terrain/cadence/performance and owner-rejected bodywork remain open. Not a 59-tank rollout. |
| Efficient rotor / native seam / history leaves | 1f8764d92, 34e8bea98, 731bbf3cf, 43c3eac2a, 2ff768596 | Already published equivalents. Rotor blob dfa4c0a775c98c23ce7d61be56033ed31a725983 is identical at 1f8764d92 and pinned main. All four seam-branch deltas and the cited history patches are git-cherry equivalent. |

### Receipts that survived cancellation or a failed attempt

These paths are evidence locators, not additional runtime payloads. A passing
subtest is not upgraded to a completed release.

| Owning W directory | Existing evidence |
|---|---|
| cot-leopard-efficient-rollers-20260909 | .qa-dev/leopard-efficient-fit-all-ZIYUNO/receipt.json and leopard-efficient-siblings-5mwW11/receipt.json: PASS; 19 receipts include six preserved failures. |
| cot-merkava-return-rollers-20260909 | .qa-dev/merkava-measured-stroke-JiNd3Z/receipt.json: FAIL; ZRoRuW/receipt.json: repaired measured fit PASS; merkava-history-followup-bd9Lae/receipt.json: six focused checks + types PASS, frozen inputs. |
| cot-centurion-roller-fit-20260909 | .qa-dev/centurion-verified-centurion3.json, centurion-verified-centurion5.json, centurion-verified-strv81.json; old probes and historical goldens also remain. |
| cot-challenger-roller-spindles-20260908 | .qa-dev/spindle-focused-recovered-receipts.json, spindle-anatomy-receipts.json; the committed note retains the identical original-model portrait failure and withheld oracle. |
| cot-k2-t14-roller-release-20260909 | .qa-dev/k2-fidelity-diagnosis.json, k2-fidelity-current.json, reports/procedural-fidelity.json. Corrected minima: original 90.803595897 / fitted 90.813735740, both FAIL. |
| cot-original-leo2a7-roller-release-20260909 | .qa-dev/original-leo-native-r1/tank-assets.json; stopped post-anatomy check/icon sequence explicitly recorded in the committed note. |
| cot-t80u-x-outsole-pilot-20260908 | 46 receipt/report JSONs found, including 11 explicit FAIL and one ERROR. t80-contact-domain-yOPvX0 preserves rejected terrain; t80u-outsole-certificate-49nZCf is neutral-floor PASS only. |
| cot-t90a-fitted-wheel-checkpoint-20260908 | 39 receipt/report JSONs found. t90-original-gauge-native-pFvKxJ and receivers-lTCkmz retain the successor; receivers-KLE8Ug retains the rejected old tooth-count assertion. |

## Dirty and untracked authored work that still needs disposition

These files were hashed without staging or writing Git objects. Values below
are Git blob SHA-1s, computed from the complete current file bytes. They are
NOT acceptance hashes. An unmatched blob can be an obsolete combination of
published work; it is not proof that every line is missing on main.

The large second-wave dirty tree is mostly already accounted for: of its 355
changed vehicle/fidelity source paths, **313 equal current origin bytes and
41 equal historical origin blobs**. The remaining old core amalgam differs
(97 added / 156 removed lines versus pinned main), but a subsequent complete
hunk/API review against `1f412d2d2` identified no missing authored behavior.
Its inline ERA deduplication and unconditional receipts are predecessors of
the current helper/default-true paths. The remaining differences omit later
published floor certificates, efficient rollers, paint semantics, disposal and
build optimizations. This is an obsolete combination, not a missing whole-core
replacement; no new runtime tests were claimed by that read-only review.
Do not publish the 726-file dirty tree wholesale.

| Absolute worktree + relative file | Blob | Feature / classification |
|---|---|---|
| /Users/kevinliu/.codex/worktrees/cot-source-x-second-wave-20260906 / src/vehicles/tankFactoryCore.ts | 3185598d4d011fa2aebbb7f0f15462198d3e20f0 | Complete hunk/API review found obsolete combinations/current equivalents, not missing authored behavior. Original file remains untouched; do not import. |
| /Users/kevinliu/claude-of-tanks-bwp1 / src/vehicles/afvFamily.js | 107a877ae3c8598efa386c69bedf7cd95a303a3e | Old Upiór → BWP-1 naming precursor. Current main already has the BWP-1 ID/name in afvFamily.ts and tankLabels.ts; no blind restoration. |
| Same bwp1 tree / src/vehicles/profiles/afvFamily.js | 23d30c2382b833be22e2aac906d3d5d4cffd8f1e | BWP-1 turret number decal precursor. |
| Same bwp1 tree / src/vehicles/tankLabels.js | 4d48f7fb819ae9d6c8d29529579520d30edc5070 | BWP-1 label/aliases precursor. |
| Same bwp1 tree / src/vehicles/bwp1.selftest.mjs (untracked) | 06610e9da8a1635b329a206113391fbd4eb3c3ee | Untracked naming test; preserve, superseded-status review pending. |
| /Users/kevinliu/claude-of-tanks-reference-fleet-redesign / src/vehicles/profiledProcedurals.js | a280b22cd9cd4a828e7f04017768988c6bb7c2fe | Old sourceGroundup final-override registration, not current native X-family release. |
| Same reference-fleet-redesign tree / src/vehicles/tankFactory.js | f2eb17ec17f7a5d39072970dc45fcd049edafb5e | Source silhouette-dimension application. |
| Same tree / tools/procedural-fidelity.html | 7fc851ebb899236dda4ab51677df9fb636985239 | Old comparator integration WIP. |
| Same tree / tools/procedural-fidelity.mjs | 893d74b523570c40e8b7b51db035d9a5adc1bf09 | Old comparator driver WIP. |
| Same tree / src/vehicles/profiles/sourceEnvelopeSpecs.js (untracked) | 0a6abe3d949c8e1703a86a2ad20c93f7c80ebec9 | Applies authoring envelopes to visual dimensions. |
| Same tree / src/vehicles/profiles/sourceEnvelopes.js (untracked) | fcf5e49c2c550dd7e4f7a4e7c691c45232f624d8 | Generated authoring-envelope data, not an approved runtime source mesh. |
| Same tree / src/vehicles/profiles/sourceGroundup.js (untracked) | bfb4ba30e3d2a326c686db71ac33134d4e12a1f9 | 59,194-byte shared-grammar rebuild prototype; no completed qualification established by this audit. |
| Same tree / src/vehicles/profiles/sourceMeasurements.js (untracked) | 0679e2d0b92498f4c8b05ef6db9e27093313cf8f | 238,698-byte generated mask-derived authoring stations; preserve as authoring input, not accepted geometry. |
| /Users/kevinliu/claude-of-tanks-russia / src/vehicles/profiles/russia.js | b4777b0e46ee9be2b515bc511f1a389806c28c1a | T-44 hull-crown/recess and turret rebuild WIP; 485-line old diff, qualification unknown. |
| Same russia tree / tools/procedural-fidelity.html | b5e65e9ad6a369606eb2e8750bf6b624cc49ef37 | Associated historical comparator WIP. |
| /Users/kevinliu/claude-of-tanks-t90-vladimir-sm-repair / src/vehicles/profiles/t90.js | 279f205c5025a8a6b8b40a9f7a9bc97d01335f31 | Removes the legacy donor's stationary turret island and razor-thin hull patches; dirty 39-line edit, no completed proof established. |
| /Users/kevinliu/claude-of-tanks/.wt-recheck / src/vehicles/profiles/afvFamily.js | 5dcadf7adeb2e7a9a6502ca4a3a902f687528c68 | Old BMPT rack arms/Ataka separation, M3A3 and Upiór combination; pending authored-hunk disposition. |
| Same .wt-recheck tree / src/vehicles/tankFactory.js | dc0783b080779138b1a879dcfce19d806cb0d904 | Old factory integration continuation, not qualified against current main. |

Two further unmatched BWP generated-calibration files are preserved:
bwp1/src/vehicles/combatAnatomyCalibrations.js =
8ea9b110528eaa6feb2a22fd7e370d7c4cadd746 and
bwp1-final/src/vehicles/combatAnatomyCalibrations.js =
f7c1c0746d25334c07e2c5c3557f7186efdf12a1. Six other source paths in bwp1-final
already match historical origin blobs. The t90-family/t90.js.bak file also
matches historical origin exactly; it is not a newly missing model.

The shared checkout remains conflicted and dirty; four untracked source-geometry
.js.bak files (K1A1, Leopard 2A4, Leopard 2A7, Type 10) and its unresolved
.js-era core/track merges were not restored.
Those source extraction/backups are not silently imported into native runtime.

## Stashes

| Stable stash commit | Files | Classification |
|---|---:|---|
| 31a35235d8eef9524e7027b84be99350217f593e | 9 | Rejected T80 fitted-contact/cache experiment. Seven vehicle source files are not historical origin blobs. Explicit terrain failures preserved; do not activate. |
| 2df2f8719ab3318c605b37bdab188b1f26c57f7e | 7 | Earlier T80 primitive pilot, including untracked third-parent files. Local WIP/superseded by the later preserved pilot, not published. |
| eb3a6e78c0c0186dfcf7534896d61fba16746593 | 5 | Merkava shoulder checkpoint; all four vehicle source blobs already exist in origin history. |
| 94d93dfa0d72d8b3b171d4e835605fd45ad1bf9c | 31 | Engine/garage autostash, other-task scope. Its fidelity page matches published history; remaining lifecycle edits need their owner. |
| 061c4d935c35462e59194d231718c69b6191e72b | 902 | Fleet-camo snapshot dominated by generated assets. All five vehicle source blobs exactly match published history. |
| a36c67abc58ef082564c85e84b427a5eac5dd362 | 2 | Generated T90 bustle fidelity reports only. |
| b0a21b3c85846a89ae7fedc68c317ab1bbe66852 | 2 | Generated T90-only fidelity reports only. |
| 2b729480e3aefe83f122bc06545d32e92636c2fd | 14 | Old camor6 WIP. One vehicle blob published; modern3.js remains unmatched at e7131dc7572cc2a44b3f0841aa49403db7ab4689. Engine/main changes are outside this tank-only disposition. |

## Historical refs and reflog-only objects

Of 66 nonancestor branch heads without a matching registered worktree,
33 were whole-patch equivalent to origin. Of the remaining 33, eighteen
had exactly matching vehicle-source patch IDs, two had no vehicle-source
delta (cinematics and road recovery), and thirteen remain mixed/unmatched
source combinations. Examples proving why branch names alone mislead:

| Old local ref / commit | Published source-equivalent commit |
|---|---|
| abrams-gun-towers, db65985ef | f82736bb731d1aa3d14e010a3f1c4f621723b3f9 |
| abrams-roadwheel-spacing, 364feb8a3 | b794ed36336437703a3e2a2af21f370fce821c89 |
| amx30-mantlets, 7a91bff20 | 38c9915366d95c9084db1f89d6dc214baae6d076 |
| chieftain-fidelity-r1, eb5764694 | 35dfb066fe636f5267424468f7812fd66d92f34b |
| merkava-gun-lines, b39ecd3b3 | 031a275f9ac60d444d8f8e965eaa796043901134 |
| t90a-vladimir-proportions, cc42c787b | c4e4bfd6a84a515266e7eb2479ebf82d65e296cd |

Missing on-disk worktrees are not lost commits: PL-01 housing 63faeb038 is
whole-patch equivalent; Chieftain fidelity-r2 e0dfeb3e8 is retained by its
branch and has a published successor cc2da7b2f. Its full artifact/source
combination was not certified equivalent here.

The thirteen unresolved no-worktree heads remain preservation/review buckets,
not a restore queue: autoloader-final 0331b3d18574; challenger2-family
05e83db2b110; fleet-balance 9b76418a6c42; k2-roadwheel-track-seat 3be351db25d1;
kf51b-turret-center d3cc1c2e1532; leo2a6m-ua-era 191985d0dd28;
mbt70-german-tier10 b58ae45bdef9; mbt70-return-rollers 3a120e5a9437;
strv81-overlap 209b37fafb1e; t62-obj1975-scale-tracks f616f2c02bcb;
tank-seating-integrate 44a4900ef454; type10-mantlet-fit e292b73c7c6c;
kevin/autoloader-fleet 53ab9fc47590. MBT/Abrams interpretation belongs to
their current owners; generated artifacts must not obscure that boundary.

Reflog scan found 1,159 commits outside current refs, of which 775 were
tank-related by changed vehicle paths or subject. The first full-source
classification was 538 published equivalents, nine local equivalents,
111 no-source-delta records and 117 unmatched combinations. Refining to
authored runtime gave **540 published equivalents, eight local equivalents,
178 no-authored-delta or merge/stash records, and 49 unmatched combinations**.
These are commit combinations, not 49 missing features.

At **2026-09-09T17:35:25.089Z**, exactly these 49 unresolved authored commit
objects were protected in an atomic, create-only Git-ref transaction under
**refs/recovery/tank-audit-20260909/<full-commit-SHA>**. All 49 refs were counted
and independently resolved to their expected commit objects. Existing refs
were not overwritten; no checkout, index or remote changed. They are no
longer dependent solely on reflog retention, but their qualification remains
unchanged. This protection did not expand the audit scope.

There was **no 2026-09-09 orphan authored-runtime delta beyond the known
MBT/bodywork/release lineage**. The eight residual September combinations are:

| Commit | Disposition |
|---|---|
| e027259abd9ac664e68ccfbc90880db46e3f21eb | T80 untracked stash parent; covered by stash 2df2f871. |
| 45e5e0c9e76df2d942cead6663673f89cbe33a4c | Merkava shoulder untracked stash parent; complete relevant source blobs already published. |
| 5f1860d92433e339d9cd458c766792c009d86aad | ERA construction-reuse draft. Its actual helper blob a3698aec4aa9e4a052418d47ce037e31250eb63e equals current origin; complete two-file patch differs. Published successor e8ef757e2; core-call difference remains a narrow review bucket. |
| ca66acc7b6e500ff76a44c491ddcc7ccfa34c568 | Earlier 23-source-X integration draft; published successor 099edfa49, mixed full authored patch not certified identical. |
| 7676558b1d9589668684067122d7e69579a0233e | Earlier unused-Jaguar removal; published successor dd4d1c8d4, exact variant disposition pending. |
| 7646565332347e528e2947d1a98578d71fa10b92, 8943739386e0ec8db8d04b5b04a650a23b2f3903, 44478e43f75434b4c25049433d7b0d7c36803dc1 | Broad lifecycle/typing predecessors of published c37765503. Other-task mixed combinations, not newly discovered tank implementations. |

<details>
<summary>41 remaining August authored-patch combinations, grouped for future owner review</summary>

These older variant/type-integration combinations are preserved in reflogs.
They have not been established as absent from current runtime, and must not
be restored merely because their complete patch differs.

| Historical subject | Commit locators |
|---|---|
| fix(vehicles): clear fleet construction gates | 11228773926e, bd3482c67061, 73b8cd09ae65, b35c215a3361, 1d8b8367343f, 6b2e83273efb |
| fix(combat): align fleet hitboxes and reactive armor | 7623c13c3466 |
| feat(leopard): refine A5 and A6 protection packages | 706aa8b23783 |
| fix(leopard): complete lower chevron cheeks | 1788ddddcedc |
| fix(abrams): swap SEPv3 and TUSK roof stations | beaa3d739b99 |
| refactor(vehicles): type procedural tank factory | a832a34a18e2, 1d78ab978def |
| fix(leopard): rebuild compound turret chevrons | 49d401f20eb2 |
| refactor(vehicles): type modern fleet pack two | 079a85283ea7 |
| fix(t14): rebuild roof weapons and optics | 28149f3f590b, 876be2c73eeb |
| refactor(vehicles): type T-72 profile geometry | 793ac8f543e4, 92ca2290810e |
| fix(vehicles): scale and position roof towers | b9d61edd9686 |
| refactor(vehicles): type fleet spec registry | dfa588089f3c |
| feat(sheridan): armor M551A1 TTS refit | 157eb15a5c59 |
| feat(abrams): add next-generation M1A3 | d3463747f34c |
| fix(challenger2): seat cheek ERA and smoke banks | 4fa0c4bd0948 |
| feat(challenger): add Challenger 3 X and roof gun tower | d778d2f88976 |
| feat(vehicles): add M551A1 TTS and refine mantlets | ca47eee7a2e3 |
| feat(vehicles): add M551 Sheridan missile tank | c2c577019e7f |
| fix(vehicles): seat eastern ERA and equip T-80U | 1b7d61e6ba5e |
| fix(vehicles): align crew and module anatomy | e36807d689e5 |
| fix(leopard): compact A6M RCWS and close glacis | bf8d09d12096, a12fab15ca37, 932c21a0bb65 |
| feat(vehicles): reshape Japanese cast turrets | 6de7aca06475 |
| fix(vehicles): seat mudguards and separate T-72BU gear | fd6459e77748, cc81f4811bd0, c9a12ad263ed |
| feat(combat): add magazine autoloaders and PL-01 105 | b753facdfd93 |
| feat(ifv): differentiate weapons and recoil | b22aa13c7a9c |
| feat(vehicles): articulate sparse modern turrets | 292725a77627 |
| feat(vehicles): deepen source-oracle turret fidelity | c9aaa6eee8c1 |
| feat(vehicles): share exact Burlak foundation with T-90 | 09bf8bad0086 |
| Preserve Challenger 2 geometry follow-up | e641e233d444 |

</details>

## Separate ownership and exclusions

Seven-Abrams-X recovery is owned separately. The original dirty trees are
cot-abrams-source-x-20260907 (222 status paths) and
cot-abrams-source-x-integrated-20260907 (628 at this scan); their contents
must be reconciled with the owner's source-byte manifest before any import.
The parent has now preserved both raw selections under local refs:

| Archive ref | Commit / preserved selection |
|---|---|
| codex/recovery-abrams-original-raw-20260909 | e9e564c516ba0e6a6a68271d5f9c55d74dca70ba, source base 519de9de5; 154 selected files, 153 changed Git paths, including 70 rendered images (63 views + seven thumbnails). |
| codex/recovery-abrams-integrated-raw-20260909 | 5f5c9eba5f3981af5707b4211ad62451f964cd41, source base 12a5b9aec; 106 selected files, 103 changed Git paths, zero images. |

Both exact refs and changed-path counts were independently resolved. Selection
counts come from the owner's preservation record; unchanged selected files
explain why they need not equal Git diff counts. Original worktrees and indexes
were left untouched. Raw models and QA were excluded. The old full asset
manifest is **archival only**. These refs are protected local storage, **not
runtime-qualified or published Abrams**. Their trees provide the exact file
and byte locators for the subsequent owner manifest/integration. The existing
WIP inventory above retains the earlier frozen 3,260-input manifest and original
failed seams/centering evidence.

MBT-70 fender recovery, side/fender/canvas/smoke integration, and active
interactive-performance/world/road work are separately owned. Their
concurrent changes were not overwritten or treated as abandoned work.

Ignored private source GLBs, source authoring JSON, screenshots, partial
anatomy/marking outputs, all-fleet manifests and large task JSONL archives
are evidence/input, not approved runtime payload. This audit did not
exhaustively inspect deleted filesystem contents, expired reflogs, raw
unreferenced objects outside reflogs, or unregistered external directories.
It did not run git fsck, prune or any cleanup.

The scanned work is now located and classified at the stated scope. The
explicit residual buckets remain pending owner interpretation; **this report
does not claim all historical WIP is qualified, all old patches are absent,
or all recovered work should be pushed.**
