// Native production day/night-only and retained equipment-damage regression.
// Desktop + real mobile quality under viewport emulation, not physical Safari.
// Screenshots and state checks only: no performance or memory certification.
// From repo root after npm run build:
// node tools/daynight-atmosphere-probe.mjs --out=/tmp/cot-daynight-UNIQUE [--gate]
// Same-build diagnostic only: add --window-census-source=/absolute/rejected-report.json
// to record bounded pane/occluder receipts, not approve visuals or run the matrix.
// --fixture-census-source=/absolute/rejected-fixture-report.json does the same
// for a failed relay/headlight closeup against that exact unchanged build.
// Optional 9-shot desktop fixture suite, separate from the default 31-shot matrix:
// --world-fixtures-only --expected-build-index-hash=<sha256> --out=/absolute/fresh --gate
// Or 3 shots per explicitly requested repair variant (maximum 4):
// --vehicle-fixtures=m1a3,mbt70,t90m,t90m_proryv --expected-build-index-hash=<sha256>
// Or one FIRST battle selected as night before entry (3 desktop Urban/m1a3 shots):
// --cold-night-entry --expected-build-index-hash=<sha256> --out=/absolute/fresh --gate
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { selectBattleWeather } from '../src/engine/battleWeatherPolicy.ts';
import { collectNightWindowCensus } from './night-window-census.mjs';
import { collectNightFixtureCensus } from './night-fixture-census.mjs';

const outputArgument = process.argv.find(x => x.startsWith('--out='))?.slice(6);
assert(outputArgument, 'An explicit unique --out= directory is required');
const out = resolve(outputArgument);
const censusSourcePath = process.argv.find(x => x.startsWith('--window-census-source='))?.slice('--window-census-source='.length);
const censusSource = censusSourcePath ? JSON.parse(readFileSync(resolve(censusSourcePath), 'utf8')) : null;
const fixtureCensusPath = process.argv.find(x => x.startsWith('--fixture-census-source='))?.slice('--fixture-census-source='.length);
const fixtureCensusSource = fixtureCensusPath ? JSON.parse(readFileSync(resolve(fixtureCensusPath), 'utf8')) : null;
const worldFixturesOnly = process.argv.includes('--world-fixtures-only');
const coldNightEntry = process.argv.includes('--cold-night-entry');
const vehicleFixtureIds = requestedVehicleFixtures(process.argv);
const optionalFixtureSuite = worldFixturesOnly || vehicleFixtureIds.length > 0;
const expectedBuildHash = process.argv.find(x => x.startsWith('--expected-build-index-hash='))?.slice('--expected-build-index-hash='.length);
assert(!coldNightEntry || (!optionalFixtureSuite && !censusSource && !fixtureCensusSource
  && /^[a-f0-9]{64}$/.test(expectedBuildHash ?? '')),
  'Cold night entry requires an exact production index SHA-256 and is a separate acquisition');
assert(!optionalFixtureSuite || (!censusSource && !(worldFixturesOnly && vehicleFixtureIds.length)
  && /^[a-f0-9]{64}$/.test(expectedBuildHash ?? '')),
  'Fixture suites require an explicit production index SHA-256 and cannot be mixed with each other or a census');
assert(!fixtureCensusSource || (!optionalFixtureSuite && !censusSource), 'Fixture census is a separate diagnostic-only acquisition');
mkdirSync(out); // Refuse existing evidence; never overwrite or mix probe runs.
const report = { schemaVersion: 6, startedAt: new Date().toISOString(),
  method: 'Native production day/night/day plus former rain/snow/fog seeds; desktop High and emulated tablet real mobile quality; actual bounded headlights, authored fixture/window emission, retained equipment damage and Garage cleanup. Staged screenshots suspend post adaptivity after entry, not quality-adaptation acceptance. No performance measurement or physical-device certification.',
  acquisitionSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  visualAcceptance: 'requires-human-screenshot-review',
  cases: [], focusedFixtures: [], worldFixtures: [], vehicleFixtures: [], lightCloseups: [], screenshots: [], observerCleanup: [],
  errors: [], consoleErrors: [], cleanupErrors: [], passed: false };
if (worldFixturesOnly) {
  report.mode = 'world-fixtures-only';
  report.method = 'Separate 9-shot desktop High suite: actual intact Urban structure window, Airfield authored radar relay beacon, Coastal lighthouse lantern; exact build, bidirectional aperture sightlines, stable instance/face identity, day/night/day and Garage reset. Native images require human review; no performance or mobile certification.';
}
if (vehicleFixtureIds.length) {
  report.mode = 'vehicle-fixtures-only'; report.vehicleFixtureIds = vehicleFixtureIds;
  report.method = 'Separate bounded desktop High driving-lens repair suite; three actual visible-aperture day/night/day images per explicit vehicle ID, exact production hash, semantic lamp role and bidirectional line of sight, Garage reset. Native images require human review; no performance or mobile certification.';
}
if (coldNightEntry) {
  report.mode = 'cold-night-entry';
  report.method = 'One first Urban/m1a3 battle selected as clear night before beginSoloBattle; real covered render, preparation/reveal receipts, headlight and streetlamp apertures, three desktop High images and Garage reset. Cold means first battle in this fresh page, not cache-disabled network loading. No performance measurement or physical-device certification.';
}
const save = () => writeFileSync(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const deadlines = { progressMs: 5_000, settleMs: 30_000 };
report.deadlines = deadlines;
let server, browser, page;
const previewSockets = new Set();

function requestedVehicleFixtures(args) {
  const argument = args.find(value => value.startsWith('--vehicle-fixtures='));
  if (argument === undefined) return [];
  const ids = argument.slice('--vehicle-fixtures='.length).split(',');
  const supported = ['m1a3', 'mbt70', 't90m', 't90m_proryv'];
  assert(ids.length <= 4 && new Set(ids).size === ids.length && ids.every(id => supported.includes(id)),
    'Vehicle fixture suite requires unique canonical repair IDs: m1a3, mbt70, t90m, t90m_proryv');
  return ids;
}

async function within(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function evaluateWithin(callback, argument, milliseconds = 10_000, label = 'Equipment probe evaluation') {
  return within(page.evaluate(callback, argument), milliseconds, label);
}

async function cleanupStep(label, action, milliseconds = 10_000) {
  try { await within(Promise.resolve().then(action), milliseconds, label); return true; }
  catch (error) { report.cleanupErrors.push(`${label}: ${error.message}`); save(); return false; }
}

function installFrameWait(deadlines) {
  const probe = window.__equipmentDamageProbe = { stateEpoch: 0, completedEpoch: -1, renderCount: 0 };
  let post = null, original = null, wrapped = null, activeWait = null;
  probe.beginStateEpoch = () => ++probe.stateEpoch;
  probe.renderReceipt = () => ({ stateEpoch: probe.stateEpoch,
    completedEpoch: probe.completedEpoch, renderCount: probe.renderCount });
  probe.install = target => {
    if (post) throw new Error('Render observer already installed');
    if (typeof target?.render !== 'function') throw new Error('Missing actual post.render');
    post = target; original = post.render;
    wrapped = function () {
      const epoch = probe.stateEpoch;
      const result = Reflect.apply(original, this, arguments);
      // A thrown/unfinished render is never progress. No extra scene render,
      // quality override or simulation step is introduced by this observer.
      probe.completedEpoch = epoch; probe.renderCount++;
      activeWait?.progress();
      return result;
    };
    post.render = wrapped;
  };
  probe.waitForFrames = count => new Promise((resolve, reject) => {
    if (!post || activeWait || !Number.isSafeInteger(count) || count < 1) {
      reject(new Error('Invalid or overlapping completed-render wait')); return;
    }
    const epoch = probe.stateEpoch, startFrame = probe.renderCount;
    const started = performance.now();
    let lastProgress = started, previous = 0, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      clearInterval(watchdog);
      activeWait = null;
      if (error) reject(error);
      else resolve({ epoch, startFrame, endFrame: probe.renderCount, completed: previous });
    };
    const progress = () => {
      if (probe.stateEpoch !== epoch || probe.completedEpoch !== epoch) {
        finish(new Error('State changed during completed-render wait')); return;
      }
      previous = probe.renderCount - startFrame; lastProgress = performance.now();
      if (previous >= count) finish();
    };
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - started >= deadlines.settleMs) {
        finish(new Error(`Render settle deadline; completed ${previous}/${count}`));
      } else if (now - lastProgress >= deadlines.progressMs) {
        finish(new Error(`No completed post.render for ${deadlines.progressMs} ms; completed ${previous}/${count}`));
      }
    }, 250);
    activeWait = { progress, finish };
  });
  probe.dispose = () => {
    activeWait?.finish(new Error('Render observer disposed during wait'));
    const owned = post === null || post.render === wrapped;
    if (post && owned) post.render = original;
    if (!owned) throw new Error('Render observer ownership changed before cleanup');
    post = original = wrapped = null;
    return { restored: true, pendingWait: activeWait !== null, renderCount: probe.renderCount };
  };
}

// Explicit screenshot checkpoints only. These scans do not run in the game
// frame loop and their cost is not a native performance measurement.
function installNightLightProbe() {
  const probe = window.__equipmentDamageProbe;
  let savedCamera = null;
  function materialReceipt(material) {
    return { uuid: material.uuid, kind: material.userData.nightLightKind ?? 'masked',
      masked: material.userData.nightEmissionMask === true,
      color: material.emissive.toArray(), intensity: material.emissiveIntensity,
      version: material.version };
  }
  function emissionMaterials(scene) {
    const found = new Map();
    scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material?.userData.nightEmissionMask === true || material?.userData.nightLightKind === 'window') {
          found.set(material.uuid, materialReceipt(material));
        }
      }
    });
    return [...found.values()].sort((a, b) => a.uuid.localeCompare(b.uuid));
  }
  probe.readNightLighting = () => {
    const d = window.__DEBUG, runtime = d.nightLighting?.current;
    return { ownerAvailable: !!d.nightLighting, uuid: runtime?.group.uuid ?? null,
      attached: runtime?.group.parent === d.scene, emitterCount: runtime?.emitterCount ?? 0,
      lights: (runtime?.lights ?? []).map(light => ({ uuid: light.uuid,
        kind: light.isSpotLight ? 'spot' : 'point', intensity: light.intensity,
        position: light.position.toArray(), target: light.target?.position.toArray() ?? null,
        color: light.color.toArray(), range: light.distance,
        castShadow: light.castShadow, shadowMap: !!light.shadow?.map })),
      playerCoverage: d.game.player?.visual?.root.userData.nightLightCoverage ?? null,
      materials: emissionMaterials(d.scene) };
  };
  function headlightSeat(d) {
    const light = d.nightLighting.current?.lights.find(light => light.isSpotLight && light.intensity > 0);
    if (!light) throw new Error('No active authored headlight for closeup');
    return { kind: 'headlight', ownerUuid: light.uuid, point: light.position.clone(),
      direction: light.target.position.clone().sub(light.position).normalize() };
  }
  function lampSeat(d) {
    const seat = d.inspectNightWorldFixture?.('streetlamp');
    return seat?.lineOfSight === 'authored-emissive-face' ? { ...seat,
      point: d.camera.position.clone().fromArray(seat.point),
      direction: d.camera.position.clone().fromArray(seat.direction) } : null;
  }
  function inspectedSeat(d, kind) {
    const inspect = { shtora: () => d.inspectNightShtora?.(), window: () => d.inspectNightWindow?.(),
      'headlight-aperture': () => d.inspectNightHeadlight?.() }[kind];
    const seat = inspect ? inspect() : d.inspectNightWorldFixture?.(kind);
    if (!seat || seat.lineOfSight !== 'authored-emissive-face') throw new Error(`No authored unobstructed ${kind} aperture for closeup`);
    return { ...seat, point: d.camera.position.clone().fromArray(seat.point),
      direction: d.camera.position.clone().fromArray(seat.direction) };
  }
  function closeupReceipt(seat) {
    return { kind: seat.kind, ownerUuid: seat.ownerUuid, materialUuid: seat.materialUuid ?? null, slot: seat.slot ?? null,
      ownerName: seat.ownerName ?? null, mask: seat.mask ?? null,
      faceIndex: seat.faceIndex ?? null, lineOfSight: seat.lineOfSight ?? null,
      point: seat.point.toArray(), sourcePoint: seat.sourcePoint ?? null, direction: seat.direction.toArray() };
  }
  probe.stageNightLightCloseup = kind => {
    const d = window.__DEBUG;
    if (!savedCamera) savedCamera = { position: d.camera.position.clone(), quaternion: d.camera.quaternion.clone(), fov: d.camera.fov };
    const seat = kind === 'headlight' ? headlightSeat(d)
      : ['shtora', 'headlight-aperture', 'structure-window', 'relay-beacon', 'lighthouse'].includes(kind)
        ? inspectedSeat(d, kind) : lampSeat(d) ?? inspectedSeat(d, 'window');
    if (kind === 'streetlamp' && seat.kind !== kind) throw new Error('An actual intact streetlamp is required, not a window fallback');
    const side = seat.direction.clone().set(-seat.direction.z, 0, seat.direction.x).normalize();
    d.camera.position.copy(seat.point).addScaledVector(seat.direction, kind === 'headlight' ? 11 : 9)
      .addScaledVector(side, kind === 'headlight' ? 6 : 3);
    d.camera.position.y += kind === 'headlight' ? 4 : 1;
    if (seat.camera) d.camera.position.fromArray(seat.camera);
    const target = seat.point.clone();
    if (kind === 'headlight') target.addScaledVector(seat.direction, 3);
    if (seat.kind === 'streetlamp') target.y -= 1.2;
    d.camera.lookAt(target); d.camera.fov = seat.fov ?? (seat.camera ? 40 : 48); d.camera.updateProjectionMatrix();
    probe.beginStateEpoch();
    return closeupReceipt(seat);
  };
  probe.restoreNightLightCamera = () => {
    if (!savedCamera) return;
    const camera = window.__DEBUG.camera;
    camera.position.copy(savedCamera.position); camera.quaternion.copy(savedCamera.quaternion);
    camera.fov = savedCamera.fov; camera.updateProjectionMatrix(); savedCamera = null;
    probe.beginStateEpoch();
  };
}

async function configurePage(tier) {
  // Mobile/touch configuration can navigate about:blank. Observe reloads only
  // after it settles and before the one intended application navigation.
  await page.setViewport(tier.viewport);
  let mainNavigations = 0;
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return;
    if (++mainNavigations > 1) {
      report.errors.push(`Unexpected main-page navigation/reload: ${frame.url()}`);
      save();
    }
  });
  page.on('error', error => { report.errors.push(`Browser page crash: ${error.message}`); save(); });
  page.on('pageerror', error => { report.errors.push(error.message); save(); });
  page.on('console', event => {
    if (event.type() === 'error' || /GL_INVALID_|INVALID_(?:OPERATION|VALUE|ENUM)|THREE\.WebGLProgram: Shader Error/i.test(event.text())) {
      report.consoleErrors.push(`[${event.type()}] ${event.text()}`); save();
    }
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('cot.gfxPreset', 'high');
    localStorage.setItem('cot.gfxMobilePreset', 'mobile');
  });
  await page.evaluateOnNewDocument(installFrameWait, deadlines);
}

async function settle(count = 120) {
  return evaluateWithin(count => window.__equipmentDamageProbe.waitForFrames(count),
    count, deadlines.settleMs + 5_000, 'Frame settling');
}

async function stage(mapId, specId = 'm1a1') {
  await evaluateWithin(async ({ mapId, specId }) => {
    const d = window.__DEBUG;
    d.shotMode = false;
    if (d.game.phase !== 'garage') await d.enterGarage();
    d.game.battleCount = 0;
    await d.beginSoloBattle({ specId, mapId, randomRoster: false });
    if(d.game.phase !== 'battle' || !d.game.player)
      throw new Error(`Battle entry ${mapId}/${specId} returned in ${d.game.phase} without an active player; inspect the recorded battle-entry error`);
  }, { mapId, specId }, 180_000, `Battle entry ${mapId}/${specId}`);
  await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.player?.visual && window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.tanks.every(x => x.visual)', { timeout: 180_000 });
  await evaluateWithin(() => {
    const d = window.__DEBUG;
    d.shotMode = true;
    d.post.setAdaptiveSuspended(true);
    const p = d.game.player.state.pos;
    d.camera.position.set(p.x + 12, p.y + 7, p.z - 14);
    d.camera.lookAt(p.x, p.y + 2, p.z + 22);
    d.camera.fov = 50; d.camera.updateProjectionMatrix();
    window.__equipmentDamageProbe.beginStateEpoch();
    const telemetry = document.getElementById('cot-perfhud');
    if (telemetry) telemetry.style.display = 'none';
  });
}

// Optional first-entry observation only. Wrappers call the actual owners once,
// preserve this/arguments/results, and never select weather or render a frame.
function installColdNightEntryObserver() {
  const d = window.__DEBUG, probe = window.__equipmentDamageProbe;
  if (probe.coldEntry) throw new Error('Cold entry observer already installed');
  const receipt = { events: [], firstBattleRender: null, resolved: false };
  const owned = [];
  const snapshot = () => ({ phase: d.game.phase, battleCount: d.game.battleCount,
    weather: d.battleAtmosphere.current?.weather ?? null,
    nightLighting: probe.readNightLighting() });
  function observePrepare(owner, name) {
    const original = owner.prepare;
    const wrapped = async function (...args) {
      receipt.events.push({ name: `${name}:start`, args });
      const result = await Reflect.apply(original, this, args);
      receipt.events.push({ name: `${name}:done`, state: snapshot() });
      return result;
    };
    owner.prepare = wrapped;
    owned.push({ owner, key: 'prepare', original, wrapped });
  }
  observePrepare(d.battleAtmosphere, 'atmosphere');
  observePrepare(d.nightLighting, 'nightLighting');
  const original = d.post.render;
  const wrapped = function () {
    const result = Reflect.apply(original, this, arguments);
    if (!receipt.firstBattleRender && d.game.phase === 'battle') {
      const loader = document.querySelector('.cot-bl');
      const style = loader ? getComputedStyle(loader) : null;
      const rect = loader?.getBoundingClientRect();
      receipt.firstBattleRender = { ...snapshot(),
        render: probe.renderReceipt(),
        loader: { on: !!loader?.classList.contains('on'), leaving: !!loader?.classList.contains('leaving'),
          display: style?.display ?? null, opacity: Number(style?.opacity ?? 0),
          coversViewport: !!rect && rect.left <= 0 && rect.top <= 0
            && rect.right >= window.innerWidth && rect.bottom >= window.innerHeight },
        glError: d.renderer.getContext().getError() };
      receipt.events.push({ name: 'firstBattleRender' });
    }
    return result;
  };
  d.post.render = wrapped;
  owned.push({ owner: d.post, key: 'render', original, wrapped });
  probe.coldEntry = { receipt, dispose() {
    for (const { owner, key, original, wrapped } of owned) {
      if (owner[key] !== wrapped && owner[key] !== original) throw new Error('Cold entry observer ownership changed');
      owner[key] = original;
    }
    return { restored: true };
  } };
}

async function beginColdNightBattle({ mapId, specId, seed }) {
  const d = window.__DEBUG, receipt = window.__equipmentDamageProbe.coldEntry.receipt;
  if (d.game.phase !== 'garage' || d.battleAtmosphere.current?.weather
    || d.nightLighting.current?.emitterCount) throw new Error('Cold entry requires a pristine battle lifecycle');
  d.shotMode = false;
  // startBattle increments this counter once; production owns all preparation.
  d.game.battleCount = seed - 1;
  receipt.events.push({ name: 'beginSoloBattle', mapId, specId, seed, priorBattleCount: d.game.battleCount });
  const firstTiming = window.__VISUAL_LOAD_TIMINGS?.length ?? 0;
  await d.beginSoloBattle({ mapId, specId, randomRoster: false });
  receipt.resolved = true;
  receipt.events.push({ name: 'entryResolved' });
  receipt.reveal = window.__BATTLE_REVEAL;
  receipt.deployment = window.__BATTLE_COUNTDOWN_WARM;
  receipt.loading = window.__BATTLE_LOAD;
  receipt.playerStaging = (window.__VISUAL_LOAD_TIMINGS ?? []).slice(firstTiming)
    .filter(row => row.specId === specId && row.textureUploadMs !== undefined);
}

function assertColdNightEntry(receipt, expected) {
  assert(receipt.resolved, 'First night entry must resolve normally');
  assert.deepEqual(receipt.events.map(row => row.name), ['beginSoloBattle',
    'atmosphere:start', 'atmosphere:done', 'nightLighting:start', 'nightLighting:done',
    'firstBattleRender', 'entryResolved'], 'Exactly one selected night preparation precedes first render/reveal');
  assert.deepEqual(receipt.events[1].args, [expected.seed, 'urban']);
  assert.deepEqual(receipt.events[3].args, []);
  assert.equal(receipt.events[0].priorBattleCount, expected.seed - 1);
  const first = receipt.firstBattleRender;
  assert(first && first.phase === 'battle' && first.battleCount === expected.seed);
  assert.deepEqual(first.weather, expected, 'First render must already have the selected real night');
  assertRenderedState(first);
  assert(first.loader.on && !first.loader.leaving && first.loader.display !== 'none'
    && first.loader.opacity === 1 && first.loader.coversViewport, 'First render must complete under the opaque loading cover');
  assert.equal(first.glError, 0);
  assert(validNightLightState(first), 'Actual first rendered night pool and authored masks must be active');
  assert(receipt.reveal?.primed && receipt.reveal.loaderVisible && receipt.reveal.garageHidden,
    'Production covered reveal must complete before loader dismissal');
  const stages = Object.keys(receipt.deployment?.stages ?? {});
  const required = ['camo', 'atmosphere', 'nightLighting', 'allyVisuals', 'forwardPrograms', 'postPasses', 'openingFrame'];
  assert(required.every((key, i) => stages.includes(key)
    && (i === 0 || stages.indexOf(required[i - 1]) < stages.indexOf(key))), 'Final shader and post readiness order is retained');
  assert(receipt.deployment.done && receipt.deployment.doneBeforeRollout && !receipt.deployment.error);
  assert(receipt.playerStaging.length === 1 && receipt.playerStaging[0].compileMs === 0,
    'Early player texture upload must not submit the obsolete forward program');
  assert(receipt.loading?.stages?.open !== undefined, 'Normal battle opening must complete');
}

function readColdHeadlightFace(fixture) {
  const d = window.__DEBUG;
  const mesh = d.game.player.visual.root.getObjectByProperty('uuid', fixture.ownerUuid);
  const geometry = mesh?.geometry, position = geometry?.getAttribute('position');
  const mask = geometry?.getAttribute('nightEmissionMask');
  const offset = fixture.faceIndex * 3;
  if (!position || !mask || !Number.isSafeInteger(fixture.faceIndex) || fixture.faceIndex < 0
    || offset + 2 >= (geometry.index?.count ?? position.count)) throw new Error('Missing actual selected driving face');
  mesh.updateWorldMatrix(true, false);
  const point = d.camera.position.clone().set(0, 0, 0), masks = [];
  for (let corner = 0; corner < 3; corner++) {
    const vertex = geometry.index?.getX(offset + corner) ?? offset + corner;
    masks.push(mask.getX(vertex));
    point.add(d.camera.position.clone().fromBufferAttribute(position, vertex));
  }
  point.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
  return { ownerUuid: mesh.uuid, materialUuid: mesh.material.uuid,
    faceIndex: fixture.faceIndex, masks, point: point.toArray() };
}

function assertColdNightFixture(kind, fixture, state, face = null) {
  assert(validNightLightState(state, kind === 'headlight-aperture'));
  const material = state.nightLighting.materials.find(row => row.uuid === fixture.materialUuid);
  assert(material?.masked && material.intensity >= 3, 'The inspected real aperture must emit');
  if (kind === 'streetlamp') {
    assert(validStreetLampFixture(fixture, state.nightLighting), 'Point pool light must attach to this intact streetlamp');
  } else {
    assert.equal(fixture.kind, 'headlight');
    assert.equal(fixture.lineOfSight, 'authored-emissive-face');
    // The vehicle inspector returns an actual face centroid, not a world-lamp
    // mask/sourcePoint receipt. A whole-lens source centroid need not coincide
    // with one triangle centroid. Read the selected uploaded triangle instead.
    assert(Number.isSafeInteger(fixture.faceIndex) && fixture.faceIndex >= 0);
    assert.deepEqual(face, { ownerUuid: fixture.ownerUuid, materialUuid: fixture.materialUuid,
      faceIndex: fixture.faceIndex, masks: [1, 1, 1], point: fixture.point },
    'The selected real driving face, transform, material and every uploaded mask vertex must match');
  }
}

async function coldNightEntryPictures(garageBaseline) {
  const expected = selectBattleWeather(seedFor('temperate', 'night'), 'temperate');
  report.coldNight = { mapId: 'urban', specId: 'm1a3', expected, passed: false }; save();
  await evaluateWithin(installColdNightEntryObserver);
  try {
    await evaluateWithin(beginColdNightBattle, { mapId: 'urban', specId: 'm1a3', seed: expected.seed },
      180_000, 'First real night entry');
  } finally {
    report.coldNight.entry = await evaluateWithin(() => window.__equipmentDamageProbe.coldEntry.receipt);
    report.coldNight.observerCleanup = await evaluateWithin(() => window.__equipmentDamageProbe.coldEntry.dispose()); save();
  }
  assertColdNightEntry(report.coldNight.entry, expected);
  await page.waitForFunction('window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.tanks.every(x => x.visual)', { timeout: 180_000 });
  await evaluateWithin(() => {
    const d = window.__DEBUG, p = d.game.player.state.pos;
    d.shotMode = true; d.post.setAdaptiveSuspended(true);
    d.camera.position.set(p.x + 12, p.y + 7, p.z - 14);
    d.camera.lookAt(p.x, p.y + 2, p.z + 22);
    d.camera.fov = 50; d.camera.updateProjectionMatrix();
    window.__equipmentDamageProbe.beginStateEpoch();
    const telemetry = document.getElementById('cot-perfhud');
    if (telemetry) telemetry.style.display = 'none';
  });
  await settle(30);
  report.coldNight.established = await evaluateWithin(readVisualState); save();
  assert.deepEqual(report.coldNight.established.weather, expected);
  assert(clearWeatherState(report.coldNight.established) && validNightLightState(report.coldNight.established));
  await screenshot('cold-night-urban-established', report.coldNight.established);
  for (const kind of ['headlight-aperture', 'streetlamp']) {
    const fixture = await evaluateWithin(kind => window.__equipmentDamageProbe.stageNightLightCloseup(kind), kind);
    const row = { kind, fixture, structuralPassed: false };
    report.lightCloseups.push(row); save();
    try {
      await settle(30);
      const state = row.state = await evaluateWithin(readVisualState);
      const face = row.face = kind === 'headlight-aperture' ? await evaluateWithin(readColdHeadlightFace, fixture) : null;
      save(); // Retain the exact fixture and state even if an assertion fails.
      assert.deepEqual(state.weather, expected);
      assertColdNightFixture(kind, fixture, state, face);
      row.structuralPassed = true; save();
      await screenshot(`cold-night-urban-${kind}`, state);
    } finally { await evaluateWithin(() => window.__equipmentDamageProbe.restoreNightLightCamera()); }
  }
  await nativeGraphics('coldNightGraphicsAfter');
  report['high-garage'] = await garageReceipt(garageBaseline);
  report.coldNight.passed = true; save();
  await stopFrameObserver();
  await within(page.close(), 10_000, 'Page close');
}

function assertRenderedState(state) {
  assert(state.render.renderCount > 0 && state.render.completedEpoch === state.render.stateEpoch,
    'State must have completed an ordinary post.render before capture');
}

function assertScreenshotState(expected, actual) {
  assertRenderedState(actual);
  assert.equal(actual.render.stateEpoch, expected.render.stateEpoch, 'capture state epoch changed');
  assert(actual.render.renderCount >= expected.render.renderCount, 'capture render count went backwards');
  const { render: ignoredExpected, ...expectedState } = expected;
  const { render: ignoredActual, ...actualState } = actual;
  assert.deepEqual(actualState, expectedState, 'screenshot state changed around capture');
}

async function screenshot(label, expected) {
  const capture = { label, startedAt: new Date().toISOString(), completed: false };
  report.screenshots.push(capture); save();
  assertRenderedState(expected);
  capture.before = await evaluateWithin(readVisualState); save();
  assertScreenshotState(expected, capture.before);
  await within(page.screenshot({ path: resolve(out, `${label}.png`) }), 30_000, `Screenshot ${label}`);
  capture.after = await evaluateWithin(readVisualState); save();
  assertScreenshotState(capture.before, capture.after);
  capture.completed = true; capture.finishedAt = new Date().toISOString(); save();
}

function validNativeGraphics(receipt) {
  return receipt.unmaskedGpu && !receipt.contextLost && receipt.glError === 0
    && typeof receipt.gpu === 'string' && receipt.gpu.trim().length > 0
    && !/swiftshader|software|llvmpipe|softpipe/i.test(receipt.gpu);
}

async function nativeGraphics(label) {
  const receipt = await evaluateWithin(() => {
    const gl = window.__DEBUG.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { unmaskedGpu: !!ext, contextLost: gl.isContextLost(), glError: gl.getError(),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  report[label] = receipt; save();
  assert(validNativeGraphics(receipt),
  `Native error-free WebGL is required: ${receipt.gpu}`);
  return receipt;
}

async function windowCensus() {
  assert.equal(report.build, censusSource.build, 'Census must use the exact rejected production build');
  const source = censusSource.screenshots.find(row => row.label === 'high-verdant-night')?.before;
  assert(source?.camera && source.weather?.seed, 'Census requires the original rendered Verdant night state');
  await stage('verdant');
  await evaluateWithin(camera => {
    const d = window.__DEBUG;
    d.camera.position.fromArray(camera[0]); d.camera.quaternion.fromArray(camera[1]);
    d.camera.fov = camera[2]; d.camera.updateProjectionMatrix();
  }, source.camera);
  await atmosphereReceipt(source.weather.seed, 'verdant');
  const modules = readdirSync('dist/assets').filter(file => /^three\.core-.+\.js$/.test(file));
  assert.equal(modules.length, 1, 'Use one exact retained production Three core');
  report.windowCensus = await evaluateWithin(collectNightWindowCensus,
    { moduleUrl: `/assets/${modules[0]}`, limit: 256 }, 120_000, 'Bounded rendered pane rejection census');
  report.diagnosticOnly = true;
  report.visualAcceptance = 'diagnostic-only-no-visual-approval'; save();
  await nativeGraphics('graphicsAfterWindowCensus');
  await screenshot('window-census-source-scene', await evaluateWithin(readVisualState));
}

async function fixtureCensus() {
  assert.equal(report.build, fixtureCensusSource.build, 'Fixture census must use the exact rejected production build');
  const source = [...fixtureCensusSource.worldFixtures, ...fixtureCensusSource.vehicleFixtures]
    .find(row => row.checks.completed === false);
  assert(source && ['relay-beacon', 'headlight'].includes(source.kind), 'Require a failed relay or driving-aperture case');
  report.mode = 'fixture-census-only'; report.diagnosticOnly = true;
  report.visualAcceptance = 'diagnostic-only-no-visual-approval';
  report.failedSource = { reportPath: resolve(fixtureCensusPath), label: source.label, checks: source.checks };
  report.failedSource.reportSha256 = createHash('sha256').update(readFileSync(resolve(fixtureCensusPath))).digest('hex');
  report.censusHelperSha256 = createHash('sha256').update(readFileSync(new URL('./night-fixture-census.mjs', import.meta.url))).digest('hex');
  await stage(source.mapId, source.specId);
  await atmosphereReceipt(seedFor('temperate', 'day'), source.mapId);
  const modules = readdirSync('dist/assets').filter(file => /^three\.core-.+\.js$/.test(file));
  assert.equal(modules.length, 1, 'Use one exact retained production Three core');
  report.fixtureCensus = await evaluateWithin(collectNightFixtureCensus,
    { moduleUrl: `/assets/${modules[0]}`, kind: source.kind, limit: 256 }, 120_000, 'Bounded actual fixture rejection census');
  save(); await nativeGraphics('graphicsAfterFixtureCensus');
  await screenshot('fixture-census-source-scene', await evaluateWithin(readVisualState));
}

function seedFor(biome, timeOfDay) {
  for (let seed = 1; seed < 1000; seed++) {
    if (selectBattleWeather(seed, biome).timeOfDay === timeOfDay) return seed;
  }
  throw new Error(`No ${timeOfDay} seed for ${biome}`);
}

async function atmosphereReceipt(seed, mapId) {
  await evaluateWithin(async ({ seed, mapId }) => {
    await window.__DEBUG.battleAtmosphere.prepare(seed, mapId);
    await window.__DEBUG.nightLighting.prepare();
    window.__equipmentDamageProbe.beginStateEpoch();
  }, { seed, mapId }, 120_000, 'Atmosphere preparation');
  await settle(30);
  return evaluateWithin(readVisualState);
}

function readVisualState() {
    const d = window.__DEBUG, directional = [], directionalColors = [], skies = [], clouds = [], cloudDecks = [];
    d.scene.traverse(object => {
      if (object.isDirectionalLight) {
        directional.push(object.intensity); directionalColors.push(object.color.toArray());
      }
      const uniforms = object.material?.uniforms;
      if (uniforms?.uSkyIntensity) skies.push(uniforms.uSkyIntensity.value);
      if (object.name === 'cloudLayer' || object.name === 'cloudLayerFar') {
        clouds.push(uniforms.uOpacity.value);
        cloudDecks.push({ name: object.name, visible: object.visible,
          opacity: uniforms.uOpacity.value, offset: uniforms.uOff.value.toArray(),
          rotation: uniforms.uRot.value.toArray(), altitude: uniforms.uAlt.value,
          scale: uniforms.uScale.value, haze: uniforms.uHazeK.value });
      }
    });
    return { weather: d.battleAtmosphere.current?.weather ?? null,
      phase: d.game.phase, mapId: d.world?.mapId ?? null,
      precipitationAttached: !!d.scene.getObjectByName('battle-precipitation'),
      preset: d.quality.resolvePresetName(), fogDensity: d.scene.fog?.density,
      fogColor: d.scene.fog?.color.toArray(), environmentIntensity: d.scene.environmentIntensity,
      directional, directionalColors, skies, clouds, cloudDecks, cloudShadeAmp: d.scene.userData.cloudShadeAmp,
      hemi: d.lighting.hemi.intensity, hemiColor: d.lighting.hemi.color.toArray(),
      worldUuid: d.world?.group.uuid ?? null,
      camera: [d.camera.position.toArray(), d.camera.quaternion.toArray(), d.camera.fov],
      playerSpecId: d.game.player?.spec?.id ?? null,
      playerPose: d.game.player?.visual?.root.matrixWorld.toArray() ?? null,
      nightLighting: window.__equipmentDamageProbe.readNightLighting(),
      raster: [d.renderer.domElement.width, d.renderer.domElement.height],
      render: window.__equipmentDamageProbe.renderReceipt() };
}

function lightingReceipt(state) {
  return Object.fromEntries(['skies', 'directional', 'directionalColors', 'hemi', 'hemiColor',
    'clouds', 'cloudDecks', 'cloudShadeAmp', 'fogDensity', 'fogColor', 'environmentIntensity']
    .map(key => [key, state[key]]));
}

function clearWeatherState(state) {
  return state.weather?.version === 2 && state.weather.condition === 'clear'
    && state.weather.precipitationIntensity === 0 && state.weather.cloudOpacityMultiplier === 1
    && state.weather.fogDensityMultiplier === 1 && !state.precipitationAttached;
}

function actualLightingChanges(day, night) {
  return day.skies.length > 0 && night.skies.length === day.skies.length
    && night.skies.some((value, index) => value < day.skies[index])
    && night.directional.some((value, index) => value < day.directional[index]);
}

function requestedScenarios(row, states) {
  return states.length === row.expected.length && states.every((state, i) =>
    state.phase === 'battle' && state.mapId === row.mapId
    && JSON.stringify(state.weather) === JSON.stringify(row.expected[i]));
}

function validNightLightState(state, requirePlayerHeadlights = true) {
  const pool = state.nightLighting;
  if (!pool?.ownerAvailable || pool.lights.length > 3 || pool.lights.some(light => light.castShadow || light.shadowMap
    || !Number.isFinite(light.intensity) || light.intensity < 0)) return false;
  if (state.weather?.timeOfDay !== 'night') {
    return !pool.attached && pool.emitterCount === 0 && pool.lights.every(light => light.intensity === 0);
  }
  return pool.attached && pool.emitterCount > 0
    && pool.lights.filter(light => light.kind === 'spot').length === 2
    && pool.lights.filter(light => light.kind === 'point').length === 1
    && (!requirePlayerHeadlights || pool.playerCoverage?.headlights > 0
      && pool.lights.some(light => light.kind === 'spot' && light.intensity > 0)
      && pool.materials.some(material => material.masked && material.intensity >= 3));
}

function checkNightLightingCycle(row, states, requirePlayerHeadlights = true) {
  const { day, night, restored } = row;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const identity = pool => pool.lights.map(light => light.uuid);
  const firstMaterials = new Map(day.nightLighting.materials.map(material => [material.uuid, material]));
  const emissionIncreased = night.nightLighting.materials.some(material => {
    const baseline = firstMaterials.get(material.uuid);
    return baseline && material.intensity > baseline.intensity;
  });
  return states.every(state => validNightLightState(state, requirePlayerHeadlights)) && emissionIncreased
    && same(day.nightLighting.materials, restored.nightLighting.materials)
    && states.every(state => !state.nightLighting.uuid || state.nightLighting.uuid === night.nightLighting.uuid)
    && states.every(state => !state.nightLighting.lights.length || same(identity(state.nightLighting), identity(night.nightLighting)))
    && same(identity(night.nightLighting), identity(restored.nightLighting));
}

function checkAtmosphereCase(row, preset) {
  const { day, night, restored, legacy } = row;
  const states = [day, night, restored, ...legacy];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return {
    clearOnly: states.every(clearWeatherState),
    requestedScenarios: requestedScenarios(row, states),
    dayNightDay: day.weather.timeOfDay === 'day' && night.weather.timeOfDay === 'night'
      && restored.weather.timeOfDay === 'day',
    actualLightingChanges: actualLightingChanges(day, night),
    actualNightLightingAndRestoration: checkNightLightingCycle(row, states),
    authoredCloudOpacityAndFogDensity: day.clouds.length === 2 && Number.isFinite(day.fogDensity)
      && states.every(state => state.fogDensity === day.fogDensity
      && same(state.clouds, day.clouds)),
    daylightRestored: same(lightingReceipt(day), lightingReceipt(restored)),
    stableScene: states.every(state => state.worldUuid === day.worldUuid
      && same(state.camera, day.camera) && same(state.playerPose, day.playerPose)),
    sameRasterAndRealTier: states.every(state => state.preset === preset && same(state.raster, day.raster)),
    actualRenderedStates: states.every(state => state.render.renderCount > 0
      && state.render.stateEpoch === state.render.completedEpoch),
  };
}

function validOccupiedWindowFixture(fixture, pool) {
  const material = pool.materials.find(material => material.uuid === fixture.materialUuid);
  // Validate the selected real pane, not an unrelated brighter window. This
  // is the reviewed scalar input, not a visual-quality minimum or pixel test.
  return fixture.kind === 'window' && !!fixture.ownerUuid && !!fixture.materialUuid
    && fixture.lineOfSight === 'authored-emissive-face'
    && Number.isSafeInteger(fixture.faceIndex) && fixture.faceIndex >= 0
    && material?.kind === 'window' && material.masked === true
    && Number.isFinite(material.intensity) && Math.abs(material.intensity - .225) < 1e-6;
}

async function nightLightCloseups(label) {
  try {
    for (const kind of ['headlight', 'world']) {
      const fixture = await evaluateWithin(kind => window.__equipmentDamageProbe.stageNightLightCloseup(kind), kind);
      await settle(30);
      const state = await evaluateWithin(readVisualState);
      const row = { label: `${label}-${fixture.kind}`, fixture, state, structuralPassed: false,
        visualAcceptance: 'requires-human-screenshot-review' };
      report.lightCloseups.push(row); save();
      assert.equal(state.weather?.timeOfDay, 'night');
      assert(state.nightLighting.attached && state.nightLighting.emitterCount > 0);
      assert(kind === 'headlight' ? fixture.kind === 'headlight'
        : fixture.kind === 'streetlamp' || fixture.kind === 'window', 'Closeup must retain the requested authored source role');
      if (fixture.kind === 'streetlamp') assert(validStreetLampFixture(fixture, state.nightLighting));
      if (fixture.kind === 'window') {
        assert(validOccupiedWindowFixture(fixture, state.nightLighting), 'Selected masked window must retain its reviewed emission and visible face');
      }
      await screenshot(row.label, state);
      row.structuralPassed = true; save();
    }
  } finally {
    await evaluateWithin(() => window.__equipmentDamageProbe.restoreNightLightCamera());
    await settle(30);
  }
}

async function dayNightPictures(tier) {
  for (const [mapId, biome, oldSeeds] of [
    ['verdant', 'temperate', [24]], ['winter', 'cold', [13, 3]], ['monsoon', 'tropical', [1337]],
  ]) {
    const daySeed = seedFor(biome, 'day'), nightSeed = seedFor(biome, 'night');
    const expected = [daySeed, nightSeed, daySeed, ...oldSeeds].map(seed => selectBattleWeather(seed, biome));
    // Independent shipped historical fixtures: removing precipitation must
    // not silently re-key either of these day/night selections.
    if (mapId === 'winter') assert.equal(expected.at(-1).timeOfDay, 'night');
    if (mapId === 'monsoon') assert.equal(expected.at(-1).timeOfDay, 'day');
    const label = `${tier.label}-${mapId}`, row = { label, mapId, expected,
      legacySeeds: oldSeeds, legacy: [], checks: { completed: false } };
    report.cases.push(row); save();
    await stage(mapId);
    row.day = await atmosphereReceipt(daySeed, mapId); save();
    await screenshot(`${label}-day`, row.day);
    row.night = await atmosphereReceipt(nightSeed, mapId); save();
    await screenshot(`${label}-night`, row.night);
    if (mapId === 'verdant') await nightLightCloseups(label);
    for (const seed of oldSeeds) { row.legacy.push(await atmosphereReceipt(seed, mapId)); save(); }
    row.restored = await atmosphereReceipt(daySeed, mapId); save();
    await screenshot(`${label}-day-restored`, row.restored);
    await nativeGraphics(`${label}-graphics`);
    row.checks = checkAtmosphereCase(row, tier.preset); save();
    assert(Object.values(row.checks).every(Boolean), `Day/night checks failed: ${label}`);
  }
}

function validStreetLampFixture(fixture, pool) {
  const light = pool.lights.find(light => light.kind === 'point' && light.intensity > 0);
  const position = fixture.sourcePoint;
  const distance = light?.position && position?.length === 3
    ? Math.hypot(...light.position.map((value, i) => value - position[i])) : Infinity;
  return fixture.kind === 'streetlamp' && fixture.ownerName === 'destructible-lamp'
    && fixture.lineOfSight === 'authored-emissive-face' && fixture.mask === 1
    && Number.isSafeInteger(fixture.slot) && fixture.slot >= 0
    && Number.isSafeInteger(fixture.faceIndex) && fixture.faceIndex >= 0 && distance < .01;
}

function checkFocusedFixtureCase(row, minimumRadiance = 3) {
  const { day, night, restored, fixture } = row, states = [day, night, restored];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const material = state => state.nightLighting.materials.find(material => material.uuid === fixture.materialUuid);
  const original = material(day), glowing = material(night), reset = material(restored);
  return {
    exactSource: fixture.kind === row.kind && !!fixture.ownerUuid && !!fixture.materialUuid,
    requestedBattle: states.every(state => state.phase === 'battle' && state.mapId === row.mapId
      && state.playerSpecId === row.specId && state.preset === 'high'),
    stableFraming: states.every(state => state.worldUuid === day.worldUuid && same(state.camera, day.camera)
      && same(state.playerPose, day.playerPose) && same(state.raster, day.raster)),
    dayNightDay: day.weather.timeOfDay === 'day' && night.weather.timeOfDay === 'night' && restored.weather.timeOfDay === 'day',
    // Distant fixture views legitimately have no player headlight in range.
    // Default battle and vehicle captures still require the real spotlights.
    scopedLampCycle: checkNightLightingCycle(row, states, ['headlight', 'shtora'].includes(row.kind)),
    exactEmitterRadiance: !!original && !!glowing && !!reset && glowing.masked
      && glowing.intensity >= minimumRadiance && glowing.intensity > original.intensity && same(original, reset),
    authoredShtora: row.kind !== 'shtora' || (fixture.lineOfSight === 'authored-emissive-face'
      && night.nightLighting.playerCoverage.shtora === 2),
    actualStreetPool: row.kind !== 'streetlamp' || validStreetLampFixture(fixture, night.nightLighting),
    completedFrames: states.every(state => state.render.renderCount > 0 && state.render.stateEpoch === state.render.completedEpoch),
  };
}

function checkWorldFixtureCase(row) {
  const { fixture, kind } = row;
  const structure = kind === 'structure-window' && ['destructible-securityoffice', 'destructible-servicegarage', 'destructible-corneroffice'].includes(fixture.ownerName);
  const relay = kind === 'relay-beacon' && fixture.ownerName === 'destructible-relaystation';
  const lantern = kind === 'lighthouse' && fixture.slot === null;
  return { ...checkFocusedFixtureCase(row, lantern ? 2 : 1.2),
    actualWorldAperture: (structure || relay || lantern) && fixture.lineOfSight === 'authored-emissive-face'
      && Number.isSafeInteger(fixture.faceIndex) && fixture.faceIndex >= 0
      && (lantern || Number.isSafeInteger(fixture.slot) && fixture.slot >= 0)
      && fixture.mask === (relay ? 2 : 1),
    dedicatedFixtureMaterial: row.night.nightLighting.materials.some(material =>
      material.uuid === fixture.materialUuid && material.kind === 'fixture' && material.masked),
    clearOnly: [row.day, row.night, row.restored].every(clearWeatherState),
  };
}

function worldFixtureCases() {
  // Urban's optional placement pass can legitimately omit a relay when all
  // 80 sites conflict. Airfield has an explicit authored radar-relay beat.
  // The actual mesh/active-instance/mask/LOS checks remain mandatory.
  return [['urban', 'structure-window'], ['airfield', 'relay-beacon'], ['coastal', 'lighthouse']];
}

async function worldFixturePictures() {
  let stagedMap = null;
  for (const [mapId, kind] of worldFixtureCases()) {
    const label = `high-${mapId}-${kind}`, row = { label, mapId, specId: 'm1a1', kind,
      visualAcceptance: 'requires-human-screenshot-review', checks: { completed: false } };
    report.worldFixtures.push(row); save();
    if (stagedMap !== mapId) { await stage(mapId); stagedMap = mapId; }
    await atmosphereReceipt(seedFor('temperate', 'day'), mapId);
    try {
      row.fixture = await evaluateWithin(kind => window.__equipmentDamageProbe.stageNightLightCloseup(kind), kind);
      await settle(30);
      row.day = await evaluateWithin(readVisualState); save();
      await screenshot(`${label}-day`, row.day);
      row.night = await atmosphereReceipt(seedFor('temperate', 'night'), mapId); save();
      await screenshot(`${label}-night`, row.night);
      row.restored = await atmosphereReceipt(seedFor('temperate', 'day'), mapId); save();
      await screenshot(`${label}-day-restored`, row.restored);
      row.checks = checkWorldFixtureCase(row); save();
      assert(Object.values(row.checks).every(Boolean), `World fixture checks failed: ${label}`);
      await nativeGraphics(`${label}-graphics`);
    } finally {
      await evaluateWithin(() => window.__equipmentDamageProbe.restoreNightLightCamera());
      await settle(30);
    }
  }
}

function checkVehicleFixtureCase(row) {
  return { ...checkFocusedFixtureCase(row),
    actualDrivingAperture: row.kind === 'headlight' && row.fixture.lineOfSight === 'authored-emissive-face'
      && Number.isSafeInteger(row.fixture.faceIndex) && row.fixture.faceIndex >= 0
      && row.night.nightLighting.playerCoverage.headlights > 0,
    clearOnly: [row.day, row.night, row.restored].every(clearWeatherState),
  };
}

async function vehicleFixturePictures() {
  for (const specId of vehicleFixtureIds) {
    const label = `high-verdant-${specId}-headlight`, row = { label, mapId: 'verdant', specId, kind: 'headlight',
      visualAcceptance: 'requires-human-screenshot-review', checks: { completed: false } };
    report.vehicleFixtures.push(row); save();
    await stage('verdant', specId);
    await atmosphereReceipt(seedFor('temperate', 'day'), 'verdant');
    try {
      row.fixture = await evaluateWithin(() => window.__equipmentDamageProbe.stageNightLightCloseup('headlight-aperture'));
      await settle(30);
      row.day = await evaluateWithin(readVisualState); save();
      await screenshot(`${label}-day`, row.day);
      row.night = await atmosphereReceipt(seedFor('temperate', 'night'), 'verdant'); save();
      await screenshot(`${label}-night`, row.night);
      row.restored = await atmosphereReceipt(seedFor('temperate', 'day'), 'verdant'); save();
      await screenshot(`${label}-day-restored`, row.restored);
      row.checks = checkVehicleFixtureCase(row); save();
      assert(Object.values(row.checks).every(Boolean), `Vehicle fixture checks failed: ${label}`);
      await nativeGraphics(`${label}-graphics`);
    } finally {
      await evaluateWithin(() => window.__equipmentDamageProbe.restoreNightLightCamera());
      await settle(30);
    }
  }
}

async function completeOptionalFixtureSuite(garageBaseline) {
  if (worldFixturesOnly) await worldFixturePictures();
  else await vehicleFixturePictures();
  const beforeGarage = await atmosphereReceipt(seedFor('temperate', 'night'), worldFixturesOnly ? 'coastal' : 'verdant');
  report['high-nightBeforeGarage'] = beforeGarage; save();
  assert(validNightLightState(beforeGarage), 'Garage reset starts with actual active fixture radiance');
  report['high-garage'] = await garageReceipt(garageBaseline); save();
  await stopFrameObserver();
  await within(page.close(), 10_000, 'Page close');
}

async function focusedNightFixturePictures() {
  for (const [mapId, specId, kind, label] of [
    ['urban', 'm1a1', 'streetlamp', 'high-urban-streetlamp'],
    ['verdant', 't90a_vladimir', 'shtora', 'high-t90a-vladimir-shtora'],
  ]) {
    const row = { label, mapId, specId, kind, visualAcceptance: 'requires-human-screenshot-review', checks: { completed: false } };
    report.focusedFixtures.push(row); save();
    await stage(mapId, specId);
    await atmosphereReceipt(seedFor('temperate', 'day'), mapId);
    try {
      row.fixture = await evaluateWithin(kind => window.__equipmentDamageProbe.stageNightLightCloseup(kind), kind);
      await settle(30);
      row.day = await evaluateWithin(readVisualState); save();
      await screenshot(`${label}-day`, row.day);
      row.night = await atmosphereReceipt(seedFor('temperate', 'night'), mapId); save();
      await screenshot(`${label}-night`, row.night);
      row.restored = await atmosphereReceipt(seedFor('temperate', 'day'), mapId); save();
      await screenshot(`${label}-day-restored`, row.restored);
      row.checks = checkFocusedFixtureCase(row); save();
      assert(Object.values(row.checks).every(Boolean), `Focused fixture checks failed: ${label}`);
      await nativeGraphics(`${label}-graphics`);
    } finally {
      await evaluateWithin(() => window.__equipmentDamageProbe.restoreNightLightCamera());
      await settle(30);
    }
  }
}

async function enterAuthoredGarage() {
  await evaluateWithin(async () => {
    const d = window.__DEBUG;
    d.shotMode = false; await d.enterGarage();
    window.__equipmentDamageProbe.beginStateEpoch();
  }, undefined, 120_000, 'Garage return');
  await settle(2);
  const result = await evaluateWithin(readVisualState);
  assertRenderedState(result);
  assert.equal(result.phase, 'garage'); assert.equal(result.weather, null);
  assert.equal(result.precipitationAttached, false);
  assert(validNightLightState(result), 'Garage detaches and zeroes the battle-only lamp pool');
  return result;
}

async function garageReceipt(baseline) {
  const result = await enterAuthoredGarage();
  assert.deepEqual(lightingReceipt(result), lightingReceipt(baseline), 'authored same-variant Garage lighting restored');
  return result;
}

async function equipmentGeometryReceipt() {
  // Leopard 2A6's authored ammo can is merged into the instance-owned
  // turretDark/nonArmor bucket (profiles/leopard.ts + mergeBucket). Hash only
  // this one geometry at explicit checkpoints, never retain fleet buffers.
  const mesh = window.__DEBUG.game.player.visual.root.getObjectByName('turretDark');
  if (!mesh?.isMesh || mesh.userData.combatHitboxRole !== 'nonArmor' || mesh.geometry.index) {
    throw new Error('Missing expected owned nonArmor turretDark merge');
  }
  const geometry = mesh.geometry;
  const digest = async name => {
    const attribute = geometry.getAttribute(name), array = attribute?.array;
    if (!(array instanceof Float32Array) || attribute.itemSize !== 3 || !array.length) {
      throw new Error(`Missing equipment ${name} Float32 buffer`);
    }
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return { count: attribute.count, sha256: Array.from(new Uint8Array(hash),
      byte => byte.toString(16).padStart(2, '0')).join('') };
  };
  return { meshUuid: mesh.uuid, geometryUuid: geometry.uuid, role: mesh.userData.combatHitboxRole,
    position: await digest('position'), normal: await digest('normal'),
    box: geometry.boundingBox ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()] : null,
    sphere: geometry.boundingSphere ? [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius] : null };
}

function checkEquipmentGeometry(before, after, reset) {
  for (const state of [after, reset]) {
    assert.equal(state.meshUuid, before.meshUuid, 'equipment mesh identity changed');
    assert.equal(state.geometryUuid, before.geometryUuid, 'equipment geometry ownership changed');
    assert.equal(state.role, 'nonArmor');
    assert.equal(state.position.count, before.position.count);
    assert.equal(state.normal.count, before.normal.count);
  }
  assert.notEqual(after.position.sha256, before.position.sha256, 'accepted dent must alter actual positions');
  assert.notEqual(after.normal.sha256, before.normal.sha256, 'accepted dent must alter actual normals');
  assert.deepEqual(reset, before, 'reset restores exact positions, normals and bounds');
}

async function equipmentPictures() {
  report.equipmentProgress = 'staging'; save();
  await stage('verdant', 'leo2a6');
  report.atmosphere = await evaluateWithin(async () => {
    const d = window.__DEBUG;
    await d.battleAtmosphere.prepare(1, 'verdant');
    await d.nightLighting.prepare();
    const turret = d.game.player.visual.root.getObjectByName('rig_turret');
    const target = d.camera.position.clone().set(.26, .405, -2.485);
    turret.localToWorld(target);
    d.camera.position.copy(target).add(d.camera.position.clone().set(.65, .8, -1.35));
    d.camera.lookAt(target); d.camera.fov = 42; d.camera.updateProjectionMatrix();
    window.__equipmentDamageProbe.beginStateEpoch();
    return { condition: d.battleAtmosphere.current.weather.condition,
      timeOfDay: d.battleAtmosphere.current.weather.timeOfDay,
      precipitationAttached: !!d.scene.getObjectByName('battle-precipitation') };
  }, undefined, 120_000, 'Equipment preparation');
  save();
  assert.deepEqual(report.atmosphere, { condition: 'clear', timeOfDay: 'day', precipitationAttached: false });
  await settle(5);
  report.equipmentGeometry = { before: await evaluateWithin(equipmentGeometryReceipt) }; save();
  await screenshot('equipment-before', await evaluateWithin(readVisualState));
  report.equipmentProgress = 'before captured'; save();
  const result = await evaluateWithin(() => {
    const visual = window.__DEBUG.game.player.visual;
    const event = { impactFrame: 'turret', impactLocalPos: [.26, .405, -2.463],
      impactLocalNormal: [0, 0, -1], caliberMm: 120, kind: 'nonpen' };
    const result = { applied: visual.applyEquipmentDamage(event), duplicate: visual.applyEquipmentDamage(event) };
    window.__equipmentDamageProbe.beginStateEpoch();
    return result;
  });
  report.equipment = result; save();
  assert.deepEqual(result, { applied: true, duplicate: false });
  await settle(5);
  report.equipmentGeometry.after = await evaluateWithin(equipmentGeometryReceipt); save();
  await screenshot('equipment-after', await evaluateWithin(readVisualState));
  report.equipmentProgress = 'damage captured'; save();
  await evaluateWithin(() => {
    window.__DEBUG.game.player.visual.resetDestroyed();
    window.__equipmentDamageProbe.beginStateEpoch();
  });
  await settle(5);
  report.equipmentGeometry.reset = await evaluateWithin(equipmentGeometryReceipt); save();
  checkEquipmentGeometry(report.equipmentGeometry.before, report.equipmentGeometry.after, report.equipmentGeometry.reset);
  await screenshot('equipment-reset', await evaluateWithin(readVisualState));
  report.equipmentProgress = 'reset captured'; save();
  return result;
}

async function stopOwnedBrowser() {
  if (!browser) return;
  const child = browser.process();
  const running = () => child && child.exitCode === null && child.signalCode === null;
  const exited = new Promise(resolve => {
    if (!running()) resolve(); else child.once('exit', resolve);
  });
  const graceful = await cleanupStep('Browser graceful close', () => browser.close(), 10_000);
  if (!graceful && running()) {
    await cleanupStep(`Owned Chrome PID ${child.pid} forced exit`, async () => {
      // Only this launch's exact ChildProcess; never search/kill other Chrome
      // PIDs or a process group belonging to another browser session.
      report.chromeKill = { pid: child.pid, signal: 'SIGKILL', sent: child.kill('SIGKILL') }; save();
      await within(exited, 5_000, `Owned Chrome PID ${child.pid} exit`);
    }, 6_000);
  }
  if (!graceful) await cleanupStep('Disconnect owned browser transport', () => browser.disconnect(), 5_000);
  report.chromeStopped = !running();
  if (running()) {
    report.cleanupErrors.push(`Owned Chrome PID ${child.pid} did not exit after SIGKILL`);
    child.unref();
  }
  save();
}

async function stopOwnedPreview() {
  if (!server) return;
  const closed = new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  const graceful = await cleanupStep('Preview graceful close', () => closed, 5_000);
  if (!graceful) {
    // This Set contains only sockets accepted by our owned preview server.
    for (const socket of previewSockets) socket.destroy();
    await cleanupStep('Owned preview sockets closed', () => closed, 5_000);
  }
  report.previewStopped = !server.httpServer.listening && previewSockets.size === 0;
  if (!report.previewStopped) report.cleanupErrors.push('Owned preview did not fully stop');
  save();
}

async function stopFrameObserver() {
  if (!page || page.isClosed()) return;
  const receipt = await evaluateWithin(() => window.__equipmentDamageProbe?.dispose() ?? null);
  report.observerCleanup.push(receipt); save();
  assert(receipt?.restored && !receipt.pendingWait, 'completed-render observer must restore its owned method/timer');
}

try {
  save();
  const entry = readFileSync('dist/index.html');
  report.build = createHash('sha256').update(entry).digest('hex');
  if (optionalFixtureSuite || coldNightEntry) assert.equal(report.build, expectedBuildHash, 'Exact approved production index required');
  assert(!entry.toString().includes('/@vite/client'), 'Production build required');
  server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 5852, strictPort: true } });
  server.httpServer.on('connection', socket => {
    previewSockets.add(socket);
    socket.once('close', () => previewSockets.delete(socket));
  });
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 360_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
  report.chromePid = browser.process()?.pid ?? null; save();
  report.browserVersion = await within(browser.version(), 10_000, 'Browser version');
  for (const tier of [
    { label: 'high', query: 'desktop', preset: 'high', viewport: { width: 1440, height: 900, deviceScaleFactor: 1 } },
    { label: 'tablet', query: 'mobile', preset: 'mobile', viewport: { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ]) {
    page = await within(browser.newPage(), 30_000, 'Browser page creation');
    await configurePage(tier);
    await page.goto(`http://127.0.0.1:5852/?debug=1&tier=${tier.query}`, { waitUntil: 'domcontentloaded', timeout: 360_000 });
    await page.waitForFunction('window.__GAME_READY && window.__DEBUG?.battleAtmosphere && window.__DEBUG?.nightLighting', { timeout: 360_000 });
    await evaluateWithin(() => window.__equipmentDamageProbe.install(window.__DEBUG.post));
    await evaluateWithin(installNightLightProbe);
    await settle(2);
    // The sealed Verdant cold-boot path deliberately skips preset activation
    // (main.ts): its sky default far-cloud opacity is .42, while normal Garage
    // entry authors .6. Preserve that receipt, then compare matching lifecycle
    // states. Never overwrite the raw cold state or silently waive a delta.
    report[`${tier.label}-coldGarage`] = await evaluateWithin(readVisualState); save();
    const garageBaseline = await enterAuthoredGarage();
    assert.equal(garageBaseline.phase, 'garage'); assert.equal(garageBaseline.weather, null);
    report[`${tier.label}-garageBaseline`] = garageBaseline; save();
    await nativeGraphics(`${tier.label}-graphics`);
    if (coldNightEntry) {
      assert.equal(tier.label, 'high');
      await coldNightEntryPictures(garageBaseline);
      break;
    }
    if (optionalFixtureSuite) {
      assert.equal(tier.label, 'high');
      await completeOptionalFixtureSuite(garageBaseline);
      break;
    }
    if (censusSource || fixtureCensusSource) {
      assert.equal(tier.label, 'high');
      if (fixtureCensusSource) await fixtureCensus();
      else await windowCensus();
      await stopFrameObserver();
      await within(page.close(), 10_000, 'Page close');
      break;
    }
    await dayNightPictures(tier);
    if (tier.label === 'high') {
      await focusedNightFixturePictures();
      report.equipment = await equipmentPictures();
      await nativeGraphics('graphicsAfterEquipment');
    }
    const exitMap = tier.label === 'high' ? 'verdant' : 'monsoon';
    const exitBiome = tier.label === 'high' ? 'temperate' : 'tropical';
    const beforeGarage = await atmosphereReceipt(seedFor(exitBiome, 'night'), exitMap);
    report[`${tier.label}-nightBeforeGarage`] = beforeGarage; save();
    assert(validNightLightState(beforeGarage), 'Garage cleanup must begin with actual active night lamps');
    report[`${tier.label}-garage`] = await garageReceipt(garageBaseline); save();
    await stopFrameObserver();
    await within(page.close(), 10_000, 'Page close');
  }
  const matrixPassed = !coldNightEntry && !optionalFixtureSuite && !censusSource && !fixtureCensusSource && report.equipment.applied === true && report.equipment.duplicate === false
    && report.cases.length === 6 && report.cases.every(row => Object.values(row.checks).every(Boolean))
    && report.focusedFixtures.length === 2 && report.focusedFixtures.every(row => Object.values(row.checks).every(Boolean))
    && report.lightCloseups.length === 4 && report.lightCloseups.every(row => row.structuralPassed)
    && report.screenshots.length === 31 && report.screenshots.every(row => row.completed)
    && report.errors.length === 0 && report.consoleErrors.length === 0;
  const fixturesPassed = worldFixturesOnly && report.worldFixtures.length === 3
    && report.worldFixtures.every(row => Object.values(row.checks).every(Boolean))
    && report.screenshots.length === 9 && report.screenshots.every(row => row.completed)
    && report['high-garage']?.phase === 'garage' && validNightLightState(report['high-garage']);
  const vehiclesPassed = vehicleFixtureIds.length > 0 && report.vehicleFixtures.length === vehicleFixtureIds.length
    && report.vehicleFixtures.every(row => Object.values(row.checks).every(Boolean))
    && report.screenshots.length === vehicleFixtureIds.length * 3 && report.screenshots.every(row => row.completed)
    && report['high-garage']?.phase === 'garage' && validNightLightState(report['high-garage']);
  const coldPassed = coldNightEntry && report.coldNight?.passed && report.screenshots.length === 3
    && report.screenshots.every(row => row.completed) && report['high-garage']?.phase === 'garage'
    && validNightLightState(report['high-garage']);
  report.passed = matrixPassed || fixturesPassed || vehiclesPassed || coldPassed;
} catch (error) { report.errors.push(error.stack ?? String(error)); save(); }
finally {
  if (coldNightEntry) {
    await cleanupStep('Cold entry observer cleanup', async () => {
      if (page && !page.isClosed()) await evaluateWithin(() => window.__equipmentDamageProbe?.coldEntry?.dispose());
    });
    await cleanupStep('Exact cold-entry build after acquisition', () => {
      report.buildAfter = createHash('sha256').update(readFileSync('dist/index.html')).digest('hex');
      assert.equal(report.buildAfter, expectedBuildHash);
    });
  }
  await cleanupStep('Completed-render observer cleanup', stopFrameObserver, 12_000);
  await cleanupStep('Owned browser shutdown', stopOwnedBrowser, 25_000);
  await cleanupStep('Owned preview shutdown', stopOwnedPreview, 15_000);
  report.finishedAt = new Date().toISOString();
  report.passed &&= report.cleanupErrors.length === 0
    && report.errors.length === 0 && report.consoleErrors.length === 0;
  save();
}
console.log(JSON.stringify({ out, passed: report.passed, errors: report.errors,
  consoleErrors: report.consoleErrors, cleanupErrors: report.cleanupErrors,
  equipment: report.equipment, garage: report.garage }));
if (process.argv.includes('--gate') && !report.passed) process.exitCode = 1;
