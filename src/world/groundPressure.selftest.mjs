// Round 73 (2026-09-25, the ground redux; owner: "add tall grass that interacts with tanks"): the world-anchored
// pressure field the tall grass bends to. This receipt pins the contract — the spring-back and crush decays, the
// stamp that only ever raises the press (a trail stays behind the tracks), the push direction (along the travel of a
// moving hull, outward from a standing one), the torus mapping that never depends on the anchor, the fading window at
// the seam, the hull packing, the tier / renderer gates, the CPU twin of the footprint press and the world wiring —
// with a recording renderer, no WebGL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGroundPressureField, groundPressAt, GROUND_PRESSURE_WINDOW_M, GROUND_PRESSURE_TEXELS, GROUND_PRESSURE_RECOVER_S,
  GROUND_PRESSURE_CRUSH_S, GROUND_PRESSURE_FEATHER_M, GROUND_PRESSURE_MOVING_MPS,
} from './groundPressure.ts';

function recordingRenderer() {
  const log = [];
  let target = null;
  let uniforms = null;
  return {
    log,
    autoClear: true,
    get uniforms() { return uniforms; },
    getRenderTarget() { return target; },
    setRenderTarget(value) { target = value; log.push(['target', value?.texture?.name ?? null]); },
    render(root) {
      const material = root.material;
      if (material.uniforms) uniforms = material.uniforms;
      log.push(['render', material.name, material.uniforms?.tState?.value?.name ?? null, material.uniforms?.uDt?.value ?? null, this.autoClear]);
    },
  };
}

// 1. Gates: no renderer, a renderer without the surface, or the mobile tier → null (the sward stands untouched).
assert.equal(createGroundPressureField(null), null);
assert.equal(createGroundPressureField(undefined), null);
assert.equal(createGroundPressureField({ setupShadowMaterial() {} }), null, 'an engine context is not a renderer');
assert.equal(createGroundPressureField(recordingRenderer(), { tier: 'mobile' }), null, 'mobile tier: no field');

// 2. Construction and the constants: the window, the texel, the decays.
const renderer = recordingRenderer();
const field = createGroundPressureField(renderer, { tier: 'desktop' });
assert.ok(field, 'desktop tier with a renderer builds the field');
assert.equal(field.params.x, GROUND_PRESSURE_WINDOW_M);
assert.equal(field.params.w, 0, 'inactive until the first step');
assert.equal(field.stateUniform.value, null, 'no state texture before the first step');
assert.equal(field.steps, 0);
const dx = GROUND_PRESSURE_WINDOW_M / GROUND_PRESSURE_TEXELS;
assert.ok(dx <= 0.4, `a track lane spans several texels (dx ${dx} m)`);
assert.ok(GROUND_PRESSURE_WINDOW_M >= 80, 'the window covers the chase view around the focus');
assert.ok(GROUND_PRESSURE_RECOVER_S >= 15 && GROUND_PRESSURE_RECOVER_S <= 30, 'the sward stands up again over ~20 s');
assert.ok(GROUND_PRESSURE_CRUSH_S > GROUND_PRESSURE_RECOVER_S, 'crushed blades stay bruised longer than they stay flat');
assert.ok(GROUND_PRESSURE_FEATHER_M > 0.2 && GROUND_PRESSURE_FEATHER_M < 1, 'the press feathers past the skirt, not across the meadow');
assert.ok(GROUND_PRESSURE_MOVING_MPS > 0 && GROUND_PRESSURE_MOVING_MPS < 2, 'a crawling hull already lays the blades along its travel');

// 3. The step shader: decays, the stamp, the direction, the torus, the window.
const source = readFileSync(new URL('./groundPressure.ts', import.meta.url), 'utf8');
const glsl = source.slice(source.indexOf('const STEP_FRAGMENT'), source.indexOf('export interface GroundDisturbance'));
assert.ok(glsl.includes('return w + uSize * floor((uAnchor - w) / uSize + 0.5);'),
  'torus: a texel is the copy of its world position nearest the anchor; texel = fract(world / size) never moves with the anchor');
assert.ok(glsl.includes('float press = c.r * exp(-uDt / uRecover);'), 'the press springs back exponentially');
assert.ok(glsl.includes('float crush = c.a * exp(-uDt / uCrushDecay);'), 'the bruise fades on its own, slower, clock');
assert.ok(glsl.includes('float inside = (1.0 - smoothstep(-0.15, uFeather, hullDistance(w, a, b))) * b.z;'), 'the footprint press, feathered past the skirt');
assert.ok(glsl.includes('if (inside > press) {') && glsl.includes('press = inside;'), 'a stamp only ever raises the press: the trail stays until it recovers');
assert.ok(glsl.includes('vec2 push = b.w > 0.5 ? a.zw : normalize(rel + vec2(1e-4, 0.0));'),
  'moving: along the travel; standing: outward from the belly');
assert.ok(glsl.includes('push = normalize(push + side * sign(across) * mix(0.55, 0.30, b.w));'), 'the flanks lean outward: two rolled lanes, not one stripe');
assert.ok(glsl.includes('crush = max(crush, inside * 0.85);'), 'the bruise remembers every press');
assert.ok(glsl.includes('return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);'), 'rounded-rectangle hull footprint');
assert.ok(glsl.includes('float window = 1.0 - smoothstep(0.40, 0.47, max(off.x, off.y));')
  && glsl.includes('gl_FragColor = vec4(press, dir, crush) * window;'), 'the state fades to rest toward the seam every step');

// 4. Packing: normalised heading, the moving flag from the speed, defaults, strength, cap 8.
field.setDisturbances([
  { x: 10, z: -4, dirX: 3, dirZ: 4, speed: 4, halfLength: 3.6, halfWidth: 1.7 },
  { x: 0, z: 0, speed: 0.2, strength: 0.5 },
  { x: 1, z: 1, dirX: 0, dirZ: 0, speed: Number.NaN },
  ...Array.from({ length: 9 }, (_, i) => ({ x: i, z: i, speed: 3 })),
]);
field.step(1 / 60, 10, -4);
const u = renderer.uniforms;
assert.equal(u.uHullCount.value, 8, 'eight slots');
assert.deepEqual(u.uHullA.value[0].toArray(), [10, -4, 0.6, 0.8], 'position and unit heading');
assert.deepEqual(u.uHullB.value[0].toArray(), [3.6, 1.7, 1, 1], 'footprint, full strength, moving');
assert.deepEqual(u.uHullB.value[1].toArray(), [3.4, 1.8, 0.5, 0], 'default footprint, half strength, standing (0.2 m/s is not moving)');
assert.deepEqual(u.uHullA.value[2].toArray().slice(2), [0, 1], 'a zero heading defaults to +Z');
assert.equal(u.uHullB.value[2].w, 0, 'a NaN speed is standing');
assert.equal(u.uHullB.value[3].w, 1, '3 m/s is moving');

// 5. Stepping: one pass per call, the dt clamp, the swap, the renderer restored, the anchor and activity published.
assert.equal(field.steps, 1);
assert.equal(field.params.w, 1); assert.equal(field.params.y, 10); assert.equal(field.params.z, -4);
assert.equal(field.stateUniform.value?.name, 'groundPressure.b', 'the written target is the state after the first step');
assert.equal(renderer.getRenderTarget(), null, 'the renderer\'s target is restored');
assert.equal(renderer.autoClear, true, 'and its autoClear');
const renders = renderer.log.filter((e) => e[0] === 'render');
assert.deepEqual(renders.slice(0, 2).map((e) => e[1]), ['groundPressure:reset', 'groundPressure:reset'], 'both targets are primed once');
assert.deepEqual(renders[2].slice(1, 3), ['groundPressure:step', 'groundPressure.a'], 'the step reads a and writes b');
assert.equal(renders[2][4], false, 'the pass never clears the target it accumulates into');
field.step(0.5, 10, -4);
assert.equal(field.steps, 2);
assert.equal(u.uDt.value, 0.1, 'a long frame is clamped to 0.1 s (the decay never overshoots)');
assert.equal(field.stateUniform.value?.name, 'groundPressure.a', 'ping-pong');
for (const bad of [[Number.NaN, 0, 0], [0, 0, 0], [-1, 0, 0], [1 / 60, Number.NaN, 0], [1 / 60, 0, Number.POSITIVE_INFINITY]]) {
  field.step(...bad);
}
assert.equal(field.steps, 2, 'a broken dt or anchor is a no-op');
field.clear();
assert.equal(field.params.w, 0); assert.equal(field.stateUniform.value, null);
field.step(1 / 60, 0, 0);
assert.equal(field.params.w, 1, 'the field runs again after a clear');
field.dispose(); field.dispose();
assert.equal(field.params.w, 0, 'disposed fields are inactive');
field.step(1 / 60, 0, 0);
assert.equal(field.steps, 3, 'and never step again');

// 6. The CPU twin of the footprint press (the trail metric reads it).
const hull = { x: 0, z: 0, dirX: 1, dirZ: 0, halfLength: 3.4, halfWidth: 1.8 };
assert.equal(groundPressAt(0, 0, hull), 1, 'full press under the belly');
assert.equal(groundPressAt(3.0, 1.5, hull), 1, 'and under the tracks');
assert.ok(groundPressAt(3.4, 0, hull) > 0.8 && groundPressAt(3.4, 0, hull) < 0.9, 'the skirt is still pressed hard');
assert.ok(groundPressAt(3.4 + GROUND_PRESSURE_FEATHER_M, 0, hull) < 1e-6, 'the feather ends past the skirt');
assert.equal(groundPressAt(0, 4, hull), 0, 'abeam, outside');
assert.equal(groundPressAt(0, 0, { ...hull, strength: 0.5 }), 0.5, 'strength scales the press');
assert.equal(groundPressAt(0, 3.0, { ...hull, dirX: 0, dirZ: 1 }), 1, 'the footprint turns with the heading');
assert.equal(groundPressAt(0, 2, { x: 0, z: 0 }), 1, 'defaults: 3.4 × 1.8, facing +Z, full strength');
assert.ok(groundPressAt(2, 0, { x: 0, z: 0 }) < 0.5, 'two metres abeam of a 1.8 m half width is past the skirt');

// 7. The world wiring: main.ts publishes every hull, the world hands them to the sward.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.ok(main.includes('const groundSources: GroundDisturbance[] = [];') && main.includes('wakeWorld.setGroundDisturbances?.(groundSources);'),
  'main.ts publishes the hulls\' footprints each battle frame');
assert.ok(main.includes('if (groundSources.length < 8) {'), 'eight slots, every vehicle in water or not');
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.ok(map.includes('setGroundDisturbances(sources) { tallGrass.setDisturbances(sources); },'), 'the world routes them to the tall grass');

console.log('groundPressure.selftest: world-anchored press field — gates, targets, step shader, packing, stepping, clear / dispose, the CPU twin and the world wiring pinned');
