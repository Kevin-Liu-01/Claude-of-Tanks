import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DataTexture, Group, Scene, ShaderMaterial, Texture } from 'three';
import {
  ACQUISITION_PROTOCOL, settleMapTextures, applyTimingCamera, captureTimingState,
  requireComparableRun, requireTimingReceipt, requireSameTimingState,
  waitForTimingGarage, warmTimingGarage, captureTimingGarageOwner, captureTimingBackend,
  requireTimingGarageSetup, requireSameTimingGarageSetup,
  requireTimingBuildProvenance,
  selectTimingArchiveTarget, captureTimingGarageArchive, waitForTimingGarageArchiveEntry,
  captureTimingPhaseOwnership, requireTimingPhaseOwnership,
} from './map-environment-acquisition.mjs';
import { PINNED_SCENE } from './pinned-scene-acquisition.mjs';

assert.equal(ACQUISITION_PROTOCOL, 'settled-pinned-map-timing-v6', 'natural-entry acquisition is explicitly versioned');

const scene = {
  protocol: PINNED_SCENE.protocol, selectedSpecId: 'm1a1_abrams_hc',
  playerEntityId: 'm1a1_abrams_hc', playerSpecId: 'm1a1_abrams_hc',
  entities: PINNED_SCENE.roster.map((specId, index) => ({
    entityId: specId, team: index < 4 ? 'player' : 'enemy', specId,
    isPlayer: index === 0, visualSpecId: specId,
  })),
};
const archiveTarget = { primary: '/media/second.webp' };
assert.deepEqual(selectTimingArchiveTarget([
  { img: '/media/skipped.webp' },
  { img: '/media/first.webp', maps: ['verdant'] },
  { img: archiveTarget.primary, maps: ['winter'] },
]), archiveTarget);
assert.throws(() => selectTimingArchiveTarget([]), /canonical/);
assert.throws(() => selectTimingArchiveTarget([{ img: '/media/a', maps: ['a'] }]), /canonical/);
const archive = {
  protocol: 'decoded-canonical-archive-v2', displayCount: 1, residentImageCount: 1,
  screens: [{
    name: 'garage_slideshow_screen', source: archiveTarget.primary, width: 1024,
    height: 576, format: 1023, type: 1009, minFilter: 1008, magFilter: 1006,
    generateMipmaps: true, colorSpace: 'srgb', anisotropy: 4, transition: 0, pairedUniforms: true,
  }],
};
const settings = {
  protocol: ACQUISITION_PROTOCOL, harnessHash: 'same-tool-content-hash',
  viewport: { width: 1440, height: 900, dpr: 1 }, sampleCount: 90, repeats: 3,
  settleMs: 2500, syncGpu: false, tier: 'desktop', captureShots: false, production: true,
  garageArchiveTarget: archiveTarget, maps: ['verdant'],
};
const garage = {
  built: true, variant: 'verdant_motor_pool', mapId: 'verdant', exhibitCount: 5,
  sourceVehicleIds: ['t90a_burlak_proto', 'm1a1_abrams_hc', 'leo2a4m', 't90am', 'xk2_black_panther'],
  optimizedTriangleParity: true, triangles: 100, optimizedTriangles: 100,
  nodes: 3, meshes: 2, geometries: 1, materials: 2, textures: 2,
};
const phaseReceipt = garage => ({
  protocol: 'exclusive-phase-owners-v1', mapId: 'verdant',
  owner: { garageMounted: garage, worldMounted: !garage },
  garageDressing: { parentIsScene: garage, parentIsNull: !garage, visible: garage },
  battlefield: { parentIsScene: !garage, parentIsNull: garage, visible: !garage },
});
const garageSetup = {
  ownerBefore: garage, owner: garage,
  phaseBefore: phaseReceipt(true), phaseOwnership: phaseReceipt(true),
  archiveBefore: archive, archive, archiveWait: { protocol: 'natural-canonical-entry-v1',
    target: archiveTarget, elapsedMs: 300, timeoutMs: 120000,
    departureObserved: true, departureElapsedMs: 100 },
  warm: { frames: 8, stable: true, archiveUnchanged: true, renderer: { geometries: 100, textures: 30, programs: 20 } },
  backend: { vendor: 'Apple', renderer: 'ANGLE Metal Renderer: Apple M5 Max', version: 'WebGL 2.0', contextLost: false },
  browserVersion: 'Chrome/151.0.7922.47',
};
const receipt = {
  phaseOwnership: phaseReceipt(false),
  garage, garageArchive: archive,
  scene, readiness: { mapId: 'verdant', settled: true, evidence: 'legacy-settled-promise', results: null },
  terrain: { protocol: 'countdown-lookahead-v1', jobs: 3, exhausted: true, verified: true, pendingAfterRender: 0,
    topology: { worldUuid: 'world-one', camera: [1, 2, 3, 0, 0, 0, 1],
      initialGeometryCount: 64, streamedGeometryCount: 3, indexReferences: 67 } },
  state: {
    mapId: 'verdant',
    camera: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], fov: 55, near: 0.1, far: 8000 },
    render: { canvas: [1440, 900], pixelRatio: 1, renderScale: 1, dynScale: 1,
      postAA: 'smaa+fsr1', msaaSamples: 4, preset: 'high', perfTrim: 0, gtao: true, bloom: true, contextLost: false },
  },
};
const baseline = {
  schemaVersion: 6, acquisition: settings, buildIndexHash: 'a'.repeat(64), pageErrors: [], garageSetup,
  maps: [{ id: 'verdant', acquisition: receipt, frames: { runs: Array.from({ length: 3 }, () => ({
    sampleCount: 90, medianMs: 16, p95Ms: 20, renderMedianMs: 12, renderP95Ms: 16,
    callsMax: 700, trianglesMax: 4000000, acquisitionBefore: receipt, acquisitionAfter: receipt,
  })) } }],
};
requireComparableRun(baseline, settings);
assert.throws(() => requireComparableRun({ ...baseline,
  acquisition: { ...settings, protocol: 'settled-pinned-map-timing-v5' } }, settings), /recapture/,
  'historical static images do not become a fresh-entry timing baseline');
requireComparableRun(baseline, { ...settings, maps: ['verdant', 'oasis'] });
for (const [key, value] of [
  ['sampleCount', 100], ['repeats', 5], ['settleMs', 1100], ['syncGpu', true], ['tier', 'auto'],
  ['harnessHash', 'other-tool'], ['viewport', { width: 1920, height: 1080, dpr: 1 }],
  ['maps', ['oasis', 'verdant']], ['captureShots', true], ['production', false], ['production', undefined],
  ['garageArchiveTarget', { primary: '/media/wrong.webp' }],
  ['protocol', 'settled-pinned-map-timing-v5'],
]) assert.throws(() => requireComparableRun(baseline, { ...settings, [key]: value }), undefined, key);
assert.throws(() => requireComparableRun({ schemaVersion: 2 }, settings), /recapture/);
assert.throws(() => requireComparableRun({ ...baseline, schemaVersion: 3 }, settings), /recapture/);
assert.throws(() => requireComparableRun({ ...baseline, schemaVersion: 4 }, settings), /recapture/);
assert.throws(() => requireComparableRun({ ...baseline, schemaVersion: 5 }, settings), /recapture/);
requireComparableRun({ ...baseline, buildIndexHash: 'b'.repeat(64) }, settings);
const development = { ...baseline, acquisition: { ...settings, production: false }, buildIndexHash: null };
requireComparableRun(development, development.acquisition);
assert.throws(() => requireComparableRun(development, settings), /production/);
for (const buildIndexHash of [undefined, null, '', 'not-a-sha', 'a'.repeat(63), ['a'.repeat(64)]]) {
  assert.throws(() => requireTimingBuildProvenance({ ...baseline, buildIndexHash }), /provenance/);
}
assert.throws(() => requireTimingBuildProvenance({ ...development, buildIndexHash: 'a'.repeat(64) }), /provenance/);
assert.throws(() => requireTimingBuildProvenance({ ...baseline, acquisition: {} }), /mode/);
for (const mutate of [
  b => { b.pageErrors.push('shader failure'); },
  b => { b.acquisitionError = 'warm failed'; },
  b => { b.maps[0].frames.runs.pop(); },
  b => { b.maps[0].frames.runs[0].sampleCount--; },
  b => { b.maps[0].frames.runs[0].renderMedianMs = NaN; },
  b => { b.maps[0].frames.runs[0].acquisitionAfter.state.render.dynScale = 0.9; },
  b => { b.maps[0].acquisition.scene.playerSpecId = 'm1a3'; },
  b => { b.maps[0].acquisition.readiness.results = [{ applied: false, failures: ['load failed'] }]; },
  b => { b.maps[0].acquisition.readiness.evidence = 'unknown'; },
  b => { b.maps[0].acquisition.terrain.pendingAfterRender = 1; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.terrain.topology.streamedGeometryCount++; },
  b => { delete b.garageSetup; },
  b => { delete b.garageSetup.phaseBefore; },
  b => { delete b.garageSetup.phaseOwnership; },
  b => { b.garageSetup.phaseBefore.battlefield.parentIsScene = true; },
  b => { b.garageSetup.phaseOwnership.owner.worldMounted = true; },
  b => { b.garageSetup.phaseOwnership.garageDressing.visible = false; },
  b => { b.garageSetup.phaseOwnership.mapId = 'coastal'; },
  b => { b.garageSetup.owner.built = false; },
  b => { b.garageSetup.ownerBefore.geometries++; },
  b => { b.garageSetup.warm.frames = 9; },
  b => { b.garageSetup.warm.stable = false; },
  b => { b.garageSetup.warm.archiveUnchanged = false; },
  b => { delete b.garageSetup.archive; },
  b => { b.garageSetup.archive.screens[0].width++; },
  b => { b.garageSetup.archive.screens[0].pairedUniforms = false; },
  b => { b.garageSetup.archive.screens[0].transition = 0.1; },
  b => { b.garageSetup.archive.screens[0].format = undefined; },
  b => { b.garageSetup.archive.residentImageCount = 3; },
  b => { b.garageSetup.archiveWait.elapsedMs = 120001; },
  b => { b.garageSetup.archiveWait.timeoutMs = 240000; },
  b => { delete b.garageSetup.archiveWait.protocol; },
  b => { b.garageSetup.archiveWait.departureObserved = false; },
  b => { b.garageSetup.archiveWait.departureElapsedMs = -1; },
  b => { b.garageSetup.archiveWait.departureElapsedMs = 301; },
  b => { delete b.acquisition.garageArchiveTarget; },
  b => { b.garageSetup.backend.contextLost = true; },
  b => { b.garageSetup.backend.renderer = ''; },
  b => { b.garageSetup.warm.renderer.programs = NaN; },
  b => { b.maps[0].acquisition.garage.geometries++; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.garage.textures++; },
  b => { delete b.maps[0].acquisition.phaseOwnership; },
  b => { b.maps[0].frames.runs[1].acquisitionBefore.phaseOwnership.owner.garageMounted = true; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.phaseOwnership.garageDressing.parentIsScene = true; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.phaseOwnership.battlefield.visible = false; },
  b => { b.maps[0].acquisition.garageArchive.screens[0].width++; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.garageArchive.screens[0].width++; },
]) {
  // JSON clone deliberately breaks shared references like a report on disk.
  const broken = JSON.parse(JSON.stringify(baseline));
  mutate(broken);
  assert.throws(() => requireComparableRun(broken, settings));
}
requireTimingReceipt(receipt, 'verdant', settings.viewport);
for (const isGarage of [true, false]) {
  const phase = isGarage ? 'garage' : 'battlefield';
  const valid = phaseReceipt(isGarage);
  requireTimingPhaseOwnership(valid, phase, 'verdant');
  for (const mutate of [
    p => { p.owner.garageMounted = !p.owner.garageMounted; },
    p => { p.owner.worldMounted = !p.owner.worldMounted; },
    p => { p.garageDressing.parentIsScene = !p.garageDressing.parentIsScene; },
    p => { p.garageDressing.parentIsNull = !p.garageDressing.parentIsNull; },
    p => { p.garageDressing.visible = !p.garageDressing.visible; },
    p => { p.battlefield.parentIsScene = !p.battlefield.parentIsScene; },
    p => { p.battlefield.parentIsNull = !p.battlefield.parentIsNull; },
    p => { p.battlefield.visible = !p.battlefield.visible; },
    p => { delete p.battlefield; },
    p => { p.mapId = 'coastal'; },
  ]) {
    const broken = structuredClone(valid);
    mutate(broken);
    assert.throws(() => requireTimingPhaseOwnership(broken, phase, 'verdant'), /phase/);
  }
}
assert.throws(() => requireTimingPhaseOwnership({ phase: 'garage' }, 'garage', 'verdant'), /phase/);
for (const mutate of [
  r => { r.state.render.perfTrim = 1; },
  r => { r.state.render.renderScale = 0.8; },
  r => { r.state.render.canvas[0] = 1000; },
  r => { r.state.camera.position[0] = NaN; },
  r => { r.readiness.settled = false; },
  r => { r.readiness.evidence = 'verified-target-results'; r.readiness.results = [{ applied: true, failures: ['decode'] }]; },
  r => { r.terrain.verified = false; },
  r => { r.terrain.topology.camera[0]++; },
  r => { r.state.render.contextLost = true; },
  r => { r.garage.exhibitCount = 0; },
  r => { r.garage.variant = 'fjord_drydock'; },
  r => { r.garage.sourceVehicleIds.reverse(); },
]) {
  const broken = structuredClone(receipt);
  mutate(broken);
  assert.throws(() => requireTimingReceipt(broken, 'verdant', settings.viewport));
}
for (const mutate of [
  r => { r.state.camera.position[1]++; },
  r => { r.state.render.msaaSamples = 0; },
  r => { r.state.render.gtao = false; },
  r => { r.scene.entities.reverse(); },
  r => { r.terrain.topology.indexReferences++; },
  r => { r.garage.materials++; },
  r => { r.garageArchive.screens[0].width++; },
]) {
  const changed = structuredClone(receipt);
  mutate(changed);
  assert.throws(() => requireSameTimingState(receipt, changed), /changed/);
}
requireTimingGarageSetup(garageSetup);
requireSameTimingGarageSetup(garageSetup, structuredClone(garageSetup));
for (const mutate of [
  g => { g.owner.textures++; },
  g => { g.backend.renderer = 'SwiftShader'; },
  g => { g.backend.vendor = 'Other'; },
  g => { g.browserVersion = 'Chrome/152'; },
  g => { g.archive.screens[0].width++; g.archiveBefore.screens[0].width++; },
  g => { g.archive.screens[0].minFilter++; g.archiveBefore.screens[0].minFilter++; },
]) {
  const changed = structuredClone(garageSetup);
  mutate(changed);
  assert.throws(() => requireSameTimingGarageSetup(garageSetup, changed), /changed/);
}

const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const vector = value => ({ value: [...value], fromArray(next) { this.value = [...next]; }, toArray() { return this.value; } });
let lodUpdates = 0;
let lightingUpdates = 0;
const camera = {
  position: vector([0, 0, 0]), quaternion: vector([0, 0, 0, 1]), fov: 1, near: 1, far: 1,
  updateProjectionMatrix() {}, updateMatrixWorld() {},
};
const world = { mapId: 'verdant', update() { lodUpdates++; },
  minimapTextureState: { promise: Promise.resolve(), settled: true } };
const debug = {
  world, camera,
  lighting: { updateFrustums() {}, update() { lightingUpdates++; } },
  renderer: { domElement: { width: 1440, height: 900, dataset: { renderScale: '1.000', postAa: 'smaa+fsr1' } },
    getPixelRatio: () => 1, getContext: () => ({ isContextLost: () => false }) },
  post: { dynScale: 1, msaaSamples: 4, perfTrim: 0, gtao: { enabled: true }, bloom: { enabled: true } },
  quality: { resolvePresetName: () => 'high' },
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: { __DEBUG: debug } });
window.location = { href: 'http://127.0.0.1:1234/' };
// Reconstructing browser functions proves they do not close over Node imports.
const browserSettle = Function(`return (${settleMapTextures.toString()})`)();
try {
  const actualScene = new Scene(), actualWorld = new Group(), actualDressing = new Group();
  debug.scene = actualScene;
  world.group = actualWorld;
  debug.garageDressing = { group: actualDressing };
  debug.phaseSceneResidency = { garageMounted: true, worldMounted: false, mounts: 7, unmounts: 6 };
  actualScene.add(actualDressing);
  actualWorld.visible = false;
  const browserPhase = Function(`return (${captureTimingPhaseOwnership.toString()})`)();
  assert.deepEqual(browserPhase(), phaseReceipt(true), 'actual Three parent and visibility proof');
  assert.ok(actualDressing.parent === actualScene, 'capture does not change scene ownership');
  actualScene.add(actualWorld);
  assert.throws(() => requireTimingPhaseOwnership(browserPhase(), 'garage', 'verdant'), /root/,
    'claimed Garage-only flags do not hide an attached world');
  actualWorld.visible = true;
  actualDressing.removeFromParent();
  actualDressing.visible = false;
  debug.phaseSceneResidency = { garageMounted: false, worldMounted: true };
  assert.deepEqual(browserPhase(), phaseReceipt(false));
  const unrelatedParent = new Group();
  unrelatedParent.add(actualDressing);
  assert.throws(() => requireTimingPhaseOwnership(browserPhase(), 'battlefield', 'verdant'), /root/,
    'a hidden root parented elsewhere is not a detached phase owner');
  actualDressing.removeFromParent();
  delete debug.phaseSceneResidency;
  assert.throws(browserPhase, /Missing timing phase owner/);
  debug.phaseSceneResidency = { garageMounted: false, worldMounted: true };
  delete world.group;
  assert.throws(browserPhase, /Missing actual timing phase root/);
  world.group = actualWorld;
  const legacy = await browserSettle({ mapId: 'verdant' });
  assert.equal(legacy.evidence, 'legacy-settled-promise');
  world.minimapTextureState.results = [{ target: 'ground', applied: true, failures: [] }];
  assert.equal((await browserSettle({ mapId: 'verdant' })).evidence, 'verified-target-results');
  world.minimapTextureState.results[0].applied = false;
  await assert.rejects(browserSettle({ mapId: 'verdant' }), /application failed/);
  delete world.minimapTextureState.results;
  world.minimapTextureState.settled = false;
  await assert.rejects(browserSettle({ mapId: 'verdant' }), /unsettled/);
  world.minimapTextureState.promise = new Promise(() => {});
  await assert.rejects(browserSettle({ mapId: 'verdant', timeoutMs: 1 }), /timeout/);
  world.minimapTextureState.promise = Promise.resolve().then(() => { debug.world = { ...world }; });
  await assert.rejects(browserSettle({ mapId: 'verdant' }), /changed/);
  debug.world = world;
  Function(`return (${applyTimingCamera.toString()})`)()(receipt.state.camera);
  assert.equal(lodUpdates, 1);
  assert.equal(lightingUpdates, 1);
  assert.deepEqual(Function(`return (${captureTimingState.toString()})`)()(), receipt.state);

  let built = false, forcedDrains = 0;
  const idle = { current: 'dressing', queued: 0 };
  debug.game = { phase: 'garage' };
  debug.garageDressing = { isBuilt: () => built };
  window.__GARAGE_IDLE_WORK = idle;
  window.__GARAGE_WORKSHOP = { async ensureBuilt() {
    assert.equal(built, true, 'never force chunks before the natural builder finishes');
    assert.equal(idle.current, null, 'never race an in-flight quiet lease');
    forcedDrains++;
  } };
  const browserGarageWait = Function(`return (${waitForTimingGarage.toString()})`)();
  await assert.rejects(browserGarageWait({ timeoutMs: 1, pollMs: 1 }), /timeout/);
  assert.equal(forcedDrains, 0);
  built = true;
  await assert.rejects(browserGarageWait({ timeoutMs: 1, pollMs: 1 }), /timeout/);
  assert.equal(forcedDrains, 0, 'built alone does not bypass an outstanding lease');
  idle.current = null;
  await browserGarageWait();
  assert.equal(forcedDrains, 1);
  debug.game.phase = 'shot';
  await assert.rejects(browserGarageWait(), /left Garage/);

  const render = () => {};
  // the slideshow's stills are ImageBitmaps (no complete/naturalWidth); the texture records its own source
  const monitorTexture = {
    ...archive.screens[0], isTexture: true, userData: { archiveSource: `http://127.0.0.1:1234${archiveTarget.primary}` },
    image: { width: archive.screens[0].width, height: archive.screens[0].height },
  };
  const otherTexture = { ...monitorTexture, userData: { archiveSource: '/media/first.webp' } };
  const monitorObject = {
    name: 'garage_slideshow_screen', material: { uniforms: {
      uImageA: { value: monitorTexture }, uImageB: { value: monitorTexture }, uTransition: { value: 0 },
    } },
  };
  const uniforms = monitorObject.material.uniforms;
  const archiveData = { battleScreenDisplayCount: 1, battleScreenResidentImageCount: 1,
    battleScreenCurrentImage: archiveTarget.primary };
  debug.garageDressing.group = { userData: archiveData,
    getObjectByName: name => (name === monitorObject.name ? monitorObject : undefined) };
  const browserArchive = Function(`return (${captureTimingGarageArchive.toString()})`)();
  assert.deepEqual(browserArchive(archiveTarget), archive);
  assert.equal(browserArchive(archiveTarget, true), null, 'an already-matching hold is not a fresh entry');
  const pendingStates = [
    () => { monitorTexture.isDataTexture = true; },
    () => { monitorTexture.image.complete = false; },
    () => { monitorTexture.image.width = 0; },
    () => { delete monitorTexture.userData.archiveSource; },
    () => { archiveData.battleScreenResidentImageCount = 2; },
    () => { archiveData.battleScreenDisplayCount = 2; },
    () => { archiveData.battleScreenCurrentImage = '/media/not-ready.webp'; },
    () => { uniforms.uTransition.value = 0.4; },
    () => { uniforms.uImageB.value = otherTexture; },
  ];
  for (const mutate of pendingStates) {
    mutate();
    assert.equal(browserArchive(archiveTarget), null, 'partial/failed/transitioning producer is not ready');
    assert.equal(browserArchive(archiveTarget, true), true, 'observe the actual producer leaving the canonical hold');
    delete monitorTexture.isDataTexture;
    delete monitorTexture.image.complete;
    monitorTexture.image.width = archive.screens[0].width;
    monitorTexture.userData.archiveSource = `http://127.0.0.1:1234${archiveTarget.primary}`;
    archiveData.battleScreenResidentImageCount = 1;
    archiveData.battleScreenDisplayCount = 1;
    archiveData.battleScreenCurrentImage = archiveTarget.primary;
    uniforms.uTransition.value = 0;
    uniforms.uImageB.value = monitorTexture;
  }
  assert.equal(browserArchive({ primary: '/media/other.webp' }), null,
    'a different decoded steady phase must wait for the canonical recurring image');
  const getMonitor = debug.garageDressing.group.getObjectByName;
  debug.garageDressing.group.getObjectByName = () => undefined;
  assert.throws(() => browserArchive(archiveTarget), /Missing Garage archive producer/);
  debug.garageDressing.group.getObjectByName = getMonitor;
  debug.post.render = render;
  debug.renderer.info = { memory: { geometries: 100, textures: 30 }, programs: Array(20) };
  const browserGarageWarm = Function(`return (${warmTimingGarage.toString()})`)();
  const warmed = browserGarageWarm({ archive });
  for (let frame = 0; frame < 7; frame++) debug.post.render();
  assert.notEqual(debug.post.render, render, 'seven actual renders are not eight');
  debug.post.render();
  assert.deepEqual(await warmed, garageSetup.warm);
  assert.equal(debug.post.render, render);
  const unstable = browserGarageWarm({ archive });
  for (let frame = 0; frame < 7; frame++) debug.post.render();
  debug.renderer.info.memory.geometries++;
  debug.post.render();
  assert.equal((await unstable).stable, false, 'late work fails; it does not add warm frames');
  await assert.rejects(browserGarageWarm({ archive, timeoutMs: 1 }), /only 0\/8/);
  assert.equal(debug.post.render, render, 'timeout restores the real renderer');
  const failedRender = () => { throw new Error('render failure'); };
  debug.post.render = failedRender;
  const renderFailure = browserGarageWarm({ archive });
  assert.throws(() => debug.post.render(), /render failure/);
  await assert.rejects(renderFailure, /render failure/);
  assert.equal(debug.post.render, failedRender, 'exception restores the real renderer');
  debug.post.render = render;
  const transitionFailure = browserGarageWarm({ archive });
  debug.post.render();
  uniforms.uImageB.value = otherTexture;
  assert.throws(() => debug.post.render(), /archive changed/);
  await assert.rejects(transitionFailure, /archive changed/);
  assert.equal(debug.post.render, render, 'mid-warm transition fails without retrying or adding frames');
  uniforms.uImageB.value = monitorTexture;
  for (const mutate of [
    () => { archiveData.battleScreenResidentImageCount = 2; },
    () => { uniforms.uImageA.value = otherTexture; },
    () => { uniforms.uTransition.value = 0.01; },
  ]) {
    const guarded = browserGarageWarm({ archive });
    mutate();
    assert.throws(() => debug.post.render(), /submitted frame 1\/8.*residentImages=.*screens=/);
    await assert.rejects(guarded, /archive changed/);
    assert.equal(debug.post.render, render);
    archiveData.battleScreenResidentImageCount = 1;
    uniforms.uImageA.value = monitorTexture;
    uniforms.uTransition.value = 0;
  }

  const texture = { isTexture: true }, shaderTexture = { isTexture: true };
  const geometry = {};
  const objects = [{}, { isMesh: true, geometry, material: { map: texture } },
    { isMesh: true, geometry, material: [{ uniforms: { map: { value: shaderTexture } } }] }];
  debug.garageDressing.group = { traverse: visit => objects.forEach(visit) };
  window.__GARAGE_WORKSHOP.stats = () => ({ ...garage, selected: garage.variant });
  assert.deepEqual(Function(`return (${captureTimingGarageOwner.toString()})`)()(), garage);
  const extension = { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
  debug.renderer.getContext = () => ({ VERSION: 3, getExtension: () => extension,
    getParameter: key => [null, garageSetup.backend.vendor, garageSetup.backend.renderer, garageSetup.backend.version][key],
    isContextLost: () => false });
  const browserBackend = Function(`return (${captureTimingBackend.toString()})`)();
  assert.deepEqual(browserBackend(), garageSetup.backend);
  debug.renderer.getContext = () => ({ getExtension: () => null });
  assert.throws(browserBackend, /unavailable/);
} finally {
  if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
  else delete globalThis.window;
}

const tool = fs.readFileSync(new URL('./map-environment-audit.mjs', import.meta.url), 'utf8');
// One slideshow material (garage r9, no clone for a second screen): the fallback and the first decoded image each alias
// both uniforms; only a crossfade holds a second image.
const fallback = new DataTexture(new Uint8Array([10, 20, 18, 255]), 1, 1);
const slideshow = new ShaderMaterial({ uniforms: { uImageA: { value: fallback }, uImageB: { value: fallback } } });
const uniformCount = () => new Set([slideshow.uniforms.uImageA.value, slideshow.uniforms.uImageB.value]).size;
assert.equal(uniformCount(), 1, 'the fallback aliases both uniforms');
const firstImage = new Texture(), nextImage = new Texture();
slideshow.uniforms.uImageA.value = slideshow.uniforms.uImageB.value = firstImage;
assert.equal(uniformCount(), 1, 'the decoded image replaces the fallback');
slideshow.uniforms.uImageB.value = nextImage;
assert.equal(uniformCount(), 2, 'the crossfade holds the incoming image beside the current one');
assert.ok(tool.includes("const production = flagArg('production')"), 'CLI production flag is actually consumed');
assert.ok(tool.includes("fs.readFileSync(path.join(ROOT, 'dist/index.html'))"), 'hash the served build index');
assert.ok(tool.includes('if (readBuildIndexHash() !== report.buildIndexHash)'), 'a replaced build invalidates timing');
// Execute the exact production/dev selection and close branches with ports;
// these fixtures launch neither a server nor a browser.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const archiveStart = tool.indexOf('  const { archiveBefore, archiveWait } =');
const archiveEnd = tool.indexOf('  const garageOwner =', archiveStart);
const waitForArchive = new AsyncFunction('page', 'waitForTimingGarageArchiveEntry', 'garageArchiveTarget',
  `${tool.slice(archiveStart, archiveEnd)}\nreturn { archiveBefore, archiveWait };`);
for (const initiallyMatching of [false, true]) {
  let clockMs = 0, archiveDisposals = 0;
  const phases = [], timeouts = [];
  const page = { async waitForFunction(fn, options, target, departing) {
    assert.equal(fn, captureTimingGarageArchive);
    assert.equal(options.polling, 100);
    assert.deepEqual(target, archiveTarget);
    phases.push(departing); timeouts.push(options.timeout);
    clockMs += departing ? (initiallyMatching ? 6400 : 100) : 36000;
    return { jsonValue: async () => departing ? true : archive,
      dispose: async () => { archiveDisposals++; } };
  } };
  const acquire = (port, target) => waitForTimingGarageArchiveEntry(port, target, { now: () => clockMs });
  const result = await waitForArchive(page, acquire, archiveTarget);
  assert.deepEqual(phases, [true, false], 'one departure then one entry; no warm/retry loop');
  assert.deepEqual(timeouts, [120000, initiallyMatching ? 113600 : 119900], 'entry receives only remaining total budget');
  assert.deepEqual(result.archiveBefore, archive);
  assert.equal(result.archiveWait.protocol, 'natural-canonical-entry-v1');
  assert.equal(result.archiveWait.departureObserved, true);
  assert.equal(result.archiveWait.departureElapsedMs, initiallyMatching ? 6400 : 100);
  assert.equal(result.archiveWait.elapsedMs, clockMs);
  assert.equal(archiveDisposals, 2, 'release both scalar browser handles');
}
for (const failingPhase of [true, false]) {
  const phases = [];
  await assert.rejects(waitForTimingGarageArchiveEntry({ async waitForFunction(fn, options, target, departing) {
    phases.push(departing);
    if (departing === failingPhase) throw new Error('archive image predicate timed out');
    return { jsonValue: async () => true, dispose: async () => {} };
  } }, archiveTarget), /timed out/, 'a missing natural edge fails without another attempt');
  assert.deepEqual(phases, failingPhase ? [true] : [true, false]);
}
let deadlineClock = 0, deadlineWaits = 0, deadlineDisposals = 0;
await assert.rejects(waitForTimingGarageArchiveEntry({ async waitForFunction() {
  deadlineWaits++;
  return { jsonValue: async () => true, dispose: async () => { deadlineClock = 120000; deadlineDisposals++; } };
} }, archiveTarget, { now: () => deadlineClock }), /total 120000 ms deadline/);
assert.equal(deadlineWaits, 1, 'do not reset the timeout after departure consumes its budget');
assert.equal(deadlineDisposals, 1);
let brokenHandleDisposals = 0;
await assert.rejects(waitForTimingGarageArchiveEntry({ async waitForFunction() {
  return { jsonValue: async () => { throw new Error('scalar read failed'); },
    dispose: async () => { brokenHandleDisposals++; } };
} }, archiveTarget), /scalar read failed/);
assert.equal(brokenHandleDisposals, 1, 'failed scalar reads still release their handle');
const serverStart = tool.indexOf('  const selectedPort =');
const serverEnd = tool.indexOf('  const address =', serverStart);
assert.ok(serverStart > 0 && serverEnd > serverStart);
const selectServer = new AsyncFunction('production', 'ROOT', 'preview', 'createServer',
  `let server;\n${tool.slice(serverStart, serverEnd)}\nreturn server;`);
for (const production of [true, false]) {
  const calls = [];
  const stub = { listen: async () => calls.push('listen') };
  const make = kind => async options => {
    calls.push(kind);
    assert.equal(options.root, '/fixture/build');
    const network = production ? options.preview : options.server;
    assert.equal(network.host, '127.0.0.1');
    assert.equal(network.port, 0, 'both branches request an OS-assigned port, never blocked random 6566');
    return stub;
  };
  assert.equal(await selectServer(production, '/fixture/build', make('preview'), make('dev')), stub);
  assert.deepEqual(calls, production ? ['preview'] : ['dev', 'listen']);
}
const addressStart = tool.indexOf('  const address =', serverStart);
const addressEnd = tool.indexOf('  browser =', addressStart);
assert.ok(addressEnd > addressStart);
const actualPort = new Function('server', `${tool.slice(addressStart, addressEnd)}\nreturn port;`);
for (const port of [49152, 51999]) {
  assert.equal(actualPort({ config: { server: { port: 0 }, preview: { port: 0 } },
    httpServer: { address: () => ({ address: '127.0.0.1', port }) } }), port,
  'navigation resolves the bound port, never configured zero or a guessed fallback');
}
assert.match(tool, /page\.goto\(`http:\/\/127\.0\.0\.1:\$\{port\}/, 'navigation uses the resolved server address');
const closeStart = tool.lastIndexOf('} finally {\n  try {\n    if (browser)');
assert.ok(closeStart > 0);
const closeOwned = new AsyncFunction('browser', 'server', 'clearInterval', 'releaseCaptureLock', 'lockRefresher',
  `try {} ${tool.slice(closeStart + 2)}`);
for (const mode of ['dev', 'preview', 'browser-error', 'server-error', 'none']) {
  const calls = [];
  const browser = mode === 'none' ? null : { async close() {
    calls.push('browser');
    if (mode === 'browser-error') throw new Error('browser close failed');
  } };
  const server = mode === 'none' ? null : mode === 'dev'
    ? { async close() { calls.push('dev'); } }
    : { httpServer: { close(done) {
      calls.push('preview'); done(mode === 'server-error' ? new Error('server close failed') : undefined);
    } } };
  const closing = closeOwned(browser, server, () => calls.push('timer'), () => calls.push('lock'), 1);
  if (mode.endsWith('-error')) await assert.rejects(closing, /close failed/);
  else await closing;
  assert.deepEqual(calls, mode === 'none' ? ['timer', 'lock']
    : ['browser', mode === 'dev' ? 'dev' : 'preview', 'timer', 'lock']);
}
assert.ok(tool.indexOf('evaluateOnNewDocument(primePinnedSceneStorage') < tool.indexOf('page.goto('));
assert.ok(tool.includes('if (prior) await page.evaluate(applyTimingCamera, prior.state.camera)'));
assert.ok(tool.includes('await page.evaluate(settleMapTextures, { mapId })'));
assert.ok(tool.includes('await page.evaluate(settleResidencyTerrain, prepared.terrain)'));
assert.ok(tool.includes('await page.evaluate(sampleRenderedFrames, { count: 8, syncGpu })'));
assert.ok(tool.indexOf('await page.evaluate(waitForTimingGarage)') < tool.indexOf("window.__SHOTS.set('garage')"));
assert.ok(tool.indexOf('await page.evaluate(warmTimingGarage,') < tool.indexOf('for (const mapId of requested)'));
assert.ok(tool.indexOf("window.__SHOTS.set('garage')") < archiveStart);
assert.ok(archiveEnd < tool.indexOf('await page.evaluate(warmTimingGarage,'));
assert.ok(tool.includes("path.join(ROOT, 'src/ui/featuredShots.ts')"), 'derive the canonical pair from each served root');
assert.ok(tool.includes('phaseOwnership: await page.evaluate(captureTimingPhaseOwnership)'),
  'map timing and final Garage setup capture the live phase-owner/root receipt');
assert.ok(tool.indexOf("requireTimingPhaseOwnership(phaseBefore, 'garage', 'verdant')")
  < tool.indexOf('await page.evaluate(warmTimingGarage,'), 'reject overlapping Garage owners before warmup');
assert.ok(tool.includes('if (baseline) requireSameTimingGarageSetup(baseline.garageSetup, report.garageSetup)'));
assert.ok(tool.includes("path.join(ROOT, 'src/world/maps/index.ts')"), 'target root owns map catalog');
console.log('map-environment-acquisition: actual exclusive phase roots, canonical decoded archive/deadline/capacity, production provenance/cleanup, fixed eight renders, actual GPU and strict repeated pairing passed');
