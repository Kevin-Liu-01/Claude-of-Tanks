# CV90105 TML X — run packet

## Current integrated status — 2026-09-18

Implemented draft; final qualification and publication are pending. The owner
approved correctly assembled sources, actual supplied equipment and measured
intentional openings. Latest generation and validation are recorded in the
[batch's final visual closure and release verification](../batches/supplied-afv-20260917.md#final-visual-closure-and-release-verification--2026-09-18).
Earlier rounds below are historical evidence; their pending checks, profile
hashes and costs must not be substituted for the final integrated results.


## Historical author checkpoint

- Updated: 2026-09-18 (round20 actual postwrite-fill checkpoint; historical receipts retained).
- Owner request: run the OP source-backed procedure on the supplied vehicles, then commit and push origin main after qualification.
- ID: `cv90105_tml_x`; display name: CV90105 TML X.
- Implementation: independent first-party procedural draft; shared integration owned by the parent task.
- Qualification: **IN PROGRESS / NOT QUALIFIED**. Round19 source-measured detail corrections are frozen. Round20 actual postwrite-fill HIGH/LOW physical checks, source silhouettes and selected-cost checks pass; fresh official14 captures are hash-pinned and undergoing independent review. Full composed release and equipment-policy gates remain open. Historical prior-fill receipts remain labeled and preserved.
- Publication: **NOT PUBLISHED**; ordinary requested commit/push authority does not waive failed gates.
- Worktree: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917`, branch `codex/kurganets-odztz-generation-20260917`, baseline `bb6c66d38efcddb245c6bcbcee6067085212fbcd`.
- Initial draft profile SHA-256: `e25ad6cdae2921e5ae4a5a1493244e9056f508ae00c0e5f6eb381adefcac87d6` (later geometry invalidates this snapshot).
- Next: finish actual postwrite-fill differential validation and independent review, retain source-equipment conflicts, and complete integrator-owned performance, anatomy/assets and composed release.

## Scope and preservation

Independent X addition. Original fleet profiles and IDs are unchanged. Owned profile `src/vehicles/profiles/cv90105TmlSourceX.ts` uses only generic authored solid/fitting vocabulary from `europeSourcePrimitives.ts` and the shared suspension gear. Metadata is isolated in `src/vehicles/europeSourceStudyData.ts`; integrator owns shared registry changes. Balance donor: leo1a5 (105mm balance metadata only; no donor silhouette). Existing high/low and generated-record preservation checks remain NOT RUN. No source meshes, textures, indices, dense contours or runtime source loaders are added.

## Source and comparison contract

- Local source: `/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/europe-source/archive/CV90105_TML.obj`.
- Raw SHA-256: `9b6f83b3ac4cc93d18fa46e3e3fdf51dd6930ad1adce1f3c5a462e769f255536`; 17,031,333 bytes; OBJ.
- Credits: owner-supplied game-derived comparison. GLB embedded metadata names KojfDiscord / Sketchfab and a CC-BY-4.0 string; this is embedded provenance evidence, not independently verified redistribution permission. Runtime model is independently authored first-party geometry. Source files remain local only.
- Supplied outer archive `/Users/kevinliu/Downloads/cv90105-tml-armored-warfare.zip`, SHA-256 `9fd25a6f33d791980f333d32723aa9a80f98dc354fe3bb71b4e6cab8d62371ab`, 26,801,122 bytes. Nested `source/CV90105_TML.zip` SHA-256 `516983b31bd491e76e3e23bd730cec6de6ee5a7dabac8aabf9ab7f46c2fd225f`. Every nested member was checked for absolute paths, traversal and symlinks before extraction. OBJ and supplied MTL/textures are retained unchanged under the ignored intake directory.
- Source bounds (native metres, min→max): `[-1.5565999746322632, -0.0012000000569969416, -3.310499906539917]` → `[1.5614999532699585, 4.644029140472412, 4.779990196228027]`.
- Source has 43 mesh nodes; supplied GLBs have no animation/skin rigs. Generic/mixed source mesh boundaries do not establish independently articulated component truth. Whole-source comparison retains every mesh.
- Target: supplied source's complete configuration and proportions. No prior batch target exception is inherited.
- Preparation: `node tools/source-x-oracle.mjs --prepare=<raw path> --recipe=.qa-dev/tank-run/europe-source/cv90105_tml_x-recipe.json --report=.qa-dev/tank-run/europe-source/cv90105-oracle.json`. Tools at worktree baseline; Node v24.13.0. OBJ→GLB preparation directly reads unchanged source vertices in the declared rigid frame; no geometry conversion is used in the playable.
- Oracle: `public/models/community-candidates/cv90105_tml_x_source.glb`; SHA-256 `6e5770019f47d2c3de157e4eee77257e0f7ad1680b18b0655a1197362070efcc`.
- Registration: proper identity axis map `x,y,z`, uniform scale1, translation `[0, 0.0012000000569969416, 0]`. Source ground minimum alone defines Y translation. No lateral/longitudinal recentering or nonuniform scale.
- Ground is complete source minimumY. Turret yaw[0.016,1.595,-0.62]; inferred gun trunnion[0.016,1.878,0.70], muzzleZ4.77999. Full source includes antenna peak4.64523m.
- Omitted source components: **none**. Inferred turret/gun pivots are implementation assumptions, to be checked under articulation.
- Diagnostic source views: Blender 5.2.0 LTS, native imported transform, ortho 1000×760, neutral pose; front/quarter/side/top/rear under `.qa-dev/tank-run/europe-source/cv90105-*.png`. These are intake studies, not official parity certification.
- Published dimensions are not asserted from filenames. Scalar `dimensions` metadata records supplied-source measurements, with structural height distinguished from complete antenna silhouette. The current source-only mask and full3D envelope comparison passes the native3% dimension bound; exact residuals are recorded below.
- Required bar: ≥92 overall and in every registered silhouette view; complete geometry/physical/independent critic/performance checks per tank-generation handbook.
- Roof weapon conflict: preserve supplied equipment. A generic mandatory-MG census does not authorize inventing a weapon; any absent-source conflict must remain explicit. Sabra alone visibly carries the cupola gun in this subgroup.

## Construction work order

Low CV90 hull with seven staggered wheels and split skirts; a low polygonal TML turret narrows upward and carries a long sleeved 105mm gun and paired tall antennas.

Hull/turret station lofts are sparse authored primary solids; measured source vertices/topology are never embedded. Intake ray tables and named wheel-island scalar bounds live in ignored `cv90105-landmarks.json` / `cv90105-axles.json` where applicable. Primary shells retain physical belly, lower glacis, side and roof closures. Track/suspension daylight, smoke-tube openings, recessed optics and genuine gun bore.

Running gear: Seven per side, measured individual named source wheel nodes. Negative-X z=[-1.978,-1.322,-0.675,-0.025,0.626,1.325,2.041], positive-X z=[-1.854,-1.2045,-0.555,0.0945,0.743,1.4415,2.146], r0.306/y0.364. Front sprocket z2.989/y0.672/bodyR0.264/pitchR0.218/toothTipR0.328, rear idler z-2.6345/y0.55/r0.24. Shared suspension and smart-track assembly owns all moving wheel faces, return rollers, end wheels and shoes. Pattern defaults are explicitly selected, never overlaid with static fake wheels. Return roller placements are inferred under side covers pending posed review; this is not a source-exact certification.

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
| 1 | 91.789 | 89.671 | FAIL | `fidelity-r1.json` |
| 2 | 94.747 | 93.252 | PASS | `fidelity-r2.json` |
| 3 | 95.126 | 93.335 | PASS | `fidelity-r3.json` |

Round3 geometry minimum 93.33483421054066; components `{"wholeCurves":93.33483421054066,"dims":100,"floaters":100}`. This is a historical result, invalidated for current geometry by round4 edits. Reference body-p95 height is 2.730540409684181m; the metadata now uses that source-only value, distinct from the full antenna envelope.

Round3 strict track results (band/shoe voxels): front 144/6, rear 0/0, sweep 1519/6. Continuity: 0 unintended sky cells. Full independent contact/articulation review still pending.

Round4 profile SHA-256: `6cfc3dbd14f8a4e15203ea36d1e817aee74b4deeda1577fe673412c3f92866c2`; shared primitive SHA-256: `7481045577c08c1419bc403ab36b816e791345ab95df446b8a85fe1d5d93c359`. Full instance-aware candidate hashes are recorded in `native-r4.json`; CPU construction evidence is not a browser performance pass.

Round4 measures the actual rising sponson underside0.966→1.071m, keeps seven side-staggered axle stations, and seats compact shoes to the independently measured low sagging return course. The105mm gameplay weapon uses the independent105mm gun baseline; the chassis metadata donor is separate from silhouette authorship.

No standard weapon census pass is asserted: KF41/CV90/TML source configurations have no roof MG; Sabra has its actual cupola weapon but no KIT.fittings marker. These require a source-aware qualification decision; none is treated as a completed gate.

Round4 frozen result: fidelity aggregate95.1557, worst registered view93.3004, PASS92 bar; geometry minimum93.3004, PASS. Strict band and shoe front/rear/full-loop sweep all0 in `track-r4.json`. These machine checks do not replace the pending official14-view independent review, full high/low presentation, runtime switching, anatomy and composed release gates.

## Current frozen validation — round7

The geometry remains byte-identical to the passing round4 candidate in both qualities. Changes to the generic open-tube helper preserved its existing default, verified by the same instance-aware geometry hashes. Source muzzle extremum is a flattened0.2184m wide by0.0696m high opening; no claim is made that nominal105mm caliber alone defines this stylized source tip. Further independent closeup review remains required.

- Fidelity source round4: raw aggregate **95.15570479502313**, worst registered view **93.30044441438785**, both pass92. Full canonical source remains unscaled and complete.
- Geometry raw minimum **93.30044441438785**; raw components `{"wholeCurves":93.30044441438785,"dims":100,"floaters":100}`. Missing fused component classifications are unavailable, not invented passes.
- Strict band/shoe front, rear and full-loop sweep: **0/0, 0/0, 0/0** for all four IDs in `track-r7.json`. These scans currently use high quality; low remains NOT RUN.
- Standard overall: **FAIL** (`standard-r7.log`), not a completed qualification receipt.
- Current profile SHA-256: `6cfc3dbd14f8a4e15203ea36d1e817aee74b4deeda1577fe673412c3f92866c2`; shared primitive SHA-256: `b8e938212b91f756ef67eb71754d9dad4a5ef48b6455d9742ad509bb6b770075`.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles | Node build ms |
| --- | --- | ---: | ---: | ---: |
| high | `c5e2826e` | 10802 | 59300 | 761.9 |
| low | `01e36ebc` | 8564 | 52918 | 696.6 |

Counts in `native-r7.json` include stored hidden/far meshes. Node construction is diagnostic, not a browser frame, memory or tank-switch performance pass. The seed is4242; both quality builds completed with finite bounds.

| Dimension | Candidate m | Source m | Absolute residual |
| --- | ---: | ---: | ---: |
| heightM | 2.722007 | 2.730540 | 0.3125% |
| hullLengthM | 6.647159 | 6.647159 | 0.0000% |
| overallLengthM | 8.106292 | 8.089226 | 0.2110% |
| widthM | 3.148654 | 3.123056 | 0.8197% |
| physicalWidthM | 3.146000 | 3.118100 | 0.8948% |
| physicalHeightM | 4.655230 | 4.645229 | 0.2153% |
| physicalOverallLengthM | 8.109590 | 8.090490 | 0.2361% |

Mask-derived rows use paired identical measurements in the source-only fixed frame. Physical rows independently use the full visible3D envelope without raster filtering. Neither oracle nor spec was fitted to the candidate. Current official14-view independent scores, full articulation/low-quality containment, finite armor/crew rays, browser performance and composed release are still NOT RUN.

## Independent review checkpoint

The official14-view critic has reviewed this vehicle and returned **FAIL** on source-visible detail. Exact image-specific findings and historical scores are in `docs/research/regional-source-independent-critic-20260918.md`; no silhouette pass supersedes this review. Source-based detail correction and fresh full review remain required. Following shared-track integration, pre-main track and geometry hashes above are historical until revalidated.

## Post-main round11 — source gun, roof and rear assemblies

The gun now has a sparse independently authored tapered and stepped/flared exterior, folded mantlet boot, and distinct left/right moving recesses. The source circular mouth is37.1mm behind its flattened leading side lips: gun-local muzzle datum4.04289m, full visual extremum4.07999m, circular outer radius0.118m and actual bore0.0525m. The shared gameplay muzzle should use the mouth datum; the source full-length measurement still includes its lips. A measured narrow source stem radius0.046m cannot contain the nominal105mm bore; authored minimum outer radius0.055m preserves physical stock, and this residual is disclosed rather than altering the source.

The broad source cupola and smaller offset hatch replace the generic roof layout. Rear ramp rake, open steps, diagonal brace, small access hatch, rear louvers and lights follow independent source-only scalar measurements. Full source registration and retained meshes remain unchanged. A fresh official14-view independent review is pending, so the historical **FAIL** is not replaced by a visual pass.

- Fidelity raw aggregate **96.15914896535723**, worst registered view **95.27399774084631**: PASS92 per-view bar (`fidelity-tml-r11.json`).
- Fresh geometry gate passes (`geometry-tml-r11.log`); unavailable component classifications remain unavailable.
- Strict band/shoe front, rear and full-loop sweep: **all0 at HIGH and LOW**, with separate `track-tml-r11-high/track-clip.json` and `track-tml-r11-low/track-clip.json` receipts. These checks do not certify finite contact or moving articulation.
- Typecheck passes. Full standard weapon census remains unresolved for the source lacking a roof MG; no fictitious weapon was added. Browser performance, full anatomy/release qualification and publication remain uncompleted.

| Quality | Instance-aware geometry hash | Stored triangles | Expanded triangles |
| --- | --- | ---: | ---: |
| high | `67eda4d7` | 13868 | 62342 |
| low | `e929eb45` | 11510 | 55840 |

Node evidence in `native-r11.json` includes stored hidden/far meshes and is not a browser frame/switch performance receipt. Current profile SHA-256: `70b7982cb863fd3a9be8de918b4f0f3fb343a21187dd5cfc48831b4e9d281bd5`. Later shared factory or geometry changes invalidate these hashes until remeasured.

## Performance round17 — measured stock and selected geometry budgets

This round explicitly adopts the existing `buildFleetTrackShoe` through the profile's native shoe-builder hook. No shared shoe helper, axle, track-course datum, source frame, body, weapon or palette was changed by this optimization. The quality-aware near shoe retains real paired pads, their central split, a connecting web and the guide horn. Its approved LOW recipe drops unresolved generic pin relief and merges surface detail; this is a declared quality difference, not the distant flat shoe or a counter adjustment. CV90, TML and Sabra wheel stock is unchanged.

The existing browser geometry census ran at the unchanged 10m HIGH/LOW distance with one worker under the capture queue. It counts selected visible instanced geometry, not all stored LODs. Its before/after identity is unchanged (`perf-r17/identity.json`, drift=[]).

| Selected metric | Previous frozen census | Round17 |
| --- | ---: | ---: |
| HIGH triangles | 58,866 | 49,702 |
| LOW triangles | 52,364 | 33,088 |
| HIGH visible objects | 42 | 42 |
| LOW visible objects | 41 | 41 |
| LOW / HIGH triangles | 88.95% | 66.57% |

**Selected geometry budgets PASS:** fixed HIGH triangle cap 80,000, object cap 85, and LOW≤75% of HIGH. This is not a browser frame-time, memory or cold/warm/rapid-switch pass.

- Fresh fidelity raw aggregate **96.14752932182212**, minimum registered view **95.27223809372313**: PASS92 (`perf-r17/fidelity.json`). Source hashes and registration are unchanged.
- Strict HIGH and LOW band/shoe front, rear and complete sweep: **all0**, separately retained in `perf-r17/track-high/track-clip.json` and `perf-r17/track-low/track-clip.json`.
- Typecheck and `europeSourceRunningGear.selftest.mjs` pass. The latter measures actual near-shoe peaks, supported web, split air and guide projection at both qualities; it also confirms preserved physical bores and KF41's side layers following native tire rotation/suspension matrices. These focused witnesses are not a complete dynamic contact/armor/anatomy certificate.
- HIGH native geometry hash `2b21ecba`; LOW `58ef64c3` (`perf-r17/native.json`). Profile SHA-256 `c563d6a91f564bb15d1eacaeb666665a13aba999cdde358cb4a94027fa364eb5`. Shared and new helper identities are in `perf-r17/final-freeze.json`.
- All four new neutral boards were viewed and archived under `perf-r17/boards`. Fresh official14 capture completed at `2026-09-18T10:06:08.707Z`, exit0, rig parity OK, all14 originals preserved under `perf-r17/official14/cv90105_tml_x`. Its per-ID identity records exact shared/profile/tool hashes before and after (drift=[]), plus every image/report SHA-256. Captured `tankFactoryCore.ts` SHA-256 is `22598a957e95b159fe56e9a3f9e7ec5bf4d609534b8bd120b1f0610ebbc183e3` after the parent's AFT-only closure change. Independent scoring of these new14 images is still pending; no builder self-rating or old critic pass is substituted. Previous critic FAIL receipts are retained. Full standard, anatomy, performance and composed release remain uncompleted. **NOT QUALIFIED / NOT PUBLISHED**.

## Publication receipt

Requested batch includes this ID alongside the user's other twelve additions. This draft has **no qualification or publication receipt**. No scoped as-is exception exists. Source binaries, archive extraction, renders and logs remain ignored. Commit, integrated main tests and remote main hash are pending with the parent task.


### Final shared-wheel-shader capture — 2026-09-18

The geometry remains the frozen performance-r17 candidate. The parent's shared wheel-shading correction is now captured with the native materials and fixed registered source in all fourteen official originals: `.qa-dev/tank-run/europe-source/final-shader-r18/official14/cv90105_tml_x/`. Its sibling `cv90105_tml_x-identity.json` and `capture-index.json` pin every PNG/report and relevant profile/shared/tool hash; `whole-identity.json` reports no drift across the five-model capture session. All70 image hashes were subsequently checked. The frozen `materials.ts` SHA256 is `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`.

All capture commands exit0 and rig parity isOK. The builder spot-viewed the fresh hero-frontleft only; a different reviewer owns the complete every-image≥9 assessment. Earlier images and failed critiques remain preserved. Unchanged binary geometry/source scores were not rerun merely for the shader update. Qualification remains incomplete pending the new independent review and all remaining physical/performance/anatomy/release gates.


## Round19 source detail correction checkpoint — 2026-09-18

This checkpoint preserves all previous failures and does not qualify publication. Source measurements, before/after complete-scene rays and hash identities are in `.qa-dev/tank-run/europe-source/detail-r19/`. Canonical source, camera registration, wheel centers/radii, track path, shared materials and physical-bore contract are unchanged. Type checking and the existing running-gear regression pass. `europeSourceDetail.selftest.mjs` checks actual complete native HIGH/LOW stock with interior-fill records loaded and several turret/gun poses; it does not raycast an isolated substitute.

The parent subsequently found that its preceding fill command used `--stats`, a dry run. Therefore `jobs.json`, `selected.json`, `fidelity.json`, explicit strict HIGH/LOW logs and `official14/` in this directory are **loaded-prior-fill evidence only**, even though `interiorFillRecordLoaded` correctly reports true. The hashed records and all originals are preserved unchanged. They must be superseded by actual postwrite validation and independent review, not relabeled as fresh fills.

The older centered optics were actually buried: complete-gun FrontSide hits at their intended local center rays met shell at Z .50221/.48396 while their fronts were .360. Source measurements establish asymmetric stock instead: left lens world center (−.3898,1.85355,1.05988) and right (.416,1.924,.84349). The gun origin remains (.016,1.878,.700). Sparse authored receiving prisms now seat behind the actual left octagonal hood/open annulus and right circular opening in its box frame; physical backing plates and cylindrical receivers connect both lenses to moving stock. Complete native HIGH/LOW center rays now hit gunDark lens fronts at worldZ1.060/.8435, with the measured rim depths. The existing barrel, boot, bore and recoil ownership are preserved.

Profile SHA-256 `b495b586ab21320c76031c6c14a5856ac4ff638b31b11cfbb4aa32ce7631bcdd`. Prior-fill selected cost HIGH50,300 / LOW33,398 triangles,42/41 objects; LOW66.40%, within fixed limits. Fixed-source aggregate96.22 and every-view minimum recorded in `fidelity.json` pass92; strict HIGH/LOW band/shoe front/rear/full-sweep allzero. These do not substitute for the required fresh-fill independent14 review.


## Round20 actual regenerated-fill validation — 2026-09-18

The integrator reran the generator in actual write mode. TML has zero generated boxes; its payload is unchanged. The r19 authored profile is unchanged. All following receipts actually load the hashed final record.

- Fixed-source raw aggregate **96.22**, minimum **95.27**: PASS92 in every valid registered view; full canonical source unchanged.
- Selected HIGH **50,300** / LOW **33,398** expanded triangles; **42/41** objects; LOW **66.40%**. Fixed class/object/75% limits pass. This is selected-geometry cost, not browser switching or frame timing.
- Actual complete-scene HIGH/LOW optical/lamp/crown rays with loaded fills pass (`native.log`), including changed turret/gun poses.
- Strict HIGH and LOW band/shoe front, rear and full sweep allzero; jobs all exit0 with before/after hash driftempty.
- Fresh official14 status0, fourteen PNGs and report preserved; per-ID and whole capture identities have no drift. Allimage hashes were independently recomputed.
- Prior-fill image differential: **14/14** originals byte-identical to r19. Changed images require the fresh independent review; no author score substitutes for it.

Evidence root `.qa-dev/tank-run/europe-source/detail-r20/`: `jobs.json`, `selected.json`, `fidelity.json`, `track-high/`, `track-low/`, `official14/cv90105_tml_x/`, `whole-identity.json` and `prior-fill-image-differential.json`. The author spot-inspected close-front/close-roof (TML) and close-front/hero-toptilt (Sabra); independent every-image review is assigned separately.

Final fill/shared identity:

- `src/vehicles/interiorFillGroups/cv90105TmlSourceX.generated.ts`: `caa277b1550d0e716f728813cedcd22d326fc579dbf10eb161d1873e38fa9526`
- `src/vehicles/materials.ts`: `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`
- `src/vehicles/tankFactoryCore.ts`: `1e9fb081c1c8b86e8200606de7c3350ed8f5280cffc1d4466b885abbe11b82ff`


## Pitching receiver ownership checkpoint — 2026-09-18

Existing receiving stock now follows gun pitch without following barrel recoil. The actual tube and muzzle retain their recoil owner; no source dimensions, neutral primitives or pivots changed. Neutral HIGH/LOW visible world triangles, transformed normals, UVs, colors and materials match the prior model exactly. Filled native legal-pitch/recoil/return checks pass; TML optical faces additionally retain full-scene recess depth, unlimited former visibility through near/far LOD changes and exactly-once disposal.

Current profile SHA-256: `7d2d825c84733e1b88144a895c6666353e66c59956f5c47c6da835bfd8dfdc07`. Details and the genuine KF41 pre-fix failure are preserved in [the ownership repair report](../../research/europe-gun-ownership-repair-20260918.md). The parent owns affected anatomy/fill regeneration and final integration evidence. Earlier static-shape evidence is preserved; no composed release pass or waiver of existing source/roof-MG policy conflicts is claimed here.


## Final internal-layout correction — 2026-09-18

Replaced the generic rear-engine MBT anatomy with an explicit inferred CV90
front powerpack/transmission, hull driver and three-person manually loaded
105mm turret. No autoloader mechanism is inferred from the source publisher's
separate gameplay clip. Lazy finalization is tested for physically forward
engine/transmission volumes. Details and source:
[final weapon/layout review](../../research/supplied-fleet-weapon-layout-review-20260918.md).
