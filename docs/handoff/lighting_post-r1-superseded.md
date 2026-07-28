# lighting_post → round verifier handoff (r1)

Engine-side fixes (clouds, horizon haze, aerial perspective pass, GTAO, grade
unification, ambient rebalance) are done in `src/engine/`. The following
critique items are rooted in modules lighting_post does NOT own. Please apply
(or route to the owning specialist):

## 1. Foliage albedo incoherence — `src/world/vegetation.js` (MAJOR)

Critique: "hero trees are neon saturated green while background trees at the
same distance are muted olive/teal — breaks aerial perspective."

Root cause: near-LOD foliage cards get `vertexColor = HSL(h≈0.255, s≈0.34-0.44,
l=0.5) * 1.7 * shade` (in `foliageCard()`, the `* 1.7` line), while far-LOD
canopies use `paintCanopy(..., l0≈0.15, l1≈0.27)` — the near cards are ~2x the
luminance and far more saturated than the far lobes for the same species.

Fix (keeps engine-side distance desaturation meaningful):
- In `foliageCard()` change the multiplier `1.7` to `~1.25` and clamp card
  saturation to the far-LOD family: hue 0.25-0.28, sat 0.26-0.34 (olive), i.e.
  drop the `0.34 + rng() * 0.1` sat args in `buildBroadleafCards` /
  `buildPineCards` to `0.26 + rng() * 0.06`.
- Do NOT re-add per-asset distance tinting — distance desaturation/cooling is
  now handled uniformly by the aerial-perspective pass in `src/engine/post.js`
  plus fog; per-asset tints are what caused the mismatch.
- Same check for any bush/shrub builders that pass sat > ~0.35.

## 2. Muzzle-flash ground splash — `src/fx/effects.js` (MAJOR)

Critique: "flat, uniformly saturated yellow splash with an abrupt edge — reads
as a sticker decal."

It IS already a PointLight (`muzzleLight = new THREE.PointLight(0xffb45a, …,
24, 2)`, `MUZZLE_LIGHT_PEAK = 520`). The sticker read comes from the color
saturation: 0xffb45a stays saturated through ACES at every falloff radius, so
the whole splash is one hue.

Fix:
- Change the light color to a much less saturated warm white, e.g. `0xffd9b0`
  (or even 0xffe6c8), and raise `MUZZLE_LIGHT_PEAK` ~30% (520 → ~680). The hot
  core then desaturates toward white through the tonemapper (inverse-square is
  already there via decay 2) while the falloff rim stays warm — a real light
  gradient instead of a uniform yellow wash.
- Optional polish: 2-3 frame flipbook on the flash star sprite so it doesn't
  read as a static asterisk (critique explicitly asks for this).

## 3. Blob/contact shadows under tanks and buildings (MAJOR, part 2 of the AO fix)

GTAO has been strengthened in `src/engine/post.js` (radius 1.3, scale 1.7) and
grounds objects at close/mid range, but at establishing-shot distance (300 m+)
screen-space AO is sub-pixel — the critic's suggested "cheap radial-gradient
dark decal under each object" is the right complement:

- `src/world/props.js` (buildings/fences) and `src/vehicles/tankFactory.js`
  (hulls): add one flat quad per object, y ≈ +0.03 over terrain, sized ~1.15x
  the footprint, `MeshBasicMaterial` with a generated radial-gradient canvas
  texture (black center alpha ≈ 0.38, alpha 0 at edge), `transparent: true`,
  `depthWrite: false`, `polygonOffset` on, and `userData.aoExclude = true`
  (required — the GTAO override prepass ignores alpha and would composite the
  quad as a dark floating rectangle otherwise).
- Buildings: bake the quad into the house group so it inherits placement.
  Tanks: parent to the hull root so it follows the vehicle.

## Notes for the verifier

- `src/engine/sky.js` now force-disables the Sky shader's BUILT-IN cloud layer
  (`u.cloudCoverage.value = 0`). If anyone re-enables it, the "airbrush smear"
  clouds return. The shaped cumulus dome (two shells) is the only cloud system.
- The cloud texture X-tiles: any `repeat.x` applied to it must stay an INTEGER
  or a hard vertical seam appears at the sphere UV wrap.
- One global grade for all cameras lives in post.js (`GRADE_*` + warm
  `GRADE_BALANCE`); per-shot grading is intentionally not exposed — do not add
  camera-specific tints when tuning other shots.
