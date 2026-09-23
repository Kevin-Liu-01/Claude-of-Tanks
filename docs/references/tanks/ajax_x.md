# Ajax X — source reconstruction packet

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
- ID / display name: `ajax_x` / Ajax X.
- Implementation: independent procedural reconstruction under measured iteration; shared integration is owned by the batch integrator.
- Qualification: INCOMPLETE. Current r12 fixed-source fidelity 96.12 / minimum 95.14, strict standard, explicit LOW/HIGH track clips and actual loaded geometry budget pass. Fresh postshader/postfill official14 is captured and author-reviewed; independent 9/10 approval and composed release checks remain required.
- Publication: NOT PUBLISHED. Current authority covers this requested batch; no as-is exception exists.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`; branch `codex/kurganets-odztz-generation-20260917`; base `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Candidate: uncommitted profile `src/vehicles/profiles/ajaxX.ts`.
- Next action: independently review current official14; then complete physical-seat/articulation, browser timings/memory/switching and composed release checks. Ajax has no pending detached-source target choice; other batch vehicles do.
- Known source limitations: No below-track detached source mass was identified in the inspected orthographic/quarter views. The source consists of generic unrigged mesh partitions; apparent hull/turret/gun meshes do not supply an independently validated animated hierarchy. Whole-source comparison is retained and component-mask evidence must be marked unavailable.

## Scope and preservation

This is an independent source-backed X build. Preserve every existing vehicle, especially `cv90`; reuse that donor only for initial game balance metadata, never its visual silhouette. The profile writer owns only the new profile, this packet and local ignored source studies. The integrator owns fleet registries, generated receipts, assets and publication. Original-model fingerprints and generated-record preservation remain NOT RUN until integration.

## Source and comparison contract

- Raw input: `/Users/kevinliu/Downloads/ajax_armored_warfare.glb`.
- SHA-256: `5b2759b557a9d02af059dcf0e03eb6b41bdc6e7ecb62da17c4a8f224e48581f1`.
- Format / size / mesh count / triangles: GLB / 33995256 bytes / 27 / 183371.
- Provenance: owner-supplied comparison file; the filename identifies a commercial-game study. Original author/license are unverified; redistribution rights are not asserted. Source binaries, source textures and copied mesh topology are excluded from runtime and publication.
- Target: the supplied model and its visible equipment configuration. No real-vehicle dimension certification is claimed.
- Inventory: `.qa-dev/tank-run/british-us-source/ajax_x-inventory.json`; connected-component bound study: `.qa-dev/tank-run/british-us-source/ajax_x-components.json`.
- Canonical local oracle: `public/models/community-candidates/ajax_x_source.glb`.
- Canonical SHA-256: `506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0`.
- Registration: identity signed axes [X,Y,Z], right handed, uniform scale 1, translation [0,0.001,0] m. Longitudinal and lateral source datums are unchanged. The source gun points +Z.
- Preparation: `node tools/source-x-oracle.mjs --prepare=/Users/kevinliu/Downloads/ajax_armored_warfare.glb --recipe=.qa-dev/tank-run/british-us-source/ajax_x-recipe.json --report=.qa-dev/tank-run/british-us-source/ajax_x-registration.json`, through the capture queue.
- Ground: chosen from the native track contact floor, independently of candidate geometry. Every source mesh is retained, including underbody defects.
- Authored turret yaw center: [-0.05, 2.1, -1.05] m; gun pivot: [0, 2.506, 0.67] m; muzzle Z = 3.099 m. These are source-study construction datums, not recovered source rig bones.
- Source ownership: generic mesh names and unrigged exports; no honest independent hull/turret/gun masks have yet been established. Use whole-source comparison.
- Diagnostic render: Blender 5.2.0 LTS, orthographic front/rear/right/left/top/quarter, source materials replaced with one neutral study material. Outputs `.qa-dev/tank-run/british-us-source/ajax_x/<view>.png`. These are intake evidence, not official verdict renders.
- Official qualification: fixed registered source, stock official cameras, procedural-only high/low, seed 4242, >=92 overall and in every registered silhouette view; dimensions within 3%; independent shaded review, articulation and track gates remain required.
- Published dimensions: NOT VERIFIED. Boot-light dimensions in `britishUsSourceStudyData.ts` describe source extents/estimated body height and may not be represented as published specifications.

## Construction work order

A seven-wheel scouting hull has tall uninterrupted side armor, a broad sloped bow, aft stowage projecting behind the running gear and a narrow front slat/step cage. Its low asymmetric turret carries twin smoke banks, roof gun and tall rear panoramic sight.

Road centers Z = −2.233, −1.489, −0.745, −0.001, 0.7435, 1.4875, 2.2315 m; Y = 0.391 m, R = 0.324 m, lane X = ±1.322 m. Front drive Z = 2.867, Y = 0.8655, R = 0.343; rear idler Z = −2.992, Y = 0.8305, R = 0.3235. Four bilateral return rollers behind the side armor.

The build uses first-party section lofts and KIT primitives, canonical suspension/track assembly, quality-dependent cylinder rings and wheel detail, and equipment buckets for nonarmor optics, lamps, launchers and grilles. No source positions, indices or textures are loaded by a playable build. Identity equipment: Independent closed hull with raised sponsons, native seven-wheel suspension, full tall side armor with repeated physical latches, projecting aft stowage, rear ramp, bow lamp and towing mounts, driver optics, front open slat/step frame, low turret, twin eight-tube smoke arrays, paired roof sights/hatches, a shielded panoramic rear optic and remote MG.

The source's real slat/recess air must stay open. Main armor remains continuous closed solids. Accessory seats require official close views and gun/turret articulation validation; successful parenting alone is not a seat pass. Running gear must remain one moving assembly, with road wheels, return rollers, drive wheels and one native smart-shoe course. No fake static track silhouettes are authored.

## Evidence matrix

This matrix records the pre-integration state. Passes below are historical until replaced by the fresh integrated detail-round results at the end of this packet.

| Gate | Status | Evidence / residual |
| --- | --- | --- |
| Raw source hash / inventory | PASS | Hash and full mesh inventory retained in ignored study report |
| Rigid source registration | PASS | Identity axes, one Y translation, no selection/omission; canonical hash above |
| Source multi-view intake | PASS | Six native source study renders inspected; not a parity verdict |
| Every registered silhouette / aggregate | PASS | Aggregate 94.03; minimum whole view 93.12; track component 92.04; required floor 92 |
| Geometry / dimensions within 3% | PASS | Current registered geometry minimum 93.1; dimensions 98.5; full physical source envelope retained |
| Independent official 14-view critic / Gallery | PARTIAL | 14 certified shared-source-camera views captured at shots/visual-eval-ajax_x; independent ≥9 per-view critic and actual Gallery review still pending |
| Winding / closure / negative space | PARTIAL | Strict standard continuity0 after separate actual open frame classification; full winding/articulation review still pending |
| Physical seats / yaw / pitch / recoil | NOT RUN | Canonical owner frames authored; needs actual rig verification |
| High/low gear motion / strict band+shoe / duplicate courses | PARTIAL | Latest strict native band/shoe0/0 in front, rear and sweep; both quality wheel audits pass; animated field review pending |
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

Official tool: `node tools/procedural-fidelity.mjs --ids=fv510_milan_x,griffin50_x,ajax_x --check --board --neutral-board`, through the existing capture queue. Exit 1; 0/3 pass. Evidence retained at `.qa-dev/tank-run/british-us-source/fidelity-round1.json` and `ajax_x-round1.png`. Registration passed with no normalization or source omissions.

| View | Score |
| --- | ---: |
| front | 86.74 |
| frontLeft | 91.10 |
| left | 92.00 |
| rearLeft | 92.79 |
| rear | 88.18 |
| rearRight | 92.08 |
| right | 91.42 |
| frontRight | 90.38 |
| top | 83.51 |

Round 2 corrections are being measured; this failed round is not a current certificate.

### Measured round 2 and source-derived metadata correction

Fidelity round 2 used the same fixed full-source registration and untouched 92 threshold. Aggregate **91.86**, minimum view **88.01**; FAIL. Exact evidence: `.qa-dev/tank-run/british-us-source/fidelity-round2.json`; masks are in `masks-round2/ajax_x/`.

| View | Score |
| --- | ---: |
| front | 88.01 |
| frontLeft | 92.47 |
| left | 93.36 |
| rearLeft | 93.66 |
| rear | 89.09 |
| rearRight | 93.01 |
| right | 92.96 |
| frontRight | 91.62 |
| top | 91.89 |

All three shared strict native band/shoe runs returned zero front, rear and swept penetration after reducing authored compact-IFV shoe thickness to pad 0.034 / grouser 0.008 / web 0.026 / horn 0.08 / pin radius 0.014 m and track thickness 0.032 m. Axle stations were preserved. Lower run datum is 0.054 m. This is a native physical correction, not a static replacement track. Subsequent geometry changes must be audited again.

Round 2 continuity: 90 cells limited to the intentionally open front slat/step frame; zero hull-body cavity was claimed. One real shared roof MG fitting is installed. Later iterations corrected the panoramic sight from the wrong side to source X=+0.569, Z=−2.30 m and added the actual bow fender caps. Source Object_6 bounds support that optic station and its separate wire handle.

Source height metadata originally conflated full antenna AABB with the gate’s body-height convention. The source-only body study gives 3.598188 m; no below-track displaced export was found. The rounded informational height now uses that value; it is not a published-dimension claim and was not fitted to the candidate. The integrator separately registered identical source-only camera masks plus full 3D envelopes for dimension qualification, retaining the complete source and every protrusion.

| Quality | Stored triangles | Expanded triangles | Meshes | Native construction ms |
| --- | ---: | ---: | ---: | ---: |
| high | 17964 | 64430 | 41 | 1018.6 |
| low | 15320 | 57866 | 40 | 1166.9 |

These are diagnostic Node construction samples, not browser frame/switch performance. All native coordinates were finite and high/low wheel-quality audits returned no issues. Low geometry reduction, draw-call budget, actual memory and rapid gallery switching still require measured qualification.

### Registered fidelity round 4 — silhouette pass

The actual source side armor lives at X=±1.931 m; the initial draft placed it too far outboard and left an erroneous narrow void between armor and native tracks. Source Object_12 connected bounds and the neutral rear/side source views support the corrected position and seated upper sponson. The optic head now uses its actual 0.469 m-wide case and a separate narrow wire handle instead of an oversized cap.

The registered source, cameras and thresholds were unchanged. Report: `.qa-dev/tank-run/british-us-source/fidelity-round4.json`; masks `masks-round4/ajax_x/`. Whole score 94.33; aggregate 93.90; track component 92.04; all-view minimum 92.96. Registration passed, component hull/turret/gun masks remain unavailable.

| View | Score |
| --- | ---: |
| front | 93.86 |
| frontLeft | 95.01 |
| left | 93.99 |
| rearLeft | 95.4 |
| rear | 93.87 |
| rearRight | 95.27 |
| right | 93.69 |
| frontRight | 94.9 |
| top | 92.96 |

Profile SHA-256 at this capture: `027446dbb307215da7dff305810a18ac69bc830049ec88599adf5b49c764fbf6`. Fresh native clip/continuity, official 14-view independent review, dimension, live articulation and full release/performance validation remain required. The earlier strict zero-penetration result is historical until the changed armor is re-audited.

### Shaded-detail and fidelity round 5

Source Object_28 contains the asymmetric port forward inspection cover and handle, with raw bounds X=−2.109..−1.992, Y=1.338..1.967, Z=1.375..1.763 m. The missing cover is now seated on short rails attached to the native side armor. The two outboard bow lamps also use measured source positions. These restore omitted real equipment and the physical width; the underlying hull and axle stations are unchanged.

Fixed-source round 5 aggregate **94.03**, minimum view **93.12**, track component **92.04**. PASS for registered silhouette only; no full release pass is implied. Report: `.qa-dev/tank-run/british-us-source/ajax-fidelity-round5.json`.

| View | Score |
| --- | ---: |
| front | 94.58 |
| frontLeft | 95.06 |
| left | 93.99 |
| rearLeft | 95.49 |
| rear | 94.3 |
| rearRight | 95.36 |
| right | 93.69 |
| frontRight | 94.79 |
| top | 93.12 |

The first shaded 14-view evaluator captures preceded the shared-camera correction and are diagnostic only. They are preserved in `.qa-dev/tank-run/british-us-source/visual-diagnostic-before-final/ajax_x/`. Fresh certified-source camera captures and independent review are pending.

### Narrow open-frame continuity ownership

The pre-round-7 separated lattice mesh was `ajax_bow_open_step_frame`: the three vertical bow posts at X=−0.62/0.05/0.73, Z=3.75 m; nine 1.38 m transverse bars at Y=0.77+row×0.105 m; and the two short lower support rails. It retains exactly the authored visible bars and native collision eligibility, with `combatHitboxRole: equipment` and `continuityRole: open-lattice`. The solid 0.66 m step plate, main hull, closed armor and every other equipment bucket remain in the zero-hole scan. No surface was added to fill the real air; no complete hull/detail bucket was exempted. This applies the shared explicit-lattice contract to the source-visible bow structure and requires a fresh strict standard receipt.

### Historical official board registration before main integration

`shots/visual-eval-ajax_x/report.json` generated at 2026-09-18T06:57:02.306Z contains 14 views, `registration.mode=certified-source-world`, `sharedCamera=true`, and the canonical source hash recorded above. The rig-parity diagnostic reports **OK**. This confirms the two panels use the fixed source ruler; it is not an independent shaded-quality score. The earlier pre-fix self-framed boards are diagnostic history only.

Authored profile SHA-256 at that capture: `c6915c9c9337ab6f6b90ea975e1a43f78583ac3ed8a4077b8fc8e02583f6aa62`. The Ajax subsequent lattice ownership split preserves visible geometry; the bow bars now occupy one separately classified equipment mesh. Independent final visual review, actual Gallery/articulation and composed release remain outstanding.

### Historical native and type verification before main integration

`npx tsc --noEmit --pretty false` passed. Plain Node 24 high/low construction produced only finite coordinates and no wheel-quality audit issues for this ID. Source: `.qa-dev/tank-run/british-us-source/native-final.json`; run log `native-final-retry.log`. The earlier attempt unnecessarily requested the unavailable tsx loader; that tooling attempt failed before construction and was rerun correctly.

| Quality | Stored triangles | Expanded triangles | Meshes | Diagnostic construction ms |
| --- | ---: | ---: | ---: | ---: |
| high | 19018 | 65484 | 42 | 1239.7 |
| low | 16310 | 58856 | 41 | 1174.9 |

These timings are single-process native construction samples, not measured browser draw calls, frame time, memory or gallery switch guarantees. Those release gates remain outstanding. In particular, Ajax takes about 1.2 seconds in this geometry-receipt construction path and requires a real cold/warm/switch assessment before any performance claim.

Post-lattice strict standard **PASS**: gate minimum93.1/92; dimensions98.5; floaters100; native band/shoe front, rear and sweep0/0; continuity0; one real roof MG. Exact log `.qa-dev/tank-run/british-us-source/ajax-standard-final.log`. The generic machine pass does not replace independent 14-view shaded review or the complete composed release.

### Source-measured shaded correction after main integration

Main integration at `3f6fc4ad8` brings updated shared X running gear; earlier running-gear receipts cannot qualify the integrated build. The profile retains its source axle stations and canonical assembly rather than countertuning the new shared behavior to old screenshots.

The independent report `docs/history/research/regional-source-independent-critic-20260918.md` rejected the prior Ajax's substantive detail at 6–7.5/10 across all 14 views. A passing silhouette did not resolve those findings. That official image set is retained at `.qa-dev/tank-run/british-us-source/ajax-pre-detail-official14/`, including its PNG hashes.

The bounded correction uses connected-component scalar bounds from `.qa-dev/tank-run/british-us-source/ajax_x-detail-study-components.json`, not source vertices or topology in runtime geometry:

- Object_27 roof hatch groups span X −0.840..−0.005 and +0.144..+1.060, Z −1.945..−1.135 m. Broad chamfered plates replace the round discs, with separate rear hinges, forward latches and open handles. Both are seated on the measured turret roof.
- Object_10 bow equipment includes raised bracket members spanning X −0.980..−0.150, Y 1.630..1.874, Z 2.137..2.615 m. Two port service panels use measured envelopes X −1.561..−1.000 / −0.953..+0.163 and Z 0.316..1.858 / 0.798..1.674 m. They split at the actual deck/glacis break to keep each surface seated; central bow housing, open handles and cap rows retain the asymmetric source layout. Object_16's driver-hatch scalar envelope, X 0.334..1.086 and Z 0.737..1.542 m, replaces the forward round cover. It slopes into the front deck, and its periscope/handle remain separate equipment.
- Object_10's port aft box spans X −1.980..−0.553, Y 1.343..2.119 and Z −4.269..−3.287 m. The starboard module has separately measured inner/outer walls, upper vent cassette, recessed lower step space and top service hatch. The cassette and step contact both walls; no blanket solid fills the lower access air. The central rear ramp now has an offset chamfered small door, hinges and handle instead of one plain rectangle.
- The Object_16 main roof datum is 2.10 m. Roof grilles, small deck caps and rear access cover were reseated to it. The real bow slat-frame mesh and its narrow continuity classification are retained.

Frozen profile SHA-256 for this round: `df4af9a72d19743a066e8e8b6e7c0fabb3c1030ffe0efe928ad35eb2bd499ec2`; freeze record `.qa-dev/tank-run/british-us-source/ajax-detail-freeze.json`. Raw/canonical source hashes, source registration, cameras and acceptance floors are unchanged. Fresh type/native and fixed-source fidelity have passed; strict standard also passes; complete official 14-view capture and explicit strict LOW/HIGH band/shoe checks subsequently passed. Neither this edit nor the machine scores implies an independent 9/10 shaded pass.

### Integrated detail round 6 results — now historical during round 7

- Fixed source fidelity: **PASS**, aggregate 95.35, whole 95.60, track component 94.24, minimum registered view 94.30. Required floor remains 92; registration passed with normalization disabled. Report `.qa-dev/tank-run/british-us-source/ajax-detail-fidelity.json`.
- Geometry: **PASS**, minimum 94.3/92, dimensions 98.5, floaters 100. Exact log `ajax-detail-standard.log`. Strict standard also passes: HIGH native band/shoe front, rear and sweep 0/0, continuity 0, one actual roof MG. Explicit independent LOW/HIGH rechecks are pending.
- TypeScript no-emit compilation: **PASS**. The first invocation referenced a missing package `bin/tsc` entry and did not compile; the successful retry used the installed `typescript/lib/tsc.js`. Log `ajax-detail-precheck-retry.log`.
- Native HIGH/LOW: all coordinates finite, zero wheel-quality audit issues; seven canonical road-wheel stations. HIGH 23,242 stored / 69,336 expanded triangles, 42 meshes, diagnostic construction 2,584 ms. LOW 20,374 / 62,548 triangles, 40 meshes, 2,072 ms. These single Node geometry-receipt timings include changed shared gear and do not certify browser rendering or switch performance. Report `ajax-native-detail.json`.

| Registered view | Score |
| --- | ---: |
| front | 95.50 |
| frontLeft | 95.93 |
| left | 94.74 |
| rearLeft | 96.42 |
| rear | 94.30 |
| rearRight | 95.81 |
| right | 94.41 |
| frontRight | 95.80 |
| top | 97.51 |

Author inspection of the new neutral board confirms the bounded corrections but does **not** establish 9/10 shaded identity. The mantlet/root shroud, compound turret roof shape, turret-side fittings and wheel-face relief remain visibly simplified. The next source-measured mantlet study should begin with Object_14: full bounds X −0.240..+0.430, Y 2.273..2.785, Z −0.299..+1.024 m. Those full mesh bounds are an intake envelope, not a permission to copy topology or treat its entire partition as a validated gun mask. Preserve recoil/pitch ownership and the unchanged source frame when correcting it. Independent final critic, actual articulation/contact tests and browser performance remain open.

Round 6 completed: official 14-view report generated 2026-09-18T07:56:49.123Z, certified-source-world registration, sharedCamera true, rig parity OK. All images and the report are preserved under `.qa-dev/tank-run/british-us-source/ajax-detail-round6-official14/`; PNG hashes in `ajax-detail-official14-hashes.json`. Explicit LOW and HIGH native exact strict audits both report front/rear/sweep band and shoe 0/0, native bands and instanced shoes, no anomaly or blind spot. Receipts `ajax-detail-track-low/` and `ajax-detail-track-high/`. These successful machine checks are not an independent 9/10 shaded verdict.

Round 7 now corrects the remaining source-visible mantlet/roof/fittings and wheel stock. Its changed geometry invalidates round 6 for final release. Object_25 radial ray measurements in `ajax-mechanics-study.json` establish steel-web axial depth 0.0475 m versus tire face about 0.170 m, with central cap 0.1687 m. Native measured core and paired tire bands preserve the real recess and air between tires; axle stations and track recipe remain unchanged. Fresh evidence is required after this next freeze.

Additional round 7 source measurements: Object_14 vertical rays establish the compound mantlet top at Y 2.78 m near Z −0.15, falling toward 2.694 at Z +0.15, then an asymmetric front shroud to Z +0.884. Object_27 rays establish the main roof datum near Y 2.695. The support cheeks, roof fittings and real centre mast were reseated to those surfaces. Measured source case/actuator bounds replace a generic mirrored turret-side box pair.

Object_28 frame measurements also revealed the old cage supports ended below the closed hull. The corrected open grid has a common plane Z 3.595, a short port pane Y 0.989..1.747, taller starboard pane Y 0.627..1.747, staggered thin slats and the small X 0.352..0.646 projecting footstep. Three diagonal stays now enter the actual bow at Y 1.076 / Z 3.17 and join the frame at Y 1.726 / Z 3.565. Only the physical open bars remain lattice-classified; the solid footplate retains ordinary continuity ownership. Round 6 image and continuity evidence is preserved; this correction requires fresh review.

Round 7 intermediate fidelity passed: aggregate 95.43, minimum 94.39, tracks 94.25 (`ajax-round7-fidelity.json`); this predates the bow frame, smoke-bank and LOW-cost follow-up and is not the current certificate. Its first detailed wheel core increased expanded geometry to 104,114 HIGH / 84,542 LOW, so LOW was revised to retain the deep web and tire gap with fewer radial section stations and simpler fasteners. This preserves the measured physical recess instead of replacing it with a capped disc.

Round 8 freezes the combined correction at profile SHA `3ea461c96ae4af4245a8bc9e4cc3ff398f6783e53d8d0af1fa3bf1324ab77972` on integrated main `3f6fc4ad8`. It also uses Object_26's measured staggered 2×4 smoke rows: port faces begin near Y 2.554 m and starboard near 2.416 m, with different X/Z positions. The previous mirrored generic smoke bank had the port nozzles too low. Both banks now terminate in supported backing structures. The shared roof MG remains the same weapon; its fork was lowered to the source gun's measured envelope instead of protruding above it.

Round 8 type/native and fixed-source fidelity passed. Aggregate **95.95**, whole **96.07**, track component **95.44**, minimum registered view **94.91**; all nine registered views exceed 92. Dimensions 100, floaters 100. Exact reports/logs use the `ajax-round8-*` prefix under the private evidence directory. HIGH uses 28,420 stored / 105,090 expanded triangles across 42 meshes; LOW 23,232 / 75,390 across 40 meshes. Native diagnostic times were 1,790 / 1,581 ms, respectively; these are not browser performance claims. FrontSide rays on the emitted core confirm the measured 0.1687 m hub and 0.0475 m recessed web on both faces and both quality levels, with no non-finite vertices or wheel audit issues.

Round 8 strict standard is **FAIL**, with three bow continuity cells at X ±1.36 / Z 3.37. Its HIGH native band/shoe scans are 0/0 in front, rear and sweep. The independently retained explicit LOW and HIGH clip receipts also have all zones 0/0, native bands and instanced shoes, no error/anomaly. The complete 14-view report was captured at 2026-09-18T08:28:06.712Z with certified-source-world/shared-camera registration; exact images/report are archived in `ajax-round8-official14/`, PNG hashes in `ajax-round8-official14-hashes.json`. All 14 were inspected by the author; no independent 9/10 score is asserted.

The remaining continuity cells came from the initial generic horizontal bow towing rings, not the real open frame. Source Object_10 has two vertical YZ eye components, X +1.000..1.079 / −1.079..−1.000, Y 1.200..1.418, Z 3.063..3.313 m. Round 9 uses those scalar extents to place upright eyes under the sloped bow, without exempting the eyes, deleting real air or filling a false connector.

### Round 9 source-visible correction

The round 8 views showed that the initial narrow panoramic pedestal and paired generic sight/rear boxes still misrepresented this specific fit. Sparse directional rays through Object_27 (`ajax-final-detail-rays.json`) establish a broad rear-flat panoramic tower: aft Z −2.692, port X +0.1346, outer starboard X +1.002, forward cap near Z −1.863, top Y 3.200 m. A closed authored station solid replaces the narrow cylinder and seats into the turret. Object_6 establishes the separately overhanging sight hood, lower lens and side cheeks; its entire bounding box is not treated as solid stock. The source has one low port sight, rather than the old mirrored forward screen pair. The generic paired rear boxes have also been removed. A central service plate now reaches the measured Y 2.8205 m datum, with the short measured antenna fittings retained separately from the one centre mast.

Frozen round 9 profile SHA `68826338d24b792dbce2329a6f6e9d56cdc7792e7b900118feb9182a568917fb`; source hashes, registration, native running gear and camera floors unchanged. Type/native, fixed-source fidelity, strict standard, full14 and explicit strict LOW/HIGH rechecks completed. Fidelity aggregate **96.11**, whole **96.42**, tracks **94.71**, minimum **95.25**; required floor 92. All views: front95.80, frontLeft96.45, left96.05, rearLeft97.05, rear95.25, rearRight96.60, right95.76, frontRight96.88, top97.95. Geometry dimensions100/floaters100. Strict standard **PASS**: continuity0, one roof MG, native band/shoe front/rear/sweep0/0; explicit LOW/HIGH receipts independently retain those zero counts with no errors/anomalies. HIGH 28,674 stored / 105,344 expanded triangles, 42 meshes. LOW counts/timings and both-face measured wheel rays are retained in `ajax-native-round9.json`.

The official14 report at 2026-09-18T08:37:53.292Z has certified-source-world/sharedCamera registration and rig parity OK. Images/report are archived in `ajax-round9-official14/`, with `ajax-round9-official14-hashes.json`. All 14 were author-inspected; independent rescoring has been requested and no 9/10 verdict is invented. Final independent review, live finite contact/articulation, composed anatomy/release and browser performance remain open. The front/rear shaded track wrap appeared much darker than the source and was escalated. The shared-gear owner subsequently verified actual moving HIGH/LOW FrontSide ray hits on that stock and traced the weak appearance to double material/instance tint, not holes or reversed winding. The shared appearance correction uses a white material base for explicitly instance-colored native shoes while preserving their palette and buffers. Native HIGH/LOW probes confirm the tint correction without geometry/palette/matrix changes, but the first browser diagnostic remained byte-identical to round 9; the shared draw-path investigation is still open. All round 9 shaded images therefore remain historical until the visible rendering fix is verified and recaptured. Binary silhouette and zero-penetration evidence remain applicable; this profile's track geometry was not retuned.

### Shared shoe appearance correction — fresh full14

The shared material investigation found both double albedo tint and `vertexColors=true` on shoe geometry without a vertex-color attribute. Native instance colors remain enabled independently; the corrected material restores visible gray stock. The evaluator also now clears retained instance colors in its white-mask pass, avoiding black-shoe mask omissions. Source hashes, frozen camera, model geometry and the prior independent fidelity tool remain unchanged.

Fresh official14 captured **2026-09-18T09:24:46.647Z**, archive `.qa-dev/tank-run/british-us-source/ajax-shoe-fix-official14/`, exact hashes in `ajax-shoe-fix-official14-hashes.json`; profile remains `68826338d24b792dbce2329a6f6e9d56cdc7792e7b900118feb9182a568917fb`. Certified-source-world registration, sharedCamera true and rig verdict OK. All 14 images were author-inspected and sent for independent re-review. Gray track stock is now visible. Wheel faces still read paler/flatter than the neutral source in side and close-front views despite verified emitted deep sections; no geometry or palette countertuning was applied. Native code inspection found no far-wheel replacement of the measured core. Material/lighting contribution and the independent final detail score remain unresolved; this is not a new geometric-hole claim or an invented 9/10 pass.

## Publication receipt

NOT PUBLISHED. No failing/unknown gate has been converted into a pass. Source binaries, local scripts, renders and ignored oracles are excluded from the eventual reviewed commit path list.


### Round 10 — actual smoke receiver and axis correction

Independent review found the +X outboard smoke caps buried inside the generic backing plate. Source Object_27 has two small inclined receiver brackets per bank and individually angled sockets; it does not have that blanket vertical face. Sparse component envelope/principal-axis measurements are retained in `.qa-dev/tank-run/british-us-source/ajax-smoke-receivers-study.json`. The independent primitives now use those bracket widths, angles and receiving supports. The measured cap centres remain unchanged. Four alternating axis families per bank replace the old common tube direction; the +X outer column is nearly lateral on alternate rows. Source registration, all source meshes and comparison thresholds remain unchanged.

Frozen profile SHA-256 **`0fa58d0ca96b9c9b3bc78532cb87815e9fbc2d1345cc2165572da630c00db332`**. Type check and native HIGH/LOW pass. FrontSide rays through the actual emitted complete tank reach all **16 cap faces at +0.0075 m** along their axes in both qualities; none is buried by another surface. Native wheel rays still hit the unchanged ±0.1687 m cap and ±0.0475 m web. All positions are finite and wheel-quality issues remain empty.

Fixed-source fidelity **PASS**: aggregate **96.12**, whole **96.44**, tracks **94.71**, minimum **95.14** against 92. Views: front95.80; frontLeft96.52; left96.08; rearLeft97.06; rear95.14; rearRight96.61; right95.83; frontRight96.95; top97.95. Dimensions100 / floaters100. Strict standard **PASS**: continuity0, one roof MG, native band/shoe front/rear/sweep0/0. Explicit LOW/HIGH retained receipts independently confirm both native bands, 344 shoe instances, all three zones0/0 and anomaly null.

| Quality | Stored triangles | Expanded triangles | Meshes | Native construction ms |
| --- | ---: | ---: | ---: | ---: |
| HIGH | 29770 | 106440 | 42 | 1781.1 |
| LOW | 24094 | 76252 | 40 | 2228.0 |

These are all-LOD Node diagnostic counts, not the required matched 10 m selected-browser census. The fixed IFV budget is 80,000 HIGH selected triangles / 85 objects and LOW at most 75% of HIGH. No browser performance claim follows from the table.

Fresh official14 captured at **2026-09-18T09:42:27.951Z**. Archive `.qa-dev/tank-run/british-us-source/ajax-round10-official14/`, exact PNG/report hashes in `ajax-round10-official14-hashes.json`. All 14 actual images were author-inspected: both smoke columns visibly project in the front, close-roof and quarter views. Certified-source-world registration, sharedCamera true and rig verdict OK. The independent critic has the frozen set for re-review; no 9/10 score is asserted here.

The shared additional-wheel-layer rest-matrix fix was saved at 09:41:22.249762Z, before the 09:42:19Z capture start. Core SHA `67a40ec52a080e72107cfbf10d9b99f52fd98599c3612a816974840b74c27b3c`; appearance SHA `d16d224a4b17d8a2ef0c24e92049202fd25237cfdcb983b803bfd6f9335a7746`; evaluator-page SHA `fdafc503fd38c1c437dcaf1470fbd403d0275d2ba7a2761da707cdc60c10030e`. These are recorded in `ajax-round10-shared-current-hashes.json`; the integrator confirmed the core timing. It corrects initial instance bounding-sphere availability and changes no authored wheel stock, placement or material.

Remaining gates are independent visual qualification, live finite contact/articulation, matched browser performance, anatomy and composed release. Publication remains **NOT PUBLISHED**.

## Round 11 measured receiver stock and running-gear budget

Current profile SHA-256 `b766e5d3aba391b734512a4f30546f71a39c573283bf3a879241c9399b797ce5`; immutable local snapshot/freeze `ajax-round11-profile.ts` / `ajax-round11-freeze.json`. Full raw/canonical source, rigid transform, source-only cameras, measured wheel stations, track path and 92 per-view floor remain unchanged.

The independent critic's rounded gun-mount shoulder finding was measured with downward and transverse source rays (`ajax-shoulder-study.json`, `ajax-shoulder-cross-study.json`). The upper profile fits radius 0.293970 m about raw (Z −0.100837, Y 2.529740); the starboard lower outer ledge has a distinct 0.237507 m radius about raw (Z −0.100394, Y 2.531154). The +0.001 m source datum applies once. Three fixed receiving solids with the measured taper and rolling arc replace the sharp three-station cheeks. The moving shroud, gun datum and existing smoke-cap stations remain unchanged. All six emitted shoulder rays agree with source within 1.4 mm HIGH and 3.9 mm LOW.

The wheel-stock section retains every HIGH axial/radius station, sampled at 20 angular sectors (maximum outer-steel chord error 3.3 mm), and the buried centre connector uses 12 sectors. Source Object_25 connected-component inventory shows 12 web and six hub bolt heads on the outward face, with no matching small heads on the inner face. The former duplicated inner heads are removed; two side-filtered native wheel layers each carry seven instances and all 18 measured outward heads. The same tire-rubber inset material is retained. Both qualities hit the emitted outward web-head end at axial 0.0724 m and retain the measured hub/web section depths. The existing quality-aware fleet shoe builder replaces the quality-insensitive shoe stock with identical measured dimensions and path.

Type checking and native finite/wheel-quality checks PASS. All 16 actual smoke caps remain exposed; measured wheel depth, side-filtered hardware and six receiving-shoulder FrontSide rays PASS in HIGH and LOW. The first private shoulder diagnostic incorrectly copied an invisible authored shadow proxy into a physical ray mesh, thereby removing its no-op raycast. Its false-positive preflight is preserved under `shadow-proxy-diagnostic-*`; inspection now excludes explicitly tagged `shadowOnly` / `authoredShadowProxy` helpers. No visible source or candidate solid was excluded or changed to address that diagnostic.

Strict full standard PASS: minimum 95.14/92, dimensions 100, floaters 100, continuity 0, MG census 1, band/shoe front/rear/sweep intersections 0/0. Separate explicit LOW and HIGH track audits PASS with two native bands, 344 shoe instances and no anomalies. Full-source fidelity PASS: aggregate **96.12**, whole **96.44**, tracks **94.70**, minimum **95.14**.

| View | Score |
| --- | ---: |
| front | 95.80 |
| frontLeft | 96.50 |
| left | 96.12 |
| rearLeft | 97.08 |
| rear | 95.14 |
| rearRight | 96.59 |
| right | 95.87 |
| frontRight | 96.96 |
| top | 97.95 |

| Quality | Stored triangles | Expanded triangles | Meshes | Native build ms |
| --- | ---: | ---: | ---: | ---: |
| high | 29422 | 83604 | 43 | 2093.1 |
| low | 24114 | 51720 | 41 | 1821.8 |

The matched 10 m selected browser census is **79,820 HIGH / 47,936 LOW triangles**, **42/41 objects**, LOW **60.05%** of HIGH. This passes the fixed IFV geometry limits of 80,000 HIGH / 85 objects / LOW at most 75%. The all-LOD native counts and native construction timings above are separate diagnostics, not frame-time, memory or switching approval. Final selected receipt: `ajax-round11-selected-geometry.json`.

No r11 official14 was captured while the integrator corrects the shared wheel-dish shader. The prior r10 set is preserved and is not final evidence for r11 or the coming appearance change. Fresh shaded coverage, independent every-view 9/10, complete live articulation/physical seating, browser timing/memory/switching, anatomy and composed release remain open. **NOT PUBLISHED.** Evidence prefix `.qa-dev/tank-run/british-us-source/ajax-round11-*`.

## r12 loaded-cost correction and final shaded archive — 2026-09-18

Profile SHA-256 `ccd2e08e83d3c2694fdfee8ea40b20222ecf607adf4841a6dc9ba854e7dcf4cc`.
The loaded interior fills exposed a 12-triangle overrun: r11 was actually
80,012 selected HIGH triangles. Only the wholly buried central wheel axle bridge
(radius 0.090 m, axial ±0.040 m) changes from twelve to eight sectors. Both
visible measured dish surfaces, all HIGH axial stations, tire dimensions,
fastener counts, suspension paths and physical wheel faces remain unchanged.
The reduction saves 224 expanded triangles across fourteen road wheels.

Actual loaded matched-10 m census now passes at **HIGH 79,788 / LOW 47,904**
triangles, **44 / 43 objects**, LOW **60.04%** of HIGH. Type checking, native
finite/wheel/smoke/shoulder rays, strict standard and explicit LOW/HIGH track
clips all pass. Native tests explicitly preload Ajax interior fills. Fixed-source
fidelity remains **96.12 / minimum 95.14**, with `interiorFillRecordLoaded=true`.
Per-view scores: front 95.80, front-left 96.51, left 96.13, rear-left 97.08,
rear 95.14, rear-right 96.59, right 95.87, front-right 96.96 and top 97.95.
Receipts are `.qa-dev/tank-run/british-us-source/ajax-round12-*` and
`ajax-native-round12.json`.

Fresh official14 at **2026-09-18T10:55:07.680Z** is archived in
`.qa-dev/tank-run/british-us-source/ajax_x-final-shaded14/`. Its report explicitly
loads interior fills, uses the certified source hash and one shared camera.
`identity.json` preserves the profile, source, fill, core, material and tool
hashes before/after capture plus all original PNG hashes. The material hash is
`3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.
The author inspected all fourteen actual images; the rolled shoulders,
source smoke projections, polygonal hatches, bow service panels, rear recesses
and measured wheels are present. The author does not substitute this coverage
for independent 9/10 approval. Remaining timing/memory/switching, gameplay,
anatomy and composed release gates stay open. **NOT PUBLISHED.**

Independent r12 follow-up is complete:
[`ajax-r12-independent-review-20260918.md`](../../history/research/ajax-r12-independent-review-20260918.md).
The independent reviewer actually opened all fourteen current originals,
verified their hashes and rated each source-fit, substantive-detail and static
seating criterion at 9. The earlier wheel/shoulder/smoke findings are resolved.
This scoped visual pass supplements the recorded native/fidelity/track/cost
passes; composed performance, anatomy and publication remain integration gates.


## Gun cradle ownership repair — 2026-09-18

The measured Object_14 compound shroud and its offset dark sight now belong to the pitching cradle. The tube and barrel-attached collars remain on the recoil owner; rounded outer receiving shoulders remain on the turret. The source is a static study, so this is an explicit mechanical ownership correction supported by the actual receiving stock, not a claim that source animation or internal breech kinematics were recovered. No primitive dimensions, source registration, root/pivot, running gear, threshold or comparison target changed. Profile freeze: `6f151bda9e38308982344fbb905f06198e19edea1d887a4dfc9f2682ceff1f99`.

The source-study mount helper preserves the original barrel material object, UV projection, weathering colors and factory disposal ownership. Kurganets coaxial stock and the Ajax sight remain visible through HIGH/LOW near/far/near LOD updates; their former temporary detail wrappers are removed completely. Dark stock is never duplicated.

Verification: `src/vehicles/profiles/sourceStudyGunCradles.selftest.mjs` passes for all six corrected profiles in HIGH and LOW. It probes actual measured housing planes and full-scene first-visible surfaces at minimum, neutral and maximum legal pitch, exercises real firing recoil, confirms positive physical tube/cradle cross-section overlap, detects the former wrong parent using the real stock, checks actual dark LOD visibility and observes exactly one disposal per migrated geometry. Type checking passes. The 12 neutral before/after fingerprints retain every visible world triangle, normal, UV, weathering color and material descriptor exactly; evidence is `.qa-dev/tank-run/gun-ownership/british-six-before.json` and `british-six-after.json`. These full-scene counts include unselected LOD geometry and are not substitutes for the selected runtime cost ceiling.

Earlier capture and assembly receipts remain historical. Root-owned regeneration, final filled verification and composed release must follow this new owner split. Existing raw-source comparison/target conflicts remain unchanged and unwaived.

Rendered replay also passes for all 12 HIGH/LOW cases using preserved pre-edit profile copies and real factory materials: `.qa-dev/tank-run/gun-ownership/british-rendered-parity.json`. World-face attributes and material/shader descriptors match exactly, and an already-live untouched Leclerc control remains unchanged. This additional check exercises the rendered path rather than relying only on geometry-receipt material stand-ins.
