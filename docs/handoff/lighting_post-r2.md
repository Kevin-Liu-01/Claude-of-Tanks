# lighting_post r5 — required changes OUTSIDE src/engine/

(Supersedes the previous r2 content of this file; all four of its items were
verified applied — turret roof, foliage cards, closeup azimuth, flash core.)

Engine-side r5 work (done in src/engine/, verified via harness + PNG review):

- **Atmosphere rework (critical fix)**: `applyFog` now splits a map preset's
  `fogDensity` between FogExp2 extinction (x0.55) and the post-chain aerial
  pass, so saturation survives to ~800 m on every map. The aerial pass's
  scatter-in is now DIRECTIONAL: per-pixel view rays blend toward a warm haze
  near the sun azimuth and a cool blue away from it (post.js reads
  `scene.userData.sunDirWorld`, published by sky.js). Desat 0.65 → 0.42,
  haze density 0.0009 → 0.00058. Horizon band in the sky shader is now
  clearly blue (tint [0.78,0.90,1.10] @ 0.58, lum ceiling 0.64), and the fog
  color sampled from it follows. Mie response multiplier 1.5 → 1.1 (the gray
  wedge that swallowed 2/3 of the sky in sun-facing frames is gone).
- **Clouds**: fade distances 1400/3100 → 2400/3850 m (deck now visible down
  to ~15 deg elevation from EVERY camera — sky no longer inconsistent between
  shots), deeper sun-shading (K 0.46, darker shade pole), per-cloud opacity
  variation keyed on the macro clustering noise.
- **Shadows**: PCF radii [2.2,3.0,3.6,4.2] → [1.3,1.7,2.1,2.5] and cascade 2
  bumped 2048 → 4096 on ultra/high — pole/tree shadows are tight stripes with
  penumbra proportional to occluder size; tank shadow has a crisp contact core.
- **Bloom**: threshold 1.42 → 1.55, strength 0.34 → 0.20, radius 0.4 → 0.28 —
  muzzle flash keeps its internal core/spike structure instead of merging
  into gaussian blobs.
- **Grade**: contrast 1.18 → 1.26, black anchor 0.010 → 0.016, plus a
  green-dominant-pixel warm shift ([1.05,1.0,0.90]) that unifies terrain
  greens with the warm key. GTAO scale 2.2 → 2.6 for readable contact AO.

The following remain and belong to other modules — please apply:

## 1. src/fx/effects.js — muzzle flash ground sheet + cast light
The engine bloom retune (threshold 1.55) already keeps the flash core
structured, and the frozen `combat_firing` frame now shows warm light on the
fence/ground. Two things left:
- The additive ground-interaction dust stack (section 8, "muzzle-blast ground
  interaction" + the big propellant donut) still stacks to a LARGE flat
  near-white sheet at the lower-left of `combat_firing`. Cap the stacked HDR
  of those dust/fire sprites (lower per-sprite alpha or colors toward
  0xffd9a0 * <=1.2) so ground dust reads as LIT DUST, not as an emissive
  sheet; keep true emissives (core, spikes) at HDR 1.6-2.0 so they still
  bloom past the 1.55 threshold (input clamp is 2.0).
- Raise `MUZZLE_LIGHT_PEAK` 950 → ~1400 and the muzzle PointLight range
  15 → 22 so the orange kick visibly grades across the hull side and ground
  in the composed frame (critique: "casts no light on the hull").

## 2. src/world/terrain.js — grass specular sparkles (minor but flagged)
Bright white pixel glints on open grass (bottom-left of `battlefield`, right
of `player_view`) read as broken wet-spec. Raise the terrain material's
roughness floor on grass splat regions (>= ~0.85) and/or clamp its specular
F0 / envMapIntensity there; keep stronger spec only on explicit puddle/rock
splat areas.

## 3. src/world/maps/horizon.js — coordinate with the horizon-ring rebuild
The new ridge geometry + slope banding is a big step. With the engine's fog
now half as thick, the baked-in haze washes the UPPER ridge faces near-white
in `battlefield`/`player_view` (tops read as bare clay domes while the cliff
bands below carry all the detail). Suggest: cut the vertex-color haze lerp
(`aer` / `haze` factors) by ~40% — the engine's aerial pass + FogExp2 now add
real, sun-directional haze on top — and extend the slope/rock noise to the
dome tops (treeline speckle or scree noise above the cliff bands) so no face
is a flat untextured field. Base hue: keep it in the olive/slate family; the
engine will blue-shift it with distance automatically.

## 4. src/world/maps/verdant.js — optional sky preset polish
`turbidity: 4 → 3, rayleigh: 1.2 → 1.35` gives the summer map a bluer, less
milky sky dome (the engine's horizon-band changes already do most of this;
apply only if the sky still reads gray-cyan after a rebake).

## Do NOT
- Do not re-raise map `fogDensity` values to compensate for the clearer far
  field — the engine intentionally halves the extinction share; doubling the
  preset value would put the gray wash back AND over-haze the aerial pass.
- Do not lower the bloom threshold below ~1.5 or raise strength above ~0.25
  "to make the flash bigger" — that recreates the structureless blob. Make
  the flash brighter via sprite HDR values in the 1.6-2.0 window instead.
- Do not re-widen the CSM PCF radii; if a specific shadow looks too hard,
  widen only that cascade by <=0.4 texel and re-check the pole shadows in
  `player_view`.
