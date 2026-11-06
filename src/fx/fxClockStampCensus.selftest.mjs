// Round 2 (2026-11-03 critic U33, Q15): the fx clock's rebase registry (fx/timeShift.ts) is complete by census, not by a
// list of names. Round one's receipt (clockRebase.selftest) checked that a fixed list of 18 parts was registered, so a
// stamp nobody registered passed it: the HE round records (burstAt, roundEndedAt, the waiting hull events' time), the
// struck buildings' dust load, the salvo crowd ring, the track skirts, the trail cadence and the exhaust bursts all kept
// their pre-rebase times. This receipt names none of them. It drives a live runtime (fx/effects.ts) with its clock at a
// time no other number in the runtime has (T0), rebases the clock to 0 (the Studio's reset at every load and seek), and
// then walks everything the runtime can reach: its objects, arrays, maps, typed arrays, and the variables every closure of
// a src/ module holds (through node:inspector, the same view a debugger has). Any number still within the scenario's span
// of T0 is a stamp the rebase did not move, and the receipt fails naming where it lives (file, closure, variable). A new
// stamp a part keeps without registering its shift fails it the first time this scenario reaches it.
//
// The control: the same walk before the rebase finds the runtime's live stamps (it sees into closures at all).
//
// (round 3 B5) The census covered only the paths its scenario drove (drones and the gunship were not driven), so an
// unregistered stamp on any other path passed it. Now the scenario's reach is measured too: V8's block coverage, taken
// through the same inspector session from before the fx modules load, must show every fx-clock read in src/fx (the
// runtime's particles.getTime(), fxClockNow(), and the clock its parts are handed, `now()`) run at least once, or the
// receipt fails naming each read it never ran. A part that starts reading the clock on a path the scenario does not
// drive fails here until the scenario drives it, and then the census checks what it stamps. The scenario drives the
// drones (in flight, struck, and flying home), the gunship's rounds and missile, the auxiliary systems, a wire-guided
// missile, a building's stages and sections (a default-kit house), a crater event, the screenshot composer and the
// battle warm.
import assert from 'node:assert/strict';
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
// (round 3 B5) the hulls the runtime resolves: a drone's carrier and the AC-130, and the hulls the auxiliary systems draw
const dock = new THREE.Group();
const entities = new Map([
  ['carrier', { id: 'carrier', team: 'player', spec: { nation: 'USA' }, visual: { root: new THREE.Group().add(dock) },
    state: { pos: new THREE.Vector3(10, 0, 0), yaw: 0 }, combat: { destroyed: false }, aerial: { active: false } }],
  ['gunship', { id: 'gunship', team: 'player', spec: { nation: 'USA' }, visual: { root: new THREE.Group() },
    state: { pos: new THREE.Vector3(0, 240, -200), yaw: 0.3 }, combat: { destroyed: false }, aerial: { active: true, kind: 'gunship', yaw: 0.3 } }],
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
const frames = (n, shells = []) => { for (let i = 0; i < n; i++) { matchClockS += 1 / 60; fx.update(1 / 60, shells, camera, () => null); } };
const he = { shellType: 'HE', caliberMm: 125, munition: 'he', chargeKg: 3.4 };
let id = 9000;
const fired = (shellId) => emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9],
  shellName: '125 mm HE', ...he });
const groundBurst = (x) => { const s = id++; fired(s); emit('shell:expired', { shellId: s, pos: [x, 0, 0], hitTerrain: true, ...he }); };
const shells = [
  { id: 71, pos: new THREE.Vector3(0, 2, 10), vel: new THREE.Vector3(0, 0, 1500), spec: { tracer: 'TANK' }, shooterId: 'g', ageS: 0.05, distM: 60 },
  { id: 72, pos: new THREE.Vector3(4, 3, 20), vel: new THREE.Vector3(0, 0, 250), spec: { guided: true, tracer: 'ATGM' }, shooterId: 'g', ageS: 1, distM: 250 },
  // (round 3 B5) a drone in free flight from its carrier, and a machine gun's round that will strike the ground
  { id: 73, pos: new THREE.Vector3(14, 12, 20), vel: new THREE.Vector3(0, 0, 18), spec: { tracer: 'DRONE' }, shooterId: 'carrier', ageS: 4, distM: 30 },
  { id: 74, pos: new THREE.Vector3(-6, 1, 14), vel: new THREE.Vector3(0, 0, 850), spec: { tracer: 'MG' }, shooterId: 'g', ageS: 0.02, distM: 16 },
];

fx.resetAll();
fx.resetClock(T0);
frames(3);
// an engine running 2.5 s (past the cold start), then a throttle-up: its billow burst
const stack = new THREE.Vector3(5, 2, 0), vel = new THREE.Vector3(0, 0, 6), fwd = new THREE.Vector3(0, 0, 1);
const track = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1);
for (let f = 0; f < 170; f++) {
  const z = f * 0.1;
  stack.set(5, 2, z); track.set(6, 0, z);
  fx.exhaust(stack, f < 150 ? 0.2 : 1, false, vel, fwd);
  fx.dust(track, dir, 1);
  frames(1, f > 120 ? shells : []);
}
// a salvo's bursts on the ground, and rounds striking a building's wall
for (let k = 0; k < 3; k++) { groundBurst(k * 3); frames(2); }
for (let k = 0; k < 2; k++) {
  const s = id++; fired(s);
  emit('shell:expired', { shellId: s, pos: [0, 1.5, 3], hitTerrain: false, hitKind: 'prop', structureId: 7, normal: [0, 0, -1], ...he });
  frames(2);
}
// (round 3 B5) the paths the census had not driven
{
  // the round in flight strikes the ground (its tracer's strike spray), the drone flies on, then leaves the world
  // unstruck (its flight home), a wire-guided missile pays out its wire, and the AC-130 fires its howitzer and missile
  emit('shell:expired', { shellId: 74, pos: [-6, 0, 18], hitTerrain: true, shellType: 'AP', caliberMm: 7.62 });
  emit('shell:expired', { shellId: 71, pos: [0, 0, 26], hitTerrain: true, shellType: 'APFSDS', caliberMm: 120 });
  frames(4, [shells[1], shells[2]]);
  emit('shell:fired', { shellId: 75, shooterId: 'g', muzzlePos: [3, 2, -10], pos: [3, 2, -10], dir: [0, 0, 1], shellType: 'HEAT',
    caliberMm: 120, shellName: '9M113 Konkurs', weaponSound: 'konkurs-launch', guided: true });
  frames(3, [shells[1]]);
  for (const [shellId, weaponSound] of [[76, 'gunship-howitzer'], [77, 'gunship-missile']]) {
    emit('shell:fired', { shellId, shooterId: 'gunship', muzzlePos: [0, 238, -200], pos: [0, 238, -200], dir: [0, -0.8, 0.6],
      shellType: 'HE', caliberMm: 105, shellName: weaponSound, weaponSound, guided: weaponSound === 'gunship-missile' });
  }
  frames(3, [shells[1]]);
  emit('shell:expired', { shellId: 76, pos: [-20, 0, 40], hitTerrain: true, shellType: 'HE', caliberMm: 105 });
  emit('shell:expired', { shellId: 75, pos: [3, 1, 30], hitTerrain: true, shellType: 'HEAT', caliberMm: 120 });
  // a hull's death (its wreck column and light, burning past the blast's own light), a crater the core dug
  emit('tank:destroyed', { id: 'carrier', pos: [10, 0, 0], cause: 'ammorack', specId: 't72b3' });
  emit(DESTRUCTION_BUS_EVENTS.crater, { craterId: 3, x: -8, y: 0, z: 26, radiusM: 2.2, depthM: 0.7, seed: 41, settled: false });
  frames(260, [shells[1]]);
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
  frames(40);
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

// ---- the scenario's reach: every fx-clock read in src/fx ran ----
{
  const coverage = call('Profiler.takePreciseCoverage').result;
  call('Profiler.stopPreciseCoverage');
  // the clock reads: the runtime's own, and the clock a part was handed (a wall clock, performance or Date, is no fx stamp)
  const READ = /particles\.getTime\(\)|(?<![\w$.])fxClockNow\(\)|(?<![\w$.])(?!performance\.|Date\.)[\w$]+\.now\(\)(?!\s*\{)|(?<![\w$.])now\(\)(?!\s*\{)/g;
  const unrun = [];
  let reads = 0;
  for (const script of coverage) {
    const url = script.url;
    if (!url.includes('/src/fx/') || /\.selftest\.|test-support/.test(url)) continue;
    const source = call('Debugger.getScriptSource', { scriptId: script.scriptId }).scriptSource;
    // comments are no reads (a // line's or a /* */ block's text)
    const comments = [];
    for (const m of source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) comments.push([m.index, m.index + m[0].length]);
    const inComment = (at) => comments.some(([a, b]) => a <= at && at < b);
    const countAt = (at) => {
      let best = null;
      for (const fn of script.functions) for (const r of fn.ranges) {
        if (r.startOffset <= at && at < r.endOffset && (!best || r.endOffset - r.startOffset < best.endOffset - best.startOffset)) best = r;
      }
      return best ? best.count : 0;
    };
    const file = url.slice(url.lastIndexOf('/src/') + 1);
    for (const m of source.matchAll(READ)) {
      if (inComment(m.index) || /function\s+$/.test(source.slice(Math.max(0, m.index - 12), m.index))) continue;
      reads++;
      if (countAt(m.index) === 0) unrun.push(`  ${file}:${source.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
  }
  assert.ok(reads > 60, `the reach check sees the fx-clock reads (${reads})`);
  // A ratchet, not a list: the reads no scenario here reaches yet (2026-11-05: a set piece's falls and a stage's held
  // hides in structureStages, a show held back in structureDebris, two of structureFracture's collapse branches, a tracer
  // strike's spark, the wreck fire light's flicker). A read added on a path the scenario does not drive raises the count
  // and fails; drive a path and lower the ceiling with it.
  const UNREACHED_CEILING = 9;
  assert.ok(unrun.length <= UNREACHED_CEILING,
    `fx-clock reads the census scenario never ran: ${unrun.length}, more than the ${UNREACHED_CEILING} known (drive each new one, so the census checks what it stamps):\n${unrun.join('\n')}`);
  if (process.env.FX_CENSUS_REACH) console.log(`unreached fx-clock reads (${unrun.length} of ${reads}):\n${unrun.join('\n')}`);
}

// ---- the census ----
let sink = null;
globalThis.__fxStampCensusSink = (x) => { sink = x; };

/** every number reachable from `root` within SPAN of T0, by where it lives */
function census(root) {
  const hits = new Map();
  const seen = new Set([globalThis, process, console, session]);
  const queue = [];
  const push = (x, at) => {
    if (x !== null && (typeof x === 'object' || typeof x === 'function') && !seen.has(x)) { seen.add(x); queue.push([x, at]); }
  };
  const stamp = (x, at) => { if (typeof x === 'number' && Math.abs(x - T0) < SPAN && !hits.has(at)) hits.set(at, x); };
  function closures(fn, at) {
    globalThis.__fxStampCensusFn = fn;
    const fid = call('Runtime.evaluate', { expression: 'globalThis.__fxStampCensusFn', objectGroup: 'census' }).result.objectId;
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
  while (queue.length) {
    const [x, at] = queue.pop();
    if (typeof x === 'function') { closures(x, at); continue; }
    if (ArrayBuffer.isView(x)) {
      if (x instanceof DataView) continue;
      for (let i = 0; i < x.length; i++) {
        const v = x[i];
        if (typeof v === 'number' && Math.abs(v - T0) < SPAN) { stamp(v, `${at}[${i}]`); break; }
      }
      continue;
    }
    if (x instanceof Map) { for (const [k, y] of x) { stamp(y, `${at}.get(${String(k)})`); push(k, `${at}.key`); push(y, `${at}.get(${String(k)})`); } continue; }
    if (x instanceof Set) { for (const y of x) { stamp(y, `${at}.has`); push(y, `${at}.has`); } continue; }
    if (x instanceof WeakMap || x instanceof WeakSet || x instanceof Promise || x instanceof WeakRef) continue;
    for (const key of Reflect.ownKeys(x)) {
      const desc = Object.getOwnPropertyDescriptor(x, key);
      if (!desc || !('value' in desc)) continue; // never run an accessor
      // (a three object is named by its name too: `children.4<fx-structure-debris>`)
      const named = desc.value && typeof desc.value === 'object' && typeof desc.value.name === 'string' && desc.value.name;
      const at2 = `${at}.${String(key)}${named ? `<${desc.value.name}>` : ''}`;
      stamp(desc.value, at2);
      push(desc.value, at2);
    }
  }
  call('Runtime.releaseObjectGroup', { objectGroup: 'census' });
  return { hits, values: seen.size };
}

// the control: before the rebase the walk finds the live stamps, inside closures and out
const before = census(fx);
const files = new Set([...before.hits.keys()].map((at) => at.split(':')[0]));
assert.ok(before.hits.size >= 12 && files.size >= 5,
  `the census sees the runtime's live stamps (${before.hits.size} in ${files.size} files: ${[...files].join(', ')})`);

// the rebase: the Studio's reset to 0, then a frame (per-frame mirrors of the clock take the new one)
fx.resetClock(0);
frames(2);
const after = census(fx);
assert.ok(after.values > 1000, `the walk reached the runtime (${after.values} values)`);
const left = [...after.hits].map(([at, x]) => `  ${at} = ${x}`);
assert.equal(left.length, 0, `stamps the rebase left at their pre-rebase time (register each part's shift where it is made, timeShift.ts):\n${left.join('\n')}`);

session.disconnect();
fx.resetAll();
console.log(`fxClockStampCensus.selftest: a rebase moves every fx-clock stamp the runtime holds (${before.hits.size} live before it, none left after; ${after.values} values walked)`);
