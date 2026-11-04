// 2026-11-02 audit F4: the end-of-battle report gate (shotInfo.ts) as one owner: idle | deciding | held, fed by the
// battle input owner. Pinned here with fake timers; the browser hazards themselves (a stale decision from battle N
// deciding battle N+1, a verdict armed a frame late burying its replay under the report) were not reproduced in a
// page: the gate's transitions are.
import assert from 'node:assert/strict';
import { createBattleReportGate, REPORT_DECIDE_FALLBACK_MS, REPORT_MAX_WAIT_MS } from './battleReportGate.ts';
import { createBattleInputOwner } from './battleInputOwner.ts';

function fakeTimers() {
  let clock = 0;
  let nextId = 1;
  const timers = new Map(); // id -> { at, fn }
  const frames = new Map(); // id -> fn
  return {
    port: {
      nextFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
      cancelFrame(id) { frames.delete(id); },
      setTimer(fn, ms) { const id = nextId++; timers.set(id, { at: clock + ms, fn }); return id; },
      clearTimer(id) { timers.delete(id); },
    },
    /** Run one animation frame, then every timer due by now. */
    frame() {
      const due = [...frames.values()];
      frames.clear();
      for (const fn of due) fn();
      this.advance(0);
    },
    advance(ms) {
      const until = clock + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        clock = Math.max(clock, next[1].at);
        next[1].fn();
      }
      clock = until;
    },
    get pendingCount() { return timers.size + frames.size; },
  };
}

function harness() {
  const t = fakeTimers();
  const owner = createBattleInputOwner({ now: () => 0, graceMs: 0 });
  const rendered = [];
  const gate = createBattleReportGate({
    blocked: () => owner.state === 'presentation' || owner.state === 'menu',
    render: (result) => rendered.push(result),
    timers: t.port,
  });
  owner.onChange(gate.ownerChanged);
  return { t, owner, gate, rendered };
}

// no presentation: the report renders after one frame and a macrotask (the frame that arms the verdict's close)
{
  const { t, gate, rendered } = harness();
  gate.ended('victory');
  assert.equal(gate.state, 'deciding');
  assert.deepEqual(rendered, [], 'never in the verdict\'s own task');
  t.frame();
  assert.deepEqual(rendered, ['victory']);
  assert.equal(gate.state, 'idle');
  assert.equal(t.pendingCount, 0, 'a render cancels the fallback and the watchdog');
}

// a throttled tab (no frames): the fallback decides
{
  const { t, gate, rendered } = harness();
  gate.ended('draw');
  t.advance(REPORT_DECIDE_FALLBACK_MS);
  assert.deepEqual(rendered, ['draw']);
}

// the verdict's replay begins in the deciding frame: held until the result presentation hands the report over
{
  const { t, owner, gate, rendered } = harness();
  gate.ended('defeat');
  owner.beginPresentation('killcam'); // armEnding inside the next frame
  assert.equal(gate.state, 'held');
  t.frame();
  t.advance(5000);
  assert.deepEqual(rendered, [], 'the replay owns the screen');
  gate.presented(); // the replay's onDone presented the result (before killcam:done)
  assert.deepEqual(rendered, ['defeat']);
  owner.endPresentation('killcam');
  t.frame();
  assert.deepEqual(rendered, ['defeat'], 'rendered exactly once');
}

// a mid-battle death replay is running when the verdict lands: its done re-opens the decision, so the verdict's own
// close (armed only once the replay is over) still takes the screen before the report
{
  const { t, owner, gate, rendered } = harness();
  owner.beginPresentation('killcam');
  gate.ended('defeat');
  assert.equal(gate.state, 'held');
  owner.endPresentation('killcam'); // the mid-battle replay ends; its onDone presents nothing
  assert.equal(gate.state, 'deciding', 'the done decides again instead of rendering at once');
  assert.deepEqual(rendered, []);
  owner.beginPresentation('ending'); // the next frame arms the verdict's camera beat
  t.frame();
  assert.deepEqual(rendered, [], 'the ending beat is not buried under the report');
  assert.equal(gate.state, 'held');
  gate.presented();
  assert.deepEqual(rendered, ['defeat']);
}

// the Settings menu open when a network verdict lands (the result presentation is not updated while it is open): the
// report waits for the menu to close, then decides
{
  const { t, owner, gate, rendered } = harness();
  owner.openMenu();
  gate.ended('victory');
  t.frame();
  assert.deepEqual(rendered, [], 'no report behind the open menu before the verdict\'s close ran');
  owner.closeMenu();
  assert.equal(gate.state, 'deciding');
  t.frame();
  assert.deepEqual(rendered, ['victory']);
}

// a stale decision from battle N never decides battle N+1
{
  const { t, owner, gate, rendered } = harness();
  gate.ended('defeat');
  gate.clear(); // the Garage return before the decision ran
  assert.equal(gate.state, 'idle');
  assert.equal(t.pendingCount, 0, 'a clear cancels the frame, the fallback and the watchdog');
  gate.ended('victory'); // the next battle's verdict
  owner.beginPresentation('killcam');
  t.frame();
  t.advance(REPORT_DECIDE_FALLBACK_MS);
  assert.deepEqual(rendered, [], 'battle N+1\'s report waits for its replay');
}

// the watchdog: a presentation that never ends cannot eat the report; it counts from the latest hold
{
  const { t, owner, gate, rendered } = harness();
  gate.ended('defeat');
  owner.beginPresentation('killcam');
  t.advance(REPORT_MAX_WAIT_MS - 1);
  assert.deepEqual(rendered, []);
  t.advance(1);
  assert.deepEqual(rendered, ['defeat']);
  // a second battle: a mid-battle replay, then the verdict's beat; the watchdog counts from the latest hold
  owner.endPresentation('killcam');
  owner.beginPresentation('killcam');
  gate.ended('victory');
  t.advance(10_000);
  owner.endPresentation('killcam');
  owner.beginPresentation('ending');
  t.advance(REPORT_MAX_WAIT_MS - 1);
  assert.deepEqual(rendered, ['defeat'], 'the beat keeps its full wait');
  t.advance(1);
  assert.deepEqual(rendered, ['defeat', 'victory']);
}

console.log('battleReportGate.selftest: frame decision, throttled fallback, replay and ending holds, a late-armed verdict, the menu hold, a cancelled stale decision and the watchdog pass');
