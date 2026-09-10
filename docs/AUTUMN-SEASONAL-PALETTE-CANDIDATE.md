# Autumn seasonal palette — accepted scoped improvement

Base: `c0064aaae78a248c6e1a46886788e455c6098482`, isolated branch
`codex/autumn-seasonal-palette-20260909`. No shrub-shape or held normal changes.

The personally reviewed published `bush-crown-native-r1.Yupg31` Autumn near and
establishing images show repeated scarlet/orange foliage against straw/olive
ground. The existing atlas hue remap compresses variation to 25%, then the card
color multiplies another strongly saturated orange tint. Poplar inherits oak;
aspen inherits birch. The comment about an evergreen counterpoint has no actual
pine in this map's species list.

Only `src/world/maps/autumn.ts` changes runtime data:

| Existing species | Draft family | Card hue / saturation | Far hue / saturation |
| --- | --- | --- | --- |
| Oak and its bushes | Muted russet/copper | .065 / .24 | .070 / .28 |
| Poplar | Ochre/olive | .150 / .26 | .150 / .32 |
| Birch | Gold | .115 / .28 | .115 / .34 |
| Aspen | Pale straw | .135 / .16 | .135 / .24 |

Atlas lightness formulas and far lightness bounds are unchanged. Existing
`cardL0` values stay exact: the broadleaf builder passes this misleadingly named
field to wind flex, not color lightness. Instance jitter, four existing species,
placement mixes/counts, terrain/grass/props, alpha and all rendering code remain
unchanged. New explicit palettes select colors for already-existing species
atlas/material owners; they do not introduce textures, shaders, geometry or
draw operations. The existing construction-time tone pass gains hue arithmetic
for twig palettes; no construction-time or frame-performance measurement is claimed.

## Verification

`autumnSeasonalPalette.selftest.mjs` executes the actual registry, builders,
Canvas painters and foliage/depth material constructors through `registerHooks`.
It compares 12 near, 8 far and 2 bush geometry pairs at production seeds, observing
RNG calls/tails and requiring every non-color attribute, index and bound exact;
trunk colors also stay exact. It checks byte-exact atlas alpha, sampling policy,
four atlas/four foliage/four depth owners, palette ranges and wind/value inputs.
Negative controls cover old collapsed families, saturated cards, alpha changes,
geometry movement and altered flex. Shader registration is a no-op binding in
this Node fixture: this is not shader compilation or a GPU residency census.

The default suite uses explicit c006 palette literals and checks that all other
29 loaded configs remain unmutated. The independent frozen-root mode additionally
compares those 29 whole configs, Autumn's entire non-palette config, and the
whole vegetation implementation with the actual frozen c006 source, then uses
that source's actual Autumn palette as the predecessor:

```sh
node src/world/autumnSeasonalPalette.selftest.mjs --baseline-root=/Users/kevinliu/.codex/worktrees/cot-grass-blade-shape-20260909
```

`autumn-palette-checks-r1.6uwHsN` passed the independent frozen-root test,
vegetation lighting/resources, foliage atlas padding, tree pool capacity,
TypeScript7, scoped quality/Doctor, diff check and public build under the ordinary
CPU FIFO. Runtime source SHA is
`45e8a07cb0ed0a2a9f12280281b49388bc1026e273a6c27e48f7b4621610ed62`;
built index SHA is
`18458f039330530f45c2d28e62967b0c8854f0e262fa21c08871fd6d04299018`.

## Native review and integration

`autumn-seasonal-palette-native-r1.GArrgZ` compares the exact c006 baseline and
4ae234cce candidate at fixed Autumn near/establishing cameras. Root and an
independent reviewer inspected all four native1440x900 Metal images. Copper,
gold and olive now break up the scarlet/orange uniformity, especially in the
wide view. Accepted as a palette improvement only: black bush cavities,
broken-card silhouettes, coarse distant shapes and repetitive planting remain.

Both sides retain670 near /675 wide renderer geometries,211 textures and209
programs. The attached foliage inventory stays42 geometries,11 materials,
7 textures,42 instance owners,6,243,912 geometry/instance view bytes and
8,865,352 observed typed backing bytes. All positions, normals, bounds, alpha,
instances and grass/crop contracts match. Only22 crown/bush color buffers and
four existing atlas RGB contents differ. Normal120-frame observations retain
42 foliage submissions per frame and1,762,900 near /1,856,708 wide submitted
triangles on both builds. These callback counts exclude shadow paths that
bypass the callback; they are not the final postprocess counter or GPU timing.

Raw near submission-wall median/p95 is2.3/2.5ms baseline versus2.4/2.6ms
candidate; wide is3.4/6.4ms versus2.6/3.3ms. Delivered-interval medians are
16.6/16.6ms near and16.5/16.7ms wide. These short sequential observations
include driver/scheduling variation and do not establish a speed improvement
or a no-regression certificate.

The acquisition completes in73.902s with source/build pins stable, no recorded
errors, browsers/previews closed and the capture lease released. Static art
and exact observed resource budgets do not certify full-frame/mobile cost,
idle heap behavior, palette construction time or the whole environment goal.

Integration onto unrelated published HUD/vehicle-worker/test improvements at
1beb0c780 preserves the exact palette and vegetation runtime. The isolated
integration commit is17d999a92. `autumn-palette-integration-r1.5LUhiy` repeats
the five focused tests, TS7, quality/Doctor and public build successfully.
Its build index is
`02bddabb5e3534dfe7d815925fe655890df0fd2d3b970652c11263ed4dad02d4`.
The matched art images above precede this integration; they are not new
screenshots of the unrelated HUD/worker changes. No held shrub, canopy-normal,
water-tint or road prototype is included.
