// Round 47 (2026-09-23, owner map audit): the palette lane (r47a) re-authored the splat/sky blocks of the too-black
// maps and the sky lane (r47c) the horizon/sky blocks of the bland rings. Presentation authoring never feeds relief, so
// the byte receipt (badlandsRelief.selftest) authenticates each exact current block and projects it back to the text
// the historical digest was taken from. Generated from the round's own diff hunks; a later edit to one of these blocks
// must update its pair (the receipt fails loudly on a block it no longer finds exactly once).
import assert from 'node:assert/strict';

export const ROUND47_PRESENTATION_EDITS = {
 // round 49 (2026-09-23, lane r49a): Fjord's bare upper slopes are a vista knob, not relief
 "fjord.ts": [
  [
   "  horizon: {\n    baseHex: 0x42535a, amp: 1.34, style: 'alpine', treeline: 0.74, snowline: 0.78,\n    forestHex: 0x213b38, rockHex: 0x657077, haze: 0.9, grain: 0.58,\n    // round 49 (owner audit 2026-09-23, \"smooth green cone hill on the rim with a darker cap\"): the softened alpine domes\n    // never reached the vista's slope-keyed rock, so a hill was one green tint with the altitude-banded summit rock as\n    // its cap; above the treeline the turf now greys to heath with gneiss ribs, scree fans and a broken summit\n    // (horizon.ts bareRock) — the palette above is unchanged\n    bareRock: 1,\n  },\n",
   "  horizon: {\n    baseHex: 0x42535a, amp: 1.34, style: 'alpine', treeline: 0.74, snowline: 0.78,\n    forestHex: 0x213b38, rockHex: 0x657077, haze: 0.9, grain: 0.58,\n  },\n"
  ]
 ],
 "titanGorge.ts": [
   [
     "    // round 47 (2026-09-23, owner: \"ground patterns are too black\"): without this the sourced-texture resolver fell\n    // through to Verdant — photo grass/dirt and raw near-black Rock058 in place of the sandstone strata above\n    sourcedPalette: 'titan_gorge',\n    // round 47 (2026-09-23): tintB 0.71/0.54/0.45 (luma ×0.58 in the dark patches) → same ochre hue (18°), every\n    // channel ≥ 0.78 (luma ×0.83) — the patches stay darker than the shelves without going black\n    tintA: [1.10, 0.88, 0.69], tintB: [0.90, 0.82, 0.78], tintC: [1.06, 0.84, 0.67],\n",
     "    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],\n"
   ],
   [
     "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): authored strata for the orange sandstone\n    // walls (the style default 0.16 gave the canyon's own bedded rock the faintest beds of any mesa ring)\n    banding: 0.24,\n",
     ""
   ],
   [
     "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the haze a step cooler than the 0xffc89b sun\n    // (0xb88970 -> 0xb3a698: sun and haze sat in one ochre family and read as a single wash), broken altocumulus\n    // (0.68 / 0.30 -> 0.82 / 0.52) on an explicit 860 m deck that keeps its texture at 2-12°, and patchy light over\n    // the canyon (cloudShadowAmp 0.30)\n    fogTintHex: 0xb3a698, fogMix: 0.49, envIntensity: 0.18,\n    cloudOpacity: 0.82, cloudOpacity2: 0.52, cloudTintHex: 0xffe0c7,\n    cloudAltM: 860, cloudHazeK: 0.00013, cloudUvM: 2800, cloudShadowAmp: 0.30,\n",
     "    fogTintHex: 0xb88970, fogMix: 0.49, envIntensity: 0.18,\n    cloudOpacity: 0.68, cloudOpacity2: 0.30, cloudTintHex: 0xffe0c7,\n"
   ]
 ],
 "blackglass.ts": [
  [
   "    // round 47 (2026-09-23): the volcanic-glass district's own lifted sourced sets (sourcedTextures.ts TERRAIN_PLAN,\n    // the Caldera recipe in this map's cool register) — it used to fall through to Verdant's sets\n    sourcedPalette: 'blackglass',\n",
   ""
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): faint concrete-grey beds on the\n    // escarpment faces (the escarpment style authored none), boulder outcrops on the outland (treeline 0.24 fell in the\n    // rockfield's dead zone: neither forest impostors nor rocks) and more tone grain (0.50 -> 0.60)\n    banding: 0.10, outlandRocks: 0.45,\n    forestHex: 0x263431, rockHex: 0x53606a, haze: 1.0, grain: 0.60,\n",
   "    forestHex: 0x263431, rockHex: 0x53606a, haze: 1.0, grain: 0.50,\n"
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the overcast deck authored explicitly (it took\n    // the auto branch's 340 m / 0.00015 / 2400 m) — a 330 m deck of 2300 m masses with a thinner slant haze\n    // (0.00013) so the low sky between the arcologies keeps modeled cloud; diffuse light patchiness (cloudShadowAmp 0.12)\n",
   ""
  ],
  [
   "    cloudAltM: 330, cloudHazeK: 0.00013, cloudUvM: 2300, cloudShadowAmp: 0.12,\n",
   ""
  ]
 ],
 "caldera.ts": [
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): stacked lava-flow beds on the crater\n    // walls (banding 0.18 over the 0.16 default), a second skyline rank of the dark conifers and more tone grain on\n    // the flattest-reading ring of the mesa family (0.48 -> 0.60)\n    banding: 0.18, treelineLayers: 2,\n    forestHex: 0x292d27, rockHex: 0x4a4743, haze: 0.94, grain: 0.60,\n",
   "    forestHex: 0x292d27, rockHex: 0x4a4743, haze: 0.94, grain: 0.48,\n"
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the overcast deck authored explicitly (it took\n    // the auto branch's 340 m / 0.00015 / 2400 m) — a 360 m ash-laden deck of 2300 m masses with a slightly thinner\n    // slant haze so the broken bases keep texture over the crater rim; diffuse light patchiness (cloudShadowAmp 0.12)\n",
   ""
  ],
  [
   "    cloudAltM: 360, cloudHazeK: 0.00014, cloudUvM: 2300, cloudShadowAmp: 0.12,\n",
   ""
  ]
 ],
 "copperMesa.ts": [
  [
   "  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): banding 0.26 — the ore benches inside the square\n  // are the most strongly bedded cliffs in the game; the ring behind them ran on the style default 0.16\n  horizon: { baseHex: 0x8d6a50, amp: 1.5, style: 'mesa', treeline: 0.1, banding: 0.26, forestHex: 0x5c6141, rockHex: 0xa37a58, haze: 0.86, grain: 0.55 },\n  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the haze a step cooler than the 0xffe0b6 sun\n  // (0xaa9b89 -> 0xa8a49c), broken altocumulus (0.68 / 0.35 -> 0.80 / 0.50) on an explicit 880 m deck that keeps its\n  // texture at 2-12°, and patchy light across the benches (cloudShadowAmp 0.30)\n  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 5.6, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, fogDensity: 0.00050, fogTintHex: 0xa8a49c, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.80, cloudOpacity2: 0.50, cloudTintHex: 0xf2e6d6, cloudAltM: 880, cloudHazeK: 0.00012, cloudUvM: 2700, cloudShadowAmp: 0.30, sunIntensity: 4.1, sunColorHex: 0xffe0b6, hemiIntensity: 0.36 },\n",
   "  horizon: { baseHex: 0x8d6a50, amp: 1.5, style: 'mesa', treeline: 0.1, forestHex: 0x5c6141, rockHex: 0xa37a58, haze: 0.86, grain: 0.55 },\n  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 5.6, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, fogDensity: 0.00050, fogTintHex: 0xaa9b89, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.68, cloudOpacity2: 0.35, cloudTintHex: 0xf2e6d6, sunIntensity: 4.1, sunColorHex: 0xffe0b6, hemiIntensity: 0.36 },\n"
  ]
 ],
 "desert.ts": [
  [
   "    // round 47 (2026-09-23): envIntensity stays 0.16 — sky.ts clamps scene.environmentIntensity to\n    // ENV_INTENSITY_FLOOR (0.21), so any preset value below that (0.16, or the 0.19 the audit proposed) renders the\n    // same; a real environment lift here must exceed 0.21 and was not tested this round. Oasis inherits this value.\n    fogDensity: 0.00047, fogTintHex: 0xbdb5a8 /* round 47 (2026-09-23): a step cooler than the sun so haze and sand stop sharing one ochre (lane r47c) */, fogMix: 0.60, envIntensity: 0.16, // lighting_post r4: 0.22 -> 0.16 (sun/lee dune separation)\n    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): a textured high sky instead of a thin veil —\n    // broken altocumulus (0.35 -> 0.78) under a cirrus sheet (0.18 -> 0.48) on an explicit 900 m virtual deck with a\n    // slower slant haze (0.00012) and smaller 2600 m cells, so the deck keeps its cauliflower structure down to the\n    // 2-12° band the battle cameras see; patchier light on the sand (cloudShadowAmp 0.26 over the 0.22 auto). The\n    // Garage copy in game/garageSkyPresets.ts follows this block.\n    cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudTintHex: 0xfff2df,\n    cloudAltM: 900, cloudHazeK: 0.00012, cloudUvM: 2600, cloudShadowAmp: 0.26,\n",
   "    fogDensity: 0.00047, fogTintHex: 0xc7ac85, fogMix: 0.60, envIntensity: 0.16, // lighting_post r4: 0.22 -> 0.16 (sun/lee dune separation)\n    cloudOpacity: 0.35, cloudOpacity2: 0.18, cloudTintHex: 0xfff2df,\n"
  ],
  [
   "    // round 47 (2026-09-23, owner: \"the ground patterns are too black\"): hemi 0.20 -> 0.28 (effective 0.283 -> 0.397\n    // with the scaled bounce floor, lighting.ts hemiFloorFor). Measured on the wall-probe views: true shade rises\n    // (canyon-in darkest 1 % / 5 % of the ground +10.7 % / +8.1 %), lit sand +0.1..0.6 % (the sun stays 4.15 and\n    // postExposure 0.90, so nothing re-blows). It does NOT touch the dark contour bands on the sunlit dune faces\n    // (+2..4 %): those are the sand branch's own bands, not fill starvation — see docs/MAP-BEAUTIFICATION.md round 47.\n    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.28, // lighting_post r4: sun 3.30 -> 4.15, hemi 0.30 -> 0.20 (lee faces ~30% darker)\n",
   "    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.20, // lighting_post r4: sun 3.30 -> 4.15, hemi 0.30 -> 0.20 (lee faces ~30% darker)\n"
  ]
 ],
 "mars.ts": [
  [
   "    // round 47 (2026-09-23, owner: \"ground patterns are too black\"): strata midpoint 0.40 → 0.48 (desert 0.53) — this\n    // IS the rendered rock here (sourcedPalette 'badlands' keeps R procedural), so the mesa walls lift a step\n    rockTone: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.55), clamp01(0.48 + (l - 0.5) * 0.62)],\n",
   "    rockTone: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.55), clamp01(0.40 + (l - 0.5) * 0.62)],\n"
  ],
  [
   "    // round 47: tintB 0.82/0.66/0.56 → 0.86/0.74/0.66 (same 23° hue, luma ×0.70 → ×0.77) under the dim cold key\n    tintA: [1.06, 0.90, 0.76], tintB: [0.86, 0.74, 0.66], tintC: [1.08, 0.94, 0.82],\n",
   "    tintA: [1.06, 0.90, 0.76], tintB: [0.82, 0.66, 0.56], tintC: [1.08, 0.94, 0.82],\n"
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): thin dust decks over the galaxy. The decks are not\n    // dimmed with the dome, so they carry a dark rust tint and read as dust bands occluding the stars — a low 700 m\n    // veil of long 4200 m streaks and a thinner high sheet — and the haze they melt into is a shade more rust\n    // (0x3b2a33 -> 0x46302c: the dust band along the horizon); dust casts no shadow (cloudShadowAmp 0.05)\n    fogDensity: 0.00022, fogTintHex: 0x46302c, fogMix: 0.72, envIntensity: 0.34,\n    cloudOpacity: 0.3, cloudOpacity2: 0.15, cloudTintHex: 0x2c1c1e,\n    cloudAltM: 700, cloudHazeK: 0.0002, cloudUvM: 4200, cloudShadowAmp: 0.05,\n",
   "    fogDensity: 0.00022, fogTintHex: 0x3b2a33, fogMix: 0.72, envIntensity: 0.34,\n    cloudOpacity: 0, cloudOpacity2: 0, cloudTintHex: 0xffffff,\n"
  ]
 ],
 "oasis.ts": [
  [
   "  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): dune-ring tone grain 0.46 -> 0.62\n  horizon: { baseHex: 0xaa936b, amp: 0.90, style: 'rolling', ground: 'sand', treeline: 0.12, forestHex: 0x70704b, rockHex: 0xae9471, haze: 0.88, grain: 0.62 },\n  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): a textured high sky (0.5 / 0.22 -> 0.78 / 0.48 on\n  // an 820 m deck of 2900 m cells that the low 22° sun rakes), the dust haze a step cooler than the sun (0xb0a18a ->\n  // 0xb3ada3, saturation 0.21 -> 0.09 at the same lightness) and patchier light on the dunes (cloudShadowAmp 0.24)\n  sky: { ...desert.sky, sunElevationDeg: 22, sunAzimuthDeg: 104, turbidity: 5.2, fogDensity: 0.00052, fogTintHex: 0xb3ada3, fogMix: 0.46, cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudAltM: 820, cloudHazeK: 0.00012, cloudUvM: 2900, cloudShadowAmp: 0.24, sunIntensity: 4.0, hemiIntensity: 0.40 },\n",
   "  horizon: { baseHex: 0xaa936b, amp: 0.90, style: 'rolling', ground: 'sand', treeline: 0.12, forestHex: 0x70704b, rockHex: 0xae9471, haze: 0.88, grain: 0.46 },\n  sky: { ...desert.sky, sunElevationDeg: 22, sunAzimuthDeg: 104, turbidity: 5.2, fogDensity: 0.00052, fogTintHex: 0xb0a18a, fogMix: 0.46, cloudOpacity: 0.5, cloudOpacity2: 0.22, sunIntensity: 4.0, hemiIntensity: 0.40 },\n"
  ]
 ],
 "polders.ts": [
  [
   "  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): a second skyline rank of windbreak crowns on\n  // the very low ring, sparse stone heaps on the outland (treeline 0.30 fell in the rockfield's dead zone) and more\n  // tone grain (0.5 -> 0.60); the authored 0.18 amplitude is unchanged\n  horizon: { baseHex: 0x697a59, amp: 0.18, style: 'rolling', treeline: 0.30, treelineLayers: 2, outlandRocks: 0.40, forestHex: 0x3c5840, rockHex: 0x818577, haze: 0.94, grain: 0.60 },\n  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the broken deck (1.1 / 0.72) missed the low-stratus\n  // auto branch (0.95 / 0.90 and turbidity 7), so over the flattest ring in the game the 620 m deck was fully hazed\n  // at 2-12° — an explicit 420 m North Sea stratocumulus of 2600 m masses; light patchiness (cloudShadowAmp 0.18)\n  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, cloudAltM: 420, cloudHazeK: 0.00016, cloudUvM: 2600, cloudShadowAmp: 0.18, sunIntensity: 3.7, sunColorHex: 0xffe9ca, hemiIntensity: 0.43 },\n",
   "  horizon: { baseHex: 0x697a59, amp: 0.18, style: 'rolling', treeline: 0.30, forestHex: 0x3c5840, rockHex: 0x818577, haze: 0.94, grain: 0.5 },\n  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, sunIntensity: 3.7, sunColorHex: 0xffe9ca, hemiIntensity: 0.43 },\n"
  ]
 ],
 "ruinspires.ts": [
  [
   "    // round 47 (2026-09-23): the grey city's own sourced sets (sourcedTextures.ts TERRAIN_PLAN) — it used to fall\n    // through to Verdant's green grass, orange dirt and raw near-black rock\n    sourcedPalette: 'ruinspires',\n",
   ""
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): thin grey beds on the escarpment faces\n    // (the escarpment style authored none), boulder outcrops on the outland (treeline 0.18 fell in the rockfield's\n    // dead zone) and more tone grain on the flattest escarpment ring (0.42 -> 0.60)\n    banding: 0.12, outlandRocks: 0.50,\n    forestHex: 0x2f3937, rockHex: 0x5c5e5c, haze: 0.95, grain: 0.60,\n",
   "    forestHex: 0x2f3937, rockHex: 0x5c5e5c, haze: 0.95, grain: 0.42,\n"
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the near-overcast deck (1.08 / 0.82) missed the\n    // low-stratus auto branch (0.95 / 0.90), so its texture sat 6-7 km out in the 2-12° band — an explicit 360 m\n    // broken deck of 2400 m masses; diffuse light patchiness (cloudShadowAmp 0.12)\n",
   ""
  ],
  [
   "    cloudAltM: 360, cloudHazeK: 0.00014, cloudUvM: 2400, cloudShadowAmp: 0.12,\n",
   ""
  ]
 ],
 "skybridge.ts": [
  [
   "    // round 47 (2026-09-23, owner: \"ground patterns are too black\"): lightness FLOORS like every sibling canyon map\n    // (Titan 0.19/0.24, Redrock 0.19/0.24, Mars 0.20/0.24) — `l * 0.52` with no floor let the procedural fallback\n    // bottom out at black; hue and saturation unchanged. These tone hooks shape the procedural layers only; the\n    // rendered albedo is the sourced 'skybridge' row in sourcedTextures.ts.\n    grassTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.40), clamp01(0.21 + l * 0.62)],\n    dirtTone: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.42), clamp01(0.24 + l * 0.48)],\n",
   "    grassTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.40), clamp01(l * 0.52)],\n    dirtTone: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.42), clamp01(l * 0.48 + 0.04)],\n"
  ],
  [
   "    // round 47 (2026-09-23, owner: \"ground patterns are too black\"): without this the sourced-texture resolver fell\n    // through to Verdant — photo grass/dirt and raw near-black Rock058 in place of the sandstone strata above\n    sourcedPalette: 'skybridge',\n",
   ""
  ],
  [
   "    // round 47: tintB was the darkest macro darkener in the game (0.61/0.40/0.34, luma ×0.46 inside the dark-clover\n    // patches) — same red-orange hue (12°), every channel ≥ 0.75 (luma ×0.81), the desert register (0.84/0.78/0.67)\n    tintA: [1.02, 0.67, 0.49], tintB: [0.88, 0.78, 0.75], tintC: [1.00, 0.69, 0.49],\n",
   "    tintA: [1.02, 0.67, 0.49], tintB: [0.61, 0.40, 0.34], tintC: [1.00, 0.69, 0.49],\n"
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): authored strata for the beige-brown\n    // chasm walls (the style default 0.16 left the abutment cliffs nearly unbedded)\n    banding: 0.20,\n",
   ""
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the haze a step cooler than the 0xffc19a sun\n    // (0xa08475 -> 0x9d9188); the near-overcast deck (1.04 / 0.78) missed the low-stratus auto branch (it needs\n    // 0.95 / 0.90), so the 620 m fair-weather deck stood 6-7 km out and fully hazed in the 2-12° band — an explicit\n    // 380 m broken deck of 2500 m masses keeps texture there; diffuse light patchiness (cloudShadowAmp 0.14)\n    fogTintHex: 0x9d9188, fogMix: 0.55, envIntensity: 0.18,\n",
   "    fogTintHex: 0xa08475, fogMix: 0.55, envIntensity: 0.18,\n"
  ],
  [
   "    cloudAltM: 380, cloudHazeK: 0.00015, cloudUvM: 2500, cloudShadowAmp: 0.14,\n",
   ""
  ]
 ],
 "titanGorge.ts": [
  // round 49 (2026-09-23, lane r49a): the ring rock band is presentation only. NOTE: this object carries two
  // "titanGorge.ts" keys (both round-47 lanes added one); JavaScript keeps the LAST, so round-49 pairs live here.
  [
   "    // round 49 (owner audit 2026-09-23, \"smooth beige ridge faces without strata\"): the ring's 35–47° faces past the edge\n    // become the bedded landform rock (default band 0.22–0.48 left them the wall-projected sand set)\n    ringRockSlope: [0.15, 0.36],\n",
   ""
  ],
  [
   "    // round 47 (2026-09-23, owner: \"ground patterns are too black\"): without this the sourced-texture resolver fell\n    // through to Verdant — photo grass/dirt and raw near-black Rock058 in place of the sandstone strata above\n    sourcedPalette: 'titan_gorge',\n    // round 47 (2026-09-23): tintB 0.71/0.54/0.45 (luma ×0.58 in the dark patches) → same ochre hue (18°), every\n    // channel ≥ 0.78 (luma ×0.83) — the patches stay darker than the shelves without going black\n    tintA: [1.10, 0.88, 0.69], tintB: [0.90, 0.82, 0.78], tintC: [1.06, 0.84, 0.67],\n",
   "    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],\n"
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): authored strata for the orange sandstone\n    // walls (the style default 0.16 gave the canyon's own bedded rock the faintest beds of any mesa ring)\n    banding: 0.24,\n",
   ""
  ],
  [
   "    // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the haze a step cooler than the 0xffc89b sun\n    // (0xb88970 -> 0xb3a698: sun and haze sat in one ochre family and read as a single wash), broken altocumulus\n    // (0.68 / 0.30 -> 0.82 / 0.52) on an explicit 860 m deck that keeps its texture at 2-12°, and patchy light over\n    // the canyon (cloudShadowAmp 0.30)\n    fogTintHex: 0xb3a698, fogMix: 0.49, envIntensity: 0.18,\n    cloudOpacity: 0.82, cloudOpacity2: 0.52, cloudTintHex: 0xffe0c7,\n    cloudAltM: 860, cloudHazeK: 0.00013, cloudUvM: 2800, cloudShadowAmp: 0.30,\n",
   "    fogTintHex: 0xb88970, fogMix: 0.49, envIntensity: 0.18,\n    cloudOpacity: 0.68, cloudOpacity2: 0.30, cloudTintHex: 0xffe0c7,\n"
  ]
 ],
 "whiteout.ts": [
  [
   "  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the flattest ring's tone grain 0.35 -> 0.60\n  // round 49 (owner 2026-09-23, skyline acceptance 0.80–0.90 while the battlefield stays white): in the sky-w / sky-s\n  // views the skyline IS this ring, and its snow met the capped sky at 1.01 (round 44/48: no sky, haze or aerial change\n  // moved it). Ring side only — wind-scoured crests: bare gneiss ribs (bareRock, rockHex 0x9da9b4 -> 0x5b6772: the pale\n  // rock read as more snow), a distant range's snow under overcast a step below the sky (snowHex 0xcfd8e2), and less\n  // material haze (0.92 -> 0.74) so the ring keeps its own tone against the horizon. Winter is untouched.\n  horizon: { baseHex: 0xa3b1be, amp: 0.72, style: 'rolling', treeline: 0.08, snowline: 0.08, forestHex: 0x536371, rockHex: 0x5b6772, snowHex: 0xcfd8e2, bareRock: 1, haze: 0.74, grain: 0.60 },\n  // round 47 (owner 2026-09-23, \"the skybox and mountains are too bland\"): the polar deck authored explicitly instead of\n  // inheriting Frosthollow's (320 m / 0.00013 / 2200 m) — a lower 300 m stratus of smaller 2000 m masses that keeps\n  // its texture at the 13° sun's grazing elevations; diffuse light patchiness (cloudShadowAmp 0.08)\n  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, cloudAltM: 300, cloudHazeK: 0.00012, cloudUvM: 2000, cloudShadowAmp: 0.08, sunIntensity: 2.75, hemiIntensity: 0.58 },\n",
   "  horizon: { baseHex: 0xa3b1be, amp: 0.72, style: 'rolling', treeline: 0.08, snowline: 0.08, forestHex: 0x536371, rockHex: 0x9da9b4, haze: 0.92, grain: 0.35 },\n  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, sunIntensity: 2.75, hemiIntensity: 0.58 },\n"
  ]
 ]
};

export function historicalRound47PresentationSource(source, file) {
  const pairs = ROUND47_PRESENTATION_EDITS[file];
  if (!pairs) return source;
  for (const [current, historical] of pairs) {
    assert.equal(source.split(current).length, 2, `${file}: one exact round-47 presentation block`);
    source = source.replace(current, historical);
  }
  return source;
}
