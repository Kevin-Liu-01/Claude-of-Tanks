# content_breadth — round 2 handoff (patches for non-owned files)

All owned-file work has landed directly:
- `src/world/maps/horizon.js` (NEW) — per-map horizon ring: distinct silhouettes
  (rolling / alpine / mesa / escarpment), slope rock + snowline + treeline +
  strata via an altitude-mapped detail texture, DoubleSide (kills the pale
  "sea sheet" backface hole), stronger aerial haze.
- `src/world/maps/urbanKit.js` (NEW) — church (spire) + factory (chimney)
  landmark builders following the props.js builder contract.
- `src/world/maps/{verdant,desert,winter,urban}.js` — per-map horizon configs,
  desert strata 0.22, winter frost tufts / snowy rock tone / bigger hamlet /
  pine scrub bushes, urban PLAN (church+factory+1-in-5 ruins), slate/clay
  patchwork roof tone, `ruinChance: 0.30`.
- `src/ui/techtree.js` — full tier I–X continuity for all three nations
  (T1 Cunningham, M3 Stuart, Leichttraktor, Pz 38(t), VK 36.01(H),
  Jagdpanzer IV, MS-1, T-28), tier headers only over the occupied range, and
  a per-vehicle parametric ghost-silhouette painter (GHOSTS table) replacing
  the generic hull template.
- `public/fonts/switzer/SwitzerCondensed-{Regular,Medium,Semibold,Bold,Extrabold}.woff2`
  (NEW) — genuinely condensed companion faces derived from the self-hosted
  Switzer CFF outlines (0.86x horizontal transform, advances/kerning scaled,
  usWidthClass 3). ITF/Fontshare Free Font License permits modification.

The patches below were **temp-applied, verified via `node tools/screenshot.mjs`
(battlefield / battlefield_desert / battlefield_winter / battlefield_urban /
techtree) plus a puppeteer computed-font audit, then reverted**. Apply them
verbatim — every block is exact old→new text.

---

## 1. src/world/terrain.js — use the per-map horizon module

**1a. Add the import** (top of file, after the existing imports):

```js
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { applySourcedTerrain } from './sourcedTextures.js';
import { buildHorizonRing } from './maps/horizon.js';
```

**1b. Delete the whole legacy builder** — remove everything from the comment
banner

```
// ---------------------------------------------------------------------------
// Horizon mountain ring — low-poly ridgelines outside the playable rim,
```

down to (and including) the closing `}` of `function buildHorizonRing(...)`,
i.e. the block that ends with

```js
  mesh.userData.aoExclude = true;
  return mesh;
}
```

immediately before the `/** * Build the chunked-LOD terrain mesh group` JSDoc.
The call site `group.add(buildHorizonRing(engineCtx, cfg, 1337));` in
`buildTerrainMeshes` stays unchanged and now resolves to the import.

**1c. Far-cliff detail rescue** in `SPLAT_COMMON_FRAG` — replace:

```glsl
  // horizontal strata banding on steep faces (mesa cliff walls), world-Y driven
  if (uStrata > 0.001) {
    float steep = smoothstep(0.28, 0.52, slope);
    float band = sin(wp.y * 1.9 + n1 * 2.4) * 0.6 + sin(wp.y * 0.57 + n2 * 1.9) * 0.4;
    a.rgb *= 1.0 + band * uStrata * steep;
    a.rgb = mix(a.rgb, a.rgb * vec3(1.05, 0.90, 0.78), steep * 0.35); // baked iron-oxide faces
  }
```

with:

```glsl
  // horizontal strata banding on steep faces (mesa cliff walls), world-Y driven
  if (uStrata > 0.001) {
    float steep = smoothstep(0.28, 0.52, slope);
    float band = sin(wp.y * 1.9 + n1 * 2.4) * 0.6 + sin(wp.y * 0.57 + n2 * 1.9) * 0.4;
    a.rgb *= 1.0 + band * uStrata * steep;
    a.rgb = mix(a.rgb, a.rgb * vec3(1.05, 0.90, 0.78), steep * 0.35); // baked iron-oxide faces
  }
  // far-cliff detail rescue: the mip-biased macro fade flattens steep rock
  // faces past ~300 m into featureless sheets — re-project the rock layer at
  // a coarse world scale + its normals so distant mesa/cut walls stay craggy
  {
    float farRock = fR * farM;
    if (farRock > 0.003) {
      vec4 rr = texture2D(uAlbR, uv * 0.031);
      a.rgb = mix(a.rgb, a.rgb * (0.74 + rr.rgb * 0.48), farRock * 0.55);
      vec3 rn = texture2D(uNrmR, uv * 0.019).xyz * 2.0 - 1.0;
      n.xy += rn.xy * farRock * 0.9;
    }
  }
```

(If the shader material caches by `customProgramCacheKey`, bump
`'world-terrain-splat-v6'` → `'-v7'`.)

---

## 2. src/ui/fonts.js — hermetic condensed HUD face

**2a.** Replace the `FONT_COND` export with:

```js
export const FONT_COND = "'Switzer Condensed','Arial Narrow','Avenir Next Condensed','Helvetica Neue Condensed','Roboto Condensed','Liberation Sans Narrow',Arial,sans-serif";
```

**2b.** In `FONT_CSS`, replace the map callback template with (adds a second
@font-face per weight):

```js
const FONT_CSS = WEIGHTS.map(([file, w]) => `@font-face{
  font-family:'Switzer';
  src:url('/fonts/switzer/Switzer-${file}.woff2') format('woff2');
  font-weight:${w};font-style:normal;font-display:swap;}
@font-face{
  font-family:'Switzer Condensed';
  src:url('/fonts/switzer/SwitzerCondensed-${file}.woff2') format('woff2');
  font-weight:${w};font-style:normal;font-display:swap;}`).join('\n') + `
```

**2c.** In `ensureFonts()`, pre-warm the condensed weights too:

```js
    for (const [, w] of WEIGHTS) {
      document.fonts.load(`${w} 16px Switzer`).catch(() => {});
      document.fonts.load(`${w} 16px 'Switzer Condensed'`).catch(() => {});
    }
```

Verified result (puppeteer, document.fonts.check on every visible text
element): player_view/sniper_view = 42x 'Switzer Condensed' + 12x 'Switzer',
garage/techtree = 100% 'Switzer'. Zero OS-font resolution anywhere.

---

## 3. src/world/props.js — urban kit registration, ruin rate, framed windows

**3a.** After `import * as THREE from 'three';` add:

```js
import { URBAN_BUILDERS } from './maps/urbanKit.js';
```

**3b.** Replace the builder registry:

```js
  const BUILDER_BY_NAME = {
    cottage: makeCottage, barn: makeBarn, tower: makeTower, ruin: makeRuin,
    adobe: makeAdobe, rowhouse: makeRowhouse,
    ...URBAN_BUILDERS, // church / factory landmarks (maps/urbanKit.js)
  };
```

**3c.** In the streetRows loop, after
`const rot = Math.atan2(-nx, -nz); // local +z (door face) toward street` add:

```js
          const ruinChance = P.ruinChance ?? 0.24;
```

and change `const ruined = roll < 0.24; // shell-collapsed slot in the row`
to `const ruined = roll < ruinChance; // shell-collapsed slot in the row`.

**3d.** In `makeRowhouse`, replace the long-side window loop body:

```js
      for (const side of [-1, 1]) {
        if (rng() < 0.12) continue;
        parts.dark.push(box(0.06, 1.25, 0.82).translate(side * (w / 2 + 0.05), wy, zz));
        parts.wood.push(box(0.10, 0.09, 0.95).translate(side * (w / 2 + 0.06), wy - 0.72, zz));
      }
```

with:

```js
      for (const side of [-1, 1]) {
        if (rng() < 0.12) continue;
        // framed windows with a faked reveal: the pane sits barely proud of
        // the wall while jambs/lintel stand ~5 cm prouder and a stone sill
        // closes the bottom — the glass reads recessed, not painted on
        const wx = side * (w / 2);
        parts.dark.push(box(0.05, 1.25, 0.82).translate(wx + side * 0.012, wy, zz));
        parts.wood.push(box(0.09, 1.36, 0.09).translate(wx + side * 0.045, wy, zz - 0.44));
        parts.wood.push(box(0.09, 1.36, 0.09).translate(wx + side * 0.045, wy, zz + 0.44));
        parts.wood.push(box(0.09, 0.09, 0.97).translate(wx + side * 0.045, wy + 0.66, zz));
        parts.stone.push(box(0.14, 0.10, 1.0).translate(wx + side * 0.05, wy - 0.70, zz));
      }
```

---

## 4. src/world/sourcedTextures.js — per-map fixes for sourced sets

**4a.** In `TERRAIN_PLAN.winter` replace `R: 'rock', M: null,` with:

```js
    // snow-dusted rock: raw Rock058 is near-black here and punched dark
    // holes into the snowfield wherever a lake bank / cut slope got steep
    R: { set: 'rock', tint: [1.52, 1.55, 1.62], roughMul: 1.1 }, M: null,
```

**4b.** In `applySourcedBuildings`, after
`if (mapId === 'urban' && sets.stone) plan.stone = 'brick';` add:

```js
  // urban keeps the PROCEDURAL roof sheet: its tone hook bakes a slate/clay
  // patchwork (cfg.props.tones.roof) that the single-tint sourced set cannot
  // reproduce — the uniform maroon roofscape was a top critic complaint
  if (mapId === 'urban') delete plan.roof;
```

---

## 5. docs/ATTRIBUTION.md — new font files

Append to the Switzer row (or add a row below it):

> Switzer Condensed (`public/fonts/switzer/SwitzerCondensed-{Regular,Medium,
> Semibold,Bold,Extrabold}.woff2`) — derivative faces generated locally from
> the hosted Switzer woff2s (glyph outlines and advances condensed to 86%
> width via fontTools; family renamed to avoid collision). Same license and
> license file as Switzer: Fontshare Free Font License (ITF FF EULA),
> `public/fonts/switzer/LICENSE-FFL.txt`. No new third-party assets.

---

## 6. Minor (model-owner follow-ups, from critic round 1)

- **Tiger I angle icon proportions** (`src/vehicles/tankFactory.js`,
  `buildTiger` ~line 757): the horseshoe turret (~2.5 m plan) still reads
  undersized against the 3.71 m-wide superstructure in the 3/4 icon — scale
  the horseshoe profile ~+8% in plan and raise TH ~4%, and reduce the camo
  blotch scale used for `tiger1` so the pattern stops reading toylike; then
  `node tools/genIcons.mjs --tanks tiger1` (regenerated icons land in
  public/icons/, owned by content_breadth).

## Verification notes

- Each map's establishing shot re-captured after the patches: four DISTINCT
  skylines (rolling forested / stepped sandstone tablelands / jagged snow-
  capped alpine / long hazy escarpment); the desert's pale "sea sheet" gap is
  gone (DoubleSide + taller ground-toned skirt rows); winter lake bank reads
  snow-dusted rock, tufts frosted, hamlet ~60% larger; urban shows church
  spire + factory chimney landmarks, 1-in-5 street ruins with rubble spill,
  slate/clay patchwork roofs, framed windows.
- Harness exits 0 with the patches applied (transient failures observed
  during the round were vite full-reloads / mid-save states from concurrent
  sessions, not these changes).
