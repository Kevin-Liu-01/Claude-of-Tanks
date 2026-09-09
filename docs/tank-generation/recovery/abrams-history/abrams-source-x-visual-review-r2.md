# Abrams source X — independent shaded review R2

## Disposition

**FAIL: 0/14 views reach the requested 9/10 visual-fidelity floor.** All 14 actual PNGs were opened at their original 1280 × 706 resolution. This is a source-versus-native visual review, not a new geometry measurement or a release approval. No model, source, camera, threshold, generated receipt, or prior review was edited.

The broad SEP v2 identity, principal masses, gun length, urban armor arrangement and equipment census are recognizable. The remaining deficiencies are primarily medium-form fidelity: the roof weapon station and its surrounding fixtures remain simplified, roof/deck panel structure is sparse, and the rear hull/gear presentation still differs substantially. The new rear grille screens, front towing eyes and dished wheels are visible improvements; their existence alone does not qualify the complete model.

The `improve-threejs` visual-audit rubric was applied to the captured geometry, depth, camera, contact and render-sanity evidence. Its broader scanner/browser workflow was outside this read-only capture-review scope. Colour, camouflage pattern and the source's monochrome finish were not scored as geometric defects. Static images cannot establish flicker, moving-part clearance, transparency order during motion or resource lifetime.

## Exact checkpoint and camera parity

- Vehicle: `m1a2_sepv2_x`, M1A2 Abrams SEPv2 X.
- Capture: `shots/visual-eval-m1a2_sepv2_x/report.json`.
- `generatedAt`: **2026-09-07T10:39:11.891Z**.
- Report SHA-256: `df29a4915e121d5e1308a628e262615bac04c76c7623cf6ddcc9430e2340ade8`.
- Quality `high`; camouflage seed `4242`; source left, first-party procedural right.
- Selected OBJ SHA-256: `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
- Approved source frame remains `[-rawX, rawY + 0.203945, 0.357965 - rawZ]`, uniform scale 1.

For **every one of the 14 view records**, source/native camera position arrays, projection matrices and view matrices are exactly equal. All 28 per-model `reframed` flags are false. There is no evidence here of a favorable native-only camera adjustment. The three hero views mark `worldApprox: true`; that concerns projected world interpretation, not a mismatch of the paired cameras. The other eleven mark it false.

All PNGs decode, contain the correct vehicle/source/native labels and have no blank or corrupt half. Front, side, quarter and top orthographic views include the vehicle. `hero-rearright` clips the far aft extent at the right edge in both halves; `hero-toptilt` brings the source aft corner into the bottom boundary. These are incomplete envelope evidence, despite valid paired camera parity. Both `close-*` views deliberately crop the vehicle and are assessed only for their visible detail regions. No missing geometry is inferred from those crops.

## Per-view scores

Scores are independent visual judgments on a 0–10 scale, not conversions of raster or geometry metrics. A score of 9 requires close agreement in the view's major and medium geometry, with only small residual simplifications. Every score below 9 remains a failure; there is no average-based waiver. Features smaller than the captured resolution and source/native material contrast reduce confidence in fine-detail comparisons.

| View | Score | Result | Largest visible geometric differences / evidence limits |
| --- | ---: | --- | --- |
| front | 8.3 | FAIL | Roof weapon assembly loses the source's prominent circular side face and layered cradle/receiver relief in favor of flatter block-like surfaces. Surrounding tall shields and their supports have a simpler stepped outline. The front gear presentation also differs. The dark central source lower plate is **not** scored as an open hole: earlier complete-source rays establish real stock there. |
| frontleft | 8.4 | FAIL | Principal bow, gun and urban armor positions are close. Rear wheel/wrap and rear shoulder outline differ; the native front mudguard reads as a sharper ruled turn than the source's rounded termination. Roof mounting/receiver forms remain simplified even at this modest model size. |
| left | 8.3 | FAIL | The native rear wrap rises into a larger exposed arc and changes the rear lower run. This is the documented source-error correction, not an unexplained axle shift. Roof station side walls and rear turret/roof fixture transitions are more block-like; source local stepped surfaces and small supported fittings are incompletely represented. |
| rearleft | 8.0 | FAIL | The native stern reads as a deeper, more continuous box/apron below the grille, whereas the source shows a shorter subdivided stern with distinct lower tow/receiving hardware. The new unequal grille screens are present, but the surrounding broad stock/hardware presentation remains different. Rear wrap and roof station simplification are also visible. |
| rear | 8.0 | FAIL | Three unequal grille screen areas now correspond, but the native lower stern remains a broad planar band with a different lower silhouette and simplified towing/receiving forms. Source stowage retainers/case contours and roof weapon backing have more distinct layered shapes. Broad dark lane bands are not treated as a numerical track-width measurement; see the ownership caveat below. |
| rearright | 8.2 | FAIL | The curved urban panel arrangement and seven-wheel census are coherent. The native upper rear wrap is substantially more exposed; stern lower apron and corner hardware read more monolithic. Roof station and bustle retaining details remain simplified. |
| right | 8.4 | FAIL | Major cheek and urban-kit extents are close. The rear wrap/lower run and exposed drive face change the running-gear profile. The native roof weapon cradle and adjacent protected station have simpler stepped outlines and omit visible source layered mechanical relief. |
| frontright | 8.5 | FAIL | Strong broad bow/turret/gun correspondence. Medium residuals remain in the weapon station's backing/cradle, forward mudguard turn and skirt attachment edge structure. No missing whole assembly or gross new floater is visible. The dark source bow field alone is not proof of absent native air. |
| top | 8.5 | FAIL | Main plan extents, gun axis and urban-kit rows are close. The source's large rectangular roof panel boundaries, hatch surrounds and distinct narrow fixture/retainer fields are reduced to much plainer surfaces. This finding concerns visible edges and relief, not the camouflage texture that crosses them. |
| hero-frontleft | 8.3 | FAIL | The source's angular roof-mounted sight/weapon structures and their mechanical interiors remain substantially simplified. Native roof and fender attachment fields are sparse; the native front mudguard turn is sharper. Broad silhouette is recognizable, but these medium-scale omissions are readily visible at this hero scale. |
| hero-rearright | 8.0 | FAIL | The new grilles and basket are discernible, but the stern appears tall and box-like, lower tow/attachment relief differs, and rear running gear remains differently exposed. Source roof service panels and stowage receiving details are denser and more distinct. Far aft geometry is cropped at the right edge in both halves; this view cannot establish the complete rear envelope. |
| hero-toptilt | 8.4 | FAIL | The roof panel perimeter/hinge structure and gun-station fixtures remain noticeably simpler than the source. The source has visibly defined service-panel/hatch layers where the native reads as broad uninterrupted roof. Aft source corner reaches the image boundary; no full-envelope claim is made. |
| close-front | 8.1 | FAIL | The enlarged view exposes the simplified upper weapon cradle, surrounding station walls and roof fittings. Source front mudguard curvature and the attachment edge treatment are more articulated; native is a sharper thin folded termination. New real tow eyes are visible. The material-dark lower bow is not called a cavity. |
| close-roof | 7.8 | FAIL | Clearest remaining medium-form failure: the source weapon receiver, cradle side circular features and small support/drive pieces are replaced by a much simpler capped block assembly. Adjacent station shield/window surrounds, hatch-related structures and roof fixtures are coarser. Blue versus grey panes are not the issue; the surrounding physical shapes and visible interiors differ. |

## Priority findings and non-findings

1. **Roof weapon/station medium forms:** strongest evidence is `close-roof`, then `front`, `hero-frontleft` and `hero-rearright`. Inspect the actual source receiver, cradle, circular side features and surrounding shield supports before any future correction. A window count or dark pane emission is not a substitute for these physical shapes. Exact millimetre errors cannot be derived from this screenshot review.
2. **Rear stock and attachment presentation:** strongest evidence is `rear`, `rearleft` and `hero-rearright`. The three source-like grille subdivisions are now present; the remaining difference is chiefly the surrounding broad stern, its lower edge and tow/receiving fittings. This is a request for source-owner/first-surface diagnosis, **not** authorization to shorten or hollow the hull based on shadows.
3. **Roof/deck panel structure:** `top` and `hero-toptilt` show source service-panel/hatch/retainer boundaries that remain too sparse in the native. Follow the actual source closed sheets/fixtures, not arbitrary fastener sprinkling.
4. **Running-gear source departure:** side/quarter views visibly retain the enlarged rear wrap. The frozen source-error packet documents the physical reason: supplied tooth rings intersect the supplied band; native retains source axles and the true approximately 0.410699 m tooth radius while routing the band locally outside them. This is an intentional physical correction, but it remains a visual source departure and does not turn the source comparison into a pass. Do not undo the clearance correction or silently alter the oracle to improve this review.

### Broad black source lane bands — bounded owner classification

The original-source inventory does **not** support calling the low broad black rectangles separate rear mudflaps merely from their appearance. Owner 119 (`track_1`, material `track_1.0`) contains the full-width course stock, with two connected main islands of width 0.56335 m and 0.56298 m. Its canonical minimum height is 0/0.001091 m, and the course extends aft to approximately Z −3.572 m. Owner 120 (`track_1.1`) is the narrow approximately 0.0335–0.0345 m central course/guide geometry. Duplicate source track groups repeat these stocks; they are not additional physical flap evidence.

The existing native configured course width is 0.563165 m, distinct from its 0.43087 m paired wheel span. The screenshot's visible black-strip spacing is therefore not evidence that the whole track is narrower. The inventory identifies the full-width low course as a concrete candidate; a fresh complete-source rear first-hit ray is required to classify each partly occluded upper black pixel. No new flap, width shift, axis change or stock fill is proposed from the image alone.

Other non-findings: no blank render, corrupt mesh explosion, obvious detached major assembly or source/native camera mismatch was found. The light native central bow face versus dark source face is already independently explained as real source stock, not an open rectangular bow hole. No statement here validates every small aperture, mechanical clearance, armor hitbox, articulation pose or low-quality mesh; those belong to the separate focused and integration receipts.

## Quantitative context, kept separate

Parent reported the same frozen checkpoint at approximately 96.13 overall silhouette fidelity, with track views around 89 still failing, and geometry at approximately 62.2 for the dimensional floor / 88.2 turret curves still failing. Those numbers were not used to manufacture the visual scores above. This review grants neither a visual waiver nor a quantitative pass. Later anatomy/assets success cannot close these source-shape failures by itself.

## PNG authenticity

All paths below are under `shots/visual-eval-m1a2_sepv2_x/`. SHA-256 values were read from the actual files inspected, not derived from filenames or the report's scores.

| PNG | SHA-256 |
| --- | --- |
| `front-shaded.png` | `ec8e925516ed6b1ec9fc81e065c6dabe52e1735e97012c367a14df1d2d6debc9` |
| `frontleft-shaded.png` | `63b53428070294865449fe12d1768cf41dff000dc07234cbd4399d89bda34566` |
| `left-shaded.png` | `c83dcc9f111e677a368a5bfa36911de4a7009c020e4337c4179eab0d1a31ba8b` |
| `rearleft-shaded.png` | `2ca32ab4bc5849a7a32f9333f4144184bcd0ed72e85167ab06989e5fc33067bd` |
| `rear-shaded.png` | `f98dc72097b473cd21e6029e74b7146ce519ce6b1434bfd0cf77f8808c92eb0c` |
| `rearright-shaded.png` | `7ee7a155dc92c50acd9017ceaaffddfc8c7d10070a85335d84059057da1a3def` |
| `right-shaded.png` | `8d32e4bb32f06c0141ebeaf408e4016d7501b41417cf5d29468366083dee0fb8` |
| `frontright-shaded.png` | `30056c048c80f0d00f695f6cc83bd8d59516d9ce13658694571d3eb385e93e16` |
| `top-shaded.png` | `f00f7ec1902e0b5f9fa97baa8aa0fff6c81b50b303abb588bef439ed8074aeb6` |
| `hero-frontleft-shaded.png` | `a866961c142afcfa8a1217fb5a38f5177843e4f3d66a1fd0c1020422cc784006` |
| `hero-rearright-shaded.png` | `453dfc279b5ba3b0b94f2d011a2cfac5fc4fa686d0ba3b934620397dafb6014f` |
| `hero-toptilt-shaded.png` | `b1ca903e93653768b7aed511bb0c6f3e4c920436c6b227d313cca6f4153457e7` |
| `close-front-shaded.png` | `2a448b0992fb1bf82dc1723b92cd633c40ed2a495a6bdf36ff6b9019636f304f` |
| `close-roof-shaded.png` | `e045201c2cf58918c4c5adeb62a58e19906d6495211743523dcd0902a5b93b9e` |

Supporting frozen scalar receipts read during this review:

| Receipt | SHA-256 |
| --- | --- |
| `.qa-dev/reports/abrams-source-parts.json` | `238f96fcd4440e3e90334e00585cfcdd11ad92526e351256f61cdc524e61ac73` |
| `.qa-dev/reports/abrams-source-inventory.json` | `3455cf534642fbc26c9e291931cc6e0759e4137fd535d66c51bf9b79a26db2a8` |
| `.qa-dev/reports/abrams-hull-detail-freeze-20260907.json` | `a4d6f00ece004de01d09d10ae8d6d40a0b371094b81d660ad88f7ef254313bd6` |
| `.qa-dev/reports/abrams-hull-endgear-freeze-20260907.json` | `cfcb99487a98bc11cef6deef79403444c58a04153389c6bc35ec4f353e31c04c` |

Only this new review document was authored. No earlier review was overwritten, no browser/GPU job was started, and no runtime geometry was changed.

