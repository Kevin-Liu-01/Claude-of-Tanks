// Round 2 (2026-11-03 critic U33, Q15): the fx clock's rebase registry (fx/timeShift.ts) is complete by census, not by a
// list of names. Round one's receipt (clockRebase.selftest) checked that a fixed list of 18 parts was registered, so a
// stamp nobody registered passed it: the HE round records (burstAt, roundEndedAt, the waiting hull events' time), the
// struck buildings' dust load, the salvo crowd ring, the track skirts, the trail cadence and the exhaust bursts all kept
// their pre-rebase times. This receipt names none of them. It drives a live runtime (fx/effects.ts) with its clock at a
// time no other number in the runtime has (T0), rebases the clock (the Studio's reset at every load and seek, a capture's
// pin), and then walks everything the runtime can reach: its objects, arrays, maps, typed arrays, and the variables every
// closure of a src/ module holds (through node:inspector, the same view a debugger has). Any number still within the
// scenario's span of T0 is a stamp the rebase did not move, and the receipt fails naming where it lives (file, closure,
// variable). A new stamp a part keeps without registering its shift fails it the first time this scenario reaches it.
//
// The control: the walk finds the runtime's stamps the rebase moved (it sees into closures at all). (round 4 F7) The
// rebase pins the clock at T1, a second time no other number holds, so one walk after it finds both (round three walked
// before and after a rebase to 0); a stamp moved twice (near 2 T1 - T0) fails it too.
//
// (round 3 B5) The census covered only the paths its scenario drove (drones and the gunship were not driven), so an
// unregistered stamp on any other path passed it. Now the scenario's reach is measured too, with V8's block coverage
// taken through the same inspector session from before the fx modules load (what it counts, and the named few reads it
// does not reach yet, are below). A part that starts reading the clock on a path the scenario does not drive fails here
// until the scenario drives it, and then the census checks what it stamps. The scenario drives the gunship's rounds and
// missile, the auxiliary systems, a wire-guided missile, a building's stages and sections (a default-kit house), a
// crater event, the screenshot composer and the battle warm; (round 4 F6 review) a round drawn in flight past its
// record's bound.
// (round 3 B5, review round 1) What the reach check measures, exactly: the reads of the fx clock in src/fx (the
// runtime's particles.getTime(), fxClockNow(), a part's injected `now()`, and a call of any local bound to one of them,
// such as volumeMedia's `const o_now = o.now`), and the stores of a clock a part is handed as a `now` parameter
// (missileTrails.head, missileWires.tail, trailCadence.step: `x = now`). The reads it never runs are a named list, so a
// newly unreached read fails even when another is driven at the same time. (round 4 F7) It follows the clock handed under
// any other name (dronePresentation.begin(timeS), structureMask.collapse(startS), craterMarks.stamp(birth): measureReach),
// a list key names one site (its functions, and its place among sites of the same text), and a src/fx module with a
// clock read that the scenario never loads fails it. The drones are proven live as well. The carrier's dock is the
// production mount (missionAttachmentVisual, synced every frame as the battle's presentation does), and the
// receipt asserts that at the rebase one drone is in flight, one is flying home (past its grace), one flight home ended
// handed over to the dock, and one drone struck the ground and never flew home, so a stamp a drone's track or its
// flight home kept would be walked by the census.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { createRequire } from 'node:module';
import * as THREE from 'three';

// ---- coverage from before the fx modules load (a function compiled before it starts reports no blocks) ----
const session = new Session();
session.connect();
const call = (method, params = {}) => {
  let out, err;
  session.post(method, params, (e, r) => { err = e; out = r; });
  if (err) throw err;
  if (!out) throw new Error(`inspector ${method} answered asynchronously`);
  return out;
};
const urls = new Map();
session.on('Debugger.scriptParsed', (m) => urls.set(m.params.scriptId, m.params.url));
call('Debugger.enable');
call('Profiler.enable');
call('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
const { createFx } = await import('./effects.ts');
const { fxClockNow } = await import('./clock.ts');
const { DESTRUCTION_BUS_EVENTS } = await import('../sim/destructionEvents.ts');
const { damageSeed } = await import('../world/destructionKit.ts');
const { describeDefault } = await import('../world/destructionDefaultKit.ts');
const { createStructureDamageSeam } = await import('../world/structureDamageSeam.ts');
const { stampMapCraters, unpackMapCraterStamps } = await import('../world/mapCraters.ts');
const { createTerrainDeformation } = await import('../sim/terrainDeformation.ts');
const { syncMissionAttachment } = await import('../game/missionAttachmentVisual.ts');
const { missionAttachmentTurretPivot } = await import('../sim/missionAttachment.ts');
const { getSpec } = await import('../vehicles/specs.ts');

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

/** the scenario's clock: no other number the runtime holds lies within SPAN of it */
const T0 = 7_777_777;
const SPAN = 4000;
const SELF = import.meta.url;

// ---- a live runtime, every stamping path the scenario reaches ----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
// sand under the tracks (the media tier's skirt)
const heightField = { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), getTrackSurfaceAt: () => 2,
  getGroundType: () => 'medium', addWaterImpulse() {} };
// (round 3 B5) a two-storey house with the default kit's anatomy (structureStages.selftest's fixture) as building 7, whose
// wall the rounds strike and whose stages and sections the destruction core's events lay; the map's pre-placed craters
const housePart = (bucket, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); g.userData.bucket = bucket; return g; };
// two storeys of four faces each (structureStages.selftest's sectioned house), a roof and a chimney
const FACES = ['front', 'right', 'back', 'left'];
const faceBox = (name, k) => {
  const y = k * 3, t = 0.43;
  if (name === 'front') return housePart('regionalPlaster', 10, 3, t, 0, y, 4 - t / 2);
  if (name === 'back') return housePart('regionalPlaster', 10, 3, t, 0, y, -4 + t / 2);
  if (name === 'right') return housePart('regionalPlaster', t, 3, 8, 5 - t / 2, y, 0);
  return housePart('regionalPlaster', t, 3, 8, -5 + t / 2, y, 0);
};
const houseParts = {
  regionalPlaster: [0, 1].flatMap((k) => FACES.map((n) => faceBox(n, k))),
  regionalRoof: [housePart('regionalRoof', 10.6, 2.4, 8.6, 0, 6, 0)],
  regionalTrim: [housePart('regionalTrim', 0.6, 9.5, 0.6, 3, 0, -2)],
};
const housePlacement = { x: 0, y: 0, z: 8, yaw: 0 };
const houseAnatomy = describeDefault({ structureIdx: 7, mapId: 'verdant', builder: 'cottage', style: null, parts: houseParts, w: 10, d: 8,
  h: 8.4, placement: housePlacement, massClass: 'house', seed: damageSeed(2, 4000, -3000) });
function houseSpans(bucket, partClass, list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = flat.reduce((acc, g) => acc + g.getAttribute('position').count, 0);
  const arr = new Float32Array(n * 3);
  const ranges = [];
  let at = 0;
  for (const g of flat) {
    const p = g.getAttribute('position');
    ranges.push([at, p.count]);
    for (let i = 0; i < p.count; i++) arr.set([p.getX(i) + housePlacement.x, p.getY(i), p.getZ(i) + housePlacement.z], (at + i) * 3);
    at += p.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: bucket }));
  return ranges.map(([first, count]) => ({ mesh, geometryId: null, instanceId: null, position: geometry.getAttribute('position'), bucket,
    partClass, first, count }));
}
const houseSeamOf = (structureIdx, anatomy) => createStructureDamageSeam(structureIdx, 'cottage', null, anatomy, [
  ...houseSpans('regionalPlaster', 'wall', houseParts.regionalPlaster), ...houseSpans('regionalRoof', 'roof', houseParts.regionalRoof),
  ...houseSpans('regionalTrim', 'trim', houseParts.regionalTrim)]);
const houseSeam = houseSeamOf(7, houseAnatomy);
// building 8, the same house: its collapse comes after the P2 cascade (sections on), the mask's, not the fracture's bodies
const cascadeSeam = houseSeamOf(8, describeDefault({ structureIdx: 8, mapId: 'verdant', builder: 'cottage', style: null, parts: houseParts,
  w: 10, d: 8, h: 8.4, placement: housePlacement, massClass: 'house', seed: damageSeed(3, 4000, -3000) }));
const ground = createTerrainDeformation();
stampMapCraters(ground, unpackMapCraterStamps([[12, 30, 3.4, 0.8, 0.45, 1], [40, 30, 2, 0.5, 0.3, 0]]));
const world = { mapId: 'verdant', structureDamage: (structureId) => ({ 7: houseSeam, 8: cascadeSeam })[structureId] ?? null, clearCoverAt() {},
  groundOverlay: () => ground };
// (round 3 B5) the hulls the runtime resolves: a drone's carrier, the AC-130 and a hull that dies, and the hulls the
// auxiliary systems draw. (review r1) The carrier's dock is the production mount (missionAttachmentVisual), synced every
// frame before the effects as the battle's presentation does: a flight home resolves its dock frame, flies to it,
// descends its column and is handed over (a bare group there had no dock, so every flight home ended at once).
const carrierSpec = getSpec('m1a1_abrams_hc');
const carrierRoot = new THREE.Group();
{
  const turret = new THREE.Group();
  turret.name = 'rig_turret'; turret.position.set(...missionAttachmentTurretPivot(carrierSpec)); carrierRoot.add(turret);
  carrierRoot.position.set(10, 0, 0); carrierRoot.updateMatrixWorld(true);
}
const carrierView = { kind: 'drone', active: false, cooldownS: 25 };
const syncCarrier = (dt) => syncMissionAttachment(carrierRoot, carrierSpec, carrierView, false, dt);
syncCarrier(0);
const entities = new Map([
  ['carrier', { id: 'carrier', team: 'player', spec: { nation: 'USA' }, visual: { root: carrierRoot },
    state: { pos: new THREE.Vector3(10, 0, 0), yaw: 0 }, combat: { destroyed: false }, aerial: { active: false } }],
  ['gunship', { id: 'gunship', team: 'player', spec: { nation: 'USA' }, visual: { root: new THREE.Group() },
    state: { pos: new THREE.Vector3(0, 240, -200), yaw: 0.3 }, combat: { destroyed: false }, aerial: { active: true, kind: 'gunship', yaw: 0.3 } }],
  ['victim', { id: 'victim', team: 'enemy', spec: { nation: 'RUS' }, visual: { root: new THREE.Group() },
    state: { pos: new THREE.Vector3(-10, 0, 0), yaw: 0 }, combat: { destroyed: true }, aerial: { active: false } }],
]);
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  heightField, { seed: 5, world: () => world, resolveEntity: (shooterId) => entities.get(shooterId) ?? null,
    // the auxiliary systems run on the match's clock (main.ts: game.timeS; the Studio's timeline), never the fx clock
    auxiliaryEntities: () => entities.values(), auxiliaryTime: () => matchClockS, auxiliaryVisible: () => true });
scene.add(fx.group);
const handlers = new Map();
fx.bindBus({ on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; } });
const emit = (n, p) => { for (const f of handlers.get(n) ?? []) f(p); };
let matchClockS = 300;
// (review r1) the drones in the air: every frame writes them (a drone missing from a frame reads as a flight that ended)
const airborne = new Set();
const live = [];
const frames = (n, shells = [], dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    matchClockS += dt;
    syncCarrier(dt);
    live.length = 0;
    for (const shell of shells) live.push(shell);
    for (const shell of airborne) live.push(shell);
    fx.update(dt, live, camera, () => null);
    // the late pass asks every frame whether its soft media draw (the volume media's clock read)
    fx.group.userData.softParticles.isActive();
  }
};
const he = { shellType: 'HE', caliberMm: 125, munition: 'he', chargeKg: 3.4 };
let id = 9000;
const fired = (shellId) => emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9],
  shellName: '125 mm HE', ...he });
const groundBurst = (x) => { const s = id++; fired(s); emit('shell:expired', { shellId: s, pos: [x, 0, 0], hitTerrain: true, ...he }); };
const shells = [
  { id: 71, pos: new THREE.Vector3(0, 2, 10), vel: new THREE.Vector3(0, 0, 1500), spec: { tracer: 'TANK' }, shooterId: 'g', ageS: 0.05, distM: 60 },
  { id: 72, pos: new THREE.Vector3(4, 3, 20), vel: new THREE.Vector3(0, 0, 250), spec: { guided: true, tracer: 'ATGM' }, shooterId: 'g', ageS: 1, distM: 250 },
  // (round 3 B5) a machine gun's round that will strike the ground; (round 4 F7) its calibre makes it a machine gun's,
  // the first of its belt (traced), lit past its ignite distance
  { id: 74, pos: new THREE.Vector3(-6, 1, 14), vel: new THREE.Vector3(0, 0, 850), spec: { tracer: 'MG', caliberMm: 7.62 }, shooterId: 'g',
    ageS: 0.02, distM: 16 },
];
// (round 3 B5, review r1) the carrier's drones, all flying free (past the launch): one recalled beside the carrier (its
// flight home lands on the dock before the rebase), one that strikes the ground (no flight home), one still in flight at
// the rebase, and one recalled far out (still flying home at the rebase)
const drone = (droneId, x, y, z) => ({ id: droneId, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(0, 0, 18), spec: { tracer: 'DRONE' },
  shooterId: 'carrier', ageS: 6, distM: 60 });
const droneHome = drone(73, 13, 9, 6), droneStruck = drone(80, -4, 6, 24), droneFlying = drone(78, 30, 20, 60), droneAway = drone(79, -60, 25, 120);

fx.resetAll();
fx.resetClock(T0);
// (round 4 F6 review) a round drawn in flight past its record's bound (a peer's events stalled): a sweep finds it in the
// frame and restarts its record's bound (effects.ts ageShellRecords), so the record lives on into the rebase
{
  const stalled = { id: 81, pos: new THREE.Vector3(30, 40, -80), vel: new THREE.Vector3(0, 0, 300), spec: { tracer: 'TANK' }, shooterId: 'g',
    ageS: 0.1, distM: 30 };
  emit('shell:fired', { shellId: 81, shooterId: 'g', pos: [30, 40, -80], muzzlePos: [30, 40, -80], dir: [0, 0, 1], shellName: '125 mm HE', ...he });
  frames(12, [stalled], 1);
}
airborne.add(droneHome);
frames(3);
// an engine running 2.5 s (past the cold start), then a throttle-up: its billow burst
const stack = new THREE.Vector3(5, 2, 0), vel = new THREE.Vector3(0, 0, 6), fwd = new THREE.Vector3(0, 0, 1);
const track = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1);
for (let f = 0; f < 170; f++) {
  const z = f * 0.1;
  stack.set(5, 2, z); track.set(6, 0, z);
  fx.exhaust(stack, f < 150 ? 0.2 : 1, false, vel, fwd);
  fx.dust(track, dir, 1);
  // (review r1) the drone beside the carrier is recalled (it leaves the world unstruck: its flight home begins); a second
  // drone takes off for its strike
  if (f === 30) airborne.delete(droneHome);
  if (f === 121) airborne.add(droneStruck);
  frames(1, f > 120 ? shells : []);
}
// (round 4 F7) the machine gun's round strikes the ground the frame after its last (its record still live): its tracer's
// strike spray (projectileTracers strike: the sparks' t0; a record missing past its grace draws no strike)
emit('shell:expired', { shellId: 74, pos: [-6, 0, 18], hitTerrain: true, shellType: 'AP', caliberMm: 7.62 });
// a salvo's bursts on the ground, and rounds striking a building's wall
for (let k = 0; k < 3; k++) { groundBurst(k * 3); frames(2); }
for (let k = 0; k < 2; k++) {
  const s = id++; fired(s);
  emit('shell:expired', { shellId: s, pos: [0, 1.5, 3], hitTerrain: false, hitKind: 'prop', structureId: 7, normal: [0, 0, -1], ...he });
  frames(2);
}
// (round 3 B5) the paths the census had not driven
{
  // the tank round strikes the ground, the striking drone hits the ground (it never flies home), two more drones take
  // off, a wire-guided missile pays out its wire, and the AC-130 fires its howitzer and missile
  emit('shell:expired', { shellId: 71, pos: [0, 0, 26], hitTerrain: true, shellType: 'APFSDS', caliberMm: 120 });
  airborne.delete(droneStruck);
  emit('shell:expired', { shellId: 80, pos: [-4, 0, 24], hitTerrain: true, shellType: 'HEAT', caliberMm: 90 });
  airborne.add(droneFlying); airborne.add(droneAway);
  frames(4, [shells[1]]);
  emit('shell:fired', { shellId: 75, shooterId: 'g', muzzlePos: [3, 2, -10], pos: [3, 2, -10], dir: [0, 0, 1], shellType: 'HEAT',
    caliberMm: 120, shellName: '9M113 Konkurs', weaponSound: 'konkurs-launch', guided: true });
  frames(3, [shells[1]]);
  for (const [shellId, weaponSound] of [[76, 'gunship-howitzer'], [77, 'gunship-missile']]) {
    emit('shell:fired', { shellId, shooterId: 'gunship', muzzlePos: [0, 238, -200], pos: [0, 238, -200], dir: [0, -0.8, 0.6],
      shellType: 'HE', caliberMm: 105, shellName: weaponSound, weaponSound, guided: weaponSound === 'gunship-missile' });
  }
  frames(3, [shells[1]]);
  // (review r1) the howitzer's heavy charge on the ground: its starburst lights its column with embers (volumeMedia)
  emit('shell:expired', { shellId: 76, pos: [-20, 0, 40], hitTerrain: true, shellType: 'HE', caliberMm: 105, munition: 'howitzer',
    chargeKg: 8.8 });
  emit('shell:expired', { shellId: 75, pos: [3, 1, 30], hitTerrain: true, shellType: 'HEAT', caliberMm: 120 });
  // a hull's death (its wreck column), a crater the core dug; (review r1) the burn after them is 60 frames, not 260: the
  // reach is the same (the wreck light's flicker stays unreached either way) and the receipt costs less
  emit('tank:destroyed', { id: 'victim', pos: [-10, 0, 0], cause: 'ammorack', specId: 't72b3' });
  emit(DESTRUCTION_BUS_EVENTS.crater, { craterId: 3, x: -8, y: 0, z: 26, radiusM: 2.2, depthM: 0.7, seed: 41, settled: false });
  frames(60, [shells[1]]);
  // a ground burst and its late hull event (the burst on record answers it)
  { const s = id++; fired(s); emit('shell:expired', { shellId: s, pos: [-3, 0, 2], hitTerrain: true, ...he }); frames(2);
    emit('shell:hit', { shellId: s, attackerId: 'g', targetId: 't', kind: 'he_splash', damage: 20, pos: [-2, 0.8, 2], normal: [0, 1, 0],
      caliberMm: 125, shellType: 'HE', destroyed: false }); frames(2); }
  // the house's stages and sections: damaged, breached, its faces falling a storey at a time, collapsed
  const stage = { structureId: 7, massClass: 'house', cx: 0, cz: 8, hw: 5, hd: 4, yaw: 0, baseY: 0, topY: 8.4, cause: 'blast',
    munition: 'he', points: 30, integrity: 0.5 };
  emit(DESTRUCTION_BUS_EVENTS.stage, { ...stage, stage: 'damaged', previous: 'intact', x: 1, y: 2, z: 4, dirX: 0, dirZ: 1 });
  frames(2);
  emit(DESTRUCTION_BUS_EVENTS.stage, { ...stage, stage: 'breached', previous: 'damaged', x: 1, y: 1.2, z: 4, dirX: 0, dirZ: 1 });
  frames(2);
  const faceAt = { front: [0, 4], right: [5, 0], back: [0, -4], left: [-5, 0] };
  const sectionFall = (k, n, extra = {}) => ({ ...stage, hole: 255, radiusM: 0, sectionDown: true, nx: 0, ny: 0, nz: 1,
    section: k * 4 + FACES.indexOf(n), sectionKind: 'wall', x: faceAt[n][0], y: k * 3 + 1.5, z: 8 + faceAt[n][1], y0: k * 3, y1: k * 3 + 3,
    ...extra });
  emit(DESTRUCTION_BUS_EVENTS.breach, { ...stage, hole: 0, radiusM: 0.6, sectionDown: false, section: 0, sectionKind: 'wall', x: 1.5,
    y: 1.8, z: 12, nx: 0, ny: 0, nz: 1, y0: 0, y1: 3 });
  emit(DESTRUCTION_BUS_EVENTS.breach, sectionFall(0, 'front'));
  frames(2);
  for (const n of ['front', 'right', 'back']) emit(DESTRUCTION_BUS_EVENTS.breach, sectionFall(1, n));
  emit(DESTRUCTION_BUS_EVENTS.breach, sectionFall(1, 'left', { storeyDown: true }));
  // (review r1) the far drone is recalled: its flight home is still under way at the rebase; (round 4 F7) 10 frames take
  // it past its grace (DRONE_RETURN.graceS, 0.12 s) with the same reach as 40 took, for less of the houses' bodies' cost
  airborne.delete(droneAway);
  frames(10);
  emit(DESTRUCTION_BUS_EVENTS.stage, { ...stage, structureId: 8, stage: 'breached', previous: 'damaged', sections: true, x: 1, y: 1.2,
    z: 4, dirX: 0, dirZ: 1 });
  frames(2);
  // the screenshot composer's firing and explosion moments, and the battle's covered warm
  fx.composeFiringMoment({ muzzlePos: new THREE.Vector3(2, 2.4, -6), dir: new THREE.Vector3(0, 0, 1), caliberMm: 120, tracerType: 'AP', ageS: 0.05 });
  globalThis.window ??= {}; // (the composer reads the shot harness's page flags)
  fx.composeExplosionMoment({ pos: new THREE.Vector3(-14, 0, 30), ageS: 0.6 });
  fx.warmOpeningEffects(new THREE.Vector3(30, 0, 60), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
  fx.warmProjectilePresentation(new THREE.Vector3(30, 0, 60), new THREE.Vector3(0, 0, 1));
  frames(3, [shells[1]]);
}
// the moment of the rebase: both houses coming down (the bodies thrown, the mask's crumble front, the falling list), a
// burst just drawn (its records live) and a hull event waiting for its round's expiry
{
  const stage = { massClass: 'house', cx: 0, cz: 8, hw: 5, hd: 4, yaw: 0, baseY: 0, topY: 8.4, cause: 'blast', munition: 'he',
    points: 30, integrity: 0.5, previous: 'breached', stage: 'collapsed', x: 0, y: 3, z: 8, dirX: 1, dirZ: 0 };
  emit(DESTRUCTION_BUS_EVENTS.stage, { ...stage, structureId: 7 });
  emit(DESTRUCTION_BUS_EVENTS.stage, { ...stage, structureId: 8, sections: true });
  frames(3);
}
groundBurst(20);
{
  const s = id++; fired(s);
  emit('shell:hit', { shellId: s, attackerId: 'g', targetId: 't', kind: 'he_splash', damage: 40, pos: [1, 0.8, 0], normal: [0, 1, 0],
    caliberMm: 125, shellType: 'HE', destroyed: false });
}
const scenarioEnd = fxClockNow();
assert.ok(scenarioEnd - T0 < SPAN / 2, `the scenario stays inside the census span (${(scenarioEnd - T0).toFixed(2)} s)`);

// ---- (review r1) the drones the census walks: live at the rebase, every way a drone's flight can end driven ----
const droneLog = () => (fx.group.userData.droneFlightsHomeLog ?? []).map((e) => `${e.id} ${e.event} ${e.reason}`);
const airframesDrawn = () => {
  let n = 0;
  fx.group.traverse((o) => { if (o.isInstancedMesh && o.visible && /airframes/.test(o.name)) n += o.count; });
  return n;
};
function dronesLive(when) {
  const home = fx.group.userData.droneFlightsHome();
  const away = home.get(droneAway.id);
  assert.ok(away && away.phase !== 'grace',
    `${when}: the far drone is flying home past its grace (${away ? away.phase : 'none'}; log: ${droneLog().join(' | ')})`);
  assert.ok(airframesDrawn() >= 2, `${when}: a drone in flight and one flying home are drawn (${airframesDrawn()})`);
}
{
  const log = droneLog();
  if (process.env.FX_CENSUS_REACH) console.log(`drone flights home:\n  ${log.join('\n  ')}`);
  assert.ok(log.some((line) => line.startsWith(`${droneHome.id} end handed over`)),
    `the drone recalled beside its carrier flew home, descended and was handed over to the dock (log: ${log.join(' | ')})`);
  assert.ok(log.includes(`${droneStruck.id} skip impact`), `the drone that struck the ground never flew home (log: ${log.join(' | ')})`);
  dronesLive('at the rebase');
}

// ---- the scenario's reach: every fx-clock read and handed-clock store in src/fx ran, but a named few ----
// (review r1) The reads no scenario here reaches yet (`FX_CENSUS_REACH=1` prints the unreached keys in this form). A read
// or store added on a path the scenario does not drive fails (drive it, so the census checks what it stamps); a listed
// one the scenario now runs fails too (drop it). Every stamp these reads make is shifted in its part's shiftTime (checked
// by hand 2026-11-06). (round 4 F7) A key names its site: file | the named functions round it, innermost first (V8's
// own function names) | the read or store | its line's text, and ` #k/n` when n sites share all of that (k by place), so
// a site driven while another of the same text goes unreached elsewhere fails (a new function, or n moves).
const KNOWN_UNREACHED = [
  // the wreck fire light's flicker (unreached with a 260-frame burn too)
  'src/fx/effects.ts | updateWreckLight<createFxSteps | particles.getTime() | const time = particles.getTime();',
  // no caller in the tree: the interface's refreshShading (a uniform written every frame by update)
  'src/fx/volumeMedia.ts | refreshShading<createVolumeMedia | o_now() | refreshShading: () => { uTime.value = o_now(); refreshLight(); },',
  // a set piece's piece falls (pieceFalls[].t0, shifted)
  'src/fx/structureStages.ts | startPieceFalls<createStructureStages | o.now() | const f = { seam, meshes, axis, angle, pivot, t, t0: o.now(), T, crumble, piece: fall.piece, hol',
  'src/fx/structureStages.ts | stepPieceFalls<createStructureStages | o.now() | const now = o.now();',
  // a stage's hides held back behind a delay (heldHides[].at, shifted)
  'src/fx/structureStages.ts | run<createStructureStages | o.now() | if (held) heldHides.push({ seam, hides: held, at: o.now() + delayS });',
  'src/fx/structureStages.ts | update<createStructureStages | o.now() | if (heldHides.length) { let k = 0; for (const h of heldHides) if (o.now() >= h.at) apply(h.seam,',
  // a run shown later (structureDebris commit's showAt[].at and showFrom, shifted)
  'src/fx/structureDebris.ts | commit<createStructureDebris | at: stageBirth | if (stageDelay > 0) showAt.push({ mesh, at: stageBirth });',
  'src/fx/structureDebris.ts | showFrom<createStructureDebris | o.now() | if (!(atS > o.now())) return;',
  // three of structureFracture's collapse branches (lives[].watchedAt, touchedAt and mergedAt, shifted)
  'src/fx/structureFracture.ts | judgeWatched<createStructureFracture | o.now() | live.watchedAt = o.now();',
  'src/fx/structureFracture.ts | dropPieces<createStructureFracture | o.now() | live.touchedAt = o.now();',
  'src/fx/structureFracture.ts | update<createStructureFracture | = t | if (live.bakedPending.length && (live.bakedPending.length >= 6 || t - live.mergedAt > 1)) { merg',
];
{
  const coverage = call('Profiler.takePreciseCoverage').result;
  call('Profiler.stopPreciseCoverage');
  const reach = measureReach(coverage);
  const { unrun, reads, aliased, stores, handedStores, handed, unloaded } = reach;
  // (round 4 F7) every src/fx module with a clock read was loaded (a module the scenario never imports is never measured)
  assert.equal(unloaded.length, 0, `src/fx modules that read the fx clock but the scenario never loaded (import and drive each):\n  ${unloaded.join('\n  ')}`);
  assert.ok(reads > 60 && aliased >= 4 && stores >= 8,
    `the reach check sees the fx-clock reads (${reads}: ${aliased} through a bound local, ${stores} stores of a handed clock)`);
  // (round 4 F7) the clock handed under other names is seen: these parts take it as a parameter of their own name
  for (const want of ['src/fx/dronePresentation.ts begin(timeS)', 'src/fx/structureMask.ts collapse(startS)', 'src/fx/craterMarks.ts stamp(birth)',
    'src/fx/projectileTracers.ts compose(bornAtS)', 'src/fx/missileWires.ts tail(now)']) {
    assert.ok(handed.includes(want), `the reach check follows the clock into ${want} (handed: ${handed.join(', ')})`);
  }
  assert.ok(handedStores >= 10, `the reach check sees the stores of a clock handed under another name (${handedStores})`);
  const tally = (keys) => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const known = tally(KNOWN_UNREACHED), found = tally(unrun.map((u) => u.key));
  for (const [k, n] of known) assert.equal(n, 1, `a KNOWN_UNREACHED key names one site: ${k}`);
  const fresh = unrun.filter((u) => !known.has(u.key));
  const nowReached = [...known.keys()].filter((k) => !found.has(k));
  if (process.env.FX_CENSUS_REACH) {
    console.log(`the clock handed as a parameter: ${handed.join(', ')}`);
    console.log(`unreached fx-clock reads (${unrun.length} of ${reads}; ${aliased} through a bound local, ${stores} stores, ${handedStores} of a clock handed under another name):\n${unrun.map((u) => `  ${u.where}\n  ${JSON.stringify(u.key)},`).join('\n')}`);
  }
  assert.equal(fresh.length, 0, `fx-clock reads the census scenario never ran, not in its known list (drive each, so the census checks what it stamps):\n${fresh.map((u) => `  ${u.where}  ${u.key}`).join('\n')}`);
  assert.equal(nowReached.length, 0, `known unreached fx-clock reads the scenario now runs (drop them from KNOWN_UNREACHED):\n  ${nowReached.join('\n  ')}`);
}

/**
 * The reach of the scenario over src/fx's fx-clock sites, from V8's block coverage. A site is
 *  - a read: the runtime's particles.getTime(), fxClockNow(), a part's injected `now()` (performance and Date are wall
 *    clocks, no fx stamp), or a call of a local bound to one of them (volumeMedia's `const o_now = o.now`);
 *  - a store of a clock handed in as `now` (`x = now`, `x = now + d`; a declaration `const x = now - y` is an age);
 *  - (round 4 F7) a store of the clock under any other name: a call that hands a read, or a name holding one, as an
 *    argument (`drones.begin(particles.getTime())`, `mask.collapse(id, o.now(), ...)`) makes the callee's parameter a clock
 *    name in its body (dronePresentation's `timeS`, structureMask's `startS`), and so does an assignment of a clock name
 *    to another (`time = timeS`); each clock name's stores (`x = name`, `{ key: name }`) are sites, its arguments are
 *    followed into their callees. A callee is the definition of that name in the module whose factory made the receiver
 *    (`const drones = createDronePresentation(...)`), else the calling module's own, else every src/fx definition of that
 *    name taking as many arguments. A clock name's scope is the function its declaration (or its parameter list) sits in.
 * Comments, strings and regular expressions are no sites. It also names every src/fx module with a clock read that the
 * scenario never loaded.
 */
function measureReach(coverage) {
  const READ_SRC = String.raw`particles\.getTime\(\)|(?<![\w$.])fxClockNow\(\)|(?<![\w$.])(?!performance\.|Date\.)[\w$]+\.now\(\)(?!\s*\{)|(?<![\w$.])now\(\)(?!\s*\{)`;
  const READ = new RegExp(READ_SRC, 'g');
  const BOUND = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:[\w$]+\.)*(?:now|getTime)\s*[;,\n]/g;
  const STORE = /(?<![=!<>])=(?![=>])\s*now\b(?=\s*(?:[;,)}\]]|[+-]))/g;
  const IDENT = /[A-Za-z_$][\w$]*/g;
  const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'void', 'delete', 'in', 'of',
    'do', 'else', 'case', 'throw', 'yield', 'new', 'super', 'import',
    // the language's own collections and maths: no part's parameter
    'set', 'get', 'has', 'add', 'push', 'unshift', 'max', 'min', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'hypot', 'pow', 'exp', 'sin',
    'cos', 'atan2', 'fill', 'isFinite', 'Number', 'String', 'Boolean']);
  const scripts = [];
  for (const script of coverage) {
    const url = script.url;
    if (!url.includes('/src/fx/') || /\.selftest\.|test-support/.test(url)) continue;
    const source = call('Debugger.getScriptSource', { scriptId: script.scriptId }).scriptSource;
    const fnRanges = script.functions.map((fn) => ({ name: fn.functionName, a: fn.ranges[0].startOffset, b: fn.ranges[0].endOffset }));
    scripts.push({ file: url.slice(url.lastIndexOf('/src/') + 1), url, source, blank: blanked(source), functions: script.functions, fnRanges,
      sites: new Map(), idents: null });
  }
  const byFile = new Map(scripts.map((s) => [s.file, s]));
  let reads = 0, aliased = 0, stores = 0, handedStores = 0;
  // the reads, the bound locals' calls and the stores of a handed `now`
  for (const s of scripts) {
    for (const m of s.blank.matchAll(READ)) {
      if (!/function\s+$/.test(s.blank.slice(Math.max(0, m.index - 12), m.index))) s.sites.set(m.index, { text: m[0], read: true });
    }
    for (const b of s.blank.matchAll(BOUND)) {
      for (const m of s.blank.matchAll(new RegExp(`(?<![\\w$.])${escapeRe(b[1])}\\(\\)`, 'g'))) {
        if (!s.sites.has(m.index)) { s.sites.set(m.index, { text: m[0], read: true }); aliased++; }
      }
    }
    for (const m of s.blank.matchAll(STORE)) {
      const statement = s.blank.slice(Math.max(0, s.blank.lastIndexOf('\n', m.index), s.blank.lastIndexOf(';', m.index - 1) + 1), m.index);
      if (/(?:const|let|var)\s+[\w$]+\s*$/.test(statement)) continue;
      if (!s.sites.has(m.index)) { s.sites.set(m.index, { text: m[0].replace(/\s+/g, ' ') }); stores++; }
    }
  }
  // (round 4 F7) the clock under other names: a worklist of clock names, each { s, name, a, b } (its scope)
  const enclosing = (s, at) => {
    let best = { a: 0, b: s.blank.length };
    for (const r of s.fnRanges) if (r.a <= at && at < r.b && r.b - r.a < best.b - best.a) best = r;
    return best;
  };
  const identsOf = (s) => {
    if (s.idents) return s.idents;
    s.idents = new Map();
    for (const m of s.blank.matchAll(IDENT)) {
      if (s.blank[m.index - 1] === '.') continue; // a property, not a name
      (s.idents.get(m[0]) ?? s.idents.set(m[0], []).get(m[0])).push(m.index);
    }
    return s.idents;
  };
  const work = [], named = new Set(), handed = [];
  const addName = (s, name, scope, via) => {
    const key = `${s.file}:${scope.a}:${name}`;
    if (named.has(key) || KEYWORDS.has(name)) return;
    named.add(key);
    work.push({ s, name, a: scope.a, b: scope.b });
    if (via) handed.push(`${s.file} ${via}(${name})`);
  };
  /** the call whose argument list holds `at`, when the clock is that argument's leading term */
  const callAround = (s, at, len) => {
    const t = s.blank;
    if (!/^\s*(?:[,)+-]|$)/.test(t.slice(at + len, at + len + 8))) return null;
    let depth = 0, argStart = -1;
    for (let i = at - 1; i >= 0 && at - i < 4000; i--) {
      const c = t.charCodeAt(i);
      if (c === 41 || c === 93 || c === 125) depth++;
      else if (c === 40 || c === 91 || c === 123) {
        if (depth > 0) { depth--; continue; }
        if (c !== 40) return null; // an array or an object literal (an object's field is a store, not an argument)
        if (argStart < 0) argStart = i + 1;
        if (t.slice(argStart, at).trim() !== '') return null;
        const head = /(?:([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*)?([A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*$/.exec(t.slice(Math.max(0, i - 96), i));
        if (!head || KEYWORDS.has(head[2])) return null;
        let index = 0, count = 1, d = 0;
        const close = matchClose(t, i);
        for (let j = i + 1; j < close; j++) {
          const e = t.charCodeAt(j);
          if (e === 40 || e === 91 || e === 123) d++;
          else if (e === 41 || e === 93 || e === 125) d--;
          else if (e === 44 && d === 0) { count++; if (j < argStart) index++; }
        }
        return { name: head[2], receiver: head[1] ?? null, index, count };
      } else if (c === 44 && depth === 0 && argStart < 0) argStart = i + 1;
      else if (c === 59 && depth === 0) return null;
    }
    return null;
  };
  const factoryFiles = new Map();
  /** the module whose factory made `receiver` in s (`const wires = createMissileWires(...)`), or null */
  const factoryFile = (s, receiver) => {
    const key = `${s.file}:${receiver}`;
    if (factoryFiles.has(key)) return factoryFiles.get(key);
    let file = null;
    const made = new RegExp(`(?<![\\w$.])${escapeRe(receiver)}\\s*=(?![=>])[^;]*?\\b(create[A-Z][\\w$]*)\\s*\\(`).exec(s.blank);
    if (made) {
      for (const m of s.source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/g)) {
        if (new RegExp(`\\b${made[1]}\\b`).test(m[1])) { const u = new URL(m[2], s.url).href; file = u.slice(u.lastIndexOf('/src/') + 1); break; }
      }
    }
    factoryFiles.set(key, file);
    return file;
  };
  /** the definitions of `name` in s: its parameters and its body's range */
  const defsCache = new Map();
  const defsOf = (s, name) => {
    const cacheKey = `${s.file}:${name}`;
    if (defsCache.has(cacheKey)) return defsCache.get(cacheKey);
    const out = [];
    defsCache.set(cacheKey, out);
    const n = escapeRe(name);
    const re = new RegExp(String.raw`\bfunction\s+${n}\s*\(|(?<![\w$.])${n}\s*(?::|=(?![=>]))\s*(?:async\s+)?(?:function\b[^(]*)?\(|(?<![\w$.])${n}\s*\(`, 'g');
    const opens = new Set();
    for (const m of s.blank.matchAll(re)) {
      const open = m.index + m[0].length - 1;
      if (opens.has(open)) continue;
      opens.add(open);
      const close = matchClose(s.blank, open);
      if (close < 0) continue;
      const rest = /^\s*(\{|=>)/.exec(s.blank.slice(close + 1, close + 64));
      if (!rest) continue; // a call, not a definition
      const bodyAt = close + 1 + rest[0].length - rest[1].length;
      const end = rest[1] === '{' ? matchClose(s.blank, bodyAt) : expressionEnd(s.blank, bodyAt + 2);
      out.push({ params: splitParams(s.blank.slice(open + 1, close)), a: open, b: end < 0 ? s.blank.length : end, bodyAt });
    }
    return out;
  };
  const followCall = (s, at, len) => {
    const c = callAround(s, at, len);
    if (!c) return;
    // the receiver's factory's module; else this module's own definition of the name; else any module's that takes as
    // many arguments
    const target = c.receiver ? factoryFile(s, c.receiver) : null;
    const own = target ? [] : defsOf(s, c.name);
    const candidates = target ? [byFile.get(target)].filter(Boolean) : own.length ? [s] : scripts;
    for (const t of candidates) {
      for (const def of defsOf(t, c.name)) {
        if (!target && !own.length && def.params.length < c.count) continue;
        const param = def.params[c.index];
        if (param) addName(t, param, { a: def.bodyAt, b: def.b }, c.name);
      }
    }
  };
  // seeds: reads handed as arguments, and locals bound to a read's value
  for (const s of scripts) {
    for (const [at, site] of s.sites) if (site.read) followCall(s, at, site.text.length);
    for (const m of s.blank.matchAll(new RegExp(String.raw`(?:\b(?:const|let|var)\s+|(?<![\w$.]))([A-Za-z_$][\w$]*)\s*=(?![=>])\s*(?=(?:${READ_SRC})\s*(?:[;,)\n+-]))`, 'g'))) {
      addName(s, m[1], declaredScope(s, m[1], m.index, enclosing), null);
    }
  }
  // a clock name's uses: stores (sites), assignments to another name (followed), arguments (followed into their callees)
  while (work.length) {
    const { s, name, a, b } = work.pop();
    for (const at of identsOf(s).get(name) ?? []) {
      if (at < a || at >= b) continue;
      const before = s.blank.slice(Math.max(0, at - 160), at), after = s.blank.slice(at + name.length, at + name.length + 24);
      if (/^\s*:/.test(after) && /[{,]\s*$/.test(before)) continue; // an object's key
      if (/\b(?:const|let|var)\s+$/.test(before)) continue; // its own declaration
      if (!/^\s*(?:[;,)}\]\n:]|$|[+-](?![+-=]))/.test(after) && !/^\s*\?\?/.test(after)) continue; // read, not handed on
      const assigned = /(?:\b(?:const|let|var)\s+)?(?<![\w$.\])])([A-Za-z_$][\w$]*)?\s*(?<![=!<>+\-*/%&|^?])=\s*$/.exec(before);
      if (assigned) {
        const declaration = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*$/.test(before);
        if (!declaration && !s.sites.has(at)) { s.sites.set(at, { text: `= ${name}` }); handedStores++; }
        if (assigned[1] && !/^\s*-/.test(after)) addName(s, assigned[1], declaredScope(s, assigned[1], at, enclosing), null);
        continue;
      }
      const field = /[{,]\s*([A-Za-z_$][\w$]*)\s*:\s*$/.exec(before);
      if (field) { if (!s.sites.has(at)) { s.sites.set(at, { text: `${field[1]}: ${name}` }); handedStores++; } continue; }
      followCall(s, at, name.length);
    }
  }
  // the count each site's block ran
  const unrun = [];
  for (const s of scripts) {
    const chainAt = (at) => s.fnRanges.filter((r) => r.name && r.a <= at && at < r.b).sort((x, y) => (x.b - x.a) - (y.b - y.a)).map((r) => r.name).join('<');
    const countAt = (at) => {
      let best = null;
      for (const fn of s.functions) for (const r of fn.ranges) {
        if (r.startOffset <= at && at < r.endOffset && (!best || r.endOffset - r.startOffset < best.endOffset - best.startOffset)) best = r;
      }
      return best ? best.count : 0;
    };
    const groups = new Map();
    for (const [at, site] of [...s.sites].sort((x, y) => x[0] - y[0])) {
      reads++;
      const eol = s.source.indexOf('\n', at);
      const line = s.source.slice(s.source.lastIndexOf('\n', at) + 1, eol < 0 ? undefined : eol).trim().replace(/\s+/g, ' ').slice(0, 96);
      const key = `${s.file} | ${chainAt(at)} | ${site.text} | ${line}`;
      (groups.get(key) ?? groups.set(key, []).get(key)).push({ at, ran: countAt(at) > 0 });
    }
    for (const [key, list] of groups) {
      list.forEach((u, k) => {
        if (u.ran) return;
        unrun.push({ key: list.length > 1 ? `${key} #${k + 1}/${list.length}` : key, where: `${s.file}:${s.source.slice(0, u.at).split('\n').length}` });
      });
    }
  }
  // (round 4 F7) the src/fx modules the scenario never loaded: none may read the clock
  const unloaded = [];
  const dir = new URL('.', import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts') || /\.selftest\.|test-support/.test(name) || byFile.has(`src/fx/${name}`)) continue;
    if (new RegExp(READ_SRC).test(blanked(readFileSync(new URL(name, dir), 'utf8')))) unloaded.push(`src/fx/${name}`);
  }
  return { unrun, reads, aliased, stores, handedStores, handed: [...new Set(handed)].sort(), unloaded };
}
function escapeRe(text) { return text.replace(/[$]/g, '\\$'); }
/** `source` with its comments, strings and regular expressions blanked (same length, same lines; a string or an
 *  expression keeps its delimiters). A `/` after an operator, a bracket, `return` or a line's start opens an expression. */
function blanked(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\[\s\S])*`|(?<=(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn)\s*)\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\//g, (m) => {
    const c = m.charCodeAt(0), d = m.charCodeAt(1);
    if (c === 47 && (d === 47 || d === 42)) return d === 47 ? ' '.repeat(m.length) : m.replace(/[^\n]/g, ' ');
    return m[0] + (c === 96 ? m.slice(1, -1).replace(/[^\n]/g, ' ') : ' '.repeat(m.length - 2)) + m[m.length - 1];
  });
}
function matchClose(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 40 || c === 91 || c === 123) depth++;
    else if ((c === 41 || c === 93 || c === 125) && --depth === 0) return i;
  }
  return -1;
}
function expressionEnd(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 40 || c === 91 || c === 123) depth++;
    else if (c === 41 || c === 93 || c === 125) { if (depth === 0) return i; depth--; }
    else if ((c === 44 || c === 59) && depth === 0) return i;
  }
  return text.length;
}
function splitParams(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : 44;
    if (c === 40 || c === 91 || c === 123) depth++;
    else if (c === 41 || c === 93 || c === 125) depth--;
    else if (c === 44 && depth === 0) {
      const m = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(text.slice(start, i));
      out.push(m ? m[1] : null);
      start = i + 1;
    }
  }
  return out;
}
/** the scope of `name` as it is used at `at` in s: the function its declaration sits in (a parameter's, a local's, a
 *  closure's variable), else the module */
function declaredScope(s, name, at, enclosing) {
  const re = new RegExp(String.raw`\b(?:const|let|var)\s+${escapeRe(name)}\b`, 'g');
  let best = null;
  for (const m of s.blank.matchAll(re)) {
    const scope = enclosing(s, m.index);
    if (scope.a <= at && at < scope.b && (!best || scope.b - scope.a < best.b - best.a)) best = scope;
  }
  return best ?? enclosing(s, at);
}

// ---- the census: one walk after a rebase to T1 ----
// (round 4 F7) The rebase moves the clock from T0 to T1, a second time no other number the runtime holds lies within SPAN
// of (a capture's pin and the Studio's reset to 0 are the same registry walk with another delta: effects.ts
// rebaseFxClock), so one walk after it tells both: a stamp near T1 was moved (the control: the walk sees the live stamps,
// inside closures and out), a stamp near T0 was left, and one near 2 T1 - T0 was moved twice. (Round three walked before
// and after a rebase to 0: twice the inspector's work.)
const T1 = 3_333_333;
let sink = null;
globalThis.__fxStampCensusSink = (x) => { sink = x; };

/** every number reachable from `root` near T0 (left), T1 (moved) or 2 T1 - T0 (moved twice), by where it lives */
function census(root) {
  const left = new Map(), moved = new Map(), twice = new Map();
  const T2 = 2 * T1 - T0;
  const seen = new Set([globalThis, process, console, session]);
  const queue = [], fns = [];
  const push = (x, at) => {
    if (x !== null && (typeof x === 'object' || typeof x === 'function') && !seen.has(x)) { seen.add(x); (typeof x === 'function' ? fns : queue).push([x, at]); }
  };
  // (every window lies past a million either way: T0, T1 and 2 T1 - T0)
  const stamp = (x, at) => {
    if (typeof x !== 'number' || (x < 1e6 && x > -1e6)) return;
    const map = Math.abs(x - T0) < SPAN ? left : Math.abs(x - T1) < SPAN ? moved : Math.abs(x - T2) < SPAN ? twice : null;
    if (map && !map.has(at)) map.set(at, x);
  };
  /** a function's closures (its objectId from the batch), for the game's own modules */
  function closures(fid, at) {
    const internal = call('Runtime.getProperties', { objectId: fid, ownProperties: true, objectGroup: 'census' }).internalProperties ?? [];
    const loc = internal.find((p) => p.name === '[[FunctionLocation]]')?.value?.value;
    const url = loc ? urls.get(loc.scriptId) ?? '' : '';
    // the game's own modules (node_modules, node's internals and this receipt are not the runtime's state)
    if (!url.includes('/src/') || url === SELF) return;
    const list = internal.find((p) => p.name === '[[Scopes]]');
    if (!list) return;
    call('Runtime.callFunctionOn', { objectId: list.value.objectId, objectGroup: 'census',
      functionDeclaration: 'function () { globalThis.__fxStampCensusSink(Array.from(this)); }' });
    const file = url.slice(url.lastIndexOf('/src/') + 1);
    for (const scope of sink) {
      const kind = String(scope.description);
      if (/^(Global|Script)/.test(kind)) continue;
      // a module's own top-level state, for the fx modules (another module's is its own, not the runtime's)
      const moduleScope = /^Module/.test(kind);
      if (moduleScope && !url.includes('/src/fx/')) continue;
      const vars = scope.object;
      for (const name of Object.keys(vars)) {
        const x = vars[name];
        const where = `${file}:${loc.lineNumber + 1} ${kind} ${name}`;
        stamp(x, where);
        if (moduleScope && typeof x === 'function') continue; // an import: its own module's
        push(x, where);
      }
    }
  }
  push(root, 'fx');
  while (queue.length || fns.length) {
    while (queue.length) {
      const [x, at] = queue.pop();
      if (ArrayBuffer.isView(x)) {
        if (x instanceof DataView) continue;
        // the first element in each window names the array
        let inLeft = false, inMoved = false, inTwice = false;
        for (let i = 0; i < x.length; i++) {
          const v = x[i];
          if (v < 1e6 && v > -1e6) continue;
          if (!inLeft && Math.abs(v - T0) < SPAN) { left.set(`${at}[${i}]`, v); inLeft = true; }
          else if (!inMoved && Math.abs(v - T1) < SPAN) { moved.set(`${at}[${i}]`, v); inMoved = true; }
          else if (!inTwice && Math.abs(v - T2) < SPAN) { twice.set(`${at}[${i}]`, v); inTwice = true; }
        }
        continue;
      }
      if (x instanceof Map) { for (const [k, y] of x) { stamp(y, `${at}.get(${String(k)})`); push(k, `${at}.key`); push(y, `${at}.get(${String(k)})`); } continue; }
      if (x instanceof Set) { for (const y of x) { stamp(y, `${at}.has`); push(y, `${at}.has`); } continue; }
      if (x instanceof WeakMap || x instanceof WeakSet || x instanceof Promise || x instanceof WeakRef) continue;
      // (round 4 F7) an import's namespace is its module's (as an imported function is), and three's rotation and
      // quaternion keep each other in step through a callback over the pair: no runtime state behind either
      if (Object.getOwnPropertyDescriptor(x, Symbol.toStringTag)?.value === 'Module') continue;
      const mathValue = x instanceof THREE.Quaternion || x instanceof THREE.Euler;
      for (const key of Reflect.ownKeys(x)) {
        const desc = Object.getOwnPropertyDescriptor(x, key);
        if (!desc || !('value' in desc)) continue; // never run an accessor
        if (mathValue && typeof desc.value === 'function') continue;
        // (a three object is named by its name too: `children.4<fx-structure-debris>`)
        const named = desc.value && typeof desc.value === 'object' && typeof desc.value.name === 'string' && desc.value.name;
        const at2 = `${at}.${String(key)}${named ? `<${desc.value.name}>` : ''}`;
        stamp(desc.value, at2);
        push(desc.value, at2);
      }
    }
    // the functions met so far, a batch at a time: their handles in one call, then each one's closures
    if (fns.length) {
      const batch = fns.splice(0);
      globalThis.__fxStampCensusFns = batch.map(([fn]) => fn);
      const list = call('Runtime.evaluate', { expression: 'globalThis.__fxStampCensusFns', objectGroup: 'census' }).result.objectId;
      for (const p of call('Runtime.getProperties', { objectId: list, ownProperties: true, objectGroup: 'census' }).result) {
        const k = Number(p.name);
        if (Number.isInteger(k) && p.value?.objectId) closures(p.value.objectId, batch[k][1]);
      }
    }
  }
  delete globalThis.__fxStampCensusFns;
  call('Runtime.releaseObjectGroup', { objectGroup: 'census' });
  return { left, moved, twice, values: seen.size };
}

// the rebase: the clock pinned at T1, then a frame (per-frame mirrors of the clock take the new one)
fx.resetClock(T1);
frames(2);
dronesLive('after the rebase');
const after = census(fx);
assert.ok(after.values > 1000, `the walk reached the runtime (${after.values} values)`);
const movedFiles = new Set([...after.moved.keys()].map((at) => at.split(':')[0]));
assert.ok(after.moved.size >= 12 && movedFiles.size >= 5,
  `the control: the census sees the runtime's stamps the rebase moved (${after.moved.size} in ${movedFiles.size} files: ${[...movedFiles].join(', ')})`);
const left = [...after.left].map(([at, x]) => `  ${at} = ${x}`);
assert.equal(left.length, 0, `stamps the rebase left at their pre-rebase time (register each part's shift where it is made, timeShift.ts):\n${left.join('\n')}`);
const twice = [...after.twice].map(([at, x]) => `  ${at} = ${x}`);
assert.equal(twice.length, 0, `stamps the rebase moved twice (a part registered twice, or a sub-part its owner shifts too):\n${twice.join('\n')}`);

session.disconnect();
fx.resetAll();
console.log(`fxClockStampCensus.selftest: a rebase moves every fx-clock stamp the runtime holds (${after.moved.size} moved, none left or moved twice; ${after.values} values walked)`);
