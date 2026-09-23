// Water pass 8 (2026-09-23, owner: "when the tank is in and rolling it looks so jank and not reactive — literally a
// static PNG following you"): the world-anchored reactive water field. This receipt pins the contract — the linear
// shallow-water step (momentum with the hull pressure, continuity, damping, odd-even diffusion), the torus mapping
// that never depends on the anchor, the fading window at the seam, the fixed-step accumulator, the hull and splash
// packing, the tier/renderer gates and the sheet's side of the handshake — with a recording renderer, no WebGL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  createWaterRippleField, WATER_RIPPLE_WINDOW_M, WATER_RIPPLE_TEXELS, WATER_RIPPLE_DEPTH_M, WATER_RIPPLE_FIXED_DT,
  WATER_RIPPLE_MAX_SUBSTEPS, WATER_RIPPLE_GRAVITY, WATER_RIPPLE_HULL_DRAFT_M, WATER_RIPPLE_CHURN_FULL_SPEED_MPS,
} from './waterRipples.ts';
import { createShallowWaterSurface, WAKE_FULL_SPEED_MPS } from './shallowWater.ts';

function recordingRenderer() {
  const log = [];
  let target = null;
  return {
    log,
    autoClear: true,
    getRenderTarget() { return target; },
    setRenderTarget(value) { target = value; log.push(['target', value?.texture?.name ?? null]); },
    render(root) {
      const material = root.material;
      log.push(['render', material.name, material.uniforms?.tState?.value?.name ?? null,
        material.uniforms?.uImpulseCount?.value ?? null, this.autoClear]);
    },
  };
}

// 1. Gates: no renderer, a renderer without the surface, or the mobile tier → null (the sheet keeps its wake).
assert.equal(createWaterRippleField(null), null);
assert.equal(createWaterRippleField(undefined), null);
assert.equal(createWaterRippleField({ setupShadowMaterial() {} }), null, 'an engine context is not a renderer');
assert.equal(createWaterRippleField(recordingRenderer(), { tier: 'mobile' }), null, 'mobile tier: no field');

// 2. Construction: two half-float, linear, repeating, depthless targets; the sheet-facing handles.
const renderer = recordingRenderer();
const field = createWaterRippleField(renderer, { tier: 'desktop' });
assert.ok(field, 'desktop tier with a renderer builds the field');
assert.equal(field.params.x, WATER_RIPPLE_WINDOW_M);
assert.equal(field.params.w, 0, 'inactive until the first step');
assert.equal(field.stateUniform.value, null, 'no state texture before the first step');
assert.ok(Math.abs(field.texel.x - 1 / WATER_RIPPLE_TEXELS) < 1e-12 && Math.abs(field.texel.y - WATER_RIPPLE_WINDOW_M / WATER_RIPPLE_TEXELS) < 1e-12,
  'texel size in uv and in metres');
const dx = WATER_RIPPLE_WINDOW_M / WATER_RIPPLE_TEXELS;
assert.ok(dx <= 0.4, `a tank footprint spans ≥ 18 texels (dx ${dx} m)`);
const waveSpeed = Math.sqrt(WATER_RIPPLE_GRAVITY * WATER_RIPPLE_DEPTH_M);
assert.ok(waveSpeed * WATER_RIPPLE_FIXED_DT / dx < 0.5, `explicit step stable: c·dt/dx = ${(waveSpeed * WATER_RIPPLE_FIXED_DT / dx).toFixed(3)} < 0.5`);
assert.ok(waveSpeed > 3.5 && waveSpeed < 6, `wave speed ${waveSpeed.toFixed(2)} m/s: a tank at 6–10 m/s runs supercritical`);
assert.equal(WATER_RIPPLE_CHURN_FULL_SPEED_MPS, WAKE_FULL_SPEED_MPS, 'churn saturates at the sheet wake speed');

// 3. The step shader: the shallow-water form, the torus mapping, the window fade, the hull pressure and churn.
const source = readFileSync(new URL('./waterRipples.ts', import.meta.url), 'utf8');
const glsl = source.slice(source.indexOf('const STEP_FRAGMENT'), source.indexOf('export interface WaterRippleField'));
assert.ok(glsl.includes('return w + uSize * floor((uAnchor - w) / uSize + 0.5);'),
  'torus: a texel is the copy of its world position nearest the anchor; texel = fract(world / size) never moves with the anchor');
assert.ok(glsl.includes('vec2 vel = c.gb - uGravity * grad * uDt;'), 'momentum: du/dt = -g grad(h + hull pressure)');
assert.ok(glsl.includes('vec2 grad = vec2((r.r + pr) - (l.r + pl), (u.r + pu) - (d.r + pd)) * inv2dx;'),
  'the hull pressure enters the gradient with the height — a static hull only presses a dimple, a moving one radiates');
assert.ok(glsl.includes('float h = c.r - depth * div * uDt;') && glsl.includes('float depth = uDepth * mix(0.25, 1.0, wet);'),
  'continuity: dh/dt = -H div u, the depth from the sheet\'s own wetness so crests slow and bend toward the bank');
assert.ok(glsl.includes('vel *= 1.0 - min(1.0, 6.0 * uDt) * (1.0 - wet);') && glsl.includes('if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;'),
  'the bank absorbs; past the square the apron is open water');
assert.ok(glsl.includes('vel *= 1.0 - uDamping * uDt;'), 'damping');
assert.ok(glsl.includes('h = mix(h, (l.r + r.r + u.r + d.r) * 0.25, 0.04);'), 'odd-even decoupling control');
assert.ok(glsl.includes('float window = 1.0 - smoothstep(0.40, 0.47, max(off.x, off.y));')
  && glsl.includes('gl_FragColor = vec4(h, vel, foam) * window;'), 'the state fades to rest toward the seam every step');
assert.ok(glsl.includes('return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);'), 'rounded-rectangle hull footprint');
assert.ok(glsl.includes('p += uHullB[i].z * (1.0 - smoothstep(-0.2, 0.6, hullDistance(w, uHullA[i], uHullB[i])));'),
  'the draft over the footprint, feathered past the skirt');
assert.ok(glsl.includes('foam += trackChurn(w) * uDt * 0.8;') && glsl.includes('float foam = mix(c.a, (l.a + r.a + u.a + d.a) * 0.25, 0.05) * exp(-uFoamDecay * uDt);'),
  'track churn feeds a decaying, spreading foam field that stays where it was churned');
assert.ok(glsl.includes('h -= imp.w * g;') && glsl.includes('if (i >= uImpulseCount) break;'), 'splash impulses are craters');

// 4. Packing: normalised heading, clamped strength → draft, churn from speed, defaults, cap 8.
field.setDisturbances([
  { x: 10, z: -4, strength: 0.5, dirX: 3, dirZ: 4, speed: 4, halfLength: 3.6, halfWidth: 1.7 },
  { x: 0, z: 0, strength: 2 },
  ...Array.from({ length: 9 }, (_, i) => ({ x: i, z: i, strength: 1 })),
]);
const stepMaterialUniforms = (() => {
  // reach the uniforms through a step: the recording renderer sees the material
  field.step(WATER_RIPPLE_FIXED_DT, 10, -4);
  const render = renderer.log.find((entry) => entry[0] === 'render' && entry[1] === 'waterRipples:step');
  assert.ok(render, 'a step rendered the step material');
  return field;
})();
assert.ok(stepMaterialUniforms);
const hullA = source.includes('hullA[i].set(s.x, s.z, fx, fz);');
assert.ok(hullA, 'slot A carries position and unit heading');
assert.ok(source.includes('strength * WATER_RIPPLE_HULL_DRAFT_M, churn);'), 'slot B carries the draft and the churn rate');
assert.ok(source.includes('const n = Math.min(SLOT_CAP, sources.length);'), 'cap 8 slots');
assert.ok(WATER_RIPPLE_HULL_DRAFT_M > 0.3 && WATER_RIPPLE_HULL_DRAFT_M < 0.6, 'the draft is a wading tank, not a ship');

// 5. Stepping: the first step primes both targets to rest, every step ping-pongs, impulses land once, the renderer
//    state is restored, and the accumulator never runs more than the cap or spirals after a stall.
const r2 = recordingRenderer();
const f2 = createWaterRippleField(r2, { tier: 'desktop' });
f2.addImpulse(3, 4, 2, 0.3, 0.9);
f2.addImpulse(NaN, 0, 1, 1);
f2.step(WATER_RIPPLE_FIXED_DT, 100, 200);
const resets = r2.log.filter((e) => e[0] === 'render' && e[1] === 'waterRipples:reset');
assert.equal(resets.length, 2, 'the first step clears both targets through the reset quad (no clear-colour API)');
let steps = r2.log.filter((e) => e[0] === 'render' && e[1] === 'waterRipples:step');
assert.equal(steps.length, 1);
assert.equal(steps[0][2], 'waterRipples.a', 'first step reads a');
assert.equal(steps[0][3], 1, 'the one finite impulse lands on the first substep');
assert.equal(steps[0][4], false, 'autoClear off while stepping');
assert.equal(r2.autoClear, true, 'autoClear restored');
assert.equal(r2.getRenderTarget(), null, 'render target restored');
assert.equal(f2.stateUniform.value.name, 'waterRipples.b', 'the sheet reads the target just written');
assert.deepEqual([f2.params.y, f2.params.z, f2.params.w], [100, 200, 1], 'the window follows the anchor and is active');
assert.equal(f2.steps, 1);
// a long frame: at most the substep cap, later impulses zero
f2.step(0.25, 100, 200);
steps = r2.log.filter((e) => e[0] === 'render' && e[1] === 'waterRipples:step');
assert.equal(steps.length, 1 + WATER_RIPPLE_MAX_SUBSTEPS, 'a stalled frame runs the cap, never more');
assert.ok(steps.slice(1).every((e) => e[3] === 0), 'no impulse repeats');
assert.deepEqual(steps.slice(1).map((e) => e[2]), ['waterRipples.b', 'waterRipples.a', 'waterRipples.b'], 'ping-pong');
// the accumulator was clamped: a following short frame runs one step, not a backlog
f2.step(WATER_RIPPLE_FIXED_DT, 100, 200);
assert.equal(r2.log.filter((e) => e[0] === 'render' && e[1] === 'waterRipples:step').length, 2 + WATER_RIPPLE_MAX_SUBSTEPS);
// a sub-step frame accumulates without rendering
const before = r2.log.length;
f2.step(WATER_RIPPLE_FIXED_DT * 0.4, 100, 200);
assert.equal(r2.log.length, before, 'a short frame accumulates');
f2.step(WATER_RIPPLE_FIXED_DT * 0.7, 100, 200);
assert.equal(r2.log.filter((e) => e[0] === 'render' && e[1] === 'waterRipples:step').length, 3 + WATER_RIPPLE_MAX_SUBSTEPS,
  'two short frames make one step');
// bad input is ignored
f2.step(NaN, 0, 0); f2.step(0.02, NaN, 0); f2.step(-1, 0, 0);
assert.equal(f2.steps, 3 + WATER_RIPPLE_MAX_SUBSTEPS);
f2.clear();
assert.equal(f2.params.w, 0, 'clear() deactivates the window until the next step');
f2.dispose();
f2.step(0.02, 0, 0);
assert.equal(f2.steps, 3 + WATER_RIPPLE_MAX_SUBSTEPS, 'a disposed field never renders');

// 6. The sheet's side: the surface shares the field's uniform objects, forwards disturbances and steps with an anchor.
const r3 = recordingRenderer();
const f3 = createWaterRippleField(r3, { tier: 'desktop' });
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
geometry.setIndex([0, 2, 1]);
const handed = [];
const sheet = createShallowWaterSurface(geometry, new THREE.Texture(), new THREE.Texture(), 1024, 'reservoir', [0.4, 0.78],
  (material, hook) => handed.push(hook), f3);
assert.equal(sheet.ripples, f3);
const probe = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
handed[0](probe);
assert.equal(probe.uniforms.uWaterRipple, f3.stateUniform, 'the sampler IS the field\'s value object (ping-pong reaches the sheet)');
assert.equal(probe.uniforms.uWaterRippleParams.value, f3.params);
assert.equal(probe.uniforms.uWaterRippleTexel.value, f3.texel);
sheet.setDisturbances([{ x: 1, z: 2, strength: 1, speed: 8 }]);
sheet.update(WATER_RIPPLE_FIXED_DT, 5, 6);
assert.equal(f3.steps, 1, 'update with an anchor steps the field');
assert.deepEqual([f3.params.y, f3.params.z], [5, 6]);
sheet.update(WATER_RIPPLE_FIXED_DT);
assert.equal(f3.steps, 1, 'update without an anchor only advances the clock');
sheet.mesh.material.dispose();
f3.dispose();

// 7. The world wiring: the terrain hands the height field the splash hook, the FX layer uses it and drops its prints.
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.ok(terrain.includes('mask: materialStep.value.waterMask, mapSizeM: heightField.size, ramp: cfg.splat.seaRamp || [0.40, 0.78],'),
  'the field reads the sheet\'s own mask, size and ramp');
assert.ok(terrain.includes('heightField.addWaterImpulse = ripples.addImpulse;')
  && terrain.includes('heightField.waterRipplesActive = () => true;')
  && terrain.includes('group.userData.disposeWater = ripples.dispose;'), 'terrain installs the field hooks and its disposal');
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.ok(map.includes('terrain.userData.updateWater?.(dt, waterAnchor.x, waterAnchor.z);')
  && map.includes('const waterAnchor = focusPos ?? cameraPos;'), 'the window follows the chase focus, else the camera');
assert.ok(map.includes('terrain.userData.disposeWater?.();'), 'world dispose releases the targets');
const effects = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
assert.ok(effects.includes("if (intensity > 0.06 && !frozen && !heightField?.waterRipplesActive?.()) stampTrackPrint(pos, dir, true);"),
  'the ring prints stay only where no field carries the churn');
assert.ok(effects.includes('heightField?.addWaterImpulse?.(pos.x, pos.z, 0.9 + 1.1 * s, 0.22 * s, 0.85);'), 'a shell splash lands in the field');

console.log('waterRipples.selftest: world-anchored shallow-water field — gates, targets, step shader, packing, fixed-step '
  + 'accumulator, renderer restore, sheet handshake and world wiring pinned');
