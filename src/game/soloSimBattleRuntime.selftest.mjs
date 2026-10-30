// A free sortie's battle on the solo sim Worker (soloSimBattleRuntime.ts; RUST-ENGINE-DECISION §7 step 5, phase 3), over
// the in-process core: the Worker is told to prepare at once and the page's world loads beside it; the presentation is
// built on that world, seated with the planned seats (the viewer's vehicle first, deferRoster); the covered warms run in
// order, the other seats are taken in under the cover, the battle phase is activated, the loader fades and only then does
// the Worker's held count run. The battle frame's hold stands the Worker's tick, the HUD's presses reach the controls, the
// Garage return stops the Worker; the page hidden stands it too, and an error the running Worker raises is a warning. A
// link lost short of a verdict ends the live battle without a record (the presentation stays for the end screen). A Worker
// that cannot boot rejects with its stage named `boot` (the page takes the battle), and the owner's static graph holds no
// room, session, signalling, ICE, WebRTC, seat token or migration.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';
import { createSoloSimCore } from './soloSimCore.ts';
import { createSoloSimBattleRuntime } from './soloSimBattleRuntime.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { CLOSE_REASON, TEAM } from '../mp/wire/index.ts';

const watchdog = setTimeout(() => { console.error('soloSimBattleRuntime.selftest: stuck'); process.exit(1); }, 150_000);
watchdog.unref();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const until = async (predicate, label, timeoutMs = 60_000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); }
};

// a paired channel, each message on its own task (as a Worker's postMessage)
function channel() {
  const listeners = { page: new Set(), sim: new Set() };
  let closed = false;
  const end = (self, other) => ({
    post(message) { setTimeout(() => { for (const listener of listeners[other]) listener(message); }, 0); },
    onMessage(listener) { listeners[self].add(listener); return () => listeners[self].delete(listener); },
    close() { closed = true; listeners[self].clear(); },
  });
  return { page: end('page', 'sim'), sim: end('sim', 'page'), get closed() { return closed; } };
}

/** The network presentation's surface, recorded: the roster from the WELCOME, the viewer alone until streamRoster. */
function recordedPresentation(options, record) {
  const actors = new Map();
  let ownEntityId = -1;
  let ready = Promise.resolve();
  let deferred = [];
  const actorFor = (entry, context) => ({
    id: entry.playerId, entityId: entry.entityId, specId: entry.specId, spec: { id: entry.specId, name: entry.specId },
    camo: options.camoFor(entry), isPlayer: entry.entityId === context.ownEntityId, team: entry.team,
    state: { pos: { x: 0, y: 1, z: 0 }, yaw: 0 }, combat: { destroyed: false },
    input: { throttle: 0.5, steer: 0, brake: false, fire: false, aimLocked: false, aimPoint: { x: 0, y: 1, z: 90 }, shellSlot: 0 },
    visual: { root: {}, setGroundSampler() {}, dispose() {} },
  });
  const presentation = {
    options, actors, roster: [], frames: 0, disposed: false, sharesAuthorityIndices: true,
    get ownActor() { for (const actor of actors.values()) if (actor.entityId === ownEntityId) return actor; return null; },
    applyRoster(entries, context) {
      ownEntityId = context.ownEntityId;
      record.push('welcome');
      ready = ready.then(async () => {
        await sleep(5);
        for (const entry of entries) {
          if (entry.team === TEAM.SPECTATOR) continue;
          if (options.deferRoster && entry.entityId !== context.ownEntityId) { deferred.push([entry, context]); continue; }
          actors.set(entry.playerId, actorFor(entry, context));
        }
      });
      return ready;
    },
    rosterReady() { return ready; },
    async streamRoster() {
      record.push('streamRoster');
      const made = deferred.map(([entry, context]) => { const actor = actorFor(entry, context); actors.set(entry.playerId, actor); return actor; });
      deferred = [];
      return made;
    },
    applyFrame() { presentation.frames++; options.game.player = presentation.ownActor; },
    applyEvent() {},
    applyVerdict() {},
    setVisibility() {},
    predictionWorld() { return null; },
    setPerspective() { return true; },
    setAuthorityObstacles() {},
    mount() {}, unmount() {}, endDisconnected() { record.push('endDisconnected'); return false; },
    dispose() { presentation.disposed = true; record.push('presentation:dispose'); },
  };
  return presentation;
}

/** The page's visibility, flipped by hand. */
function pageVisibility() {
  const listeners = new Set();
  const page = {
    hiddenNow: false,
    port: { hidden: () => page.hiddenNow, onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    set(hidden) { page.hiddenNow = hidden; for (const listener of [...listeners]) listener(); },
    get listeners() { return listeners.size; },
  };
  return page;
}

function ports(record, port, { openWorker, visibility } = {}) {
  const presentations = [];
  const stage = (name) => async () => { record.push(name); };
  return {
    presentations,
    ports: {
      lifecycle: { primeReveal: stage('primeReveal') },
      load: {
        battleLoad: { progress() {}, hide: stage('hide') },
        audio: { resume() {}, loadingOn() {}, ambientOn() {}, warmBattleEvents() {} },
        lighting: { setFarCascadeDormant() {} },
        ensureBattleVisuals: async () => {},
        loadModules: async () => {},
        loadWorld: async (mapId) => { await sleep(20); record.push(`world:${mapId}`); },
        prebuildRoster: (seats) => { record.push(`prebuild:${seats.map((seat) => (seat.isViewer ? 'viewer' : seat.playerId)).join(',')}`); return null; },
        nextFrame: () => sleep(1),
        setAdaptiveSuspended: (value) => record.push(`adaptive:${value}`),
        recordTrace: (trace) => { record.trace = trace; record.push(`trace:${trace.status}`); },
      },
      roster: { vehicleName: (specId) => specId, emitBattleStart: () => record.push('battleStart'), setCamoBiome() {} },
      scene: {
        engineCtx: { scene: { add() {} } }, game: { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null },
        bus: { emit() {} }, getWorldCollision: () => null, groundSampler: () => 0,
        getFx: () => ({ setFrozen() {}, resetAll() {} }), resetRoundState: () => record.push('reset'),
      },
      warm: {
        atmosphere: stage('atmosphere'), nightLighting: stage('nightLighting'), terrain: stage('terrain'), wrecks: stage('wrecks'),
        compile: async () => { record.push('compile'); return { preparation: { status: 'complete', pending: 0 } }; },
        playerPanel: stage('playerPanel'),
        openingEffects: async (fx, view, signal, options) => { record.push(`openingEffects:${options?.pacing}`); return { pacing: options?.pacing }; },
        streamedVehicles: async (view) => { record.push(`streamedVehicles:${view.entities.size}`); },
        presentation: stage('openingGroundCover'), finalShadows: stage('finalShadows'),
      },
      presentation: {
        activate: (request) => record.push(`activate:${request.viewerId}:${request.own.specId}`),
        setGarageLighting: (value) => record.push(`garageLighting:${value}`),
      },
      openWorker: openWorker ?? ((battlefield) => { record.push(`openWorker:${battlefield.mapId}`); return port; }),
      world: { manifestBase: null, simKernelsUrl: null },
      clientBuild: 'selftest',
      reportWarning: (scope, message) => record.push(`warn:${scope}:${message}`),
      ...(visibility ? { visibility: visibility.port } : {}),
      createPresentation: (options) => { const presentation = recordedPresentation(options, record); presentations.push(presentation); return presentation; },
    },
  };
}

await ensureAuthorityFleet();
const seats = [
  { playerId: 'player', name: '', team: 'alpha', specId: 'm1a1_abrams_hc', isPlayer: true },
  ...['Viper', 'Rook'].map((name, k) => ({ playerId: `bot-${k + 1}`, name, team: 'alpha', specId: ['t90am', 'leo2_improved'][k], isPlayer: false, difficulty: 'normal' })),
  ...['Hammer', 'Wolf', 'Shrike'].map((name, k) => ({ playerId: `bot-${k + 3}`, name, team: 'bravo', specId: ['leclerc_sxxi', 't90am', 'merkava4'][k], isPlayer: false, difficulty: 'hard' })),
];
const sortie = { specId: 'm1a1_abrams_hc', mapId: 'verdant', mode: 'standard', seed: 7, seats, countdownS: 1, camoFor: () => 'factory' };

// the sortie, end to end
{
  const record = [];
  const link = channel();
  const core = createSoloSimCore({ port: link.sim, buildWorld: async () => { record.push('worker:world'); return 'terrain'; } });
  const visibility = pageVisibility();
  const { ports: battlePorts, presentations } = ports(record, link.page, { visibility });
  const runtime = createSoloSimBattleRuntime(battlePorts);
  const pump = setInterval(() => runtime.pump(1 / 60, performance.now()), 16);
  try {
    assert.equal(runtime.active, false);
    await runtime.begin(sortie);
    assert.equal(runtime.inMatch, true, 'the battle phase is live at the reveal');
    const order = (name) => record.findIndex((entry) => entry === name || entry.startsWith(`${name}:`));
    // the Worker is opened before the page's world, which loads beside its own
    assert.ok(order('openWorker') < order('world'), 'the Worker opens first');
    assert.ok(order('worker:world') >= 0, 'the Worker built its battlefield');
    assert.equal(record.find((entry) => entry.startsWith('prebuild:')), 'prebuild:viewer,bot-1,bot-2,bot-3,bot-4,bot-5', 'the viewer\'s vehicle first, its side next');
    for (const [a, b] of [['world', 'welcome'], ['welcome', 'atmosphere'], ['atmosphere', 'terrain'], ['terrain', 'compile'], ['compile', 'playerPanel'],
      ['playerPanel', 'openingEffects'], ['openingEffects', 'streamRoster'], ['streamRoster', 'streamedVehicles'], ['streamedVehicles', 'activate'],
      ['activate', 'finalShadows'], ['finalShadows', 'primeReveal'], ['primeReveal', 'hide'], ['hide', 'trace']]) {
      assert.ok(order(a) >= 0 && order(a) < order(b), `${a} before ${b} (${record.join(' ')})`);
    }
    assert.equal(record.find((entry) => entry.startsWith('streamedVehicles:')), 'streamedVehicles:5', 'the other five seats taken in under the cover');
    assert.equal(record.find((entry) => entry.startsWith('activate:')), 'activate:player:m1a1_abrams_hc');
    assert.equal(record.at(-1), 'trace:complete');
    // (262) the opening warm paced by frames, as the page's solo deployment warm, and its time and report in the trace
    assert.equal(record.find((entry) => entry.startsWith('openingEffects:')), 'openingEffects:covered');
    assert.equal(typeof record.trace.openingEffects?.ms, 'number');
    assert.deepEqual(record.trace.openingEffects.detail, { pacing: 'covered' });
    const presentation = presentations[0];
    assert.equal(presentation.options.solo, true, 'its end is a solo battle\'s');
    assert.equal(presentation.options.deferRoster, true);
    assert.equal(presentation.actors.size, seats.length, 'every planned seat is in the battle');
    // the held count runs from the reveal
    const actor = core.actor;
    assert.ok(actor, 'the Worker\'s authority runs');
    await until(() => actor.authority.phase === 'playing', 'the released count runs out');
    // the battle frame's hold stands the Worker's tick
    assert.equal(runtime.setPaused(true), true);
    await until(() => actor.paused, 'the Worker takes the hold');
    const heldTick = actor.tick;
    await sleep(400);
    assert.equal(actor.tick, heldTick, 'no tick while held');
    runtime.setPaused(false);
    await until(() => actor.tick > heldTick + 20, 'the battle goes on');
    // the page hidden stands the tick as the hold does (the page's own battle stands with its frames); shown, it goes on
    visibility.set(true);
    await until(() => actor.paused, 'the Worker stands while the page is hidden');
    assert.equal(runtime.stats().paused, true);
    const hiddenTick = actor.tick;
    await sleep(300);
    assert.equal(actor.tick, hiddenTick, 'no tick while hidden');
    // held while hidden, then shown: the hold still stands
    runtime.setPaused(true);
    visibility.set(false);
    await sleep(100);
    assert.equal(actor.paused, true, 'shown under the hold, the tick still stands');
    runtime.setPaused(false);
    await until(() => !actor.paused && actor.tick > hiddenTick + 20, 'shown and released, the battle goes on');
    // an error the running Worker raises is a warning: the battle goes on
    link.sim.post({ type: 'boot_failed', error: 'a tick threw' });
    await until(() => record.includes('warn:solo sim:a tick threw'), 'the running Worker\'s error is reported');
    assert.equal(runtime.active, true);
    assert.equal(presentation.disposed, false, 'the battle keeps its presentation');
    // a HUD press rides the next control sample
    runtime.queueAction('smoke');
    await until(() => presentation.frames > 30, 'frames reach the presentation');
    assert.equal(runtime.stats().actors, seats.length);
    // the Garage return stops the Worker and lets the presentation go
    runtime.disposePresentation();
    assert.equal(runtime.active, false);
    assert.equal(presentation.disposed, true);
    await sleep(50);
    assert.ok(actor.stopped, 'the Worker\'s authority stops with the sortie');
    assert.equal(visibility.listeners, 0, 'the sortie lets the page\'s visibility go');
    console.log(`soloSimBattleRuntime.selftest: a sortie of ${seats.length} seats loaded beside the Worker, warmed and took in its other seats under the cover, revealed, ran its held count from the reveal, held for the pause and while the page was hidden, took a running error as a warning and stopped at the Garage return`);
  } finally {
    clearInterval(pump);
    runtime.disposePresentation();
    core.dispose();
  }
}

// the Worker's link lost short of a verdict: the live battle ends without a record and keeps its presentation
{
  const record = [];
  const link = channel();
  const core = createSoloSimCore({ port: link.sim, buildWorld: async () => 'terrain' });
  const { ports: battlePorts, presentations } = ports(record, link.page);
  const runtime = createSoloSimBattleRuntime(battlePorts);
  const pump = setInterval(() => runtime.pump(1 / 60, performance.now()), 16);
  try {
    await runtime.begin(sortie);
    await until(() => core.actor?.authority.phase === 'playing', 'the count runs out');
    core.actor.stop(CLOSE_REASON.SERVER_DRAIN, 'the simulation stopped');
    await until(() => record.includes('endDisconnected'), 'the battle ends as lost');
    assert.equal(runtime.active, true, 'the sortie stays for its end screen');
    assert.equal(presentations[0].disposed, false, 'the presentation stays for its end screen');
    runtime.disposePresentation();
    assert.equal(presentations[0].disposed, true);
    console.log('soloSimBattleRuntime.selftest: a link lost short of a verdict ends the live battle without a record and keeps the presentation for the end screen');
  } finally {
    clearInterval(pump);
    runtime.disposePresentation();
    core.dispose();
  }
}

// a Worker that cannot boot: the sortie rejects at `boot` and lets everything go
{
  const record = [];
  const link = channel();
  // a core that refuses every boot (its world cannot be built)
  const core = createSoloSimCore({ port: link.sim, buildWorld: async () => { throw new Error('no battlefield'); } });
  const { ports: battlePorts, presentations } = ports(record, link.page);
  const runtime = createSoloSimBattleRuntime(battlePorts);
  const pump = setInterval(() => runtime.pump(1 / 60, performance.now()), 16);
  try {
    const failure = await runtime.begin(sortie).then(() => null, (error) => error);
    assert.ok(failure, 'the sortie fails');
    assert.equal(failure.soloSimStage, 'boot', `its stage is the boot (${failure?.message})`);
    assert.equal(runtime.active, false);
    assert.equal(presentations[0]?.disposed, true, 'the presentation is let go');
    assert.ok(record.includes('trace:failed'), 'the failed entry is traced');
    console.log('soloSimBattleRuntime.selftest: a Worker that cannot boot rejects the sortie at `boot` (the page takes the battle) and lets the presentation go');
  } finally {
    clearInterval(pump);
    core.dispose();
  }
}

// a Worker that cannot even be made: the same `boot`, before any world
{
  const record = [];
  const { ports: battlePorts } = ports(record, null, { openWorker: () => { throw new Error('Workers are unavailable'); } });
  const runtime = createSoloSimBattleRuntime(battlePorts);
  const failure = await runtime.begin(sortie).then(() => null, (error) => error);
  assert.equal(failure?.soloSimStage, 'boot');
  assert.ok(!record.some((entry) => entry.startsWith('world:')), 'no world is loaded for it');
}

// no multiplayer structure in the owner's static graph (types are erased: the composition's port shapes are types only)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function staticImports(file) {
  if (!/\.(?:ts|mjs|js)$/.test(file)) return [];
  const ast = parseAst(readFileSync(resolve(root, file), 'utf8'), { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const out = [];
  for (const node of ast.body) {
    const declaration = node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source);
    if (!declaration || typeof node.source?.value !== 'string' || !node.source.value.startsWith('.')) continue;
    if (node.importKind === 'type' || node.exportKind === 'type') continue;
    if (node.type === 'ImportDeclaration' && node.specifiers?.length && node.specifiers.every((s) => s.importKind === 'type')) continue;
    const target = resolve(root, dirname(file), node.source.value);
    if (existsSync(target)) out.push(relative(root, target));
  }
  return out;
}
const MULTIPLAYER = /^src\/mp\/(?:room|session)\/|^server\/rooms\/|signal|iceConfig|webRtcTransport|webSocketTransport|seatToken|migration(?!Store\.ts$)|matchHostCore|matchSession|multiplayerStatus/i;
for (const entry of ['src/game/soloSimBattleRuntime.ts', 'src/game/soloSimBrowserPort.ts', 'src/game/soloSimSortie.ts']) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) for (const next of staticImports(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  const found = [...seen].filter((file) => MULTIPLAYER.test(file));
  assert.deepEqual(found, [], `${entry} imports no room, session, signalling, ICE, WebRTC, seat token, migration or status strip`);
}
console.log('soloSimBattleRuntime.selftest: a Worker that cannot be made fails at `boot` before any world; the owner, its Worker port and its seats import no room, session, signalling, ICE, WebRTC, seat token, migration or status strip');
