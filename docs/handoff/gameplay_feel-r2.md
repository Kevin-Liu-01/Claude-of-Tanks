# gameplay_feel round-2 handoff v2 — verified render/feel fixes (apply to non-owned files)

Owner: gameplay_feel. The v1 content of this file (sky soft-knee, GTAO
aoExclude) was applied/superseded and has been replaced by this round's
patches. Every hunk below was **prototyped in the live tree, verified by a
puppeteer WASD+mouse drive with a per-frame terrain-contact probe and by the
green screenshot harness, then reverted** (ownership: gameplay_feel may only
edit `src/sim/movement.js` and `src/game/`). Apply them verbatim.

Evidence (scratchpad):
`/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/drive_shots_r3/`
- `r3_10_occlusion_faded.png` — pine directly between chase camera and tank
  dithered to ~12%, tank fully readable (control: `r3_11_occlusion_control.png`)
- `r3_6_forest_inside.png` / `r3_7_forest_deep.png` — forest drive, no canopy
  wall, no giant flat near-camera card sheets, camo readable in shadow
- `r3_9_sniper.png` + `shots/sniper_view.png` — ×8 scoped picture clean of grass
- drive gate (`drive_run_r3_3.log`): 1617 frames, minClear **+9.4 mm**, 0
  frames < −3 cm, 0 frames > +8 cm, max 68.9 km/h, flinch-phase min +14 mm,
  gun elevation reaches +19.5° (spec +20)

## 0. REQUIRED PAIRING — movement.js / movement.selftest.mjs (owned, ALREADY ON DISK)

`src/sim/movement.js` now (a) integrates the hit-flinch oscillator in
`state._flinch` (constants FLINCH_W=13/FLINCH_Z=0.32, lockstep with
tankFactory), (b) support-solves `pos.y` at the **rendered** attitude
including the r6 visibility amplification — `pitchEff = spring + susp.p×2.6 −
flinch.p`, `rollEff = spring + susp.r×2.1 + swayEst×2.3 + flinch.r`
(SUSP_VIS_P/SUSP_VIS_R/SWAY_VIS lockstep with tankFactory), and (c) runs
sampling + plane fit + clamp in ONE pass at the post-step attitude (the old
pre-step sampling left a Δattitude×lever×slope error that the amplification
turned into −11.7 cm track burial). `movement.selftest.mjs` asserts the same
render contract (28/28 green).

**⚠ Patch §1 below is REQUIRED for the terrain-contact hard gate.** Without
it, tankFactory's half-lift hack stacks on top of the sim's exact solve and
floats/buries tracks several cm during transients.

---

## 1. `src/vehicles/tankFactory.js` — flinch → sim mirror; remove half-lift (4 hunks)

### 1a — after the `let flinchPV = 0, flinchRV = 0;` declaration, add the pend buffer:
replace
```js
  let sway = 0;                      // turn-lean roll (rad), smoothed
  let flinchP = 0, flinchR = 0;      // hit-reaction damped oscillator
  let flinchPV = 0, flinchRV = 0;
  const FLINCH_W = 13, FLINCH_Z = 0.32;
```
with
```js
  let sway = 0;                      // turn-lean roll (rad), smoothed
  let flinchP = 0, flinchR = 0;      // hit-reaction damped oscillator
  let flinchPV = 0, flinchRV = 0;
  // Hit/recoil impulses accumulate here and are routed into the SIM's flinch
  // mirror (state._flinch, integrated by movement.js) on the next
  // syncFromState — the terrain-contact support solve then clears the ground
  // at the flinched pose too (a 1-2° large-caliber rock over a 3.5 m
  // half-length used to dip a track end ~10 cm past the 1.5 cm margin).
  // The local flinchP/flinchR oscillator remains ONLY as a fallback for
  // staged/ghost states without the mirror (killcam ghosts, garage poses).
  let pendFlinchPV = 0, pendFlinchRV = 0;
  const FLINCH_W = 13, FLINCH_Z = 0.32;
```

### 1b — in `syncFromState`, replace the whole flinch-integration block:
replace
```js
      // Hit-flinch: caliber-scaled damped rock layered onto pitch/roll.
      if (flinchP !== 0 || flinchR !== 0 || flinchPV !== 0 || flinchRV !== 0) {
        flinchPV += (-FLINCH_W * FLINCH_W * flinchP - 2 * FLINCH_Z * FLINCH_W * flinchPV) * SIM_STEP;
        flinchP += flinchPV * SIM_STEP;
        flinchRV += (-FLINCH_W * FLINCH_W * flinchR - 2 * FLINCH_Z * FLINCH_W * flinchRV) * SIM_STEP;
        flinchR += flinchRV * SIM_STEP;
        if (Math.abs(flinchP) + Math.abs(flinchPV) + Math.abs(flinchR) + Math.abs(flinchRV) < 1e-4) {
          flinchP = flinchR = flinchPV = flinchRV = 0;
        }
      }
```
with
```js
      // Hit-flinch: caliber-scaled damped rock layered onto pitch/roll.
      // Sim-mirrored path (r2 terrain-contact guard): route pending impulses
      // into state._flinch and RENDER the sim's values — movement.js
      // integrates the oscillator once per fixed tick and support-solves
      // pos.y against this exact pose, so a hit can never rock a track end
      // below the heightfield. Fallback path self-integrates as before.
      if (state._flinch) {
        if (pendFlinchPV !== 0 || pendFlinchRV !== 0) {
          state._flinch.pv += pendFlinchPV;
          state._flinch.rv += pendFlinchRV;
          pendFlinchPV = pendFlinchRV = 0;
        }
        flinchP = state._flinch.p;
        flinchR = state._flinch.r;
      } else {
        if (pendFlinchPV !== 0 || pendFlinchRV !== 0) {
          flinchPV += pendFlinchPV;
          flinchRV += pendFlinchRV;
          pendFlinchPV = pendFlinchRV = 0;
        }
        if (flinchP !== 0 || flinchR !== 0 || flinchPV !== 0 || flinchRV !== 0) {
          flinchPV += (-FLINCH_W * FLINCH_W * flinchP - 2 * FLINCH_Z * FLINCH_W * flinchPV) * SIM_STEP;
          flinchP += flinchPV * SIM_STEP;
          flinchRV += (-FLINCH_W * FLINCH_W * flinchR - 2 * FLINCH_Z * FLINCH_W * flinchRV) * SIM_STEP;
          flinchR += flinchRV * SIM_STEP;
          if (Math.abs(flinchP) + Math.abs(flinchPV) + Math.abs(flinchR) + Math.abs(flinchRV) < 1e-4) {
            flinchP = flinchR = flinchPV = flinchRV = 0;
          }
        }
      }
```

### 1c — REQUIRED FOR GATE: remove the r6 half-lift compensation.
In the `if (!destroyed) { ... }` block that reads the sim spring, replace
```js
        suspP = state._susp ? state._susp.p * SUSP_VIS_P : suspP;
        suspR = state._susp ? state._susp.r * SUSP_VIS_R : suspR;
        if (state._swayEst !== undefined) sway = state._swayEst * SWAY_VIS;
        if (state._susp) {
          // lift by HALF the worst extra corner deficit the amplification
          // introduces beyond the sim's support solve — splits the residual
          // between a few cm of sink and a few cm of float, both sub-pixel
          const exP = Math.abs(suspP) * (1 - 1 / SUSP_VIS_P);
          const exR = Math.abs(suspR) * (1 - 1 / SUSP_VIS_R) +
                      Math.abs(sway) * (1 - 1 / SWAY_VIS);
          root.position.y += 0.5 * (exP * spec.dims.hullLengthM * 0.5 +
                                    exR * spec.dims.widthM * 0.5);
        }
      }
```
with
```js
        suspP = state._susp ? state._susp.p * SUSP_VIS_P : suspP;
        suspR = state._susp ? state._susp.r * SUSP_VIS_R : suspR;
        if (state._swayEst !== undefined) sway = state._swayEst * SWAY_VIS;
        // NO height compensation here: movement.js support-solves state.pos.y
        // at the SAME amplified pose (SUSP_VIS_*/SWAY_VIS mirrored there) so
        // the r5 terrain-contact guarantee holds exactly at the rendered
        // attitude — the old half-lift hack both floated and buried tracks
        // several cm on rough ground (r3 drive gate: −11.7 cm / +8 cm).
      }
```
(If SUSP_VIS_P/SUSP_VIS_R/SWAY_VIS values are retuned, they MUST be mirrored
in movement.js — same names, top of the tuning-constants section.)

### 1d — `hitFlinch`: write into the pend buffer, and clear it in `resetDestroyed`:
replace
```js
      const imp = Math.min(mag, 2) * 0.18;
      flinchPV += f * imp;           // frontal hit rocks the nose up/back
      flinchRV += r * imp * 0.8;
    },
```
with
```js
      const imp = Math.min(mag, 2) * 0.18;
      // Accumulate; syncFromState routes into the sim mirror (state._flinch)
      // so the terrain-contact solve accounts for the rock (see above).
      pendFlinchPV += f * imp;       // frontal hit rocks the nose up/back
      pendFlinchRV += r * imp * 0.8;
    },
```
and in `resetDestroyed()` replace
```js
      flinchP = flinchR = flinchPV = flinchRV = 0;
      suspP = suspR = suspPV = suspRV = 0;
```
with
```js
      flinchP = flinchR = flinchPV = flinchRV = 0;
      pendFlinchPV = pendFlinchRV = 0;
      suspP = suspR = suspPV = suspRV = 0;
```

---

## 2. `src/world/vegetation.js` — occlusion fade + near-camera dissolve + scoped-grass clear-out

MAJOR fixes #1/#2/#3. All per-instance work happens in the shaders; the CPU
sweeps one segment against near-tree proxy spheres per frame (~2k trees, ~µs).
Anchor by intent if lines drifted — the file is under active edit.

### 2a — uniforms: after `const uCamPos = ...` add
```js
  // Camera forward (unit) — drives the sniper center-cone grass clear-out.
  const uCamFwd = { value: new THREE.Vector3(0, 0, 1) };
```

### 2b — grass hook: register + declare the uniform and widen the scoped suppression.
In `grassWindHook`, add `shader.uniforms.uCamFwd = uCamFwd;` next to the other
uniform registrations, extend the `#include <common>` header injection with
`\nuniform vec3 uCamFwd;`, and replace
```glsl
        // sniper scope: suppress the near carpet so the sight picture stays clear
        gfade *= mix(1.0, smoothstep(7.0, 15.0, dCam), uSniperFade);
```
with
```glsl
        // sniper scope (WoT keeps the scoped picture clean): the trunnion-
        // height camera stares OVER meter-tall blades, so the old 7-15 m
        // suppression still let midfield grass flood 30-60% of the sight at
        // x2-x8. Widen the near band to 30 m AND clear a center cone — blades
        // within ~3-6 m of the view ray out to ~90 m shrink away; off-axis
        // and far grass keeps the meadow context around the scope edges.
        float nearBand = smoothstep(12.0, 30.0, dCam);
        float dRay = length(cross(giw.xyz - uCamPos, uCamFwd));
        float rayBand = 1.0 - (1.0 - smoothstep(2.6, 6.0, dRay)) * (1.0 - smoothstep(90.0, 130.0, dCam));
        gfade *= mix(1.0, nearBand * rayBand, uSniperFade);
```
Bump the grass cache keys: `world-grass-wind-v4` → `-v5`,
`world-grass-carpet-v4` → `-v5`.

### 2c — tree hooks: per-instance fade attribute + dither discard.
Replace the whole `treeWindHook` with
```js
  // Every tree material carries the per-instance occlusion fade (aFadeI,
  // 0 = solid → 1 = dithered to ~12%) plus a near-camera dissolve: WoT fades
  // any tree standing between the chase camera and the vehicle — without it,
  // forest routes hide the player tank behind full-screen canopy walls, and
  // cards inside the orbit radius degrade to giant flat unlit sheets.
  const treeWindHook = (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nattribute float aFlex;\nattribute float aFadeI;\nvarying float vFadeI;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tiw.x * 0.043 + tiw.z * 0.051;
        float amp = aFlex * 0.14;
        transformed.x += amp * (sin(uWindTime * 1.15 + ph) + 0.45 * sin(uWindTime * 2.63 + ph * 1.7));
        transformed.z += amp * 0.7 * cos(uWindTime * 0.97 + ph * 1.3);
        vFadeI = aFadeI;
      }`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFadeI;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      {
        // camera-occlusion fade (per-instance) + near-camera card dissolve.
        // Screen-space dither keeps the opaque/alpha-tested pipeline (depth
        // writes stay correct — no sorting, no blend halos).
        float fadeKeep = 1.0 - 0.88 * vFadeI;
        fadeKeep *= smoothstep(1.5, 4.2, length(vViewPosition));
        if (fadeKeep < 0.9995) {
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (ign > fadeKeep) discard;
        }
      }`);
  };
```
(keep the existing wind body if it has since been retuned — the ADDITIONS are
the aFadeI/vFadeI attribute+varying and the fragment block). Bump cache keys:
`world-tree-bark-v3`→`-v4`, `world-tree-canopyfar-v4`→`-v5`,
`world-tree-foliage-v4-`→`-v5-`.

### 2d — tree records (in `pushTree`): replace
```js
    trees.push({ x, z, species, variant: (rng() * 2) | 0, mat: _m4.clone(), tint: _c.clone(), near: false });
```
with
```js
    trees.push({
      x, z, species, variant: (rng() * 2) | 0, mat: _m4.clone(), tint: _c.clone(), near: false,
      // occlusion-fade bookkeeping: canopy proxy sphere (world center/radius,
      // generous enough for every species' card spread), eased fade 0..1 and
      // the instance slot assigned by the current near partition (-1 = far).
      cy: y + 4.4 * sc, cr: 2.9 * sc, fade: 0, slot: -1,
    });
```

### 2e — `makeTreeMesh`: add the instanced attribute before creating the mesh:
```js
    // per-instance occlusion fade — EVERY geometry drawn with the tree hooks
    // must carry the attribute (near meshes are updated live; far meshes stay
    // zero — a tree within camera range is always in the near partition)
    const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
    fadeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFadeI', fadeAttr);
```

### 2f — bushes share the hooked foliage material → zero-filled attribute.
Before `const m = new THREE.InstancedMesh(bushGeos[bv], foliageMats[bushSpecies], ...)`:
```js
      // bushes share the hooked foliage material → need the fade attribute
      // too (all zeros: bushes are hull-height cover, never camera-occluders)
      bushGeos[bv].setAttribute('aFadeI',
        new THREE.InstancedBufferAttribute(new Float32Array(bushPlacements[bv].length), 1));
```

### 2g — `repartitionTrees`: track slots and write fades.
In the near branch add `t.slot = i;` and
`m.geometry.attributes.aFadeI.array[i] = t.fade;` inside the mesh loop; in the
far branch add `t.slot = -1;`; in the near-mesh finalize loop add
`m.geometry.attributes.aFadeI.needsUpdate = true;`.

### 2h — the occlusion sweep (insert before `const _lastCam = ...`):
```js
  // ---- chase-camera foliage occlusion fade -------------------------------
  // WoT behavior: any tree standing between the camera and the player's tank
  // fades to near-transparency so the third-person loop stays readable on
  // forest routes. Each frame the pivot→camera segment is swept against every
  // near tree's canopy proxy sphere; intersecting trees ease toward fade = 1
  // (dithered to ~12% in the shader), everything else eases back to 0.
  const OCCL_TAU_S = 0.13;  // ease time constant (≈150 ms feel, like uSniperFade)
  const OCCL_PAD_M = 1.1;   // canopy-sphere pad — cards jut past the fit sphere
  const OCCL_BOX_PAD = 12;  // XZ broadphase reject (max near-tree cr + pad)
  let occlAny = false;      // skip the sweep entirely once everything settled
  const _dirtyFadeAttrs = new Set();
  function writeTreeFade(t) {
    for (const m of nearMeshes[t.species][t.variant]) {
      const attr = m.geometry.attributes.aFadeI;
      attr.array[t.slot] = t.fade;
      _dirtyFadeAttrs.add(attr);
    }
  }
  function updateOcclusionFade(dt, camPos, focusPos) {
    const active = focusPos !== null && focusPos !== undefined;
    if (!active && !occlAny) return;
    // dt = 0 (shot mode / deterministic captures) snaps: harness stays exact.
    const k = dt > 0 ? 1 - Math.exp(-dt / OCCL_TAU_S) : 1;
    let any = false;
    let ax = 0, ay = 0, az = 0, dx = 0, dy = 0, dz = 0, segLen2 = 0;
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    if (active) {
      ax = focusPos.x; ay = focusPos.y; az = focusPos.z;
      dx = camPos.x - ax; dy = camPos.y - ay; dz = camPos.z - az;
      segLen2 = dx * dx + dy * dy + dz * dz;
      minX = Math.min(ax, camPos.x) - OCCL_BOX_PAD;
      maxX = Math.max(ax, camPos.x) + OCCL_BOX_PAD;
      minZ = Math.min(az, camPos.z) - OCCL_BOX_PAD;
      maxZ = Math.max(az, camPos.z) + OCCL_BOX_PAD;
    }
    for (const t of trees) {
      let target = 0;
      if (active && t.near && t.x > minX && t.x < maxX && t.z > minZ && t.z < maxZ) {
        // closest point on the pivot→camera segment to the canopy center
        let s = segLen2 > 1e-6
          ? ((t.x - ax) * dx + (t.cy - ay) * dy + (t.z - az) * dz) / segLen2
          : 0;
        s = s < 0 ? 0 : (s > 1 ? 1 : s);
        const px = ax + dx * s - t.x;
        const py = ay + dy * s - t.cy;
        const pz = az + dz * s - t.z;
        const rr = t.cr + OCCL_PAD_M;
        if (px * px + py * py + pz * pz < rr * rr) target = 1;
      }
      if (t.fade !== target) {
        t.fade += (target - t.fade) * k;
        if (Math.abs(t.fade - target) < 0.02) t.fade = target;
        if (t.slot >= 0) writeTreeFade(t);
      }
      if (t.fade !== 0) any = true;
    }
    occlAny = any;
    if (_dirtyFadeAttrs.size > 0) {
      for (const attr of _dirtyFadeAttrs) attr.needsUpdate = true;
      _dirtyFadeAttrs.clear();
    }
  }
```

### 2i — `update` signature + call:
```js
  function update(dt, camPos, camFwd = null, focusPos = null) {
    uWindTime.value += dt;
    uCamPos.value.copy(camPos);
    if (camFwd) uCamFwd.value.copy(camFwd);
```
and at the end of `update`, after the repartition block:
```js
    updateOcclusionFade(dt, camPos, focusPos);
```

---

## 3. `src/world/map.js` — pass-through (1 hunk)

replace
```js
    update(dt, cameraPos) {
      terrain.userData.updateLOD(cameraPos);
      vegetation.update(dt, cameraPos);
    },
```
with
```js
    update(dt, cameraPos, cameraFwd = null, focusPos = null) {
      terrain.userData.updateLOD(cameraPos);
      vegetation.update(dt, cameraPos, cameraFwd, focusPos);
    },
```
(update the JSDoc accordingly: `cameraFwd` unit camera forward for the scoped
grass cone; `focusPos` chase-camera focus — non-null enables the tree
occlusion fade along focus→camera.)

## 4. `src/main.js` — 3 hunks

### 4a — module scratch, next to `const _fwd = new THREE.Vector3();`:
```js
// chase-camera occlusion focus (player hull center, lifted to turret height)
const _occlFocus = new THREE.Vector3();
```

### 4b — shot mode (`if (shotMode) {` in `tick`):
replace
```js
    // Deterministic screenshot hold: no sim, no rig, frozen fx clock.
    world.update(0, camera.position);
```
with
```js
    // Deterministic screenshot hold: no sim, no rig, frozen fx clock.
    // (dt = 0 also snaps the foliage occlusion fade to zero — see vegetation.)
    camera.getWorldDirection(_fwd);
    world.update(0, camera.position, _fwd, null);
```

### 4c — live loop step 4:
replace
```js
  // 4. world LOD/wind (+ WoT-style near-grass suppression while scoped)
  world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0);
  world.update(dtR, camera.position);
```
with
```js
  // 4. world LOD/wind (+ WoT-style near-grass suppression while scoped, and
  // chase-camera foliage occlusion fade along player→camera in arcade)
  world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0);
  camera.getWorldDirection(_fwd);
  let occlFocus = null;
  if (inBattle && !kcActive && rig.mode === 'ARCADE' && game.player && game.player.state &&
      game.player.visual && game.player.visual.root.visible) {
    occlFocus = _occlFocus.copy(game.player.state.pos);
    occlFocus.y += game.player.spec.dims.heightM * 0.75;
  }
  world.update(dtR, camera.position, _fwd, occlFocus);
```

---

## 5. `src/vehicles/materials.js` — vehicle ambient floor (3 hunks)

NOTE: hunk 5a (the `VEHICLE_AMBIENT_FLOOR` const + `vehicleAmbientFloorHook`
export) was left ON DISK during the revert — the camo/GLB owner's r6
"supernova" fix (`applyCamoToModel`'s CSM re-registration of cloned GLB
materials) already consumes `vehicleAmbientFloorHook` by name, and removing
the definition would break module load. That owner's clone re-registration
also SUPERSEDES hunk 5c below — skip 5c if `applyCamoToModel` already routes
clones through a `setup(m.clone())` that applies the hook. Hunks 5b and 6
(procedural fleet + modelLoader.upgradeMaterials) still need applying.

### 5a — (already on disk, see note) before `export function
createTankMaterials(...)` (after the camo pattern section) add:
```js
// WoT-style vehicle readability floor (gameplay_feel r2: driving through tree
// shadow crushed the player hull to a featureless black silhouette — camo and
// detail invisible). Floor the indirect-diffuse term at a small fraction of
// the albedo so vehicles stay readable in full CSM/canopy shade; the max()
// only engages when the ambient stack (hemi + IBL) drops below the floor, so
// sunlit response and the key:fill ratio are untouched. Vehicles ONLY — the
// world keeps its deep shadows for contrast.
// 0.35 ≈ 2× the hemi+IBL ambient response: a clear lift out of black-crush
// while staying far under the ~4.5-intensity sunlit response (0.16 sat AT the
// ambient level and was invisible after ACES).
const VEHICLE_AMBIENT_FLOOR = 0.35;

/**
 * Shader hook: clamp `reflectedLight.indirectDiffuse` to an albedo-scaled
 * floor. Chain via `setupShadowMaterial(mat, vehicleAmbientFloorHook)` for
 * CSM materials, or assign directly as `onBeforeCompile` for sourced-GLB
 * materials (see modelLoader.upgradeMaterials).
 * @param {object} shader onBeforeCompile shader arg
 */
export function vehicleAmbientFloorHook(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
	reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, material.diffuseColor * ${VEHICLE_AMBIENT_FLOOR.toFixed(3)} );`,
  );
}
```

### 5b — in `createTankMaterials`, replace
```js
  const setup = engineCtx && typeof engineCtx.setupShadowMaterial === 'function'
    ? (m) => engineCtx.setupShadowMaterial(m)
    : (m) => m;
```
with
```js
  const setup = engineCtx && typeof engineCtx.setupShadowMaterial === 'function'
    ? (m) => {
      // chain the vehicle readability floor after the CSM hook; the explicit
      // cache key separates these programs from other hooked materials
      engineCtx.setupShadowMaterial(m, vehicleAmbientFloorHook);
      m.customProgramCacheKey = () => 'veh-ambient-floor-v1';
      return m;
    }
    : (m) => m;
```

### 5c — in `applyCamoToModel`, after `const own = m.clone();`:
```js
      // Material.clone() drops onBeforeCompile/customProgramCacheKey — the
      // vehicle readability floor (set in modelLoader.upgradeMaterials) must
      // be re-asserted or the GLB hull crushes to black in tree/CSM shadow.
      own.onBeforeCompile = vehicleAmbientFloorHook;
      own.customProgramCacheKey = () => 'veh-ambient-floor-v1';
```
(verified: 82/82 GLB mats + 28/28 procedural mats hooked after this)

## 6. `src/vehicles/modelLoader.js` — GLB materials get the floor (2 hunks)

### 6a — import: add `vehicleAmbientFloorHook` to the `./materials.js` import.

### 6b — in `upgradeMaterials`, at the top of the per-material loop
(right after `if (!m) continue;`):
```js
      // vehicle readability floor (shared with the procedural fleet): keeps
      // the hull out of full black-silhouette crush inside tree/CSM shadow.
      // GLB materials carry no other hook, so direct assignment is safe.
      m.onBeforeCompile = vehicleAmbientFloorHook;
      m.customProgramCacheKey = () => 'veh-ambient-floor-v1';
```

## 7. `src/engine/cameraRig.js` — view pitch clamp (1 hunk)

replace
```js
const PITCH_MAX = THREE.MathUtils.degToRad(15); // looking up
```
with
```js
// Looking up: must EXCEED every tank's gun elevation limit (+18..+20° per the
// class table in movement-physics.md §7) or full elevation is uncommandable —
// close targets uphill were unaimable at the old +15°. WoT lets the camera
// look well above the horizon; the gun clamps itself at spec.gunElevationDeg
// with the atGunLimit reticle pin (movement.js).
const PITCH_MAX = THREE.MathUtils.degToRad(30);
```
(verified: gun reaches +19.5° of the M1A2's +20° spec in the drive test;
arcade auto-height keeps the low camera above terrain.)

---

## Notes / known-acceptable residue

- Faded canopies still cast full shadows (their `customDepthMaterial` is not
  fade-hooked) — matches WoT; grounding shadows under a faded tree read fine.
- GTAO's normal prepass sees dither-discarded bark as solid (foliage cards are
  already `aoExclude`d) — a faint AO ghost behind a faded trunk is possible,
  not observed in evidence shots.
- Occlusion fade is player-focus only (arcade mode); sniper/killcam/shot mode
  pass `focusPos = null`, so deterministic captures are unaffected (dt = 0
  snaps every fade to 0).
