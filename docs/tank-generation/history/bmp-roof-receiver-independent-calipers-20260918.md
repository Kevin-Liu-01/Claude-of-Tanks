# BMP roof receiver — independent source-only calipers

The large forward roof unit occupies an actual opening across the source turret's shallow upper surface and steep right shoulder. It is not a simple object resting on an uninterrupted broad roof. A blanket roof lowering is incorrect: the smaller adjacent unit's receiving surface needs to rise relative to the current authored roof.

This investigation does not edit or author BMP runtime geometry. Source is the approved assembled GLB `public/models/community-candidates/bmp3m_dragun125_x_assembled_20260918.glb`, SHA256 `d79a8383dd79d8dfefc98ae47b9b12d6c60bac55df3eb1671266fef6029fc8e8`. Its turret stock is unchanged by the rear-door assembly operation. Two source-only jobs ran through the shared FIFO; the isolated outputs remain in `.qa-dev/tank-run/dragun-roof-receiver/`.

## Primary roof and actual aperture

The primary turret skin is **Object_14 connected component162**, 30 welded points and52 triangles, position-triangle SHA256 `b9e5ee026c031e621763719ffb74ebf411e336352386abf343b5b677a51e270e`. Component0 is the lower ring and must not be mistaken for this roof.

Source upward-face calipers around the units:

- Shallow upper roof, face5557: `Y = 2.584291039 − 0.053476306 Z`. Other adjacent upper faces vary slightly; the actual per-triangle planes and bounded extents are retained in `source-study-r2.json`.
- Steep positive-X shoulder, face5540: `Y = 2.737945411 − 1.131504439 X − 0.587201554 Z`. This plane applies within its actual source triangle, not across the whole turret.
- The receiver opening has six boundary edges. Its bounding scalar extents are X[.261530,.603630], Z[−.802430,−.490630], Y[2.437280,2.627280]:342.10mm across X and311.80mm along Z. The six nonplanar boundary stations are recorded only as independent source QA calipers; no source topology is proposed for the runtime.

At X.4/.42578,Z−.7/−.6, full source downward intersections find the raised component185 cap and component1 recessed floor, but **no component162 roof** beneath them. Double-sided diagnostic rays retain every source surface; nothing was hidden or removed to create this result. The source floor normal points upward, so its receiving face is also FrontSide eligible for a downward ray.

The large component1 bounds are X[.233330,.618230],Z[−.850430,−.466430],Y[2.407780,2.655580]. Its asymmetric lower shell spans the shallow roof/shoulder transition. The actual recessed surface is Y2.584780; rim stock reaches2.655580 and the separate component185 cap reaches2.734180. These values must remain separate: raising the recessed floor to the current native roof would change the source unit.

## Current authored roof discrepancy

The current `bmp3mDragun125X.ts` broad top interpolates between Z−1.08,Y2.66 and Z−.19,Y2.55. Values below are exact algebra from those authored stations, not new native-ray measurements. Root's independent actual first-hit measurement at the large unit agrees.

| Station | Current native roof | Source receiving relationship | Implication |
|---|---:|---:|---|
| Large unit center X.42578,Z−.65843 |2.607895843 |Recess floor2.584780; high roof absent locally |Native roof would bury floor by23.116mm |
| Small unit center X.138,Z−.41248 |2.577497528 |Primary shallow roof2.606348946 |Source seat is28.851mm higher |
| Outer shoulder X.6,Z−.8 |2.625393258 |Actual source2.528803991 |Native top is too broad/high here |
| Outer shoulder X.6,Z−.7 |2.613033708 |Actual source2.470083835 |Steep source shoulder differs materially |
| Outer shoulder X.6,Z−.6 |2.600674157 |Actual source ray2.411190 |Source shoulder bends through adjacent triangle |

At the large center, extrapolated shallow source roof would be2.619501, but that face does not exist inside the opening. It cannot be used as the recessed floor datum. At the small center, actual component163/169 stock is supported by the shallow source roof; a bridge placed against the current lower roof would require an explicit fitted receiver and should not be called the source plane.

## Smallest sound correction and checks

Independently construct a bounded closed receiving section around the two units: preserve the shallow source upper plane at the small unit, transition to the measured steep positive-X shoulder, and form a local closed well under the large unit. The source-sized unit's floor and surrounding walls must close the well; do not delete roof faces and leave an unsealed hull. Preserve unaffected turret stations, absolute unit heights, gun/cradle ownership, source frame and running gear. Derive the new primitives from scalar plane/section dimensions; do not paste source triangle/vertex payloads into runtime.

Required decisive checks after authoring:

1. Full installed scene, fills loaded, HIGH and LOW: downward first-hit rays reach actual exposed recessed floor at source Y2.584780 where the cap does not occlude it, rim at2.655580 and cap at2.734180. A merely added but buried floor fails.
2. First-hit/finite stock checks at the small unit verify its source plane and actual receiver contact near2.606349; no floating support caused by lowering the whole roof.
3. Surrounding source stations outside the opening prove retained shallow top and right shoulder, preventing an over-wide arbitrary cutout.
4. Closedness, finite seating at legal turret/gun poses, source views, cost and fresh filled canonical review remain separate from this source-only diagnosis.

Receipts: `source-study.json` (156 full-scene source stations), `source-study-r2.json` (same stations plus actual primary boundary and face planes), `calipers.json` (hashes and derived scalar comparisons), and their unchanged source-study scripts/logs. The current failed visual round remains preserved in `final-approved-targets-review`.
