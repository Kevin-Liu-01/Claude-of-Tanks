// studioPanelBusy.selftest.mjs — the Studio panel's render queue, film export and sound lane against each other
// (2026-11-02 audit F9). Runs the actual runQueue, the queue's Clear handler, startFilmExport and drawSound of
// studioPanel.ts: Clear during a run skipped the next job, Export film started beside a queued still at every shot, and
// the sound lane re-armed its timer every 1.5 s forever once the panel was hidden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';

const text = readFileSync(new URL('./studioPanel.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studioPanel.ts', text, ts.ScriptTarget.Latest, true);
const CORE = ['runQueue', 'startFilmExport', 'drawSound'];
const HELPERS = ['outputBusy'];
const found = new Map();
let clearHandler = null;
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...CORE, ...HELPERS].includes(node.name.text) && !found.has(node.name.text)) {
    found.set(node.name.text, node.getText(source));
  }
  // the queue's Clear: queueClear.addEventListener('click', handler)
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'queueClear.addEventListener'
    && node.arguments[0]?.getText(source) === "'click'") clearHandler = node.arguments[1].getText(source);
  ts.forEachChild(node, visit);
})(source);
for (const name of CORE) assert.ok(found.has(name), `studioPanel.ts declares ${name}`);
assert.ok(clearHandler, 'the queue has a Clear handler');

function makePanel({ display = 'block', soundPreview = async () => null } = {}) {
  const calls = [];
  const timers = [];
  const jobs = [];
  const ports = {
    calls,
    S: {
      filmExportStatus: () => ({ active: false, supported: true }), recordingStatus: () => ({ active: false }),
      soundPreview: (buckets) => { calls.push(['sound', buckets]); return soundPreview(); },
    },
    t: (key) => key, console, aborted: (error) => error?.name === 'AbortError', errorMessage: (error) => String(error),
    refreshQueue: () => calls.push('refresh-queue'), api: { notice: noop => noop },
    renderFilm: () => { calls.push('render-film'); return new Promise(() => {}); },
    filmSize: { seg: { value: '1080' } }, filmFps: { seg: { value: '30' } }, filmBlur: { seg: { value: '1' } },
    filmShake: { seg: { value: '1' } }, flashBusy: () => {},
    root: { style: { display } }, setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    SOUND_BUCKETS: 400, soundPath: { setAttribute: () => {} }, soundWave: { classList: { remove: () => {} } },
  };
  const code = stripTypeScriptTypes(`
    function makeQueueHarness(ports) {
    const { ${Object.keys(ports).filter((name) => name !== 'calls').join(', ')} } = ports;
    const queueJobs = ports.jobs;
    let queueRunning = false, soundKey = 'scene', soundTimer = 0;
    let pending = null;
    const runJob = (job) => new Promise((resolve, reject) => { pending = { job, resolve, reject }; });
    ${[...found.values()].join('\n')}
    const clear = ${clearHandler};
    return {
      runQueue, startFilmExport, drawSound, clear, queueJobs,
      finish: () => { const current = pending; pending = null; current.resolve(1); },
      get running() { return pending?.job ?? null; },
      set queueRunning(value) { queueRunning = value; },
    };
    }
  `);
  const panel = new Function('ports', `${code}\nreturn makeQueueHarness(ports);`)({ ...ports, jobs });
  return { panel, calls, timers };
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

console.log('studioPanelBusy.selftest: Clear during a queue run skips no job, Export film waits for the queue, and a hidden panel\'s sound lane stops re-arming');
