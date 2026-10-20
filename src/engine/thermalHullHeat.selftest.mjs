// thermalHullHeat.selftest.mjs — (item fx-ir-hull-heat-229, the coordinator: "close up in the IR/thermal lens a live hull is
// a flat white slab: the heat signal saturates") a hull's heat map in the heat lens: the engine deck and exhaust end
// hottest (round the damage model's engine box, up through the deck), the running gear warm after movement (the drive
// heat, by the hull's speed on the simulation clock), the barrel warming with each shot and cooling (the gun heat, from
// `shell:fired` on the shots' own simulation times), the hull sides cooler; a hull small on the screen keeps the old flat
// white-hot. Render-only: per-vehicle stand-ins on one heat program; the shared fleet material is never touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import {
  createThermalVehicles, driveHeatStep, gunHeatAt, gunShotHeat, heatPartOf, DRIVE_COOL_S, DRIVE_HOT_MPS, DRIVE_WARM_S,
  GUN_COOL_S, HEAT_ENGINE, HEAT_ENGINE_R, HEAT_FAR, HEAT_GEAR_COLD, HEAT_GEAR_HOT, HEAT_GUN_COLD, HEAT_GUN_HOT, HEAT_HULL,
  HEAT_NEAR_A, HEAT_NEAR_B,
} from './thermalVehicles.ts';

// ---- 1. the parts, by the visual's rig and names ----
const named = (name, parent) => { const g = new Group(); g.name = name; parent?.add(g); return g; };
const mesh = (name, parent, material) => { const m = new Mesh(new BoxGeometry(), material); m.name = name; parent.add(m); return m; };
const fleetMaterial = new MeshStandardMaterial({ color: 0x4a5a3a }), trackMaterial = new MeshStandardMaterial({ color: 0x222222 });
function hull() {
  const root = named('tank'), rigHull = named('rig_hull', root), turret = named('rig_turret', rigHull);
  const gun = named('rig_gun', turret), recoil = named('rig_recoil', gun);
  return {
    root,
    plate: mesh('hullPlates', rigHull, fleetMaterial),
    band: mesh('gearTrackBandL', rigHull, trackMaterial),
    wheels: mesh('a6SourcePairedWheelFacesL', rigHull, trackMaterial),
    spare: mesh('fitting_spareTrackLinks_detail', named('fitting_spareTrackLinks', rigHull), trackMaterial),
    turretTrack: mesh('turretTrack', turret, fleetMaterial),
    guard: mesh('hullTrackGuardL', rigHull, fleetMaterial),
    shell: mesh('turretShell', turret, fleetMaterial),
    barrel: mesh('tube', recoil, fleetMaterial),
  };
}
const h0 = hull();
assert.equal(heatPartOf(h0.plate, h0.root), 0, 'a hull plate: the hull');
assert.equal(heatPartOf(h0.band, h0.root), 1, 'a track band: the running gear');
assert.equal(heatPartOf(h0.wheels, h0.root), 1, 'a source wheel face: the running gear');
assert.equal(heatPartOf(h0.spare, h0.root), 0, 'spare track links on the hull are a fitting, not running gear');
assert.equal(heatPartOf(h0.turretTrack, h0.root), 0, 'a turret detail named track is the turret');
assert.equal(heatPartOf(h0.guard, h0.root), 0, 'a track guard is the hull\'s plate over the running gear');
assert.equal(heatPartOf(h0.shell, h0.root), 0, 'the turret');
assert.equal(heatPartOf(h0.barrel, h0.root), 2, 'the recoiling barrel: the gun');

// ---- 2. the stand-ins: per vehicle and part, one program; the shader on three's standard chunks ----
const ENGINE = { module: 'engine', min: [-1, 0.5, -3.8], max: [1, 1.75, -2] };
const actorOf = (id, h, team = 'enemy') => ({ id, team, visual: { root: h.root }, combat: { destroyed: false }, state: { speed: 0 },
  spec: { dims: { hullLengthM: 7.9 }, armor: { modules: [{ module: 'gun', min: [0, 0, 0], max: [1, 1, 1] }, ENGINE] } } });
const scene = new Group();
const A = actorOf('a', h0), h1 = hull(), B = actorOf('b', h1);
scene.add(h0.root, h1.root);
const heat = createThermalVehicles();
const take = (h) => ({ plate: h.plate.material, band: h.band.material, barrel: h.barrel.material, shell: h.shell.material });
const frame = (actors, active, timeS) => { heat.begin(actors, active, 'ally', timeS); const seen = actors.map((a) => take(a === A ? h0 : h1)); heat.end(); return seen; };
const compile = (m) => { const sh = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh); return sh; };
const [sa, sb] = frame([A, B], true, 10);
for (const m of [sa.plate, sa.band, sa.barrel, sb.plate]) {
  assert.ok(m !== fleetMaterial && m !== trackMaterial, 'every part takes a stand-in');
  assert.equal(m.customProgramCacheKey(), 'thermal-vehicle-v3', 'one heat program');
}
assert.ok(sa.plate !== sb.plate, 'each vehicle its own stand-ins (its own heat)');
assert.ok(sa.plate !== sa.barrel && sa.plate === sa.shell, 'per part, the same source and part sharing one');
assert.ok(h0.plate.material === fleetMaterial && fleetMaterial.emissive.r === 0, 'restored after the frame, the fleet material untouched');
const cp = compile(sa.plate), cg = compile(sa.band), cb = compile(sa.barrel), cB = compile(sb.plate);
assert.ok(cp.uniforms.uHeatK === cg.uniforms.uHeatK && cp.uniforms.uHeatInv === cb.uniforms.uHeatInv, 'a vehicle\'s parts share its heat uniforms');
assert.ok(cp.uniforms.uHeatK !== cB.uniforms.uHeatK, 'another vehicle has its own');
assert.deepEqual([cp.uniforms.uHeatPart.value, cg.uniforms.uHeatPart.value, cb.uniforms.uHeatPart.value], [0, 1, 2]);
assert.deepEqual(cp.uniforms.uHeatEng0.value.toArray().slice(0, 3), ENGINE.min, 'the engine: the damage model\'s module box');
assert.deepEqual(cp.uniforms.uHeatEng1.value.toArray().slice(0, 3), ENGINE.max);
assert.equal(cp.uniforms.uHeatK.value.w, 7.9, 'the hull\'s length');
assert.match(cp.vertexShader, /#include <project_vertex>\s*\{\s*vec4 heatW = vec4\( transformed, 1\.0 \);[\s\S]*#ifdef USE_INSTANCING\s*heatW = instanceMatrix \* heatW;\s*#endif\s*vHeatP = \( uHeatInv \* modelMatrix \* heatW \)\.xyz;/,
  'the vehicle-frame position, instancing included');
assert.match(cp.fragmentShader, /totalEmissiveRadiance = vec3\( cotHeatEmission\(\) \) \* \( 0\.62 \+ 0\.38 \* abs\( normal\.z \) \);/);
assert.match(cp.fragmentShader, /gl_FragColor\.a = /, 'the stand-ins still write the vehicle alpha');
// the uniforms follow the root: its inverse world matrix
h0.root.position.set(5, 0, -3); h0.root.rotation.y = 0.7; h0.root.updateMatrixWorld(true);
frame([A], true, 10.5);
const back = h0.root.matrixWorld.clone().multiply(cp.uniforms.uHeatInv.value);
assert.ok(back.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9), 'the vehicle frame: the root\'s inverse');

// ---- 3. the map, read through the grade (heat = smoothstep(1.55, 3.1, emission x the view factor 0.62 .. 1)) ----
// a mirror of cotHeatEmission, tied to the shader text below
const fs = cp.fragmentShader, g = (v) => v.toFixed(3).replace('.', '\\.');
for (const re of [
  new RegExp(`if \\( uHeatPart > 1\\.5 \\) e = ${g(HEAT_GUN_COLD)} \\+ ${g(HEAT_GUN_HOT)} \\* uHeatK\\.y;`),
  new RegExp(`else if \\( uHeatPart > 0\\.5 \\) e = ${g(HEAT_GEAR_COLD)} \\+ ${g(HEAT_GEAR_HOT)} \\* uHeatK\\.x;`),
  /float dy = max\( uHeatEng0\.y - vHeatP\.y, 0\.0 \) \+ max\( vHeatP\.y - uHeatEng1\.y - 0\.6, 0\.0 \);/,
  new RegExp(`e = ${g(HEAT_HULL)} \\+ ${g(HEAT_ENGINE)} \\* exp\\( -\\( dot\\( dxz, dxz \\) \\+ dy \\* dy \\) / ${g(HEAT_ENGINE_R * HEAT_ENGINE_R)} \\);`),
  new RegExp(`return mix\\( ${g(HEAT_FAR)}, e, vHeatNear \\) \\* uHeatK\\.z;`),
]) assert.match(fs, re, 'the shader is the map the mirror reads');
function emission(part, p, drive, gun, near = 1, scale = 1) {
  let e;
  if (part === 2) e = HEAT_GUN_COLD + HEAT_GUN_HOT * gun;
  else if (part === 1) e = HEAT_GEAR_COLD + HEAT_GEAR_HOT * drive;
  else {
    const c = [0, 1, 2].map((i) => (ENGINE.min[i] + ENGINE.max[i]) / 2), hh = [0, 1, 2].map((i) => (ENGINE.max[i] - ENGINE.min[i]) / 2);
    const dx = Math.max(Math.abs(p[0] - c[0]) - hh[0], 0), dz = Math.max(Math.abs(p[2] - c[2]) - hh[2], 0);
    const dy = Math.max(ENGINE.min[1] - p[1], 0) + Math.max(p[1] - ENGINE.max[1] - 0.6, 0);
    e = HEAT_HULL + HEAT_ENGINE * Math.exp(-(dx * dx + dz * dz + dy * dy) / (HEAT_ENGINE_R * HEAT_ENGINE_R));
  }
  return (HEAT_FAR + (e - HEAT_FAR) * near) * scale;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const seen = (e) => [smooth(1.55, 3.1, e * 0.62), smooth(1.55, 3.1, e)]; // the grazing and the facing face
const deck = seen(emission(0, [0, 2.0, -2.9], 0, 0)), rear = seen(emission(0, [0, 1.2, -4.1], 0, 0));
const side = seen(emission(0, [1.9, 1.2, 1.5], 0, 0)), turretTop = seen(emission(0, [0, 2.6, 0.5], 0, 0));
const gearCold = seen(emission(1, null, 0, 0)), gearHot = seen(emission(1, null, 1, 0));
const gunCold = seen(emission(2, null, 0, 0)), gunHot = seen(emission(2, null, 0, 1));
assert.ok(deck[0] === 1 && rear[0] === 1, `the engine deck and its exhaust end white-hot at any angle (${deck[0]}, ${rear[0]})`);
assert.ok(side[1] <= 0.45 && turretTop[1] <= 0.45, `the hull sides and the turret cooler (${side[1].toFixed(2)}, ${turretTop[1].toFixed(2)} facing)`);
assert.ok(gearCold[1] === 0 && gearHot[0] >= 0.6, `the running gear cold at rest, warm after driving (${gearHot[0].toFixed(2)} grazing)`);
assert.ok(gunCold[1] <= 0.1 && gunHot[0] === 1, `the barrel cold, white-hot after a run of shots`);
// far: the old flat white-hot hull (emission HEAT_FAR, the old hostile 4), whatever the map
for (const [part, p] of [[0, [1.9, 1.2, 1.5]], [1, null], [2, null]]) assert.equal(emission(part, p, 0, 0, 0), HEAT_FAR);
// the span: the AC-130 lens (55 deg / 3.6), a 7.9 m hull: the map close, flat white far
const span = (rangeM, fovDeg = 55 / 3.6, lengthM = 7.9) => 0.5 * (1 / Math.tan(fovDeg * Math.PI / 360)) * lengthM / rangeM;
const nearAt = (r) => smooth(HEAT_NEAR_A, HEAT_NEAR_B, span(r));
assert.ok(nearAt(250) >= 0.8, `at 250 m the map reads (${nearAt(250).toFixed(2)})`);
assert.ok(nearAt(450) <= 0.1, `at 450 m the hull is the flat white-hot of old (${nearAt(450).toFixed(2)})`);

// ---- 4. the heats: on the simulation clock, deterministic ----
// drive: warming toward |speed| / DRIVE_HOT_MPS over DRIVE_WARM_S, cooling over DRIVE_COOL_S, the frame rate only sampling
const integrate = (hz, seconds, speed, from = 0) => { let d = from; for (let i = 0; i < seconds * hz; i++) d = driveHeatStep(d, speed, 1 / hz); return d; };
const warm60 = integrate(60, 25, DRIVE_HOT_MPS), warm24 = integrate(24, 25, DRIVE_HOT_MPS);
assert.ok(Math.abs(warm60 - (1 - Math.exp(-1))) < 1e-9 && Math.abs(warm60 - warm24) < 1e-9, 'one time constant to 63 %, at any frame rate');
const cool = integrate(60, DRIVE_COOL_S, 0, 1);
assert.ok(Math.abs(cool - Math.exp(-1)) < 1e-9, 'cooling slower than warming');
// gun: a shot by its calibre, cooling over GUN_COOL_S
assert.ok(gunShotHeat(120) > gunShotHeat(30), 'a heavy gun heats more a shot');
assert.ok(Math.abs(gunHeatAt(0.5, 10, 10 + GUN_COOL_S) - 0.5 / Math.E) < 1e-12 && gunHeatAt(0.5, 10, 9) === 0);
// the runtime: A drives at speed for 25 s with the lens down, B stands; A fires twice
A.state.speed = DRIVE_HOT_MPS;
for (let t = 11; t <= 36; t += 1 / 60) frame([A, B], false, t);
heat.noteShot('a', 30, 120); heat.noteShot('a', 32, 120); heat.noteShot(undefined, 32, 120); heat.noteShot('x', NaN, 120);
frame([A, B], true, 36);
const kA = cp.uniforms.uHeatK.value, kB = cB.uniforms.uHeatK.value;
assert.ok(kA.x > 0.55 && kA.x < 0.65, `the lens raised after 25 s of driving sees warm running gear (${kA.x.toFixed(3)})`);
assert.equal(kB.x, 0, 'the standing hull\'s are cold');
const g2 = (gunShotHeat(120) * Math.exp(-2 / GUN_COOL_S) + gunShotHeat(120)) * Math.exp(-4 / GUN_COOL_S);
assert.ok(Math.abs(kA.y - g2) < 1e-9, `its barrel warmed by two shots, cooling since (${kA.y.toFixed(3)})`);
assert.equal(kB.y, 0);
// the same history, a second runtime at another frame rate: the same heats
const h2 = hull(), C = actorOf('a', h2), heat2 = createThermalVehicles();
scene.add(h2.root);
heat2.begin([C], false, 'ally', 10); heat2.end(); heat2.begin([C], false, 'ally', 10.5); heat2.end(); // A's first two frames, at rest
C.state.speed = DRIVE_HOT_MPS;
for (let t = 11; t <= 36; t += 1 / 24) { heat2.begin([C], false, 'ally', t); heat2.end(); }
heat2.noteShot('a', 30, 120); heat2.noteShot('a', 32, 120);
heat2.begin([C], true, 'ally', 36); const kC = compile(h2.plate.material).uniforms.uHeatK.value; heat2.end();
assert.ok(Math.abs(kC.x - kA.x) < 1e-9 && Math.abs(kC.y - kA.y) < 1e-12, `deterministic on the simulation clock: 60 and 24 Hz agree (${kA.x} vs ${kC.x})`);
// a new battle's clock: cold again
frame([A, B], true, 1);
assert.equal(kA.x, 0, 'a new battle starts the running gear cold');
assert.equal(kA.y, 0, 'and the barrel');
heat.noteShot('a', 2, 120);
frame([A, B], true, 2);
assert.ok(Math.abs(kA.y - gunShotHeat(120)) < 1e-12, 'a shot on the new clock heats from cold');

// ---- 5. the wiring: every shot reaches the heats ----
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /bus\.on\('shell:fired', \(payload\) => \{[\s\S]{0,200}combatWarmComposition\.thermalVehicles\.noteShot\(String\(Reflect\.get\(payload, 'shooterId'\) \?\? ''\),\s*Number\(Reflect\.get\(payload, 'timeS'\)\), Number\(Reflect\.get\(payload, 'caliberMm'\)\)\);/,
  'main.ts hands every shell:fired to the heats');
console.log(`thermalHullHeat: the engine deck and exhaust white-hot, the hull sides ${side[1].toFixed(2)}, running gear ${gearCold[1]} at rest to ${gearHot[0].toFixed(2)}+ after driving, `
  + `the barrel ${gunCold[1].toFixed(2)} to white by its shots; the map at 250 m (${nearAt(250).toFixed(2)}), flat white-hot at 450 m; on the simulation clock`);
