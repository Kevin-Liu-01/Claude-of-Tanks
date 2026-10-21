import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  createNightLightingRuntime, registerNightLightEmitters, registerNightBeamClearance, bindNightOwnGunUniforms,
  NIGHT_OWN_GUN_GLSL, HEADLIGHT_LOW_BEAM_DROP, HEADLIGHT_CONE_RAD, BUILDING_FOCUS_AHEAD_M,
} from './nightLightingRuntime.ts';
import { graphLabels } from '../../tools/receipt-kit.test-support.mjs';
// (EF.11) a driving lamp's beam is its authored aim dropped to a low beam in its vehicle's frame
const lowBeam = (d) => { const v = new THREE.Vector3(...d); v.y -= HEADLIGHT_LOW_BEAM_DROP * Math.hypot(v.x, v.z); return v.normalize(); };

const scene = new THREE.Scene(), player = new THREE.Group(), turret = new THREE.Group();
const building = new THREE.Group(), otherTank = new THREE.Group();
scene.add(player, building, otherTank); player.add(turret);
player.position.set(10, 2, 15); building.position.set(13, 0, 14);
const white = new THREE.MeshStandardMaterial({ emissive: 0x111720, emissiveIntensity: .4 });
const red = new THREE.MeshStandardMaterial({ emissive: 0x7c2410, emissiveIntensity: .23 });
const warm = new THREE.MeshStandardMaterial({ emissive: 0x090807, emissiveIntensity: .31 });
const materials = [white, red, warm];
const authored = materials.map(material => ({ material, color: material.emissive.clone(),
  identity: material.emissive, intensity: material.emissiveIntensity, version: material.version }));
const left = { kind: 'headlight', position: [-.7, .9, 2.6], direction: [0, -.1, 1],
  intensity: 95, range: 48, emission: { material: white, color: 0xffe2ad, intensity: 2 } };
const right = { ...left, position: [.7, .9, 2.6] };
registerNightLightEmitters(player, [left, right]);
registerNightLightEmitters(turret, [{ kind: 'shtora', position: [.6, .4, 1],
  intensity: 300, emission: { material: red, color: 0xff1708, intensity: 1.4 } }]);
registerNightLightEmitters(building, [{ kind: 'building', position: [0, 3, 0],
  color: 0xffdca0, range: 18, intensity: 32,
  emission: { material: warm, color: 0xffdca0, intensity: 1.1 } }]);
registerNightLightEmitters(otherTank, [{ kind: 'headlight', position: [0, 0, 0], intensity: 70 }]);
let alive = true;
const roots = [{ root: player, priority: 1, isActive: () => alive }, { root: building }, { root: otherTank }];
const budget = { spotLights: 2, pointLights: 1 };
const runtime = createNightLightingRuntime(scene, budget);
const objects = [...runtime.group.children], lights = [...runtime.lights];
const positions = lights.map(light => light.position), lightColors = lights.map(light => light.color);
assert.equal(scene.children.includes(runtime.group), false, 'constructor does not light Garage');
assert.equal(lights.length, 3); assert.equal(lights.filter(light => light.isSpotLight).length, 2);
assert.equal(lights.filter(light => light.isPointLight).length, 1);
assert.ok(lights.every(light => !light.castShadow && light.shadow?.map == null));
budget.spotLights = 0; budget.pointLights = 0;
assert.equal(runtime.lights.length, 3, 'budget is fixed at construction, not a live mutable knob');

function assertAuthored() {
  for (const entry of authored) {
    assert.strictEqual(entry.material.emissive, entry.identity);
    assert.deepEqual(entry.material.emissive, entry.color);
    assert.equal(entry.material.emissiveIntensity, entry.intensity);
    assert.equal(entry.material.version, entry.version, 'night emission never marks shader dirty');
  }
}
function near(actual, expected, message) {
  assert.ok(actual.distanceTo(expected) < 1e-10, `${message}: ${actual.toArray()} != ${expected.toArray()}`);
}

try {
  runtime.prepare(roots, false); runtime.update(new THREE.Vector3());
  assert.equal(runtime.emitterCount, 0); assertAuthored();
  runtime.prepare(roots, true);
  assert.equal(runtime.emitterCount, 5); assert.ok(runtime.group.parent === scene);
  let sceneAdds = 0; scene.addEventListener('childadded', () => sceneAdds++);
  const reference = new THREE.Vector3();
  runtime.update(reference);
  assert.ok(lights.slice(0, 2).every(light => light.intensity === 95), 'local player pair wins over closer enemy lamp');
  assert.equal(lights[2].intensity, 32, 'Shtora cannot consume the building point pool');
  assert.equal(white.emissiveIntensity, 2); assert.equal(red.emissiveIntensity, 1.4);
  assert.equal(warm.emissiveIntensity, 1.1);
  near(lights[0].position, player.localToWorld(new THREE.Vector3(...left.position)), 'headlamp starts on authored lens');
  const expectedDirection = lowBeam(left.direction).transformDirection(player.matrixWorld);
  near(lights[0].target.position.clone().sub(lights[0].position), expectedDirection, 'world-space beam follows authored direction');

  player.rotation.set(.2, .7, Math.PI); turret.rotation.y = -.8;
  for (let i = 0; i < 100; i++) runtime.update(reference);
  // Both player lamps remain selected; the nearest slot order may swap.
  const expectedPositions = [left, right].map(emitter => player.localToWorld(new THREE.Vector3(...emitter.position)));
  assert.ok(lights.slice(0, 2).every(light => expectedPositions.some(position => position.distanceTo(light.position) < 1e-10)),
    'rolled hull transforms its lamps instead of leaving a floating upright beam');
  for (const light of lights.slice(0, 2)) {
    near(light.target.position.clone().sub(light.position),
      lowBeam(left.direction).transformDirection(player.matrixWorld), 'rolled light direction');
  }
  assert.equal(sceneAdds, 0, 'no per-update scene additions');
  // (EF.11) the low beam's cone: its upper edge about 11 degrees over the horizon for an authored -0.08 slope, so a barrel
  // 1 m over the lamps reaches no closer than its last 0.5 m to the cone (the rest of the barrel, steeper, sits outside)
  assert.ok(lights[0].angle === HEADLIGHT_CONE_RAD && HEADLIGHT_CONE_RAD < .43, 'a narrower cone');
  { const up = Math.atan(-.08 - HEADLIGHT_LOW_BEAM_DROP) + HEADLIGHT_CONE_RAD; assert.ok(up < Math.atan(1 / 4.5), `the cone's upper edge ${(up * 180 / Math.PI).toFixed(1)} deg passes under the barrel`); }
  assert.deepEqual(graphLabels(runtime.group.children), graphLabels(objects), 'constant night light/target object count');
  assert.deepEqual(graphLabels(runtime.lights), graphLabels(lights));
  lights.forEach((light, index) => {
    assert.strictEqual(light.position, positions[index]); assert.strictEqual(light.color, lightColors[index]);
  });

  alive = false; runtime.update(reference);
  assert.ok(lights.slice(0, 2).every(light => light.intensity !== 95), 'destroyed player cannot retain active beams');
  assert.equal(white.emissiveIntensity, authored[0].intensity);
  assert.equal(red.emissiveIntensity, authored[1].intensity, 'destroyed Shtora restores authored material');
  alive = true; player.visible = false; runtime.update(reference);
  assert.equal(white.emissiveIntensity, authored[0].intensity, 'hidden/unspotted parent cannot reveal lamp glow');
  player.visible = true; runtime.update(reference); assert.equal(white.emissiveIntensity, 2);
  player.removeFromParent(); runtime.update(reference);
  assert.equal(white.emissiveIntensity, authored[0].intensity, 'detached pooled tank cannot leak a light');
  scene.add(player); runtime.update(reference);
  building.visible = false; runtime.update(reference);
  assert.equal(lights[2].intensity, 0); assert.equal(warm.emissiveIntensity, authored[2].intensity);
  building.visible = true;
  runtime.update(reference, false);
  assert.ok(lights.every(light => light.intensity === 0)); assertAuthored();
  assert.ok(runtime.group.parent === scene, 'temporary inactive render does not re-key light count');
  runtime.update(reference); assert.equal(white.emissiveIntensity, 2);
  runtime.reset(); assertAuthored(); assert.ok(runtime.group.parent === null);
  assert.equal(runtime.emitterCount, 0);
  for (let i = 0; i < 16; i++) {
    runtime.prepare(roots, true); runtime.update(reference); runtime.prepare(roots, false); assertAuthored();
  }
  runtime.prepare(roots, true); runtime.update(reference); runtime.dispose(); assertAuthored();
  assert.ok(runtime.group.parent === null); assert.equal(runtime.group.children.length, 0);
  runtime.dispose(); runtime.reset(); runtime.update(reference);
  assert.throws(() => runtime.prepare(roots, true), /disposed/);
} finally { runtime.dispose(); }

// Semantic admission and transactional failure: no untagged glass mutation,
// aliases with conflicting intended emission fail rather than flickering.
const alias = new THREE.Group(); scene.add(alias);
registerNightLightEmitters(alias, [{ kind: 'marker', position: [0, 0, 0],
  emission: { material: white, color: 0xff0000, intensity: 1 } },
{ kind: 'marker', position: [1, 0, 0], emission: { material: white, color: 0x00ff00, intensity: 1 } }]);
const limited = createNightLightingRuntime(scene, { spotLights: 1, pointLights: 1 });
assert.throws(() => limited.prepare([{ root: alias }], true), /conflicting/);
assert.equal(limited.emitterCount, 0); assert.ok(limited.group.parent === null); assertAuthored();
assert.equal(limited.lights.length, 2, 'immutable constrained constructor budget is supported');
let lampIntact = true;
const lateBuilding = new THREE.Group(); scene.add(lateBuilding);
registerNightLightEmitters(lateBuilding, [{ kind: 'building', position: [0, 2, 0], intensity: 25,
  isActive: () => lampIntact, emission: { material: warm, color: 0xffdca0, intensity: 1.1 } }]);
limited.prepare([], true);
limited.appendRoot({ root: lateBuilding }); limited.appendRoot({ root: lateBuilding });
assert.equal(limited.emitterCount, 1, 'late registered roots are deduplicated without re-keying the light pool');
const lateLights = [...limited.lights];
limited.update(new THREE.Vector3()); assert.equal(limited.lights[1].intensity, 25);
lampIntact = false; limited.update(new THREE.Vector3());
assert.equal(limited.lights[1].intensity, 0, 'destroyed lamp retires independently from other props on its root');
assert.equal(warm.emissiveIntensity, authored[2].intensity);
assert.throws(() => limited.appendRoot({ root: alias }), /conflicting/);
assert.equal(limited.emitterCount, 1, 'invalid late registration cannot partially publish');
assert.deepEqual(graphLabels(limited.lights), graphLabels(lateLights), 'late actor registration never adds lights');
limited.reset(); limited.appendRoot({ root: lateBuilding });
assert.equal(limited.emitterCount, 0, 'day/Garage late construction cannot activate night lighting');
limited.dispose();
assert.throws(() => createNightLightingRuntime(scene, { spotLights: 9, pointLights: 1 }), /budget/);
assert.throws(() => createNightLightingRuntime(scene, { spotLights: 2, pointLights: 5 }), /budget/);
// 2026-09-18 (owner: "lights seem to only come from one headlight"): a headlight cluster has two pods per side, and
// with the camera offset to one flank the two nearest lamps were both on that side. One lamp per side of a vehicle:
// the second slot lights the OTHER headlight before a farther vehicle; the desktop budget (4 spots) then reaches the
// nearest other vehicle's pair.
{
  const cluster = new THREE.Group(); scene.add(cluster); cluster.position.set(0, 1, 0);
  const pod = (x) => ({ kind: 'headlight', position: [x, .9, 2.6], direction: [0, -.1, 1], intensity: 90, range: 42 });
  registerNightLightEmitters(cluster, [pod(-.72), pod(-.56), pod(.56), pod(.72)]);
  const neighbour = new THREE.Group(); scene.add(neighbour); neighbour.position.set(9, 1, 3);
  registerNightLightEmitters(neighbour, [pod(-.6), pod(.6)]);
  const two = createNightLightingRuntime(scene, { spotLights: 2, pointLights: 1 });
  const four = createNightLightingRuntime(scene, { spotLights: 4, pointLights: 2 });
  try {
    for (const runtime of [two, four]) {
      runtime.prepare([{ root: cluster, priority: 1 }, { root: neighbour }], true);
      runtime.update(new THREE.Vector3(1.4, 2, -4)); // chase camera offset to the right flank
    }
    const sides = (runtime) => runtime.lights.filter((light) => light.isSpotLight && light.intensity > 0)
      .map((light) => ({ side: Math.sign(light.position.x - (light.position.x > 4 ? 9 : 0)), vehicle: light.position.x > 4 ? 'neighbour' : 'cluster' }));
    const twoSides = sides(two);
    assert.equal(twoSides.length, 2);
    assert.deepEqual(twoSides.map((s) => s.vehicle), ['cluster', 'cluster'], 'both spots stay on the nearest vehicle');
    assert.deepEqual(twoSides.map((s) => s.side).sort(), [-1, 1], 'one lamp per side: left and right headlight both light');
    const fourSides = sides(four);
    assert.equal(fourSides.length, 4);
    assert.deepEqual(fourSides.filter((s) => s.vehicle === 'neighbour').map((s) => s.side).sort(), [-1, 1], 'the desktop budget lights both headlights of the next vehicle too');
    assert.equal(four.lights.filter((light) => light.isPointLight).length, 2);
  } finally { two.dispose(); four.dispose(); scene.remove(cluster, neighbour); }
}
// Release 227 (round 4; the critic: "the warm ground pool has the same position and shape in all five station states"): a
// weapon searchlight keeps its authored aim (no low-beam drop), lights its own narrow cone, and on a pool wider than one
// vehicle's two sides it takes a spot beside both of its vehicle's driving lamps; a two-spot pool keeps both on them.
{
  const tank = new THREE.Group(), station = new THREE.Group(); scene.add(tank); tank.add(station);
  tank.position.set(0, 1, 0); station.position.set(-.6, 1.4, -.3); station.rotation.y = .5;
  const pod = (x) => ({ kind: 'headlight', position: [x, .3, 2.6], direction: [0, -.1, 1], intensity: 90, range: 42 });
  registerNightLightEmitters(tank, [pod(-.7), pod(.7)]);
  registerNightLightEmitters(station, [{ kind: 'headlight', position: [.3, .1, .2], direction: [0, .02, 1], intensity: 2000, range: 100,
    searchlight: true, coneRad: .11 }]);
  const two = createNightLightingRuntime(scene, { spotLights: 2, pointLights: 1 });
  const four = createNightLightingRuntime(scene, { spotLights: 4, pointLights: 2 });
  try {
    for (const runtime of [two, four]) { runtime.prepare([{ root: tank, priority: 1 }], true); runtime.update(new THREE.Vector3(1, 3, -6)); }
    const lit = (runtime) => runtime.lights.filter((light) => light.isSpotLight && light.intensity > 0);
    assert.deepEqual(lit(two).map((light) => light.intensity), [90, 90], 'two spots: both driving lamps, no searchlight');
    assert.ok(lit(two).every((light) => light.angle === HEADLIGHT_CONE_RAD), 'driving lamps keep the low-beam cone');
    const beam = lit(four).find((light) => light.intensity === 2000);
    assert.ok(beam, 'four spots: the searchlight takes one');
    assert.equal(lit(four).filter((light) => light.intensity === 90).length, 2, 'beside both driving lamps');
    assert.equal(beam.angle, .11, 'in its own narrow cone');
    station.updateWorldMatrix(true, false);
    near(beam.target.position.clone().sub(beam.position), new THREE.Vector3(0, .02, 1).normalize().transformDirection(station.matrixWorld),
      'aimed as authored, turning with its station (no low-beam drop)');
    station.rotation.y = -.4; four.update(new THREE.Vector3(1, 3, -6)); station.updateWorldMatrix(true, false);
    near(beam.target.position.clone().sub(beam.position), new THREE.Vector3(0, .02, 1).normalize().transformDirection(station.matrixWorld),
      'the beam follows the station');
    const slot = four.lights.find((light) => light === beam);
    four.prepare([{ root: tank, priority: 1 }], true); four.update(new THREE.Vector3(1, 3, -6));
    assert.ok(four.lights.filter((light) => light.isSpotLight && light.intensity === 90).every((light) => light.angle === HEADLIGHT_CONE_RAD),
      'a slot that held the searchlight goes back to the low-beam cone with a driving lamp'); void slot;
  } finally { two.dispose(); four.dispose(); scene.remove(tank); }
  // Round 6 (the critic's UAPL-R5C-10): the lift belongs to the player's searchlight only; another vehicle's searchlight
  // 60 m off competes by distance and leaves the spots to a nearer vehicle's driving lamps.
  {
    const player = new THREE.Group(), near2 = new THREE.Group(), far = new THREE.Group(), farStation = new THREE.Group();
    for (const g of [player, near2, far]) scene.add(g);
    far.add(farStation); near2.position.set(0, 0, 20); far.position.set(0, 0, 60); farStation.position.set(-.6, 1.4, -.3);
    registerNightLightEmitters(player, [pod(-.7), pod(.7)]);
    registerNightLightEmitters(near2, [pod(-.7), pod(.7)]);
    registerNightLightEmitters(far, [pod(-.7), pod(.7)]);
    registerNightLightEmitters(farStation, [{ kind: 'headlight', position: [.3, .1, .2], direction: [0, .02, 1], intensity: 2000, range: 100,
      searchlight: true, coneRad: .11 }]);
    const pool = createNightLightingRuntime(scene, { spotLights: 4, pointLights: 2 });
    try {
      pool.prepare([{ root: player, priority: 1 }, { root: near2, priority: 0 }, { root: far, priority: 0 }], true);
      pool.update(new THREE.Vector3(0, 3, -6));
      const spots = pool.lights.filter((light) => light.isSpotLight && light.intensity > 0);
      assert.equal(spots.filter((light) => light.intensity === 2000).length, 0, 'a far non-player searchlight does not outrank a nearer vehicle');
      assert.equal(spots.filter((light) => light.intensity === 90).length, 4, 'the player and the nearer vehicle keep all four spots');
    } finally { pool.dispose(); for (const g of [player, near2, far]) scene.remove(g); }
  }
  assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [0, 0, 0], coneRad: .5 }]), /cone/);
  assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'marker', position: [0, 0, 0], searchlight: true }]), /searchlight/);
}
// (CN-7, 2026-10-20: "the main-gun barrel seen from the front shows as a bright white glowing tube") turret lamps
// flanking the gun put the tube 2-5 m into their cones. The beams stay exactly as authored; each lit lamp whose vehicle
// registered its gun publishes that gun's world capsule beside its seat, and the vehicle shader drops the lamp's light
// inside that capsule only. Another vehicle's lamp lights this gun as before.
{
  const tank = new THREE.Group(), hull = new THREE.Group(), turretRig = new THREE.Group(), gunRig = new THREE.Group();
  scene.add(tank); tank.add(hull, turretRig); turretRig.add(gunRig);
  tank.position.set(-40, .3, 30); tank.rotation.y = .9; tank.scale.setScalar(1.1);
  turretRig.position.set(0, 1.9, .3); gunRig.position.set(0, 0, .6);
  const capsule = { start: [0, 0, -.2], end: [0, 0, 5.3], radius: .12 };
  registerNightBeamClearance(tank, gunRig, capsule);
  const lamp = (x, y, z) => ({ kind: 'headlight', position: [x, y, z], direction: [0, 0, 1], intensity: 1200, range: 75 });
  const turretLamps = [lamp(-.68, .28, .85), lamp(.68, .28, .85)], hullLamps = [lamp(-1.35, 1.5, 2.85), lamp(1.35, 1.5, 2.85)];
  registerNightLightEmitters(turretRig, turretLamps);
  registerNightLightEmitters(hull, hullLamps);
  const stranger = new THREE.Group(); scene.add(stranger); stranger.position.set(-30, .3, 33);
  registerNightLightEmitters(stranger, [lamp(.7, 1.1, 2.6)]);
  const uniforms = {}; bindNightOwnGunUniforms(uniforms);
  // the shader's test (NIGHT_OWN_GUN_GLSL) on the CPU: does this spot's light reach this world point?
  const passes = (light, point) => {
    for (let k = 0; k < uniforms.uCotOwnGunCount.value; k++) {
      if (light.position.distanceToSquared(uniforms.uCotOwnGunSeat.value[k]) > 1e-4) continue;
      const a = uniforms.uCotOwnGunA.value[k], start = new THREE.Vector3(a.x, a.y, a.z);
      const segment = new THREE.Line3(start, uniforms.uCotOwnGunB.value[k]);
      return segment.closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point) > a.w;
    }
    return true;
  };
  const pool = createNightLightingRuntime(scene, { spotLights: 5, pointLights: 1 });
  try {
    pool.prepare([{ root: tank, priority: 1 }, { root: stranger }], true);
    for (const [yawDeg, pitchDeg] of [[0, 0], [0, -5], [0, 15], [25, 0], [-40, 3], [90, 0], [180, 0]]) {
      turretRig.rotation.y = yawDeg * Math.PI / 180; gunRig.rotation.x = -pitchDeg * Math.PI / 180;
      tank.updateMatrixWorld(true);
      pool.update(tank.localToWorld(new THREE.Vector3(0, 2, 8)));
      const label = `${yawDeg}/${pitchDeg}`;
      const spots = pool.lights.filter((light) => light.isSpotLight && light.intensity > 0);
      assert.equal(spots.length, 5, `${label}: both turret lamps, both hull lamps and the stranger's`);
      for (const light of spots) {
        assert.equal(light.angle, HEADLIGHT_CONE_RAD, `${label}: every beam keeps its cone`);
        assert.equal(light.intensity, 1200); assert.equal(light.distance, 75);
      }
      const own = spots.filter((light) => light.position.distanceTo(tank.position) < 7);
      const stray = spots.find((light) => light.position.distanceTo(stranger.position) < 7);
      assert.equal(own.length, 4);
      assert.equal(uniforms.uCotOwnGunCount.value, 4, `${label}: one record per lit lamp of the vehicle that registered its gun`);
      const seats = uniforms.uCotOwnGunSeat.value.slice(0, 4);
      for (const light of own) assert.ok(seats.some((seat) => seat.distanceTo(light.position) < 1e-12), `${label}: each own lamp's seat is published`);
      assert.ok(seats.every((seat) => seat.distanceTo(stray.position) > 1), "the stranger's lamp has no record");
      const start = gunRig.localToWorld(new THREE.Vector3(...capsule.start)), end = gunRig.localToWorld(new THREE.Vector3(...capsule.end));
      for (let k = 0; k < 4; k++) {
        const a = uniforms.uCotOwnGunA.value[k];
        near(new THREE.Vector3(a.x, a.y, a.z), start, `${label}: the capsule follows traverse and elevation`);
        near(uniforms.uCotOwnGunB.value[k], end, `${label}: the muzzle end`);
        assert.ok(Math.abs(a.w - .12 * 1.1) < 1e-12, 'the radius takes the vehicle scale');
      }
      // the tube's surface takes none of its own lamps' light, and all of the stranger's; the road and the hull do
      const tube = [];
      for (let z = 0; z < 5.31; z += .25) for (let q = 0; q < 8; q++) {
        tube.push(gunRig.localToWorld(new THREE.Vector3(.1 * Math.cos(q * Math.PI / 4), .1 * Math.sin(q * Math.PI / 4), z)));
      }
      for (const light of own) assert.ok(tube.every((point) => !passes(light, point)), `${label}: no own lamp lights the gun`);
      assert.ok(tube.every((point) => passes(stray, point)), `${label}: another vehicle's lamp still lights this gun`);
      const road = tank.localToWorld(new THREE.Vector3(0, -.3, 12)), glacis = tank.localToWorld(new THREE.Vector3(0, 1.5, 2.4));
      for (const light of own) assert.ok(passes(light, road) && passes(light, glacis), `${label}: the beam keeps the road and the hull`);
    }
    pool.prepare([{ root: stranger }], true); pool.update(stranger.position);
    assert.equal(uniforms.uCotOwnGunCount.value, 0, 'a frame with no registered gun publishes no record');
  } finally { pool.dispose(); scene.remove(tank, stranger); }
  assert.throws(() => registerNightBeamClearance(tank, gunRig, { ...capsule, start: [0, NaN, 0] }), /finite/);
  assert.throws(() => registerNightBeamClearance(tank, gunRig, { ...capsule, radius: 2.5 }), /radius/);
  // the shader: the wrapper reads three's own spot light first, then renames every later call to itself
  const wrapper = NIGHT_OWN_GUN_GLSL.indexOf('void cotOwnGunSpotLightInfo('), call = NIGHT_OWN_GUN_GLSL.indexOf('getSpotLightInfo( spotLight');
  const rename = NIGHT_OWN_GUN_GLSL.indexOf('#define getSpotLightInfo cotOwnGunSpotLightInfo');
  assert.ok(NIGHT_OWN_GUN_GLSL.startsWith('#if NUM_SPOT_LIGHTS > 0') && wrapper >= 0 && wrapper < call && call < rename);
  assert.ok(NIGHT_OWN_GUN_GLSL.trimEnd().endsWith('#endif'));
}
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'glass', position: [0, 0, 0] }]), /kind/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [NaN, 0, 0] }]), /finite/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [0, 0, 0], direction: [0, 0, 0] }]), /nonzero/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [0, 0, 0], intensity: 2001 }]), /intensity/);
// (the looks lane, 228: Steinburg's streets dark at night) a town's street lamps share one instanced anchor and carry
// world positions: each takes a pooled point light of its own (the one-lamp-per-side rule is a vehicle's headlights'),
// two lamps in one place light it once, and the lamps ahead of the camera along its view take the lights
{
  const town = new THREE.Scene(), lamps = new THREE.Group(), lampMaterial = new THREE.MeshStandardMaterial();
  town.add(lamps);
  const at = [[-150, 4, 0], [-124, 4, 9], [-124.5, 4, 9.2], [-175, 4, 11], [-100, 4, -6]];
  registerNightLightEmitters(lamps, at.map((position) => ({ kind: 'building', position, color: 0xffc889, intensity: 90, range: 17,
    emission: { material: lampMaterial, color: 0xffffff, intensity: 3 } })));
  const pool = createNightLightingRuntime(town, { spotLights: 1, pointLights: 2 });
  pool.prepare([{ root: lamps }], true);
  const lit = () => pool.lights.filter((light) => light.isPointLight && light.intensity > 0).map((light) => light.position.toArray().map(Math.round).join(','));
  pool.update(new THREE.Vector3(-156, 8, 2), true);
  assert.equal(lit().length, 2, 'two street lamps on one anchor and one side of the origin both take a point light');
  pool.update(new THREE.Vector3(-156, 8, 2), true, new THREE.Vector3(1, -0.25, -0.1));
  assert.deepEqual(lit().sort(), ['-124,4,9', '-150,4,0'], `the lamps within reach of the point ${BUILDING_FOCUS_AHEAD_M} m ahead along the view light, once each: ${lit()}`);
  pool.update(new THREE.Vector3(-156, 8, 2), true, new THREE.Vector3(-1, -0.25, 0.3));
  assert.ok(lit().includes('-175,4,11'), `looking back up the street, the lamp behind the camera lights: ${lit()}`);
  pool.dispose(); lampMaterial.dispose();
}

const source = readFileSync(new URL('./nightLightingRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /Math\.random\(|performance\.|setTimeout\(|requestAnimationFrame\(|needsUpdate\s*=/);
assert.doesNotMatch(source, /from ['"].*(?:quality|fleet|tankFactory)/, 'runtime stays independent of fleet and quality overrides');
for (const material of materials) material.dispose();
console.log('nightLightingRuntime self-test: bounded lights, authored emission, visibility/death, rolled poses, exact reset and disposal PASS');
