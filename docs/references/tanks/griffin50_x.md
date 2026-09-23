# Griffin 50 mm X — source reconstruction packet

## Owner proportion update — 2026-09-21

The current Griffin has a 10% longer hull and a uniformly 10% smaller turret.
Wheel radii and the 50 mm weapon remain unchanged. The original source and
its certificates below remain historical. The explicit source-only derivation,
updated rig datums and current qualification are recorded in the
[Griffin proportion correction](../../history/research/griffin-proportions-20260921.md).

## Historical integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Approved assembled-source correction — 2026-09-18

The owner approved the correctly assembled source target. Original raw and
canonical files and failed comparisons remain retained; deterministic source-only
assembly and independent review are recorded in
[the source assembly record](../source-assemblies/README.md).
This supersedes the earlier pending-target statements below, not their evidence.
The active source is `griffin50_x_assembled_20260918.glb`, SHA-256
`1aef6401c01b5d9a6adfc65838c94d350f4aa39afa039709241c426371ca2003`.
Axes, scale, pivot, source camera, and the 92 floor are unchanged.

Independent source sections show a nearly level belly ending in a steep bow
knee, separate projecting rear wings, and a recessed sloped rear door. The
native hull now follows those measured planes and preserves the real rear
space. Source Object_20 rear guards, the port rear lamp, starboard rounded
platform and narrow YZ towing eyes replace the prior generic approximations.
The four authored barrel rings are aligned with the actual gun axis; the old
XZ-oriented rings incorrectly projected beyond the source muzzle. Road-gear
geometry and gun/cradle ownership are unchanged.

The fixed comparison now scores **96.75 aggregate / 94.77 minimum view**;
geometry components are whole curves 94.8, dimensions 97.3, floaters 100.
Source and candidate hull-length and overall-length masks match exactly.
The profile SHA-256 is
`524b3bd1caa66e3070ccfb98ebfce4a6b2791a54b1139c3c2a5484748e96ec7d`.
This is a shape pass; final release qualification remains pending.

`griffinAssembledHull.selftest.mjs` passes 80 HIGH/LOW cold/filled checks for
independent source planes, open rear space, whole-scene guard seats, physical
barrel clearance and first-visible bore, with actual displacement negatives.
All 18 running-gear meshes retain exact HIGH/LOW geometry, attributes, instance
matrices/colors and world matrices. The native muzzle probe passes. Selected
10 m census before final fill refresh: 61,806 HIGH / 35,996 LOW triangles,
41/40 objects with fill records loaded. Final assets, refreshed cost and new
independent 14-view review remain integrator work.

The unmodified strict 2 cm band voxel test reports front 66 / rear 24 /
sweep 317 cells in both qualities; moving-shoe overlap remains zero. These
raw failures are preserved. Every reported cell has |X|=1.14 m: source/native
hull side is |X|=1.13960004 m, while the actual band starts at |X|=1.14700001 m.
A complete conservative finite-stock proof tests all 376 hull triangles against
all 1,120 band-triangle AABBs on each side, HIGH and LOW (1,684,480 pairs).
Every pair is separated; independent 13-axis SAT gives a minimum positive
separation of **7.399967 mm**. All six hull components and each band are closed,
consistently wound components. For every component pair a vertex of each lies
outside the other's full AABB, excluding containment as well as surface crossing.
A real 20 mm hull intrusion is rejected by the same witness. This diagnosis
does not waive the raw gate or alter source dimensions; the integrator owns any
generic conservative validation correction and its containment negatives.

Evidence under `.qa-dev/tank-run/assembled-shape-repair/` includes the retained
baseline failures, `griffin-source-calipers.json`, `griffin-primary-body.json`,
`griffin-rear-stock.json`, `griffin-r2-{fidelity,geometry}.json`,
`griffin-band-separating-planes.json`, `griffin-containment.json`,
`griffin-focused-r3.log`, `gear-preservation.json`, and raw `track-{high,low}/`.



## Historical author checkpoint

- Updated: 2026-09-18.
- Owner request: apply the OP generation procedure to the supplied file, preserve earlier tanks, then commit and push origin/main after qualification.
- ID / display name: `griffin50_x` / Griffin 50 mm X.
- Implementation: independent procedural reconstruction under measured iteration; shared integration is owned by the batch integrator.
- Qualification: FAIL against untouched full source. Aggregate 90.07; minimum registered view 83.00, required 92. Source-only registration passed; complete qualification remains blocked by the documented source/equipment conflicts and unfinished review.
- Publication: NOT PUBLISHED. Current authority covers this requested batch; no as-is exception exists.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`; branch `codex/kurganets-odztz-generation-20260917`; base `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Candidate: uncommitted profile `src/vehicles/profiles/griffin50X.ts`.
- Next action: complete per-view correction, official independent 14-view review, physical-seat/articulation, performance and composed release checks. Source conflicts remain explicit pending owner target selection.
- Known source limitations: Raw source Object_25 contains a large below-track plate down to Y = −0.6865 m; it is visible as a dangling vertical panel in the native front and side studies. Native track floor is approximately −0.029 m. The canonical source retains this component at Y = −0.6575 m. The candidate does not reproduce it as a fake below-ground hull: qualification must report its residual or obtain an explicit target correction. No source mesh has been omitted or silently masked.

## Scope and preservation

This is an independent source-backed X build. Preserve every existing vehicle, especially `spz_puma`; reuse that donor only for initial game balance metadata, never its visual silhouette. The profile writer owns only the new profile, this packet and local ignored source studies. The integrator owns fleet registries, generated receipts, assets and publication. Original-model fingerprints and generated-record preservation remain NOT RUN until integration.

## Source and comparison contract

- Raw input: `/Users/kevinliu/Downloads/griffin_50mm_armored_warfare.glb`.
- SHA-256: `ab4daa4ba8eed3eff25c77c35bd7082a2de7d188bd0c87e6fc73c57e7076bfca`.
- Format / size / mesh count / triangles: GLB / 23908724 bytes / 25 / 145440.
- Provenance: owner-supplied comparison file; the filename identifies a commercial-game study. Original author/license are unverified; redistribution rights are not asserted. Source binaries, source textures and copied mesh topology are excluded from runtime and publication.
- Target: the supplied model and its visible equipment configuration. No real-vehicle dimension certification is claimed.
- Inventory: `.qa-dev/tank-run/british-us-source/griffin50_x-inventory.json`; connected-component bound study: `.qa-dev/tank-run/british-us-source/griffin50_x-components.json`.
- Canonical local oracle: `public/models/community-candidates/griffin50_x_source.glb`.
- Canonical SHA-256: `62f6e270698d7b218184ada575289da3cc1b362da4d96a8314d6e1277d618d34`.
- Registration: identity signed axes [X,Y,Z], right handed, uniform scale 1, translation [0,0.029,0] m. Longitudinal and lateral source datums are unchanged. The source gun points +Z.
- Preparation: `node tools/source-x-oracle.mjs --prepare=/Users/kevinliu/Downloads/griffin_50mm_armored_warfare.glb --recipe=.qa-dev/tank-run/british-us-source/griffin50_x-recipe.json --report=.qa-dev/tank-run/british-us-source/griffin50_x-registration.json`, through the capture queue.
- Ground: chosen from the native track contact floor, independently of candidate geometry. Every source mesh is retained, including underbody defects.
- Authored turret yaw center: [0, 2.07, -0.36] m; gun pivot: [0, 2.6, 0.74] m; muzzle Z = 3.67194 m. These are source-study construction datums, not recovered source rig bones.
- Source ownership: generic mesh names and unrigged exports; no honest independent hull/turret/gun masks have yet been established. Use whole-source comparison.
- Diagnostic render: Blender 5.2.0 LTS, orthographic front/rear/right/left/top/quarter, source materials replaced with one neutral study material. Outputs `.qa-dev/tank-run/british-us-source/griffin50_x/<view>.png`. These are intake evidence, not official verdict renders.
- Official qualification: fixed registered source, stock official cameras, procedural-only high/low, seed 4242, >=92 overall and in every registered silhouette view; dimensions within 3%; independent shaded review, articulation and track gates remain required.
- Published dimensions: NOT VERIFIED. Boot-light dimensions in `britishUsSourceStudyData.ts` describe source extents/estimated body height and may not be represented as published specifications.

## Construction work order

Source-connectivity clarification: this is not a correctly posed rear ramp.
The 224-vertex door component within `Object_25` occupies
[0.019, -0.687, -0.029] to [1.355, 0.689, 0.128] m. The actual rear hinges
and bumper components in that same source mesh occupy Z ≈ −3.02 m and
Y ≈ 1.5 m. Thus the door is about 3 m ahead of its rear seat and penetrates
the ground near the vehicle origin; it has no hinge load path to the rear
opening in this export. The full source remains unchanged; see
`.qa-dev/tank-run/british-us-source/griffin50_x-underbody-components.json`.

A steeply sloped six-wheel IFV hull carries broad hanging side armor and a tall angular twin-cheek turret; the recessed gun corridor, distributed optical heads and elevated protected roof weapon define the source fit.

Road centers Z = −1.4585, −0.7285, 0.0015, 0.7315, 1.4885, 2.2185 m; Y = 0.4235 m, R = 0.3225 m, lane X = ±1.4345 m. Front drive Z = 2.8175, Y = 0.9715, R = 0.3665; rear idler Z = −1.9865, Y = 0.997, R = 0.2615. Four bilateral return rollers hidden behind the source armor skirt.

The build uses first-party section lofts and KIT primitives, canonical suspension/track assembly, quality-dependent cylinder rings and wheel detail, and equipment buckets for nonarmor optics, lamps, launchers and grilles. No source positions, indices or textures are loaded by a playable build. Identity equipment: Independent raked hull stations, separated ballistic skirt panels, rear stowage, driver hatch/periscopes, engine grilles, headlamps and towing eyes, angular rear turret volume with two forward cheeks, real center gun recess, optical heads, smoke launchers, roof hatch, pedestal and shielded remote gun, rear antenna bases/whips and 50 mm gun.

The source's real slat/recess air must stay open. Main armor remains continuous closed solids. Accessory seats require official close views and gun/turret articulation validation; successful parenting alone is not a seat pass. Running gear must remain one moving assembly, with road wheels, return rollers, drive wheels and one native smart-shoe course. No fake static track silhouettes are authored.

## Evidence matrix

| Gate | Status | Evidence / residual |
| --- | --- | --- |
| Raw source hash / inventory | PASS | Hash and full mesh inventory retained in ignored study report |
| Rigid source registration | PASS | Identity axes, one Y translation, no selection/omission; canonical hash above |
| Source multi-view intake | PASS | Six native source study renders inspected; not a parity verdict |
| Every registered silhouette / aggregate | FAIL | Latest aggregate 89.09; minimum 81.94; required floor 92 |
| Geometry / dimensions within 3% | FAIL | Full-source displaced-door envelope remains retained; dimension score 0, no source omission or compensation |
| Independent official 14-view critic / Gallery | PARTIAL | 14 certified shared-source-camera views captured at shots/visual-eval-griffin50_x; independent ≥9 per-view critic and actual Gallery review still pending |
| Winding / closure / negative space | NOT RUN | Candidate needs rendered and ray review |
| Physical seats / yaw / pitch / recoil | NOT RUN | Canonical owner frames authored; needs actual rig verification |
| High/low gear motion / strict band+shoe / duplicate courses | PARTIAL | Round 2 strict native band and shoe counts 0/0 in front, rear and swept zones; full animated high/low review remains pending |
| Return rollers / track thickness / chassis closure | NOT RUN | Native rollers authored; measurements pending |
| Stored + expanded triangles / build / draw / memory | PARTIAL | Round 2 stored/expanded counts below; these CPU construction samples do not certify draw calls, memory or switching |
| Cold/warm/rapid switching | NOT RUN | Full fleet integration required |
| Primitive reuse / low reduction / material roles | PARTIAL | High/low native finite positions and wheel-quality audits passed; material/primitive-reuse and shipping performance checks remain pending |
| Live/spent/reset ERA | NOT APPLICABLE | This source fit has no newly authored reactive armor |
| Main and auxiliary armor / modules / crew | NOT RUN | Metadata peer is only an initial balance donor |
| Markings / bores / roof weapon | NOT RUN | Integrated factory must finalize bores and markings |
| Original model / receipt preservation | NOT RUN | Integrator must fingerprint unaffected IDs |
| Anatomy update / freshness | NOT RUN | Integrator owns generator sequence |
| Scoped assets / centering / source exclusion | NOT RUN | Ignored oracles must remain excluded |
| Composed release / tests / typecheck | NOT RUN / NOT RUN / PASS | TypeScript no-emit compile passed 2026-09-17; no release pass claimed |
| Public/private build / attribution | NOT RUN | No publication receipt yet |

## Round log

1. Intake: recorded raw identity, generic mesh ownership and actual source equipment; rendered front/rear/both sides/top/quarter under the shared capture queue.
2. Registration: froze source axes and track-floor translation before candidate authoring; retained every mesh and documented defects.
3. First draft: built native independent hull, turret, gear and equipment, with boot-light datums for the integrator. Strict comparisons are the next action.


### Registered fidelity round 1

Official tool: `node tools/procedural-fidelity.mjs --ids=fv510_milan_x,griffin50_x,ajax_x --check --board --neutral-board`, through the existing capture queue. Exit 1; 0/3 pass. Evidence retained at `.qa-dev/tank-run/british-us-source/fidelity-round1.json` and `griffin50_x-round1.png`. Registration passed with no normalization or source omissions.

| View | Score |
| --- | ---: |
| front | 83.10 |
| frontLeft | 92.27 |
| left | 87.83 |
| rearLeft | 94.22 |
| rear | 82.38 |
| rearRight | 93.29 |
| right | 88.15 |
| frontRight | 91.55 |
| top | 90.27 |

Round 2 corrections are being measured; this failed round is not a current certificate.

### Measured round 2 and source-derived metadata correction

Fidelity round 2 used the same fixed full-source registration and untouched 92 threshold. Aggregate **88.77**, minimum view **82.15**; FAIL. Exact evidence: `.qa-dev/tank-run/british-us-source/fidelity-round2.json`; masks are in `masks-round2/griffin50_x/`.

| View | Score |
| --- | ---: |
| front | 83.18 |
| frontLeft | 92.07 |
| left | 88.17 |
| rearLeft | 94.52 |
| rear | 82.15 |
| rearRight | 93.38 |
| right | 88.43 |
| frontRight | 91.13 |
| top | 90.28 |

All three shared strict native band/shoe runs returned zero front, rear and swept penetration after reducing authored compact-IFV shoe thickness to pad 0.034 / grouser 0.008 / web 0.026 / horn 0.08 / pin radius 0.014 m and track thickness 0.032 m. Axle stations were preserved. Lower run datum is 0.054 m. This is a native physical correction, not a static replacement track. Subsequent geometry changes must be audited again.

Round 2 continuity: zero cells. One real shared Browning-pattern fitting is seated into the source-specific rooftop cradle. The source detached rear door and open aft compartment remain an unresolved target conflict, particularly visible in front/rear and top masks.

Source height metadata originally conflated full antenna AABB with the gate’s body-height convention. The source-only body study gives 4.403518 m in the raw silhouette frame minus the 0.6575 m displaced-door floor offset = 3.746018 m. The rounded informational height now uses that value; it is not a published-dimension claim and was not fitted to the candidate. The integrator separately registered identical source-only camera masks plus full 3D envelopes for dimension qualification, retaining the complete source and every protrusion.

| Quality | Stored triangles | Expanded triangles | Meshes | Native construction ms |
| --- | ---: | ---: | ---: | ---: |
| high | 17736 | 57882 | 41 | 165.9 |
| low | 14158 | 50832 | 39 | 149.8 |

These are diagnostic Node construction samples, not browser frame/switch performance. All native coordinates were finite and high/low wheel-quality audits returned no issues. Low geometry reduction, draw-call budget, actual memory and rapid gallery switching still require measured qualification.

### Shaded-detail and fidelity round 5

The source Object_26 connected-component study identified three upper armor sections and seven lower apron plates ending at raw Y=0.294 m (registered Y=0.323 m). The first draft omitted those lower aprons, exposing too much wheel. The corrected native plates preserve the source hinge stations and sit on a continuous hull mounting rail outside the live shoe course. The port engine grille moved to its source Z=0.64–1.936 m sloped station; turret side/rear pods gained their chamfered cases. The real roof gun uses a uniform 1.28 fitting scale from its 1.574 m source longitudinal envelope. No missile launcher was observed; inherited Puma missile ammunition must be removed by the integrator.

Fixed-source round 5 aggregate **89.09**, minimum view **81.94**, track component **87.16**. FAIL; no full release pass is implied. Report: `.qa-dev/tank-run/british-us-source/fidelity-round5.json`.

| View | Score |
| --- | ---: |
| front | 82.96 |
| frontLeft | 91.64 |
| left | 88.94 |
| rearLeft | 94.46 |
| rear | 81.94 |
| rearRight | 93.67 |
| right | 88.45 |
| frontRight | 91.42 |
| top | 92.33 |

The first shaded 14-view evaluator captures preceded the shared-camera correction and are diagnostic only. They are preserved in `.qa-dev/tank-run/british-us-source/visual-diagnostic-before-final/griffin50_x/`. Fresh certified-source camera captures and independent review are pending.

### Exact unresolved source target

The displaced door is a connected 224-vertex body in Object_25 near the origin, raw bounds [0.019,−0.687,−0.029]→[1.355,0.689,0.128] m, separated from the actual rear hinge/bumper hardware at Z≈−3.02 m. The real rear compartment also has an empty aperture in the supplied export. The native closed compartment deliberately does not reproduce an underground hanging plate or cut a through-hole to imitate missing export hardware. The raw source stays intact for every scored run. Source fidelity cannot be certified until the owner selects the intact source or explicitly approves a documented repaired target.

### Current official board registration

`shots/visual-eval-griffin50_x/report.json` generated at 2026-09-18T06:59:34.474Z contains 14 views, `registration.mode=certified-source-world`, `sharedCamera=true`, and the canonical source hash recorded above. The rig-parity diagnostic reports **OK**. This confirms the two panels use the fixed source ruler; it is not an independent shaded-quality score. The earlier pre-fix self-framed boards are diagnostic history only.

Current authored profile SHA-256: `142ec417793a2f64976b6322b22fe4b0da4a004cdb409058ba5508f0dd04c492`. Independent final visual review, actual Gallery/articulation and composed release remain outstanding.

### Final native and type verification for this handoff

`npx tsc --noEmit --pretty false` passed. Plain Node 24 high/low construction produced only finite coordinates and no wheel-quality audit issues for this ID. Source: `.qa-dev/tank-run/british-us-source/native-final.json`; run log `native-final-retry.log`. The earlier attempt unnecessarily requested the unavailable tsx loader; that tooling attempt failed before construction and was rerun correctly.

| Quality | Stored triangles | Expanded triangles | Meshes | Diagnostic construction ms |
| --- | ---: | ---: | ---: | ---: |
| high | 16646 | 56792 | 40 | 156.5 |
| low | 13056 | 49730 | 38 | 135.0 |

These timings are single-process native construction samples, not measured browser draw calls, frame time, memory or gallery switch guarantees. Those release gates remain outstanding. In particular, Ajax takes about 1.2 seconds in this geometry-receipt construction path and requires a real cold/warm/switch assessment before any performance claim.

## Publication receipt

NOT PUBLISHED. No failing/unknown gate has been converted into a pass. Source binaries, local scripts, renders and ignored oracles are excluded from the eventual reviewed commit path list.

## Post-main non-conflicting detail round 1

Integrated-main base `3f6fc4ad8`. Profile frozen at SHA `e0671bd1c334954b7e1958c5c2de83a8c79a18469e4cb7620f897fd795cb1bd8`; private snapshot and record `griffin-detail1-profile.ts` / `griffin-detail1-freeze.json`. The source, rigid registration, camera and threshold are unchanged. The closed aft hull and displaced source door remain an explicit unresolved target discrepancy. This work does not authorize cutting the rear opening or omitting the below-ground component.

Scalar measurements in `griffin-detail-study-components.json`, `griffin-turret-ray.json`, `griffin-roof-rays.json`, `griffin-port-roof-rays.json` and `griffin-hull-roof-rays.json` drive independent primitives, not copied source contours. Main source deck has an asymmetric break and a locally raised port access cover. The old conspicuous forward deck/side grilles are replaced by closed covers at the measured stations; the driver cover is polygonal and follows the sloped starboard deck. Source headlamp and vertical tow-eye positions replace generic misplaced fittings. The aft deck remains closed pending the source-pose decision.

The turret rear roof now slopes to its measured rear antenna bases; forward cheeks taper to expose the actual four oval equipment cases. Each capsule is authored from width, height, depth, angle and centre measurements. The roof heads each have **two** short tubes, not the three suggested by an early image-only impression: Object_11 has two distinct tube components per head, each approximately radius 0.040 m and length 0.337 m. Separate side forks, axle, collar and lower foot form the receiving structure. Two source optical housings, lowered/asymmetric roof feet, source-sized weapon shields and rear roof service plates replace generic posts/discs. The shared M2 weapon and canonical six-wheel running gear are retained. No source-invented missile launcher or added ATGM exists.

All shaded captures are paused while the shared native-shoe material correction is verified. The prior official14 images remain historical; fresh all-view shaded review is required. Native HIGH/LOW finite/wheel audit and type checks are queued for this freeze. No new fidelity, physical or independent visual PASS is asserted.

Round 2 extends the freeze with measured native wheel stock at SHA `2220f1cf6593feb0b02e3c64adfc5d5eae53e9abe4dd0f04f08410388b25443c` (`griffin-detail2-profile.ts` / `griffin-detail2-freeze.json`). `remaining-wheel-rays.json` and `griffin-wheel-widths.json` establish the source Object_23 steel web axial distance 0.0796 m, cap 0.2206 m, and outer tire face 0.2735 m. Two tire bands retain the approximately 0.023 m centre air gap. A sparse independently authored lathed steel section replaces the generic capped face; native wheel stations, radii, width and track path are unchanged. Native emitted FrontSide rays on both faces/qualities are part of the new queued audit.

Round 1 native finite positions/wheel quality and type checking passed before this wheel follow-up. HIGH 20,368 stored / 60,142 expanded triangles, 40 meshes; LOW 15,798 / 52,100, 38 meshes. Those counts and shape receipts are historical after the round 2 wheel change. Fresh round 2 type checking passed; remaining exact result files use the `griffin-detail2-*` prefix. No official shaded capture has been started during the shared appearance investigation.

Round 2 type/native checks passed. Emitted FrontSide wheel rays hit the centre cap at ±0.2206 m and the recessed web at ±0.0796 m in both qualities. All positions are finite and wheel-quality audit issues are empty. HIGH: 21,274 stored / 70,288 expanded triangles, 39 meshes; LOW: 16,096 / 54,950, 37 meshes. These are construction/census results, not browser performance certification.

Round 2 fixed full-source fidelity remains **FAIL**: aggregate **90.02**, whole **90.59**, tracks **87.52**, minimum **82.72** against the unchanged 92 floor. Views: front 84.05; front-left 93.78; left 89.16; rear-left 95.55; rear 82.72; rear-right 95.05; right 89.17; front-right 93.22; top 92.57. Source registration passes; no normalization is applied. The displaced below-floor door stays in every applicable reference mask. Current source width is 3.8106 m versus candidate 3.665 m; the missing measured rear lifting eyes are an additional genuine geometry omission, separate from the source-pose conflict. Their Object_20 envelopes are X ±1.7295..1.9053, Y 1.7617..2.0039, Z −2.2793..−2.0234 m before the +0.029 m registration. Correct those actual fittings instead of scaling the model or changing the dimension gate.

Round 2 strict native standard reports continuity 0, one roof MG and native band/shoe front/rear/sweep 0/0. It remains overall FAIL because the registered source gate is 0 (full-source dimensions 0 / minimum view 82.7); floaters score is 100. Explicit retained LOW/HIGH track receipts independently confirm two native bands, two shoe instance meshes, 296 instances, all three zones 0/0 and anomaly null. Those machine passes do not waive the source mismatch or certify independent shaded quality.

Round 3 freezes at `bb4f332ffefae48f0be812b34efcbf8e3b0b22a6dbfe69ddbaadb2fb3fadeb6a`. Sparse source side rays (`griffin-lift-eye-rays.json`) establish the actual receiving hull X ±1.7295 m; the old narrower side was corrected before seating the measured lifting eyes. `griffin-mantlet-rays.json` identifies the broad fixed corridor cover (0.751 m wide) behind the moving gun cradle, while `griffin-gun-rays.json` identifies the tapered jacket around the 50 mm barrel. These are distinct ownership groups: fixed cover on turret, jacket/trunnion/barrel on the canonical gun; the established pivot and muzzle datum are unchanged. The actual source articulation is not recovered from this unrigged export, so dynamic pitch/recoil contact validation remains required.

A fresh official14 capture and numerical/strict LOW/HIGH checks are queued for round 3 on the corrected shared shoe appearance and evaluator-mask baseline. Previous shaded captures are retained as historical. The source floor/rear-opening target remains unchanged and unresolved.


## Verified detail round 3, corrected shared shading

The round 3 profile remains frozen at SHA-256 `bb4f332ffefae48f0be812b34efcbf8e3b0b22a6dbfe69ddbaadb2fb3fadeb6a`. All raw source components, the rigid registration and the 92 all-view floor remain unchanged. This section supersedes the queued status above. Shared fixes now retain the native shoe instance palette without a second material multiplier, disable an absent vertex-color attribute, and clear instance colors for the evaluator's white-mask pass. They do not change source or candidate geometry. Earlier shaded boards remain historical.

- Type checking: PASS.
- Native HIGH/LOW: finite positions, no wheel-quality issues; emitted FrontSide rays on both sides hit the measured centre cap at ±0.2206 m and recessed web at ±0.0796 m.
- Native strict standard components: continuity **0**, roof MG **1**, band and instanced-shoe front/rear/sweep intersections **0/0**. The overall standard remains **FAIL** because the registered full-source geometry/dimension gate fails.
- Independent explicit LOW and HIGH clip receipts: two native bands, two instanced-shoe meshes, 296 shoe instances; all three zones **0/0**, anomaly `null`. Reports: `griffin-detail3-track-low/track-clip.json` and `griffin-detail3-track-high/track-clip.json` below the private evidence root.
- Full-source dimensions **0**, floaters **100**. Width is source 3.8106 m versus candidate 3.799219 m after the actual rear lifting-eye/receiving-side correction. The displaced source door and aft opening remain visible mismatches and no source exception has been granted.

| Quality | Stored triangles | Expanded triangles | Meshes | Native construction ms |
| --- | ---: | ---: | ---: | ---: |
| HIGH | 22274 | 71288 | 39 | 202.6 |
| LOW | 16688 | 55542 | 37 | 139.8 |

These are all-LOD Node construction counts, not the selected browser census. The batch IFV limit is 80,000 HIGH selected triangles / 85 objects, with LOW at most 75% of HIGH at the same 10 m camera distance. That matched browser measurement, draw calls, timing, memory and rapid switching remain outstanding; these counts do not certify the performance gate.

Fixed-source fidelity: aggregate **90.08**, whole **90.66**, tracks **87.54**, minimum **83.00**; **FAIL**. Source-only registration passes and no normalization is applied.

| View | Score |
| --- | ---: |
| front | 83.95 |
| frontLeft | 93.80 |
| left | 89.19 |
| rearLeft | 95.63 |
| rear | 83.00 |
| rearRight | 95.20 |
| right | 89.18 |
| frontRight | 93.27 |
| top | 92.73 |

Fresh official 14-view capture at **2026-09-18T09:28:36.458Z** uses `certified-source-world`, `sharedCamera=true`, canonical source hash above and rig verdict **OK**. The immutable local archive is `.qa-dev/tank-run/british-us-source/griffin-detail3-official14/`; exact PNG/report hashes are in `griffin-detail3-official14-hashes.json`. The author inspected all 14 actual images. This confirms view coverage, not an independent 9/10 certificate.

Author observations: the native shoes now show their gray steel relief, and the measured oval side cases, paired roof tubes, sloped covers, widened fixed gun corridor and separate tapered moving jacket are visible. The source's open aft compartment and displaced door still dominate the rear, front and top residuals. Additional geometry remains below a claimed 9/10: the weapon cradle/receiver needs its finer mechanical contour, the optical cases need more exact opening and support shapes, and the broad front lower plate plus shallow roof-cover hardware need a closer source comparison. Lighting/material differences alone are not evidence of missing geometry and will not be compensated with arbitrary paint tuning.

Evidence prefix: `.qa-dev/tank-run/british-us-source/griffin-detail3-*`, including the frozen profile, native ray output, fidelity, standard, clip receipts and audit log. Final independent shaded review, live pitch/recoil and physical seating, selected-performance census, anatomy and composed release remain open. **NOT PUBLISHED.**

## Quality-aware native shoes and stable detail 4 verification
Current profile SHA-256 `ccf1818457854968a7e114ae9c65065597107ed16236b8f280ad16918bbfc136`; immutable profile/freeze files `griffin-detail4-profile.ts` and `griffin-detail4-freeze.json`. The existing `buildFleetTrackShoe` now applies its quality-dependent stock sampling while preserving measured shoe dimensions, native paths, axle stations and the detail 3 body. No source object, camera or comparison threshold changes. This supersedes the earlier running status.
Type checking, finite native stock, wheel-quality checks and emitted FrontSide wheel-section rays pass in HIGH and LOW. Explicit LOW/HIGH strict track clips both pass: two bands, two instanced shoe meshes, front/rear/sweep intersections 0/0 and no anomalies.
Strict native continuity is 0 and the roof MG census is 1. The full standard remains **FAIL**, dimensions 0, floaters 100; the full untouched reference still includes its displaced door and real open aft compartment. The owner target decision remains open.
Fresh full-source fidelity **90.07 aggregate / 90.66 whole / 87.52 tracks**, minimum **83.00**; **FAIL** against 92 per view. Whole/component masks remain available only as previously documented.
| View | Score |
| --- | ---: |
| front | 83.95 |
| frontLeft | 93.81 |
| left | 89.19 |
| rearLeft | 95.62 |
| rear | 83.00 |
| rearRight | 95.20 |
| right | 89.17 |
| frontRight | 93.26 |
| top | 92.73 |

| Quality | Stored triangles | Expanded triangles | Meshes | Native build ms |
| --- | ---: | ---: | ---: | ---: |
| high | 22218 | 63000 | 39 | 198.2 |
| low | 16568 | 37782 | 37 | 136.9 |

Matched 10 m browser census: **HIGH 59,744 / LOW 34,526 selected triangles**, **38/37 objects**, LOW **57.79%** of HIGH. The agreed 80,000 HIGH / 85 objects / 75% LOW geometry limits **PASS**. Native expanded counts above include unselected LODs and are not the budget measure. Frame timings, memory, rapid switching and gameplay remain separate release checks.
Fresh official14 at **2026-09-18T09:59:11.414Z** uses `certified-source-world`, the same canonical source hash and `sharedCamera=true`. The author actually viewed all fourteen originals in `griffin-detail4-official14/`; PNG/report hashes are in `griffin-detail4-official14-hashes.json`. This records coverage, not independent 9/10 approval.
Remaining visible defects: the RWS fine receiver/cradle is still simpler, optical cases need closer opening/support correspondence, and lower-bow and shallow roof-cover hardware need finer source measurements. The open rear compartment and displaced source door remain unresolved; improved shoe sampling is not a solution to those failures.
Independent shaded approval, complete seating/weapon motion, anatomy and composed release checks remain open. **NOT PUBLISHED.** All evidence named here is below `.qa-dev/tank-run/british-us-source/`.

Shared wheel-shader correction is being integrated after this detail4 shaded capture. Preserve these images as pre-shader evidence; final shaded approval requires a new capture after that shader freezes. Geometry and explicit strict LOW/HIGH clips remain independently recorded above.

## Postshader/postfill official14 — 2026-09-18

The unchanged detail4 profile was captured at **2026-09-18T10:49:53.135Z** with
`interiorFillRecordLoaded=true`, the fixed certified source and one shared
camera. The immutable archive is
`.qa-dev/tank-run/british-us-source/griffin50_x-final-shaded14/`;
`identity.json` contains complete input and original image hashes. Material
SHA-256 is `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.
The author actually inspected all fourteen originals. The separately preserved
`griffin50_x-postshader-prefill14` images are historical diagnostics only.

The measured gun jacket/corridor, oval equipment housings, paired roof tubes
and moving native tracks remain present. Non-conflicting visual defects still
include the RWS receiver/cradle contour, optical receiving recesses/supports,
front lower plate and shallow roof-cover fittings. The source's real open aft
compartment and displaced below-ground door are retained in comparison and
still need an owner target choice; the candidate remains in its current closed
configuration. This record claims coverage, not independent 9/10 approval or
release. The full-source failures remain. **NOT PUBLISHED.**


## Detail5 optical receivers and pocket — 2026-09-18

Independent review found the two optical assemblies had been simplified to flat
patches. New canonical-source probes identify four windows per receiving case:
Object_6 on the upper housing and Object_24 on the lower. The upper receiving
body is X .6235–.9180, Y3.26053–3.49393, Z .2911–.5636 m; its raised front
frame ends at Z .5719. The rounded bracket cheeks occupy X .5684–.6206 and
.9199–.9722, with transverse arc centre (Y3.39143,Z .4354), radius about
.110 m, and a foot down to Y3.15803. Independent solid stock now follows
these scalar dimensions, with an actual open frame around the receiving body.

Upper aperture centres and exposed stations are:

| Aperture | X | Y | Face Z | Size |
| --- | ---: | ---: | ---: | --- |
| upper left rectangular | .70485 | 3.44268 | .5694 | .0825 × .0479 |
| upper right rectangular | .83910 | 3.44268 | .5699 | .0796 × .0479 |
| lower right rectangular | .83860 | 3.33868 | .5699 | .0776 × .1055 |
| lower left circular | .70485 | 3.33868 | .5738 | outer radius .05065; convex face .03565 |

The lower assembly has the same measured arrangement approximately Y−.56801 /
Z+.4586 m. The convex circular lens preserves its .05065/.04505/.03565 radius
stations and 4.9 mm total depth. The frame has actual cutouts, so paint cannot
cover the shallow optical faces. No source vertices or topology are runtime
inputs.

Full-scene rays found the old turret cheek loft also buried the lower source
stations. Source rays establish the local receiving pocket: X .545–1.002,
rear wall Z .6656, and floor Y≈2.592 with a slight longitudinal slope. Only
that authored cheek stock is divided into closed jambs and floor; the opposite
cheek and exterior facets remain. The source rear-door target is unrelated and
has not been modified.

Frozen profile SHA-256:
`7cf7ba55427824ba78cd9592d2c55651fa028a391326c51d1367986beecd1df3`.
With the actual 17-box / 204-triangle fill record loaded, all eight lenses are
first hits at their measured stations in HIGH and LOW; finite geometry,
measured wheel faces, type checking and strict track sweeps pass. Selected
10 m geometry is **61,820 HIGH / 36,090 LOW**, 41/40 objects, or **58.38%**.
Raw-source comparison remains **90.07 aggregate / minimum 83.00** and the
strict standard therefore remains **FAIL** (dimensions 0; continuity 0,
floaters 100, MG1 and zero track contacts). Those failures are preserved.

Evidence: `.qa-dev/tank-run/british-us-source/griffin-detail5-*`,
`griffin-native-detail5.*`, and the `griffin-optic-*` scalar studies. Fresh
loaded fourteen-view originals are `griffin50_x-final-shaded14`, captured
2026-09-18T11:23:17.153Z with stable input/image hashes. All fourteen originals
were actually viewed by the author; independent follow-up was requested.
The preceding critic's detail4 images and hashes remain preserved in
`griffin50_x-detail4-shaded14`. This correction does not claim publication,
full raw-source qualification or an approved rear-door pose.

Independent follow-up is complete:
[`griffin-detail5-independent-review-20260918.md`](../../history/research/griffin-detail5-independent-review-20260918.md).
The independent reviewer actually opened all fourteen detail5 originals,
reverified all hashes and rated every scoped assembled-body view at least 9
for source fit, substantive detail and static seating. The optics finding is
resolved. This does **not** waive the unchanged raw-source rear/door conflict
or turn the recorded machine gate failure into a pass.


## Gun cradle ownership repair — 2026-09-18

The measured tapered jacket and transverse trunnion now form the pitching cradle. The main tube and muzzle stock recoil inside it. The broad source corridor cover remains fixed on the turret. The source is a static study, so this is an explicit mechanical ownership correction supported by the actual receiving stock, not a claim that source animation or internal breech kinematics were recovered. No primitive dimensions, source registration, root/pivot, running gear, threshold or comparison target changed. Profile freeze: `bff3f390e8c56c5dd3a78e25c28a94b8585fed29b9c3423a1a0070fa765e6b99`.

The source-study mount helper preserves the original barrel material object, UV projection, weathering colors and factory disposal ownership. Kurganets coaxial stock and the Ajax sight remain visible through HIGH/LOW near/far/near LOD updates; their former temporary detail wrappers are removed completely. Dark stock is never duplicated.

Verification: `src/vehicles/profiles/sourceStudyGunCradles.selftest.mjs` passes for all six corrected profiles in HIGH and LOW. It probes actual measured housing planes and full-scene first-visible surfaces at minimum, neutral and maximum legal pitch, exercises real firing recoil, confirms positive physical tube/cradle cross-section overlap, detects the former wrong parent using the real stock, checks actual dark LOD visibility and observes exactly one disposal per migrated geometry. Type checking passes. The 12 neutral before/after fingerprints retain every visible world triangle, normal, UV, weathering color and material descriptor exactly; evidence is `.qa-dev/tank-run/gun-ownership/british-six-before.json` and `british-six-after.json`. These full-scene counts include unselected LOD geometry and are not substitutes for the selected runtime cost ceiling.

Earlier capture and assembly receipts remain historical. Root-owned regeneration, final filled verification and composed release must follow this new owner split. Existing raw-source comparison/target conflicts remain unchanged and unwaived.

Rendered replay also passes for all 12 HIGH/LOW cases using preserved pre-edit profile copies and real factory materials: `.qa-dev/tank-run/gun-ownership/british-rendered-parity.json`. World-face attributes and material/shader descriptors match exactly, and an already-live untouched Leclerc control remains unchanged. This additional check exercises the rendered path rather than relying only on geometry-receipt material stand-ins.
