# Supplied-fleet authored shadow support audit — 2026-09-18

Read-only inspection built all thirteen supplied models at HIGH with actual generated interior records loaded. It compared each existing structural bucket against the exact six cardinal plus 48 spherical directions used by the native convex shadow builder. The baseline is the uninset source support selected by the existing builder, not a generic box or a triangle-count percentage. Native `castShadow` is disabled on these visible surfaces, so omitted outer stock has no independent fallback caster.

**All twelve existing hullExternalArmor buckets contribute missing outer support.** AFT has no such bucket. These are broad permanent authored panels, cells or bow blocks. The table records the largest directional extension beyond the current source inputs; values are not shadow-map pixel areas and include diagonal directions.

| Model | Extending directions /54 | Maximum missing support | Actual fixed source stock |
| --- | --- | --- | --- |
| kurganets25_x | 31 | 488.17mm | Twelve broad side armor/flotation cells, extending to ±2.0645m. |
| ztz100_x | 41 | 533.25mm | Three stepped skirt bands and the source glacis appliqué field; their narrow rail and fastener detail stays excluded. |
| fv510_milan_x | 33 | 638.07mm | Continuous stepped outer side armor, spanning the source hull shoulder to ±2.10m. |
| griffin50_x | 10 | 365.64mm | Three source-derived upper skirt runs on each side; excludes separate fine ribs and lower detail apron. |
| ajax_x | 10 | 421.74mm | Continuous source side armor from the rear chamfer to the narrowed front return. |
| kf41_lynx_x | 43 | 564.59mm | Two broad side cells with tapered front/rear ends, 7.5m long and up to1.453m high. |
| cv90_mkiv_x | 28 | 236.86mm | Source upper side walls, twelve independently hinged panels and the separate lower side curtain; not the nearby hinge fasteners. |
| cv90105_tml_x | 18 | 124.53mm | Source upper side walls and twelve lower skirt panels. |
| sabra_mk2_x | 11 | 189.92mm | Eighteen large side-skirt panels with the measured changing outboard plane. |
| aft10_x | 0 | — | No external-armor bucket; keep existing hull sources. |
| bmp3m_dragun125_x | 24 | 422.75mm | Massive closed flotation/armor shoulders and leading structural skirt returns; excludes open rear slat rails. |
| k21_x | 11 | 252.58mm | Twelve large side protection panels; excludes their small raised bolts and latches. |
| type96b_x | 1 | 15.96mm | Five measured permanent protective bow blocks, not invented explosive ERA. |

Sabra’s `turretExternalArmor` comprises four shallow cheek plates (48 triangles). None extends any of the 54 existing turret supports. It therefore has no demonstrated outer-shadow benefit in this audit and should not be added merely to improve the source-to-proxy triangle ratio.

A bounded follow-up checked the separately named structural hatch/cupola buckets. It found the following omitted real roof stock, independent of external armor:

| Model | Existing structural bucket | Extending directions /54 | Maximum support extension |
| --- | --- | --- | --- |
| kf41_lynx_x | `hullHatch` | 1 | 27.00mm |
| kf41_lynx_x | `turretHatch` | 2 | 150.00mm |
| cv90_mkiv_x | `hullHatch` | 2 | 86.01mm |
| cv90_mkiv_x | `turretHatch` | 3 | 181.13mm |
| cv90105_tml_x | `hullHatch` | 1 | 21.20mm |
| cv90105_tml_x | `turretCupola` | 4 | 178.50mm |
| cv90105_tml_x | `turretHatch` | 4 | 281.50mm |
| sabra_mk2_x | `turretCupola` | 4 | 418.00mm |

Sabra’s cupola result is its existing large curved dome, not a small optical fitting. KF41/CV90/TML rows are actual closed hatch/roof armor. ZTZ100’s separate hullCupola bucket extends no support direction and is not recommended on this evidence.

The narrow implementation recommendation is an explicit per-profile allowlist of these fixed structural buckets, consumed while collecting support vertices for the existing hull/turret proxy. Include `hullExternalArmor` for the twelve measured profiles, and only the positive structural rows above for those exact profiles. Do not add all `hullDetail`, `turretDetail`, `Equipment`, optics, bolts, antennas, open basket/slat rails or legacy fleet buckets. Keep the same support directions, insets, proxy draw limit and triangle ceiling. The opt-in changes real support selection, not the count reported after construction. Convexification can still bridge cavities; rendered shadow/self-shadow checks and actual proxy budgets remain necessary after the parent’s implementation.

## TML gun-shadow preservation

The frozen pre-ownership TML profile was loaded from a private import-rewritten copy and replayed through the same native factory as the current profile. Only the in-process builder registry changed; runtime files were not edited. With the parent’s selective tagged-dark source path, the before/after `procShadow_gun` positions, bounds and support census are exact at both qualities:

| Quality | Proxy triangles | Support points | Source triangles | Position-buffer SHA-256, equal before/after |
| --- | --- | --- | --- | --- |
| high | 36 | 20 | 2108 | `849ef945ff10fce5a7af4d601b279808ca288e509e1215587d56fb647d017fcb` |
| low | 36 | 20 | 1210 | `c526d3960e73777c50d952dd28846c40bd69e8410b999d75da4f1ad4470de7b8` |

The tagged current optical receiving mesh contains 192 HIGH /96 LOW triangles. This preserves the actual dark stock’s former participation without admitting every legacy gunMountDark fitting. It is not evidence that the recessed lenses independently enlarged the silhouette; the exact native proxy parity is the supported conclusion.

Frozen original TML profile SHA-256: `b495b586ab21320c76031c6c14a5856ac4ff638b31b11cfbb4aa32ce7631bcdd`.

Private evidence: `.qa-dev/tank-run/gun-ownership/shadow-census.json`, `shadow-structural-census.json` and their reproducible scripts/logs. Each contains exact bounds, source triangle counts, direction vectors and all positive support deltas. No runtime, source profile, generated asset, camera or gate threshold was changed by this audit.

## Applied metadata and native validation

The subsequent authorized implementation adds `additionalShadowSources` only for the twelve extending hull-armor buckets and the eight positive hatch/cupola rows above. AFT remains unchanged. Sabra turret appliqué and ZTZ hull cupola remain excluded because the measured support test found no extension. The profile edits only select existing stock for the native shadow builder; they do not alter source topology, visible armor, materials, articulation, collision, or generated records.

`src/vehicles/profiles/suppliedShadowCoverage.selftest.mjs` passes all thirteen supplied vehicles plus Leclerc, Abrams and ISU controls at HIGH and LOW with actual generated fills loaded. Fixed measured witnesses include Warrior's outer side armor, Sabra's raised curved cupola, the KF41 roof hatch, TML's upper hatch, Type96's protective bow blocks, and the lower-side diagonal silhouette of Ajax and Griffin. Installed casters remain inward-seated, attached to the real hull/turret/gun owners, and invisible to the color pass. All twenty-six supplied builds use exactly three shadow draws, 130–228 total shadow triangles, and no part exceeds 120 triangles. All eighteen legacy caster position buffers remain byte-identical to their pre-edit captures.

The before/after world-triangle fingerprints also match for all twenty-six builds at their original 1e-6 normalization precision. A second, stricter native replay compares the same frozen factory with only `additionalShadowSources` removed in memory for the baseline. It verifies byte-identical visible attribute/index/instance buffers, exact world transforms, unchanged material signatures, geometry groups, draw ranges and mesh multiplicity for every HIGH/LOW case. This replay does not round attributes and does not write runtime or generated files.

Evidence is under `.qa-dev/tank-run/gun-ownership/`: `shadow-optin-native.log`, `shadow-optin-visible-before.json`, `shadow-optin-visible-after.json`, and `shadow-optin-exact-replay.json`. `shadow-optin-profile-freeze.json` pins all thirteen profiles, the shared core/material/helper and the new fixture before final generation; `shadow-optin-final-evidence.json` records result hashes and checks runtime identity after validation. The parent owns the subsequent generated assets and rendered shadow review. These native checks do not certify shadow-map pixels, waive source conflicts, or replace the composed release gate.
