import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Group, Scene, PerspectiveCamera, SpotLight, PointLight, InstancedMesh, Matrix4, BoxGeometry } from 'three';
import ts from 'typescript-compiler-api';
import { inspectNightWindow } from '../src/dev/nightWindowInspection.ts';
import { markWorldWindowPane } from '../src/world/worldNightEmissionGeometry.ts';

// Execute actual maintained functions without importing the browser-owning CLI.
const source = readFileSync(new URL('./daynight-atmosphere-probe.mjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('daynight-atmosphere-probe.mjs', source,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function load(name, bindings = {}) {
  const nodes = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(nodes.length, 1, `unambiguous production function ${name}`);
  return compileFunction(`return (${nodes[0].getText(tree)});`, Object.keys(bindings))(...Object.values(bindings));
}

function observerFixture() {
  let now = 0, nextTimer = 0;
  const timers = new Map(), window = {}, calls = [];
  const result = {}, failure = new Error('original render failed');
  const post = { shouldThrow: false, render(...args) {
    calls.push({ receiver: this, args });
    if (this.shouldThrow) throw failure;
    return result;
  } };
  const original = post.render;
  load('installFrameWait', { window, performance: { now: () => now },
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
  })({ progressMs: 5000, settleMs: 30000 });
  const probe = window.__equipmentDamageProbe;
  probe.install(post);
  return { probe, post, original, calls, result, failure, timers,
    advance(ms) { now += ms; for (const callback of [...timers.values()]) callback(); } };
}

{
  const f = observerFixture();
  assert.throws(() => f.probe.install(f.post), /already installed/);
  const epoch = f.probe.beginStateEpoch();
  const wait = f.probe.waitForFrames(2);
  await assert.rejects(f.probe.waitForFrames(1), /overlapping/);
  assert.strictEqual(f.post.render(.016, 'extra'), f.result);
  assert.equal(f.probe.renderReceipt().renderCount, 1);
  f.post.shouldThrow = true;
  assert.throws(() => f.post.render(.02), error => error === f.failure);
  assert.equal(f.probe.renderReceipt().renderCount, 1, 'throwing original render is not progress');
  f.post.shouldThrow = false;
  f.post.render(.03);
  assert.deepEqual(await wait, { epoch, startFrame: 0, endFrame: 2, completed: 2 });
  assert.deepEqual(f.calls.map(call => call.args), [[.016, 'extra'], [.02], [.03]]);
  assert(f.calls.every(call => call.receiver === f.post), 'original this/order/arguments/results retained');
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.probe.dispose(), { restored: true, pendingWait: false, renderCount: 2 });
  assert.strictEqual(f.post.render, f.original);
  assert.equal(f.probe.dispose().restored, true, 'cleanup idempotent');
}
{
  const f = observerFixture(), wait = f.probe.waitForFrames(1);
  const rejected = assert.rejects(wait, /No completed post.render/);
  f.advance(5000); await rejected;
  assert.equal(f.timers.size, 0, 'no render/rAF-only activity cannot satisfy the wait');
  f.probe.dispose();
}
{
  const f = observerFixture(), wait = f.probe.waitForFrames(100);
  const rejected = assert.rejects(wait, /Render settle deadline/);
  for (let i = 0; i < 9; i++) { f.advance(3000); f.post.render(.016); }
  f.advance(3000); await rejected;
  assert.equal(f.timers.size, 0, 'progress cannot extend the absolute deadline');
  f.probe.dispose();
}
{
  const f = observerFixture(), wait = f.probe.waitForFrames(1);
  const rejected = assert.rejects(wait, /State changed/);
  f.probe.beginStateEpoch(); f.post.render(.016); await rejected;
  f.probe.dispose();
}
{
  const f = observerFixture(), wait = f.probe.waitForFrames(1);
  const rejected = assert.rejects(wait, /disposed during wait/);
  f.probe.dispose(); await rejected;
  assert.equal(f.timers.size, 0);
}
{
  const f = observerFixture(), replacement = () => {};
  f.post.render = replacement;
  assert.throws(() => f.probe.dispose(), /ownership changed/);
  assert.strictEqual(f.post.render, replacement, 'never overwrite a foreign replacement on cleanup');
}

const lightingReceipt = load('lightingReceipt');
const assertRenderedState = load('assertRenderedState', { assert });
const assertScreenshotState = load('assertScreenshotState', { assert, assertRenderedState });
const validNightLightState = load('validNightLightState');
const checkNightLightingCycle = load('checkNightLightingCycle', { validNightLightState });
const checks = load('checkAtmosphereCase', { lightingReceipt,
  clearWeatherState: load('clearWeatherState'), actualLightingChanges: load('actualLightingChanges'),
  requestedScenarios: load('requestedScenarios'), checkNightLightingCycle });
const weather = (timeOfDay, seed) => ({ version: 2, seed, biome: 'cold', condition: 'clear',
  precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1, timeOfDay });
const state = (timeOfDay, seed) => ({
  weather: weather(timeOfDay, seed), phase: 'battle', mapId: 'winter',
  precipitationAttached: false, preset: 'mobile', fogDensity: .0002,
  skies: [timeOfDay === 'night' ? .035 : 1],
  directional: [timeOfDay === 'night' ? .32 : 3.8], directionalColors: [[1, 1, 1]],
  hemi: .4, hemiColor: [1, 1, 1], clouds: [1.1, 1], cloudDecks: [],
  fogColor: [.1, .2, .3], environmentIntensity: 1, cloudShadeAmp: .1,
  worldUuid: 'same-world', camera: [[1, 2, 3], [0, 0, 0, 1], 50], playerPose: [1], raster: [2360, 1640],
  nightLighting: { ownerAvailable: true, uuid: 'pool', attached: timeOfDay === 'night',
    emitterCount: timeOfDay === 'night' ? 3 : 0, playerCoverage: { headlights: 2, shtora: 0 },
    lights: ['spot', 'spot', 'point'].map((kind, index) => ({ kind, uuid: `lamp-${index}`,
      intensity: timeOfDay === 'night' ? 80 : 0, castShadow: false, shadowMap: false })),
    materials: [{ uuid: 'lens', masked: true, kind: 'masked', color: [1, 1, 1],
      intensity: timeOfDay === 'night' ? 3 : 0, version: 1 }] },
  render: { stateEpoch: 1, completedEpoch: 1, renderCount: 30 },
});
const good = { mapId: 'winter', day: state('day', 1), night: state('night', 3), restored: state('day', 1),
  legacy: [state('day', 13), state('night', 3)],
  expected: [weather('day', 1), weather('night', 3), weather('day', 1), weather('day', 13), weather('night', 3)] };
const focusedChecks = load('checkFocusedFixtureCase', { checkNightLightingCycle });
function focusedRow(kind) {
  const row = { ...structuredClone(good), kind,
    specId: kind === 'shtora' ? 't90a_vladimir' : 'm1a1',
    fixture: { kind, ownerUuid: 'authored-mesh', materialUuid: 'lens', slot: 7,
      point: [1, 2, 3], lineOfSight: 'authored-emissive-face' } };
  for (const state of [row.day, row.night, row.restored]) {
    state.preset = 'high'; state.playerSpecId = row.specId;
    state.nightLighting.playerCoverage.shtora = 2;
    for (const light of state.nightLighting.lights) light.position = [1, 2, 3];
  }
  return row;
}
for (const kind of ['shtora', 'streetlamp']) {
  const row = focusedRow(kind);
  assert(Object.values(focusedChecks(row)).every(Boolean));
  for (const mutate of [
    row => { row.fixture.materialUuid = 'unrelated-glowing-glass'; },
    row => { row.night.playerSpecId = 'wrong-tank'; },
    row => { row.night.mapId = 'wrong-map'; },
    row => { row.night.camera[0][0]++; },
    row => { row.night.nightLighting.materials[0].intensity = 0; },
    row => { row.restored.nightLighting.materials[0].intensity = 3; },
    row => { row.night.render.completedEpoch = -1; },
  ]) {
    const failed = structuredClone(row); mutate(failed);
    assert(Object.values(focusedChecks(failed)).some(value => !value));
  }
}
{
  const row = focusedRow('shtora'); row.fixture.lineOfSight = null;
  assert.equal(focusedChecks(row).authoredShtora, false, 'property-only Shtora coverage is not exposed-aperture evidence');
  row.fixture.lineOfSight = 'authored-emissive-face'; row.night.nightLighting.playerCoverage.shtora = 0;
  assert.equal(focusedChecks(row).authoredShtora, false);
}
{
  const row = focusedRow('streetlamp'); row.fixture.slot = null;
  assert.equal(focusedChecks(row).actualStreetPool, false, 'window fallback cannot substitute for an actual lamp slot');
  row.fixture.slot = 7; row.night.nightLighting.lights[2].position = [100, 2, 3];
  assert.equal(focusedChecks(row).actualStreetPool, false, 'a point light on another fixture is not a pool beneath this lamp');
}
assert(Object.values(checks(good, 'mobile')).every(Boolean));
for (const mutate of [
  row => { row.legacy[0].weather.condition = 'rain'; },
  row => { row.legacy[0].precipitationAttached = true; },
  row => { row.legacy[1].weather.timeOfDay = 'day'; },
  row => { row.legacy[0].weather.seed = 999; },
  row => { row.night.weather.biome = 'tropical'; },
  row => { row.night.mapId = 'verdant'; },
  row => { row.night.phase = 'garage'; },
  row => { row.night.skies = [1]; },
  row => { row.night.directional = [3.8]; },
  row => { row.night.clouds = [.8, .8]; },
  row => { row.day.clouds = row.night.clouds = row.restored.clouds = []; },
  row => { row.night.fogDensity *= 1.2; },
  row => { row.restored.hemi = .28; },
  row => { row.restored.environmentIntensity = .035; },
  row => { row.night.worldUuid = 'replacement'; },
  row => { row.night.playerPose = [2]; },
  row => { row.night.camera[0][0] = 99; },
  row => { row.night.preset = 'high'; },
  row => { row.night.raster = [1180, 820]; },
  row => { row.night.render.completedEpoch = 0; },
  row => { row.night.render.renderCount = 0; },
  row => { row.night.nightLighting.attached = false; },
  row => { row.night.nightLighting.emitterCount = 0; },
  row => { row.night.nightLighting.playerCoverage.headlights = 0; },
  row => { row.night.nightLighting.lights[0].castShadow = true; },
  row => { row.night.nightLighting.lights[1].shadowMap = true; },
  row => { row.night.nightLighting.lights[0].intensity = NaN; },
  row => { row.night.nightLighting.lights.push(row.night.nightLighting.lights[0]); },
  row => { row.night.nightLighting.lights.forEach(light => { light.intensity = 0; }); },
  row => { row.night.nightLighting.materials[0].intensity = 0; },
  row => { row.restored.nightLighting.uuid = 'reconstructed-pool'; },
  row => { row.restored.nightLighting.materials[0].intensity = 3; },
  row => { row.restored.nightLighting.materials[0].version++; },
  row => { row.restored.nightLighting.lights[0].uuid = 'reconstructed-light'; },
  row => { row.legacy[1].nightLighting.lights[0].uuid = 'replaced-legacy-light'; },
  row => { row.restored.nightLighting.lights[0].intensity = 80; },
  row => { row.restored.nightLighting.attached = true; },
]) {
  const bad = structuredClone(good); mutate(bad);
  assert(Object.values(checks(bad, 'mobile')).some(value => !value), 'reject broken actual scenario/lighting/render receipt');
}
{
  const changedPattern = structuredClone(good);
  changedPattern.night.cloudDecks = [{ offset: [.8, .2], rotation: [0, 1] }];
  assert(Object.values(checks(changedPattern, 'mobile')).every(Boolean),
    'night sun elevation may change cloud phase; only authored opacity/density stay invariant');
}
assertScreenshotState(good.day, { ...good.day, render: { ...good.day.render, renderCount: 31 } });
for (const mutate of [
  snapshot => { snapshot.render.completedEpoch = 0; },
  snapshot => { snapshot.render.stateEpoch = snapshot.render.completedEpoch = 2; },
  snapshot => { snapshot.render.renderCount = 29; },
  snapshot => { snapshot.weather.seed = 88; },
  snapshot => { snapshot.camera[0][0] = 88; },
  snapshot => { snapshot.mapId = 'monsoon'; },
]) {
  const bad = structuredClone(good.day); mutate(bad);
  assert.throws(() => assertScreenshotState(good.day, bad), assert.AssertionError);
}
const validNativeGraphics = load('validNativeGraphics');
const native = { unmaskedGpu: true, contextLost: false, glError: 0, gpu: 'ANGLE Apple M5 Max' };
assert(validNativeGraphics(native));
for (const gpu of ['', '  ', null, undefined, 'SwiftShader', 'llvmpipe', 'software renderer']) {
  assert(!validNativeGraphics({ ...native, gpu }));
}
for (const overrides of [{ unmaskedGpu: false }, { contextLost: true }, { glError: 1282 }]) {
  assert(!validNativeGraphics({ ...native, ...overrides }));
}

// Exercise actual authored geometry/matrices and the maintained receipt/camera
// implementation. No browser, render call, scene surgery, or guessed lamp seat.
{
  const scene = new Scene(), world = new Group(), actor = new Group(), group = new Group();
  const camera = new PerspectiveCamera(50, 1.6, .5, 4000);
  camera.position.set(3, 7, 9); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const originalCamera = [camera.position.toArray(), camera.quaternion.toArray(), camera.fov];
  const spot = new SpotLight(0xffe2ad, 80), spot2 = new SpotLight(0xffe2ad, 80), point = new PointLight(0xffc889, 24);
  spot.position.set(1, 1, 2); spot.target.position.set(1, 1, 3);
  spot2.position.set(-1, 1, 2); spot2.target.position.set(-1, 1, 3);
  group.add(spot, spot2, point, spot.target, spot2.target); scene.add(world, actor, group);
  world.position.set(30, 1, -20); world.rotation.y = .3;
  const lampMaterial = new MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 3 });
  lampMaterial.userData.nightEmissionMask = true;
  const lampGeometry = new BoxGeometry(.3, .06, .2).translate(.98, 3.895, 0);
  lampGeometry.setAttribute('nightEmissionMask', new Float32BufferAttribute(new Array(lampGeometry.attributes.position.count).fill(1), 1));
  lampGeometry.setAttribute('nightFixtureActive', new Float32BufferAttribute([0, 1], 1));
  const lamp = new InstancedMesh(lampGeometry, lampMaterial, 2); lamp.name = 'destructible-lamp';
  const instance = new Matrix4().makeRotationY(.5).setPosition(10, 2, 15);
  lamp.setMatrixAt(1, instance); world.add(lamp);
  const windowMaterial = new MeshStandardMaterial({ emissive: 0xffbd72, emissiveIntensity: .55 });
  windowMaterial.userData.nightLightKind = 'window';
  const windowGeometry = new BoxGeometry(1, 2, .03), pane = new Mesh(windowGeometry, windowMaterial);
  markWorldWindowPane(windowGeometry, 'curtain', [0, 0, 1]);
  pane.position.set(0, 2, 0); world.add(pane);
  actor.userData.nightLightCoverage = { headlights: 2, shtora: 0 };
  const runtime = { group, lights: [spot, spot2, point], emitterCount: 4 };
  const probe = { epochs: 0, beginStateEpoch() { this.epochs++; } };
  const window = { __equipmentDamageProbe: probe, __DEBUG: { scene, camera, world: { group: world },
    inspectNightWindow: () => inspectNightWindow(world, camera.position),
    game: { player: { visual: { root: actor } } }, nightLighting: { current: runtime } } };
  load('installNightLightProbe', { window })();
  try {
    const nodes = scene.children.length;
    const receipt = probe.readNightLighting();
    assert.equal(receipt.ownerAvailable, true); assert.equal(receipt.attached, true);
    assert.equal(receipt.uuid, group.uuid); assert.equal(receipt.emitterCount, 4);
    assert.deepEqual(receipt.playerCoverage, actor.userData.nightLightCoverage);
    assert.equal(receipt.materials.length, 2);
    assert(receipt.materials.some(material => material.uuid === windowMaterial.uuid && material.kind === 'window'));
    const front = probe.stageNightLightCloseup('headlight');
    assert.deepEqual(front.point, [1, 1, 2]); assert.deepEqual(front.direction, [0, 0, 1]);
    assert.equal(front.ownerUuid, spot.uuid);
    const fixture = probe.stageNightLightCloseup('world');
    assert.equal(fixture.kind, 'streetlamp'); assert.equal(fixture.slot, 1,
      'a destroyed instance must never be chosen for the fixture screenshot');
    lamp.updateWorldMatrix(true, false);
    const expected = camera.position.clone().set(.98, 3.895, 0).applyMatrix4(instance).applyMatrix4(lamp.matrixWorld);
    assert(expected.distanceTo(camera.position.clone().fromArray(fixture.point)) < 1e-6,
      'fixture seat follows the real aperture vertices plus authored instance/world transforms');
    probe.restoreNightLightCamera();
    assert.deepEqual([camera.position.toArray(), camera.quaternion.toArray(), camera.fov], originalCamera);
    assert.equal(scene.children.length, nodes, 'readbacks and closeups add no fake lighting or geometry');
    lamp.removeFromParent();
    assert.equal(probe.stageNightLightCloseup('world').kind, 'window', 'occupied facade is an authored fallback');
    probe.restoreNightLightCamera(); pane.removeFromParent();
    assert.throws(() => probe.stageNightLightCloseup('world'), /No authored/);
    probe.restoreNightLightCamera(); spot.intensity = spot2.intensity = 0;
    assert.throws(() => probe.stageNightLightCloseup('headlight'), /No active authored/);
    probe.restoreNightLightCamera();
  } finally {
    lamp.dispose(); lampGeometry.dispose(); lampMaterial.dispose(); windowGeometry.dispose(); windowMaterial.dispose();
    spot.dispose(); spot2.dispose(); point.dispose();
  }
}

{
  const calls = [], window = { __DEBUG: {
    battleAtmosphere: { async prepare(seed, map) { calls.push(['atmosphere', seed, map]); } },
    nightLighting: { async prepare() { calls.push(['lamps']); } },
  }, __equipmentDamageProbe: { beginStateEpoch() { calls.push(['epoch']); } } };
  const prepare = load('atmosphereReceipt', { window, evaluateWithin: async (callback, argument) => callback(argument),
    settle: async count => { calls.push(['render', count]); }, readVisualState: () => good.night });
  assert.equal(await prepare(3, 'winter'), good.night);
  assert.deepEqual(calls, [['atmosphere', 3, 'winter'], ['lamps'], ['epoch'], ['render', 30]],
    'explicit atmosphere changes prepare actual lamps before observed frames and receipt capture');
}

const checkEquipmentGeometry = load('checkEquipmentGeometry', { assert });
{
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material), root = new Group();
  mesh.name = 'turretDark'; mesh.userData.combatHitboxRole = 'nonArmor'; root.add(mesh);
  const read = load('equipmentGeometryReceipt', { crypto: webcrypto,
    window: { __DEBUG: { game: { player: { visual: { root } } } } } });
  try {
    const before = await read();
    geometry.attributes.position.array[0] = .03; geometry.attributes.normal.array[0] = .02;
    const after = await read();
    geometry.attributes.position.array[0] = 0; geometry.attributes.normal.array[0] = 0;
    const reset = await read();
    checkEquipmentGeometry(before, after, reset);
    assert.throws(() => checkEquipmentGeometry(before, before, reset), /actual positions/);
    assert.throws(() => checkEquipmentGeometry(before, after, after), /exact positions/);
    const badBounds = structuredClone(reset); badBounds.sphere[1] += .04;
    assert.throws(() => checkEquipmentGeometry(before, after, badBounds), /exact positions/);
    const foreign = { ...reset, geometryUuid: 'foreign-geometry' };
    assert.throws(() => checkEquipmentGeometry(before, after, foreign), /ownership/);
    mesh.userData.combatHitboxRole = 'armor'; await assert.rejects(read(), /nonArmor/);
    mesh.userData.combatHitboxRole = 'nonArmor'; geometry.setIndex([0, 1, 2]);
    await assert.rejects(read(), /nonArmor/);
  } finally { geometry.dispose(); material.dispose(); }
}

async function exerciseEquipment(fault = null) {
  const report = {}, events = [], appliedEvents = [];
  const failure = new Error('reset failed');
  let resets = 0;
  const vector = { clone() { return this; }, set() { return this; }, copy() { return this; }, add() { return this; } };
  const visual = {
    root: { getObjectByName(name) { assert.equal(name, 'rig_turret'); return { localToWorld() {} }; } },
    applyEquipmentDamage(event) { appliedEvents.push(event); return fault === 'duplicate' || appliedEvents.length === 1; },
    resetDestroyed() { if (fault === 'reset') throw failure; resets++; },
  };
  const debug = {
    game: { player: { visual } },
    battleAtmosphere: { async prepare(...args) { assert.deepEqual(args, [1, 'verdant']); },
      current: { weather: { condition: 'clear', timeOfDay: 'day' } } },
    nightLighting: { async prepare() {} },
    scene: { getObjectByName() { return null; } },
    camera: { position: vector, lookAt() {}, updateProjectionMatrix() {} },
  };
  const fingerprint = () => ({ meshUuid: 'mesh', geometryUuid: 'geometry', role: 'nonArmor', box: null, sphere: null,
    position: { count: 36, sha256: appliedEvents.length && !resets ? 'dent' : 'rest' },
    normal: { count: 36, sha256: appliedEvents.length && !resets ? 'fold' : 'rest' } });
  const run = load('equipmentPictures', {
    assert, report, save() {}, checkEquipmentGeometry,
    window: { __DEBUG: debug, __equipmentDamageProbe: { beginStateEpoch() {} } },
    stage: async (...args) => { assert.deepEqual(args, ['verdant', 'leo2a6']); },
    evaluateWithin: async callback => callback(), readVisualState: () => good.day,
    equipmentGeometryReceipt: fingerprint,
    settle: async count => { assert.equal(count, 5); },
    screenshot: async (label, snapshot) => {
      assert.equal(snapshot, good.day); events.push({ label, applications: appliedEvents.length, resets });
    },
  });
  if (fault === 'reset') await assert.rejects(run(), error => error === failure);
  else if (fault === 'duplicate') await assert.rejects(run(), assert.AssertionError);
  else assert.deepEqual(await run(), { applied: true, duplicate: false });
  assert.equal(appliedEvents.length, 2);
  assert.strictEqual(appliedEvents[0], appliedEvents[1]);
  assert.deepEqual(appliedEvents[0], { impactFrame: 'turret', impactLocalPos: [.26, .405, -2.463],
    impactLocalNormal: [0, 0, -1], caliberMm: 120, kind: 'nonpen' });
  const expected = [
    { label: 'equipment-before', applications: 0, resets: 0 },
    { label: 'equipment-after', applications: 2, resets: 0 },
    { label: 'equipment-reset', applications: 2, resets: 1 },
  ];
  assert.deepEqual(events, expected.slice(0, fault === 'duplicate' ? 1 : fault === 'reset' ? 2 : 3));
  assert.deepEqual(report.equipment, { applied: true, duplicate: fault === 'duplicate' });
}
await exerciseEquipment(); await exerciseEquipment('duplicate'); await exerciseEquipment('reset');

for (const fault of [null, 'attached', 'weather', 'lighting', 'lamps', 'lamp-glow']) {
  const baseline = { ...structuredClone(good.day), phase: 'garage', weather: null };
  const restored = structuredClone(baseline);
  if (fault === 'attached') restored.precipitationAttached = true;
  if (fault === 'weather') restored.weather = good.night.weather;
  if (fault === 'lighting') restored.skies = [.035];
  if (fault === 'lamps') restored.nightLighting.attached = true;
  if (fault === 'lamp-glow') restored.nightLighting.lights[0].intensity = 80;
  const debug = { shotMode: true, async enterGarage() {} };
  let entries = 0;
  debug.enterGarage = async () => { entries++; };
  const enterAuthoredGarage = load('enterAuthoredGarage', { assert, assertRenderedState, validNightLightState,
    evaluateWithin: async callback => callback(), readVisualState: () => restored,
    settle: async count => assert.equal(count, 2),
    window: { __DEBUG: debug, __equipmentDamageProbe: { beginStateEpoch() {} } },
  });
  const run = load('garageReceipt', { assert, lightingReceipt, enterAuthoredGarage });
  if (fault) await assert.rejects(run(baseline), assert.AssertionError);
  else assert.deepEqual(await run(baseline), restored);
  assert.equal(debug.shotMode, false);
  assert.equal(entries, 1, 'baseline and return use the real Garage lifecycle, not preset writes');
}

assert(source.indexOf('report[`${tier.label}-coldGarage`]')
  < source.indexOf('const garageBaseline = await enterAuthoredGarage()'),
  'preserve the raw cold boot receipt before establishing the authored Garage baseline');

assert.doesNotMatch(source, /beginPrecipitationControl|setPrecipitationBudget|installFrameAccounting|p95Ms|sampleMs/);
assert.match(source, /No performance measurement or physical-device certification/);
assert.match(source, /child\.kill\('SIGKILL'\)/);
assert.match(source, /for \(const socket of previewSockets\) socket\.destroy\(\)/);
console.log('daynight-atmosphere-probe.selftest: completed original renders/deadlines/cleanup, capture epochs, exact scenarios, cloud opacity/fog density, geometry reset and Garage lighting');
