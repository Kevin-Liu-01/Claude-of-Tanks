// studioPanelBusy.selftest.mjs — the Studio panel's render queue, film export and sound lane against each other
// (2026-11-02 audit F9). Runs the actual runQueue, the queue's Clear handler, startFilmExport and drawSound of
// studioPanel.ts: Clear during a run skipped the next job, Export film started beside a queued still at every shot, and
// the sound lane re-armed its timer every 1.5 s forever once the panel was hidden. (2026-11-03) And the panel's one busy
// reading (panelBusy) at the scene's entry points: the map pick, the palette's sequences, a time change and Export film
// ran beside a queue run, a light change, a staging or the Studio's own holders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';

const text = readFileSync(new URL('./studioPanel.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studioPanel.ts', text, ts.ScriptTarget.Latest, true);
const CORE = ['runQueue', 'startFilmExport', 'drawSound', 'chooseMap', 'chooseTime', 'stagePreset'];
const HELPERS = ['outputBusy', 'panelBusy', 'hostBusy'];
const found = new Map();
let clearHandler = null;
// (round 2 Q18) the header's Restore, Undo and Redo: restoreBtn/undoBtn/redoBtn.addEventListener('click', handler)
const headerHandlers = new Map();
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...CORE, ...HELPERS].includes(node.name.text) && !found.has(node.name.text)) {
    found.set(node.name.text, node.getText(source));
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

function makePanel({ display = 'block', soundPreview = async () => null, restoreAutosave = async () => true } = {}) {
  const calls = [];
  const timers = [];
  const jobs = [];
  const held = { studio: null, director: false };
  const ports = {
    calls,
    S: {
      filmExportStatus: () => ({ active: false, supported: true }), recordingStatus: () => ({ active: false }),
      soundPreview: (buckets) => { calls.push(['sound', buckets]); return soundPreview(); },
      busy: () => held.studio, mapId: 'verdant', timeOfDay: 'day', productionFormat: 'landscape',
      setMap: (id) => { calls.push(['map', id]); return Promise.resolve(id); },
      setTimeOfDay: (time) => { calls.push(['time', time]); return Promise.resolve(time); },
      directProduction: (options) => { calls.push(['stage', options.presetId]); return Promise.resolve({}); },
      undo: () => { calls.push(['undo']); return Promise.resolve(true); },
      redo: () => { calls.push(['redo']); return Promise.resolve(true); },
      restoreAutosave: () => { calls.push(['restore']); return restoreAutosave(); },
    },
    restoreBtn: { disabled: false },
    productionPanel: { busy: () => held.director },
    toggleMapPick: () => {}, setMapLoading: () => {}, timeMenu: { setDisabled: () => {} },
    t: (key) => key, console, aborted: (error) => error?.name === 'AbortError', errorMessage: (error) => String(error),
    refreshQueue: () => calls.push('refresh-queue'),
    api: { notice: noop => noop, refreshAll: () => {}, refreshMap: () => {}, refreshHistory: () => calls.push('refresh-history') },
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
    let queueRunning = false, soundKey = 'scene', soundTimer = 0;
    let timeBusy = false, lightInFlight = null, timesOpen = ['day', 'night'];
    let pending = null;
    const runJob = (job) => new Promise((resolve, reject) => { pending = { job, resolve, reject }; });
    ${[...found.values()].join('\n')}
    const clear = ${clearHandler};
    const header = { restore: ${headerHandlers.get('restoreBtn')}, undo: ${headerHandlers.get('undoBtn')}, redo: ${headerHandlers.get('redoBtn')} };
    return {
      runQueue, startFilmExport, drawSound, clear, queueJobs, chooseMap, chooseTime, stagePreset, header,
      finish: () => { const current = pending; pending = null; current.resolve(1); },
      get running() { return pending?.job ?? null; },
      set queueRunning(value) { queueRunning = value; },
      set lightInFlight(value) { lightInFlight = value; },
    };
    }
  `);
  const panel = new Function('ports', `${code}\nreturn makeQueueHarness(ports);`)({ ...ports, jobs });
  return { panel, calls, timers, held };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

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
  panel.queueRunning = true;
  panel.startFilmExport();
  assert.ok(!calls.includes('render-film'), 'no export beside a queue run');
  panel.queueRunning = false;
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
    ['a queue run', (h) => { h.panel.queueRunning = true; }, (h) => { h.panel.queueRunning = false; }],
    ['a sun change in flight', (h) => { h.panel.lightInFlight = new Promise(() => {}); }, (h) => { h.panel.lightInFlight = null; }],
    ['the Director\'s staging', (h) => { h.held.director = true; }, (h) => { h.held.director = false; }],
    ...['recording', 'film', 'export', 'session', 'scene', 'map', 'history', 'light'].map((holder) => [
      `the Studio's ${holder}`, (h) => { h.held.studio = holder; }, (h) => { h.held.studio = null; }]),
  ]) {
    const h = makePanel();
    hold(h);
    tryAll(h.panel);
    assert.deepEqual(scene(h.calls), [], `no map pick, sequence or time change during ${name}`);
    assert.ok(!h.calls.includes('render-film'), `no export during ${name}`);
    h.panel.queueJobs.push({ label: 'A', state: 'waiting', progress: 0, preset: { kind: 'still' } });
    if (name !== 'a queue run') {
      void h.panel.runQueue();
      assert.equal(h.panel.running, null, `the queue does not start during ${name}`);
    }
    release(h);
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
    ['a queue run', (h) => { h.panel.queueRunning = true; }],
    ['a sun change in flight', (h) => { h.panel.lightInFlight = new Promise(() => {}); }],
    ['the Director\'s staging', (h) => { h.held.director = true; }],
    ...['recording', 'film', 'export', 'session', 'scene', 'map', 'history', 'light'].map((holder) => [
      `the Studio's ${holder}`, (h) => { h.held.studio = holder; }]),
  ]) {
    const h = makePanel();
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

console.log('studioPanelBusy.selftest: Clear during a queue run skips no job, Export film waits for the queue, a hidden panel\'s sound lane stops re-arming, and the map pick, the palette\'s sequences, a time change, Export, the queue\'s Start and the header\'s Restore, Undo and Redo ask one busy reading');
