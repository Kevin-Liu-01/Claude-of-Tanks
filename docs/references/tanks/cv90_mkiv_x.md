# CV90 Mk IV X — run packet

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Historical author checkpoint

- Updated: 2026-09-18 (round21 actual-filled checkpoint; historical receipts retained).
- Owner request: run the OP source-backed procedure on the supplied vehicles, then commit and push origin main after qualification.
- ID: `cv90_mkiv_x`; display name: CV90 Mk IV X.
- Implementation: independent first-party procedural draft; shared integration owned by the parent task.
- Qualification: **IN PROGRESS / NOT QUALIFIED**. Round21 actual-filled HIGH/LOW native/contact checks, immutable-source silhouettes and stable selected-geometry costs pass. Fresh14-view shaded captures include current generated fill and marking records; independent review of changed images is pending. Earlier scoped r18 visual pass is retained at its exact image hashes. Source roof-weapon policy and full composed release remain open.
- Publication: **NOT PUBLISHED**; ordinary requested commit/push authority does not waive failed gates.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`, branch `codex/kurganets-odztz-generation-20260917`, baseline `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Initial draft profile SHA-256: `226b243161da694ad23c32c30513f573557b1d789fd34cc5f52ecbf198334bd9` (later geometry invalidates this snapshot).
- Next: finish actual postwrite-fill differential validation and independent review, retain source-equipment conflicts, and complete integrator-owned performance, anatomy/assets and composed release.

## Scope and preservation

Independent X addition. Original fleet profiles and IDs are unchanged. Owned profile `src/vehicles/profiles/cv90MkivSourceX.ts` uses only generic authored solid/fitting vocabulary from `europeSourcePrimitives.ts` and the shared suspension gear. Metadata is isolated in `src/vehicles/europeSourceStudyData.ts`; integrator owns shared registry changes. Balance donor: cv90_mkiv. Existing high/low and generated-record preservation checks remain NOT RUN. No source meshes, textures, indices, dense contours or runtime source loaders are added.

## Source and comparison contract

- Local source: `/Users/kevinliu/Downloads/cv90_mk.iv_armored_warfare.glb`.
- Raw SHA-256: `d310fed791778e966ca70454df5e02614fdef95fe1768920fd140e369baeec0c`; 28,858,216 bytes; GLB.
- Credits: owner-supplied game-derived comparison. GLB embedded metadata names KojfDiscord / Sketchfab and a CC-BY-4.0 string; this is embedded provenance evidence, not independently verified redistribution permission. Runtime model is independently authored first-party geometry. Source files remain local only.
- Source bounds (native metres, min→max): `[-1.6327999830245972, -0.0031999999191619413, -3.226599931716919]` → `[1.6719000339508057, 3.8495900630950928, 3.605809926986695]`.
- Source has 27 mesh nodes; supplied GLBs have no animation/skin rigs. Generic/mixed source mesh boundaries do not establish independently articulated component truth. Whole-source comparison retains every mesh.
- Target: supplied source's complete configuration and proportions. No prior batch target exception is inherited.
- Preparation: `node tools/source-x-oracle.mjs --prepare=<raw path> --recipe=.qa-dev/tank-run/europe-source/cv90_mkiv_x-recipe.json --report=.qa-dev/tank-run/europe-source/cv90-oracle.json`. Tools at worktree baseline; Node v24.13.0. OBJ→GLB preparation directly reads unchanged source vertices in the declared rigid frame; no geometry conversion is used in the playable.
- Oracle: `public/models/community-candidates/cv90_mkiv_x_source.glb`; SHA-256 `29160cf92e8e2221cf8b441626f871104dafde6b3ef5a80d3ec91d1fe3c8649a`.
- Registration: proper identity axis map `x,y,z`, uniform scale1, translation `[0, 0.0031999999191619413, 0]`. Source ground minimum alone defines Y translation. No lateral/longitudinal recentering or nonuniform scale.
- Ground is complete source minimumY. Asymmetric source gun x=0.172 and side gear preserved. Turret yaw[-0.035,1.55,-0.60]; inferred gun trunnion[0.172,1.844,0.70].
- Omitted source components: **none**. Inferred turret/gun pivots are implementation assumptions, to be checked under articulation.
- Diagnostic source views: Blender 5.2.0 LTS, native imported transform, ortho 1000×760, neutral pose; front/quarter/side/top/rear under `.qa-dev/tank-run/europe-source/cv90-*.png`. These are intake studies, not official parity certification.
- Published dimensions are not asserted from filenames. Scalar `dimensions` metadata records supplied-source measurements, with structural height distinguished from complete antenna silhouette. The current source-only mask and full3D envelope comparison passes the native3% dimension bound; exact residuals are recorded below.
- Required bar: ≥92 overall and in every registered silhouette view; complete geometry/physical/independent critic/performance checks per tank-generation handbook.
- Roof weapon conflict: preserve supplied equipment. A generic mandatory-MG census does not authorize inventing a weapon; any absent-source conflict must remain explicit. Sabra alone visibly carries the cupola gun in this subgroup.

## Construction work order

Low shallow-glacis hull with long split side-skirt course and seven wheels; wide lower turret shoulders support a narrow citadel, projecting cannon, raised optics and open sight awning.

Hull/turret station lofts are sparse authored primary solids; measured source vertices/topology are never embedded. Intake ray tables and named wheel-island scalar bounds live in ignored `cv90-landmarks.json` / `cv90-axles.json` where applicable. Primary shells retain physical belly, lower glacis, side and roof closures. Open gap below sight awning, narrow open cage at the muzzle, track channels below sponsons and above exposed lower road-wheel faces.

Running gear: Seven per side. Negative-X centers z=[-1.8908,-1.2202,-0.5675,0.075,0.7192,1.383,2.0629]; positive-X z=[-1.7898,-1.1191,-0.4664,0.1759,0.8202,1.484,2.1639], radius0.303 and y0.3626. Front sprocket z2.9828/y0.6313/bodyR0.275/pitchR0.273/toothTipR0.299; rear idler z-2.5524/y0.5408/r0.2622. Shared suspension and smart-track assembly owns all moving wheel faces, return rollers, end wheels and shoes. Pattern defaults are explicitly selected, never overlaid with static fake wheels. Return roller placements are inferred under side covers pending posed review; this is not a source-exact certification.

High/low uses quality-aware cylinder and grille segment counts; common primitive reuse retains native resource ownership. Initial geometry/build/draw/memory costs and full tank-switch timings remain NOT RUN. Permanent shaped armor is retained, no removable ERA is asserted without source evidence. Equipment uses addEquipment with owner-local coordinates; hatches and structural stock remain seated. Gun mouth contains an open annulus, inward wall and recessed termination. Shared combat metadata, finite armor rays, anatomy, crew, markings and release integration are pending with the integrator.

## Evidence matrix

| Gate | Status | Artifact / residual |
| --- | --- | --- |
| Raw source identity / archive safety / rigid frame | PASS | Intake and oracle JSON; hashes above; no omitted meshes |
| Source front / side / quarter / rear / top inspection | PASS | Five intake PNGs, neutral pose only |
| Every registered silhouette / raw aggregate | PASS | Current raw aggregate and every-view minimum below; exact frozen high-quality candidate |
| Geometry components / dimensions within 3% | PASS whole / PARTIAL components | Complete canonical source dimension residuals below; fused independent component truth remains unavailable |
| Independent critic / Gallery high and low | PASS scoped HIGH r18 / final fill coverage pending | See dated independent report and appended round history; no LOW visual or full release inference |
| Winding / closure / intentional air | PASS census / PARTIAL review | Round8 FrontSide continuity0 after reviewed towing-eye separation; original FAIL3 retained. Independent closeup/depth review remains pending |
| Seats / yaw / pitch / recoil | NOT RUN | Pivots are declared inference, pose sweep still required |
| Strict band and shoe sweep / moving gear | PASS recorded HIGH/LOW / postwrite fill pending | Later explicit quality receipts supersede the initial HIGH-only run; retain exact recorded geometry/fill identities |
| Actual rollers / track thickness / chassis closure | NOT RUN | Source-hidden rollers inferred |
| Expanded triangles / build / draw / memory cost | PARTIAL | High/low Node geometry and build counts below; browser draw/memory cost NOT RUN |
| Cold / warm / rapid tank switching | NOT RUN | Integrator performance run required |
| Main / auxiliary armor / modules / crew | NOT RUN | Shared integration pending |
| Markings / colors / bore / roof weapon | PARTIAL / census FAIL | Supplied roof configuration retained; physical source-aware census review and markings validation pending |
| Original fleet / receipt preservation | NOT RUN | No original profile edits, numerical preservation pending |
| Anatomy / assets / centering / source exclusion | NOT RUN | Regeneration owned by integrator |
| Type checking | PASS recorded rounds | See appended latest round logs; initial round7 receipt is historical |
| Complete tests / composed release / builds | NOT RUN | No publication until required gates pass |

## Round log

1. Source intake froze all raw/canonical hashes, inspected safe archive members where applicable and preserved complete relevant geometry.
2. Five native source views and source-only scalar ray/axle measurements established proportions and negative spaces.
3. Independent procedural first draft authored; shared typecheck passed. No threshold or source shape was altered.

## Measured iteration history

All captures use the repository capture queue. Local evidence root: `.qa-dev/tank-run/europe-source/`. Source registration remains identity axes/uniform1 plus the source-only ground translation; every source mesh remains retained. Reported scores are raw values rounded here for readability.

| Round | Aggregate | Worst view | Per-view bar | Evidence |
| --- | ---: | ---: | --- | --- |
| 1 | 92.459 | 89.340 | FAIL | `fidelity-r1.json` |
| 2 | 93.640 | 89.939 | FAIL | `fidelity-r2.json` |
| 3 | 95.113 | 93.411 | PASS | `fidelity-r3.json` |
| 4 | 95.257 | 93.765 | PASS | `fidelity-r4.json` |
| 5 | 95.719 | 94.513 | PASS | `fidelity-r5.json` |

Round3 geometry minimum 30.899887279665606; components `{"wholeCurves":93.41125196830271,"dims":30.899887279665606,"floaters":100}`. This is a historical result, invalidated for current geometry by round4 edits. Reference body-p95 height is 2.7022714773193m; the metadata now uses that source-only value, distinct from the full antenna envelope.

Round3 strict track results (band/shoe voxels): front 0/0, rear 44/0, sweep 336/0. Continuity: 0 unintended sky cells. Full independent contact/articulation review still pending.

Round4 profile SHA-256: `22f4df306a030fd82980c394ca8ed1b6b20efc2e75d903ce08935aa824c5b40e`; shared primitive SHA-256: `7481045577c08c1419bc403ab36b816e791345ab95df446b8a85fe1d5d93c359`. Full instance-aware candidate hashes are recorded in `native-r4.json`; CPU construction evidence is not a browser performance pass.

Round4 corrects the source sloped sight cap, overwide hinge fittings, dished wheel stock and source-height return course. Exact source rays find a real14.3mm lateral air gap between track edge x=-1.5736 and skirt inner x=-1.5879, while the band voxel metric dilates20mm; retain any raw near-contact failure for adjudication. No source/candidate is scaled to conceal this difference.

No standard weapon census pass is asserted: KF41/CV90/TML source configurations have no roof MG; Sabra has its actual cupola weapon but no KIT.fittings marker. These require a source-aware qualification decision; none is treated as a completed gate.

Round5 strict band/shoe front, rear and full-loop sweep all0 at high quality (`track-r5.json`); the tool currently hardcodes high, so low-quality containment is NOT RUN. Geometry minimum94.51345, dimensions99.07143, floaters100: PASS. Actual source positive-side panel outerX1.5596m is distinct from the small towing-loop extremum1.6719m; the loft preserves that asymmetry. Two source-visible canisters are mounted beneath the turret awning; exact missile type/spare ammunition is not source-derived. Instance fingerprints high495a4322/lowacd21499. Independent official14-view review and composed release remain pending.

## Current frozen validation — round7

Round5 measured the asymmetric hull center and side plates: the continuous +X side ends around1.560m, while a small towing loop alone reaches1.6719m. Two real missile canisters remain under the turret awning; source dimensions establish two tubes, not a missile brand or reserve count. Round7 sets the actual gun bore radius0.0175m for the shared35mm weapon. Standard continuity reports **FAIL3** cells at x1.64,z2.20, in the open towing loop; the raw failure is retained pending reviewed adjudication. Source measured loop bounds are x1.555..1.6719, y0.6084..0.6816, z2.0723..2.377. No false plate was inserted into this open mechanism.

- Fidelity source round7: raw aggregate **95.71850016604371**, worst registered view **94.51345232728275**, both pass92. Full canonical source remains unscaled and complete.
- Geometry raw minimum **94.51345232728275**; raw components `{"wholeCurves":94.51345232728275,"dims":99.07142857142856,"floaters":100}`. Missing fused component classifications are unavailable, not invented passes.
- Strict band/shoe front, rear and full-loop sweep: **0/0, 0/0, 0/0** for all four IDs in `track-r7.json`. These scans currently use high quality; low remains NOT RUN.
- Standard overall: **FAIL** (`standard-r7.log`), not a completed qualification receipt.
- Current profile SHA-256: `26450cb6310f8f485105422a1c6f81aa144f65356104cf11f2ceceaa38932530`; shared primitive SHA-256: `b8e938212b91f756ef67eb71754d9dad4a5ef48b6455d9742ad509bb6b770075`.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles | Node build ms |
| --- | --- | ---: | ---: | ---: |
| high | `5b1c4c9d` | 10462 | 58984 | 867 |
| low | `3fda0aba` | 8040 | 52418 | 777 |

Counts in `native-r7.json` include stored hidden/far meshes. Node construction is diagnostic, not a browser frame, memory or tank-switch performance pass. The seed is4242; both quality builds completed with finite bounds.

| Dimension | Candidate m | Source m | Absolute residual |
| --- | ---: | ---: | ---: |
| heightM | 2.687859 | 2.702271 | 0.5333% |
| hullLengthM | 6.611558 | 6.611558 | 0.0000% |
| overallLengthM | 6.852960 | 6.831342 | 0.3165% |
| widthM | 3.192283 | 3.228314 | 1.1161% |
| physicalWidthM | 3.321904 | 3.304700 | 0.5206% |
| physicalHeightM | 3.862475 | 3.852790 | 0.2514% |
| physicalOverallLengthM | 6.854910 | 6.832410 | 0.3293% |

Mask-derived rows use paired identical measurements in the source-only fixed frame. Physical rows independently use the full visible3D envelope without raster filtering. Neither oracle nor spec was fitted to the candidate. Current official14-view independent scores, full articulation/low-quality containment, finite armor/crew rays, browser performance and composed release are still NOT RUN.

## Round8 towing-eye semantic separation

The parent reviewer accepted the narrow use of the existing open-lattice equipment bucket for the source-real open towing eye. Only that TubeGeometry moved from `hullDetail` to `hullOpenLattice`; continuous hull, skirts and armor remain fully scanned. Both buckets use the same painted material and nonArmor hit role. No geometry, winding or physical protection was added, removed, hidden, enlarged or reclassified as armor. The real loop remains visible in the game and fidelity/critic captures.

World-space triangles, winding and combat roles match before/after at both qualities (sorted position precision1µm): high `5327cf1594f8dd28ec35f821f0f163c7cb155c72006d4a3b8c069e33080aab18`, low `c088c23e7f8be6ad3d2727696500bf499e23feed096f0e69f0d2661df72a2d62`. Evidence: `cv90-loop-before.json`, `cv90-loop-after.json`. The ordinary instance-aware hash changes because the loop now occupies its own mesh.

- Current profile SHA-256: `c40a94429a7be3d8f083b1642f581a4e6e1c10c9cbc4a23c14b70d5d99e685e0`.
- Current high geometry hash: `e81927d6`; low: `812777eb`.
- Stored/expanded triangles unchanged: high10462/58984; low8040/52418. Mesh count grows by one per quality. Node construction in `native-r8.json` is diagnostic, not a frame-time pass.
- Fresh standard result: continuity **0**, strict band/shoe front/rear/full-loop **all0**, geometry **94.5/92**. Overall standard remains **FAIL** solely for the absent-source roof-MG census (`standard-r8.log`). Historical raw FAIL3 remains in `standard-r7.log` and is not rewritten. Exact CV90-only track output was archived during the correct phase as `track-r8-exact-cv90.json`; the shared tool output is otherwise overwritten by later queued runs. Current full typecheck passed (`typecheck-r8.log`).

## Independent review checkpoint

The official14-view critic has reviewed this vehicle and returned **FAIL** on source-visible detail. Exact image-specific findings and historical scores are in `docs/history/research/regional-source-independent-critic-20260918.md`; no silhouette pass supersedes this review. Source-based detail correction and fresh full review remain required. Following shared-track integration, pre-main track and geometry hashes above are historical until revalidated.

## Post-main round10 — source equipment relief

The two cheek banks now retain six actual smoke apertures each and the source asymmetric layouts, with physical bracket stock. The raised roof sight uses open A-frame struts. Rear deck U fixtures, ramp perimeter, handles, lights and deck-access relief were rebuilt from source-only scalar bounds. The original open towing loop remains visible in its narrowly scoped existing open-lattice bucket. No source geometry or thresholds changed.

The fresh independent14-view review still reports **FAIL**: the source flared/vented main-gun terminal, hatch rim/hinges/clamps, lower side-skirt datum and broad bow corner fittings require further source-based corrections. Axle stations must not move merely to conceal the skirt discrepancy.

- Fidelity raw aggregate **95.59839970506457**, worst registered view **94.257999904927**: PASS92 per-view bar (`fidelity-cv90-r10.json`).
- Fresh geometry gate passes (`geometry-cv90-r10.log`); unavailable component classifications remain unavailable.
- Strict band/shoe front, rear and full-loop sweep: **all0 at HIGH and LOW**, with separate `track-cv90-r10-high/track-clip.json` and `track-cv90-r10-low/track-clip.json` receipts. These checks do not certify finite contact or moving articulation.
- Typecheck passes. Full standard weapon census remains unresolved for the source lacking a roof MG; no fictitious weapon was added. Browser performance, full anatomy/release qualification and publication remain uncompleted.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles |
| --- | --- | ---: | ---: |
| high | `1a22173b` | 12572 | 61094 |
| low | `f550be48` | 9846 | 54224 |

Node evidence in `native-r11.json` includes stored hidden/far meshes and is not a browser frame/switch performance receipt. Current profile SHA-256: `29123dc26cfd37fca94d1bff6eb1f0db6dc6a47aa123e8e2fe8e1a4bd74aaf1f`. Later shared factory or geometry changes invalidate these hashes until remeasured.

## Round14 — lower curtain, open brake and source fittings

The source separates upper side cells from a lower curtain (`Object_4`). Source-only lateral rays put its main bottom at rawY0.307–0.310m and upper edge0.548–0.557m; the earlier0.505m datum belonged to the upper component. A separate source-height curtain with raked ends restores coverage. Wheel radii, axle stations and suspension settings remain unchanged. Five lower receiving/fastener stations follow source component bounds.

The brake now uses separate flared upper/lower channels around real lateral air. Source side-axis rays at worldZ3.27–3.41 hit no geometry; retaining the former full tube here would falsely close that chamber. The source forward annular baffle ends at worldZ3.50621m, while its extreme upper lip reaches3.60581m. Native gun-local firing mouth2.80621m therefore has99.60mm of projected lip. The authored short throat uses outer radius0.0505m,35mm bore and65mm depth, rather than adding a long false cylinder through the vent chamber. The shared physical-bore verifier passes HIGH and LOW: actual recess64.5mm, maximum rim offset0.6mm, measured projection99.6001mm. The source raw hole is stylized larger than the35mm weapon bore; that nominal caliber remains the gameplay datum, without resizing the source.

Source-sized low bow lamp receivers and broad covers replace the small high/rearward blocks. Open towing fixtures, a stepped hatch perimeter and the asymmetric hinge/clamp furniture are restored. Their scalar measurements are retained in `cv90-r14-details.json`, `cv90-r14-rays.json` and `cv90-mouth-axial.json`; no source topology is shipped.

- Fidelity raw aggregate **96.1458461898014**, worst registered view **94.66078300024179**: PASS92 (`fidelity-cv90-r14.json`).
- Strict HIGH and LOW band/shoe front, rear and complete sweep: **all0** (`track-cv90-r14-high/track-clip.json`, `track-cv90-r14-low/track-clip.json`).
- Typecheck and actual native physical-bore verification pass (`typecheck-cv90-r14.log`, `build-cv90-r14.log`).
- The neutral board was viewed; the full independent14-view repeat is pending the shared shading freeze. The last official critic FAIL remains historical and is not silently converted into a pass. No full standard, anatomy, browser performance, release or publication qualification is asserted.

The current native geometry receipts after shared physical-bore integration are in `native-r16.json`:

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles |
| --- | --- | ---: | ---: |
| high | `66e82f9a` | 15096 | 63618 |
| low | `1f074a5e` | 11728 | 56106 |

Profile SHA-256: `22a8c50af019cd63480d2e772b5347e49b27991c1cd3d8c4ce0d0ebbdad9fdb2`. Counts include hidden/far stock and repeated instances; the increased detail cost has no browser performance receipt yet. Source-frame geometry/strict receipts do not certify the shared shaded draw path currently under investigation. **NOT QUALIFIED / NOT PUBLISHED**.

## Performance round17 — measured stock and selected geometry budgets

This round explicitly adopts the existing `buildFleetTrackShoe` through the profile's native shoe-builder hook. No shared shoe helper, axle, track-course datum, source frame, body, weapon or palette was changed by this optimization. The quality-aware near shoe retains real paired pads, their central split, a connecting web and the guide horn. Its approved LOW recipe drops unresolved generic pin relief and merges surface detail; this is a declared quality difference, not the distant flat shoe or a counter adjustment. CV90, TML and Sabra wheel stock is unchanged.

The existing browser geometry census ran at the unchanged 10m HIGH/LOW distance with one worker under the capture queue. It counts selected visible instanced geometry, not all stored LODs. Its before/after identity is unchanged (`perf-r17/identity.json`, drift=[]).

| Selected metric | Previous frozen census | Round17 |
| --- | ---: | ---: |
| HIGH triangles | 60,142 | 50,978 |
| LOW triangles | 52,630 | 33,354 |
| HIGH visible objects | 41 | 41 |
| LOW visible objects | 40 | 40 |
| LOW / HIGH triangles | 87.51% | 65.43% |

**Selected geometry budgets PASS:** fixed HIGH triangle cap 80,000, object cap 85, and LOW≤75% of HIGH. This is not a browser frame-time, memory or cold/warm/rapid-switch pass.

- Fresh fidelity raw aggregate **96.14184926973755**, minimum registered view **94.66078300024179**: PASS92 (`perf-r17/fidelity.json`). Source hashes and registration are unchanged.
- Strict HIGH and LOW band/shoe front, rear and complete sweep: **all0**, separately retained in `perf-r17/track-high/track-clip.json` and `perf-r17/track-low/track-clip.json`.
- Typecheck and `europeSourceRunningGear.selftest.mjs` pass. The latter measures actual near-shoe peaks, supported web, split air and guide projection at both qualities; it also confirms preserved physical bores and KF41's side layers following native tire rotation/suspension matrices. These focused witnesses are not a complete dynamic contact/armor/anatomy certificate.
- HIGH native geometry hash `7be9edf9`; LOW `5b83b2c0` (`perf-r17/native.json`). Profile SHA-256 `03b3e878b0c6d7e08bb18f826765cfd71f6cfd69a06f3bea7edde1e7e1530e94`. Shared and new helper identities are in `perf-r17/final-freeze.json`.
- All four new neutral boards were viewed and archived under `perf-r17/boards`. Fresh official14 capture completed at `2026-09-18T10:06:02.820Z`, exit0, rig parity OK, all14 originals preserved under `perf-r17/official14/cv90_mkiv_x`. Its per-ID identity records exact shared/profile/tool hashes before and after (drift=[]), plus every image/report SHA-256. Captured `tankFactoryCore.ts` SHA-256 is `22598a957e95b159fe56e9a3f9e7ec5bf4d609534b8bd120b1f0610ebbc183e3` after the parent's AFT-only closure change. Independent scoring of these new14 images is still pending; no builder self-rating or old critic pass is substituted. Previous critic FAIL receipts are retained. Full standard, anatomy, performance and composed release remain uncompleted. **NOT QUALIFIED / NOT PUBLISHED**.

## Publication receipt

Requested batch includes this ID alongside the user's other twelve additions. This draft has **no qualification or publication receipt**. No scoped as-is exception exists. Source binaries, archive extraction, renders and logs remain ignored. Commit, integrated main tests and remote main hash are pending with the parent task.


### Final shared-wheel-shader capture — 2026-09-18

The geometry remains the frozen performance-r17 candidate. The parent's shared wheel-shading correction is now captured with the native materials and fixed registered source in all fourteen official originals: `.qa-dev/tank-run/europe-source/final-shader-r18/official14/cv90_mkiv_x/`. Its sibling `cv90_mkiv_x-identity.json` and `capture-index.json` pin every PNG/report and relevant profile/shared/tool hash; `whole-identity.json` reports no drift across the five-model capture session. All70 image hashes were subsequently checked. The frozen `materials.ts` SHA256 is `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.

All capture commands exit0 and rig parity isOK. The builder spot-viewed the fresh hero-frontleft only; a different reviewer owns the complete every-image≥9 assessment. Earlier images and failed critiques remain preserved. Unchanged binary geometry/source scores were not rerun merely for the shader update. Qualification remains incomplete pending the new independent review and all remaining physical/performance/anatomy/release gates.


## Round18 independent shaded review checkpoint — 2026-09-18

An independent reviewer actually inspected the fourteen final-shader originals and recorded source fit/detail/static seating of at least9 in every image. See `docs/history/research/regional-source-independent-critic-20260918.md` and `.qa-dev/tank-run/independent-regional-review/final-shader-r18-review.json`. The matched source and native silhouette, primary source equipment, corrected wheels and open mechanisms meet that scoped HIGH gallery review. It does not certify LOW or moving contact, performance, anatomy, source roof-weapon policy, actual newly generated interior-fill coverage or composed release. The originals and identities remain archived under `.qa-dev/tank-run/europe-source/final-shader-r18/official14/cv90_mkiv_x/`; later final loaded captures must preserve this history. Publication remains NOT PUBLISHED.


## Round21 actual-filled evidence refresh — 2026-09-18

No profile geometry was edited. The r18 shader archive predated explicit async interior-fill preload in the QA pages; this run explicitly loads final records and tests actual emitted stock. Eager factory registration also includes the current generated marking seats. The complete run, exact implementation/record hashes, source masks and images are preserved under `.qa-dev/tank-run/europe-source/filled-r21/`.

- Native HIGH/LOW: installed fill boxes match decoded source records exactly—**{'hull': 0, 'turret': 12, 'gun': 0}**, **144** fill triangles. Finite geometry plus the focused source wheel, installed wheel/layer, track-pad air, bore and attachment tests pass after preload (`native.json`, `native.log`).
- Fixed unchanged-source comparison: raw aggregate **96.15**, minimum view **94.66**, PASS≥92 for every valid view (`fidelity.json`).
- Strict HIGH and LOW: band/shoe front, rear and complete-sweep intersections allzero, no reported anomaly (`track-high/`, `track-low/`).
- Stable selected10m cost: HIGH **51,122**, LOW **33,498** expanded triangles; objects **42/41**; LOW **65.53%**. Fixed IFV80k/85object and LOW75% limits pass (`selected-final.json`). This is not a browser timing/memory/switching claim.
- Initial census overlapped an integrator centering-record write. Its `selected.json` and `jobs.json` retain the honest `presentationAnchors.generated.ts` drift. After centering froze, **only that census** was rerun; `selected-final.json` and `census-final-job.json` pass with no drift. Source/strict jobs had no drift and were not needlessly repeated.
- Fresh official14: status0,14original PNGs, current fill record loaded, source-world shared camera. Every image hash recomputed; per-ID and whole capture before/after identities are unchanged. Versus r18, **2/14** PNGs are byte-identical and **12** changed. `r18-image-differential.json` retains both complete file hashes. Changed originals require independent review; the author does not self-certify them.

No new source-equipment waiver, raw-target change, complete anatomy/release result or publication is inferred. The earlier r18 visual verdict remains historical at its image hashes until the independent reviewer accepts the changed filled presentation.

Final relevant hashes:

- `src/vehicles/profiles/cv90MkivSourceX.ts`: `03b3e878b0c6d7e08bb18f826765cfd71f6cfd69a06f3bea7edde1e7e1530e94`
- `src/vehicles/interiorFillGroups/cv90MkivSourceX.generated.ts`: `15f5d6e0d5a3055666a4e341c271a8f501ec303d417dc753551da519c20fc120`
- `src/vehicles/vehicleMarkingSeatGroups/cv90MkivSourceX.generated.ts`: `815448fa671e329c6de53a8dc5e657039034a3ca7c26d7e2e5e6e1badc59a335`
- `src/vehicles/presentationAnchors.generated.ts`: `9bf2b5dc77d9a7e4e4435a65ba77581fe90d6d4da560a06508a7a488bbd1a770`
- `src/vehicles/materials.ts`: `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`
- `src/vehicles/tankFactoryCore.ts`: `1e9fb081c1c8b86e8200606de7c3350ed8f5280cffc1d4466b885abbe11b82ff`


## Pitching receiver ownership checkpoint — 2026-09-18

Existing receiving stock now follows gun pitch without following barrel recoil. The actual tube and muzzle retain their recoil owner; no source dimensions, neutral primitives or pivots changed. Neutral HIGH/LOW visible world triangles, transformed normals, UVs, colors and materials match the prior model exactly. Filled native legal-pitch/recoil/return checks pass; TML optical faces additionally retain full-scene recess depth, unlimited former visibility through near/far LOD changes and exactly-once disposal.

Current profile SHA-256: `ce54ca1288829446e34b0d133a898c7b7ff0117d8e641ae9c98de8608a39d065`. Details and the genuine KF41 pre-fix failure are preserved in [the ownership repair report](../../history/research/europe-gun-ownership-repair-20260918.md). The parent owns affected anatomy/fill regeneration and final integration evidence. Earlier static-shape evidence is preserved; no composed release pass or waiver of existing source/roof-MG policy conflicts is claimed here.


## Supplied-configuration caliber correction — 2026-09-18

The source publisher explicitly identifies its manned-turret CV90 Mk IV with a
**50 mm Bushmaster and twin Spike-LR launcher**, rather than the previously
inferred 35 mm cannon. [Armored Warfare, 2021-06-03](https://armoredwarfare.com/en/news/general/development-cv90-mkiv).
The 35 mm statements in rounds 7–14 above are historical and superseded.

The authored muzzle inner radius changes from 17.5 to 25 mm. Its 50.5 mm outer
radius, 65 mm recessed wall/backstop, gun-local firing plane Z2.80621, flared
vent chamber and 99.60 mm projecting lip remain unchanged. Source-only baffle
calipers at canonical Z3.506210089 show a stylized aperture about 50.7 mm wide
and 58 mm high; they do not establish an exact circular bore. The published
caliber resolves the weapon identity without resizing the comparison source.
The raw and canonical source hashes and registration remain unchanged.

Private evidence is `.qa-dev/tank-run/cv90-50mm/`. Initial 50 mm builds correctly
stopped at the shared finite-rim check: its shifted mid-annulus ray struck the
projecting lower brake channel before the seated ring. That failure is retained;
no exterior stock is moved to avoid the ray. The revised physical check
requires the actual middle annulus behind a bounded projecting lip plus exposed
inner-annulus stock at the original 5 mm tolerance; missing/moved rims and caps
still fail. No body geometry is changed for that check.

The filled HIGH/LOW focused fixture now passes six legal pitch/recoil poses per
quality, each with 12 full-scene aperture rays, 12 annular rays and 36 inner-wall
rays, plus real transverse vent air and two geometry mutation negatives (solid
cap and obsolete 35 mm aperture). Actual recess is 64.5 mm including factory
seating, maximum rim offset 0.6 mm, and projection 99.6001 mm. Selected costs are
50,994 HIGH / 33,370 LOW (65.44%), within the fixed IFV/quality budgets.
The exact primitive/native preservation replay passes with input drift zero
(`preservation.json`, `before-final.json`, `after-final.json`). Exactly three of
279 HIGH / 272 LOW authored primitives change: the inner cylindrical wall,
annular opening and recessed disk. Only their 17.5 mm radial vertices move to
25 mm; axial coordinates, other stock, index order, rig transforms, materials,
instance transforms and visibility remain identical. The annulus UVs and the
factory's corresponding physical bore furniture follow the enlarged aperture.
Final geometry/visual/release qualification remains integrator-owned.

The fresh source/native continuation study (`rim-diagnosis-r2.json`) distinguishes
physical seating from exact contour identity. Native mid-annulus angle4.941
hits the existing lower brake channel18.790mm before the annulus. The source at
that same native-axis point hits its annulus directly; at angle1.887 its upper
lip projects94.295mm ahead instead. The earlier sparse brake approximation is
retained for this caliber-only correction; this is not a claim that every lip
sample matches the source. Final independent views assess that visible contour.
