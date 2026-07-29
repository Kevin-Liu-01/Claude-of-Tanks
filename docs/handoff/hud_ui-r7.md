# hud_ui r7-2 handoff — sniper magnified-image quality (non-owned files)

Critic (r7, sniper_view 6.8): "the 8x image magnifies flat lime canopy blobs
and chalky hillside smear … force highest terrain/foliage LOD and max
anisotropy when FOV drops below sniper threshold so magnified surfaces are
not smeared."

The HUD side (owned, done in src/ui/hud.js this round): elliptical ~25%
edge-luminance vignette + chromatic fringe + 3px edge defocus, fine-segment
dispersion ring, smaller camera cross. What remains is the SCENE side — the
magnified surfaces themselves. Three targeted changes, all outside src/ui/:

## 1. src/world/terrain.js — max anisotropy on the splat detail layers
`canvasToTexture(px, s, { anisotropy = 4 })` (~line 500) caps every ground
detail layer at anisotropy 4. At x8 (FOV 6.9°) the ground is viewed at
extreme grazing angles and minification smears it into the "chalky
hillside" wash. Change the default to 16 (or plumb
`renderer.capabilities.getMaxAnisotropy()` through the engineCtx already
passed into buildTerrain) for the grass/dirt/rock/snow **detail** layers:

```js
function canvasToTexture(px, s, { srgb = false, anisotropy = 16, repeat = true } = {}) {
```

(≈10 textures; VRAM cost none, bandwidth cost negligible on modern GPUs —
worst case make it 8.)

## 2. src/world/vegetation.js — same lift for canopy/bark albedos
Lines ~92/118/186/2101 create foliage albedos with `anisotropy = 4` (grass
clumps `2`). Raise tree canopy + bark to 8; the x8 corridor look is gated
by these textures once the impostor→mesh promotion (already zoom-scaled via
`setSniperFade`, line ~3078) swaps the real trees in.

## 3. src/world/vegetation.js — widen the scoped mesh-promotion corridor
`scopeZoomR = Math.min(640, TREE_NEAR_IN * clamp(24 / fovDeg, 1, 2.5))`
(~line 3078). At x8 (fov 6.9°) the clamp saturates at 2.5 so mid-frame
trees at 300 m (the flagship sniper_view framing) can still be impostor
cards — the "flat lime canopy blobs" around the Tiger. Raise the cap so
the whole staged engagement band is real geometry while scoped:

```js
scopeZoomR = (sniperFadeTarget >= 0.5 && fovDeg != null && fovDeg <= 15)
  ? Math.min(720, TREE_NEAR_IN * clamp(30 / fovDeg, 1, 3.4)) : 0;
```

(Scoped-only: arcade/establishing budgets untouched. The promotion radius
applies inside the aim corridor only, so triangle cost stays bounded.)

## 4. (optional polish) src/engine/post.js — uDetailW headroom at x8
`aerial.uniforms.uDetailW` ramp (~line 1194): if the hillside still reads
soft after 1-3, allow the sniper far-field detail weight to reach its full
value by zoom 6 instead of easing in to 8 — the chalky band in
sniper_view.png sits exactly in the AERIAL_DETAIL_NEAR..FAR window.

Verify with `node tools/screenshot.mjs` → shots/sniper_view.png: canopy
around the Tiger should show leaf-card structure (not flat lime fills) and
the hillside behind it should keep rock/scrub grain at x8.
