import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import { createGarageDressingScheduler } from './garageDressingScheduler.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.ts'), 'utf8');
const garageReturn = fs.readFileSync(path.join(here, 'garageReturnRuntime.ts'), 'utf8');

const flush = () => new Promise((resolve) => setImmediate(resolve));
let now = 0;
let phase = 'garage';
let transitionActive = false;
let built = false;
let preloadCount = 0;
let pumpCount = 0;
let visualChanges = 0;
const idle = [];
const delayed = [];
const dressing = {
  group: { userData: { buildTimings: [] } },
  async preload() { preloadCount += 1; return dressing; },
  async pump() {
    pumpCount += 1;
    if (pumpCount === 1) dressing.group.userData.buildTimings.push({ chunk: 'core' });
    else built = true;
    return !built;
  },
  isBuilt() { return built; },
};

const scheduler = createGarageDressingScheduler({
  dressing,
  getPhase: () => phase,
  isTransitionActive: () => transitionActive,
  requestIdle: (callback) => idle.push(callback),
  scheduleDelay: (callback, delayMs) => delayed.push({ callback, delayMs }),
  onVisualChange: () => { visualChanges += 1; },
  now: () => now,
});

scheduler.schedule();
scheduler.schedule();
assert.equal(idle.length, 1, 'concurrent requests must coalesce into one idle task');
assert.equal(scheduler.scheduled, true);
now = 1700;
idle.shift()();
await flush();
assert.equal(preloadCount, 1);
assert.equal(pumpCount, 1, 'the ordinary workshop core must build first');
assert.equal(Object.hasOwn(dressing.group.userData, 'modernComponentSources'), false,
  'workshop dressing must not declare fleet-family dependencies');
assert.equal(visualChanges, 1, 'each completed streamed chunk invalidates the presentation');
const firstResume = delayed.shift();
assert.equal(firstResume.delayMs, 140, 'lightweight unfinished chunks resume after a short lull');

firstResume.callback();
assert.equal(idle.length, 1);
idle.shift()();
await flush();
assert.equal(pumpCount, 2);
assert.equal(built, true);
assert.equal(visualChanges, 2, 'the final vehicle chunk also requests an immediate paint');

// A second owner verifies transition and fresh-input deferral without sharing
// completion state from the happy-path stream above.
const waitIdle = [];
const waitDelayed = [];
const waitingDressing = {
  group: { userData: {} },
  async preload() { return waitingDressing; },
  async pump() { return true; },
  isBuilt() { return false; },
};
const waiting = createGarageDressingScheduler({
  dressing: waitingDressing,
  getPhase: () => phase,
  isTransitionActive: () => transitionActive,
  requestIdle: (callback) => waitIdle.push(callback),
  scheduleDelay: (callback, delayMs) => waitDelayed.push({ callback, delayMs }),
  now: () => now,
});
transitionActive = true;
now = 4000;
waiting.schedule();
waitIdle.shift()();
await flush();
assert.equal(waitDelayed[0].delayMs, 350, 'active transitions must never build exhibits');
transitionActive = false;
waitDelayed.shift().callback();
waiting.noteActivity();
waitIdle.shift()();
await flush();
assert.equal(waitDelayed[0].delayMs, 300, 'fresh input must restart the quiet window');
assert.equal(waiting.getLastActivityAt(), now);

assert.match(main, /createGarageDressingScheduler\(\{/,
  'main must compose the typed workshop scheduler');
assert.match(main, /createGarageIdleWorkCoordinator\(\)/,
  'garage background producers must share one typed exclusion owner');
assert.equal((main.match(/acquireBackgroundWork:/g) || []).length, 3,
  'world, neighbor paint and workshop dressing must use the same work lane');
assert.match(main, /const scheduleGarageDressingBuild = garageDressingScheduler\.schedule/,
  'all garage entry points must share the scheduler owner');
assert.doesNotMatch(main, /function scheduleGarageDressingBuild\(/,
  'the workshop state machine must not be duplicated in main');
assert.doesNotMatch(main.slice(main.indexOf('createGarageDressingScheduler({'),
  main.indexOf('const scheduleGarageDressingBuild')), /ensureTankBuilders/,
  'the workshop scheduler must not wait for playable vehicle builders');
assert.match(main, /lastActivityAt: garageDressingScheduler\.getLastActivityAt\(\)/,
  'background world building must observe the same garage activity epoch');
assert.match(main,
  /onGarageVariantMenuIntent:[\s\S]{0,900}previewWarmVariant[\s\S]{0,900}garageStage\.prepareVariant\(previewWarmVariant\.id\)/,
  'selector intent must warm one bounded outdoor scene before its first reveal');

const readyAt = main.indexOf('window.__GAME_READY = true;');
assert(readyAt >= 0);
assert.match(main.slice(readyAt, readyAt + 500), /scheduleGarageDressingBuild\(\)/,
  'the post-ready garage path must arm the dressing scheduler');

assert.match(garageReturn,
  /work\.noteActivity\(\);[\s\S]{0,180}work\.scheduleDressing\(\);/,
  'the Garage return owner must establish a new activity epoch before scheduling work');
assert.match(main,
  /noteActivity: \(\) => garageDressingScheduler\.noteActivity\(\)[\s\S]{0,180}scheduleDressing: scheduleGarageDressingBuild/,
  'Studio/battle returns must establish a fresh lull and resume the stream');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

function pendingEntryFixture({ acquireGate, preloadGate } = {}) {
  const callbacks = [], delays = [], events = [];
  const state = { phase: 'garage', pending: false, now: 0, built: false };
  const owner = createGarageDressingScheduler({
    dressing: {
      isBuilt: () => state.built,
      async preload() { events.push('preload'); await preloadGate?.promise; },
      async pump(stillValid) { assert(stillValid()); events.push('pump'); state.built = true; },
    },
    getPhase: () => state.phase,
    isTransitionActive: () => false,
    isBattleEntryPending: () => state.pending,
    acquireBackgroundWork: async (_kind, stillValid) => {
      assert(stillValid());
      events.push('lease');
      await acquireGate?.promise;
      return { release() { events.push('release'); } };
    },
    requestIdle: (callback) => callbacks.push(callback),
    scheduleDelay: (callback, delayMs) => delays.push({ callback, delayMs }),
    onVisualChange: () => events.push('paint'),
    now: () => state.now,
  });
  state.now = 2000;
  return { owner, state, events, callbacks, delays };
}

{
  const f = pendingEntryFixture();
  f.state.pending = true; // Battle is covered, but still reports Garage.
  f.owner.schedule(); f.callbacks.shift()(); await flush();
  assert.deepEqual(f.events, [], 'covered entry must not acquire/import/pump workshop core');
  assert.equal(f.delays[0].delayMs, 350);
  f.state.pending = false; // A failed entry or covered return can stay Garage.
  f.owner.noteActivity();
  f.delays.shift().callback(); f.callbacks.shift()(); await flush();
  assert.equal(f.delays[0].delayMs, 300, 'return preserves the original fresh quiet window');
  f.state.now += 1000;
  f.delays.shift().callback(); f.callbacks.shift()(); await flush();
  assert.deepEqual(f.events, ['lease', 'preload', 'pump', 'paint', 'release']);
}
for (const boundary of ['acquireGate', 'preloadGate']) {
  const gate = deferred();
  const f = pendingEntryFixture({ [boundary]: gate });
  f.owner.schedule(); f.callbacks.shift()(); await flush();
  f.state.pending = true;
  gate.resolve(); await flush();
  assert(!f.events.includes('pump'), `${boundary}: pending entry stops construction`);
  assert(!f.events.includes('paint'), `${boundary}: no Garage invalidation during entry`);
  assert.equal(f.events.filter((event) => event === 'release').length, 1,
    `${boundary}: pause promptly releases only its acquired background lease`);
  if (boundary === 'acquireGate') assert(!f.events.includes('preload'));
  f.state.phase = 'battle';
  for (const { callback } of f.delays.splice(0)) callback();
  while (f.callbacks.length) f.callbacks.shift()();
  await flush();
  assert.equal(f.delays.length, 0, 'active Battle does not keep a retry timer stream alive');
  f.state.phase = 'garage'; f.state.pending = false;
  f.owner.noteActivity(); f.state.now += 1000; f.owner.schedule();
  f.callbacks.shift()(); await flush();
  assert.equal(f.events.filter((event) => event === 'pump').length, 1,
    `${boundary}: the existing return schedule resumes pending work once`);
}

// Exercise the actual lazy main adapter. Creating the closure before the
// later entry owner exists must not read that owner during pristine boot.
const gateMatch = main.match(/isBattleEntryPending: (\(\) => battleEntryLifecycle\.pending[\s\S]*?),\n/);
assert(gateMatch, 'main must gate the dressing on the real covered entry owner');
const entryGate = new Function(`
  const read = ${gateMatch[1]};
  const battleEntryLifecycle = { pending: false, renderingCovered: false };
  const battleLoad = { covering: false };
  return { read, battleEntryLifecycle, battleLoad };
`)();
assert.equal(entryGate.read(), false);
for (const [owner, key] of [[entryGate.battleEntryLifecycle, 'pending'],
  [entryGate.battleEntryLifecycle, 'renderingCovered'], [entryGate.battleLoad, 'covering']]) {
  owner[key] = true; assert.equal(entryGate.read(), true); owner[key] = false;
}

// Execute the real private pump/acquisition/disposal declarations with small
// rendering ports. Every authored bay keeps its original statements through
// the first await and immediate admission guard; only its expensive geometry
// tail is replaced by a publication spy. This is lifecycle coverage, not a
// substitute for the native full-detail Garage visual gate.
const dressingSource = fs.readFileSync(path.join(here, 'garageDressing.ts'), 'utf8');
const syntax = ts.createSourceFile('garageDressing.ts', dressingSource, ts.ScriptTarget.Latest, true);
const factory = syntax.statements.find((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === 'createGarageDressing');
assert(factory?.body);
const statements = factory.body.statements;
const declaration = (name, nodes = statements) => {
  const found = nodes.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText(syntax) === name));
  assert(found, `actual owner declaration missing: ${name}`);
  return found.getText(syntax);
};
const chunkFunctions = statements.filter((node) => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(syntax) === 'chunks.push')
  .map((node) => node.expression.arguments[0]);
assert.equal(chunkFunctions.length, 8);
const bayPrefixes = chunkFunctions.slice(1, 6).map((node) => {
  const body = node.body.statements;
  const awaitAt = body.findIndex((statement) => /await createLegacyVisual\(/.test(statement.getText(syntax)));
  assert(awaitAt >= 0);
  assert.equal(body[awaitAt + 1].getText(syntax), 'requireGarageWork(stillValid);',
    `${node.name.text}: guard must immediately follow async acquisition, before authored assembly`);
  const opening = dressingSource.slice(node.getStart(syntax), node.body.getStart(syntax) + 1);
  const prefix = body.slice(0, awaitAt + 2).map((statement) => statement.getText(syntax)).join('\n');
  return `${opening}\n${prefix}\nevents.push('assemble:${node.name.text}'); group.add(visual.root); }`;
});
const runtimeReturn = [...statements].reverse().find(ts.isReturnStatement);
assert(runtimeReturn?.expression && ts.isObjectLiteralExpression(runtimeReturn.expression));
const factoryJs = ts.transpileModule(`
  return function(workshopFleet, events) {
    const group = new THREE.Group();
    const legacyVerdantRoot = group;
    const disposables = [];
    const window = { clearTimeout() {}, cancelAnimationFrame() {} };
    const console = { warn() { events.push('warn'); } };
    let battleScreenGeneration = 0, battleScreenTimer = null, battleScreenFrame = null;
    let battleScreenLoading = false, battleScreenCurrentTexture = null;
    let battleScreenNextTexture = null, battleScreenSecondaryTexture = null, battleScreenFallbackTexture = null;
    let battleScreenMesh = null, battleScreenSecondaryMesh = null;
    let battleScreenMaterial = null, battleScreenSecondaryMaterial = null;
    const setVariant = (id) => id;
    ${['WORKSHOP_PRESENTATION_OPTIONS', 'WORKSHOP_CHUNK_VEHICLE_IDS', 'WORKSHOP_CHUNK_LABELS']
      .map((name) => declaration(name, syntax.statements)).join('\n')}
    ${['workshopVisuals', 'preparedVehicleIds', 'disposed', 'pausedWork', 'preparedVisual',
      'pendingTankReveal', 'hidePendingTankReveal', 'createLegacyVisual', 'requireGarageWork',
      'next', 'pendingPump', 'pumpNext', 'pump']
      .map((name) => declaration(name)).join('\n')}
    const chunks = [() => events.push('core'), ${bayPrefixes.join(',\n')},
      () => events.push('finalize'), () => events.push('optimize')];
    const runtime = ${runtimeReturn.expression.getText(syntax)};
    return { runtime, group, selectBay(index) { next = index; },
      preparedCount: () => workshopVisuals.length, cursor: () => next };
  };
`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const createPumpFixture = new Function('THREE', factoryJs)(THREE);

for (let bay = 1; bay <= 5; bay++) {
  const transfer = deferred(), events = [];
  let valid = true, creates = 0, disposes = 0, resets = 0, fleetDisposes = 0;
  const visual = { root: new THREE.Group(),
    resetForGaragePresentation() { resets++; }, dispose() { disposes++; this.root.removeFromParent(); } };
  const f = createPumpFixture({
    async ensureVisualBuilder() { events.push('prepare'); },
    createVisual() { creates++; return transfer.promise; },
    dispose() { fleetDisposes++; },
  }, events);
  f.selectBay(bay);
  await f.runtime.pump(() => valid); // Separate existing builder-prepare slice.
  const loading = f.runtime.pump(() => valid);
  assert.equal(f.runtime.pump(), loading, 'concurrent pump requests join the installed owner');
  await Promise.resolve();
  assert.equal(creates, 1, 'the single admitted owner reaches the delayed transfer');
  valid = false; transfer.resolve(visual);
  assert.equal(await loading, true);
  assert.equal(f.cursor(), bay, 'a paused bay cannot advance its chunk cursor');
  assert.equal(f.preparedCount(), 1);
  assert.equal(f.group.children.length, 0, 'completed transfer stays private during Battle');
  assert.equal(events.some((event) => event.startsWith('assemble:')), false);
  assert.equal(disposes, 0, 'pause retains the completed visual rather than discarding it');
  await f.runtime.pump(() => valid);
  assert.equal(f.group.children.length, 0, 'repeated blocked pumping cannot reveal a private bay');
  valid = true;
  await f.runtime.pump(() => valid);
  assert.equal(creates, 1, 'return reuses the exact completed transfer');
  assert.equal(resets, 1, 'retained visuals are not reset twice');
  assert.equal(f.group.children[0], visual.root);
  assert.equal(visual.root.visible, false, 'assembly still precedes its separate quiet reveal');
  valid = false; await f.runtime.pump(() => valid);
  assert.equal(visual.root.visible, false);
  valid = true; await f.runtime.pump(() => valid);
  assert.equal(visual.root.visible, true);
  f.runtime.dispose(); f.runtime.dispose();
  assert.equal(disposes, 1); assert.equal(fleetDisposes, 1);
}
{
  const transfer = deferred(), events = [];
  let disposes = 0;
  const f = createPumpFixture({ async ensureVisualBuilder() {},
    createVisual: () => transfer.promise, dispose() {} }, events);
  f.selectBay(1); await f.runtime.pump();
  const inFlight = f.runtime.pump();
  await Promise.resolve();
  const capture = f.runtime.ensureBuilt();
  f.runtime.dispose();
  transfer.resolve({ root: new THREE.Group(), dispose() { disposes++; } });
  assert.equal(await inFlight, false, 'a disposed owner cannot resurrect a late worker result');
  await capture;
  assert.equal(disposes, 1); assert.equal(f.preparedCount(), 0);
  assert.equal(events.length, 0);
}

// The deterministic capture drain bypasses the scheduler's background lease.
// It must join the *actual* runtime owner, including while acquisition awaits.
{
  const firstTransfer = deferred(), events = [], requests = new Map(), visuals = [];
  const f = createPumpFixture({
    async ensureVisualBuilder(id) { events.push(`prepare:${id}`); },
    createVisual(id) {
      requests.set(id, (requests.get(id) || 0) + 1);
      const visual = { root: new THREE.Group(), disposes: 0,
        dispose() { this.disposes++; this.root.removeFromParent(); } };
      visuals.push(visual);
      return visuals.length === 1 ? firstTransfer.promise.then(() => visual) : Promise.resolve(visual);
    },
    dispose() { events.push('fleet-dispose'); },
  }, events);
  await f.runtime.pump(); // core
  await f.runtime.pump(); // first builder
  const scheduled = f.runtime.pump(() => true);
  await Promise.resolve();
  assert.equal(requests.get('t90a_burlak'), 1);
  const captureA = f.runtime.ensureBuilt(), captureB = f.runtime.ensureBuilt();
  assert.equal(f.runtime.pump(), scheduled);
  await Promise.resolve();
  assert.equal(requests.get('t90a_burlak'), 1, 'capture overlap cannot duplicate a transfer');
  firstTransfer.resolve();
  await Promise.all([scheduled, captureA, captureB]);
  assert.equal(f.runtime.isBuilt(), true);
  assert.equal(requests.size, 5);
  assert([...requests.values()].every(count => count === 1));
  const assemblies = events.filter(event => event.startsWith('assemble:'));
  assert.equal(assemblies.length, 5); assert.equal(new Set(assemblies).size, 5);
  assert.equal(f.group.userData.buildTimings.filter(row => row.chunk === 'reveal-tank').length, 5);
  assert.equal(f.group.children.length, 5);
  assert(visuals.every(visual => visual.root.visible));
  assert.equal(events.filter(event => event === 'finalize').length, 1);
  assert.equal(events.filter(event => event === 'optimize').length, 1);
  f.runtime.dispose(); f.runtime.dispose();
  assert(visuals.every(visual => visual.disposes === 1));
  assert.equal(events.filter(event => event === 'fleet-dispose').length, 1);
}

{
  const transfer = deferred(), events = [];
  let valid = true, requests = 0;
  const visual = { root: new THREE.Group(), dispose() {} };
  const f = createPumpFixture({ async ensureVisualBuilder() {},
    createVisual() { requests++; return transfer.promise; }, dispose() {} }, events);
  f.selectBay(5); await f.runtime.pump();
  const scheduled = f.runtime.pump(() => valid);
  await Promise.resolve();
  let pausedSnapshot;
  const snapshot = scheduled.then(() => { pausedSnapshot = {
    cursor: f.cursor(), children: f.group.children.length, prepared: f.preparedCount(),
  }; });
  const capture = f.runtime.ensureBuilt();
  valid = false; transfer.resolve(visual);
  await Promise.all([scheduled, snapshot, capture]);
  assert.deepEqual(pausedSnapshot, { cursor: 5, children: 0, prepared: 1 },
    'capture joining cannot overwrite the scheduled step\'s live admission predicate');
  assert.equal(requests, 1, 'force drain resumes the same private visual after joining paused work');
  assert.equal(f.runtime.isBuilt(), true);
  assert.equal(events.filter(event => event.startsWith('assemble:')).length, 1);
  assert.equal(f.group.userData.buildTimings.filter(row => row.chunk === 'reveal-tank').length, 1);
  f.runtime.dispose();
}

for (const boundary of ['prepare', 'transfer']) {
  const gate = deferred(), events = [];
  const failure = new Error(`expected ${boundary} failure`);
  let prepares = 0, requests = 0, disposes = 0;
  const f = createPumpFixture({
    async ensureVisualBuilder() {
      prepares++;
      if (boundary === 'prepare' && prepares === 1) await gate.promise;
    },
    createVisual() {
      requests++;
      if (boundary === 'transfer' && requests === 1) return gate.promise;
      return Promise.resolve({ root: new THREE.Group(), dispose() { disposes++; } });
    }, dispose() {},
  }, events);
  f.selectBay(5);
  if (boundary === 'transfer') await f.runtime.pump();
  const first = f.runtime.pump(), second = f.runtime.pump();
  assert.equal(first, second);
  const capture = f.runtime.ensureBuilt();
  const observed = [first, second, capture].map(promise => assert.rejects(promise, error => error === failure));
  await Promise.resolve(); gate.reject(failure);
  await Promise.all(observed);
  assert.equal(f.cursor(), 5, `${boundary}: rejection must not advance the cursor`);
  assert.equal(f.group.children.length, 0);
  await Promise.all([f.runtime.ensureBuilt(), f.runtime.ensureBuilt()]);
  assert.equal(f.runtime.isBuilt(), true, `${boundary}: failed owner clears for an explicit retry`);
  assert.equal(requests, boundary === 'transfer' ? 2 : 1);
  assert.equal(prepares, boundary === 'prepare' ? 2 : 1);
  assert.equal(events.filter(event => event.startsWith('assemble:')).length, 1);
  f.runtime.dispose(); assert.equal(disposes, 1);
}

{
  const events = [];
  const f = createPumpFixture({}, events);
  let reentrant;
  const first = f.runtime.pump(() => { reentrant = f.runtime.pump(); return true; });
  await first;
  assert.equal(reentrant, first, 'ownership must exist before even a synchronous validity-port callback');
  assert.deepEqual(events, ['core']);
  assert.equal(f.cursor(), 1);
  f.runtime.dispose();
}

console.log('garageDressingLifecycle.selftest: entry suspension, coalesced capture/idle pump and retained cleanup pass');
