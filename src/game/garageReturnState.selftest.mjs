// 2026-11-02 audit F3: the Garage return's state. It lived in three promises, a preparing flag, a generation and the
// published trace's flags (`presentationUnready` gated every Garage frame); a Leave during Battle Again (or the reverse)
// silently became the other operation; Battle Again polled the entry latch every 150 ms and 16 ms for 15 s.
import assert from 'node:assert/strict';
import * as garageReturnModule from './garageReturnRuntime.ts';
import { createAppLifecycle } from './appLifecycle.ts';
import { createGameState } from './stateCore.ts';

const { createGarageReturnRuntime, GARAGE_RETURN_EDGES = {} } = garageReturnModule;

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async (turns = 12) => { for (let i = 0; i < turns; i += 1) await Promise.resolve(); };

function createFixture({ restore = null } = {}) {
  const game = createGameState();
  game.phase = 'battle';
  const lifecycle = createAppLifecycle({ game, announce: () => {} });
  const sleeps = [];
  let now = 0;
  let entryPending = false;
  let entryCovering = false;
  const settled = [];
  const covered = [];
  const states = [];
  let transitionWork = null;
  const noop = () => {};
  let runtime;
  const observe = () => states.push(runtime.state);
  runtime = createGarageReturnRuntime({
    game,
    getSelectedSpecId: () => 'm1a1_abrams_hc',
    presentation: { setAdaptiveSuspended: noop, clearBattle: noop, resetBattleTank: noop, suspendEffects: noop,
      setShotMode: noop, setCaptureHidden: noop, unfreezeEffects: noop, resetHudFrame: noop },
    network: { shouldPreserveRoom: () => false, disposePresentation: noop, closeMatch: noop },
    warm: { invalidate: noop, cancel: noop, setPending: noop },
    work: { noteActivity: noop, resetFramePacer: noop, scheduleDressing: noop },
    world: { currentMapId: () => 'verdant', ensureGaragePlacement: async () => { observe(); }, setDormant: noop,
      setFarCascadeDormant: noop, clearCamoOverrides: noop },
    roster: { adoptBattlePlayer: () => null, clearBattle: noop, repaintHero: noop },
    settings: { isOpen: () => false, close: noop },
    // (emitGaragePhase: the port of old, ignored now that the session's lifecycle announces the phase)
    ui: { setGarageSpots: noop, setGarageSunTrim: noop, emitGaragePhase: noop, hideEndOverlay: noop, exitPointerLock: noop, hideHud: noop,
      showGarage: noop, poseGarageCamera: noop, startShowroom: noop,
      triggerBattle: () => { game.phase = 'battle'; setTimeout(() => setCovering(true), 5); return true; } },
    audio: { ambientOn: noop, playGarageSting: noop },
    transition: { run: async (work) => { const gate = transitionWork?.(); if (gate) await gate; return work(); } },
    restoreGaragePresentation: async () => { observe(); if (restore) return restore(); return { totalMs: 1 }; },
    isBattleEntryPending: () => entryPending,
    isBattleEntryCovering: () => entryCovering,
    whenBattleEntrySettled: () => (entryPending ? new Promise((resolve) => settled.push(resolve)) : Promise.resolve()),
    whenBattleEntryCovering: () => (entryCovering ? Promise.resolve() : new Promise((resolve) => covered.push(resolve))),
    nowMs: () => now,
    // (a fake clock: a short poll resolves at once and advances time, so the polling of old fails rather than hangs)
    sleep: (milliseconds, signal) => {
      sleeps.push(milliseconds);
      if (milliseconds < 1000) { now += milliseconds; return Promise.resolve(); }
      return new Promise((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
    },
  });
  function setPending(value) { entryPending = value; if (!value) for (const resolve of settled.splice(0)) resolve(); }
  function setCovering(value) { entryCovering = value; if (value) for (const resolve of covered.splice(0)) resolve(); }
  return { game, lifecycle, runtime, states, sleeps, setPending, setCovering,
    holdTransition(gate) { transitionWork = () => gate; } };
}

// The state is explicit and moves along its edges: a Leave, a preparation and its handoff, Battle Again.
{
  const f = createFixture();
  assert.equal(f.runtime.state, 'idle');
  assert.equal(f.runtime.framesSuppressed, false, 'a pristine Garage is not suppressed');
  assert.equal(f.runtime.whenSettled(), null, 'nothing in flight: nothing to wait for');
  const leaving = f.runtime.leave();
  await flush(2);
  assert.ok(f.runtime.whenSettled() instanceof Promise, 'a return in flight can be waited for');
  await leaving;
  assert.deepEqual(f.states, ['entering', 'entering'], 'placement and restore run while entering');
  assert.equal(f.runtime.state, 'idle');
  assert.equal(f.runtime.framesSuppressed, false);
  assert.equal(f.lifecycle.state, 'garage');

  f.game.phase = 'battle';
  f.states.length = 0;
  assert.equal(await f.runtime.prepare(), true);
  assert.equal(f.runtime.state, 'prepared');
  assert.equal(f.runtime.framesSuppressed, true, 'a prepared Garage stays suppressed behind the report');
  assert.equal(f.runtime.awaitingHandoff, true);
  assert.deepEqual(f.states, ['preparing', 'preparing']);
  await f.runtime.leave();
  assert.equal(f.runtime.state, 'idle', 'the handoff hands over a restored Garage');

  f.game.phase = 'battle';
  await f.runtime.battleAgain();
  assert.equal(f.runtime.state, 'restoreSkipped', "Battle Again leaves the Garage's restore unpaid");
  assert.equal(f.runtime.framesSuppressed, true);
}

// A failed return is 'failed' (frames stay suppressed); the next return retries from there.
{
  let fail = true;
  const f = createFixture({ restore: async () => { if (fail) throw new Error('lost device'); return { totalMs: 1 }; } });
  await assert.rejects(f.runtime.leave(), /lost device/);
  assert.equal(f.runtime.state, 'failed');
  assert.equal(f.runtime.framesSuppressed, true, 'a failed return never cold-renders its partial Garage');
  assert.equal(f.lifecycle.screenPhase, 'garage');
  fail = false;
  await f.runtime.enter();
  assert.equal(f.runtime.state, 'idle', 'a retry from failed hands over the restored Garage');
}

// The edge table is closed: every target is a declared state, and the in-flight states only settle.
{
  const states = Object.keys(GARAGE_RETURN_EDGES);
  assert.equal(states.length, 8, 'every declared return state has its edges');
  for (const [from, targets] of Object.entries(GARAGE_RETURN_EDGES)) {
    for (const to of targets) assert.ok(states.includes(to), `${from} -> ${to}`);
  }
  assert.deepEqual([...GARAGE_RETURN_EDGES.entering].sort(), ['failed', 'idle', 'restoreSkipped']);
}

// A Leave during Battle Again, and Battle Again during a Leave, are refused by name; the same operation joins.
{
  const f = createFixture();
  const gate = deferred();
  f.holdTransition(gate.promise);
  const again = f.runtime.battleAgain();
  assert.equal(f.runtime.operation, 'battleAgain');
  assert.equal(f.runtime.battleAgain(), again, 'a repeated click joins');
  await assert.rejects(f.runtime.leave(), (error) => error?.name === 'GarageReturnBusyError'
    && error.active === 'battleAgain' && error.requested === 'leave');
  gate.resolve();
  await again;
  assert.equal(f.runtime.operation, null);

  f.game.phase = 'battle';
  const gate2 = deferred();
  f.holdTransition(gate2.promise);
  const leaving = f.runtime.leave();
  await assert.rejects(f.runtime.battleAgain(), { name: 'GarageReturnBusyError', code: 'garage_return_busy' });
  gate2.resolve();
  await leaving;
  assert.equal(f.game.phase, 'garage', 'the Leave kept the screen');
}

// Battle Again waits on the entry lifecycle's edges under one deadline: no polling.
{
  const f = createFixture();
  f.setPending(true);
  const again = f.runtime.battleAgain();
  await flush();
  assert.deepEqual(f.sleeps, [15_000], 'one deadline while the previous entry finishes');
  f.setPending(false);
  await again;
  assert.deepEqual(f.sleeps, [15_000, 15_000], 'one deadline for the next entry\'s cover; no 150 ms or 16 ms polls');
  assert.equal(f.runtime.state, 'restoreSkipped');
}

console.log('garageReturnState.selftest: explicit return state, named busy refusals, event-driven Battle Again passed');
