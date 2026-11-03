// studioTransport.selftest.mjs — the Studio's playhead and history guards read one busy predicate (2026-11-02 audit F9).
// Runs the actual play / pause / seek / shuttle and pointer / history callers of studio.ts: Play during a recording's
// priming hold must not start the clock (the take's opening was lost), the transport answers the same way for a recording,
// an open film and an export, and a cancelled pointer releases the history's hold.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createStudioSession, studioBusy, transportHeld } from './studioSession.ts';

const text = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', text, ts.ScriptTarget.Latest, true);
const CORE = ['playTimeline', 'pauseTimeline', 'seekTimeline', 'shuttle', 'onPointerDown', 'onPointerUp', 'flushHistory'];
const HELPERS = ['busy', 'onPointerCancel'];
const found = new Map();
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...CORE, ...HELPERS].includes(node.name.text) && !found.has(node.name.text)) {
    found.set(node.name.text, node.getText(source));
  }
  ts.forEachChild(node, visit);
})(source);
for (const name of CORE) assert.ok(found.has(name), `studio.ts declares ${name}`);
// the browser's pointercancel goes to whatever studio.ts registers for it (nothing, on the lane base)
const cancelHandler = text.match(/window\.addEventListener\('pointercancel', (\w+)/)?.[1] ?? null;

function makeStudio() {
  const calls = [];
  const timers = [];
  const noop = () => {};
  const ports = {
    session: createStudioSession(), studioBusy, transportHeld,
    rail: { updateVisibility: noop }, panel: { refreshTime: noop, refreshAll: noop, refreshSelected: noop },
    invalidate: noop, flareToWallClock: noop, clampStudioTime: (time) => time, post: {},
    rebuildEffects: (ms) => calls.push(['rebuild', ms]),
    renderer: { domElement: { setPointerCapture: noop } }, pickActor: () => null, selectActor: noop,
    updateActor: (actor) => calls.push(['settle', actor.id]), terrainHit: () => false,
    HISTORY_SETTLE_MS: 400, setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    commitHistory: () => calls.push('commit'),
  };
  const code = stripTypeScriptTypes(`
    function makeTransportHarness(ports) {
    const { ${Object.keys(ports).join(', ')} } = ports;
    let active = true, recording = null, filming = false, filmExport = null, loading = false, productionLoading = false;
    let mapChange = null, restoringHistory = false, timeScale = 0, reverseRate = 0, reverseShuttleMs = 0, reverseWallS = 0;
    let clockMs = 3000, storyboard = { durationMs: 8000 }, pointerHeld = false, dragActor = null, dragging = false;
    let dragMoved = 0, placeArmed = null, historyTimer = 0;
    const api = { setTimeScale: (value) => { if (!transportHeld(busy())) timeScale = value; return timeScale; } };
    function busy() {
      return studioBusy({ open: session.phase === 'open', recording: !!recording, filming, exporting: !!filmExport,
        scene: loading || productionLoading, mapChange: !!mapChange, restoring: restoringHistory });
    }
    ${[...found.entries()].filter(([name]) => name !== 'busy').map(([, fn]) => fn).join('\n')}
    session.open(session.beginEntry());
    return {
      playTimeline, pauseTimeline, seekTimeline, shuttle, onPointerDown, onPointerUp, flushHistory,
      cancel: ${cancelHandler ?? 'null'},
      set: (patch) => {
        if ('recording' in patch) recording = patch.recording;
        if ('filming' in patch) filming = patch.filming;
        if ('filmExport' in patch) filmExport = patch.filmExport;
        if ('timeScale' in patch) timeScale = patch.timeScale;
        if ('dragActor' in patch) dragActor = patch.dragActor;
      },
      exit: () => { session.beginExit(); active = false; dragActor = null; dragging = false; session.close(); },
      get state() { return { timeScale, clockMs, reverseRate, pointerHeld, dragging, dragActor, historyTimer }; },
    };
    }
  `);
  const studio = new Function('ports', `${code}\nreturn makeTransportHarness(ports);`)(ports);
  return { studio, calls, timers };
}

// 1. The take owns the playhead: while a recording primes its encoder, while a film renders and while an export runs,
// Play, Pause, a seek and the shuttle leave it where it is.
{
  const { studio, calls } = makeStudio();
  const priming = { awaitingFirstChunk: true, stopping: false, failed: false };
  for (const [label, patch] of [['a recording priming its encoder', { recording: priming }], ['an open film', { filming: true }],
    ['a film export', { filmExport: { controller: null } }]]) {
    studio.set({ recording: null, filming: false, filmExport: null, timeScale: 0, ...patch });
    assert.equal(studio.playTimeline(), false, `Play is refused during ${label}`);
    assert.equal(studio.state.timeScale, 0, `the clock holds during ${label} (the opening pose waits for the first chunk)`);
    studio.set({ timeScale: 0.5 });
    studio.pauseTimeline();
    assert.equal(studio.state.timeScale, 0.5, `Pause leaves the take's own rate during ${label}`);
    const rebuilt = calls.length;
    studio.seekTimeline(500);
    assert.equal(calls.length, rebuilt, `a seek is refused during ${label}`);
    studio.shuttle(-1);
    assert.equal(studio.state.reverseRate, 0, `the shuttle is refused during ${label}`);
  }
  // a recording's own opening seek is the one that passes
  studio.set({ recording: priming, filming: false, filmExport: null });
  studio.seekTimeline(0, { recording: true });
  assert.deepEqual(calls.at(-1), ['rebuild', 0], 'the recording seeks to its opening');
  // a free Studio plays and pauses
  studio.set({ recording: null, filming: false, filmExport: null, timeScale: 0 });
  assert.equal(studio.playTimeline(), true);
  assert.equal(studio.state.timeScale, 1);
  studio.pauseTimeline();
  assert.equal(studio.state.timeScale, 0);
}

// 2. A cancelled pointer (a touch the browser took for a scroll) releases the hold: the pending edit commits on the next
// settle instead of re-arming the flush every period until some later pointerup.
{
  const { studio, calls, timers } = makeStudio();
  const tank = { id: 'lead' };
  studio.onPointerDown({ target: null, button: 0, pointerId: 1 });
  studio.set({ dragActor: tank });
  assert.equal(studio.state.pointerHeld, true);
  studio.cancel?.({ pointerId: 1 });
  assert.equal(studio.state.pointerHeld, false, 'pointercancel ends the hold');
  assert.equal(studio.state.dragActor, null, 'and the tank drag');
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'settle' && call[1] === 'lead'), 'the dragged tank settles where it was left');
  studio.flushHistory();
  assert.ok(calls.includes('commit'), 'the settled edit commits');
  assert.equal(timers.length, 0, 'the flush does not re-arm');
}

// 3. A hold that outlives the Studio (a pointer still down at the exit) never keeps the flush timer alive.
{
  const { studio, calls, timers } = makeStudio();
  studio.onPointerDown({ target: null, button: 0, pointerId: 2 });
  studio.exit();
  studio.flushHistory();
  assert.equal(timers.length, 0, 'a closed Studio does not re-arm its history');
  assert.ok(!calls.includes('commit'));
}

console.log('studioTransport.selftest: the take owns the playhead through a recording\'s priming, a film and an export; a cancelled pointer and a closed Studio release the history flush');
