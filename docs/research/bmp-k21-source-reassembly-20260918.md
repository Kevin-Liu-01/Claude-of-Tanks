# BMP Dragun 125 and K21 source-only rear-door assembly

The owner approved correctly assembled supplied targets on 2026-09-18. Two private derived targets now place each supplied rear access door in its existing source aperture. Their origin-local nodes were previously described as suspension-like stock; direct source inspection shows a door plate, handle and hinge leaves matching an empty rear opening. No procedural candidate was used to identify the parts or derive either placement.

| Target | Exact selector | Translation in canonical metres | Source perimeter fit | Derived SHA-256 |
|---|---|---|---|---|
| `bmp3m_dragun125_x` | node 10 `Object_11`, mesh 9; all 828 triangles / 21 components | `[-0.47097500196347636, 1.1820333277185757, -3.2602916439063847]` | 12 correspondences to `Object_15`; RMS 0.597 mm, maximum 0.930 mm | `d79a8383dd79d8dfefc98ae47b9b12d6c60bac55df3eb1671266fef6029fc8e8` |
| `k21_x` | node 6 `Object_7`, mesh 5; all 652 triangles / 15 components | `[-0.2462999764829874, 1.3396999835968018, -3.6843499925744254]` | Four back-face corner correspondences to `Object_6`; RMS / maximum 0.461 mm | `e2103e87628337778107ba4beec0fb5f6ad9e29136eab65ba27aa7f8bfdd956b` |

Both operations retain the source-baked orientation and unit scale. The original canonical registration stays unchanged: BMP translation `[-.00237,0,0]`; K21 `[-.000015,-.0138,0]`. Original canonical SHA-256 values remain BMP `4fd69d170bf494b8a795bf5d6618e94db10c7cdb562b9f37210bc613f402af16` and K21 `ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8`. Raw downloads, canonical files and prior failed qualification receipts are untouched.

The deterministic writer changes only the selected node matrix. Every binary chunk, accessor, mesh and material definition remains byte-exact; nonselected JSON has an authenticated preservation digest. A second write of each recipe produced the same GLB hash. Independent source loading verifies all 24 BMP and 32 K21 mesh attribute digests and all nonselected world transforms. Nine full-scene FrontSide rear rays per vehicle now hit the actual relocated door. No parts were deleted, merged or reshaped.

All 12 original before/after source images were inspected: rear, rear-quarter and door-close for each vehicle. The BMP door closes the chamfered opening nearly flush and joins both existing hinge leaves. The K21 door covers the rounded opening with its original thickness and edge relief, while its hinge arms meet the original pivots. Ports, handles and latch hardware move together with each door. Both low loose doors disappear from the underbody silhouette solely because they are now seated at the rear. Other vehicle stock is visibly unchanged. These observations establish a plausible source-only static closed pose; they do not certify hinge animation or factory dimensions, and author review does not substitute for independent qualification.

Private reproducible evidence is under `.qa-dev/tank-run/source-assembly-eastern/`:

- `bmp3m_dragun125_x-assembled-r1.glb` and `k21_x-assembled-r1.glb`, with matching `.manifest.json` and `*-recipe-r1.json` files.
- `source-receiver-fit.json`, `components.json`, `planes.json`, `contours.json`, and the source contour diagram `contours.png` record the original measurements and exact correspondence selectors.
- `assembled-native-validation.json` records source-only geometry preservation and all 18 rear ray results. The word “native” in this private filename refers to loaded source geometry, not the game's procedural models.
- `review/<id>/{before,after}/{rear,rear-quarter,door-close}.png` contains every original. `render-views.json` fixes matching cameras; `review-identity.json` hashes all images, targets, manifests, measurements and relevant private helpers.
- The first validation attempt's harness failure is retained in `validate-r1.log` / `validate-before-index-fix.mjs`: it read an array bound as `.y`. The corrected array indexing passed in `validate-r2.log`; no transform or source geometry changed to obtain the pass.

The targets remain private pending independent review and parent integration. Existing canonical sources, runtime profiles, packets, gates and publication state were not changed by this preparation.
