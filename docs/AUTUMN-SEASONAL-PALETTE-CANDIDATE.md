# Autumn seasonal palette — source-checked candidate

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

Authored near/far hue families do not prove the final lit transition matches;
native review remains required. Color does not repair torn card shapes or black
plate lighting, and this candidate is not yet accepted for release.
