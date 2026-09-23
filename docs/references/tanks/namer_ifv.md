# Namer IFV (`namer_ifv`) — run packet

## Current integrated status — 2026-09-19

Integration `575614227` passes the unchanged source geometry floor with an
unrounded minimum of 93.56384512847441, dimensions 98.51724137931025 and
floaters 100. The fresh combined physical standard passes with no front/rear/sweep band or
shoe collisions, no unexpected openings and the retained source weapon
configuration. This record covers the supplied weaponized IFV, not every Namer
configuration.

Full fleet generation passed at `87e8e9526`, including the regenerated assets.
The subsequent independent fourteen-view review is **HOLD**: the covered
cylindrical launcher stock, deep rear recess, glacis and roof equipment
relationships differ materially from the source. Its scores are 7.8–8.4,
below the existing 9/10 bar. See [the actual visual review](../../history/research/namer-final-canonical-independent-review-20260919.md).
These component repairs, fresh paired Garage views and complete release
verification remain required before publication. The source geometry is
being studied without inventing another gameplay weapon configuration.
The private integrated receipt is
`.qa-dev/tank-run/final-corrections/qualification-r3/physical-integrated-preflight-r1/receipt.json`.
Earlier values and pending checks below belong to the historical implementation.

## Earlier implementation checkpoint

- Updated: 2026-09-18.
- Owner request / latest superseding instruction: build the source-depicted
  weaponized Namer. The authored gameplay interpretation is a Tier-IX
  30 mm support IFV without an ATGM.
- ID and display name: `namer_ifv` — Namer IFV.
- Implementation status: **COMPLETE IN WORKTREE** — independent closed troop
  hull, compact five-station unmanned turret, 30 mm weapon, APS/sensors, remote
  roof station, exact combat record and fleet integration are present.
- Qualification status: **IN PROGRESS** — focused geometry/spec/history checks
  pass. Fresh integrated geometry, winding, Gallery, independent visual review,
  generated-artifact and composed-release receipts remain.
- Publication status / exact authority: owner authorized ordinary commits and
  pushes to `origin/main`; publication waits for a green release tail and the
  parallel fleet round.
- Worktree / branch / baseline commit: detached worktree;
  `12b5dc936b7cfcb78c79fd1f54c3b33c6c971a61`.
- Candidate commit plus dirty-diff or geometry fingerprint: current worktree;
  the latest nine-view evaluator records 94.62 aggregate and 93.56 minimum.
  The committed geometry receipt predates the final carrier fit and is not
  cited as current qualification evidence.
- Current next action: finish queued winding, Gallery, generated-artifact and
  composed-release checks, then integrate latest `origin/main`.
- Blocking choices / known failures: none. The official APC caveat remains;
  this ID deliberately names the source-depicted armed demonstrator and makes
  no claim that every Namer has this turret.

## Scope and preservation

- Mode: independent real-configuration build of the selected weaponized Namer;
  not a generic claim about all Namer APCs.
- Owned files and integrator: `src/vehicles/merkavaModernSpecs.ts`, the exact
  Namer profile in `src/vehicles/profiles/merkavaX.ts`, layout/fleet registries,
  focused tests, generated receipts/assets and this packet.
- Protected original IDs / high and low fingerprints: all existing Israeli
  vehicles remain separate registrations with focused family/order tests.
- Protected asset, anatomy and marking-seat records: existing records are
  preserved; targeted regeneration waits for the final integrated tree.
- Explicitly excluded work: source redistribution or derived geometry/textures,
  a generic Namer APC variant and ATGM capability.
- Variant matrix: one planned 30 mm IFV configuration. Baseline RCWS Namer and
  other upgraded Namer fits are separate variants unless the owner later folds
  them in with evidence.

## Source and comparison contract

- Actual raw path: `/Users/kevinliu/Downloads/Claude of Tanks Models/namer_ifv.glb`.
- Raw SHA-256 / format / size:
  `5b0680e74233959eb939b9ba9866c019b41a31466ab0490fd42627d9f4e118b1` /
  GLB / 7,048,964 bytes.
- Supplied source metadata: title “Namer IFV,” author 42manako,
  CC-BY-NC-4.0,
  [Sketchfab source page](https://sketchfab.com/3d-models/namer-ifv-d71840dd738f40179b7a9eb9aae9c414).
- Source credits, provenance evidence, reference-only authorization: preserve
  author/page/license metadata, but use the GLB only as a private comparison
  input. No source geometry or textures ship.
- Supplied inventory, not a new inspection claim: 139 nodes, 68 meshes, 17,681
  triangles; semantic turret/Trophy/weapon hierarchy; reported bounds size
  7.8827 × 3.3838 × 3.7716.
- Source limitations: semantic hierarchy does not prove the exact real turret,
  gun, APS fit, service configuration, physical seats or gameplay ownership.
  Units, axes, pose, duplicates, animation, track course, texture completeness,
  degenerates and orphan pieces remain unknown.
- Approved target: the source-depicted, Trophy-equipped weaponized Namer,
  interpreted for gameplay as a 30 mm IFV. The IDF describes Namer as a
  Merkava-based APC, about 60 tonnes and operational since 2008:
  [IDF technology expo](https://www.idf.il/en/mini-sites/technology-and-innovation/idf-holds-tech-expo/). IMOD states Trophy is installed on Namer APCs:
  [official Trophy source](https://www.mod.gov.il/en/press-releases/press-room/historic-ceremony-in-germany-marks-the-launch-of-the-first-leopard-tank-equipped-with-israeli-trophy-active-protection-system).
- Naming decision: `namer_ifv` records the selected armed gameplay
  configuration. Official APC terminology is retained as a caveat; the packet
  does not relabel every Namer as an IFV.
- Authoritative baseline configuration source: a SIBAT/IMOD directory describes
  the baseline Namer APC with a .50-inch, 7.62 mm, or grenade-launcher RCWS,
  60 mm mortar, 1,200 hp powerpack, and Merkava Mk.3-like running gear:
  [Israel Defense Directory 2018–19](https://www.sibat.mod.gov.il/Industries/directory/Documents/Sibatdir-dfs-en-2018-19.pdf). That baseline does not prove this packet's 30 mm turret.
- Authored interpretation, 2026-09-18: exact ID, Tier IX, solid Sinai-gray
  palette, 30 mm autocannon and no playable ATGM channel. The owner authorized
  adding the supplied vehicle and rebalancing the Israeli fleet; these exact
  balance values were implementation choices, not a quoted owner decision.
- Conversion: `tools/source-x-oracle.mjs --prepare` on the raw hash-pinned GLB;
  the bake preserves every source mesh and creates a private geometry-only oracle.
- Canonical oracle: ignored
  `public/models/community-candidates/namer_ifv_x_source.glb`, SHA-256
  `72afdec001c1013a7a847a176adf12f0d00d1863f29874797448fdb66d174870`.
- Registration: proper axes `[-z,+y,+x]`, uniform scale `0.949231`, translation
  `[0,-0.006455,+0.8343]` metres; ground is zero and the measured hull
  longitudinal midpoint is centered.
- Candidate datums are hull `[0,0,0]`, turret `[0,2.10,-1.15]`, gun
  `[0,2.50,-0.13]`; the oracle is scored fused because axle and side meshes
  cross nominal ownership even though its source hierarchy is semantic.
- Selected components and independent ownership proof: semantic hierarchy is
  an intake lead only; independent node/geometry ownership **NOT RUN**.
- Rejected/omitted source components: none. An ATGM is absent from the authored
  gameplay configuration by explicit balance decision, not removed from the oracle.
- Registration entry: `tools/west-x-reference-overrides.ts` plus the canonical
  hash/pivot certificate in `tools/source-world-registration.mjs`.
- Quality bar: `fleet`, requiring 92 aggregate and every valid registered whole
  view/track component; the independent native critic remains separately required.
- Hash-pinned source measurements: 7.319995 m primary hull skin and full
  7.482503 × 3.580120 × 3.212008 m physical equipment envelope. The fixed
  source-only ruler reads 7.323500 m substantial-body length, 3.582833 m width
  and 3.180356 m p95 height. Gameplay height is the independently measured
  2.699992 m broad unmanned-station roof. Earlier candidate-fit 7.20/3.15 m
  rows are retired.
- Unresolved target/gate conflicts: none for the selected demonstrator study;
  exact service adoption is intentionally not asserted.

## Construction work order

- Gross-form sentence and before/target datums: heavy Merkava-derived closed
  troop hull with rear ramp and compact five-station unmanned 30 mm turret;
  Trophy, optics, auxiliary weapon and elevated rear remote station are
  physically distinct turret-owned systems. Turret datum is `[0,2.10,-1.15]`
  and gun world datum is `[0.05,2.38,-0.13]`.
- Hull belly/deck, modern glacis, ten-module side cadence, troop roof and rear
  ramp are complete closed/seated surfaces.
- Turret roof/brow, cannon seat, feed cues and asymmetric sights are complete.
- Running-gear centers/radii/tangents retain native Mk.4-family axle datums.
- Actual bilateral return rollers; original-fleet track-thickness control:
  four rollers per side, 0.064 m track stock and exact clip/sweep 0/0 + 0/0.
- Shared/new primitives and high/low strategy: use measured, quality-aware
  first-party Merkava/Namer vocabulary; do not stretch an MBT turret donor or
  copy/remesh source geometry.
- Baseline geometry/build/memory cost and frozen budgets: high/low census and
  browser switching probes remain in the final qualification tail.
- Material roles: solid Sinai gray using `#6f7566` and lighter role `#7b8172`
  on painted stock; distinct APS, optic glass, rubber, track/weapon metal,
  ammunition/feed and cloth/stowage roles.
- Intentional negative spaces, APS/permanent armor separation, rear-ramp and
  turret physical seats are explicit; turret-parent audit reports zero
  stranded, abutting or dangling parts. Layout records three hull crew, eight
  dismounts, an unmanned turret and no missile rack.
- Naming/tier/nation/lazy factory integration: Israel, Tier IX, `namer_ifv`,
  heavy-survivability IFV balance cohort and exact `merkavaX` lazy family;
  assets remain in the final integrated generation pass.
- Gameplay balance intent: 2,550–2,700 HP; 1,200 hp / 62–64 t; 54 km/h forward,
  18–20 km/h reverse; 32–35°/s hull and about 60°/s turret traverse; 0.35 s
  30 mm cycle, 180/164/148 gameplay penetration, about 70 damage, 400 rounds,
  75–90 HE damage, and no ATGM. These are game values, not real platform,
  ammunition, armor or weapon-performance claims.

## Evidence matrix

| Gate | Status | Revision / input hash | Exact command and artifact | Worst result / residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | Raw `5b0680e7…118b1`; oracle `72afdec0…4870` | `node tools/source-world-registration.selftest.mjs` | Proper `[-z,+y,+x]`, scale `0.949231`; fused whole-source evidence. |
| Every registered silhouette / raw aggregate | PENDING REGEN | Current worktree | Root-owned integrated `tank-standard-check --gate` | Nine-view evaluator 94.62 aggregate / 93.56 minimum; broader receipt awaits regeneration. |
| Geometry components / dimension score / 3% check | PASS LOCALLY; INTEGRATED REGEN QUEUED | Current worktree | `node tools/geometry-gate.mjs --ids=merkava4_trophy,merkava4_barak,namer_ifv --check` | Source-only fixed ruler: 93.6 whole, 98.5 dimensions, 100 floaters. |
| Independent 14-view critic / actual Gallery | NOT RUN ON FINAL | Current worktree | Final canonical-14 and live Gallery review | Nine-view evaluator results are not represented as an independent 14-view critic. |
| Winding, closure and intentional negative space | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated winding and continuity capture | Earlier 2-pixel (0.00%) result predates final generated closure. |
| Physical seats and yaw/pitch/recoil ownership | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated turret-parent audit | Earlier stranded/abutting/dangling result was 0/0/0. |
| High/low gear motion / strict band+shoe / duplicates | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Integrated tank-standard gate | Earlier exact clip/sweep result was 0/0 + 0/0. |
| Actual return rollers / track thickness / chassis-side closure | PRE-CLOSURE PASS; REFRESH QUEUED | Current worktree | Focused geometry self-test + integrated standard | Four rollers/side and 0.064 m stock are unchanged; final closure receipt pending. |
| Stored and instance-expanded triangles / build/draw/memory budgets | NOT RUN | | | |
| Cold/warm/rapid tank-switch latency and frame gaps | NOT RUN | | | |
| Primitive reuse / high-low reduction / accessory material roles | PASS | Current worktree | Code/self-test review | Shared native chassis/gear; repeated side modules and whips avoid copied source payloads. |
| Live/spent/reset ERA / permanent backing | PASS N/A | Current worktree | Code review | APS is distinct mounted equipment; no removable ERA state invented. |
| Main/aux armor finite rays / modules / crew | PASS | Current worktree | Focused spec/layout self-test | Three hull crew, eight dismounts, unmanned turret, dual-belt feed, no missile rack. |
| Markings, colors, bores, actual roof weapon | PARTIAL PASS | Current worktree | Focused spec/geometry self-tests | Solid Sinai gray, 30 mm and auxiliary MG present; final bore/assets checks pending. |
| Original-model/record preservation | PASS | Current worktree | Focused ID/dispatch/tier tests | Existing Israeli IDs remain separate. |
| Anatomy update / freshness | NOT RUN | | | |
| Scoped assets / centering / source exclusion | NOT RUN | | | Source exclusion is policy, not yet a build result. |
| Composed release / complete tests / typecheck | NOT RUN | | | |
| Public and private builds / attribution | NOT RUN | | | |

## Round log

- 2026-09-18 intake: recorded only the owner-supplied inventory, provenance,
  official APC/Trophy boundaries, selected IFV interpretation, gameplay target
  and unknowns. No source registration, candidate authoring or qualification
  ran.
- 2026-09-18 implementation: registered the private fused oracle and replaced
  the early blank helmet with a compact five-station turret, visible APS,
  asymmetric optics, 30 mm mantlet and independent remote station. Latest
  nine-view evaluator result is 94.62 aggregate / 93.56 minimum. Independent
  canonical-14 and actual Gallery review remain final integrated steps.

## Publication receipt (only if requested)

- Owner authorized ordinary commits and pushes after complete verification.
  Raw and canonical comparison GLBs remain ignored/private and never publish.
