# Source and native-buffer adjudication

This supplements the historical 220-ID census. It does **not** turn its metrics into fleet-wide acceptance. The original 440-build snapshot changed inputs while running and remains rejected as a frozen-input receipt. Its 68-ID repair scope is historical; the current integration scope is 74 IDs before any further explicitly recorded repairs.

## Captured additions are not necessarily rendered parts

`partCensus` runs inside `P.add`, before later builders can call `P.clear`, replace a donor, or regroup geometry. The original census retained these additions and used them in its exposure rays. Therefore:

- An old captured donor cannot establish a current rendered defect.
- A repair observed only in a discarded donor cannot establish a rendered repair.
- A zero native match is unresolved until source replacement, coordinate changes, or other transformations are adjudicated.
- Equal duplicate geometry establishes triangle presence, not unique original-object identity. Do not sum matching captures into a native part count.

The new `tools/base-shell-live-stock.mjs` helper independently indexes final drawable mesh triangles in the canonical hull/turret frame. It respects rig, mesh and instance transforms; index buffers; draw ranges; object and material visibility; and material groups. Matching preserves winding and triangle multiplicity at 10 micrometres. It retains partial/no-match witnesses and flags unsupported mesh representations. Its selftest rejects moved, reversed, hidden, missing, removed and spuriously duplicated triangles.

`base-shell-surface-audit.mjs` now retains every raw candidate, adds `nativeMapping` per part and `nativeStockMapping` per build, and distinguishes the historical all-captured exposure ray from `nativePrimaryOnlyExposureWitness`. The latter still excludes equipment, generated fill and opposite-owner stock, so it is not a final visible-surface decision.

## Bounded native proof

The bounded replay covers eight IDs in HIGH and LOW, with stable inputs throughout the replay. The complete compact receipt, input fingerprints, exact unmatched source calls and K2 edge witnesses are in [native-stock-adjudication.json](native-stock-adjudication.json). It predates subsequent Abrams/XK2 remediation; those repairs need fresh evidence.

| ID | Captured primary parts per quality | All triangles found in native buffer | Partial | No match |
|---|---:|---:|---:|---:|
| `k2` | 92 | 92 | 0 | 0 |
| `t90` | 113 | 105 | 0 | 8 |
| `t62mv1` | 55 | 55 | 0 | 0 |
| `pt91m` | 72 | 72 | 0 | 0 |
| `t80` | 100 | 100 | 0 | 0 |
| `m1a1` | 91 | 91 | 0 | 0 |
| `m1a2_sepv3` | 97 | 97 | 0 | 0 |
| `kf51b` | 40 | 40 | 0 | 0 |

Thus the reviewed M1 and KF51 repairs are present in the native buffers. This verifies their rendered stock correspondence, not the complete vehicle's visual acceptance or release status.

T90's unmatched parts are **229, 231, 237, 238, 245, 246, 259 and 260**, in both qualities. `replaceT90BurlakCoreNative2026` explicitly clears the preceding turret buckets. The 2,460-triangle HIGH curved dome at part 229 and the other seven donor solids have no final-buffer match. Of the original four topology-nominated parts, **one is discarded** and **three are live**. These discarded donor witnesses are separate from live geometry findings.

The stable ID `t62mv1` is the original T-62 obr. 1975 donor and retains its cast turret. The transplanted 1987 turret belongs to `t62mv1_x`. The donor must not be marked discarded merely because a different playable slot replaces it.

## K2: fifty cap-edge nominations, plus separate live facets

All fifty nominated `cheekPlaneSpan` parts come from `profiles/k1a1X.ts:319`. The source divides measured planar cheek roofs into short longitudinal spans. Roof-plane intersections introduce collinear vertices; Earcut cap triangulation and the side strips subdivide the same boundary differently.

For 45 parts, every exact-edge boundary candidate is fully covered by oppositely directed collinear boundary segments at a 3-micrometre line tolerance. The seven remaining edges in parts **89, 90, 92, 94 and 95** are only 18–433 micrometres long. Each has an exactly coincident opposite edge in an actual emitted triangle with area **5.69e-11 to 9.64e-10 m²**. `shellPart` had removed these triangles under its existing `1e-9 m²` diagnostic threshold. These fifty nominations therefore do not demonstrate missing cheek roof plates. Their nonconforming cap subdivisions remain an explicit topology characteristic, not a claim of ideal indexed manifold topology.

That classification does **not** dismiss unrelated K2 facets:

- Part **19**, `modern3.ts:235` in the historical snapshot, is the native lower-chin slab. Its old opposite sides chose different diagonals, producing a **5.679 mm** reflected-surface mismatch near `(-1.008, 0.788, 3.414)`. Bounds are X ±1.08, Y 0.40–0.90, Z 3.11–3.51 m. The narrow repair now retains all eight corners and all four broad planes, with convex side facets. An independent rerun of `modern3PrimaryStock.selftest.mjs` verifies the actual merged HIGH/LOW hull, positive closed stock, no crossings, and mirror error below one micrometre for both `k2` and inherited `k2b`. Its historical negative reproduces the old discrepancy. Final rendered review remains pending.
- Parts **34/47** and **46/59**, `buildK2Skirts`, are the 20 mm thick skirt's top/bottom bevel returns. The broad sidewalls are planar. Their changing inner/outer hem and roof heights create noncoplanar return facets; the large fourth-corner distance does not mean a 110 mm hole in a 20 mm panel. Native appearance still needs review.
- Part **66**, `k1a1X.ts:turretBody`, includes a deliberately varying measured multi-section turret outline. Its reentrant adjacency is not a self-intersection or missing plate. Do not convexify the complete asymmetric turret from this metric.

## Russian cast and open-bottom generators

`russia.ts:meshDome` uses `THREE.LatheGeometry` through `factoryGeometry.ts:lathe`; that primitive does not add end caps. Live T-62, PT-91M and T-80 dome nominations each correspond to the two end loops: the wide turret-ring opening and the small crown opening. They are neither a twisted planar plate nor an inward-facing entire casting. Whole-assembly coverage by neighboring ring/roof stock and generated fill remains the native sealed/view check; source inspection alone does not prove those openings invisible.

T-80's additional concavity follows explicit cast profile changes, including the flared base and changing shoulder slope. The source is a rotational cast section, not a nominally flat welded plate. Retain the casting instead of flattening it to satisfy the adjacency metric.

The three live T90 topology candidates are part **265** (ring apron) and parts **266/269** (shoulder foundations). `factoryGeometry.ts:polyTurret` emits side walls and a top fan but **no bottom cap**. Their boundary loops are exactly the authored bottom perimeter: ten apron edges and seven edges per shoulder. This is an open-bottom generator contract, distinct from the discarded donor dome. A source comment calling the apron “closed” does not change those actual triangles. Assembly underside closure/visibility is still pending native verification and must not be recorded as individual watertight finite stock.

## Abrams: the twenty-three facet nominations are different mechanisms

All reviewed M1A1 and M1A2 SEPv3 primary parts map fully to their actual native buffers in HIGH and LOW. Their historical 23 facet-nominated parts separate as follows:

| Parts | Source | Finding / disposition |
|---|---|---|
| 3–7, 10, 53, 57 | `abrams.ts:loftBand` | Eight bow/stern narrow return solids. Fixed-width bottom and inset top follow different height courses. The old side diagonals produced real reflected differences up to 12.561 mm. Corrected outward facets preserve the same eight corners and broad planes; native regression passed. |
| 27/28, 36/37, 42/43 | `loftTrackClearBand` | Six sponson returns retain raised track-clear floors. Old opposite diagonals differed by up to 7.701 mm. Corrected actual native side facets mirror while preserving all station heights; animated track clearance regression passed. |
| 134/135 | `addAbramsShellCheeks` | The repaired front and roof courses remain planar and reflected. The nomination is the buried rear closing return, with both witness directions blocked by captured stock. This is not evidence to undo the front cheek repair. |
| 136/137 | `addAbramsShellBody` transition | Convex physical transition facets. A noncoplanar set of four boundary corners alone does not imply a self-crossing plate or require flattening its datums. |
| 138 | `addAbramsShellBody` center | Intentional curved elevation recess; the concave adjacency provides gun clearance. Do not fill or flatten it. |
| 142–145 | `addAbramsShellBody` aft courses | Four bustle side courses follow explicit undercut `yBotKnees`. Corrected side diagonals now fold outward; the exact intended bottom profile and attachment corners remain. Native regression passed. |

Historical exact coordinates, triangles and mirrored witnesses are preserved in `.qa-dev/surface-repair/m1-return-source-witnesses.json`. The independent current Abrams regression passed with stable inputs (`b9c4c6e300a675c16c2967b0cfa1ee8e8655d03190523df4dac1d4ebd697e5c8`): seven family IDs × HIGH/LOW, 882 actual drawable courses, finite coherent closure, exact boundary and undercut datums, physical mirror, and 329,728 conservative animated shoe bounds. The test includes old dent, mirrored inward-fold, shifted-native and track-intrusion negatives. Its 64 track phases and 3 mm expanded finite shoe bounds are focused coverage, not a replacement for the integrated strict-track check. The side quads retain 476 explicitly nonplanar outward facet nominations across those builds; they were not falsely made or classified as planar.

The narrow geometry fixes were authored separately. This independent pass only read source, reran bounded tests and updated diagnostics/documentation. Native capture of final repaired geometry, fresh full-fleet census, and release verification remain pending.

## Additional family review: discarded, transformed and live geometry

A second stable replay covers twelve additional IDs × HIGH/LOW. The complete compact proof is [native-stock-family-adjudication.json](native-stock-family-adjudication.json). Direct mapping uses the same owner-local frame as the historical census; the last column explains every unmatched set rather than assuming absence means deletion.

| ID | Captured / direct native / unmatched per quality | Source-confirmed disposition |
|---|---:|---|
| `chieftain5` | 104 / 76 / 28 | `clearChieftainUpper` discards the old rotating package. Its only topology flag, 60-edge dome part 99, is discarded. The new turret is a separate live construction. |
| `chieftain_mk10` | 94 / 70 / 24 | Same explicit replacement; the old 60-edge dome part 81 is discarded. |
| `bmp2` | 33 / 33 / 0 | Live 30-segment cast dome part 88. The two uncapped end loops are not twisted plate caps; assembled coverage is pending. |
| `bmp3_rok` | 36 / 31 / 5 | `addBMP3Turret` clears the BMP2 donor turret. Dome part 88 and four other donor captures are discarded. |
| `bwp1` | 35 / 30 / 5 | `addBWP1Station` clears the same five BMP2 donor captures. |
| `marder1a3` | 46 / 38 / 8 | The Bradley turret is discarded by `addMarderCastTurret`. Current part 97 is a live 22-segment cast dome with end loops. |
| `bmp3` | 33 / 33 / 0 | Live 26-segment cast dome part 73. A separate source roof plate covers the tiny crown region; full assembly coverage remains a native check. |
| `type90` | 31 / 20 / 11 | **Retained and transformed**, not discarded. Exact source-declared shell-group scale `[1, .68, .82]` maps every unmatched capture to drawable native triangles. |
| `type90a` | 33 / 20 / 13 | Same retained shell transform, including its additional armor pieces. |
| `ua_t84_oplot_m` | 67 / 67 / 0 | Live `polyTurret` prism part 139: twelve authored bottom-perimeter edges, no separate bottom cap. |
| `t90ms` | 117 / 108 / 9 | `rebuildT90MSTurretExact` clears the old rotating package. The 16-edge legacy prism part 214 and eight other old pieces are discarded. |
| `k1a1` | 25 / 25 / 0 | Live part 40 uses `variablePolyLoft`, an alias of `KIT.polyLoft`, which emits sides/top but no bottom. The roof has explicit varying station heights. |

The Type 90 proof checks the actual `type90_turretShell` parent, translation, orientation and source-declared scale before applying it to the observation. All 11/13 unmatched parts then match in both qualities, and an incorrect Y scale of `.69` fails. It does not fit or optimize a transform to get a match. The original direct `no-native-match` records remain visible because they correctly expose the difference between authored and final owner-local frames.

Across the second replay, **79 captured primary parts per quality are source-confirmed discarded donors**, while **24 are retained under the Type 90 shell transform**. The original T90's eight discarded captures are separate. Counts are not unique native object counts: triangle-identical duplicate authored additions cannot be assigned distinct identities from geometry alone.

These generator-level decisions address the specified topology nominations. They do not accept every remaining facet on those vehicles. In particular, the active Chieftain rebuild, current T90MS shell, K1A1 varying roof, Type90 wall/roof facets, and Oplot wings retain their own surface and visual checks. No cast surface was flattened and no uncapped primitive is labeled individually watertight.
