# effects_combat r3 handoff — changes needed outside owned files

(Supersedes the previous r2 content of this file — that round's verifier
already ran; its item 3 resolved as "camera stays as-is, change nothing".)

All critical/major items of the r3 critique were fixed inside the owned files
(`src/fx/effects.js`, `src/fx/particles.js`, `src/vehicles/tankFactory.js`,
`src/engine/cameraRig.js`). Two minor flyby items need other modules:

## 1. Veil HUD + letterbox during the battle-start flyby (src/main.js) — REQUIRED

Critique (minor): "the full battle HUD (rosters, minimap, consumables) stays
on screen through the cinematic instead of a clean letterboxed pass."

`cameraRig.js` now exposes **`rig.cinematicActive`** (true while the 3 s
battle-open flyby drives the camera). main.js already owns the kill-cam
letterbox veil (`veilHud(on)`, ~line 291). Wire the flyby to the same veil in
the render loop:

```js
// module scope, near `let endShown`:
let flybyVeiled = false;

// in the render loop, before step 7 (HUD):
const flybyActive = inBattle && !game.result && rig.cinematicActive;
if (flybyActive !== flybyVeiled) { veilHud(flybyActive); flybyVeiled = flybyActive; }
```

and add `&& !flybyActive` to the step-7 HUD gate:

```js
if (inBattle && game.player && !kcActive && !killcam.isActive() && !flybyActive) {
```

The flyby is skippable by any camera input, so the veil must be driven by the
live `rig.cinematicActive` value each frame (as above), not by a timer.
`veilHud` already provides the letterbox bars for the kill-cam, so the same
call gives the flyby the letterboxed look for free.

## 2. Grass/terrain specular blowout at grazing sun angles (src/world/) — REQUIRED

Critique (minor): "the entire sun-facing midground is a carpet of blown-out
white grass specular sparkles during the opening sweep — reads as glitter or
snow" (flyby frames 00-05; camera low, looking near the sun azimuth).

Likely culprit: the terrain detail-pass roughness floor in
`src/world/terrain.js` (~line 766):

```js
px[j + 3] = clamp(rough * roughMul, 0.03, 1) * 255; // roughness packed in albedo alpha
```

A 0.03 roughness floor is mirror-glossy — at grazing view·sun geometry the
GGX lobe blows the whole midground to white. Raise the floor to ~0.45:

```js
px[j + 3] = clamp(rough * roughMul, 0.45, 1) * 255;
```

Also check the grass-blade material in `src/world/vegetation.js` (~line 826):
it already has `roughness: 1.0` and `envMapIntensity = 0.35`; if sparkle
persists after the terrain floor fix, drop blade `envMapIntensity` to 0.15.

Verify with `node tools/screenshot.mjs` (battlefield views must not lose
their sun-side sheen entirely — the fix targets the white CLIP, not all
specular) plus a flyby motion capture if available.
