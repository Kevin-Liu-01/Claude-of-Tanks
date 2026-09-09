# Abrams source X — R3 shaded review, 2026-09-07

## Disposition

**Diagnostic FAIL: 0/14 views reach the requested 9/10 visual-fidelity floor.** All 14 actual source/native pairs were opened at their original 1280 × 706 resolution, followed by the 2520 × 3514 equal-neutral-clay board. Scores range from 8.2 to 8.7. This is a materially improved model, not an exact source reproduction or a release approval.

**Subsequent source-first correction to the visual inference:** complete actual high/low rays now establish that the road-wheel bowls already have the deep source profile, with no generic cap overlay. At road radius 0.10 m the source outer first surface is |X|1.456648 m and native 1.454975 m; at 0.21 m they are 1.479792/1.478168 m; at 0.27 m 1.637360/1.636760 m. Therefore the descriptions below of apparently shallow road discs are retained as the original visual judgment, **not a confirmed geometric deficiency or instruction to reshape the road wheels**. The apparent broad bowl-depth difference is withdrawn as a repair priority. The rear-drive finding is independently confirmed: its generic central cap is 172.63 mm too far outboard, with roughly 197.90 mm excess at radius 0.10 m, and its outer stock profile differs materially. Sparse source packets `abrams-wheel-source-heldouts-I5rqok` / `abrams-wheel-source-heldouts-y7zJ0X` and complete actual high/low packet `abrams-wheel-native-heldouts-ozKXdS` under `.qa-dev/reports/` retain the evidence. Original image judgments and hashes were not quietly replaced by new candidate results.

**Later R4 CPU checkpoint, 12:57:13.489Z:** the bounded source-118 rear-drive stock correction is frozen with its focused, original-fleet, quality and typecheck proofs passed. See [the separate drive evidence note](abrams-source-x-drive-r4.md), including its remaining carrier-boundary residual and unchanged source-versus-mechanical teeth/wrap conflicts. It does not update these historical images or scores, and is not a fresh R4 visual or release approval.

The large and small CROWS optical heads, rear rack courses, soft stowage bodies, differentiated deck covers and stern subdivisions now read substantially better. The earlier “rectangular optical facade,” “three rigid drum bags,” and broadly unpartitioned deck diagnoses must not be presented as the current state. Remaining discrepancies are concentrated in running-gear profiles and wheel-face depth, the complete roof weapon/cradle and adjacent sight forms, and several front/rear attachment forms.

This is a separate full-scene review, not acceptance inferred from the author's isolated CROWS tests. The reviewer authored that bounded helper earlier; independent root/other-agent review remains important. No runtime geometry, source, camera, threshold, prior report or generated receipt was changed during this review. The `improve-threejs` skill guided the separation of visible geometry, material differences, contact evidence and capture limits. No new browser/GPU job was run.

## Exact capture and source integrity

- Vehicle: `m1a2_sepv2_x`; source left, first-party procedural right.
- Fourteen-view report: `shots/visual-eval-m1a2_sepv2_x/report.json`.
- Capture generated **2026-09-07T11:34:12.453Z**; report SHA-256 `5e4d5f1f0ce6491e15ccd8a38e03984f8aca0807a84ce63f11e161905d2873ae`.
- Quality `high`, camouflage seed `4242`, registration `canonical-source-world`.
- Canonical GLB actual bytes verified: `public/models/community-candidates/m1a2_sepv2_dc_source.glb`, SHA-256 `7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16`.
- Authenticated OBJ SHA-256 from the source preparation receipt: `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
- Approved source transform remains `[-rawX, rawY + 0.203945, 0.357965 - rawZ]`, uniform scale 1. No candidate-derived source fit is authorized or inferred.
- R2 images remain separately retained at `.qa-dev/reports/abrams-visual-r2-20260907T103911`; earlier review documents remain historical.

All 14 source/native camera position arrays, projection matrices and view matrices are exactly equal. All 28 `reframed` flags are false. The three perspective hero views declare `worldApprox: true`; the other eleven declare false. This supports paired-camera integrity, not exact three-dimensional dimensions inferred from pixels. The reported frame offset is a diagnostic, not evidence of an applied native-favoring source move.

The nine whole orthographic views and `hero-frontleft` report zero source/native border clips. `hero-rearright` reports 1/1 and `hero-toptilt` 1/2; their visible endpoint crops limit complete-envelope assessment. `close-front` reports 1/1 and `close-roof` 2/2, consistent with intentional detail framing. None of these images is blank or corrupt. Equal cameras do not turn the cropped views into complete-envelope evidence.

## Material control and non-findings

The source's MTL textures are unavailable; native camouflage and blue glazing remain visible in the shaded pairs. Their colour, contrast and pattern are **not** geometric defects. The fresh neutral board is used as a material-control cross-check, not as a replacement for the fourteen view judgments. Camouflage boundaries are not interpreted as cracks or displaced panels.

In particular, the black source lower-glacis field is **not an open rectangular hole missing from the native**. Earlier complete-source front rays in `.qa-dev/reports/abrams-front-lower-1r5hKL/rays.json` establish actual owner-4 stock and coincident source/native planes. No bow cut is recommended. Likewise, full-scene source glass in owners 92/106 must not be called air simply because an isolated steel frame is open.

No obvious new detached major assembly or exploded geometry was found in these images. That is not proof of all physical contacts, hidden air, low-detail geometry, articulated clearance, hitboxes, flicker, transparency ordering in motion, or resource lifetime.

## Per-view judgments

A 9 requires close agreement in major and medium forms, with only small residual simplifications. These are visual judgments, not rescaled raster scores; every sub-9 view fails independently. Fine fasteners alone are not used to withhold a 9.

| View | Score | Largest remaining visible form differences / limits |
| --- | ---: | --- |
| front | 8.6 | The corrected circular CROWS optical faces now correspond. Remaining roof weapon/receiver layering and adjacent sight crown are simpler; front track/wheel exposure and guard/towing terminal shapes are not source-exact. The dark source bow field is not scored as air. |
| frontleft | 8.5 | Broad hull, barrel and curved urban-panel arrangement agree well. Road/end-wheel faces have shallower, simpler layering; rear wrap exposure and the front guard termination differ. Roof weapon mechanical relief remains reduced. |
| left | 8.3 | Clearest whole-model running-gear difference: the native exposed rear drive face/wrap and under-wheel course gaps differ from the source. Road faces read as shallow discs rather than the source's layered bowls/rims. Some wrap difference is a documented physical source correction, not permission to move axles for score. |
| rearleft | 8.4 | Rear stock, grille subdivisions and stowage bodies are improved. Remaining lower receiving/hinge hardware and outer stern termination forms are simplified; end-wheel and wrap exposure also differ. Contact cannot be established from this still. |
| rear | 8.3 | The main rack and unequal stern screens now correspond. Source grille pivots/receiving arms and surrounding attachment layers remain more distinct; native wheel/course presentation remains different. Fabric straps and small grille relief are secondary. |
| rearright | 8.4 | Broad curved armor and rack/stowage layout are convincing. The exposed drive face, rear course and lower attachment hardware remain different; roof weapon/feed/mechanism forms are simplified. No missing whole rear assembly is claimed. |
| right | 8.5 | Principal turret and gun silhouette is strong. The rear wrap and road/end-wheel face layering remain visible differences. Weapon receiver/cradle relief and adjacent station transitions still lack some medium-scale source structure. |
| frontright | 8.6 | Strong gross bow, turret and barrel correspondence. Guard/towing terminal shapes and wheel bowls differ; the roof weapon assembly and sight head remain simpler. Camouflage on the curved armor is not mistaken for faceting errors. |
| top | 8.7 | Differentiated deck and basket plan forms are improved. The complete weapon receiver/feed/cradle and sight/hatch surrounding layers still differ. Sparse small latches and straps are a lesser limitation, not a substitute for identifying the medium forms. |
| hero-frontleft | 8.5 | The corrected roof equipment is recognizable, but the weapon/cradle and CITV head retain simpler surfaces than the source. Wheel-face depth and front guard/attachment termination differences are visible at this scale. |
| hero-rearright | 8.4 | Much better rack, bags and deck covers. Stern hinge/receiving hardware, exposed rear gear and roof weapon details still differ. Both halves clip an aft endpoint; this is not full-envelope evidence. |
| hero-toptilt | 8.6 | Roof/deck panel differentiation is improved, with remaining medium weapon/sight and attachment-layer simplification. Aft endpoints touch/cross the frame; no claim of full envelope clearance. |
| close-front | 8.4 | Enlarged front fittings reveal simpler tow-eye/tab/guard terminal layering and different wheel-face depth. The roof station is improved but its receiver/mechanism remains reduced. The source's dark lower face is known solid, not a missing native cavity. |
| close-roof | 8.2 | The circular optical heads and shaped supports close a substantial R2 gap. The complete M2 receiver, perforated/stepped jacket/feed and cradle mechanism remain noticeably simplified; the adjacent CITV crown/optical rim and loader mount layers are plainer. Glass colour is not the issue. Deliberate crop limits this verdict to the visible roof region. |

**Result: 0/14 at or above 9. No averaging or isolated-part pass overrides this result.**

## Ranked bounded next diagnoses

1. **Wheel and track forms — highest whole-model residual.** Inspect source wheel owners 108–118 and course owners 119–142 against the native axial sections and complete-source first surfaces. Left/right and front quarters show shallower bowl/rim layering and a different exposed rear drive face/course. Neutral clay retains the difference. The supplied tooth/band interference and native source-axis-preserving wrap correction are already documented; do not undo real clearance, widen the course, change wheel radii or move axles from screenshots alone. Separate intentional physical departure from still-correctable face construction.
2. **Complete roof weapon/sight medium forms.** Source 87/88/90/92 contains the CROWS support, optical bodies, M2 and glazing; 61 is CITV, 102 the loader gun. The new optical facade is not the remaining problem by itself. Compare the actual M2 receiver/feed/cradle and the CITV crown/optical rim, then loader mount/hinge layers. The needed next step is bounded owner-specific surface/air evidence, not a broader roof lift or decorative fastener scatter.
3. **Front terminal fittings.** `close-front`, quarters and neutral clay expose differences in tow-eye/tab/guard termination layering and curvature. Use the real source receiving planes before changing them. No bow cavity, broad armor change or new unsupported attachment is justified by shading.
4. **Known stern attachment/contact gap.** The captured R3 has an unresolved `RearGrilles` contact test. Root subsequently authorized only two curled stern arms and asymmetric grille hinge leaves. This report describes the pre-repair captured checkpoint and cannot certify those later changes. Grille/receiving hardware needs an actual contact proof plus refreshed render; the improved broad stern and rack should not be discarded.

Remaining cloth creases, straps, tiny pins/bolts and dense service-panel relief are secondary fidelity limitations. The former rigid-drum bag and absent-deck-panel diagnoses are superseded. Thin-stock attachment failures are not waived merely because the missing join is hard to see in a still.

## Quantitative and physical gates — separate from visual scores

The fresh neutral/fidelity report generated **2026-09-07T11:36:30.272Z** records raw composite **96.37183259877999**, but its declared component gate fails **tracks 88.85651977992286 < 92**. This review does not turn that aggregate into a pass. The nine-view board is a separate comparison surface; optional component diagnostics must not be presented as though every possible view was a declared gate.

The refreshed geometry report records hull **93.3023029075**, whole **95.0426815555**, turret **90.1236048187**, stations **95.2118038156**, dimensions **62.2104778873**, floaters **100**; `gatePassed` is false. Turret and dimensions remain below 92.

The dimensional failure must be described accurately: the report compares measured height **3.6368949451 m** against its configured “published specification” **3.44 m**. Its independently reported source body extent is **3.647 m**. This is not screenshot evidence of a roughly 0.20 m missing native roof, nor authorization to shrink the model to a mismatched instrument target. The target/physical-versus-filtered-height contract needs explicit source-backed disposition by the owner; the current failure remains a failure until resolved without a waiver.

The parent checkpoint `.qa-dev/reports/abrams-r3-checkpoint-GaSPuS/receipt.json` ended incomplete after its focused stage failed; later stages were stopped. Earlier isolated equipment/source-ray passes are useful bounded evidence, not a full-scene contact or release pass. The subsequent stern-only repair and its verification are outside these frozen images. No anatomy, asset-generation or release success is asserted here.

## Artifact hashes

All PNG names in the first table are relative to `shots/visual-eval-m1a2_sepv2_x/`. Hashes identify the actual inspected files; later same-path captures must not inherit this review.

| PNG | SHA-256 |
| --- | --- |
| `front-shaded.png` | `4dc4bb39901df3013125af0d109cfcc64a2a5eb75735117313c501c7f7b5eb46` |
| `frontleft-shaded.png` | `950def4696174dbc307ea0e278a9cb6eac874adce46e4783646dc808c3b5abb9` |
| `left-shaded.png` | `04b72b30c6b2b00818de730971103c3412fb49d8bfa9c805b9692d9cc636a241` |
| `rearleft-shaded.png` | `312d07008944f01f493a38c210958fc42b11206e93e9fd91ca319386f5454c33` |
| `rear-shaded.png` | `6472e888e4688cb8f778fffcf0cf7a5104d46c321a3c96e85648ebb7d0eadc6a` |
| `rearright-shaded.png` | `3ea99d678f0a4c9cb7620d63a9ee72ed14eb3fcbf8a29bd18c7a47ebc21ef0b1` |
| `right-shaded.png` | `ceff5a7b90e899157296acb181f7e6947507c5080a790dc2c3e521e4d57e4c64` |
| `frontright-shaded.png` | `3105bc6bd57a46019f09cff3f720eb4a3d52f56ab09430c66af21e57ed9e1c35` |
| `top-shaded.png` | `cefa126810231cf003cfbfe1cee002b7d2949de914d4361402c94c2915ac5e2e` |
| `hero-frontleft-shaded.png` | `40537dd5fc4e8aec0a93745a9a9075ec9b2d71653d023a0094624953c4f0c623` |
| `hero-rearright-shaded.png` | `d0eb561f233600d6d52de09b9c07be2e4cee07ea3418920b773cfbd710e8ae6b` |
| `hero-toptilt-shaded.png` | `2a4ebec28f6602086f4be1f2ed829ab8c571fbfde4aacca9b8faf05a42a4a00b` |
| `close-front-shaded.png` | `9b80d27b54ba3d0fac138dd8e1e1db49495d49e16ac33879bb731ffcd340f46b` |
| `close-roof-shaded.png` | `a1a993531ddf6627d0368eec329105007249f11c9a8bcf65ecc4341bdb97a7f5` |

| Supporting artifact | SHA-256 |
| --- | --- |
| `shots/procedural-fidelity/boards/m1a2_sepv2_x-neutral.png` | `d37f92af2415f31f9d505e2e1ddf7d1c4c05039bd85635c2d1bce758227a12b3` |
| `.qa-dev/reports/procedural-fidelity.json` | `aa9d07dc1622d9bce5da556d39854df7bdb7565ffe31dd9b5119eadc538bc83d` |
| `docs/geometry-gate/m1a2_sepv2_x.json` | `fad34d160f9e53d62b0dfd49360895bdefbc909f0e764da15583b35c107487fd` |

Only this new dated review document was authored. No historical capture/review was overwritten and no runtime or scoring policy was changed.

