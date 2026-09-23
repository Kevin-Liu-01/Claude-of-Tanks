# Merkava Mk.4 Trophy (`merkava4_trophy`) — run packet

## 2026-09-20 marked attachment repairs

The two aft radar pedestals now connect to the turret through narrow transverse
mounting arms. The roof MAG foot is seated and its barrel is connected to the
receiver. Current physical, visual and release verification:
[repair record](../../history/research/merkava-camo-repairs-20260920.md).
This is scoped attachment work, not a new whole-model fidelity certification.

## Current integrated status — 2026-09-19

Integration `575614227` passes the unchanged registered geometry floor at an
unrounded minimum of 92.52297815721163, dimensions 100 and floaters 100.
The fresh combined physical standard also passes: no front/rear/sweep band or
shoe collisions, no unexpected openings, and the source equipment count is
retained. The repaired narrow lower hull, folded returns and seated lamps
replace the earlier wheel-bay interference. The primary-body fill is generated
from the actual hull/turret boundary; separate exterior fittings remain in all
physical and source checks.

Full fleet generation passed at `87e8e9526`, including the regenerated assets.
The subsequent independent fourteen-view review is **HOLD**: the rear door,
side housings and lamps read as a broad slab, and a solid support buries the
authored smoke tubes. Its lowest score is 8.3, below the existing 9/10 bar.
See [the actual visual review](../../history/research/israeli-final-r2-independent-visual-review-20260919.md).
These component repairs, fresh paired Garage views and complete release
verification remain required before publication. Numerical passes above do
not certify the missing visual relationships.
The current private receipt is
`qualification-r3/physical-integrated-preflight-r1/receipt.json` under
`.qa-dev/tank-run/final-corrections/`. The failed `5d36e7cf9` run remains in
`qualification-r3/cap-integrated-preflight/`; it is not converted into a pass.
Earlier rounded scores and local checkpoints below are historical.

## Earlier implementation checkpoint

- Updated: 2026-09-18.
- Owner request / latest superseding instruction: build a distinct
  Trophy-equipped Mk.4 from the supplied semantically organized GLB.
- ID and display name: `merkava4_trophy` — Merkava Mk.4 Trophy.
- Implementation status: **COMPLETE IN WORKTREE** — exact procedural profile,
  combat record, lazy/eager registration, Tier-X catalog position, solid
  Sinai-gray finish, anatomy metadata and focused self-tests are present.
- Qualification status: **IN PROGRESS** — focused geometry/spec/history checks
  pass. Fresh integrated geometry, winding, Gallery, independent visual review,
  generated-artifact and composed-release receipts remain.
- Publication status / exact authority: owner explicitly authorized ordinary
  commits and pushes to `origin/main`; publication is held until the complete
  release tail is green and the parallel fleet round lands first.
- Worktree / branch / baseline commit: detached worktree;
  `12b5dc936b7cfcb78c79fd1f54c3b33c6c971a61`.
- Candidate commit plus dirty-diff or geometry fingerprint: current worktree;
  the latest nine-view evaluator records 93.38 aggregate and 92.10 minimum.
  The committed geometry receipt predates the final body fit and is not cited
  as current qualification evidence.
- Current next action: finish queued winding, Gallery, generated-artifact and
  composed-release checks, then integrate the latest `origin/main`.
- Blocking choices / known failures: none. “Trophy” remains the explicit game
  disambiguator rather than a claimed formal IDF designation.

## Scope and preservation

- Mode: independent real-configuration build, not a Barak alias and not a
  replacement for `merkava4`, `merkava4b`, or `merkava4_x`.
- Owned files and integrator: `src/vehicles/merkavaModernSpecs.ts`, the exact
  profile in `src/vehicles/profiles/merkavaX.ts`, fleet registries, focused
  self-tests, generated receipts/assets and this packet.
- Protected original IDs / high and low fingerprints: existing Merkava IDs
  remain separate registrations; the Mk.3D repair is isolated in commit
  `12b5dc936` and its registered 93.3 geometry receipt remains valid.
- Protected asset, anatomy and marking-seat records: existing records are
  preserved; targeted regeneration is deferred to the final integrated tree.
- Explicitly excluded work: source redistribution, source-derived runtime
  geometry or textures, and Barak-only sensor/crown features.
- Variant matrix: baseline Trophy-equipped Mk.4; Barak remains a separately
  evidenced variant with its own source and packet.

## Source and comparison contract

- Actual raw path: `/Users/kevinliu/Downloads/Claude of Tanks Models/merkava_mark_iv.glb`.
- Raw SHA-256 / format / size:
  `645a9df8bb4dc6a31b94be61b4d2f04a72c0cc9f5c2852e607a878e5f3adc25a` /
  GLB / 6,459,324 bytes.
- Supplied source metadata: title “Merkava Mark IV,” author 42manako,
  CC-BY-NC-4.0,
  [Sketchfab source page](https://sketchfab.com/3d-models/merkava-mark-iv-550de2a91e3f4017aeaae3b695db0aab).
- Source credits, provenance evidence, reference-only authorization: preserve
  the author/page/license metadata, but use the file only as a private
  comparison input. No source geometry or textures ship.
- Supplied inventory, not a new inspection claim: 323 nodes, 160 meshes,
  27,883 triangles; semantic Trophy-equipped hierarchy; reported bounds size
  8.7414 × 4.5913 × 4.2867.
- Source limitations: semantic names do not by themselves prove physical
  ownership, real configuration, date, complete geometry, or correct pose.
  Units, axes, duplicates, degenerates, animation state, track duplication,
  texture completeness and orphan pieces remain unknown.
- Approved target: a real Trophy-equipped Merkava Mk.4 distinct from Barak.
  IMOD states Trophy has been operational in the IDF since 2011 and is fitted
  to newly produced Merkava Mark IV tanks:
  [official IMOD source](https://www.mod.gov.il/en/press-releases/press-room/historic-ceremony-in-germany-marks-the-launch-of-the-first-leopard-tank-equipped-with-israeli-trophy-active-protection-system).
- Naming decision: “Merkava Mk.4 Trophy” is a clear game/catalog label, not a
  claim that it is the formal IDF model designation. A dated visual fit must
  still be chosen.
- Authored interpretation, 2026-09-18: exact ID, Tier X, solid Sinai-gray
  palette and the protected-MBT balance envelope. These implement the owner's
  fleet addition and rebalance request; the exact values were not supplied
  by the owner.
- Conversion: `tools/source-x-oracle.mjs --prepare` on the raw hash-pinned GLB;
  the bake preserves every source mesh and strips only materials/non-position
  attributes for a private, geometry-only comparison oracle.
- Canonical oracle: ignored
  `public/models/community-candidates/merkava4_trophy_x_source.glb`, SHA-256
  `a155cb6fb3ed46ef77e01f11fbd1d6cc8f5b8e747d09494f98f93579e396f684`.
- Registration: proper handedness-preserving axes `[-z,+y,+x]`, uniform scale
  `1.015337`, translation `[-0.0003,-0.006904,+0.6423]` metres; ground is zero
  and the measured source hull longitudinal midpoint is centered.
- Candidate datums are hull `[0,0,0]`, turret `[0,1.605,-0.3906]`, gun
  `[0,1.9934619,1.93]`; the fused oracle intentionally publishes no fabricated
  moving owners.
- Selected components and independent ownership proof: semantic hierarchy is
  a useful intake lead only; independent node/geometry ownership **NOT RUN**.
- Rejected/omitted source components and exact reason: none.
- Registration entry: `tools/west-x-reference-overrides.ts` plus the canonical
  hash/pivot certificate in `tools/source-world-registration.mjs`; fused whole
  views and honest track masks only.
- Quality bar: `fleet`, requiring 92 aggregate and every valid registered whole
  view/track component; the independent native critic remains separately required.
- Hash-pinned source measurements: 7.600000 m primary hull skin and full
  8.875467 × 4.352445 × 4.661717 m physical equipment envelope. The fixed
  source-only ruler reads 8.087770 m substantial-body length, 4.343432 m width
  and 4.184297 m p95 height. Gameplay height is the independently measured
  2.578753 m broad armored roof, never the aerial tips. Earlier candidate-fit
  7.69/8.79/4.39 m rows are retired.
- Unresolved target/gate conflicts: none. The authored fit is intentionally an
  older, busier Trophy-equipped Mk.4 and does not borrow Barak-only equipment.

## Construction work order

- Gross-form sentence and before/target datums: front-engine Mk.4 hull, broad
  low wedge turret, deep side protection, rear bustle furniture and an
  explicitly seated four-face/two-launcher Trophy fit; turret and gun datums
  remain `[0,1.605,-0.3906]` and `[0,1.9934619,1.93]`.
- Hull, turret, gun, running gear and track stations: measured procedural
  stations are implemented in the shared Mk.4 family builder with a dedicated
  Trophy roof/APS/closure branch.
- Actual bilateral return rollers; original-fleet track-thickness control:
  native animated gear uses the fixed Mk.4 axle stations, four return rollers
  per side and 0.064 m track stock; exact clip/sweep is 0/0 + 0/0.
- Shared/new primitives and high/low strategy: use first-party procedural,
  quality-aware Merkava vocabulary after measurement; never load, copy or
  remesh the source.
- Baseline geometry/build/memory cost and frozen budgets: high/low geometry
  census and actual switching probes remain in the final qualification tail.
- Material roles: solid Sinai gray using `#6f7566` and lighter role `#7b8172`
  for painted stock; distinct Trophy mechanisms, lenses, rubber, track metal,
  weapon metal, cloth and stowage roles.
- Intentional negative spaces, APS/permanent armor separation and equipment
  seats are authored as distinct primitives. Turret-parent audit reports zero
  stranded, abutting or dangling parts; Trophy equipment is not classified as
  removable ERA.
- Naming/tier/nation/lazy factory integration: Israel, Tier X,
  `merkava4_trophy`, exact `merkavaX` lazy family and matching eager profile;
  targeted asset generation remains in the final integrated tree.
- Gameplay balance intent: 2,800–2,900 HP; 1,500 hp / 65 t; 64/25 km/h;
  approximately 40°/s traverse; 6.0 s reload; 0.26 accuracy; 1.45–1.55 s aim.
  The authored M338 gameplay penetration triplet is 900/820/740 in
  the repository's near/mid/far or equivalent penetration ordering. These are
  game targets, not real performance, armor or ammunition claims.

## Earlier side-worktree evidence matrix

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | Raw `645a9df8…dc25a`; oracle `a155cb6f…f684` | `node tools/source-world-registration.selftest.mjs` | Proper `[-z,+y,+x]`, scale `1.015337`; fused ownership only. |
| Every registered silhouette / raw aggregate | PENDING REGEN | Current worktree | Root-owned integrated `tank-standard-check --gate` | Nine-view evaluator 93.38 aggregate / 92.10 minimum; broader receipt awaits regeneration. |
| Geometry components / dimension score / 3% check | PASS LOCALLY; INTEGRATED REGEN QUEUED | Current worktree | `node tools/geometry-gate.mjs --ids=merkava4_trophy,merkava4_barak,namer_ifv --check` | Source-only fixed ruler: 92.0 whole, 100 dimensions, 100 floaters. |
| Independent 14-view critic / actual Gallery | NOT RUN ON FINAL | Current worktree | Final canonical-14 and live Gallery review | Nine-view evaluator results are not represented as an independent 14-view critic. |
| Winding, closure and intentional negative space | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated winding and continuity capture | Earlier 0-deficit result predates final end-equipment/aerial closure. |
| Physical seats and yaw/pitch/recoil ownership | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated turret-parent audit | Earlier stranded/abutting/dangling result was 0/0/0. |
| High/low gear motion / strict band+shoe / duplicates | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated tank-standard gate | Earlier exact clip/sweep result was 0/0 + 0/0. |
| Actual return rollers / track thickness / chassis-side closure | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Focused geometry self-test + integrated standard | Four rollers/side and 0.064 m stock are unchanged; final closure receipt pending. |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | PASS | Current worktree | Code/self-test review | Native shared gear and procedural primitives; distinct APS, glass, rubber, track and weapon roles. |
| Live/spent/reset ERA / permanent backing | PASS N/A | Current worktree | Code review | Trophy equipment is not registered as removable ERA. |
| Main/aux armor finite rays / modules / crew | PASS | Current worktree | Focused spec/layout self-test | Existing Merkava layout and armor contracts preserved. |
| Markings, colors, bores, actual roof weapon | PARTIAL PASS | Current worktree | Focused spec/geometry self-tests | Solid Sinai gray and roof MG present; final bore/assets checks pending release tail. |
| Original-model/record preservation | PASS | `12b5dc936` + current worktree | Focused ID/dispatch/tier tests | Existing IDs remain separate; Mk.3D registered receipt stays 93.3. |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | | Source exclusion is policy, not yet a build result. |
| Composed release / complete tests / typecheck | NOT RUN | | | |
| Public and private builds / attribution | NOT RUN | | | |

## Round log

- 2026-09-18 intake: recorded the owner-supplied source inventory, provenance,
  official Trophy boundary, target gameplay and unknowns. No source
  registration, candidate authoring or qualification ran.
- 2026-09-18 implementation: registered the private hash-pinned oracle and
  authored a source-measured first-party procedural Trophy variant. Latest
  nine-view evaluator result is 93.38 aggregate / 92.10 minimum. Independent
  canonical-14 and actual Gallery review remain final integrated steps.
- 2026-09-19 final source repair: a frozen weakest-view probe traced the
  sub-threshold left silhouette to the generic forward glacis receiver and
  omitted paired Trophy launcher shields—not to the already source-correct
  aerials. The Trophy-only cap now follows measured world heights 1.396783 m
  at z 2.637701, 1.362322 m at z 2.75 and 1.178201 m at z 3.35; paired
  launcher stock spans x ±1.304..1.483, y 2.341..2.801 and
  z -1.936..-1.436, but a bounding-box reconstruction failed the front-left
  view and was discarded pending real topology evidence. The exact targeted fill command is
  `node tools/gen-interior-fills.mjs --ids=merkava4_trophy --min-fine=0`:
  713 boxes / 8,556 triangles, 6,592 L filled and 0 L residual. The supported
  fine pass is scoped to this source-exact repair; generator defaults and all
  other vehicle records remain unchanged. The unchanged exact gate then passed
  at raw 92.07526392588484, with dimensions and floaters both 100.

## Publication receipt (only if requested)

- Owner authorized normal commits and pushes after complete verification. Raw
  and canonical comparison GLBs remain ignored/private and are never published.
