# lighting_post r2 — required changes OUTSIDE src/engine/

Engine-side r2 work (done in src/engine/): sun moved to a side key
(azimuth 115°, was 140° = directly behind the standard cameras), sun 4.2 /
hemi 0.20 / IBL 0.28 (measured ~2:1 lit:shadow ground contrast, was ~1.3:1),
4096px CSM cascades, ACES exposure 1.05, stronger grade (contrast 1.11,
sat 1.15, black anchor), GTAO now skips `userData.aoExclude` objects (fixes
grey AO rectangles over grass in sniper zoom), coverage-preserving mipmaps are
auto-built for ANY alphaTest+map material registered through
`engineCtx.setupShadowMaterial` (fixes solid-rectangle grass/leaf cards at
distance), procedural cumulus layer + sun-halo knee in sky.js.

The following remain and belong to other modules — please apply:

## 1. src/vehicles/tankFactory.js — M1A2 turret roof is a pure black rectangle
In `player_view` the Abrams turret roof (dead center of the default gameplay
camera) renders as an unlit black quad under the same sun that lights the
rest of the hull. Looks like a panel whose material is near-black/unlit or
whose normals face down. Fix: give the roof panel the hull PBR material
(registered via `engineCtx.setupShadowMaterial`) and recompute its normals so
it shades like the surrounding armor.

## 2. src/world/vegetation.js — glitch foliage cards
- Several broadleaf trees show one or two LARGE PURE-BLACK diamond cards in
  the canopy (visible dead-center in `battlefield`, also in `sniper_view`).
  Looks like cards with zeroed vertex color or normals that never get sun or
  hemi response.
- Distant tree impostors pop as LIGHT-BLUE rectangles at the horizon
  (`tank_closeup_modern`, right edge of `combat_firing`). If impostors use
  alpha-blended sprites, switch them to `alphaTest` materials registered
  through `engineCtx.setupShadowMaterial(mat)` — the engine now auto-builds
  coverage-preserving mipmaps for any alphaTest material with a map, which
  kills both box artifacts and mip fade-out.
- Keep `userData.aoExclude = true` on all grass/foliage card meshes (the GTAO
  pass now honors it).
- Backlit conifer canopies read near-black at 8x sniper zoom. Foliage vertex
  `shade` floor could come up a touch (e.g. 0.45 → 0.55) now that the global
  fill is lower; the engine fill cannot be raised further without washing out
  ground shadows again.

## 3. src/main.js — tank_closeup_modern faces the shaded flank
`SHOT_VIEWS.tank_closeup_modern` uses `orbitPose(m1a2, 9, 35, 12, 50)`. With
the sun now at world azimuth 115° that orbit lands the camera on the tank's
backlit side: the whole camera-facing flank is in its own shadow and reads as
a black mass. `tank_closeup_ww2` (same +35°, different spawn yaw) happens to
land sunlit and looks great. Fix: change the modern closeup's azimuth offset
so the camera sits on the sunlit (ESE) side of the hull — flipping the sign
(`-35`) or sweeping ±90° while eyeballing `shots/tank_closeup_modern.png` is
enough; keep distance/elevation/fov.

## 4. src/fx/effects.js — muzzle flash sprite shape (minor)
The r2 muzzle light pool + clamped bloom already ground the flash; what's
left is that the flash itself is still two identical 4-point star sprites.
A layered core disc (8-12px HDR ~3.0) + short-lived cone/petal quad along the
barrel axis (~80 ms) would finish the "modern tank gun" read. Keep peak HDR
values ≤ ~4 so the bloom clamp (2.0) keeps it from flooding.

## Do NOT
- Re-lower `SHADOW_MAP_SIZE` / cascade count in lighting.js "for perf" — the
  4096 cascades are what make building/tree shadows resolve at 300 m+.
- Re-raise ENV_INTENSITY / HEMI_INTENSITY above the current values without
  re-measuring shadow contrast (see comments in lighting.js/sky.js); the r2
  critique's "floating, pasted-on village" was caused by fill burying the key.
