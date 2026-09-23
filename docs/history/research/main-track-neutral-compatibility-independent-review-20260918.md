# Main end-track relay — independent neutral compatibility

Compared old owned core against integrated main `88592876f84eb1794f2a6d5505bd39d7c51c4ecd`. Result: **PASS, 26/26 exact neutral comparisons**, 13 IDs at HIGH and LOW (52 actual builds). No runtime source was edited by this review.

The baseline uses the saved pre-integration `tankFactoryCore.ts` and `29c9ecefd:src/vehicles/loadedTrackContact.ts`. Two private copies contain the same 2,132 current source files except those two files. Live source was hashed before and after copying; both private snapshots remained unchanged through acquisition. The jobs used the shared FIFO lease and released it after comparison.

The real rendered-material construction path was used (`geometryReceipt:false`, native canvas, fixed camo seed 4242, unbatched selected geometry), with all actual per-ID interior fills loaded. Comparison includes every mesh, even hidden LOD and invisible shadow stock: complete attribute/index bytes (positions, normals, UVs, colors and any additional attributes), instance matrices/colors/counts, local/world transforms, material assignments, group/draw ranges, visibility and shadow flags. Material descriptors include scalar/vector state, shader hook source hashes, defines and texture pixel bytes. UUIDs are excluded. Visible-only hashes also match.

| ID | HIGH | LOW |
|---|---|---|
| kurganets25_x | Exact | Exact |
| fv510_milan_x | Exact | Exact |
| aft10_x | Exact | Exact |
| type96b_x | Exact | Exact |
| kf41_lynx_x | Exact | Exact |
| k21_x | Exact | Exact |
| cv90_mkiv_x | Exact | Exact |
| cv90105_tml_x | Exact | Exact |
| ztz100_x | Exact | Exact |
| ajax_x | Exact | Exact |
| griffin50_x | Exact | Exact |
| bmp3m_dragun125_x | Exact | Exact |
| sabra_mk2_x | Exact | Exact |

## Scope and carry-forward

This establishes neutral selected-stock/material equivalence across this core integration, allowing prior accepted neutral source/material/assembly reviews to carry forward for otherwise unchanged IDs. It does **not** establish articulated suspension/end-ramp, moving track, runtime performance, full source-target qualification or pixel-rendered shadow equivalence. The five assembled-source target changes still require their new canonical and Garage captures after the parent authorizes the post-generation freeze.

Live source drift at end of this acquisition: `["src/vehicles/profiles/k21RearHullStock.selftest.mjs", "src/vehicles/profiles/k21X.ts", "src/vehicles/interiorFillGroups/k21X.generated.ts"]`. Any later profile or generated-file changes require their own identity reconciliation.

Receipts: `.qa-dev/tank-run/main-track-integration/independent-neutral/{snapshot-identity,old-result,new-result,comparison,final-integrity}.json`. Full per-mesh descriptors and hashes are retained, together with both isolated source snapshots and harnesses. The first queue launch failed before acquiring the lease due to a private wrapper relative-import typo; `queued.log` preserves it. Corrected private wrapper run `queued-r2.log` completed without source changes.
