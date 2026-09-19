# Type 96B X — source-study run packet

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Historical author checkpoint

- Updated: 2026-09-18.
- Owner request: apply the established OP/source-X procedure to the supplied file and commit/push qualified work to origin/main.
- ID: `type96b_x`; display name: Type 96B X.
- Implementation: independent first-party draft profile authored; integration owned by the parent task.
- Qualification: **INCOMPLETE**. Current r4 registered source silhouette **PASS** at 96.34 aggregate / 95.62 worst view. The latest independent shaded review (r3) remains **FAIL**, minimum 8/10; r4's fresh fourteen-view review and remaining physical/performance/release gates are pending.
- Publication: **NOT PUBLISHED**; user requested publication only through the current procedure.
- Worktree: `cot-kurganets-odztz-20260917`; branch `codex/kurganets-odztz-generation-20260917`; baseline `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Candidate: uncommitted `src/vehicles/profiles/type96bX.ts`; geometry-dependent receipts remain pending.
- Next action: independently review the frozen r4 official fourteen views, then complete outstanding moving physical, browser performance, anatomy and composed release gates. Source-absent roof-MG policy remains pending.
- Known limitation: Supplied roof has cupolas, sights and antenna but no roof machine gun; do not invent a gun to satisfy a census.

## Scope and preservation

Independent X construction. The existing type99a profile is a protected gameplay-metadata peer only; its visual builder is never called by this profile. Shared fittings are geometric vocabulary; every new primary shell is independently authored. Original playables and their assets must be preserved. Source GLBs, neutral renders and conversion reports stay ignored.

Owned files are `src/vehicles/profiles/type96bX.ts`, the primitive-only `easternSourceKit.ts`, the boot-light `easternSourceStudyData.ts` contract and this packet. Parent task owns shared registries, collision metadata, generated receipts and release.

## Source and comparison contract

- Raw path: `/Users/kevinliu/Downloads/type_96b_armored_warfare.glb`.
- Raw format: GLB; 24,345,668 bytes.
- Raw SHA-256: `4abe3113a6919c78d56f9dfb8f8841bd22cc40a33283925c768bbcd3ee5fc8f0`.
- Input is owner-supplied; its filename identifies an Armored Warfare reference. Embedded Sketchfab-style hierarchy is provenance evidence only, not redistribution permission. Exact original author/license/source page are **unknown**. Study authorization does not authorize shipping this geometry or textures.
- Source contains 22 generic, material-based mesh groups. Ownership is not a reliable hull/turret/gun hierarchy, so whole-source fidelity is authoritative and component masks must remain disabled. No components are omitted.
- Source raw XYZ bounds: min `[-1.7227,-0.0042,-3.4824]`, max `[1.7227,5.264353,6.52211]`.
- Canonical input: ignored `public/models/community-candidates/type96b_x_source.glb`.
- Canonical SHA-256: `ac66370796b83d2d63755390ffdbcaa503d9dbc15726630205c4e44a2765b1ed`.
- Frozen transform: axes `[x,y,z]`, right-handed, uniform scale `1`, translation `[0,0.0042,0]` metres. +Z bow and +Y up verified in source front/side/top views before candidate construction.
- Source body ground uses actual lower track stock. Any detached source objects below track ground remain present in the raw and canonical oracle; they do not cause the playable hull to float. This is a source-defect disclosure, not a gate waiver.
- Frame datums (world metres): yaw center `[0,1.6,-0.15]`; weapon pivot `[0,1.8602,1.6]`; leading launch/muzzle plane Z `6.52211`. These are measured/inferred from source ring, gun or launcher and neutral views; no source articulation hierarchy exists.
- Oracle recipe/report: ignored `.qa-dev/tank-run/eastern-source/type96b_x-recipe.json` and `type96b_x-registration.json`, prepared with `node tools/source-x-oracle.mjs` under the capture queue.
- Source study tool: Blender 5.2.0 LTS, neutral material, 1050×750 orthographic front/side/rear/top/front-quarter/rear-quarter. These six diagnostics are not the official fourteen-view certification.
- Official comparison contract: `qualityBar: exemplar`, seed 4242, matched native source/world framing, aggregate ≥92 and every registered silhouette ≥92, every applicable geometry component ≥92, dimensions within 3%, independent critic ≥9/10 per required view.
- Published real-world dimensions have not been verified; supplied source proportions are the visual target. Do not present source measurements as independently verified manufacturer data.

## Construction work order

A low tracked hull and six small dished wheels support a broad wedge-front turret, open shoulder bins, a long level smoothbore and one tall rear whip.

- Primary shell uses manually authored closed station solids with the source's gross shoulders, bow/rear rake and roof datums; no source vertices, topology, texture or source loader enters runtime.
- Source dimensions: hull 7.0473 m; complete length 10.00451 m; width 3.4454 m; rigid equipment height 3.0152 m; silhouette including whip 5.26855 m.
- Six source-measured road-wheel stations per side; the scalar component-bounds study is `.qa-dev/tank-run/eastern-source/road-wheel-scalar-measurements.json`. Wheel radii/axles are not moved to force track clearance.
- One suspension-owned assembly via `KIT.buildRunningGear`, bilateral physical return rollers, paired end wheels and one moving shoe course. Track family `soviet-single-pin`, wheel family `pressed-six`, track lane width 0.569 m.
- Gear thickness, exact stock/shoe clearance, live suspension motion and HIGH/LOW segment reduction are **NOT YET QUALIFIED**.
- Hull/turret painted structural stock use armor materials; cameras use glass and recessed dark bezels; tire, muzzle and mechanical details remain neutral. Thin painted fittings use equipment ownership.
- No ERA is authored in this draft; permanent structural armor must not disappear under spent-state handling inherited from a balance peer.
- Weapon: 125 mm smoothbore. The parent integrator must adapt caliber, shell selection, guided mode if applicable and damageable module locations; inheriting the donor gun unchanged is not acceptance.
- Fixed class geometry budgets and matched 10 m HIGH/LOW selected counts are recorded in r4 below. Cold/warm/rapid browser switching and resource/memory gates remain open.

## Evidence matrix

| Gate | Status | Evidence / residual |
| --- | --- | --- |
| Raw source identity / registration integrity | PASS | Raw hash verified by source-x-oracle; frozen rigid transform; complete mesh set retained |
| Front/side/rear/top source inspection | PASS | Six source-only diagnostic PNGs manually inspected; not an official candidate review |
| Registered silhouettes / geometry / dimensions | SILHOUETTE PASS; full qualification remains open | Read the latest round below; source/frame unchanged |
| Independent fourteen-view critic / Gallery | PRIOR ROUND FAIL; latest review pending | Prior r3 independent review failed at 8/10; r4 requires a fresh every-view review |
| Native winding / closure / negative-space rays | PARTIAL | Focused HIGH/LOW physical opening and seating tests pass; full native gate remains open |
| Yaw / gun pitch / recoil / attachment contact | NOT RUN | Canonical owner groups authored; posed capture pending |
| HIGH/LOW gear motion / strict band+shoe audit | STATIONARY PASS; motion not run | Latest r4 HIGH/LOW front/rear/sweep band and shoe stock hits are zero; source axles retained |
| Return rollers / track gauge / lower chassis | NOT RUN | Draft assembly needs native inspection |
| Stored/rendered triangles / switching / memory | PARTIAL; not certified | r4 matched 10 m selected geometry passes fixed budgets; browser switching and memory remain open |
| Weapon / armor rays / crew / modules / ERA | NOT RUN | Parent integration required |
| Original-model and asset preservation | NOT RUN | Builders never invoke or mutate original visual profiles |
| Anatomy / generated assets / centering | NOT RUN | Parent integration required |
| Composed release / full tests / builds / attribution | NOT RUN | No publication authorized by partial checks |

## Round log

2026-09-17 source intake: hash and inspect raw input → produce immutable source-only recipe → prepare ignored canonical reference → render six neutral diagnostic views → measure connected wheel components as scalar bounds → author independent shell, fittings and suspension-driven profile. No source subset, per-axis warp or candidate-relative normalization was used.

## Publication receipt

- Requested scope: Type 96B X as part of the owner's supplied-source batch.
- Explicit failing-gate publication exception: none.
- Current remote hash: not published.
- Excluded: all raw/canonical GLBs, source textures, Blender studies, temporary QA and unrelated shared changes.
- Remaining work: source-native visual iteration, exact-ID gameplay/marking/assets integration and complete release evidence.

### First native comparison — 2026-09-17

Frozen raw/canonical reference unchanged. Capture-queued command: `node tools/procedural-fidelity.mjs --ids=aft10_x,bmp3m_dragun125_x,k21_x,type96b_x --check --board --neutral-board`; exit 1. Preserved report: `.qa-dev/tank-run/eastern-source/fidelity-round1.json`.

Aggregate 93.39; minimum whole view 91.43; strict result **FAIL**. Whole-source registration passed with no candidate normalization. Individual failures: whole.left 91.63/92; whole.right 91.43/92.

Native boards were inspected. Independent silhouettes are recognizable but surface detail remains sparse. All four initial default shoe envelopes projected below the source track ground despite fixed measured axles. Retained correction: use the established 30 mm carrier and explicitly dimensioned 36 mm pads/12–13 mm grousers, preserving every source wheel axle; rescore and strict stock/shoe validation are required. Earlier geometry-dependent receipts are stale after this revision.

### Native iteration checkpoint — 2026-09-17, round 4

Complete raw source remains unchanged. Preserved reports: `.qa-dev/tank-run/eastern-source/fidelity-round4.json` and `track-round4.json`. Whole-source registration passes without candidate normalization. Aggregate **93.82**, minimum whole view **91.35**: **FAIL** against the 92-per-view floor. Remaining whole-view failures: whole.left 91.35/92.

Strict frozen stock interference: **FAIL** (front: band 500, shoe 15; rear: band 395, shoe 140; sweep: band 2526, shoe 239). The exact overlap boxes identify authored lower-hull shoulders and/or end mudguards occupying native track lanes. Source wheel axle stations remain unchanged. The round-5 revision tightens the actual hull ledge, seats thin side sheets outside the moving belt, adjusts end curtains, and adopts the already-established quality-aware native track-shoe primitive. These changes require fresh strict, fidelity, motion and cost receipts; no earlier geometry-dependent pass survives them.

The first native HIGH/LOW construction probe reports finite geometry, exactly one running-gear unit and zero wheel-census issues for each quality. Its total-mesh triangle sums include inactive LOD meshes, and placeholder-material timings are not browser switching performance. They do not establish the fleet performance gate.

The supplied configuration has no roof machine gun. The standard tool's generic MG census is therefore a documented target-policy conflict; no fake cannon or marker-only MG was added.

### Round 5 — source-fixed hull clearance and quality-aware shoes

Preserved `.qa-dev/tank-run/eastern-source/fidelity-round5.json`, `track-round5.json`, and `native-probe-round5.json`. Aggregate 93.81; minimum whole view 91.46; per-view release result **FAIL**. The strict stationary stock audit is **FAIL** (front: band 293, shoe 47; rear: band 94, shoe 0; sweep: band 2259, shoe 577). This does not establish moving suspension contact, containment at other poses or complete release.

Shared `buildFleetTrackShoe` keeps the authored recipe in the canonical animated course and introduces real LOW simplification. Total instance-expanded mesh sums (including inactive LOD objects) are 53,172 HIGH / 35,062 LOW, ratio 0.659. Stored unique geometry is 12,256 / 9,660 triangles. Both qualities build finite geometry with one running-gear owner and zero wheel-census issues. Current native muzzle world position is `[0, 1.8602, 6.52211]`. Browser switching/memory and visibility-aware draw cost remain open.

### Source underside metrology and round-6 correction

The ignored source-only `hull-clearance-study.json` casts vertical rays into raw hull Object_22 at X1.1/1.4/1.6 m and Z−3.3/−2.9/0/2.9/3.3 m. Across the track lanes, underside is approximately Y1.31 m rear,1.335 m middle,1.357 m front and1.244 m at the front fender tip after rigid registration. The previous draft lower shoulders near1.2 m were wrong. The authored closed shell now uses these independently measured overhead datums while retaining all source wheel axles, running gear and full immutable reference. All geometry-dependent receipts require round6 recapture.

Round6: silhouettes93.80/min91.48 (**FAIL** left/right); strict physical shoe stock clears, but carrier proximity still flags666 voxels near the inner skirt face (**FAIL**). Round7 keeps the measured outer skirt surface and changes its thin sheet stock to28mm, improving actual inward clearance without moving any wheel/belt. Fresh strict result pending.

Round7 strict stock result: **PASS**, front/rear/full-sweep band0 and shoe0. Receipt `.qa-dev/tank-run/eastern-source/track-round7.json`. This is the final stationary profile audit; HIGH/LOW moving support/contact is still open.

### Frozen handback — 2026-09-18

Final round7 report `.qa-dev/tank-run/eastern-source/fidelity-round7.json`: aggregate **93.80**, minimum whole view **91.48**, **FAIL**. Remaining failures: whole.left 91.63/92; whole.right 91.48/92. Complete raw source registration passes and no candidate normalization is applied. Profile edits are frozen for independent review. No admitted-exemplar or completed-release claim; no commit or push by this lane.

### Post-main source-detail revision — 2026-09-18

Baseline shared gear: `3f6fc4ad8`. The independent review in `docs/research/regional-source-independent-critic-20260918.md` failed all fourteen views at the shaded-detail threshold. Earlier receipts are historical and do not certify this revision.

Source-only mechanical rays in `type96-mechanical-rays.json` show that Object_14's approximately 68 mm radius is the gun's inner bore. The source outer shroud tapers from 137 mm at Z 2.28 m to 110 mm at Z 5 m and approximately 99 mm at Z 6.45 m. The revision restores this stepped/tapered physical barrel while preserving its 68 mm bore and muzzle position. Separate measured rear louver banks replace the vertical comb and unsupported upper grilles. The cupola is lowered to its source envelope, with distinct periscope fittings. The wheel casting now uses an independently authored 13-station revolved section: approximately +181 mm axial hub, +55 mm recessed web at radius 150 mm and +199 mm lip at radius 290 mm. Two measured tire bands retain the canonical moving gear. No source vertices/topology enter runtime. Wheel stock resource costs and moving contacts require fresh verification; source has no roof MG.

Raw/canonical hashes, registration and official cameras are unchanged; no source component is omitted and the 92 floor is unchanged. Type checking passes. Fresh HIGH/LOW native construction has finite positions, one native gear unit and zero wheel census issues for this ID. Full all-LOD triangle sums are diagnostic storage/expansion counts, not a browser performance pass. Fresh artifacts are under `.qa-dev/tank-run/eastern-source/detail-r1/`. Qualification remains **FAIL / INCOMPLETE**, not a release claim.

Fresh quantitative results: aggregate **96.27**, minimum official whole view **95.37**, 92-floor result **PASS**. HIGH and LOW strict contact each have zero front/rear/full-sweep band and shoe stock intersections. These static stock checks do not certify posed articulation or moving suspension. Source identities were rehashed and match the frozen raw/canonical receipts exactly.

Expanded all-LOD triangles HIGH/LOW: 65392/40250; unique stored triangles HIGH/LOW: 15068/11912. These include inactive meshes and do not replace active LOD/draw-call/switching/memory measurements.

Fresh official fourteen-view capture completed successfully under the shared FIFO queue. Frozen PNGs and report: `.qa-dev/tank-run/eastern-source/detail-r1/official14/type96b_x/`; exact capture identities: `detail-r1/official14-identities.json`. These captures await independent scored review. No 9/10 claim or release approval is inferred from a successful capture command.

### Second post-main detail correction — 2026-09-18

Source-only rear rays distinguish the actual hull cap at Z −3.3848 m from the towing fitting AABB at −3.4824 m. The previous primary shell erroneously extended to the tow fitting and buried every rear louver. The closed cap now uses its own measured datum; separate finite tow mounts retain the overall rear envelope. Both louver banks, backing and frames are seated outside that cap. `easternSourceContact.selftest.mjs` checks first-visible rear intersections at 18 louver locations per quality plus the actual cap datum, so hidden vents cannot pass. The source cupola receives its hinge block, cross pin and clamps. The stepped outer gun shroud now ends in a real annular mouth, inward-facing 68 mm radius bore and 200 mm recessed backstop. The source has no roof MG; its policy decision remains unresolved.

Type checking and both focused regressions pass. `easternSourceContact.selftest.mjs` builds the three centered cannons at HIGH and LOW and requires the shared physical-bore verifier to confirm actual annular stock, inner wall and a finite recess. No bore contract is declared without that geometry; AFT's eight source launcher axes use their separate native weapon contract.

Fresh fixed-source quantitative result: **96.25 aggregate / 95.38 minimum whole view — PASS** at the unchanged 92 floor. Current failures: none in the silhouette score gate. Source whole geometry, raw/canonical hashes, rigid transform and official cameras remain unchanged; no detached geometry is omitted. Parent owns independent dimension/native policy and publication gates.

HIGH and LOW strict frozen contact have zero front/rear/full-sweep band and shoe stock intersections. The latest K21 check follows its new wheel/roof geometry (`detail-r2-final/track-high`, `track-low`); the other three receipts are in `detail-r2/track-high`, `track-low`. These checks do not certify moving suspension or articulated poses.

Current native HIGH/LOW totals: 66258/40976 instance-expanded triangles and 15934/12638 unique stored triangles, including inactive LOD meshes. Both qualities contain finite positions, exactly one native running-gear owner and zero wheel-census issues. Browser-selected triangle counts, draw calls, switching and memory remain unqualified.

Frozen official fourteen-view capture: `.qa-dev/tank-run/eastern-source/detail-r2-final/official14/type96b_x/`; report generated `2026-09-18T08:39:17.832Z`. Exact PNG/report identities and profile hashes are in `detail-r2-final/official14-identities.json` and `profile-identities.json`. Prior r1 files remain preserved; the intermediate r2 BMP folder contained its prior report and is superseded only by this newly captured final set. Author spot inspection confirms the requested form corrections, but it is not an independent every-view score. Final independent review remains pending. Overall status **INCOMPLETE**, no publication or release claim.

### Source detail correction r3 — 2026-09-18

The independent r2 review failed all-view admission (minimum **7/10**): `docs/research/eastern-r2-independent-critic-20260918.md`. This round corrects measured source structure and retains that failure as historical evidence. No publication or independent shaded pass is claimed.

- Object_6's rounded mantlet boot replaces the rectangular root block. Sparse authored elliptical stations use independent source-ray width/height readings; the preserved barrel, actual bore and recoil ownership remain unchanged. Canonical upper points at Z1.20/1.30/1.60/1.75/1.85/1.93 are Y2.1708/2.20109/2.17275/2.08166/2.04377/2.01825.
- Object_12's forward cupola clevis occupies canonical X−0.671…−0.513, Y2.417…2.577, Z0.112…0.239 m. Its upright feet, transverse pin and adjacent latch stock are physical furniture on the cupola. The smoke banks now have the source's two columns × three inclined rows per cheek, instead of three generic tubes.
- Object_22 has **nine** blades per rear vent, width0.8212 m, depth envelope Z−3.418…−3.3789, with 29–35 mm pitch. The old seven bars at57 mm pitch were incorrect. The native contact test now casts108 HIGH/LOW rear-facing rays through independently measured upper blade lips; it retains the original depth bounds and verifies real hull-owned stock ahead of the correct rear cap, rather than weakening the check.
- The road-wheel casting was **preserved**. New actual native FrontSide rays prove a122–123 mm recess at HIGH/LOW, with hub|X|1.5582 and trough|X|1.4352…1.4363. Source corresponding values1.5584/1.4322 are close. No covering mesh or winding failure was found. Its flatter shaded appearance remains unresolved; do not exaggerate depth, change paint to fake shadow, or call the wheel visually approved. Source fastener detail remains a possible separate deficit.

Source-only evidence: `.qa-dev/tank-run/eastern-source/detail-r3-study.json`, `detail-r3-boot-rays.json`; native wheel evidence `detail-r3-native-wheel.json`. Raw/canonical reference identities, registration and cameras are unchanged.

Current validation: source fidelity **96.34 aggregate /95.62 worst view /94.43 track component**, registered≥92 floor passed; `.qa-dev/tank-run/eastern-source/detail-r3/fidelity.json`. Strict HIGH/LOW front/rear/full-sweep carrier and shoe stock hits are all **zero**. Both qualities have finite geometry, one running-gear owner and no wheel-census issues. Physical bore/contact and AFT shared focused checks passed. Unique stored/all-LOD expanded triangle totals are17090/67414 HIGH and13280/41618 LOW,37/35 mesh objects. These include inactive LODs and are **not** the matched10m performance census or switching qualification.

Fresh original fourteen-view comparisons are archived at `.qa-dev/tank-run/eastern-source/detail-r3/official14/type96b_x`; `identity.json` records PNG hashes and unchanged before/after profile, canonical-source and shared-dependency hashes. The author inspected front-left and close-roof only; this is not an independent14-view score. New r3 images require a new critic. Moving contact, source weapon-policy decision, Gallery, browser performance, anatomy, release and publication remain open.

Frozen r3 profile SHA-256 `521da46f9d703b8248c2457b0f91f3e29ba4d290e0fc6c695566945932955b56`; original report time `2026-09-18T09:30:33.854Z`. Both raw/canonical source SHA-256 were rechecked unchanged after validation.

The repository `npm run typecheck` (native TypeScript plus core-unused check) passes on this handback. All edits remain unstaged and unpublished in the isolated worktree.

### Source detail correction r4 — 2026-09-18

The fresh r3 independent critic inspected all fourteen images and failed at minimum **8/10**, identifying the secondary rectangular roof panel as a concrete remaining shape error. That review is preserved in `docs/research/regional-source-independent-critic-20260918.md`; this round addresses the measured hatch only, without changing wheel stock, axles, tracks, camouflage or source frames.

Independent Object_12 component isolation is diagnostic only: no source vertices or topology enter runtime. Scalar readings in `.qa-dev/tank-run/eastern-source/detail-r4-study.json` and `detail-r4-hatch.json` show an oval lid centered approximately X0.58755/Z−0.21318, 0.7361 × 0.5129 m in plan. Source center top Y2.32196 and outer-lip witness Y2.31134 reveal a shallow dished plate with a raised circular center, rather than the previous 0.735 × 0.513 rectangular panel at Y2.328. Held-out diagonal points X0.30/Z−0.40 and X0.92/Z−0.35 have no source hatch stock. Sparse first-party revolved stock now reproduces that oval plan/rim and center relief. Separate measured hinge blocks/pins, latch and a grab handle with two feet and a raised rail complete the bounded correction.

`easternSourceContact.selftest.mjs` checks the actual HIGH/LOW assembled model: center and lip height within 2 mm of independent source samples, absence of hatch stock at both diagonal corner witnesses, handle air, and a finite outward underside on the rail. The previous bore and 108 rear-louver witnesses remain unchanged and passing. This focused result does not establish independent visual admission, moving suspension or release.

Frozen r4 validation: `.qa-dev/tank-run/eastern-source/detail-r4/jobs.json` records native construction, committed contact, AFT cradle, registered fidelity, strict HIGH, strict LOW and both official-view commands all exiting 0. This ID scores **96.34 aggregate / 95.62 worst view / 94.43 track component**, passing the unchanged exemplar floor of 92. Strict front/rear/full-sweep carrier and visible-shoe intersections are zero in both qualities. Native geometry is finite with one running-gear assembly and no wheel-census issues. `npm run typecheck` also passes.

Matched 10 m selected geometry (`detail-r4/selected-geometry.json`): HIGH **64,162 triangles / 36 visible objects**, LOW **38,110 / 35**; LOW/HIGH **59.40%**. This passes the fixed MBT 100,000/65 HIGH triangle/object caps and LOW ≤75% ratio. It is not an FPS, switch-latency or memory pass.

Fresh originals: `detail-r4/official14/type96b_x` under the same private evidence root, report generated `2026-09-18T09:56:21.657Z`. The manifest records all fourteen PNG hashes and unchanged profile/raw source/canonical source/shared files before and after; the complete run also reports no drift. Frozen profile SHA-256 `3be8eafbf97ffeddae3c930e0cf179f18a698b0ad8cdf76581920540c3dedae8`. The author viewed top and close-roof; only an independent critic can score the full required set. Earlier failures remain retained. No index, shared checkout or publication action was performed.

## Prerelease ERA registration correction — 2026-09-18

The full ERA gameplay gate exposed inherited `type99a` zones such as `glacis_era_L` with no registered Type96 visual cluster. This source build explicitly authors no reactive cassettes (construction work order above), and its native anatomy receipt already has `eraPlates: []`. The visible glacis service covers, shell and turret cheeks are permanent stock; assigning them to expendable donor zones would wrongly remove structural geometry.

The supplied-source metadata integration now removes only Type96's inherited `kind: 'era'` declarations at both initial registration and post-balance synchronization. Every permanent plate, the measured source frame, the visual profile and the real Type99A donor coverage remain preserved. This is removal of phantom gameplay coverage, **not a claim that Type96B reactive armor is implemented or qualified**. No independent real-world armor classification follows from the file name. If subsequent source component evidence identifies actual reactive cassettes in this configuration, they require explicit authored cassette stock, physical hit surfaces and depletion/reset bindings before reactive coverage can be restored; the present correction must not relabel such evidence as passive merely to pass a gate.

Focused regression: `src/vehicles/type96SourceArmorRegistration.selftest.mjs` exercises the donor negative control, repeated synchronization, permanent armor/measured-frame preservation and actual filled HIGH/LOW geometry under stale donor ERA events. The first receipt, `.qa-dev/tank-run/type96-era-binding/focused-r1.log`, is retained as a test-lifecycle failure: post-finalization synchronization replaces armor while the one-shot finalizer correctly refuses a second run. The revised test restores the original finalized native armor after its repeated-sync assertions, before native builds. **Focused r2 PASS**: `focused-r2.log` in the same directory records all metadata and actual filled HIGH/LOW controls passing. The unchanged whole-fleet ERA gate and final integration checks remain separate. No source, geometry, calibration, comparison target or golden was edited for this correction.

## Prerelease source fitting repair — 2026-09-18 (in progress)

The fresh final geometry gate exposed a real disconnected mast and a two-bin hull-length shortfall, despite the earlier aggregate silhouette pass. The original `docs/geometry-gate/type96b_x.json` failure is retained. Its hull-length values, native 6.863836 m versus source 7.090696 m, come from the fixed 96-column silhouette body-band measurement; they are not direct primary-hull AABBs. Source/camera/oracle identities and thresholds remain unchanged.

Source-only component measurements are archived in `.qa-dev/tank-run/type96-geometry-repair/source-fittings.json`; installed rays and source/native bow receivers are in `diagnose.json` and `bow-rays.json`. The upper mast previously started at Y2.4575 while the native roof below it was Y2.28411966, leaving 173.380 mm of unsupported air. Object_12 contains the omitted finite 185 mm stem, two rectangular collars and circular base. The draft restores those scalar-measured pieces and retains the existing rod datum. Four Object_22 upper rear latches, each 178.7 ×29.3 ×89.9 mm, project to Z−3.4727 and overlap the measured hull cap by 2 mm; they were absent from the earlier draft.

Object_23 contains five separate raised protective bow blocks, with forward extent Z3.56476. Their explosive composition is not established by the mesh name or external shape. Their authored visible stock is permanent hull external armor; this repair does not add unproven reactive depletion behavior or restore phantom donor ERA zones. Actual source rays also show the prior coarse native bow roof burying these blocks: at X0.30/Z3.30 source block top Y1.262553 and receiving hull Y1.148147 contrast with native hull Y1.298621. Adding hidden blocks would not fix that defect. The bounded receiver correction must expose the measured stock and preserve the separate outer fenders and running-gear frame.

Status: draft, not frozen or visually certified. `type96SourceFittings.selftest.mjs` will require actual filled HIGH/LOW FrontSide first-hit support and permanent ownership. Fresh source/strict/bore/cost checks, root-generated fill/anatomy refresh, and independent review of fourteen actual final originals are still required. The author cannot independently certify this repaired profile.

The source-only central-shell/fender separation is now recorded in `bow-shell.json`: central primary shell Z3.4551, separate bent outboard fenders Z3.5488, raised protective stock Z3.56476. The authored correction preserves the original rear shell through Z2.60 and the entire running gear, then fits the bounded forward receiving planes and separate thin fenders. No source vertices, topology or runtime source loader were introduced. Native receiving undersides are closed first-party stock where the source export omitted those faces.

Draft freeze: profile SHA-256 `fb249c071781c985a452272c8a1374f4a3f2ea2f44199a399d711a0d710305f1`. `focused-r3.log` passes actual filled HIGH/LOW mast support, collars, rear latches, first-visible faces on all five armor blocks, finite underside/receiver overlap and the old coarse-roof obstruction negative. The first focused attempt is retained as a test field-name error (`combatRole` instead of the existing `combatHitboxRole`), not concealed as a geometry pass. Existing Eastern hatch/louver/bore checks passed in `focused-r2.log` before the separately owned next AFT revision. Exact strict HIGH/LOW front/rear/full-sweep band and shoe intersections are all zero. `freeze.json` preserves profile/test/raw/canonical hashes. These receipts use the pre-regeneration fill set; final generated-fill rerun, source/dimension/floater gates, matched cost and independent fourteen-view review remain pending.

After root regenerated the actual fills/anatomy/markings/assets, the final focused fitting test passes at both HIGH and LOW. Fixed-source fidelity passes **96.43047 aggregate /95.74926 minimum whole view**, with actual fill record loaded and unchanged registration. Selected 10 m census is **65,564 triangles /39 objects HIGH**, **39,512 /38 LOW** (60.26% LOW/HIGH), with zero census failures. Receipts are `.qa-dev/tank-run/type96-geometry-repair/final/{focused.log,fidelity.json,selected-geometry.json}`. Final HIGH strict intersections remain zero. LOW strict and official fourteen-view acquisition are queued; composed dimension/floater release gates remain root-owned and are not inferred from this fidelity pass.

Root's composed regenerated geometry gate now independently reports **PASS** for Type96: raw minimum **95.74926007**, dimension score **98.18404908**, floaters **100 /zero failures**. Native and reference mask hull length both equal **7.09069640994 m**, resolving the former 3.1994% deficit without changing the source, registration or gate. The remaining physical width difference is the preserved 0.8301%; physical height differs by 0.00667%. This paragraph records the root-owned gate result read from `docs/geometry-gate/type96b_x.json`; this critic/author did not regenerate or edit that gate. Original failure remains `type96-geometry-repair/geometry-before.json`.

Final post-generation acquisition is now complete: **all six jobs exit 0** (focused fitting proof, source fidelity, selected cost, strict HIGH, strict LOW, official14). Both strict qualities have zero front/rear/full-sweep carrier and shoe hits. Fresh original comparison images are `.qa-dev/tank-run/type96-geometry-repair/final/official14/`; its `identity.json` verifies every one of the fourteen SHA-256 values and no before/after capture drift. The full validation identity also has `drift: []`. Actual fill loading is true and evaluator rig parity is `OK`. These exact originals were handed to the independent Europe reviewer; this repair's author has not self-scored them. Final independent shaded assessment remains the only outstanding item within this bounded author handoff; unrelated source-policy and composed release decisions remain root-owned.

Independent final14 review: [type96-geometry-final-independent-review-20260918.md](../../research/type96-geometry-final-independent-review-20260918.md) inspected all fourteen actual originals and scored their assembled visual fidelity 9/10 each. The repaired mast, bow receiver/blocks, separate fenders and rear latches are accepted within that static visual scope. The per-capture manifest omitted the generated fill file itself; its preacquisition SHA-256 is independently pinned in root's `final-seating/before-validation.json` as `7fa2bad6646133f22945f03b5309815430596269be5ee36eb5a20eb80c5bb247`, matching the current fill. Loaded=true alone was not treated as a file identity proof.

A subsequent dynamic ownership audit exposed a separate defect: the existing mantlet boot shares `gun` and translates 135.417 mm with barrel recoil. This does not invalidate the neutral fitting measurements but prevents claiming correct firing articulation. A bounded ownership-only correction is under review; no source geometry or new material change is authorized by the static visual pass. The pre-correction profile is archived under `type96-gun-ownership/type96bX.before.ts`.

That ownership correction is complete. The Object6 boot now follows gun pitch
without recoiling; the Object11 collars and tube retain barrel recoil.
Authenticated HIGH/LOW neutral geometry and material equality, actual
pitch/recoil checks and deliberately wrong-parent controls are preserved in
`.qa-dev/tank-run/type96-gun-ownership/` and
`src/vehicles/profiles/type96GunOwnership.selftest.mjs`. The
[batch ownership closure](../batches/supplied-afv-20260917.md#final-repaired-geometry-and-qualification--2026-09-18)
records the frozen repair. Its
[independent assembled review](../../research/type96-k21-final-assembled-review-20260918.md)
covers the final static visual result; complete release and publication status
remain in the current batch section linked above.
