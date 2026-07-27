# gameplay_feel round-2 handoff — verified render fixes (apply to non-owned files)

Owner: gameplay_feel. These three patches fix the two MAJOR problems from the
round-2 critique. Both were **prototyped, screenshot-verified in a live battle,
and then reverted** (ownership: gameplay_feel may only edit `src/sim/movement.js`
and `src/game/`). Apply them verbatim. Evidence screenshots:
`/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/r3c/`
(`sun_baseline.png` — bloom ON, camera at sun azimuth 140°, frame fully
readable with a local sun disc; `sniper_baseline.png` — GTAO ON, ×8 sniper over
grass, zero rectangular cards) vs the same poses pre-fix in `../r3/`.

---

## 1. MAJOR — sun-facing white-out  → `src/engine/sky.js` (2 hunks)

Root cause (isolated by A/B: disabling UnrealBloom alone removes the entire
white-out): the Sky shader's Mie halo crosses the 1.35 bloom threshold over a
huge screen area; UnrealBloom smears it into a half-frame wash. Fix: soft-knee
compress the sky DOME's luminance so the halo lands under the threshold while
the (vastly brighter) sun disc still reaches the 1.6 asymptote and blooms
locally. Scene emissives (muzzle flash, tracers, fire) are untouched.

### Hunk 1a — replace
```js
const SKY_RADIANCE_SCALE = 0.38;
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
```
with
```js
const SKY_RADIANCE_SCALE = 0.38;
// Even after SKY_RADIANCE_SCALE the Mie halo around the sun spans several
// hundred bloom-threshold-crossing pixels — UnrealBloom smears that huge area
// into a half-frame white-out when the camera faces the sun azimuth (a direct
// gameplay failure: aiming west = blind). Soft-knee compress the DOME's
// luminance: below SKY_KNEE untouched, above it an exponential shoulder that
// asymptotes at SKY_KNEE + SKY_KNEE_RANGE = 1.6. The halo (lum ~2-6) lands at
// ~1.2-1.35 → under the 1.35 bloom threshold, while the actual sun disc
// (lum >> 100) still reaches ~1.6 → blooms locally. Scene emissives (muzzle
// flash, tracers, fire) are not touched — this only runs in the Sky shader.
const SKY_KNEE = 1.2;
const SKY_KNEE_RANGE = 0.4;
const SKY_KNEE_FALLOFF = 0.125; // 1/e width of the shoulder in luminance units
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
```

### Hunk 1b — in `configureSkyUniforms`, replace
```js
    const patched = shader.fragmentShader.replace(
      SKY_FRAG_ANCHOR,
      `gl_FragColor = vec4( texColor * ${SKY_RADIANCE_SCALE.toFixed(4)}, 1.0 );`,
    );
```
with
```js
    const patched = shader.fragmentShader.replace(
      SKY_FRAG_ANCHOR,
      `vec3 skyCol = texColor * ${SKY_RADIANCE_SCALE.toFixed(4)};
	float skyL = dot( skyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
	if ( skyL > ${SKY_KNEE.toFixed(3)} ) {
		skyCol *= ( ${SKY_KNEE.toFixed(3)} + ${SKY_KNEE_RANGE.toFixed(3)} * ( 1.0 - exp( -( skyL - ${SKY_KNEE.toFixed(3)} ) * ${SKY_KNEE_FALLOFF.toFixed(4)} ) ) ) / skyL;
	}
	gl_FragColor = vec4( skyCol, 1.0 );`,
    );
```
(The compression also flows into the PMREM env bake and the horizon-fog
readback via the shared `configureSkyUniforms` — intentional and verified fine:
fog color and ambient are unchanged away from the sun.)

---

## 2. MAJOR — sniper-view grass renders as rectangular cards → `src/engine/post.js` (1 hunk) + `src/world/vegetation.js` (2 flags)

Root cause (isolated by A/B: `gtao.enabled=false` removes every rectangle):
`GTAOPass` renders its depth/normal prepass with a scene-wide
`overrideMaterial` (`MeshNormalMaterial`, see three@0.185 GTAOPass.js L641),
which ignores `alphaTest` — every grass card writes a SOLID quad into the AO
G-buffer and composites as a dark floating rectangle, worst at ×8 sniper zoom.
Fix: per-pass visibility exclusion, keyed on `userData.aoExclude`.

### Hunk 2a — `src/engine/post.js`, replace
```js
  gtao.blendIntensity = GTAO_BLEND_INTENSITY;
  composer.addPass(gtao);
```
with
```js
  gtao.blendIntensity = GTAO_BLEND_INTENSITY;
  // GTAO renders its depth/normal prepass with a scene-wide overrideMaterial,
  // which ignores alphaTest — alpha-tested foliage cards would write SOLID
  // rectangles into the AO buffer and composite as dark floating quads over
  // the terrain (worst in sniper zoom). Hide objects flagged
  // `userData.aoExclude` for the duration of the pass only.
  {
    const origGtaoRender = gtao.render.bind(gtao);
    const hidden = [];
    gtao.render = function aoExcludeRender(...args) {
      scene.traverse((o) => {
        if (o.userData.aoExclude === true && o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      });
      origGtaoRender(...args);
      for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
      hidden.length = 0;
    };
  }
  composer.addPass(gtao);
```

### Hunk 2b — `src/world/vegetation.js`: flag EVERY grass `InstancedMesh`

vegetation.js is under active edit, so anchor by intent: **every InstancedMesh
that uses a grass-card material (alphaTest tuft cards) must get
`mesh.userData.aoExclude = true;` right after its `receiveShadow = true;`
line.** At the time of verification there were two creation sites:

1. the midfield chunk scatter (`new THREE.InstancedMesh(grassVariants[vv].geo,
   grassVariants[vv].matMid, ...)` inside the CHUNKS double loop), and
2. the camera-centred near carpet (`new THREE.InstancedMesh(
   grassVariants[vv].geo, grassVariants[vv].matNear, CARPET_CAP)` in the
   `carpetMeshes` loop).

Add to both (comment included):
```js
      // GTAO's override-material prepass ignores alphaTest and would bake each
      // card as a solid dark rectangle — exclude grass from the AO pass.
      mesh.userData.aoExclude = true;
```
NOTE: vegetation.js has since been rewritten so that TREE FOLIAGE is also
alpha-carded planes. The same GTAO solid-rectangle artifact will appear on
canopies; if dark quads show on trees, flag the foliage-card meshes (NOT the
opaque trunk meshes) with `userData.aoExclude = true` as well. Verified for
grass; tree flagging is the same mechanism.

---

## 3. Optional notes for the art owner (minors from the same critique, unverified)

- `src/world/props.js`: building window quads render as raw black alpha holes
  with fringing at brawl range; prefer a dark-glass colored material plus frame
  geometry. Wall texture needs coarser brick/plaster structure that survives
  5 m viewing in sniper.
- Player-tank roof/rear read as untextured boxes from the chase camera; needs
  hatch/optics geometry and finer multi-octave camo. (Model factory appeared to
  be mid-rework during verification — may already be addressed.)
