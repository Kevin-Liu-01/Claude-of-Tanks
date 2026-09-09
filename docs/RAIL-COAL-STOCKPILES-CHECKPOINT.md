# Rail coal stockpile checkpoint

Base: `92b328a83d4dca5cb9d155ca8ad69d37b5203bf4`. Scope is the coal bug fix only;
no terrain, road, horizon, vegetation, water/buoy or Foundry compound changes.

## Repair and limits

`mapKits.ts:addRailYardCoalHeaps` previously emitted large smooth ellipsoids in
the shared glossy hardware material with no movement or shell records. The
native Railyard close view confirms their appearance; pass-through is established
by the missing records, not an interactive driving capture.

The replacement is small rough charcoal stockpiles in an outer-siding unloading
strip. Their terrain-sampled rims are buried 5 cm; footprint admission rejects
roads, water, excessive relief and existing solids. The apex is .66–.84 m above
local support. Existing baked vertex colors supply matte .88-roughness material;
the shared dark hardware material is unchanged. Original RNG draws and all
non-coal kit geometry remain byte-exact across all 30 maps.

Each pile uses 72 triangles/9,504 merged vertex bytes versus the previous
100 triangles/9,600 bytes. No new material, texture, mesh bucket, per-frame work
or global collision algorithm is introduced. Movement and shell records use the
actual packed-vertex convex hull and Y bounds: the existing conservative rock
vertical-prism approximation, **not exact sloped ballistic skin**.

Parent review accepted the original native close/context pair as a scoped coal
repair: glossy domes are gone, low rough piles sit outside the rails. Regular
spacing and low-poly facets remain modest art limitations. This is not whole-map
beauty, FPS, memory-improvement or road/Foundry-pilot acceptance.

## Native generated data

The maintained capture refreshed exactly these four shards and their index:

| Map | Coal obstacles + colliders | Final obstacle/collider/concealer census | Encoded bytes |
| --- | ---: | --- | ---: |
| Railyard | 7 + 7 | 2715 / 2554 / 1973 | 717,932 |
| Caldera | 7 + 7 | 4692 / 4587 / 3572 | 1,118,645 |
| Foundry | 6 + 6 | 3952 / 3797 / 2939 | 997,688 |
| Skybridge | 4 + 4 | 3112 / 3165 / 1892 | 928,864 |

Total encoded increase is 7,251 bytes; frozen shard ceilings, precision, codec
and concealment counts are unchanged. The other 26 shard files remain identical.

### Two pre-existing browser/Node wreck-bake discrepancies

The initial exact old-fixture comparison failed on these two OBBs, each mirrored
in movement and shell arrays. A clean-base Node/main-thread control also failed
to reproduce the native Foundry width. A separately rebuilt exact-base native
Foundry/Skybridge control then reproduced **every** candidate non-coal record,
including both changed widths, with exact arrays/order/metadata and concealment.
The rebuilt baseline index hash matches the original baseline build exactly.
These are pre-existing browser/Node bake discrepancies, not coal-induced changes
or a globally fixed wreck-bake issue. No manual fixture correction or waiver was
applied; the actual native capture is retained. The Node control reached Foundry
only; the successful native control covers both maps.

Exact old → freshly captured deltas (all other fields unchanged):

- Foundry, obstacle 1005 / collider 850:
  `b [-278.5219,-0.3441,66.5421,-269.4781,2.2798,75.4579]`
  → `[-278.5231,-0.3441,66.542,-269.4769,2.2798,75.458]`;
  `s ["o",-274,71,4.2412,4.1722,0.0698]`
  → `["o",-274,71,4.2424,4.1722,0.0698]`.
- Skybridge, obstacle 1219 / collider 1272:
  `b [281.5425,-0.7501,-318.0357,291.817,1.8738,-307.8611]`
  → `[281.5414,-0.7501,-318.036,291.8181,1.8738,-307.8608]`;
  `s ["o",286.6798,-312.9484,4.2412,4.1722,-0.2486]`
  → `["o",286.6798,-312.9484,4.2424,4.1722,-0.2486]`.

## Evidence and verification

External evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/rail-coal-native-r1.doMExs`.
It retains original native `baseline/` and `candidate/` close/context PNGs and
reports, build/source fingerprints, `check.json`, `production.json`, the failed
`collision.json`, and the separate negative `base-wreck-control-failure.json`.
`native-base-control-r2.json` is the successful exact native attribution, with
raw controls in `native-base-raw/`. The separate `native-base-control.json`
preserves an initial prebuild PATH failure before any browser acquisition.
`final-check-r2.json` records the final gate and all 26 sibling SHA-256 comparisons;
`final-check.json` preserves a wrapper read-buffer failure before tests began.

Initial coal, washout, world collision, TS7, metrics and cached doctor checks
passed. New headless checks cover exact coal census, codec/inflation round-trip,
convex hull contact, shell cover, top clearance and clear rail lanes. The final
checkpoint gate covers dedicated collision, frozen codec byte/checksum limits,
loader corruption checks, existing lifecycle-memory bounds, signaling and TS7.

The baseline and candidate builds are retained in independent worktrees. Any
later integration with held roads or relocated Foundry donors needs fresh
collision capture for the changed source; do not transplant these shards blindly.
