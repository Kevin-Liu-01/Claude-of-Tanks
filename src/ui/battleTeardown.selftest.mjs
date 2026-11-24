// battleTeardown.selftest.mjs — nothing of a battle outlives it (battle-teardown-276; Kevin 2026-11-24, a Garage screenshot
// with the battle's "(!) Gunship overhead · NOW" still at top centre: "notifications till here in garage - properly clear
// game state stuff after leaving"). Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
//
// The class: battle-scoped state with no owner that ends it. The owner is the battle's scope (game/battleScope.ts), opened
// and ended by the one phase writer (game/appLifecycle.ts transitionAppPhase), which every way out of a battle takes. This
// receipt opens a battle through that writer, raises what a battle raises (the gunship overhead, an incoming strike, the
// crew's own call-in, the aim warning, the drone's event, the pointer lock's notice, the first-use hints, the binoculars),
// leaves by each exit, and reads that nothing is shown or queued in the battle's notice region, no timer the battle started
// is live, no battle listener remains, and the next battle raises its own "NOW" again.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../game/stateCore.ts';
import { createAppLifecycle, transitionAppPhase } from '../game/appLifecycle.ts';
import { battleScopeSnapshot, battleScoped, currentBattleScope } from '../game/battleScope.ts';
import { strikeView } from '../game/strikeViewState.ts';
import { createPointerLockFeedbackRuntime } from '../game/pointerLockFeedbackRuntime.ts';
import { releasedBombs, crashedStrikes, installAirSupportBridge } from '../game/airSupportBridge.ts';
import { battleNotices, NOTICE_PRIORITY } from './battleNotices.ts';
import { createBattleEventLane } from './battleNoticeEvents.ts';
import { createAirSupportHud, INCOMING_NOTICE, ORDER_NOTICE } from './airSupportHud.ts';
import { createFirstUseHints } from './firstUseHints.ts';
import { noticeRegionState } from './components/notice.ts';
import { t } from './i18n.ts';

void created;
const sleep = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---- every timer and interval started while a battle runs is tracked until it fires or is cleared ----
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
const live = new Map();
let tracking = false;
globalThis.setTimeout = (run, ms, ...args) => {
  const handle = realSetTimeout(() => { live.delete(handle); if (typeof run === 'function') run(...args); }, ms);
  if (tracking) live.set(handle, { kind: 'timeout', ms, at: new Error().stack.split('\n').slice(2, 5).join(' | ') });
  return handle;
};
globalThis.clearTimeout = (handle) => { live.delete(handle); realClearTimeout(handle); };
globalThis.setInterval = (run, ms, ...args) => {
  const handle = realSetInterval(run, ms, ...args);
  if (tracking) live.set(handle, { kind: 'interval', ms, at: new Error().stack.split('\n').slice(2, 5).join(' | ') });
  return handle;
};
globalThis.clearInterval = (handle) => { live.delete(handle); realClearInterval(handle); };

// ---- the page: one lifecycle over a session, its bus counted, and the battle's producers as the page installs them ----
const game = { phase: 'garage' };
const busListeners = { count: 0 };
const bus = createBus();
const on = bus.on.bind(bus);
bus.on = (type, listener) => { busListeners.count += 1; const off = on(type, listener); return () => { busListeners.count -= 1; off(); }; };
const announced = [];
createAppLifecycle({ game, announce: (announcement) => announced.push(announcement) });

const parent = globalThis.document.createElement('div');
const air = createAirSupportHud(parent, bus);
const laneRoot = globalThis.document.createElement('div');
const lane = createBattleEventLane({ root: laneRoot, doc: globalThis.document, keyLine: () => '' });
bus.on('ui:battleEvent', (event) => lane.raise(event));
installAirSupportBridge(bus);
const lockListeners = { denied: new Set(), restored: new Set() };
let stageVisible = false;
createPointerLockFeedbackRuntime({
  input: {
    isTouchLayout: () => false, isLocked: () => false, requestLock() {},
    onLockDenied(listener) { lockListeners.denied.add(listener); return () => lockListeners.denied.delete(listener); },
    onLockRestored(listener) { lockListeners.restored.add(listener); return () => lockListeners.restored.delete(listener); },
  },
  bus, canvas: globalThis.document.createElement('canvas'), audioResume() {}, isBattleStageVisible: () => stageVisible,
  canRecapturePointer: () => true, ensureTouchControls: async () => null, notices: battleNotices,
});
const hints = createFirstUseHints({
  bus, input: { getSettings: () => ({ showHints: true }) }, playerId: () => 'p1', watched: () => false, airSupportMode: () => true,
});

/** The gunship's run over the crew at the origin, landed this second ("NOW"), and the crew's own bomb run. */
const ORIGIN = { x: 0, y: 0, z: 0 };
const gunship = { id: 1, kind: 'gunship', team: 'bravo', x: 0, y: 0, z: 0, heading: 0, calledS: 2, landsS: 10, endS: 40, hp: 1,
  maxHp: 1, downedS: null, downedBy: null, mine: false };
const ownBomb = { ...gunship, id: 2, kind: 'bomb', team: 'alpha', x: 400, z: 400, landsS: 16, endS: 24, mine: true };
const airView = (nowS, strikes) => ({ nowS, points: 300, strikes });

/** What a battle raises, as its frames and events raise it. */
async function raiseBattle() {
  // the binoculars up, the gunship overhead NOW and the crew's own run counting down (one frame of the air HUD)
  strikeView.open = true;
  air.update(airView(10.2, [gunship, ownBomb]), ORIGIN, ORIGIN, 'alpha', 10.2, true, 'X');
  // the aim warning, the fire, the scuttle's hold (the HUD's conditions), a hint, as the HUD raises them
  battleNotices.condition({ kind: 'aimLimit', id: 'cot-aim-notice', severity: 'warning', text: 'Gun cannot depress further',
    durationMs: null, dismissible: false, priority: NOTICE_PRIORITY.threat });
  battleNotices.condition({ kind: 'fire', id: 'cot-fire-notice', severity: 'error', text: 'Fire', durationMs: null,
    dismissible: false, priority: NOTICE_PRIORITY.threat });
  // the drone's warnings on the event lane (a seat refused, a drone brought down) and a turned battle
  bus.emit('ui:battleEvent', { kind: 'seatBusy', text: t('flight.seatBusy'), priority: NOTICE_PRIORITY.answered, severity: 'warning' });
  bus.emit('ui:battleEvent', { kind: 'droneDown', text: 'Drone down', priority: NOTICE_PRIORITY.answered, severity: 'success' });
  bus.emit('ui:battleEvent', { kind: 'objective', text: 'Flag taken', priority: NOTICE_PRIORITY.turned, severity: 'success' });
  // the pointer lock refused before the stage shows (its stage wait polls) and the hints' start delay and tick
  for (const listener of lockListeners.denied) listener();
  hints.battleStart();
  hints.offer('airSupport');
  // an air strike's round kept for the world
  bus.emit('mode:strike_round', { kind: 'bomb', strikeId: 2, freeFall: 1, shellId: 9, x: 0, y: 50, z: 0, dx: 0, dy: -1, dz: 0 });
  // a battle-scoped memo, timer and listener of the scope's own (the API producers register through)
  const scope = currentBattleScope();
  const probe = new EventTarget();
  let heard = 0;
  scope.listen(probe, 'ping', () => { heard += 1; });
  scope.setInterval(() => {}, 1000);
  scope.setTimeout(() => {}, 60_000);
  probe.dispatchEvent(new Event('ping'));
  assert.equal(heard, 1, 'a scope listener hears while its battle runs');
  // the kit loads and draws
  for (let i = 0; i < 20 && (noticeRegionState('battle')?.shown.length ?? 0) === 0; i++) await sleep(10);
  return { probe, heard: () => heard };
}

function assertRaised(label) {
  const region = noticeRegionState('battle');
  assert.ok(region, `${label}: the battle region is placed`);
  const all = [...region.shown, ...region.waiting];
  assert.ok(all.includes(INCOMING_NOTICE), `${label}: the gunship's INCOMING is raised (${all})`);
  assert.ok(all.includes(ORDER_NOTICE), `${label}: the crew's own run is raised`);
  assert.ok(all.includes('cot-aim-notice') && all.includes('cot-fire-notice'), `${label}: the HUD's conditions are raised`);
  assert.ok(battleNotices.held().includes(INCOMING_NOTICE), `${label}: the region holds them under the battle`);
  assert.ok(lane.el.classList.contains('show'), `${label}: the event lane shows an event`);
  assert.equal(globalThis.document.documentElement.hasAttribute('data-cot-strike-view'), true, `${label}: the binoculars flag the page`);
  assert.ok(releasedBombs.has(2), `${label}: the bridge keeps the strike's bomb`);
  assert.ok(live.size > 0, `${label}: the battle started timers`);
}

async function assertClean(label, probe) {
  // (a one-shot that ends by itself within a frame or two is let run; an interval, a poll or a long wait is a leak)
  await sleep(450);
  const region = noticeRegionState('battle');
  assert.deepEqual(region.shown, [], `${label}: no battle notice is shown (${region.shown})`);
  assert.deepEqual(region.waiting, [], `${label}: none waits in the queue (${region.waiting})`);
  assert.equal(region.timer, false, `${label}: the region's timer is stopped`);
  assert.equal(region.paused, false, `${label}: the game's pause does not hold the menus' notices`);
  assert.deepEqual(battleNotices.held(), [], `${label}: the region holds no condition`);
  assert.equal(lane.el.classList.contains('show'), false, `${label}: the event lane is empty`);
  assert.equal(globalThis.document.documentElement.hasAttribute('data-cot-strike-view'), false, `${label}: no strike-view flag`);
  assert.equal(strikeView.open, false, `${label}: the binoculars are down`);
  assert.equal(strikeView.order.read(0).phase, 'idle', `${label}: no order under way`);
  assert.equal(releasedBombs.size + crashedStrikes.size, 0, `${label}: no strike kept for the world`);
  const leaks = [...live.values()];
  assert.deepEqual(leaks, [], `${label}: no timer the battle started is live:\n${leaks.map((l) => `${l.kind} ${l.ms} ms at ${l.at}`).join('\n')}`);
  const { probe: target, heard } = probe;
  target.dispatchEvent(new Event('ping'));
  assert.equal(heard(), 1, `${label}: the battle's listener is removed`);
  assert.equal(busListeners.count, baselineBus, `${label}: no bus listener was added for the battle`);
}

/** Opens a battle through the phase writer, as the solo start and the room's activation do. */
async function openBattle(reason) {
  transitionAppPhase(game, 'battle', { reason });
  tracking = true;
  return raiseBattle();
}

const baselineBus = busListeners.count;

// ---- each exit: every way out of a battle is a write of the phase away from it, through the one writer ----
const EXITS = [
  // the pause menu's Leave, F4's confirmed leave, the proving ground's: leaveBattleToGarage → garageReturn.leave
  ['quit to the Garage', () => transitionAppPhase(game, 'garage', { reason: 'garage-return' })],
  // the result screen: the Garage prepared behind the report (perf-246, no announcement), then its Return lands the screen
  ['the result screen\'s return', () => {
    transitionAppPhase(game, 'garage', { reason: 'garage-return:prepare', announce: false });
    transitionAppPhase(game, 'garage', { reason: 'garage-return:screen' });
  }],
  // leaving before the verdict (leave-no-loss-276: recorded as Left), the same return
  ['leave early', () => transitionAppPhase(game, 'garage', { reason: 'garage-return' })],
  // the room closed, left or the seat dropped: returnRoomToGarage → garageReturn.leave
  ['disconnect', () => transitionAppPhase(game, 'garage', { reason: 'room:drop' })],
  // a mode switch: a dev still takes the scene from the battle, then the Garage
  ['mode switch to a still', () => {
    transitionAppPhase(game, 'shot', { reason: 'shot:view' });
    assert.deepEqual(battleNotices.held(), [], 'the still does not carry the battle\'s conditions');
    transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  }],
];
for (const [label, leave] of EXITS) {
  const probe = await openBattle(`solo-start (${label})`);
  assertRaised(label);
  const opened = battleScopeSnapshot().live;
  assert.ok(opened, `${label}: the battle's scope is live`);
  leave();
  assert.equal(currentBattleScope(), null, `${label}: no battle scope outlives the battle`);
  assert.equal(battleScopeSnapshot().lastEnded?.id >= opened.id, true, `${label}: the battle's scope ended`);
  await assertClean(label, probe);
  tracking = false;
  live.clear();
}

// ---- a rematch over the battle (Battle Again in place) is a new battle: the old one's notices go first ----
{
  const probe = await openBattle('solo-start');
  assertRaised('before the rematch');
  const first = currentBattleScope();
  transitionAppPhase(game, 'battle', { reason: 'battle-again' });
  assert.notEqual(currentBattleScope(), first, 'the rematch opens its own scope');
  assert.equal(first.live, false, 'the last battle\'s scope ended');
  await sleep(450);
  assert.deepEqual([...noticeRegionState('battle').shown, ...noticeRegionState('battle').waiting], [], 'the rematch starts with none of the last battle\'s notices');
  probe.probe.dispatchEvent(new Event('ping'));
  assert.equal(probe.heard(), 1, 'the last battle\'s listener is removed');
  // ---- and the next battle raises its own "NOW": the plate's memo was the last battle's (it was taken for raised) ----
  air.update(airView(10.2, [gunship]), ORIGIN, ORIGIN, 'alpha', 10.2, true, 'X');
  for (let i = 0; i < 20 && !noticeRegionState('battle').shown.includes(INCOMING_NOTICE); i++) await sleep(10);
  assert.ok(noticeRegionState('battle').shown.includes(INCOMING_NOTICE), 'the same gunship NOW in the next battle shows');
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  await assertClean('after the rematch', probe);
  tracking = false;
  live.clear();
}

// ---- outside a battle nothing is raised: a frame that comes after the exit (a late kit, a straggling update) shows nothing ----
{
  air.update(airView(10.2, [gunship]), ORIGIN, ORIGIN, 'alpha', 10.2, true, 'X');
  battleNotices.condition({ kind: 'aimLimit', id: 'cot-aim-notice', severity: 'warning', text: 'late', durationMs: null });
  await sleep(30);
  assert.deepEqual(noticeRegionState('battle').shown, [], 'a condition raised in the Garage is never shown');
  // a condition raised in a battle whose kit arrives after the battle ended is never drawn
  transitionAppPhase(game, 'battle', { reason: 'solo-start' });
  battleNotices.condition({ kind: 'fire', id: 'cot-fire-late', severity: 'error', text: 'Fire', durationMs: null });
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  await sleep(30);
  assert.deepEqual(noticeRegionState('battle').shown, [], 'a condition whose battle ended before its kit is never drawn');
}

// ---- the scope's own contract ----
{
  transitionAppPhase(game, 'battle', { reason: 'solo-start' });
  const scope = currentBattleScope();
  const order = [];
  scope.defer(() => order.push('first'));
  scope.defer(() => order.push('second'));
  scope.defer(() => { throw new Error('a failing disposer'); });
  scope.defer(() => order.push('after the failure'));
  const memo = battleScoped(() => ({ made: Symbol('memo') }));
  const inBattle = memo();
  assert.equal(memo(), inBattle, 'a scoped memo holds within its battle');
  const errors = console.error;
  console.error = () => {};
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  console.error = errors;
  assert.deepEqual(order, ['after the failure', 'second', 'first'], 'disposers run newest first, a failure keeps none of the rest');
  assert.notEqual(memo(), inBattle, 'the memo is made again after the battle');
  let ran = false;
  scope.defer(() => { ran = true; });
  assert.equal(ran, true, 'a disposer given an ended scope runs at once');
  assert.equal(scope.setTimeout(() => {}, 10), null, 'an ended scope starts no timer');
  assert.deepEqual(scope.counts(), { timers: 0, intervals: 0, frames: 0, listeners: 0, deferred: 0 }, 'an ended scope holds nothing');
  assert.equal(scope.signal.aborted, true, 'its signal is aborted');
  // a dev still re-written keeps its scope; the Studio and the Garage hold none
  transitionAppPhase(game, 'shot', { reason: 'shot:view' });
  const still = currentBattleScope();
  transitionAppPhase(game, 'shot', { reason: 'shot:view' });
  assert.equal(currentBattleScope(), still, 'a still re-written keeps its scope');
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  transitionAppPhase(game, 'studio', { reason: 'studio:enter' });
  assert.equal(currentBattleScope(), null, 'the Studio holds no battle scope');
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
}

// ---- the exits in the source all reach the one phase writer ----
{
  const main = read('../main.ts');
  const body = (name) => { const at = main.indexOf(`const ${name} = `); assert.ok(at >= 0, `main.ts has ${name}`); return main.slice(at, main.indexOf('\n};', at)); };
  assert.match(body('leaveBattleToGarage'), /garageReturn\.leave\(\)/, 'the Leave (pause menu, F4, a left battle) is the Garage return');
  assert.match(body('returnRoomToGarage'), /garageReturn\.leave\(\)/, 'a room\'s return (closed, left, dropped) is the Garage return');
  assert.match(main, /onReturnToGarage: \(\) => leaveBattleToGarage\(\)/, 'the result screen\'s return is the Leave');
  const ret = read('../game/garageReturnRuntime.ts');
  assert.match(ret, /transitionAppPhase\(game, 'garage', \{ reason: prepareOnly \? 'garage-return:prepare' : 'garage-return'/,
    'the Garage return writes the phase through the one writer');
  assert.match(read('../game/appLifecycle.ts'), /battleScopeEdge\(from, next, reason\)/, 'the writer ends and opens the battle\'s scope');
}

globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
globalThis.setInterval = realSetInterval; globalThis.clearInterval = realClearInterval;
console.log(`battleTeardown.selftest: PASS (${EXITS.length} exits and a rematch: no notice, timer or listener outlives its battle; ${announced.length} phase announcements)`);
process.exit(0);
