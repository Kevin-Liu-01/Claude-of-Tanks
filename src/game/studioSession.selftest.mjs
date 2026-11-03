// studioSession.selftest.mjs — the Studio session's owner (2026-11-02 audit F9): one declared phase, the moves it allows,
// tokens every async step checks, the cancels and held work an exit settles, and the one busy reading every entry point asks.
import assert from 'node:assert/strict';
import { createStudioSession, isStudioSessionEnded, StudioSessionEnded, studioBusy, transportHeld } from './studioSession.ts';

// The phases and their moves: closed → entering → open → exiting → closed; a failed entry leaves through exiting.
{
  const session = createStudioSession();
  assert.equal(session.phase, 'closed');
  const closedToken = session.token();
  assert.equal(closedToken.current(), false, 'a closed Studio hands out stale tokens');
  assert.throws(() => closedToken.check(), (error) => isStudioSessionEnded(error) && error.name === 'AbortError');
  assert.equal(session.open(closedToken), false, 'open needs an entry');
  assert.equal(session.beginExit(), false, 'nothing to exit');
  assert.equal(session.close(), false, 'nothing to close');

  const entry = session.beginEntry();
  assert.ok(entry && entry.current(), 'an entry holds a live token');
  assert.equal(session.phase, 'entering');
  assert.equal(session.beginEntry(), null, 'one entry at a time');
  const step = session.token();
  assert.equal(step.current(), true, 'a step taken during the entry belongs to it');
  assert.equal(session.open(entry), true);
  assert.equal(session.phase, 'open');
  assert.equal(session.open(entry), false, 'open is one move');
  assert.equal(session.beginEntry(), null, 'an open Studio is not entered again');

  assert.equal(session.beginExit(), true);
  assert.equal(session.phase, 'exiting');
  assert.equal(entry.current(), false, 'the exit makes every token stale at once');
  assert.equal(step.current(), false);
  assert.throws(() => step.check(), StudioSessionEnded);
  assert.equal(session.token().current(), false, 'an exiting Studio starts no new step');
  assert.equal(session.beginExit(), false, 'the exit is one move');
  assert.equal(session.beginEntry(), null, 'an entry waits for the teardown');
  assert.equal(session.close(), true);
  assert.equal(session.phase, 'closed');

  const second = session.beginEntry();
  assert.ok(second.current() && second.generation > entry.generation, 'a later entry is a new generation');
  assert.equal(entry.current(), false, 'an earlier session\'s token never comes back to life');
  assert.equal(session.beginExit(), true, 'an entry can be abandoned (or fail) straight to exiting');
  assert.equal(session.open(second), false, 'an abandoned entry never opens');
  session.close();
}

// The exit runs every registered cancel once; a released cancel is not run.
{
  const session = createStudioSession();
  session.open(session.beginEntry());
  const ran = [];
  session.onEnd(() => ran.push('export'));
  const release = session.onEnd(() => ran.push('released'));
  release();
  session.onEnd(() => { throw new Error('a cancel that throws'); });
  session.onEnd(() => ran.push('after'));
  const errors = console.error;
  console.error = () => {};
  try { session.beginExit(); } finally { console.error = errors; }
  assert.deepEqual(ran, ['export', 'after'], 'every cancel runs, a throwing one included');
  session.close();
  session.open(session.beginEntry());
  session.beginExit();
  assert.deepEqual(ran, ['export', 'after'], 'cancels belong to their session');
  session.close();
}

// Held work: the exit waits for it to settle (a rejection is not rethrown), bounded by settleMs.
{
  const timers = [];
  const session = createStudioSession({
    settleMs: 5000,
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimeout: (handle) => { timers[handle - 1].cleared = true; },
  });
  assert.equal(await session.settled(), true, 'nothing held settles at once');
  let land;
  const atmosphere = new Promise((resolve) => { land = resolve; });
  assert.strictEqual(session.hold(atmosphere), atmosphere, 'hold returns the work itself');
  const failing = session.hold(Promise.reject(new Error('chunk failed')));
  await failing.catch(() => {});
  let settled = null;
  void session.settled().then((value) => { settled = value; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, null, 'the exit waits for the preparation still in flight');
  land('lit');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, true);
  assert.ok(timers[0].cleared, 'a settled wait clears its bound');
  // a hung preparation: the bound lets the exit go on
  session.hold(new Promise(() => {}));
  let bounded = null;
  void session.settled().then((value) => { bounded = value; });
  timers.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bounded, false, 'the bound ends the wait');
  assert.equal(timers.at(-1).ms, 5000);
}

// One busy reading, in a fixed order; the take owns the transport only while it records, renders or exports.
{
  const free = { open: true, recording: false, filming: false, exporting: false, scene: false, mapChange: false, restoring: false };
  assert.equal(studioBusy(free), null);
  const cases = [
    [{ recording: true, filming: true }, 'recording'],
    [{ filming: true, exporting: true }, 'film'],
    [{ exporting: true, open: false }, 'export'],
    [{ open: false, scene: true }, 'session'],
    [{ scene: true, mapChange: true }, 'scene'],
    [{ mapChange: true, restoring: true }, 'map'],
    [{ restoring: true }, 'history'],
  ];
  for (const [patch, expected] of cases) assert.equal(studioBusy({ ...free, ...patch }), expected, JSON.stringify(patch));
  assert.deepEqual(['recording', 'film', 'export', 'session', 'scene', 'map', 'history', null].map(transportHeld),
    [true, true, true, false, false, false, false, false], 'a load, a map change or an undo leaves the playhead alone');
}

console.log('studioSession.selftest: the phase and its moves, stale tokens after an exit, cancels, held work with its bound, and the busy reading pass');
