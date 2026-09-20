# Merkava Mk.4 Barak (`merkava4_barak`) — run packet

## 2026-09-20 owner-selected closed rear door

The current target closes only the recessed central entrance with a finite,
hinged door. The original source remains open and unchanged; the surrounding
basket, stowage and passenger bay stay intact. This supersedes the old open-door
presentation, not the source-stock preservation rules. Current verification
and release status: [repair record](../../research/merkava-camo-repairs-20260920.md).
Earlier whole-model assessments below remain historical evidence.

## Current integrated status — 2026-09-19

Integration `575614227` passes the unchanged source geometry floor with an
unrounded minimum of 92.37309929016543, dimensions 96.30893042575286 and
floaters 100. The source-shaped bow straps, folded rear guards and finite wheel/track stock
pass the fresh combined physical standard. All 79 raw opening cells are
measured source/native air, protected by 14 stock/air controls; no unexpected
openings remain. The source itself overlaps its lower rear rails with its
track by 31–34 mm. A documented hidden receiving relief clears the real moving
stock while retaining the upper returns and visible rear form. The 264-phase
fixture includes a failing control with the original overlapping tip restored.
See [the source study](../../research/barak-bow-opening-source-study-20260919.md).

Full fleet generation passed at `87e8e9526`, including the regenerated assets.
The subsequent independent fourteen-view review is **HOLD**: a closed rear
mission volume obscures the source basket, chains and stowage; rear hull and
roof equipment relationships also need correction. Its lowest score is 8.0,
below the existing 9/10 bar. See [the actual visual review](../../research/israeli-final-r2-independent-visual-review-20260919.md).
The measured running-gear repairs above remain valid at that checkpoint.
Fresh component geometry, paired Garage views and complete release
verification remain required before publication.
The private integrated receipt is
`.qa-dev/tank-run/final-corrections/qualification-r3/physical-integrated-preflight-r1/receipt.json`.
Earlier values and pending checks below belong to the historical implementation.

## Earlier implementation checkpoint

- Updated: 2026-09-18.
- Owner request / latest superseding instruction: add an independent Barak
  study from the supplied GLB; retain a solid Sinai-gray finish and the
  authored Tier-X gameplay envelope.
- ID and display name: `merkava4_barak` — Merkava Mk.4 Barak.
- Implementation status: **COMPLETE IN WORKTREE** — independent procedural
  crown, armor, sensors, rear stowage and cable/antenna treatment plus exact
  combat/catalog integration are present.
- Qualification status: **IN PROGRESS** — focused geometry/spec/history checks
  pass. Fresh integrated geometry, winding, Gallery, independent visual review,
  generated-artifact and composed-release receipts remain.
- Publication status / exact authority: owner authorized ordinary commits and
  pushes to `origin/main`; publication waits for a green release tail and the
  parallel fleet round.
- Worktree / branch / baseline commit: detached worktree;
  `12b5dc936b7cfcb78c79fd1f54c3b33c6c971a61`.
- Candidate commit plus dirty-diff or geometry fingerprint: current worktree;
  the latest nine-view evaluator records 93.78 aggregate and 92.04 minimum.
  The committed geometry receipt predates the final mission module and roof
  weapon seat and is not cited as current qualification evidence.
- Current next action: finish queued winding, Gallery, generated-artifact and
  composed-release checks, then integrate latest `origin/main`.
- Blocking choices / known failures: none. The source remains whole-shape-only
  and private because its flattened ownership and provenance cannot authorize
  component reuse or redistribution.

## Scope and preservation

- Mode: independent real-configuration build; not a derivative or replacement
  of `merkava4`, `merkava4b`, or `merkava4_x`.
- Owned files and integrator: `src/vehicles/merkavaModernSpecs.ts`, the exact
  Barak profile branch in `src/vehicles/profiles/merkavaX.ts`, fleet registries,
  focused tests, generated receipts/assets and this packet.
- Protected original IDs / high and low fingerprints: all original Merkava
  IDs remain independent registrations and are covered by focused dispatch,
  tier and family-order assertions.
- Protected asset, anatomy and marking-seat records: existing records are
  preserved; targeted regeneration waits for the final integrated tree.
- Explicitly excluded work: source redistribution, source-derived runtime
  geometry, texture reuse and mutation of an existing Merkava into Barak.
- Variant matrix: Barak is a distinct modern configuration. No visual or
  semantic evidence from the Trophy packet automatically certifies it.

## Source and comparison contract

- Actual raw path: `/Users/kevinliu/Downloads/Claude of Tanks Models/merkava_mk.4m_barak_armored_warfare.glb`.
- Raw SHA-256 / format / size:
  `81cc2cf027af4475c5890089067dd9b1f77d9fbd306939e24f973ad68e099aa5` /
  GLB / 19,413,236 bytes.
- Supplied source metadata: embedded title “Merkava Mk.4M Barak (Armored
  Warfare),” author KojfDiscord, CC-BY-4.0 string,
  [Sketchfab source page](https://sketchfab.com/3d-models/merkava-mk4m-barak-armored-warfare-07e3570bdfaa451d8fb16bdd2e7d88fe).
- Source credits, provenance evidence, reference-only authorization: preserve
  the author/page attribution in this packet. “Armored Warfare” creates a
  possible commercial-game/extracted-asset conflict, so the file is a private
  comparison input regardless of the reported license string. No source
  geometry or textures ship.
- Supplied inventory, not a new inspection claim: 36 nodes, 34 meshes, 108,945
  triangles; flattened without semantic component ownership; reported bounds
  size 3.7578 × 6.9035 × 8.9200.
- Source limitations: hull, turret, gun, equipment, Trophy and track ownership
  cannot be inferred from the flattened hierarchy. Units, axes, pose, duplicate
  shells, texture completeness, game extraction, degenerates and orphan pieces
  are otherwise unknown.
- Approved target: the real Merkava Mk.4 Barak configuration, with the supplied
  GLB used only as a whole-shape/detail witness. The IDF identifies Barak's
  defining systems as AI, updated sensors, VR, a smart mission computer, and
  Iron View: [official IDF configuration source](https://www.idf.il/en/mini-sites/technology-and-innovation/meet-the-merkava-mk-4-barak/).
- Naming decision: display “Merkava Mk.4 Barak.” The source's “Mk.4M Barak” is
  retained as source metadata, not silently promoted to the canonical name.
- Authored interpretation, 2026-09-18: exact ID, Tier X, solid Sinai-gray
  palette and Trophy-baseline gameplay with improved handling. These implement
  the owner's fleet addition and rebalance request; they are not exact values
  supplied by the owner.
- Conversion: `tools/source-x-oracle.mjs --prepare` on the raw hash-pinned GLB;
  the bake preserves source world triangles and creates a private geometry-only
  comparison oracle.
- Canonical oracle: ignored
  `public/models/community-candidates/merkava4_barak_x_source.glb`, SHA-256
  `0549b50430cd8df0ebf9d095b617e64e8c6274747bea1dd99e4dec0e987b8f4d`.
- Registration: proper axes `[+x,+y,+z]`, uniform scale `0.989867`, translation
  `[-0.0005,+0.000594,+0.2097]` metres; ground is zero and the major hull shell
  longitudinal midpoint is centered.
- Candidate datums are hull `[0,0,0]`, turret `[0,1.605,-0.3906]`, gun
  `[0,1.9934619,1.93]`; flattened material groups make the oracle fused.
- Selected components and independent ownership proof: unavailable from the
  supplied flattened inventory; whole-source-only unless later proved.
- Rejected/omitted source component: `Object_13`, the only detached artifact,
  spanning source `y=-1.1811..0.0042` below the vehicle centre. All 33 physically
  assembled exterior material groups remain.
- Registration entry: `tools/west-x-reference-overrides.ts` plus the canonical
  hash/pivot certificate in `tools/source-world-registration.mjs`; no invented
  component masks.
- Quality bar: `fleet`, requiring 92 aggregate and every valid registered whole
  view/track component; the independent native critic remains separately required.
- Hash-pinned source measurements: 7.600001 m primary hull skin and full
  8.829653 × 3.719722 × 5.665006 m physical equipment envelope. The fixed
  source-only ruler reads 8.046022 m substantial-body length, 3.706385 m width
  and 2.989321 m p95 height. Gameplay height is the independently measured
  2.600361 m broad armored roof, never the tall aerial. Earlier candidate-fit
  7.92/8.86/2.94 m rows are retired.
- Unresolved target/gate conflicts: none. The flattened source stays a fused
  whole-shape witness and does not establish moving ownership.

## Construction work order

- Gross-form sentence and before/target datums: preserve the front-engine Mk.4
  chassis while giving Barak a lower, cleaner crown, transverse sensor head,
  segmented cheeks, inboard APS and lighter open rear carrier. Turret and gun
  datums remain `[0,1.605,-0.3906]` and `[0,1.9934619,1.93]`.
- Hull belly/deck, low glacis, shoulder and side-protection stations are
  implemented in the exact Barak branch.
- Turret roof/brow/cheeks/bustle and gun seat are complete, including four
  Iron-Vision-style camera clusters, panoramic head and physical antenna seats.
- Running-gear centers/radii/tangents retain native Mk.4 axle datums.
- Actual bilateral return rollers; original-fleet track-thickness control:
  four rollers per side, 0.064 m track stock and exact clip/sweep 0/0 + 0/0.
- Shared/new primitives and high/low strategy: use quality-aware procedural
  Merkava-family vocabulary only after measurements; do not copy the GLB or
  duplicate a complete existing tank.
- Baseline geometry/build/memory cost and frozen budgets: high/low census and
  browser switching probes remain in the final qualification tail.
- Material roles: solid Sinai gray using `#6f7566` and lighter role `#7b8172`
  on painted bodywork; distinct cloth, bag, glass, rubber, track and weapon
  metal roles.
- Intentional negative spaces, permanent armor/APS separation and equipment
  seats are explicit; turret-parent audit reports zero stranded, abutting or
  dangling parts.
- Naming/tier/nation/lazy factory integration: Israel, Tier X,
  `merkava4_barak`, exact `merkavaX` lazy family and matching eager profile;
  assets remain in the final integrated generation pass.
- Gameplay balance intent: 2,800–2,900 HP; same 1,500 hp / 65 t, 64/25 km/h,
  reload, shell-balance and passive-armor intent as `merkava4_trophy`; 0.24–0.25
  accuracy, 1.3–1.4 s aim and 10–15% lower movement/turret dispersion. These are
  game values, not real performance claims. The owner-provided M338 gameplay
  penetration triplet is 900/820/740 in the repository's near/mid/far or
  equivalent penetration ordering; it is not a real ammunition claim.

## Evidence matrix

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | Raw `81cc2cf…99aa5`; oracle `0549b504…8f4d` | `node tools/source-world-registration.selftest.mjs` | Proper `[+x,+y,+z]`, scale `0.989867`; detached `Object_13` excluded; fused ownership only. |
| Every registered silhouette / raw aggregate | PENDING REGEN | Current worktree | Root-owned integrated `tank-standard-check --gate` | Nine-view evaluator 93.78 aggregate / 92.04 minimum; broader receipt awaits regeneration. |
| Geometry components / dimension score / 3% check | PASS LOCALLY; INTEGRATED REGEN QUEUED | Current worktree | `node tools/geometry-gate.mjs --ids=merkava4_trophy,merkava4_barak,namer_ifv --check` | Source-only fixed ruler: 92.3 whole, 98 dimensions, 100 floaters. |
| Independent 14-view critic / actual Gallery | NOT RUN ON FINAL | Current worktree | Final canonical-14 and live Gallery review | Nine-view evaluator results are not represented as an independent 14-view critic. |
| Winding, closure and intentional negative space | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated winding and continuity capture | Earlier 0-deficit result predates the final roof-weapon seating. |
| Physical seats and yaw/pitch/recoil ownership | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated turret-parent audit | Earlier stranded/abutting/dangling result was 0/0/0. |
| High/low gear motion / strict band+shoe / duplicates | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated tank-standard gate | Earlier exact clip/sweep result was 0/0 + 0/0. |
| Actual return rollers / track thickness / chassis-side closure | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Focused geometry self-test + integrated standard | Four rollers/side and 0.064 m stock are unchanged; final closure receipt pending. |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | PASS | Current worktree | Code/self-test review | Shared chassis/native gear; independent crown/sensors; repeated geometry instanced. |
| Live/spent/reset ERA / permanent backing | PASS N/A | Current worktree | Code review | APS is distinct mounted equipment, not removable ERA. |
| Main/aux armor finite rays / modules / crew | PASS | Current worktree | Focused spec/layout self-test | Existing Merkava internal-layout contract preserved. |
| Markings, colors, bores, actual roof weapon | PARTIAL PASS | Current worktree | Focused spec/geometry self-tests | Solid Sinai gray and roof weapon present; final bore/assets checks pending. |
| Original-model/record preservation | PASS | `12b5dc936` + current worktree | Focused ID/dispatch/tier tests | Existing IDs remain separate; no existing tank is relabeled Barak. |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | | Source exclusion is policy, not yet a build result. |
| Composed release / complete tests / typecheck | NOT RUN | | | |
| Public and private builds / attribution | NOT RUN | | | |

## Round log

- 2026-09-18 intake: recorded only the owner-supplied file inventory,
  provenance metadata, official configuration boundary, target gameplay, and
  unknowns. No source registration, candidate authoring, or qualification ran.
- 2026-09-18 implementation: registered the fused private oracle and authored
  an independent low-crown Barak configuration rather than inheriting the
  Trophy roof. Latest nine-view evaluator result is 93.78 aggregate / 92.04
  minimum. Independent canonical-14 and actual Gallery review remain final
  integrated steps.

## Publication receipt (only if requested)

- Owner authorized ordinary commits and pushes after complete verification.
  Raw and canonical comparison GLBs remain ignored/private and never publish.
