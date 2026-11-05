// studioPanelBusy.selftest.mjs — the Studio panel's render queue, film export and sound lane against each other
// (2026-11-02 audit F9). Runs the actual runQueue, the queue's Clear handler, startFilmExport and drawSound of
// studioPanel.ts: Clear during a run skipped the next job, Export film started beside a queued still at every shot, and
// the sound lane re-armed its timer every 1.5 s forever once the panel was hidden. (2026-11-03) And the panel's one busy
// reading (panelBusy) at the scene's entry points: the map pick, the palette's sequences, a time change and Export film
// ran beside a queue run, a light change, a staging or the Studio's own holders. (round 2 U36, review r2) And the panel's own
// holders belong to the session they began in: a time change, a sun move, a battlefield pick, a restore or a queue run an
// exit outlived holds no Studio entered again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
// by namespace: a copy of this file on a tree without the session holder still loads, and fails at its assertion
import * as studioSessionModule from '../game/studioSession.ts';

const { createStudioSession, StudioSessionEnded } = studioSessionModule;

const text = readFileSync(new URL('./studioPanel.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studioPanel.ts', text, ts.ScriptTarget.Latest, true);
const CORE = ['runQueue', 'startFilmExport', 'drawSound', 'chooseMap', 'chooseTime', 'stagePreset', 'queueLight', 'setMapLoading', 'refreshLocks'];
const HELPERS = ['outputBusy', 'panelBusy', 'hostBusy', 'livePump'];
// (round 2 U36, review r2) the panel's own holders as createStudioPanel declares them (a session holder on a tree that has
// one, the plain flag on one that does not)
const LATCHES = ['timeBusy', 'lightInFlight', 'lightPending', 'queueRunning', 'timeChanges', 'lightPump', 'queueRuns', 'mapPicks', 'restores'];
const latchDeclarations = [];
const found = new Map();
let clearHandler = null;
// (round 2 Q18) the header's Restore, Undo and Redo: restoreBtn/undoBtn/redoBtn.addEventListener('click', handler)
const headerHandlers = new Map();
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...CORE, ...HELPERS].includes(node.name.text) && !found.has(node.name.text)) {
    found.set(node.name.text, node.getText(source));
  }
  if (ts.isVariableStatement(node) && node.parent?.parent && ts.isFunctionDeclaration(node.parent.parent)
    && node.parent.parent.name?.text === 'createStudioPanel'
    && node.declarationList.declarations.some((entry) => ts.isIdentifier(entry.name) && LATCHES.includes(entry.name.text))) {
    latchDeclarations.push(node.getText(source));
  }
  // the queue's Clear: queueClear.addEventListener('click', handler)
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'queueClear.addEventListener'
    && node.arguments[0]?.getText(source) === "'click'") clearHandler = node.arguments[1].getText(source);
  for (const button of ['restoreBtn', 'undoBtn', 'redoBtn']) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === `${button}.addEventListener`
      && node.arguments[0]?.getText(source) === "'click'") headerHandlers.set(button, node.arguments[1].getText(source));
  }
  ts.forEachChild(node, visit);
})(source);
for (const name of CORE) assert.ok(found.has(name), `studioPanel.ts declares ${name}`);
assert.ok(clearHandler, 'the queue has a Clear handler');
for (const button of ['restoreBtn', 'undoBtn', 'redoBtn']) assert.ok(headerHandlers.has(button), `the header has its ${button} handler`);

// Load JSON reads its file under the session it was chosen in: a read that lands after an exit is refused by load()
// (StudioSessionEnded) instead of entering the Studio again over the Garage
assert.match(text, /const owner = S\.sessionToken\(\);[^\n]*\n\s*f\.text\(\)\.then\(\(txt\) => \(panelBusy\(\) \? undefined : S\.load\(JSON\.parse\(txt\), \{ owner \}\)\)\)/,
  'the file load carries its session\'s token, and asks the busy reading again once its read lands');
assert.match(text, /if \(!f \|\| panelBusy\(\)\) \{ fileIn\.value = ''; return; \}/, 'Load JSON reads no file while the Studio is held');
assert.match(text, /if \(panelBusy\(\)\) return; \/\/ \(audit F9\) a slot replaces the scene/, 'nor a slot');
assert.match(text, /if \(panelBusy\(\)\) return; \/\/ \(audit F9\) the duel replaces the storyboard/, 'nor the duel');
assert.match(text, /if \(panelBusy\(\)\) return; \/\/ \(audit F9\) a take records over nothing else in flight/, 'nor a recording');
assert.match(text, /busy: hostBusy, \/\/ \(audit F9\)/, 'the Director reads the panel\'s holders with its own');
assert.doesNotMatch(text, /function outputBusy\(/, 'one reading: the output side has no second predicate');

function makePanel({ display = 'block', soundPreview = async () => null, restoreAutosave = async () => true, hang = [] } = {}) {
  const calls = [];
  const timers = [];
  const jobs = [];
  const held = { studio: null, director: false };
  // the Studio's session (studioSession.ts), open; exit() and enter() end it and begin the next
  const session = createStudioSession();
  session.open(session.beginEntry());
  // a hung change (`hang`): its preparation or build still going, settled by the case
  const hung = { time: [], map: [], light: [], restore: [] };
  const settleLater = (kind, value) => (hang.includes(kind)
    ? new Promise((resolve, reject) => { hung[kind].push({ resolve, reject }); }) : Promise.resolve(value));
  const controls = { mapBtn: { disabled: false }, restoreBtn: { disabled: false }, exportBtn: { disabled: false },
    queueStart: { disabled: false }, recordBtn: { disabled: false }, timeMenu: { disabled: false } };
  const ports = {
    calls,
    S: {
      filmExportStatus: () => ({ active: false, supported: true }), recordingStatus: () => ({ active: false }),
      soundPreview: (buckets) => { calls.push(['sound', buckets]); return soundPreview(); },
      busy: () => (session.phase === 'open' ? held.studio : 'session'), sessionToken: () => session.token(),
      mapId: 'verdant', timeOfDay: 'day', productionFormat: 'landscape',
      setMap: (id) => { calls.push(['map', id]); return settleLater('map', id); },
      setTimeOfDay: (time) => { calls.push(['time', time]); return settleLater('time', time); },
      setLight: (patch) => { calls.push(['light', patch]); return settleLater('light', patch); },
      directProduction: (options) => { calls.push(['stage', options.presetId]); return Promise.resolve({}); },
      undo: () => { calls.push(['undo']); return Promise.resolve(true); },
      redo: () => { calls.push(['redo']); return Promise.resolve(true); },
      restoreAutosave: () => { calls.push(['restore']); return hang.includes('restore') ? settleLater('restore', true) : restoreAutosave(); },
    },
    mapBtn: controls.mapBtn, restoreBtn: controls.restoreBtn, exportBtn: controls.exportBtn, queueStart: controls.queueStart,
    recordBtn: controls.recordBtn, mapPick: { setAttribute: () => {} },
    productionPanel: { busy: () => held.director },
    toggleMapPick: () => {}, refreshSun: () => calls.push('refresh-sun'),
    timeMenu: { setDisabled: (disabled) => { controls.timeMenu.disabled = disabled; } },
    createSessionHolder: studioSessionModule.createSessionHolder,
    t: (key) => key, console, aborted: (error) => error?.name === 'AbortError', errorMessage: (error) => String(error),
    refreshQueue: () => calls.push('refresh-queue'),
    api: { notice: (text, tone) => calls.push(['notice', text, tone]), refreshAll: () => {}, refreshMap: () => {}, refreshHistory: () => calls.push('refresh-history') },
    renderFilm: () => { calls.push('render-film'); return new Promise(() => {}); },
    filmSize: { seg: { value: '1080' } }, filmFps: { seg: { value: '30' } }, filmBlur: { seg: { value: '1' } },
    filmShake: { seg: { value: '1' } }, flashBusy: (text) => calls.push(['flash', text]),
    root: { style: { display } }, setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    SOUND_BUCKETS: 400, soundPath: { setAttribute: () => {} }, soundWave: { classList: { remove: () => {} } },
  };
  const code = stripTypeScriptTypes(`
    function makeQueueHarness(ports) {
    const { ${Object.keys(ports).filter((name) => name !== 'calls').join(', ')} } = ports;
    const queueJobs = ports.jobs;
    let soundKey = 'scene', soundTimer = 0;
    let timesOpen = ['day', 'dusk', 'night'];
    ${latchDeclarations.join('\n')}
    // each job's render until the case ends it (pending: the latest)
    let pending = null;
    const renders = new Map();
    const runJob = (job) => new Promise((resolve, reject) => { pending = { job, resolve, reject }; renders.set(job.label, pending); });
    ${[...found.values()].join('\n')}
    const clear = ${clearHandler};
    const header = { restore: ${headerHandlers.get('restoreBtn')}, undo: ${headerHandlers.get('undoBtn')}, redo: ${headerHandlers.get('redoBtn')} };
    return {
      runQueue, startFilmExport, drawSound, clear, queueJobs, chooseMap, chooseTime, stagePreset, queueLight, refreshLocks, panelBusy, header,
      finish: () => { const current = pending; pending = null; renders.delete(current.job.label); current.resolve(1); },
      finishJob: (label) => { const render = renders.get(label); renders.delete(label); if (pending === render) pending = null; render.resolve(1); },
      get running() { return pending?.job ?? null; },
    };
    }
  `);
  const panel = new Function('ports', `${code}\nreturn makeQueueHarness(ports);`)({ ...ports, jobs });
  const exit = () => { assert.ok(session.beginExit() && session.close(), 'the Studio exits'); };
  const enter = () => { assert.ok(session.open(session.beginEntry()), 'and is entered again'); };
  return { panel, calls, timers, held, hung, controls, exit, enter };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
const still = (label) => ({ label, state: 'waiting', progress: 0, preset: { kind: 'still' } });
// what holds the panel, through the panel's own runs: a queue run (its first job still rendering) and a sun move (its apply
// still preparing the light), and their ends
const holdQueue = (h) => { h.panel.queueJobs.push(still('Q')); void h.panel.runQueue(); };
const endQueue = async (h) => { while (h.panel.running) { h.panel.finish(); await settle(); } };
const holdLight = (h) => { h.panel.queueLight({ sunAzimuthDeg: 40 }); };
const endLight = async (h) => { h.hung.light.shift().resolve(); await settle(); };

// 1. Clear during a run removes the finished rows and never skips the next waiting job.
{
  const { panel } = makePanel();
  const job = (label) => ({ label, state: 'waiting', progress: 0, preset: { kind: 'still' } });
  panel.queueJobs.push(job('A'), job('B'), job('C'));
  const run = panel.runQueue();
  await settle();
  assert.equal(panel.running.label, 'A');
  panel.finish(); await settle();
  assert.equal(panel.running.label, 'B');
  panel.clear(); // A is done: Clear takes its row out while B renders
  assert.deepEqual(panel.queueJobs.map((entry) => entry.label), ['B', 'C']);
  panel.finish(); await settle();
  assert.equal(panel.running?.label, 'C', 'the job after the cleared rows still runs');
  panel.finish(); await run;
  assert.deepEqual(panel.queueJobs.map((entry) => entry.state), ['done', 'done'], 'every job ran');
}

// 2. Export film waits while the queue runs (a still at every shot selects shots and seeks between its frames).
{
  const { panel, calls } = makePanel();
  panel.queueJobs.push(still('A'));
  const run = panel.runQueue();
  panel.startFilmExport();
  assert.ok(!calls.includes('render-film'), 'no export beside a queue run');
  panel.finish(); await run;
  panel.startFilmExport();
  assert.ok(calls.includes('render-film'), 'an idle output exports');
}

// 3. A hidden panel's sound lane stops asking: no preview and no timer once the Studio closed; a shown one re-arms while
// the Studio is busy.
{
  const hidden = makePanel({ display: 'none' });
  await hidden.panel.drawSound();
  assert.equal(hidden.timers.length, 0, 'a hidden panel never re-arms its sound lane');
  assert.ok(!hidden.calls.some((call) => Array.isArray(call) && call[0] === 'sound'));
  const shown = makePanel({ display: 'block' });
  await shown.panel.drawSound();
  assert.equal(shown.timers.length, 1, 'a shown panel asks again once a busy Studio settles');
  assert.equal(shown.timers[0].ms, 1500);
}

// 4. One reading at the scene's entry points: during a queue run (its still at every shot captures each shot a frame after
// selecting it), a sun change in flight, the Director's staging or take fetch, or any of the Studio's own holders, the map
// pick, the palette's sequences, a time change, Export film and the queue's Start do nothing; an idle Studio runs them.
{
  const scene = (calls) => calls.filter((call) => Array.isArray(call) && ['map', 'time', 'stage'].includes(call[0]));
  // (the export first: a time change, once started, holds the panel itself until it lands)
  const tryAll = (panel) => {
    panel.startFilmExport(); panel.chooseMap('desert'); panel.stagePreset('one'); panel.chooseTime('night');
  };
  for (const [name, hold, release] of [
    ['a queue run', holdQueue, endQueue],
    ['a sun change in flight', holdLight, endLight],
    ['the Director\'s staging', (h) => { h.held.director = true; }, (h) => { h.held.director = false; }],
    ...['recording', 'film', 'export', 'session', 'scene', 'map', 'history', 'light'].map((holder) => [
      `the Studio's ${holder}`, (h) => { h.held.studio = holder; }, (h) => { h.held.studio = null; }]),
  ]) {
    const h = makePanel({ hang: ['light'] });
    hold(h);
    tryAll(h.panel);
    assert.deepEqual(scene(h.calls), [], `no map pick, sequence or time change during ${name}`);
    assert.ok(!h.calls.includes('render-film'), `no export during ${name}`);
    h.panel.queueJobs.push(still('A'));
    if (name !== 'a queue run') {
      void h.panel.runQueue();
      assert.equal(h.panel.running, null, `the queue does not start during ${name}`);
    }
    await release(h);
    tryAll(h.panel);
    assert.deepEqual(scene(h.calls).map((call) => call[0]), ['map', 'stage', 'time'], `an idle Studio runs them after ${name}`);
    assert.ok(h.calls.includes('render-film'));
    h.panel.chooseTime('night'); // again, before the first lands
    assert.equal(scene(h.calls).filter((call) => call[0] === 'time').length, 1, 'a time change holds the next one until it lands');
  }
}

// 5. (round 2 Q18) The header's Restore, Undo and Redo replace the scene too (an undo between a queued still's captures:
// the next still took the restored scene under the old shot's name): each asks the same reading and does nothing while
// anything holds the panel; an idle Studio runs them. A restore that fails says so in the panel, never an unhandled
// rejection.
{
  const header = (calls) => calls.filter((call) => Array.isArray(call) && ['undo', 'redo', 'restore'].includes(call[0]));
  for (const [name, hold] of [
    ['a queue run', holdQueue],
    ['a sun change in flight', holdLight],
    ['the Director\'s staging', (h) => { h.held.director = true; }],
    ...['recording', 'film', 'export', 'session', 'scene', 'map', 'history', 'light'].map((holder) => [
      `the Studio's ${holder}`, (h) => { h.held.studio = holder; }]),
  ]) {
    const h = makePanel({ hang: ['light'] });
    hold(h);
    h.panel.header.undo(); h.panel.header.redo(); h.panel.header.restore();
    await settle();
    assert.deepEqual(header(h.calls), [], `no undo, redo or restore during ${name}`);
  }
  const idle = makePanel();
  idle.panel.header.undo(); idle.panel.header.redo(); idle.panel.header.restore();
  await settle();
  assert.deepEqual(header(idle.calls).map((call) => call[0]), ['undo', 'redo', 'restore'], 'an idle Studio runs them');
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const failing = makePanel({ restoreAutosave: () => Promise.reject(new Error('the saved scene names an unknown tank')) });
    failing.panel.header.restore();
    for (let i = 0; i < 4; i++) await settle();
    assert.deepEqual(unhandled, [], 'a failed restore is no unhandled rejection');
    assert.ok(failing.calls.some((call) => Array.isArray(call) && call[0] === 'flash' && call[1] === 'studio.loadFailed'),
      'the panel says the restore failed');
    assert.ok(failing.calls.includes('refresh-history'), 'and the header refreshes after it');
  } finally { process.off('unhandledRejection', onUnhandled); }
}

// 6. (round 2 U36, review r2) The panel's own holders belong to the session they began in, as the Studio's do. The panel is
// built once per page, so a plain latch that a time change, a sun move, a battlefield pick, a restore or a queue run set,
// and that an exit outlived (a covered preparation or a cold build still going), held the Studio entered again until the
// dead change settled: the map pick, the time, the sun, Export, the queue's Start, Record and the header's and the keys'
// undo were refused, and the battlefield button and Restore stayed disabled. Each case exits during its change, enters
// again, finds the panel free at once and starts the same change there; the dead change's end then says nothing in that
// Studio, takes none of its requests and releases nothing of the live change.
{
  const superseded = () => Object.assign(new Error('Battlefield activation for desert was superseded by a later request'),
    { name: 'WorldActivationSuperseded' });
  const said = (calls, since) => calls.slice(since).filter((call) => Array.isArray(call) && ['flash', 'notice'].includes(call[0]));
  const count = (calls, kind) => calls.filter((call) => Array.isArray(call) && call[0] === kind).length;
  for (const change of [
    { name: 'time change', hang: ['time'], start: (h) => h.panel.chooseTime('dusk'), again: (h) => h.panel.chooseTime('night'),
      ran: (h) => count(h.calls, 'time') === 2, endDead: (h) => h.hung.time[0].reject(new StudioSessionEnded()),
      live: (h) => h.panel.panelBusy(), endLive: (h) => h.hung.time[1].resolve('night') },
    // (a second move waits behind the first's apply when the exit comes)
    { name: 'sun move', hang: ['light'], start: (h) => { h.panel.queueLight({ sunAzimuthDeg: 10 }); h.panel.queueLight({ sunAzimuthDeg: 15 }); },
      again: (h) => h.panel.queueLight({ sunAzimuthDeg: 20 }),
      ran: (h) => count(h.calls, 'light') === 2, endDead: (h) => h.hung.light[0].reject(new StudioSessionEnded()),
      live: (h) => h.panel.panelBusy(), endLive: (h) => h.hung.light[1].resolve() },
    { name: 'battlefield pick', hang: ['map'], start: (h) => h.panel.chooseMap('desert'), again: (h) => h.panel.chooseMap('arctic'),
      ran: (h) => count(h.calls, 'map') === 2, endDead: (h) => h.hung.map[0].reject(superseded()),
      live: (h) => h.controls.mapBtn.disabled, endLive: (h) => h.hung.map[1].resolve('arctic') },
    { name: 'restore', hang: ['restore'], start: (h) => h.panel.header.restore(), again: (h) => h.panel.header.restore(),
      ran: (h) => count(h.calls, 'restore') === 2, endDead: (h) => h.hung.restore[0].resolve(false),
      live: (h) => h.controls.restoreBtn.disabled, endLive: (h) => h.hung.restore[1].resolve(true) },
    { name: 'queue run', start: (h) => { h.panel.queueJobs.push(still('A'), still('B')); void h.panel.runQueue(); },
      again: (h) => { void h.panel.runQueue(); }, ran: (h) => h.panel.running?.label === 'B',
      endDead: (h) => { h.panel.queueJobs.push(still('C')); h.panel.finishJob('A'); },
      live: (h) => h.panel.panelBusy(), endLive: async (h) => { await endQueue(h); } },
  ]) {
    const h = makePanel({ hang: change.hang ?? [] });
    change.start(h);
    await settle();
    h.exit();
    h.enter();
    h.panel.refreshLocks(); // the panel's show() and tick
    assert.equal(h.panel.panelBusy(), false, `the Studio entered again is not held by the closed session's ${change.name}`);
    for (const control of ['mapBtn', 'restoreBtn', 'exportBtn', 'recordBtn', 'timeMenu']) {
      assert.equal(h.controls[control].disabled, false, `its ${control} is free after the closed session's ${change.name}`);
    }
    h.panel.header.undo();
    assert.equal(count(h.calls, 'undo'), 1, `the header's undo runs after the closed session's ${change.name}`);
    change.again(h);
    await settle();
    assert.ok(change.ran(h), `a ${change.name} of its own runs at once`);
    const since = h.calls.length;
    change.endDead(h);
    await settle();
    assert.deepEqual(said(h.calls, since), [], `the dead ${change.name}'s end says nothing in the Studio entered again`);
    assert.equal(change.live(h), true, `and releases nothing of the live ${change.name}`);
    h.panel.refreshLocks();
    assert.equal(change.live(h), true, `nor does the panel's next tick`);
    if (change.name === 'sun move') {
      assert.deepEqual(h.calls.filter((call) => Array.isArray(call) && call[0] === 'light').map((call) => call[1].sunAzimuthDeg), [10, 20],
        'the dead pump applies nothing more (its waiting move was its closed session\'s) and takes none of the live session\'s');
    }
    if (change.name === 'queue run') {
      assert.equal(h.panel.queueJobs.find((job) => job.label === 'C').state, 'waiting', 'the dead run takes no job of the live session');
      assert.equal(h.panel.running?.label, 'B', 'which runs its own');
    }
    await change.endLive(h);
    await settle();
    h.panel.refreshLocks();
    assert.equal(h.panel.panelBusy(), false, `the live ${change.name}'s end frees the panel`);
    assert.equal(h.controls.mapBtn.disabled || h.controls.restoreBtn.disabled, false, 'and its buttons');
    if (change.name === 'queue run') assert.deepEqual(h.panel.queueJobs.map((job) => [job.label, job.state]), [['A', 'done'], ['B', 'done'], ['C', 'done']]);
  }
}

console.log('studioPanelBusy.selftest: Clear during a queue run skips no job, Export film waits for the queue, a hidden panel\'s sound lane stops re-arming, and the map pick, the palette\'s sequences, a time change, Export, the queue\'s Start and the header\'s Restore, Undo and Redo ask one busy reading, and the panel\'s own holders hold no Studio entered again after an exit outlived them');
