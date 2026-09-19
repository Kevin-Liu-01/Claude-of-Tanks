# Sabra Mk 2 X — run packet

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Historical author checkpoint

- Updated: 2026-09-18 (round22 real cupola-weapon ownership; historical receipts retained).
- Owner request: run the OP source-backed procedure on the supplied vehicles, then commit and push origin main after qualification.
- ID: `sabra_mk2_x`; display name: Sabra Mk 2 X.
- Implementation: independent first-party procedural draft; shared integration owned by the parent task.
- Qualification: **IN PROGRESS / NOT QUALIFIED**. Round22 source silhouettes, filled HIGH/LOW physical checks and selected costs PASS; actual weapon registration now gives MG1/continuity0. Independent official14 review reaches scoped9/10 per image. Final generation preserved the fill, per-ID marking and Sabra presentation values, so those reviewed visuals remain applicable. Integrator-owned composed release remains pending; historical receipts are retained below.
- Publication: **NOT PUBLISHED**; ordinary requested commit/push authority does not waive failed gates.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`, branch `codex/kurganets-odztz-generation-20260917`, baseline `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Initial draft profile SHA-256: `50731bf3a32d4e472544f0b4ead887e8680f165b1f5039dc442f1eca7beb1f7f` (later geometry invalidates this snapshot).
- Next: complete the integrator-owned composed release and publication decision. Sabra has its source cupola gun and no absent-source roof-weapon conflict.

## Scope and preservation

Independent X addition. Original fleet profiles and IDs are unchanged. Owned profile `src/vehicles/profiles/sabraMk2SourceX.ts` uses only generic authored solid/fitting vocabulary from `europeSourcePrimitives.ts` and the shared suspension gear. Metadata is isolated in `src/vehicles/europeSourceStudyData.ts`; integrator owns shared registry changes. Balance donor: m60a3 (balance metadata only; no donor silhouette). Existing high/low and generated-record preservation checks remain NOT RUN. No source meshes, textures, indices, dense contours or runtime source loaders are added.

## Source and comparison contract

- Local source: `/Users/kevinliu/Downloads/sabra_mk.2_armored_warfare.glb`.
- Raw SHA-256: `4c6f13e1a94e9ab4d136d6b6229f0425ed9245f127c6d93811a2bf00f9cab968`; 25,623,696 bytes; GLB.
- Credits: owner-supplied game-derived comparison. GLB embedded metadata names KojfDiscord / Sketchfab and a CC-BY-4.0 string; this is embedded provenance evidence, not independently verified redistribution permission. Runtime model is independently authored first-party geometry. Source files remain local only.
- Source bounds (native metres, min→max): `[-1.8739999532699585, 0.0027000000700347286, -3.5409998893737793]` → `[1.8739999532699585, 5.073780059814453, 5.4968900680542]`.
- Source has 22 mesh nodes; supplied GLBs have no animation/skin rigs. Generic/mixed source mesh boundaries do not establish independently articulated component truth. Whole-source comparison retains every mesh.
- Target: supplied source's complete configuration and proportions. No prior batch target exception is inherited.
- Preparation: `node tools/source-x-oracle.mjs --prepare=<raw path> --recipe=.qa-dev/tank-run/europe-source/sabra_mk2_x-recipe.json --report=.qa-dev/tank-run/europe-source/sabra-oracle.json`. Tools at worktree baseline; Node v24.13.0. OBJ→GLB preparation directly reads unchanged source vertices in the declared rigid frame; no geometry conversion is used in the playable.
- Oracle: `public/models/community-candidates/sabra_mk2_x_source.glb`; SHA-256 `5ea261fb70f728d3547159a6a6cf1519af2403e05e57c02d87d394ec9f573a2b`.
- Registration: proper identity axis map `x,y,z`, uniform scale1, translation `[0, -0.0027000000700347286, 0]`. Source ground minimum alone defines Y translation. No lateral/longitudinal recentering or nonuniform scale.
- Ground is complete source minimumY. Turret yaw[0,1.57,0.05]; inferred gun trunnion[0,2.014,1.20], muzzleZ5.49689. Full source antenna peak5.07108m.
- Omitted source components: **none**. Inferred turret/gun pivots are implementation assumptions, to be checked under articulation.
- Diagnostic source views: Blender 5.2.0 LTS, native imported transform, ortho 1000×760, neutral pose; front/quarter/side/top/rear under `.qa-dev/tank-run/europe-source/sabra-*.png`. These are intake studies, not official parity certification.
- Published dimensions are not asserted from filenames. Scalar `dimensions` metadata records supplied-source measurements, with structural height distinguished from complete antenna silhouette. The current source-only mask and full3D envelope comparison passes the native3% dimension bound; exact residuals are recorded below.
- Required bar: ≥92 overall and in every registered silhouette view; complete geometry/physical/independent critic/performance checks per tank-generation handbook.
- Roof weapon conflict: preserve supplied equipment. A generic mandatory-MG census does not authorize inventing a weapon; any absent-source conflict must remain explicit. Sabra alone visibly carries the cupola gun in this subgroup.

## Construction work order

M60-derived rounded lower chassis and six small road wheels under split skirts; a broad welded angular turret with long front cheeks, a raised armed cupola, and an open rear basket.

Hull/turret station lofts are sparse authored primary solids; measured source vertices/topology are never embedded. Intake ray tables and named wheel-island scalar bounds live in ignored `sabra-landmarks.json` / `sabra-axles.json` where applicable. Primary shells retain physical belly, lower glacis, side and roof closures. Open bustle rack and its individual rail bays; running-gear air; recessed optical mouths; hollow gun muzzle.

Running gear: Six road centers z=[-2.1577,-1.3486,-0.5171,0.3255,1.1309,1.9496], r0.3274/y0.3597. Rear drive z-2.851/y0.9816/bodyR0.2007/pitchR0.195/toothTipR0.2657; front idler z2.9729/y0.9143/r0.2455. Shared suspension and smart-track assembly owns all moving wheel faces, return rollers, end wheels and shoes. Pattern defaults are explicitly selected, never overlaid with static fake wheels. Return roller placements are inferred under side covers pending posed review; this is not a source-exact certification.

High/low uses quality-aware cylinder and grille segment counts; common primitive reuse retains native resource ownership. Initial geometry/build/draw/memory costs and full tank-switch timings remain NOT RUN. Permanent shaped armor is retained, no removable ERA is asserted without source evidence. Equipment uses addEquipment with owner-local coordinates; hatches and structural stock remain seated. Gun mouth contains an open annulus, inward wall and recessed termination. Shared combat metadata, finite armor rays, anatomy, crew, markings and release integration are pending with the integrator.

## Evidence matrix

| Gate | Status | Artifact / residual |
| --- | --- | --- |
| Raw source identity / archive safety / rigid frame | PASS | Intake and oracle JSON; hashes above; no omitted meshes |
| Source front / side / quarter / rear / top inspection | PASS | Five intake PNGs, neutral pose only |
| Every registered silhouette / raw aggregate | PASS | Current raw aggregate and every-view minimum below; exact frozen high-quality candidate |
| Geometry components / dimensions within 3% | PASS whole / PARTIAL components | Complete canonical source dimension residuals below; fused independent component truth remains unavailable |
| Independent critic / Gallery high and low | r18 FAIL / r19 pending | See dated independent report and appended round history; no LOW visual or full release inference |
| Winding / closure / intentional air | PARTIAL | Current FrontSide continuity census0; independent depth/negative-space review still required |
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
| 1 | 93.337 | 90.399 | FAIL | `fidelity-r1.json` |
| 2 | 93.365 | 90.568 | FAIL | `fidelity-r2.json` |
| 3 | 93.545 | 90.454 | FAIL | `fidelity-r3.json` |
| 4 | 94.216 | 90.036 | FAIL | `fidelity-r4.json` |
| 5 | 94.665 | 91.925 | FAIL | `fidelity-r5.json` |

Round3 geometry minimum 0; components `{"wholeCurves":90.45440517423864,"dims":100,"floaters":0}`. This is a historical result, invalidated for current geometry by round4 edits. Reference body-p95 height is 3.0598200101964177m; the metadata now uses that source-only value, distinct from the full antenna envelope.

Round3 strict track results (band/shoe voxels): front 0/0, rear 64/0, sweep 530/0. Continuity: 0 unintended sky cells. Full independent contact/articulation review still pending.

Round4 profile SHA-256: `577a89a09b5feb01515a977450605caf12474545c9740f09f78fbbdc893edb52`; shared primitive SHA-256: `7481045577c08c1419bc403ab36b816e791345ab95df446b8a85fe1d5d93c359`. Full instance-aware candidate hashes are recorded in `native-r4.json`; CPU construction evidence is not a browser performance pass.

Round4 replaces mistaken72mm-thick rear skirts with measured14mm stock, separates the low rear supports from the short tapered open basket, and attaches both antenna bases through source-visible raised sockets. The structural cupola uses addCupola; its source-visible gun is a real hand-authored receiver/barrel, not a marker-only exception. Native side shape and floater failures remain open until measured again.

No standard weapon census pass is asserted: KF41/CV90/TML source configurations have no roof MG; Sabra has its actual cupola weapon but no KIT.fittings marker. These require a source-aware qualification decision; none is treated as a completed gate.

Round5 strict band/shoe front, rear and full-loop sweep all0 at high quality (`track-r5.json`); the tool currently hardcodes high, so low-quality containment is NOT RUN. Geometry minimum91.9248122597: FAIL92 floor, despite dimensions100 and floaters100. Round6 corrects source-measured cupola gun axis and rear basket lean; repeat comparison pending. No score has been rounded up to a pass.

## Current frozen validation — round7

Round5 reconstructed the source broad cupola dome from sparse authored cross-sections. Round6 seated the source cupola gun at x-0.5059/y2.7738 and leaned the rear basket uprights forward100mm, preserving its open rail bays. Round7 gives the main gun an explicit source-measured0.0598m inner bore radius. Raw round5 worst-view91.9248122597 remains a failure; round6 and round7 genuinely exceed92. The source-visible cupola MG is hand authored and does not carry a KIT.fittings census marker.

- Fidelity source round7: raw aggregate **94.74928987807883**, worst registered view **92.19427599140924**, both pass92. Full canonical source remains unscaled and complete.
- Geometry raw minimum **92.19427599140924**; raw components `{"wholeCurves":92.19427599140924,"dims":100,"floaters":100}`. Missing fused component classifications are unavailable, not invented passes.
- Strict band/shoe front, rear and full-loop sweep: **0/0, 0/0, 0/0** for all four IDs in `track-r7.json`. These scans currently use high quality; low remains NOT RUN.
- Standard overall: **FAIL** (`standard-r7.log`), not a completed qualification receipt.
- Current profile SHA-256: `57a5639069d8afc8875f36bb2cf1b2c3cb1095d335642686b4e56d2354ac6261`; shared primitive SHA-256: `b8e938212b91f756ef67eb71754d9dad4a5ef48b6455d9742ad509bb6b770075`.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles | Node build ms |
| --- | --- | ---: | ---: | ---: |
| high | `f604c324` | 13178 | 65048 | 630 |
| low | `7655cded` | 10594 | 56958 | 524.1 |

Counts in `native-r7.json` include stored hidden/far meshes. Node construction is diagnostic, not a browser frame, memory or tank-switch performance pass. The seed is4242; both quality builds completed with finite bounds.

| Dimension | Candidate m | Source m | Absolute residual |
| --- | ---: | ---: | ---: |
| heightM | 3.040756 | 3.059820 | 0.6231% |
| hullLengthM | 6.810721 | 6.810721 | 0.0000% |
| overallLengthM | 9.036478 | 9.036478 | 0.0000% |
| widthM | 3.774731 | 3.755667 | 0.5076% |
| physicalWidthM | 3.771000 | 3.748000 | 0.6137% |
| physicalHeightM | 5.088148 | 5.071080 | 0.3366% |
| physicalOverallLengthM | 9.038289 | 9.037890 | 0.0044% |

Mask-derived rows use paired identical measurements in the source-only fixed frame. Physical rows independently use the full visible3D envelope without raster filtering. Neither oracle nor spec was fitted to the candidate. Current official14-view independent scores, full articulation/low-quality containment, finite armor/crew rays, browser performance and composed release are still NOT RUN.

## Independent review checkpoint

The official14-view critic has reviewed this vehicle and returned **FAIL** on source-visible detail. Exact image-specific findings and historical scores are in `docs/research/regional-source-independent-critic-20260918.md`; no silhouette pass supersedes this review. Source-based detail correction and fresh full review remain required. Following shared-track integration, pre-main track and geometry hashes above are historical until revalidated.

## Post-main round13 — physical wheels, cupola windows and split rear face

Source-only wheel rays establish a deep annular cast face: hub axial0.168m, web0.0324m, raised annulus0.0802m and rubber inner radius0.269m. Sparse closed lathed stock and its measured rubber band replace the generic cap through native running gear; radius, axles and track contact are unchanged. The helper encodes no donor dimensions.

Eight viewing-window fittings now wrap the broad source dome at measured positions instead of being hidden around the smaller forward cap. The rear radiator face is split into its actual two banks of ten louvers with separate frames, center strip, hinges and low towing fixtures. Front armor now slopes sideways as well as forward around a narrow raised center, with separate authored plate segments and source-position fasteners. `sabra-relief-rays.json` and `sabra-detail-measure.json` preserve source-only scalar evidence. The neutral board was viewed; full independent official14 review remains pending. These corrections are not an every-view9 visual pass.

- Fidelity raw aggregate **94.52028084118088**, worst registered view **92.79493159139336**: PASS92 per-view bar (`fidelity-sabra-r13.json`).
- Geometry gate: **PASS**, minimum92.79493159139336, dimensions100 and floaters100 (`geometry-sabra-r13.log`); unavailable fused component classifications remain unavailable.
- Strict band/shoe front, rear and full-loop sweep **all0 at HIGH and LOW** in separate `track-sabra-r13-high/track-clip.json` and `track-sabra-r13-low/track-clip.json` receipts.
- Typecheck and native builds pass. Browser frame/switch performance, finite attachment contact, full articulation/armor/anatomy and composed release are not certified by these checks. Standard qualification and publication remain unfinished.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles |
| --- | --- | ---: | ---: |
| high | `1c5111d8` | 18312 | 84350 |
| low | `67183d0a` | 15084 | 69280 |

Node counts in `native-r13.json` include hidden/far stock and repeated instances; they are not runtime draw counts. Current profile SHA-256: `94dcbafb9233c28ee5a5a97ac5708828c8d69016784c49b93c8a614988b8b954`. Later shared bore-contract integration will require fresh hashes and affected checks.

The reusable `lathedWheelStock.ts` helper accepts a sparse caller-authored closed `[axialM,radiusM]` section and explicit segment budget. It emits fresh X-axis wheel geometry; callers own all dimensions and tire gaps. Private checks verify recessed outward front/back faces at both quality budgets, reversed authoring order, and rejection of zero-area stock. It never imports source geometry, normalizes a donor or changes running-gear placement.

## Performance round17 — measured stock and selected geometry budgets

This round explicitly adopts the existing `buildFleetTrackShoe` through the profile's native shoe-builder hook. No shared shoe helper, axle, track-course datum, source frame, body, weapon or palette was changed by this optimization. The quality-aware near shoe retains real paired pads, their central split, a connecting web and the guide horn. Its approved LOW recipe drops unresolved generic pin relief and merges surface detail; this is a declared quality difference, not the distant flat shoe or a counter adjustment. CV90, TML and Sabra wheel stock is unchanged.

The existing browser geometry census ran at the unchanged 10m HIGH/LOW distance with one worker under the capture queue. It counts selected visible instanced geometry, not all stored LODs. Its before/after identity is unchanged (`perf-r17/identity.json`, drift=[]).

| Selected metric | Previous frozen census | Round17 |
| --- | ---: | ---: |
| HIGH triangles | 80,938 | 71,310 |
| LOW triangles | 65,748 | 45,496 |
| HIGH visible objects | 40 | 40 |
| LOW visible objects | 39 | 39 |
| LOW / HIGH triangles | 81.23% | 63.80% |

**Selected geometry budgets PASS:** fixed HIGH triangle cap 100,000, object cap 65, and LOW≤75% of HIGH. This is not a browser frame-time, memory or cold/warm/rapid-switch pass.

- Fresh fidelity raw aggregate **94.52420457049855**, minimum registered view **92.82753244268699**: PASS92 (`perf-r17/fidelity.json`). Source hashes and registration are unchanged.
- Strict HIGH and LOW band/shoe front, rear and complete sweep: **all0**, separately retained in `perf-r17/track-high/track-clip.json` and `perf-r17/track-low/track-clip.json`.
- Typecheck and `europeSourceRunningGear.selftest.mjs` pass. The latter measures actual near-shoe peaks, supported web, split air and guide projection at both qualities; it also confirms preserved physical bores and KF41's side layers following native tire rotation/suspension matrices. These focused witnesses are not a complete dynamic contact/armor/anatomy certificate.
- HIGH native geometry hash `0c80ba96`; LOW `712d14af` (`perf-r17/native.json`). Profile SHA-256 `cd8261fb63b7248031f13d4a77511835fc06b2b071acd22f5d265d2446edcb4c`. Shared and new helper identities are in `perf-r17/final-freeze.json`.
- All four new neutral boards were viewed and archived under `perf-r17/boards`. Fresh official14 capture completed at `2026-09-18T10:06:14.915Z`, exit0, rig parity OK, all14 originals preserved under `perf-r17/official14/sabra_mk2_x`. Its per-ID identity records exact shared/profile/tool hashes before and after (drift=[]), plus every image/report SHA-256. Captured `tankFactoryCore.ts` SHA-256 is `22598a957e95b159fe56e9a3f9e7ec5bf4d609534b8bd120b1f0610ebbc183e3` after the parent's AFT-only closure change. Independent scoring of these new14 images is still pending; no builder self-rating or old critic pass is substituted. Previous critic FAIL receipts are retained. Full standard, anatomy, performance and composed release remain uncompleted. **NOT QUALIFIED / NOT PUBLISHED**.

## Publication receipt

Requested batch includes this ID alongside the user's other twelve additions. This draft has **no qualification or publication receipt**. No scoped as-is exception exists. Source binaries, archive extraction, renders and logs remain ignored. Commit, integrated main tests and remote main hash are pending with the parent task.


### Final shared-wheel-shader capture — 2026-09-18

The geometry remains the frozen performance-r17 candidate. The parent's shared wheel-shading correction is now captured with the native materials and fixed registered source in all fourteen official originals: `.qa-dev/tank-run/europe-source/final-shader-r18/official14/sabra_mk2_x/`. Its sibling `sabra_mk2_x-identity.json` and `capture-index.json` pin every PNG/report and relevant profile/shared/tool hash; `whole-identity.json` reports no drift across the five-model capture session. All70 image hashes were subsequently checked. The frozen `materials.ts` SHA256 is `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.

All capture commands exit0 and rig parity isOK. The builder spot-viewed the fresh hero-frontleft only; a different reviewer owns the complete every-image≥9 assessment. Earlier images and failed critiques remain preserved. Unchanged binary geometry/source scores were not rerun merely for the shader update. Qualification remains incomplete pending the new independent review and all remaining physical/performance/anatomy/release gates.


## Round19 source detail correction checkpoint — 2026-09-18

This checkpoint preserves all previous failures and does not qualify publication. Source measurements, before/after complete-scene rays and hash identities are in `.qa-dev/tank-run/europe-source/detail-r19/`. Canonical source, camera registration, wheel centers/radii, track path, shared materials and physical-bore contract are unchanged. Type checking and the existing running-gear regression pass. `europeSourceDetail.selftest.mjs` checks actual complete native HIGH/LOW stock with interior-fill records loaded and several turret/gun poses; it does not raycast an isolated substitute.

The parent subsequently found that its preceding fill command used `--stats`, a dry run. Therefore `jobs.json`, `selected.json`, `fidelity.json`, explicit strict HIGH/LOW logs and `official14/` in this directory are **loaded-prior-fill evidence only**, even though `interiorFillRecordLoaded` correctly reports true. The hashed records and all originals are preserved unchanged. They must be superseded by actual postwrite validation and independent review, not relabeled as fresh fills.

Source Object20 places the rear circular cover at (−.670,2.52142,−1.36973), about .465 m across, rather than the former native (+.50,2.57,−.64) disc. The new sparse turned section retains the measured five radial/height levels. The source has four front lamp faces, X±.682/±.814,Y1.31665,Z≈3.18. Two lamps per side now sit in rounded paired-hole guards with actual annular retaining stock and load-bearing pedestals; native first rays hit allfour hullGlass faces atZ3.1896. The broad curved main cupola remains. Only its overwide truncated forward cap is replaced with sparse source-probed crown sections; topdown measurements atZ.15/.25/.35/.45/.55 retain sourceY≈2.95054/2.92706/2.89699/2.85669/2.79991. This is measured receiving/contour work, not added depth to compensate lighting.

Profile SHA-256 `d52aed474eaac6122997762c164555a84b34557a6f479e7f0ef7044312bc514b`. Prior-fill selected cost HIGH73,542 / LOW47,144 triangles,41/40 objects; LOW64.11%, within fixed limits. Fixed-source aggregate94.75 / minimum93.02 pass92; strict HIGH/LOW band/shoe front/rear/full-sweep allzero. Fresh-fill independent14 review remains pending.


## Round20 actual regenerated-fill validation — 2026-09-18

The integrator reran the generator in actual write mode. Sabra now has80 actual generated boxes/960 triangles, up from75/900; the loaded selected model adds60 triangles and one render object. The r19 authored profile is unchanged. All following receipts actually load the hashed final record.

- Fixed-source raw aggregate **94.76**, minimum **93.03**: PASS92 in every valid registered view; full canonical source unchanged.
- Selected HIGH **73,602** / LOW **47,204** expanded triangles; **42/41** objects; LOW **64.13%**. Fixed class/object/75% limits pass. This is selected-geometry cost, not browser switching or frame timing.
- Actual complete-scene HIGH/LOW optical/lamp/crown rays with loaded fills pass (`native.log`), including changed turret/gun poses.
- Strict HIGH and LOW band/shoe front, rear and full sweep allzero; jobs all exit0 with before/after hash driftempty.
- Fresh official14 status0, fourteen PNGs and report preserved; per-ID and whole capture identities have no drift. Allimage hashes were independently recomputed.
- Prior-fill image differential: **1/14** originals byte-identical to r19. Changed images require the fresh independent review; no author score substitutes for it.

Evidence root `.qa-dev/tank-run/europe-source/detail-r20/`: `jobs.json`, `selected.json`, `fidelity.json`, `track-high/`, `track-low/`, `official14/sabra_mk2_x/`, `whole-identity.json` and `prior-fill-image-differential.json`. The author spot-inspected close-front/close-roof (TML) and close-front/hero-toptilt (Sabra); independent every-image review is assigned separately.

Final fill/shared identity:

- `src/vehicles/interiorFillGroups/sabraMk2SourceX.generated.ts`: `80b2df0b8fc42056209f57485b96f1865b020259269f986b9e8ce1b8aa390e15`
- `src/vehicles/materials.ts`: `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`
- `src/vehicles/tankFactoryCore.ts`: `1e9fb081c1c8b86e8200606de7c3350ed8f5280cffc1d4466b885abbe11b82ff`


## Round22 — real cupola-weapon ownership, 2026-09-18

The standard census previously reported MG0 because the actual receiver and barrel were merged into the generic `turretDark` bucket. These same solids now form one visible `FITTINGS.markExact(..., 'pintleMG')` mesh. The two painted supports remain in their original buckets, preserving their camo projection and weathering. Source coordinates, material, barrel axis, raised cupola, HIGH/LOW cylinder facets and the original 150m/64m detail-distance reduction remain unchanged. No empty marker or extra weapon was added.

- Frozen profile SHA-256: `83549e53cd498130cfbf2c09ac8db3e94c538a4f63af1f2fb180795a19677f18`.
- Existing `europeSourceDetail.selftest.mjs` now checks the actual first barrel/receiver hits in the complete filled HIGH/LOW model at two turret yaws, true rig ownership, finite original stock, original LOD distances and exactly-once geometry disposal. PASS; type checking and core-unused checks PASS.
- Before/after full expanded native world-triangle multisets are identical at 10µm resolution: HIGH `a70d10c0c32d62b4573725f38af43d411ab8df091c02489ca5ac839f2266831b`; LOW `b0719c5deb5118a0326ad4d0e504bb7b1323a42b70567013e1549ba86f607e6d`. This comparison includes nonselected stock; the selected census below is the performance gate.
- Filled selected HIGH/LOW remains 73,602 / 47,204 triangles (64.13%); visible objects are 43 / 42, one additional real mesh. Original 80-box fill record retained; source silhouettes 94.76 aggregate / 93.03 worst view. Strict band, shoe and sweep witnesses remain zero at HIGH and LOW.
- Fresh native standard-page diagnostic: MG1, one marked real mesh, continuity0, loaded fill record true, no page errors. Diagnostic copy retains the committed scan calculations and adds full cell coordinates to the report only; no gate change.
- Fresh official14: `.qa-dev/tank-run/europe-source/sabra-fitting-r22/official14/sabra_mk2_x`; sibling identity manifest pins all image/profile/shared hashes, with no drift. Ten images byte-match the round20 originals; four changed (`close-front`, `close-roof`, `hero-frontleft`, `hero-toptilt`) after the actual gun became a separately owned mesh. Parent independently reviews the new originals; author does not self-certify them.
- Private evidence root: `.qa-dev/tank-run/europe-source/sabra-fitting-r22/`; `jobs.json`, `selected.json`, `fidelity.json`, `track-high/`, `track-low/`, `native.log`, `before-stock.json`, `after-stock.json`, `standard-native.json` and `r20-image-differential.json` retain exact observations. Two unsuccessful private diagnostic-page plumbing attempts are preserved as harness errors; they are not passing evidence.

This resolves Sabra's missing equipment registration only. It does not waive any composed release requirement or another tank's absent-source weapon question. Publication remains NOT QUALIFIED until the integrator completes the final independent and composed checks.


Round22 independent follow-up: root inspected and hash-verified every fresh official image; all fourteen meet the scoped ≥9/10 visual bar. See `docs/research/sabra-fitting-independent-review-20260918.md`. This confirms visual preservation of the real cupola weapon and existing stock; simplified fine hardware remains noted. Reconsider affected receipts if the subsequent shared generation changes fill, marking or presentation data. It is not a full composed release certificate.


Postgeneration preservation check: the Sabra fill and per-ID marking files are byte-identical to round22. The global presentation file changed for other repaired IDs; Sabra's own anchor remains X−0.0006/Z−0.1095m and projection remains centerY2.5355/topHalf5.9995/sideHalf2.9997m. These rows exactly match the preserved `presentationAnchors.generated-DwbZxkep.js` from the successful pre-generation private build, bracketed by matching source hashes before that build and at the round22 capture. Provenance and the actual compiled artifact are retained in `sabra-fitting-r22/postgeneration-sabra-presentation-equivalence.json`. No whole-file equality is claimed; the independently reviewed Sabra visuals remain applicable.


## Pitching receiver ownership checkpoint — 2026-09-18

Existing receiving stock now follows gun pitch without following barrel recoil. The actual tube and muzzle retain their recoil owner; no source dimensions, neutral primitives or pivots changed. Neutral HIGH/LOW visible world triangles, transformed normals, UVs, colors and materials match the prior model exactly. Filled native legal-pitch/recoil/return checks pass; TML optical faces additionally retain full-scene recess depth, unlimited former visibility through near/far LOD changes and exactly-once disposal.

Current profile SHA-256: `9c8ad551962a09530f1d813f9102f9982165f41b6356f38455fb14835221dd86`. Details and the genuine KF41 pre-fix failure are preserved in [the ownership repair report](../../research/europe-gun-ownership-repair-20260918.md). The parent owns affected anatomy/fill regeneration and final integration evidence. Earlier static-shape evidence is preserved; no composed release pass or waiver of existing source/roof-MG policy conflicts is claimed here.
