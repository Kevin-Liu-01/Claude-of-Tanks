# KF41 Lynx Prototype X — run packet

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Historical author checkpoint

- Updated: 2026-09-18 (post-main round9).
- Owner request: run the OP source-backed procedure on the supplied vehicles, then commit and push origin main after qualification.
- ID: `kf41_lynx_x`; display name: KF41 Lynx Prototype X.
- Implementation: independent first-party procedural draft; shared integration owned by the parent task.
- Qualification: **IN PROGRESS / NOT QUALIFIED**. Round21 actual-filled HIGH/LOW native/contact checks, immutable-source silhouettes and stable selected-geometry costs pass. Fresh14-view shaded captures include current generated fill and marking records; independent review of changed images is pending. Earlier scoped r18 visual pass is retained at its exact image hashes. Source roof-weapon policy and full composed release remain open.
- Publication: **NOT PUBLISHED**; ordinary requested commit/push authority does not waive failed gates.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`, branch `codex/kurganets-odztz-generation-20260917`, baseline `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Initial draft profile SHA-256: `eb3790f63d79855ae3579ed3b8da0719de469ac91b2b5c4798875e116b597fdf` (later geometry invalidates this snapshot).
- Next: finish actual postwrite-fill differential validation and independent review, retain source-equipment conflicts, and complete integrator-owned performance, anatomy/assets and composed release.

## Scope and preservation

Independent X addition. Original fleet profiles and IDs are unchanged. Owned profile `src/vehicles/profiles/kf41LynxSourceX.ts` uses only generic authored solid/fitting vocabulary from `europeSourcePrimitives.ts` and the shared suspension gear. Metadata is isolated in `src/vehicles/europeSourceStudyData.ts`; integrator owns shared registry changes. Balance donor: spz_puma. Existing high/low and generated-record preservation checks remain NOT RUN. No source meshes, textures, indices, dense contours or runtime source loaders are added.

## Source and comparison contract

- Local source: `/Users/kevinliu/Downloads/kf41_lynx_prototype_armored_warfare.glb`.
- Raw SHA-256: `ff6b3b4555c703fad655b961c137befcdd6e204e3c0c46c20dccf8dc59813324`; 28,918,796 bytes; GLB.
- Credits: owner-supplied game-derived comparison. GLB embedded metadata names KojfDiscord / Sketchfab and a CC-BY-4.0 string; this is embedded provenance evidence, not independently verified redistribution permission. Runtime model is independently authored first-party geometry. Source files remain local only.
- Source bounds (native metres, min→max): `[-1.801669955253601, -0.004199999850244136, -3.9219000339508057]` → `[1.801669955253601, 6.430379867553711, 4.731490135192872]`.
- Source has 23 mesh nodes; supplied GLBs have no animation/skin rigs. Generic/mixed source mesh boundaries do not establish independently articulated component truth. Whole-source comparison retains every mesh.
- Target: supplied source's complete configuration and proportions. No prior batch target exception is inherited.
- Preparation: `node tools/source-x-oracle.mjs --prepare=<raw path> --recipe=.qa-dev/tank-run/europe-source/kf41_lynx_x-recipe.json --report=.qa-dev/tank-run/europe-source/kf41-oracle.json`. Tools at worktree baseline; Node v24.13.0. OBJ→GLB preparation directly reads unchanged source vertices in the declared rigid frame; no geometry conversion is used in the playable.
- Oracle: `public/models/community-candidates/kf41_lynx_x_source.glb`; SHA-256 `999a4238c86319612a94b5b1204b477304c46b4e8ea9899097f4a9a7a3377b9f`.
- Registration: proper identity axis map `x,y,z`, uniform scale1, translation `[0, 0.004199999850244136, 0]`. Source ground minimum alone defines Y translation. No lateral/longitudinal recentering or nonuniform scale.
- Ground is complete source minimumY. Two tall antenna whips, 6.43458m full height; structural equipment top 3.4808m. Turret yaw [0,2.29,-0.15]; inferred gun trunnion [-0.01164,2.60336,0.70].
- Omitted source components: **none**. Inferred turret/gun pivots are implementation assumptions, to be checked under articulation.
- Diagnostic source views: Blender 5.2.0 LTS, native imported transform, ortho 1000×760, neutral pose; front/quarter/side/top/rear under `.qa-dev/tank-run/europe-source/kf41-*.png`. These are intake studies, not official parity certification.
- Published dimensions are not asserted from filenames. Scalar `dimensions` metadata records supplied-source measurements, with structural height distinguished from complete antenna silhouette. The current source-only mask and full3D envelope comparison passes the native3% dimension bound; exact residuals are recorded below.
- Required bar: ≥92 overall and in every registered silhouette view; complete geometry/physical/independent critic/performance checks per tank-generation handbook.
- Roof weapon conflict: preserve supplied equipment. A generic mandatory-MG census does not authorize inventing a weapon; any absent-source conflict must remain explicit. Sabra alone visibly carries the cupola gun in this subgroup.

## Construction work order

Broad tall flat-deck troop hull, six exposed lower road wheels, full-height side armor cells, and a low angular turret with a deep central gun-shroud slot.

Hull/turret station lofts are sparse authored primary solids; measured source vertices/topology are never embedded. Intake ray tables and named wheel-island scalar bounds live in ignored `kf41-landmarks.json` / `kf41-axles.json` where applicable. Primary shells retain physical belly, lower glacis, side and roof closures. Gun-shroud slot between x=±0.34 at the turret front; track channels below the 1.45m sponson datum.

Running gear: Six road centers z=[-1.8858,-1.0331,-0.1804,0.6724,1.5251,2.3778], radius0.3675, y0.4705; rear idler[-2.9123,0.9582,r0.26], front sprocket[z3.2509,y1.0299,bodyR0.295,pitchR0.282,toothTipR0.351]. Shared suspension and smart-track assembly owns all moving wheel faces, return rollers, end wheels and shoes. Pattern defaults are explicitly selected, never overlaid with static fake wheels. Return roller placements are inferred under side covers pending posed review; this is not a source-exact certification.

High/low uses quality-aware cylinder and grille segment counts; common primitive reuse retains native resource ownership. Initial geometry/build/draw/memory costs and full tank-switch timings remain NOT RUN. Permanent shaped armor is retained, no removable ERA is asserted without source evidence. Equipment uses addEquipment with owner-local coordinates; hatches and structural stock remain seated. Gun mouth contains an open annulus, inward wall and recessed termination. Shared combat metadata, finite armor rays, anatomy, crew, markings and release integration are pending with the integrator.

## Evidence matrix

| Gate | Status | Artifact / residual |
| --- | --- | --- |
| Raw source identity / archive safety / rigid frame | PASS | Intake and oracle JSON; hashes above; no omitted meshes |
| Source front / side / quarter / rear / top inspection | PASS | Five intake PNGs, neutral pose only |
| Every registered silhouette / raw aggregate | PASS | Current raw aggregate and every-view minimum below; exact frozen high-quality candidate |
| Geometry components / dimensions within 3% | PASS whole / PARTIAL components | Complete canonical source dimension residuals below; fused independent component truth remains unavailable |
| Independent critic / Gallery high and low | PASS scoped HIGH r18 / final fill coverage pending | See dated independent report and appended round history; no LOW visual or full release inference |
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
| 1 | 95.260 | 92.351 | PASS | `fidelity-r1.json` |
| 2 | 95.260 | 92.351 | PASS | `fidelity-r2.json` |
| 3 | 95.954 | 93.495 | PASS | `fidelity-r3.json` |

Round3 geometry minimum 93.49523920109266; components `{"wholeCurves":93.49523920109266,"dims":97.55489614243317,"floaters":100}`. This is a historical result, invalidated for current geometry by round4 edits. Reference body-p95 height is 3.4681165287271143m; the metadata now uses that source-only value, distinct from the full antenna envelope.

Round3 strict track results (band/shoe voxels): front 0/0, rear 0/0, sweep 0/0. Continuity: 0 unintended sky cells. Full independent contact/articulation review still pending.

Round4 profile SHA-256: `e7e1f1501e49d0301b6b7c64749acfd3df7e077229fe8884794f2c257228e2a8`; shared primitive SHA-256: `7481045577c08c1419bc403ab36b816e791345ab95df446b8a85fe1d5d93c359`. Full instance-aware candidate hashes are recorded in `native-r4.json`; CPU construction evidence is not a browser performance pass.

Independent preliminary quarter-board critic identified star-like generic wheel ribs, an overly tall wedge under the forward cheeks, and squared bow fittings (roughly8/10 diagnostic, not an official14-view score). Round4 uses plain dish stock, a physical thin turret bearing, flatter source-measured cheek underside and flush raked lamps. Current masked views/independent verdict remain pending.

No standard weapon census pass is asserted: KF41/CV90/TML source configurations have no roof MG; Sabra has its actual cupola weapon but no KIT.fittings marker. These require a source-aware qualification decision; none is treated as a completed gate.

Round4 frozen result: fidelity aggregate96.0294, worst registered view93.5105, PASS92 bar; geometry minimum93.5105, PASS. Strict band and shoe front/rear/full-loop sweep all0 in `track-r4.json`. These machine checks do not replace the pending official14-view independent review, full high/low presentation, runtime switching, anatomy and composed release gates.

## Current frozen validation — round7

Round7 source muzzle measurement corrected the gun axis to world `[-0.01164, 2.60336, 0.70]`. The visible source brake radius is0.07855m with an approximately0.0526m inner opening; the authored35mm bore is recessed behind that larger brake mouth. The independent sparse shroud follows the source lower axis without copying source topology. No missile launcher or roof MG is visible in this supplied configuration; inherited launcher gameplay was removed by integration.

- Fidelity source round7: raw aggregate **96.86832180138644**, worst registered view **95.63588750664364**, both pass92. Full canonical source remains unscaled and complete.
- Geometry raw minimum **95.63588750664364**; raw components `{"wholeCurves":95.63588750664364,"dims":97.55489614243317,"floaters":100}`. Missing fused component classifications are unavailable, not invented passes.
- Strict band/shoe front, rear and full-loop sweep: **0/0, 0/0, 0/0** for all four IDs in `track-r7.json`. These scans currently use high quality; low remains NOT RUN.
- Standard overall: **FAIL** (`standard-r7.log`), not a completed qualification receipt.
- Current profile SHA-256: `3bb3501e605667f219b81aefef0218c395f419ff461e6624115fcf4b7f7fa03e`; shared primitive SHA-256: `b8e938212b91f756ef67eb71754d9dad4a5ef48b6455d9742ad509bb6b770075`.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles | Node build ms |
| --- | --- | ---: | ---: | ---: |
| high | `cfe40bf5` | 7952 | 61762 | 768.3 |
| low | `858bb4b6` | 6388 | 55884 | 668.7 |

Counts in `native-r7.json` include stored hidden/far meshes. Node construction is diagnostic, not a browser frame, memory or tank-switch performance pass. The seed is4242; both quality builds completed with finite bounds.

| Dimension | Candidate m | Source m | Absolute residual |
| --- | ---: | ---: | ---: |
| heightM | 3.468117 | 3.468117 | 0.0000% |
| hullLengthM | 7.789572 | 7.689179 | 1.3056% |
| overallLengthM | 8.670291 | 8.652038 | 0.2110% |
| widthM | 3.614142 | 3.595889 | 0.5076% |
| physicalWidthM | 3.618000 | 3.603340 | 0.4068% |
| physicalHeightM | 6.438425 | 6.434580 | 0.0598% |
| physicalOverallLengthM | 8.673490 | 8.653390 | 0.2323% |

Mask-derived rows use paired identical measurements in the source-only fixed frame. Physical rows independently use the full visible3D envelope without raster filtering. Neither oracle nor spec was fitted to the candidate. Current official14-view independent scores, full articulation/low-quality containment, finite armor/crew rays, browser performance and composed release are still NOT RUN.

## Post-main round9 — independent detail corrections

The official14 critic reviewed every prior image and returned **FAIL** (detail minimum7.5/10). Its historical source-specific findings are preserved in `docs/research/regional-source-independent-critic-20260918.md`; that result is not superseded by a silhouette pass.

Source-only connected-part bounds and rear/driver rays are retained in `kf41-detail-measure.json`, `kf41-surface-detail-rays.json` and `kf41-driver-right-rays.json`. Round9 corrects the source +X driver cover, paired polygonal turret hatch covers/hinges, eight diagonal fasteners per cheek, recessed central ramp, and two outboard rear louver panels. Ramp and rear wings are closed actual hull solids; no backing slab fills the source recess.

Current fidelity raw aggregate97.11621660897144 and worst view95.74065835407453 pass92. Strict HIGH **and LOW** band/shoe front/rear/full-loop scans are all0 after the shared-track integration: `track-kf41-r9-high/track-clip.json`, `track-kf41-r9-low/track-clip.json`. Full typecheck passes. Fresh geometry gate passes with minimum95.74065835407453, dimensions100 and floaters100 (`geometry-kf41-r9.log`). The official14-view repeat confirms the corrected rear, hatches, fasteners and driver cover but remains FAIL for flat wheel faces, cheek/mantlet cavities and roof-sensor structure. Its exact findings remain in the independent critic report. These round9 receipts are historical once round12 wheel/cheek/sensor changes begin.

Current profile SHA256 `f7f5bf4c8568da95faf896c9ad668003872805aaff377823d6e5a237e152ece1`; high hash `97ab3171`, low `2915049e`. The complete raw quality counts remain in `native-r9.json`. No absent-source MG was added, and the source-policy decision remains pending. **NOT QUALIFIED / NOT PUBLISHED**.

## Post-main round12 — physical wheel and front receiver relief

Source-only radial rays on the road wheel establish paired tire spans separated by about69mm of air, a web recessed to axial0.0595m, hub front0.198m and annular return radius0.309m. Two sparse independently authored closed rotational sections, a shared axle core and separate rubber bands replace generic capped stock through the native running-gear hooks. The wheels keep the existing measured radius, axles, track contact and shared articulation. No source positions/indices are copied into runtime.

The front cheek receivers now surround physical equipment pockets, with differing positive/negative-side source layouts. Closed cheek stock remains behind the pockets. The roof sensor now has a narrow neck, wider collar and faceted head, with seated forward fittings. These changes follow source-only scalar bounds and rays (`kf41-front-rays.json`, `kf41-detail-measure.json`, `wheel-face-rays.json`). The neutral source board was viewed; a fresh independent official14 review is required before overriding the round9 FAIL.

- Fidelity raw aggregate **97.11174915008792**, worst registered view **95.867580970755**: PASS92 per-view bar (`fidelity-kf41-r12.json`).
- Geometry gate: PASS; unavailable component classifications remain unavailable.
- Strict band/shoe front, rear and full-loop sweep **all0 at HIGH and LOW** in separate `track-kf41-r12-high/track-clip.json` and `track-kf41-r12-low/track-clip.json` receipts.
- Typecheck and native builds pass. Browser frame/switch performance, finite attachment contact, full articulation/armor/anatomy and composed release are not certified by these checks. Standard qualification and publication remain unfinished.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles |
| --- | --- | ---: | ---: |
| high | `b2cddb98` | 14122 | 84916 |
| low | `1d1b1e49` | 11446 | 70270 |

Node counts in `native-r13.json` include hidden/far stock and repeated instances; they are not runtime draw counts. Current profile SHA-256: `82fb09316e417ea91b926b2cd4b87927572d17be7828d6354599d703211888cd`. Later shared bore-contract integration will require fresh hashes and affected checks.

The reusable `lathedWheelStock.ts` helper accepts a sparse caller-authored closed `[axialM,radiusM]` section and explicit segment budget. It emits fresh X-axis wheel geometry; callers own all dimensions and tire gaps. Private checks verify recessed outward front/back faces at both quality budgets, reversed authoring order, and rejection of zero-area stock. It never imports source geometry, normalizes a donor or changes running-gear placement.

## Rounds15–16 — measured wheel stamping and central receiver

The latest source wheel rays resolve a shallow stamped annulus: the recessed web sits at axial0.0595m, rises to0.0709m at radius0.220m, and returns to0.0595m near radius0.280m. The sparse native rotational section now retains that roughly11mm rise. Source connected-part bounds establish eight web fasteners on radius0.1622m and four hub fasteners on radius0.1003m, replacing the earlier twelve-fastener donor pattern. Both wheel faces have real seated washers and heads; the paired tire stock, measured radius, axle stations and suspension settings are unchanged. Source evidence is `wheel-face-rays.json` and `kf41-r15-wheel-components.json`.

The central receiver now separates its chamfered body from the projecting side bolt heads, lower receivers and raised side handle. Source slice rays distinguish the broad parallel receiver from the tapered forward shroud; using the complete assembly bounding box had incorrectly absorbed the bolt projection into the body width. The independently authored solid follows those sparse scalar stations (`kf41-r15-gun-details.json`, `kf41-r15-shroud-rays.json`). Parent integration's verified physical35mm muzzle, open outer brake and recessed backstop remain intact.

Native FrontSide rays use the actual final instanced wheel center. The shared loaded-running-gear fit places that center atY0.438500m,32mm below the declared/source0.4705m center; this residual is disclosed rather than hidden by moving the axles. The earlier `kf41-native-wheel-rays-r12.json` diagnostic used the nominal center and cannot establish the final radial section. The corrected `kf41-native-wheel-rays-r16.json` measures the actual stock. These geometry-receipt rays use the named non-rendering diagnostic material and do not prove the browser's final shaded draw path.

- Round15 historical fidelity aggregate97.09891648297503, worst95.867580970755, and HIGH/LOW strict track scans all0. Final round16 fastener edits invalidate the earlier geometry hashes.
- Round16 fidelity raw aggregate **97.09891648297503**, worst registered view **95.867580970755**: PASS92 (`fidelity-kf41-r16.json`). Every canonical source mesh and the source-only frame are retained.
- Round16 strict HIGH **and LOW** band/shoe front, rear and complete sweep: **all0** (`track-kf41-r16-high/track-clip.json`, `track-kf41-r16-low/track-clip.json`). Both commands completed successfully.
- Typecheck and both native quality builds pass (`typecheck-kf41-r16.log`, `native-r16.json`). No new composed standard or geometry gate receipt is claimed for round16.
- The new neutral board was viewed. Its wheel relief is visible, but it is not an independent14-view verdict. Official repeat captures are paused while the parent investigates the shared track shading draw path. Prior rendered comparisons remain historical; binary geometry checks retain their scope.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles |
| --- | --- | ---: | ---: |
| high | `ce8b6e0e` | 16418 | 108332 |
| low | `6d481e91` | 13308 | 89028 |

Profile SHA-256: `eaeb672bc96ff41d3a92c6e46463b061e0e244a3cf651214b66a5e4a93d93f91`. Counts include hidden/far geometry and repeated instances. The additional source wheel hardware raises expanded geometry; this is recorded cost, not a browser performance pass. Independent per-view9, source weapon-policy resolution, finite contact/full articulation, anatomy and composed release remain unfinished. **NOT QUALIFIED / NOT PUBLISHED**.

## Performance round17 — measured stock and selected geometry budgets

This round explicitly adopts the existing `buildFleetTrackShoe` through the profile's native shoe-builder hook. No shared shoe helper, axle, track-course datum, source frame, body, weapon or palette was changed by this optimization. The quality-aware near shoe retains real paired pads, their central split, a connecting web and the guide horn. Its approved LOW recipe drops unresolved generic pin relief and merges surface detail; this is a declared quality difference, not the distant flat shoe or a counter adjustment. CV90, TML and Sabra wheel stock is unchanged.

KF41 additionally removes the incorrect mirrored outboard fastener/hub assembly. Fresh source-only inboard rays establish a plain axle back at axial−0.1643m through radius0.120m, and a stamped inner web near−0.0597m. All 29 small connected source wheel components in the sampled positive-side wheel lie outboard; no mirrored inner fasteners were present. The source outer hub, stamped annulus, eight web/four hub bolts and paired tire gap remain. Sparse independently authored side-specific stock uses the existing suspension-owned wheel-layer hook; no static second wheel set is added. The original shared material roles remain painted steel and rubber-dark inset heads.

The specialized `kf41LynxWheelStock.ts` removes zero-area lathe axis triangles and buried backs only on actually seated web fasteners. Hub washer backs remain because their shoulders can overhang. HIGH retains 32 angular samples; LOW uses 24 aligned with the 12-segment tire opening. A lower-segment inboard trial failed a finite rim witness and was discarded, rather than accepting an annular gap. Source evidence: `perf-r17/source-wheel-inboard.json` and historical `kf41-r15-wheel-components.json`. Both-side FrontSide stock rays and the 8+4 hardware cadence pass `kf41LynxWheelStock.selftest.mjs`.

The existing browser geometry census ran at the unchanged 10m HIGH/LOW distance with one worker under the capture queue. It counts selected visible instanced geometry, not all stored LODs. Its before/after identity is unchanged (`perf-r17/identity.json`, drift=[]).

| Selected metric | Previous frozen census | Round17 |
| --- | ---: | ---: |
| HIGH triangles | 104,416 | 76,332 |
| LOW triangles | 85,112 | 52,740 |
| HIGH visible objects | 39 | 42 |
| LOW visible objects | 38 | 41 |
| LOW / HIGH triangles | 81.51% | 69.09% |

**Selected geometry budgets PASS:** fixed HIGH triangle cap 80,000, object cap 85, and LOW≤75% of HIGH. This is not a browser frame-time, memory or cold/warm/rapid-switch pass.

- Fresh fidelity raw aggregate **97.07688690636542**, minimum registered view **95.86763457710207**: PASS92 (`perf-r17/fidelity.json`). Source hashes and registration are unchanged.
- Strict HIGH and LOW band/shoe front, rear and complete sweep: **all0**, separately retained in `perf-r17/track-high/track-clip.json` and `perf-r17/track-low/track-clip.json`.
- Typecheck and `europeSourceRunningGear.selftest.mjs` pass. The latter measures actual near-shoe peaks, supported web, split air and guide projection at both qualities; it also confirms preserved physical bores and KF41's side layers following native tire rotation/suspension matrices. These focused witnesses are not a complete dynamic contact/armor/anatomy certificate.
- HIGH native geometry hash `c7b19bb0`; LOW `feadd904` (`perf-r17/native.json`). Profile SHA-256 `0d5c28420b0abfc4f8205d119d75945bdb60b7e9f8d3323b6ddeebf98bc63f4c`. Shared and new helper identities are in `perf-r17/final-freeze.json`.
- All four new neutral boards were viewed and archived under `perf-r17/boards`. Fresh official14 capture completed at `2026-09-18T10:05:56.462Z`, exit0, rig parity OK, all14 originals preserved under `perf-r17/official14/kf41_lynx_x`. Its per-ID identity records exact shared/profile/tool hashes before and after (drift=[]), plus every image/report SHA-256. Captured `tankFactoryCore.ts` SHA-256 is `22598a957e95b159fe56e9a3f9e7ec5bf4d609534b8bd120b1f0610ebbc183e3` after the parent's AFT-only closure change. Independent scoring of these new14 images is still pending; no builder self-rating or old critic pass is substituted. Previous critic FAIL receipts are retained. Full standard, anatomy, performance and composed release remain uncompleted. **NOT QUALIFIED / NOT PUBLISHED**.

## Publication receipt

Requested batch includes this ID alongside the user's other twelve additions. This draft has **no qualification or publication receipt**. No scoped as-is exception exists. Source binaries, archive extraction, renders and logs remain ignored. Commit, integrated main tests and remote main hash are pending with the parent task.


### Final shared-wheel-shader capture — 2026-09-18

The geometry remains the frozen performance-r17 candidate. The parent's shared wheel-shading correction is now captured with the native materials and fixed registered source in all fourteen official originals: `.qa-dev/tank-run/europe-source/final-shader-r18/official14/kf41_lynx_x/`. Its sibling `kf41_lynx_x-identity.json` and `capture-index.json` pin every PNG/report and relevant profile/shared/tool hash; `whole-identity.json` reports no drift across the five-model capture session. All70 image hashes were subsequently checked. The frozen `materials.ts` SHA256 is `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.

All capture commands exit0 and rig parity isOK. The builder spot-viewed the fresh hero-frontleft only; a different reviewer owns the complete every-image≥9 assessment. Earlier images and failed critiques remain preserved. Unchanged binary geometry/source scores were not rerun merely for the shader update. Qualification remains incomplete pending the new independent review and all remaining physical/performance/anatomy/release gates.


## Round18 independent shaded review checkpoint — 2026-09-18

An independent reviewer actually inspected the fourteen final-shader originals and recorded source fit/detail/static seating of at least9 in every image. See `docs/research/regional-source-independent-critic-20260918.md` and `.qa-dev/tank-run/independent-regional-review/final-shader-r18-review.json`. The matched source and native silhouette, primary source equipment, corrected wheels and open mechanisms meet that scoped HIGH gallery review. It does not certify LOW or moving contact, performance, anatomy, source roof-weapon policy, actual newly generated interior-fill coverage or composed release. The originals and identities remain archived under `.qa-dev/tank-run/europe-source/final-shader-r18/official14/kf41_lynx_x/`; later final loaded captures must preserve this history. Publication remains NOT PUBLISHED.


## Round21 actual-filled evidence refresh — 2026-09-18

No profile geometry was edited. The r18 shader archive predated explicit async interior-fill preload in the QA pages; this run explicitly loads final records and tests actual emitted stock. Eager factory registration also includes the current generated marking seats. The complete run, exact implementation/record hashes, source masks and images are preserved under `.qa-dev/tank-run/europe-source/filled-r21/`.

- Native HIGH/LOW: installed fill boxes match decoded source records exactly—**{'hull': 0, 'turret': 3, 'gun': 3}**, **72** fill triangles. Finite geometry plus the focused source wheel, installed wheel/layer, track-pad air, bore and attachment tests pass after preload (`native.json`, `native.log`).
- Fixed unchanged-source comparison: raw aggregate **97.08**, minimum view **95.87**, PASS≥92 for every valid view (`fidelity.json`).
- Strict HIGH and LOW: band/shoe front, rear and complete-sweep intersections allzero, no reported anomaly (`track-high/`, `track-low/`).
- Stable selected10m cost: HIGH **76,404**, LOW **52,812** expanded triangles; objects **44/43**; LOW **69.12%**. Fixed IFV80k/85object and LOW75% limits pass (`selected-final.json`). This is not a browser timing/memory/switching claim.
- Initial census overlapped an integrator centering-record write. Its `selected.json` and `jobs.json` retain the honest `presentationAnchors.generated.ts` drift. After centering froze, **only that census** was rerun; `selected-final.json` and `census-final-job.json` pass with no drift. Source/strict jobs had no drift and were not needlessly repeated.
- Fresh official14: status0,14original PNGs, current fill record loaded, source-world shared camera. Every image hash recomputed; per-ID and whole capture before/after identities are unchanged. Versus r18, **6/14** PNGs are byte-identical and **8** changed. `r18-image-differential.json` retains both complete file hashes. Changed originals require independent review; the author does not self-certify them.

No new source-equipment waiver, raw-target change, complete anatomy/release result or publication is inferred. The earlier r18 visual verdict remains historical at its image hashes until the independent reviewer accepts the changed filled presentation.

Final relevant hashes:

- `src/vehicles/profiles/kf41LynxSourceX.ts`: `0d5c28420b0abfc4f8205d119d75945bdb60b7e9f8d3323b6ddeebf98bc63f4c`
- `src/vehicles/interiorFillGroups/kf41LynxSourceX.generated.ts`: `febc69d3fbd1444fe5056bf77489392a777046c6590b6ad8f999385ba7ba2637`
- `src/vehicles/vehicleMarkingSeatGroups/kf41LynxSourceX.generated.ts`: `75f332cb6fbe20f73fb9925543d67500b92cf15319471af86cd75dbb2974022c`
- `src/vehicles/presentationAnchors.generated.ts`: `9bf2b5dc77d9a7e4e4435a65ba77581fe90d6d4da560a06508a7a488bbd1a770`
- `src/vehicles/materials.ts`: `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`
- `src/vehicles/tankFactoryCore.ts`: `1e9fb081c1c8b86e8200606de7c3350ed8f5280cffc1d4466b885abbe11b82ff`


## Pitching receiver ownership checkpoint — 2026-09-18

Existing receiving stock now follows gun pitch without following barrel recoil. The actual tube and muzzle retain their recoil owner; no source dimensions, neutral primitives or pivots changed. Neutral HIGH/LOW visible world triangles, transformed normals, UVs, colors and materials match the prior model exactly. Filled native legal-pitch/recoil/return checks pass; TML optical faces additionally retain full-scene recess depth, unlimited former visibility through near/far LOD changes and exactly-once disposal.

Current profile SHA-256: `f8aabae335013d1ec09c52857146a9162b8523bbe686b913b008b890953ef938`. Details and the genuine KF41 pre-fix failure are preserved in [the ownership repair report](../../research/europe-gun-ownership-repair-20260918.md). The parent owns affected anatomy/fill regeneration and final integration evidence. Earlier static-shape evidence is preserved; no composed release pass or waiver of existing source/roof-MG policy conflicts is claimed here.
