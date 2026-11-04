// 2026-11-02 audit F4: the end-of-battle report gate, driven through the real HUD (initHud: shotInfo, the battle input
// owner and the end screen) over the recording DOM, with animation frames and timers on a manual clock. shotInfo used
// to decide the report's rendering itself, from two latches and an uncancelled frame-then-macrotask callback: a verdict
// that landed during a mid-battle replay rendered the moment that replay ended, burying the verdict's own camera beat
// (armed on the next frame), and a decision scheduled for one battle was never cancelled, so it rendered the next
// battle's report before that battle's replay could take the screen. (battleReportGate.selftest.mjs pins the gate's own
// transitions; this receipt pins shotInfo's wiring of it: the blocked predicate, the owner's changes, battle:presented,
// and the clear on hideStats / reset.)
import { created, windowStub } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

const bus = createBus();
const hud = initHud(bus);
const statsRoot = created.find((element) => element.classes.has('cot-si-stats'));
assert.ok(statsRoot, 'the report root exists');
const shown = () => statsRoot.classes.has('show');

// --- a manual clock: a frame runs only when the test runs one, a timer only when the test advances time ---------------
const realTimers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
const frames = new Map();
let nextFrameId = 1;
const timers = new Map();
let nextTimerId = 1;
let nowMs = 0;
const queueFrame = (callback) => { const id = nextFrameId++; frames.set(id, callback); return id; };
const dropFrame = (id) => { frames.delete(id); };
const fakeTimeout = (callback, ms = 0, ...args) => {
  const id = nextTimerId++;
  timers.set(id, { at: nowMs + Math.max(0, Number(ms) || 0), callback, args });
  return id;
};
const fakeClear = (id) => { timers.delete(id); };
for (const host of [globalThis, windowStub]) {
  Object.assign(host, { requestAnimationFrame: queueFrame, cancelAnimationFrame: dropFrame, setTimeout: fakeTimeout, clearTimeout: fakeClear });
}
/** Run the due timers, in time then id order, up to ms from now. */
function advance(ms) {
  const end = nowMs + ms;
  for (;;) {
    let due = null;
    for (const [id, timer] of timers) {
      if (timer.at <= end && (!due || timer.at < due.timer.at || (timer.at === due.timer.at && id < due.id))) due = { id, timer };
    }
    if (!due) break;
    timers.delete(due.id);
    nowMs = due.timer.at;
    due.timer.callback(...due.timer.args);
  }
  nowMs = end;
}
/** Run the callbacks queued before this frame (those queued while it runs wait for the next one). */
function runQueued(ids = [...frames.keys()]) {
  for (const id of ids) {
    const callback = frames.get(id);
    if (!callback) continue; // cancelled
    frames.delete(id);
    callback(nowMs);
  }
}
/** One animation frame: the main loop's own work first (the presentation edges it emits), then the queued callbacks,
 * then the frame's 16 ms of timers (the gate's macrotask after the frame among them). */
function frame(mainLoop = () => {}) {
  const queued = [...frames.keys()];
  mainLoop();
  runQueued(queued);
  advance(16);
}
const ended = () => bus.emit('battle:ended', {
  result: 'defeat', reason: 'elimination', timeS: 300, map: 'steppe', mapId: 'steppe', score: null, gameMode: 'standard', roster: [],
});
const newBattle = () => { hud.setMode('hidden'); hud.setMode('battle'); };

// --- (a) a verdict during a mid-battle replay: the verdict's own camera beat takes the screen before the report ---------
newBattle();
assert.equal(shown(), false);
bus.emit('killcam:begin', { kind: 'death' }); // the player's death replay, mid-battle
ended(); // the verdict lands while it plays (the result presentation is not updated during a replay)
for (let i = 0; i < 60; i++) frame();
assert.equal(shown(), false, 'no report over the replay');
bus.emit('killcam:done', {});
assert.equal(shown(), false, 'the replay\'s end does not render the report at once (the verdict has not chosen its close)');
frame(() => bus.emit('ending:begin', { beat: 'wreckOrbit' })); // the next frame arms the verdict's wreck orbit
for (let i = 0; i < 60; i++) frame(); // a second of the beat: neither the frame decision nor its fallback renders
assert.equal(shown(), false, 'no report over the verdict\'s camera beat');
frame(() => { bus.emit('battle:presented', { result: 'defeat' }); bus.emit('ending:done', { beat: 'wreckOrbit' }); });
assert.equal(shown(), true, 'the report renders on the result presentation\'s hand-off');

// --- (b) a stale decision: one battle's scheduled decision never decides the next battle's report ----------------------
// (b1) the first battle's frame is still queued when the next battle's verdict lands
newBattle();
const before = new Set(frames.keys());
ended(); // no presentation: the report would decide after the next frame
const firstBattleFrame = [...frames.keys()].filter((id) => !before.has(id));
assert.equal(shown(), false);
newBattle(); // the player leaves inside that frame window (hideStats, then a new battle's reset)
assert.equal(shown(), false);
ended(); // the next battle's verdict: its final-kill replay begins in the next main-loop frame
runQueued(firstBattleFrame); // the first battle's frame fires (a browser that runs it late: a throttled tab)
advance(0);
assert.equal(shown(), false, 'the first battle\'s frame does not decide the next battle\'s report');
frame(() => bus.emit('killcam:begin', { kind: 'final' }));
assert.equal(shown(), false, 'no report over the next battle\'s replay');
bus.emit('killcam:done', {});
frame();
assert.equal(shown(), true, 'the next battle\'s report renders after its replay');

// (b2) the first battle's frame ran and its macrotask decision is still pending when the player leaves
newBattle();
ended();
runQueued(); // the frame ran; its decision waits for a macrotask
newBattle();
ended();
advance(0); // the first battle's macrotask runs before the next battle's own frame
assert.equal(shown(), false, 'the first battle\'s pending decision does not decide the next battle\'s report');
frame(() => bus.emit('killcam:begin', { kind: 'final' }));
bus.emit('killcam:done', {});
frame();
assert.equal(shown(), true);

// --- (c) the Settings menu holds the report as a presentation does (a network verdict with the menu open) -------------
const { battleInputOwnerFor } = await import('./battleInputOwner.ts');
const owner = battleInputOwnerFor(bus);
newBattle();
advance(1000);
// (the owner's done grace runs on the page clock: wait it out before the menu may open)
await new Promise((resolve) => realTimers.setTimeout(resolve, 300));
assert.equal(owner.openMenu(), true, 'the menu opens');
ended();
for (let i = 0; i < 60; i++) frame();
assert.equal(shown(), false, 'no report under the open menu');
owner.closeMenu();
frame();
assert.equal(shown(), true, 'the report renders once the menu closes');

hud.setMode('hidden');
assert.equal(shown(), false, 'hideStats drops the report');
for (const host of [globalThis, windowStub]) Object.assign(host, realTimers);
console.log('battleReportGateHud.selftest: through the real HUD, a verdict during a mid-battle replay waits for its camera beat and battle:presented, a stale decision never decides the next battle\'s report, and the menu holds the report');
