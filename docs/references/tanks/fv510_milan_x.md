# Warrior MILAN X — source reconstruction packet

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Historical author checkpoint

- Updated: 2026-09-18.
- Owner request: apply the OP generation procedure to the supplied file, preserve earlier tanks, then commit and push origin/main after qualification.
- ID / display name: `fv510_milan_x` / Warrior MILAN X.
- Implementation: independent procedural reconstruction under measured iteration; shared integration is owned by the batch integrator.
- Qualification: FAIL against untouched full source. Aggregate 88.06; minimum registered view 78.63, required 92. Source-only registration passed; complete qualification remains blocked by the documented source/equipment conflicts and unfinished review.
- Publication: NOT PUBLISHED. Current authority covers this requested batch; no as-is exception exists.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`; branch `codex/kurganets-odztz-generation-20260917`; base `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Candidate: uncommitted profile `src/vehicles/profiles/fv510MilanX.ts`.
- Next action: complete per-view correction, official independent 14-view review, physical-seat/articulation, performance and composed release checks. Source conflicts remain explicit pending owner target selection.
- Known source limitations: Raw source Object_26 and Object_36 contain below-track hardware down to Y = −0.6614 m. Native track floor is approximately −0.005 m. The retained canonical source therefore still reaches Y = −0.6564 m. This is an unresolved whole-source comparison conflict: the authoring candidate currently reconstructs the visible vehicle above the track plane, not the dangling export hardware. No source mesh has been omitted or silently masked.

### Post-main non-conflicting detail round 1

On main integration `3f6fc4ad8`, the actual rear door was reseated to its source bounds X −0.565..0.564, Y 0.503..1.826, Z −2.804..−2.701 m; the main stern stock now ends at source Z −2.766. This is the original seated door, not an approval to relocate or exclude the separate below-ground duplicate. Object_27's 19 transverse rear-door slats, three vertical inner bars, hinges and latches occupy their measured plane Z −2.973. The two rear corner cages now curve around their measured 0.482 m radius with 16 thin rows. Only the actual bars are in `warrior_rear_slatted_cages`, classified as open lattice; closed door and hull stay in the solid audit.

Object_29/30 scalar bounds replace the generic aft-centred MILAN post with a low bearing and triangular side cradle under the same measured tube. Object_35's curved rear stowage envelope (1.399 × 0.427 × 0.443 m) is reconstructed with sparse authored elliptical stations and retaining straps. Source topology is not copied. Detailed component measurements: `fv510-detail-study-components.json` and `fv510-rear-bars-components.json` under `.qa-dev/tank-run/british-us-source/`.

Profile at full image capture: `676ccaf74a4155a5dcb1c9d3dd56fa5853a4e1b508fa06661e72bee9705f8134`. TypeScript and native HIGH/LOW construction passed, zero non-finite vertices or wheel audit issues. HIGH 24,346 stored / 63,884 expanded triangles, 40 meshes; LOW 19,514 / 55,868, 38 meshes. Retained LOW/HIGH native strict clip receipts show front/rear/sweep band and instanced-shoe penetration 0/0, no anomaly. These are not browser performance or visible tread-face certificates.

Full-source fidelity **FAIL**: aggregate 88.27, whole88.36, tracks87.86, minimum79.13/92. Dimension and floater gates both report0; no source conflict was masked or downgraded. Strict `--gate` exits on that geometry failure before native census. A separate native standard audit recorded continuity636 and MG0, then actual existing front/side open bars were moved unchanged into `warrior_hull_open_cage` with narrow open-lattice ownership. The resulting native audit remains **FAIL** at continuity425/MG0; the real stand-off gap between hull and solid side armor remains included. No complete equipment bucket or solid armor was exempted. Log `warrior-detail1-lattice-standard.log`.

The official14 report was captured at 2026-09-18T08:44:21.439Z and is archived in `warrior-detail1-official14/` with PNG hashes alongside. All14 were author-inspected. The later front/side bar ownership split preserves authored visible stock but changes its semantic grouping. The machine scores and this author check do not establish 9/10. Broad bow service-panel/tarpaulin shapes, hatch outlines, layered upper armor, actual visible tread faces and finer cradle/roll surfaces still need source-measured correction. Dynamic MILAN ownership/contact, independent rescoring and release/performance checks remain open. The no-source-MG and displaced-duplicate target choices remain pending.

## Scope and preservation

This is an independent source-backed X build. Preserve every existing vehicle, especially `fv510_milan`; reuse that donor only for initial game balance metadata, never its visual silhouette. The profile writer owns only the new profile, this packet and local ignored source studies. The integrator owns fleet registries, generated receipts, assets and publication. Original-model fingerprints and generated-record preservation remain NOT RUN until integration.

## Source and comparison contract

- Raw input: `/Users/kevinliu/Downloads/fv510_warrior_milan_war_thunder.glb`.
- SHA-256: `5bb512734139e4beaeaa3775bdc68913431a555a2d1d46f395a47a8fa0a5ea45`.
- Format / size / mesh count / triangles: GLB / 28291364 bytes / 35 / 74330.
- Provenance: owner-supplied comparison file; the filename identifies a commercial-game study. Original author/license are unverified; redistribution rights are not asserted. Source binaries, source textures and copied mesh topology are excluded from runtime and publication.
- Target: the supplied model and its visible equipment configuration. No real-vehicle dimension certification is claimed.
- Inventory: `.qa-dev/tank-run/british-us-source/fv510_milan_x-inventory.json`; connected-component bound study: `.qa-dev/tank-run/british-us-source/fv510_milan_x-components.json`.
- Canonical local oracle: `public/models/community-candidates/fv510_milan_x_source.glb`.
- Canonical SHA-256: `e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04`.
- Registration: identity signed axes [X,Y,Z], right handed, uniform scale 1, translation [0,0.005,0] m. Longitudinal and lateral source datums are unchanged. The source gun points +Z.
- Preparation: `node tools/source-x-oracle.mjs --prepare=/Users/kevinliu/Downloads/fv510_warrior_milan_war_thunder.glb --recipe=.qa-dev/tank-run/british-us-source/fv510_milan_x-recipe.json --report=.qa-dev/tank-run/british-us-source/fv510_milan_x-registration.json`, through the capture queue.
- Ground: chosen from the native track contact floor, independently of candidate geometry. Every source mesh is retained, including underbody defects.
- Authored turret yaw center: [0.175, 1.965, -0.42] m; gun pivot: [0.114, 2.23, 0.7] m; muzzle Z = 3.0793 m. These are source-study construction datums, not recovered source rig bones.
- Source ownership: generic mesh names and unrigged exports; no honest independent hull/turret/gun masks have yet been established. Use whole-source comparison.
- Diagnostic render: Blender 5.2.0 LTS, orthographic front/rear/right/left/top/quarter, source materials replaced with one neutral study material. Outputs `.qa-dev/tank-run/british-us-source/fv510_milan_x/<view>.png`. These are intake evidence, not official verdict renders.
- Official qualification: fixed registered source, stock official cameras, procedural-only high/low, seed 4242, >=92 overall and in every registered silhouette view; dimensions within 3%; independent shaded review, articulation and track gates remain required.
- Published dimensions: NOT VERIFIED. Boot-light dimensions in `britishUsSourceStudyData.ts` describe source extents/estimated body height and may not be represented as published specifications.

## Construction work order

Source-connectivity clarification: this is not a physically posed open ramp.
`Object_26` contains two disconnected 172-vertex door bodies with the same
approximately 1.130 × 1.322 × 0.103 m extent. The seated rear door occupies
[-0.565, 0.503, -2.804] to [0.564, 1.826, -2.701] m. Its displaced copy occupies
[0.078, -0.661, -0.004] to [1.208, 0.661, 0.099] m, near the vehicle origin,
roughly 2.8 m ahead of the rear seat. Its handles repeat under the same
translation. `Object_36` repeats rear circular hardware at Y < 0, Z ≈ 0 as
well. The whole source is still retained; see
`.qa-dev/tank-run/british-us-source/fv510_milan_x-underbody-components.json`.

A narrow six-wheel Warrior chassis carries wide corrugated side armor over open slat cages; the compact off-center turret retains its MILAN hatch mount, rear basket and thin RARDEN tube.

Road centers Z = −1.8483, −1.0779, −0.41275, 0.41325, 1.0787, 1.84695 m; Y = 0.3657 m, R = 0.2991 m, lane X = ±1.296 m. Front drive Z = 2.6847, Y = 0.7546, R = 0.276; rear idler Z = −2.5386, Y = 0.7681, R = 0.2252. Three bilateral return rollers at Z = −1.454, −0.003, 1.437.

The build uses first-party section lofts and KIT primitives, canonical suspension/track assembly, quality-dependent cylinder rings and wheel detail, and equipment buckets for nonarmor optics, lamps, launchers and grilles. No source positions, indices or textures are loaded by a playable build. Identity equipment: Independent closed hull stations, long corrugated add-on armor, open side/front slats, six road wheels, three return rollers, rear ramp, engine grilles, driver hatch/periscope, lamp mounts, shaped turret, rear bins and basket rails, eight smoke launchers, two hatch/sight assemblies, MILAN tube/cradle, thin main gun and whip antenna.

The source's real slat/recess air must stay open. Main armor remains continuous closed solids. Accessory seats require official close views and gun/turret articulation validation; successful parenting alone is not a seat pass. Running gear must remain one moving assembly, with road wheels, return rollers, drive wheels and one native smart-shoe course. No fake static track silhouettes are authored.

## Evidence matrix

| Gate | Status | Evidence / residual |
| --- | --- | --- |
| Raw source hash / inventory | PASS | Hash and full mesh inventory retained in ignored study report |
| Rigid source registration | PASS | Identity axes, one Y translation, no selection/omission; canonical hash above |
| Source multi-view intake | PASS | Six native source study renders inspected; not a parity verdict |
| Every registered silhouette / aggregate | FAIL | Latest aggregate 88.34; minimum 79.15; required floor 92 |
| Geometry / dimensions within 3% | FAIL | Full-source displaced-door envelope remains retained; dimension score 0, no source omission or compensation |
| Independent official 14-view critic / Gallery | PARTIAL | 14 certified shared-source-camera views captured at shots/visual-eval-fv510_milan_x; independent ≥9 per-view critic and actual Gallery review still pending |
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

Official tool: `node tools/procedural-fidelity.mjs --ids=fv510_milan_x,griffin50_x,ajax_x --check --board --neutral-board`, through the existing capture queue. Exit 1; 0/3 pass. Evidence retained at `.qa-dev/tank-run/british-us-source/fidelity-round1.json` and `fv510_milan_x-round1.png`. Registration passed with no normalization or source omissions.

| View | Score |
| --- | ---: |
| front | 78.61 |
| frontLeft | 89.44 |
| left | 91.14 |
| rearLeft | 91.93 |
| rear | 78.77 |
| rearRight | 90.65 |
| right | 90.99 |
| frontRight | 89.38 |
| top | 88.20 |

Round 2 corrections are being measured; this failed round is not a current certificate.

### Measured round 2 and source-derived metadata correction

Fidelity round 2 used the same fixed full-source registration and untouched 92 threshold. Aggregate **88.46**, minimum view **79.25**; FAIL. Exact evidence: `.qa-dev/tank-run/british-us-source/fidelity-round2.json`; masks are in `masks-round2/fv510_milan_x/`.

| View | Score |
| --- | ---: |
| front | 79.41 |
| frontLeft | 89.41 |
| left | 90.79 |
| rearLeft | 92.32 |
| rear | 79.25 |
| rearRight | 90.52 |
| right | 90.61 |
| frontRight | 89.63 |
| top | 93.32 |

All three shared strict native band/shoe runs returned zero front, rear and swept penetration after reducing authored compact-IFV shoe thickness to pad 0.034 / grouser 0.008 / web 0.026 / horn 0.08 / pin radius 0.014 m and track thickness 0.032 m. Axle stations were preserved. Lower run datum is 0.054 m. This is a native physical correction, not a static replacement track. Subsequent geometry changes must be audited again.

The round 2 continuity scan still finds 360 cells around real standoff/slat regions. The source has a MILAN launcher and no separate roof MG; the mandatory roof-gun rule conflicts with the supplied equipment target. No fake gun, fitting marker or silent exception was added. The roof antenna bracket was extended to its actual supporting plate after the round 2 yaw-90 floater finding.

Source height metadata originally conflated full antenna AABB with the gate’s body-height convention. The source-only body study gives 3.782373 m in the raw silhouette frame minus the 0.6564 m displaced-door floor offset = 3.125973 m. The rounded informational height now uses that value; it is not a published-dimension claim and was not fitted to the candidate. The integrator separately registered identical source-only camera masks plus full 3D envelopes for dimension qualification, retaining the complete source and every protrusion.

| Quality | Stored triangles | Expanded triangles | Meshes | Native construction ms |
| --- | ---: | ---: | ---: | ---: |
| high | 15680 | 55590 | 39 | 675.6 |
| low | 13380 | 50106 | 37 | 425.8 |

These are diagnostic Node construction samples, not browser frame/switch performance. All native coordinates were finite and high/low wheel-quality audits returned no issues. Low geometry reduction, draw-call budget, actual memory and rapid gallery switching still require measured qualification.

### Later shaded-detail correction

Source multi-view inspection exposed square, disconnected cage corners in the first native draft. The front cage now uses a continuous fabricated quarter arc of open bars and a source-visible central front rail. Sloped forward service covers, hinges and grab handles sit on the measured glacis plane; port rear stowage has physical chocks. Main gear remains unchanged. The roof antenna's bracket now joins the turret plate; the later geometry run reported floaters=100 (no detected failure), while the full-source dimensions remain blocked by the displaced duplicate door.

The first same-camera official board reports a front shape-principal-axis mismatch of 10.3 degrees, driven by the retained asymmetric displaced source mass. No registration pass or independent visual score is inferred from that diagnostic. Final refreshed source-fidelity, strict native and independent review remain pending.

### Exact unresolved source-real continuity regions

The last raw standard scan records 360 cells. Largest regions are X=−1.74,Z=1.61 m (73 cells), X=+1.77,Z=1.61 m (73), and X=−1.81,Z=0.39 m (36). The source top and quarter views show exterior standoff air between the native hull (about |X|=1.73 m) and the inner face of the corrugated side armor (|X|=1.91 m), interrupted by actual mounting brackets. This is not the detached-door problem and is not a hull interior cavity. Closed armor must not be mislabeled as open lattice; no solid fill or local pass exception has been introduced. Separate source-visible thin slat bars can be semantically identified as equipment if the general continuity policy is extended, but the solid standoff shell must remain armor.

The additional roof-equipment conflict is independent: the supplied turret has a MILAN launcher and no distinct roof MG. A mandatory gun census remains zero. Do not satisfy it with an unsupported weapon or false fitting marker; a target/requirement decision is still required.

### Latest full-source silhouette measurements

Report: `.qa-dev/tank-run/british-us-source/warrior-final-fidelity.json`. Aggregate **88.34**, minimum **79.15**, FAIL. Main hull/turret/gun component masks remain unavailable because source mesh partitions are not validated owners.

| View | Score |
| --- | ---: |
| front | 79.15 |
| frontLeft | 88.8 |
| left | 91.07 |
| rearLeft | 93 |
| rear | 79.26 |
| rearRight | 89.3 |
| right | 89.96 |
| frontRight | 90.12 |
| top | 93.47 |

### Current official board registration

`shots/visual-eval-fv510_milan_x/report.json` generated at 2026-09-18T07:03:32.913Z contains 14 views, `registration.mode=certified-source-world`, `sharedCamera=true`, and the canonical source hash recorded above. The rig-parity diagnostic reports **OK**. This confirms the two panels use the fixed source ruler; it is not an independent shaded-quality score. The earlier pre-fix self-framed boards are diagnostic history only.

Current authored profile SHA-256: `c98f862c51dbe1b1a0d21733faaf45b56a49474fe647f0fae5db600c761e50cf`. Independent final visual review, actual Gallery/articulation and composed release remain outstanding.

### Final native and type verification for this handoff

`npx tsc --noEmit --pretty false` passed. Plain Node 24 high/low construction produced only finite coordinates and no wheel-quality audit issues for this ID. Source: `.qa-dev/tank-run/british-us-source/native-final.json`; run log `native-final-retry.log`. The earlier attempt unnecessarily requested the unavailable tsx loader; that tooling attempt failed before construction and was rerun correctly.

| Quality | Stored triangles | Expanded triangles | Meshes | Diagnostic construction ms |
| --- | ---: | ---: | ---: | ---: |
| high | 18740 | 58650 | 39 | 534.8 |
| low | 15408 | 52134 | 37 | 452.3 |

These timings are single-process native construction samples, not measured browser draw calls, frame time, memory or gallery switch guarantees. Those release gates remain outstanding. In particular, Ajax takes about 1.2 seconds in this geometry-receipt construction path and requires a real cold/warm/switch assessment before any performance claim.

## Publication receipt

NOT PUBLISHED. No failing/unknown gate has been converted into a pass. Source binaries, local scripts, renders and ignored oracles are excluded from the eventual reviewed commit path list.

## Measured detail round 3 after main integration

The native source wheels use the shared lathed-stock primitive with independent sparse axial/radius stations from `remaining-wheel-rays.json` and `warrior-roof-wheel-study.json`. The actual steel cap is 0.08605 m from the axle plane and the web is only 0.02315 m from it, behind the 0.17175 m tire face. Two 0.1435 m tire bands preserve the approximately 0.0565 m middle air gap. The source's connected road-wheel component has no separately measured external bolt set, so this custom stock does not add generic face bolts. Native stations, radii, width, track course, suspension and existing shoe builder are unchanged.

Source Object_21 rays establish the central roof near registered Y 1.897 m and the lower asymmetric side ledges. Those receiving surfaces now replace the blanket high deck before fitting the actual aft access assembly, outside hinges and low side stowage. The former high generic cylinders and unsupported rear grilles/twin boxes are removed. The source driver cover and its tapered optical receiver now sit on the forward slope at their measured stations; the adjoining headlamp/auxiliary lamp positions follow Object_21 component envelopes. Broad forward service panel shapes still need a finer source comparison; their current receiving plane follows the corrected bow.

Object_30 has a flat surrounding turret roof near registered Y 2.389 m, above which its two polygonal hatch leaves tilt inward and forward. Independent chamfered plates, receiving collars, measured rear hinge stock and grab handles replace generic horizontal round discs. The two periscopes have separate rear receiving cases, overhanging sloped hoods and side cheeks, retaining real air below their forward projections. Source rays `warrior-launcher-seat-study.json` show the cantilever plate and shim at raw Y 2.4922..2.5083 and 2.5083..2.5166 m; that measured plate stock supports the unchanged MILAN bearing. No roof gun has been invented, and the supplied detached duplicate door remains in the raw comparison target.

The first detail2 native preflight caught an untriangulatable front end cap where the lowered side ledge reversed against the bow lower shoulder. The authored terminal ledge was corrected, preserving meaningful non-collinear corners; all eight individual station solids then triangulated. Detail2 was edited during diagnosis and its downstream captures are **diagnostic only**, not a stable qualification receipt. The complete unchanged-source verification is rerun for the immutable detail3 freeze.

Current profile SHA-256 **`f89be6dd6193cdfd891a5c7cfe4698a971d6abe321e1264256ad3ef58d15b2d6`**; private snapshot and freeze record `warrior-detail3-profile.ts` / `warrior-detail3-freeze.json`. Type/native preflight PASS, including emitted FrontSide rays on both wheel faces and both qualities. Full-source fidelity, strict standard, explicit LOW/HIGH clip receipts and fresh official14 are running for this freeze. The source duplicate-door and source-absent MG decisions remain unresolved; no exception, mask omission or publication is authorized by these changes.

## Quality-aware native shoes and stable detail 4 verification
Current profile SHA-256 `ef690131fa2d532aa9e2368a6379bdb22a2548032af9340f1819ee379af91a29`; immutable profile/freeze files `warrior-detail4-profile.ts` and `warrior-detail4-freeze.json`. The existing `buildFleetTrackShoe` now applies its quality-dependent stock sampling while preserving measured shoe dimensions, native paths, axle stations and the detail 3 body. No source object, camera or comparison threshold changes. This supersedes the earlier running status.
Type checking, finite native stock, wheel-quality checks and emitted FrontSide wheel-section rays pass in HIGH and LOW. Explicit LOW/HIGH strict track clips both pass: two bands, two instanced shoe meshes, front/rear/sweep intersections 0/0 and no anomalies.
The full standard remains **FAIL**: dimensions 0, floaters 0, 663 continuity cells and MG census 0. The measured stand-off armor air gap remains real geometry; it is not filled or declared open lattice to evade the audit. The raw displaced duplicate door remains present in comparison, and the source-absent roof MG target decision remains open.
Fresh full-source fidelity **88.06 aggregate / 88.11 whole / 87.86 tracks**, minimum **78.63**; **FAIL** against 92 per view. Whole/component masks remain available only as previously documented.
| View | Score |
| --- | ---: |
| front | 78.63 |
| frontLeft | 90.55 |
| left | 90.78 |
| rearLeft | 93.56 |
| rear | 79.90 |
| rearRight | 91.36 |
| right | 89.86 |
| frontRight | 89.53 |
| top | 88.82 |

| Quality | Stored triangles | Expanded triangles | Meshes | Native build ms |
| --- | ---: | ---: | ---: | ---: |
| high | 24672 | 66074 | 40 | 655.7 |
| low | 19312 | 39810 | 38 | 523.4 |

Matched 10 m browser census: **HIGH 62,774 / LOW 36,510 selected triangles**, **39/38 objects**, LOW **58.16%** of HIGH. The agreed 80,000 HIGH / 85 objects / 75% LOW geometry limits **PASS**. Native expanded counts above include unselected LODs and are not the budget measure. Frame timings, memory, rapid switching and gameplay remain separate release checks.
Fresh official14 at **2026-09-18T10:11:17.271Z** uses `certified-source-world`, the same canonical source hash and `sharedCamera=true`. The author actually viewed all fourteen originals in `warrior-detail4-official14/`; PNG/report hashes are in `warrior-detail4-official14-hashes.json`. This records coverage, not independent 9/10 approval.
Remaining visible defects: broad bow service covers, cable loops and vent surfaces are simplified; the source hooded periscopes, turret front/side fittings and long rear soft stowage still need closer contour correspondence. Closed low side stowage is now measured, but it does not reproduce the source soft-bag irregularity. Wheels have proven depth yet read flatter under the current shaded comparison; no arbitrary palette correction is justified. Rear and side cage topology is present, with source-real air retained.
Independent shaded approval, complete seating/weapon motion, anatomy and composed release checks remain open. **NOT PUBLISHED.** All evidence named here is below `.qa-dev/tank-run/british-us-source/`.

Shared wheel-shader correction is being integrated after this detail4 shaded capture. Preserve these images as pre-shader evidence; final shaded approval requires a new capture after that shader freezes. Geometry and explicit strict LOW/HIGH clips remain independently recorded above.

## Postshader/postfill official14 — 2026-09-18

The unchanged detail4 profile was captured at **2026-09-18T10:49:47.247Z** with
`interiorFillRecordLoaded=true`, the fixed certified source and one shared
camera. The immutable archive is
`.qa-dev/tank-run/british-us-source/fv510_milan_x-final-shaded14/`;
`identity.json` contains complete input and original image hashes. Material
SHA-256 is `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.
The author actually inspected all fourteen originals. The separately preserved
`fv510_milan_x-postshader-prefill14` images are historical diagnostics only.

The exposed measured wheels now show their dish depth. Source-specific MILAN,
stand-off side/lattice armor, roof hatches, deck field and rear door remain
visible. Non-conflicting detail still needs refinement: bow service covers,
cables and latches; periscope hood contours; the compound soft rear stowage shape;
and smaller MILAN support/receiver details. The source duplicate door below
ground and the legitimate stand-off armor air gap remain unresolved comparison
policy issues, with unchanged full-source failures. Loaded capture is not
independent 9/10 approval or a release receipt. **NOT PUBLISHED.**

Independent final-shaded follow-up is complete in
[`british-us-final-shaded-independent-review-20260918.md`](../../history/research/british-us-final-shaded-independent-review-20260918.md).
All fourteen Warrior originals were actually inspected and hash-verified;
every scoped assembled-body criterion was rated at least 9. The corrugated
panels, curved rear roll, launcher receiver and measured wheel relief survive
the frozen build. This does not waive the untouched raw-source detached-part
and stand-off-gap conflicts or convert the failing machine gate to a pass.


## Source attachment repair — 2026-09-18

The fresh gate's five native floaters were **not** the pending below-floor source door conflict. Exact gate-camera rays hit `warrior_hull_open_cage` triangles 300/301/308/309: the extra straight-side post at X±2.095, Y1.020, Z3.300, size .035×1.040×.035 m. Source `Object_27` has curved inward by that Z; its actual forward upright centers are near X−1.5454/+1.54885, Y1.25015, Z3.3252 (height .4805 m), with another pair near X−1.94235/+1.94535, Z3.1514. There is no source post at the former outer station. Removed only the unsupported Z3.300 posts, retaining the continuous authored corner bars and their existing end posts. Native full-scene rays now find air at the old station and still hit the real cage terminal. This is a source-supported removal, independent of any raw-reference exclusion.

Frozen profile SHA256: `70556fab9bfebf2959689e36b4e03f8005e9db6384bcb23955273b7120193a60`. Canonical source remains `e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04`. Native focused fixture `src/vehicles/profiles/sourceStudyAttachmentSeats.selftest.mjs` passes HIGH and LOW; TypeScript and whitespace checks pass. Fresh geometry preflight now reports **floaters 100 / zero failures across all five poses**. The full raw geometry gate remains FAIL; no score threshold, oracle selection, camera registration or pending source decision changed.

Previous final visual receipts are superseded for these changed attachments. Final filled-path costs, strict clips, bore, standard subgates and 14-view independent review must reference the regenerated-fill capture that follows this freeze. Private immutable diagnosis and preflight receipts: `.qa-dev/tank-run/british-us-source/floater-diagnosis.json`, `floater-source-components.json`, `floater-source-datums.json`, `attachment-repair-freeze.json`, and `fv510_milan_x-attachment-preflight-geometry.json`. Source observations precede the profile correction; source vertices were not copied into runtime geometry.


### Final regenerated-fill attachment verification

Fresh HIGH/LOW physical seating fixture: **PASS** after the shared actual fill/marking/anatomy/asset regeneration. Selected 10 m geometry census: HIGH **63,050 triangles / 41 objects**, LOW **36,786 triangles / 40 objects** (58.34% of HIGH); both rows explicitly report `interiorFillRecordLoaded:true`. The fixed 80,000-triangle / 85-object ceiling and LOW≤75% check pass.

Fresh official 14-view originals: `.qa-dev/tank-run/british-us-source/fv510_milan_x-attachment-final14`. Capture completed `2026-09-18T13:06:09.765Z` with the same certified source-world registration and shared source camera. `identity.json` verifies all 14 image hashes, the actual loaded fill record, and unchanged profile/core/material/loader/tool/source files before versus after capture. Author specifically inspected `hero-frontleft.png` for this attachment repair; that limited observation is not an independent all-view qualification. Independent 14-view review remains pending. Raw source-reference conflicts and failed full-source gate components remain unwaived.

Private shared cost receipt: `.qa-dev/tank-run/british-us-source/attachment-final-selected-geometry.json`; native log: `attachment-final-native.log`; capture/identity verification summary: `attachment-final-summary.json`. Root owns subsequent composed release checks and shared geometry-gate ledger writes.


## Gun cradle ownership repair — 2026-09-18

The existing rotated 460 × 390 × 520 mm mantlet block now belongs to the pitching cradle. The main barrel, attached jacket and muzzle remain on the recoil owner; the turret-owned MILAN assembly is unchanged. The source is a static study, so this is an explicit mechanical ownership correction supported by the actual receiving stock, not a claim that source animation or internal breech kinematics were recovered. No primitive dimensions, source registration, root/pivot, running gear, threshold or comparison target changed. Profile freeze: `9b885ac5a293ad1d597d2d4ecd053b866d58f5f7f41f3d41b7ca8efa7cd3bd8b`.

The source-study mount helper preserves the original barrel material object, UV projection, weathering colors and factory disposal ownership. Kurganets coaxial stock and the Ajax sight remain visible through HIGH/LOW near/far/near LOD updates; their former temporary detail wrappers are removed completely. Dark stock is never duplicated.

Verification: `src/vehicles/profiles/sourceStudyGunCradles.selftest.mjs` passes for all six corrected profiles in HIGH and LOW. It probes actual measured housing planes and full-scene first-visible surfaces at minimum, neutral and maximum legal pitch, exercises real firing recoil, confirms positive physical tube/cradle cross-section overlap, detects the former wrong parent using the real stock, checks actual dark LOD visibility and observes exactly one disposal per migrated geometry. Type checking passes. The 12 neutral before/after fingerprints retain every visible world triangle, normal, UV, weathering color and material descriptor exactly; evidence is `.qa-dev/tank-run/gun-ownership/british-six-before.json` and `british-six-after.json`. These full-scene counts include unselected LOD geometry and are not substitutes for the selected runtime cost ceiling.

Earlier capture and assembly receipts remain historical. Root-owned regeneration, final filled verification and composed release must follow this new owner split. Existing raw-source comparison/target conflicts remain unchanged and unwaived.

Rendered replay also passes for all 12 HIGH/LOW cases using preserved pre-edit profile copies and real factory materials: `.qa-dev/tank-run/gun-ownership/british-rendered-parity.json`. World-face attributes and material/shader descriptors match exactly, and an already-live untouched Leclerc control remains unchanged. This additional check exercises the rendered path rather than relying only on geometry-receipt material stand-ins.

## Rear fender and flap seating correction — 2026-09-18

The full fleet seating test exposed a real missing receiver: both earlier rear flaps had a 151.5 mm longitudinal support gap. Source-only `Object_21` calipers show a hollow fender channel with a pitched thin roof, two side webs and a rear lip. The channel spans Z −3.0879 to −2.5605 m, rises from Y .9571 to 1.1486 m, and meets the existing lower hull through its inboard web. The repair independently constructs these simple sections; it does not enlarge the main hull or fill the air above the track. Source fender bounds retain the small left/right asymmetry.

The rubber flap is corrected to the source's 558.6 × 563.0 × 31.3 mm stock, with Y .2999–.8629 m and a real 50.3 mm overlap behind the metal lip. Its rear face is seated only .5 mm inward from the source plane to prevent coplanar rubber/steel fighting. Source registration, tracks, wheels, body, cage and weapon dimensions remain unchanged. Canonical source SHA256 remains `e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04`.

Focused fixture `src/vehicles/profiles/warriorRearFenderSeating.selftest.mjs` passes HIGH and LOW: all ten guard parts have native support receipts; opposing FrontSide rays prove finite hull/web and lip/flap overlap; 32 complete-scene roof rays match independent source stations within 2 mm; the channel remains hollow; shifted-flap negative controls fail both physical contact and the unchanged seat gate. Across five scroll phases per quality, 240 conservative bounds of actual installed shoe instances, expanded by 10 mm, do not intersect any guard triangle. Flap ground clearance is 299.9 mm. These sampled native checks do not replace the final strict track audit.

Profile freeze: `68b554e888ce2dd291ea1ee922fe81da13207afbb46db473759bd50da64eab3b`; focused fixture: `1e849132a36bc50d7d895fc4ccc97fc9218b951b622fb5c0ce07628871797fd8`. Authenticated original profile is retained privately with SHA256 `1c7d129a1fd8651e421cffad8d49ab76bb25b02f8da053a86a326cb6566b6d20`. Native replay confirms unchanged raw attributes, transforms and materials outside the two changed merged hull/rubber buckets, except two HIGH derived marking transforms that the existing seat solver reseats after the hull changes; those marking attributes/materials stay exact. LOW has no other visible changes. New official marking seats, actual fills, assets and final visual/gate receipts must follow this freeze. Earlier images are historical; raw-source detached-part and stand-off-gap conflicts remain unwaived.

Private source calipers, before/after full-scene rays, focused test log and explicit per-marking differences are under `.qa-dev/tank-run/warrior-mudguard-seat/`; `freeze.json` records the exact source/profile/core/material identities. No gate threshold, oracle, source omission or camera was changed.
