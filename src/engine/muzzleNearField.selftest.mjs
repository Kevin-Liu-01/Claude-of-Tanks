// (271) A gun's muzzle light reaches its own gun through a near field: the gun's forward faces take a bounded pulse, the
// hull front, the ground and other vehicles keep the light unchanged (muzzleNearField.ts).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  MUZZLE_NEAR_AHEAD_M, MUZZLE_NEAR_FADE_M, MUZZLE_NEAR_GLSL, MUZZLE_NEAR_RADIUS_M, MUZZLE_NEAR_SUN_K,
  attachMuzzleNearField, muzzleNearFieldFactor, muzzleNearRadiusM, publishMuzzleNearField, releaseMuzzleNearField,
} from './muzzleNearField.ts';

/** The shared uniforms, as a lit program binds them. */
const sharedUniforms = () => { const shader = { uniforms: {}, fragmentShader: '' }; attachMuzzleNearField(shader); return shader.uniforms; };

const SUN = 4.5, FLOOR = 0.0625;
/** three's falloff with the 0.25 m floor (renderer.ts), x the near-field factor: the light's irradiance per candela */
const reach = (offset, bore, radius) => muzzleNearFieldFactor(offset, bore, radius) / Math.max(offset.lengthSq(), FLOOR);

// --- (272) the near field starts unpublished. This block runs before anything in this process publishes: three's
// `new Vector4()` is (0, 0, 0, 1), which read as a published 1 m near field at the origin on the default bore with no
// owner, so no release could clear it.
{
  const uniforms = sharedUniforms();
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 0, "before any publish no gun's near field is published");
  releaseMuzzleNearField({});
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 0, 'a release with nothing published leaves it unpublished');
  const owner = {};
  publishMuzzleNearField(owner, new THREE.Vector3(1, 2, 3), new THREE.Vector3(1, 0, 0), 2.5);
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 2.5, 'a publish binds its radius');
  releaseMuzzleNearField(owner);
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 0, "its owner's release unpublishes it");
}

// --- the radius: the peak's irradiance on the gun is MUZZLE_NEAR_SUN_K x the sun, a night sun counts as a dusk one
{
  const peak = 460 * 0.976 * 0.521; // a 120 mm gun's pulse at its envelope's top
  const r = muzzleNearRadiusM(peak, SUN);
  assert.ok(Math.abs(peak / (r * r) - MUZZLE_NEAR_SUN_K * SUN) < 1e-9, 'the radius puts the peak at the cap');
  assert.ok(r > 3 && r < 6.5, `a 120 mm gun's near field reaches back to its mantlet (${r.toFixed(2)} m)`);
  assert.equal(muzzleNearRadiusM(peak, 0.3), muzzleNearRadiusM(peak, 2), 'a moonlit flash keeps a dusk sun on its gun');
  assert.equal(muzzleNearRadiusM(0, SUN), 0); assert.equal(muzzleNearRadiusM(NaN, SUN), 0);
  assert.ok(muzzleNearRadiusM(peak, NaN) > 0, 'an unknown sun falls back to the floor');
}

// --- the bound, on a 2A7V-like gun: light at the origin, line of fire +Z, the gun behind it
{
  const bore = new THREE.Vector3(0, 0, 1);
  const peak = 460 * 0.976 * 0.521, radius = muzzleNearRadiusM(peak, SUN), cap = MUZZLE_NEAR_SUN_K * SUN;
  const p = new THREE.Vector3();
  // every point of the gun (behind the light, within the capsule) takes at most the cap at the pulse's peak
  let most = 0;
  for (let back = -MUZZLE_NEAR_AHEAD_M; back <= 8; back += 0.01) {
    for (const r of [0, 0.05, 0.12, 0.2, 0.28, MUZZLE_NEAR_RADIUS_M]) {
      p.set(r, 0, -back);
      most = Math.max(most, peak * reach(p, bore, radius));
    }
  }
  assert.ok(most <= cap * (1 + 1e-9), `the gun's brightest face takes ${(most / SUN).toFixed(2)} suns (cap ${MUZZLE_NEAR_SUN_K})`);
  // without the bound the nearest collar 7 cm away takes hundreds of suns; with it, a warm pulse still reaches it
  p.set(0.2, 0, 0.07 - 0.15);
  assert.ok(peak / Math.max(p.lengthSq(), FLOOR) / SUN > 100, 'the unbounded near field clips');
  assert.ok(peak * reach(p, bore, radius) / SUN > 0.8 * MUZZLE_NEAR_SUN_K, 'the bounded collar keeps most of the cap');
  // the pulse falls with distance down the gun (never a dark band before a bright one) and joins the bare light past it
  let last = Infinity;
  for (let back = 0; back <= 10; back += 0.02) {
    p.set(0, 0.1, -back);
    const e = reach(p, bore, radius);
    assert.ok(e <= last * (1 + 1e-12), `down the bore the light only falls (at ${back.toFixed(2)} m)`);
    last = e;
  }
  p.set(0, 0, -1.6 * radius);
  assert.ok(muzzleNearFieldFactor(p, bore, radius) > 0.98, 'past the near field the gun takes the bare light');
  // the capsule's skin fades: no step across it
  let step = 0;
  for (let r = 0; r < MUZZLE_NEAR_RADIUS_M + MUZZLE_NEAR_FADE_M + 0.1; r += 0.002) {
    const a = muzzleNearFieldFactor(p.set(r, 0, -1.5), bore, radius), b = muzzleNearFieldFactor(p.set(r + 0.002, 0, -1.5), bore, radius);
    step = Math.max(step, Math.abs(a - b));
  }
  assert.ok(step < 0.02, `the capsule fades out over its skin (largest 2 mm step ${step.toFixed(4)})`);
  // the hull front below the gun, the ground, a neighbour beside it and anything ahead of the muzzle keep the bare light
  const kept = [[0, -1.0, -3.5], [0, -2.2, 0], [0, -2.2, -4], [2.5, -0.5, -1.5], [-3, 0, 1], [0, 0, 0.6], [0, 0.3, 2]];
  for (const [x, y, z] of kept) assert.equal(muzzleNearFieldFactor(p.set(x, y, z), bore, radius), 1, `(${x}, ${y}, ${z}) keeps its light`);
  assert.equal(muzzleNearFieldFactor(p.set(0, 0, -1), bore, 0), 1, 'no published pulse, no bound');
}

// --- the shared uniforms: one owner's pulse at a time, released only by its owner
{
  const uniforms = sharedUniforms();
  const a = {}, b = {};
  publishMuzzleNearField(a, new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 2), 4);
  assert.deepEqual(uniforms.uCotMuzzleSeat.value.toArray(), [1, 2, 3, 4]);
  assert.deepEqual(uniforms.uCotMuzzleBore.value.toArray(), [0, 0, 1], 'the line of fire is published unit length');
  releaseMuzzleNearField(b);
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 4, "another owner's release leaves the live pulse");
  releaseMuzzleNearField(a);
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 0);
  publishMuzzleNearField(a, new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(0, 0, 1), 4);
  assert.equal(uniforms.uCotMuzzleSeat.value.w, 0, 'a non-finite seat publishes no bound');
}

// --- the shader: three's own point light first, then the near field on the published pulse's light; every
// cascade-shadow material (lighting.ts setupShadowMaterial) carries it after lights_pars_begin, a vehicle's with its own
// hook after it
{
  const wrapper = MUZZLE_NEAR_GLSL.indexOf('void cotMuzzleNearPointLightInfo('), call = MUZZLE_NEAR_GLSL.indexOf('getPointLightInfo( pointLight');
  const rename = MUZZLE_NEAR_GLSL.indexOf('#define getPointLightInfo cotMuzzleNearPointLightInfo');
  assert.ok(MUZZLE_NEAR_GLSL.startsWith('#if NUM_POINT_LIGHTS > 0') && wrapper >= 0 && wrapper < call && call < rename);
  assert.ok(MUZZLE_NEAR_GLSL.trimEnd().endsWith('#endif'));
  for (const v of [MUZZLE_NEAR_RADIUS_M, MUZZLE_NEAR_RADIUS_M + MUZZLE_NEAR_FADE_M, -MUZZLE_NEAR_AHEAD_M, FLOOR]) {
    assert.ok(MUZZLE_NEAR_GLSL.includes(v.toFixed(4)), `the shader carries ${v.toFixed(4)}`);
  }
  const { createLighting } = await import('./lighting.ts');
  const { vehicleAmbientFloorHook } = await import('../vehicles/materials.ts');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  const rig = createLighting(scene, camera, new THREE.Vector3(1, 2, 1).normalize());
  try {
    const shared = sharedUniforms();
    for (const [label, extra] of [['a world material', null], ['a vehicle material', vehicleAmbientFloorHook]]) {
      const mat = new THREE.MeshStandardMaterial();
      rig.setupShadowMaterial(mat, extra);
      const lib = THREE.ShaderLib.standard;
      const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
      mat.onBeforeCompile(shader, null);
      const text = shader.fragmentShader, at = text.indexOf(MUZZLE_NEAR_GLSL);
      assert.ok(at > text.indexOf('#include <lights_pars_begin>') && at < text.indexOf('#include <lights_fragment_begin>'),
        `${label} wraps the point light before the lights loop`);
      assert.equal(text.split('void cotMuzzleNearPointLightInfo(').length - 1, 1, `${label} carries the wrapper once`);
      assert.equal(shader.uniforms.uCotMuzzleSeat, shared.uCotMuzzleSeat, `${label} shares the published uniforms`);
      assert.equal(shader.uniforms.uCotMuzzleBore, shared.uCotMuzzleBore);
      if (extra) assert.ok(text.includes('cotOwnGunSpotLightInfo'), 'the vehicle hook keeps its own (CN-7) wrapper beside it');
      rig.releaseShadowMaterial?.(mat); mat.dispose();
    }
  } finally { rig.dispose?.(); }
  // the fleet's own modules never reach it: no generated fleet output moves with the near field
  const materialsSource = await import('node:fs').then((fs) => fs.readFileSync(new URL('../vehicles/materials.ts', import.meta.url), 'utf8'));
  assert.ok(!materialsSource.includes('muzzleNearField'), 'the vehicle materials (the fleet core) never import the near field');
}

// --- the effects: a 120 mm shot publishes its gun's near field while its light burns, a rack's rocket none
{
  const { createRequire } = await import('node:module');
  const { createFx } = await import('../fx/effects.ts');
  const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
  try {
    const uniforms = sharedUniforms();
    const handlers = new Map();
    const bus = { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, emit(type, payload) { handlers.get(type)?.(payload); } };
    const scene = new THREE.Scene();
    const fx = createFx({ anisotropy: 4, scene }, { getHeightAt: () => 0 }, { seed: 91 });
    fx.bindBus(bus);
    scene.add(fx.group);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-12, 4, 6); camera.lookAt(0, 2, 4); camera.updateMatrixWorld();
    const yaw = 0.4, fwd = [Math.sin(yaw), 0, Math.cos(yaw)], muzzle = [fwd[0] * 5.5, 2.3, fwd[2] * 5.5];
    const shooter = { visual: {}, state: { pos: new THREE.Vector3(), yaw, speed: 6, yawRate: 0, verticalSpeed: 0 } };
    const resolve = (id) => (id === 'h1' ? shooter : null);
    let light = null;
    fx.group.traverse((o) => { if (o.name === 'fx:muzzleLight') light = o; });
    fx.update(1 / 60, [], camera, resolve);
    assert.equal(uniforms.uCotMuzzleSeat.value.w, 0, 'no pulse, no bound');
    bus.emit('shell:fired', { shellId: 1, shooterId: 'h1', shellType: 'APFSDS', caliberMm: 120, muzzlePos: muzzle, dir: fwd });
    let most = 0, radius = 0, steps = 0;
    for (let t = 0; t < 0.2; t += 1 / 240) {
      fx.update(1 / 240, [], camera, resolve);
      const seat = uniforms.uCotMuzzleSeat.value;
      if (light.intensity > 0) {
        steps++;
        assert.ok(seat.w > 0, `the burning pulse publishes its gun's near field (t=${t.toFixed(3)})`);
        assert.ok(new THREE.Vector3(seat.x, seat.y, seat.z).distanceTo(light.position) < 1e-6, 'the seat is the light, riding the bore');
        assert.ok(uniforms.uCotMuzzleBore.value.distanceTo(new THREE.Vector3(...fwd)) < 1e-9, 'the line of fire is the shot\'s');
        radius = seat.w;
        most = Math.max(most, light.intensity);
      } else assert.equal(seat.w, 0, `a spent pulse releases the bound (t=${t.toFixed(3)})`);
    }
    assert.ok(steps > 10 && most > 0, 'the pulse burned');
    // the radius was sized on the pulse's own peak: its brightest frame gives the gun MUZZLE_NEAR_SUN_K suns, give or take
    // the frames the sampling missed
    const capAtPeak = most / (radius * radius) / SUN;
    assert.ok(capAtPeak <= MUZZLE_NEAR_SUN_K * 1.001 && capAtPeak > MUZZLE_NEAR_SUN_K * 0.97, `peak on the gun ${capAtPeak.toFixed(3)} suns`);
    assert.equal(uniforms.uCotMuzzleSeat.value.w, 0);
    // a rocket's ignition lights its launcher as before: no gun claims the pulse
    bus.emit('shell:fired', { shellId: 2, shooterId: 'h1', shellType: 'HE', caliberMm: 122, muzzlePos: muzzle, dir: fwd, rocket: true });
    fx.update(1 / 60, [], camera, resolve); fx.update(1 / 60, [], camera, resolve);
    assert.ok(light.intensity > 0, 'the rocket lit the muzzle light');
    assert.equal(uniforms.uCotMuzzleSeat.value.w, 0, "a rocket's pulse is no gun's");
    console.log(`muzzleNearField.selftest: a 120 mm pulse bounds its gun at ${capAtPeak.toFixed(2)} suns within ${radius.toFixed(2)} m; hull, ground and neighbours unchanged`);
  } finally {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
  }
}
