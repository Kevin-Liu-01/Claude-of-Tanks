// 2026-11-02 audit F2/F3 review: main's own flow-port bindings, run from main.ts's actual compositions. The runtimes
// default these ports (announce and whenGarageSettled to no-ops, canReveal to true, the lifecycle readers to false,
// holdExpired to nothing), so deleting main's line brought a hazard back with every runtime test green: the Play
// menu's and campaign's battles recorded no profile history without `announce: ... ui:battleStart`.
import assert from 'node:assert/strict';
import * as appLifecycleModule from '../game/appLifecycle.ts';
import * as battleEntryIntentModule from '../game/battleEntryIntent.ts';
import { createBattleEntryLifecycle } from '../game/battleEntryLifecycle.ts';
import { createBattleFrameRuntime } from '../game/battleFrameRuntime.ts';
import { advancePreBattleCountdown, PRE_BATTLE_WARM_HOLD_LIMIT_S, transitionBattleCountdown } from '../game/preBattleCountdown.ts';
import { createSoloBattleEntryRuntime } from '../game/soloBattleEntryRuntime.ts';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import { mainSource, mainStatement, runMainStatements } from './mainComposition.test-support.mjs';

// (canTransitionAppPhase by name: this file still runs, and fails by assertion, against a main.ts that has none)
const { createAppLifecycle, canTransitionAppPhase } = appLifecycleModule;
const { createBattleEntryIntent } = battleEntryIntentModule;
const flush = async (turns = 12) => { for (let index = 0; index < turns; index += 1) await Promise.resolve(); };

// The solo entry: main's announce, whenGarageSettled and presentReturnFailure bindings.
const entryStatement = mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({');
assert.equal(entryStatement.split("import('./ui/garageReturnFailure.ts')").length, 2, 'one lazy notice import in the entry composition');
/** main's top-level function declaration that begins with `head`, through its closing `}` line. */
function mainFunction(head) {
  const start = mainSource.indexOf(`\n${head}`);
  const end = mainSource.indexOf('\n}\n', start + 1);
  assert.ok(start >= 0 && end > start, `main.ts declares ${head}`);
  return mainSource.slice(start + 1, end + 2);
}
function soloEntry({ whenSettled = () => null, begin = async () => {}, enterGarage = async () => {}, onEntryNotice = () => {},
  onlineMatch = { current: null }, game = { phase: 'garage' }, garageReturn = { whenSettled, owesGarage: false } } = {}) {
  const events = [];
  const scope = {
    onlineMatch,
    game,
    canTransitionAppPhase,
    AppPhaseTransitionError: appLifecycleModule.AppPhaseTransitionError,
    GarageScreenUnsettledError: appLifecycleModule.GarageScreenUnsettledError,
    createSoloBattleEntryRuntime,
    battleEntryIntent: createBattleEntryIntent(),
    terrainVariantFor,
    campaignOperationById: (id) => (id ? { id, mapId: 'op-map' } : null),
    battleEntryLifecycle: createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 }),
    bus: { emit: (type, payload) => events.push([type, payload]) },
    garageReturn,
    soloBattleLoading: { begin: async (...args) => { events.push(['load', args[0], args[1]]); return begin(); } },
    battleLoad: { showPending: () => events.push(['cover']), hide: async () => events.push(['hide']) },
    audio: { loadingOn() {} },
    enterGarage: async () => { events.push(['garage']); return enterGarage(); },
    nextPaintFrame: async () => {},
    VISIBLE_TANK_IDS: ['m1a1_abrams_hc', 'leopard2a4'],
    garage: { getSelected: () => 'm1a1_abrams_hc', getSelectedMap: () => 'desert', noteBattleLoadFailed() {} },
    isChunkFailure: () => false,
    loadFailure: async () => ({ showSoloEntryFailure: (error, retry) => { events.push(['entry-notice']); onEntryNotice(error, retry); } }),
    presentGarageReturnFailure: (error, retry) => { events.push(['return-notice', error.message, typeof retry]); },
    console: { error() {}, warn() {}, info() {} },
  };
  // main's entry composition with the two local entries that call it (the Garage button's, the Play menu's and ladder's)
  const { soloBattleEntry: entry, beginLocalBattleEntry, beginLocalBattle } = runMainStatements([
    entryStatement.replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()'),
    mainFunction('function beginLocalBattleEntry('), mainFunction('function beginLocalBattle('),
    // (round 3 B2) the one hand-over rule main binds canTakeScene to (absent on a main.ts without it: the entry fails)
    ...(mainSource.includes('\nfunction battleSceneRefusal(') ? [mainFunction('function battleSceneRefusal(')] : []),
  ], scope, '{ soloBattleEntry, beginLocalBattleEntry, beginLocalBattle }');
  return { entry, events, lifecycle: scope.battleEntryLifecycle, intent: scope.battleEntryIntent, beginLocalBattleEntry, beginLocalBattle };
}
/** main's phase:change listener (a Garage phase clears the solo intent, keeping watched); returns its handler. */
function phaseListener(game, battleEntryIntent) {
  let handler = null;
  runMainStatements(mainStatement("bus.on('phase:change', () => {"), {
    bus: { on: (type, listener) => { if (type === 'phase:change') handler = listener; } },
    game, battleEntryIntent, clearMatchSession() {}, frameLoop: { restart() {} },
  }, 'null');
  assert.equal(typeof handler, 'function');
  return () => { game.phase = 'garage'; handler({ phase: 'garage' }); };
}

{
  // A Play-menu or campaign start (beginSelected) announces its battle on main's bus, inside the press, before its cover.
  const { entry, events } = soloEntry();
  await entry.beginSelected({ specId: 'leopard2a4', mapId: 'winter', gameMode: 'standard', campaignOperationId: 'op-1' });
  assert.deepEqual(events[0], ['ui:battleStart', { specId: 'leopard2a4', mapId: 'winter', gameMode: 'standard', campaignOperationId: 'op-1' }],
    "main binds the entry's announce to ui:battleStart (profile history for menu and campaign battles)");
  assert.deepEqual(events.slice(1).map(([type]) => type), ['cover', 'load']);
  // begin() runs only the announcement its press hands it (round 4 F1): with none (the debug hook), none.
  const button = soloEntry();
  await button.entry.begin('m1a1_abrams_hc', 'desert');
  assert.equal(button.events.some(([type]) => type === 'ui:battleStart'), false);
}

{
  // A start accepted while a Garage return is in flight waits for it: main binds whenGarageSettled to the return.
  let settle;
  const settled = new Promise((resolve) => { settle = resolve; });
  const { entry, events } = soloEntry({ whenSettled: () => settled });
  const pending = entry.beginSelected();
  await flush();
  // (round 2 U19) and no announcement: the return's 'garage' comes before this battle's ui:battleStart
  assert.deepEqual(events.map(([type]) => type), [], 'no announcement, no cover and no load while the return is in flight');
  settle();
  await pending;
  assert.deepEqual(events.map(([type]) => type), ['ui:battleStart', 'cover', 'load']);
}

{
  // (round 2, app-flow review) A network round the room's session entered (a later match_start while the room is kept)
  // runs outside the entry latch: a solo start under its loader was accepted and covered and loaded a solo battle over
  // it. main binds isNetworkRoundEntering to the composition's `entering`, and the start is refused as busy.
  const onlineMatch = { current: { entering: true } };
  const { entry, events, lifecycle } = soloEntry({ onlineMatch });
  await entry.beginSelected();
  await entry.begin('m1a1_abrams_hc', 'desert');
  assert.deepEqual(events.map(([type]) => type), [], 'no announcement, no cover and no load under the round');
  assert.equal(lifecycle.pending, false, 'and no entry latch taken');
  assert.equal(lifecycle.entrySerial, 0);
  // a start that waited on a return while such a round began: refused once the return lands
  onlineMatch.current.entering = false;
  let settle;
  const settled = new Promise((resolve) => { settle = resolve; });
  const waiting = soloEntry({ onlineMatch, whenSettled: () => settled });
  const pending = waiting.entry.beginSelected();
  await flush();
  onlineMatch.current.entering = true;
  settle();
  await pending;
  assert.deepEqual(waiting.events.map(([type]) => type), [], 'the round that began meanwhile keeps the screen');
  // the round revealed: the next start runs
  onlineMatch.current.entering = false;
  await entry.beginSelected();
  assert.deepEqual(events.map(([type]) => type), ['ui:battleStart', 'cover', 'load']);
}

{
  // (round 2, app-flow review 2) main binds the start's scene check to the edge table: the __DEBUG.beginSoloBattle hook
  // over the Studio covered and loaded a solo battle there, refused only after the load (and its recovery ran a Garage
  // return under the open Studio); a start queued behind a return now re-reads it before its announcement and cover.
  const game = { phase: 'studio' };
  const { events, lifecycle, beginLocalBattle } = soloEntry({ game });
  await beginLocalBattle({ specId: 'leopard2a4', mapId: 'winter' });
  assert.deepEqual(events.map(([type]) => type), [], 'nothing announces, covers or loads over the Studio');
  assert.equal(lifecycle.entrySerial, 0);
  game.phase = 'garage';
  await beginLocalBattle({ specId: 'leopard2a4', mapId: 'winter' });
  assert.deepEqual(events.map(([type]) => type), ['ui:battleStart', 'cover', 'load'], 'and from the Garage it runs');
}

{
  // A failed entry whose recovery return fails too: main binds presentReturnFailure to the return notice.
  const { entry, events, lifecycle } = soloEntry({
    begin: async () => { throw new Error('world build failed'); },
    enterGarage: async () => { throw new Error('restore failed'); },
  });
  const quiet = console.error;
  console.error = () => {}; // the entry's default reportError
  try { await entry.beginSelected(); } finally { console.error = quiet; }
  assert.deepEqual(events.slice(-2), [['hide'], ['return-notice', 'restore failed', 'function']],
    'the cover comes down and the return notice offers its retry');
  assert.equal(lifecycle.renderingCovered, false);
}

{
  // (audit F2 review) A failed Frontline Assault sortie's Retry replays its whole intent. The recovery's return
  // announces 'garage', main's listener clears the record, and the notice's retry went straight to the loading: its
  // world was built without trenches and its brief had no operation (the batch-19 bug).
  let failures = 1;
  let retry = null;
  let announceGarage = () => {};
  const worlds = [];
  const solo = soloEntry({
    // main's ensureWorld: a battle-context build that names no variant takes the solo entry's
    begin: async () => {
      worlds.push([solo.intent.resolveTerrainVariant(undefined, true), solo.intent.campaignOperationId]);
      if (failures-- > 0) throw new Error('world build failed');
    },
    enterGarage: async () => announceGarage(),
    onEntryNotice: (_error, again) => { retry = again; },
  });
  announceGarage = phaseListener({ phase: 'battle' }, solo.intent);
  const quiet = console.error;
  console.error = () => {}; // the entry's default reportError
  try {
    await solo.beginLocalBattle({ specId: 'leopard2a4', gameMode: 'frontline_assault', campaignOperationId: 'op-2' });
    assert.equal(solo.intent.terrainVariant, null, "the recovery's 'garage' cleared the record");
    assert.equal(typeof retry, 'function', 'the entry notice offers its retry');
    retry();
    await flush(40);
  } finally { console.error = quiet; }
  assert.deepEqual(worlds, [['assault-trenches', 'op-2'], ['assault-trenches', 'op-2']],
    "the retry builds the sortie's trenches and keeps its operation");
  assert.equal(solo.events.filter(([type]) => type === 'load').at(-1)[2], 'op-map', "a ladder operation fights on its own map");
}

{
  // A start accepted under a Garage return keeps its intent through that return's 'garage' announcement.
  let settle;
  const solo = soloEntry({ whenSettled: () => new Promise((resolve) => { settle = resolve; }) });
  const announceGarage = phaseListener({ phase: 'garage' }, solo.intent);
  const pending = solo.beginLocalBattleEntry('leopard2a4', 'desert', { gameMode: 'frontline_assault', watch: true });
  await flush();
  announceGarage(); // the return's screen handoff
  settle();
  await pending;
  assert.equal(solo.intent.terrainVariant, 'assault-trenches');
  assert.equal(solo.intent.watched, true, 'a watched Garage battle is recorded as watched');
  // A refused (busy) start never overwrites the intent of the entry it could not displace.
  let finish;
  const busy = soloEntry({ begin: () => new Promise((resolve) => { finish = resolve; }) });
  const first = busy.beginLocalBattle({ gameMode: 'frontline_assault', campaignOperationId: 'op-3' });
  await flush();
  await busy.beginLocalBattle({ gameMode: 'standard' });
  assert.equal(busy.intent.terrainVariant, 'assault-trenches', 'the pending entry keeps its intent');
  assert.equal(busy.intent.campaignOperationId, 'op-3');
  finish();
  await first;
}

{
  // (round 8 Y4 s3-04) A couch battle's Battle Again. The entry records the couch, the Garage return's 'garage'
  // announcement (Battle Again's own enter) keeps it, and main's trigger replays it through the Garage's own press: a couch
  // battle with the phones here now, its join window closed first, never a click on '.cot-battle' (before: the record had
  // no couch, and the click started a keyboard battle that dropped the phones). With no phone here: the couch lobby.
  const solo = soloEntry();
  const announceGarage = phaseListener({ phase: 'battle' }, solo.intent);
  await solo.beginLocalBattleEntry('leopard2a4', 'desert',
    { gameMode: 'standard', couch: { seats: [1, 2], sides: 'teams', names: ['Seat 1', 'Seat 2'] } });
  assert.deepEqual(solo.intent.couch, { sides: 'teams' }, 'the couch entry records its couch');
  announceGarage();
  assert.deepEqual(solo.intent.couch, { sides: 'teams' }, "the return's 'garage' announcement keeps it");
  const uiSource = mainSource.slice(mainSource.indexOf('\n    triggerBattle: '));
  const triggerExpression = uiSource.slice('\n    triggerBattle: '.length, uiSource.indexOf('\n  },\n')).replace(/,\s*$/, '');
  const mainTrigger = ({ seats }) => {
    const calls = [];
    const trigger = runMainStatements(`const triggerBattle = ${triggerExpression};`, {
      replayBattleEntry: battleEntryIntentModule.replayBattleEntry,
      battleEntryIntent: solo.intent,
      garage: {
        replayEntry: (entry) => { calls.push(['replay', entry]); return true; },
        openCouch: () => { calls.push(['lobby']); return true; },
      },
      couchOwner: { current: { seatsInPlay: () => [...seats], startBattle: (launch) => { calls.push(['closeJoins']); return launch(seats); } } },
      t: (key, values) => `${key}:${values?.n}`,
      document: { querySelector: (selector) => { calls.push(['querySelector', selector]); return { disabled: false, click: () => calls.push(['click']) }; } },
    }, 'triggerBattle');
    return { outcome: trigger(), calls };
  };
  const again = mainTrigger({ seats: [2, 5] });
  assert.equal(again.calls.some(([name]) => name === 'querySelector' || name === 'click'), false, "Battle Again never clicks a button");
  assert.equal(again.outcome, 'started');
  assert.deepEqual(again.calls, [['closeJoins'], ['replay', { watch: false,
    couch: { seats: [2, 5], sides: 'teams', names: ['pad.seat:2', 'pad.seat:5'] } }]], 'a couch battle with the phones here now');
  const alone = mainTrigger({ seats: [] });
  assert.deepEqual([alone.outcome, alone.calls], ['lobby', [['lobby']]], 'no phone here: the couch lobby');
  // a later solo entry clears it: Battle Again is BATTLE again
  await solo.beginLocalBattleEntry('leopard2a4', 'desert', { gameMode: 'standard' });
  assert.equal(solo.intent.couch, null, 'a solo entry clears the couch');
  assert.deepEqual(mainTrigger({ seats: [1] }).calls, [['replay', { watch: false, couch: null }]]);
}

// The reveal: main's canReveal reads the battle's scene (isPresentable runs over the real scheduler in
// battleEntryReveal.selftest.mjs).
{
  const game = { phase: 'garage', tanks: [] };
  const lifecycle = runMainStatements(mainStatement('const battleEntryLifecycle = createBattleEntryLifecycle({'), {
    createBattleEntryLifecycle, game, graphicsContextLost: false, frameLoop: { presenting: true },
    nextFrame: async () => {}, revealTimeoutForField: () => 1000, sceneWatchdogEntryGeneration: 0, coveredBattleWatchdog: null,
  }, 'battleEntryLifecycle');
  await assert.rejects(lifecycle.run(() => lifecycle.primeReveal(), 'busy'), /left the screen/,
    'a reveal whose battle is not on screen abandons at once');
  assert.match(mainStatement('const battleEntryLifecycle = createBattleEntryLifecycle({'),
    /isPresentable: \(\) => !graphicsContextLost && frameLoop\.presenting,/, "the reveal's clock is the frame owner's own");
}

// The lifecycle's late-bound readers: an entry's cover is 'loading', a return that owes the screen is 'returning'.
{
  const game = { phase: 'battle', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const appLifecycle = createAppLifecycle({ game, announce() {} });
  const scope = {
    appLifecycle,
    battleEntryLifecycle: { pending: true, renderingCovered: false },
    battleLoad: { covering: true },
    garageReturn: { state: 'idle' },
  };
  runMainStatements(mainStatement('appLifecycle.setReaders({'), scope, 'null');
  assert.equal(appLifecycle.state, 'loading', "main binds the entry cover reader");
  scope.battleEntryLifecycle.pending = false;
  assert.equal(appLifecycle.state, 'live');
  appLifecycle.transition('garage', { reason: 'test', announce: false });
  scope.garageReturn.state = 'entering';
  assert.equal(appLifecycle.state, 'returning', 'main binds the return-owed reader');
  appLifecycle.transition('garage', { reason: 'test' });
  scope.garageReturn.state = 'idle';
  assert.equal(appLifecycle.state, 'garage');
}

// (round 2 U40) The lifecycle is the boot's from its creation: main bound its isBooting reader only with the late
// readers, thousands of lines later, so while main's module evaluated (the splash the screen) the lifecycle read
// 'garage' to isGarageScreenSettled and any early reader of window.__APP_LIFECYCLE.
{
  const start = mainSource.indexOf('\nconst appLifecycle = createAppLifecycle(');
  assert.ok(start > 0, 'main creates the app lifecycle');
  let depth = 0;
  let end = start + 1;
  for (let at = mainSource.indexOf('(', start); at < mainSource.length; at += 1) {
    if (mainSource[at] === '(') depth += 1;
    else if (mainSource[at] === ')' && --depth === 0) { end = mainSource.indexOf(';', at) + 1; break; }
  }
  const creation = mainSource.slice(start + 1, end);
  const game = { phase: 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const scope = { createAppLifecycle, game, bus: { emit() {} }, bootReadiness: { ready: false }, boot: { gated: false } };
  const appLifecycle = runMainStatements(creation, scope, 'appLifecycle');
  assert.equal(appLifecycle.state, 'boot', 'before any late reader is bound, the splash is the screen');
  scope.bootReadiness.ready = true;
  scope.boot.gated = true;
  assert.equal(appLifecycle.state, 'boot', 'the entry gate still waits on the player');
  scope.boot.gated = false;
  assert.equal(appLifecycle.state, 'garage');
}

// The battle frame: main's countdown ports (the warm hold's expiry beacon, the rollout on main's bus).
{
  const game = { phase: 'battle', preBattleS: 0, result: null, player: { input: {}, combat: {} } };
  const events = [];
  const warnings = [];
  const frame = runMainStatements(mainStatement('const battleFrame = createBattleFrameRuntime({'), {
    createBattleFrameRuntime, game, advancePreBattleCountdown,
    settings: { isOpen: () => false },
    killcam: { isActive: () => false },
    playerFrameInput: { camera: {}, poll() {}, dispose() {} },
    onlineMatchActive: () => false,
    onlinePump: { pump() {} },
    battleWarmHold: { pending: true },
    currentHud: () => null,
    bus: { emit: (type, payload) => events.push([type, payload]) },
    console: { warn: (message) => warnings.push(message), error() {}, info() {} },
    battlePresentation: { captureSoloPoses() {}, update() {} },
    battleResultPresentation: { update() {} },
    rig: { mode: 'ARCADE' },
    simStep() {},
    SIM_DT: 1 / 60,
  }, 'battleFrame');
  transitionBattleCountdown(game, 'arm');
  transitionBattleCountdown(game, 'open', 3);
  let frames = 0;
  while (game.preBattleS > 0 && frames < 1000) { frame.advance(0.1, 0.1, frames * 100, false); frames += 1; }
  assert.equal(warnings.length, 1, "main binds the hold's expiry beacon");
  assert.match(warnings[0], new RegExp(`warm hold passed ${PRE_BATTLE_WARM_HOLD_LIMIT_S} s`));
  assert.deepEqual(events.filter(([type]) => type === 'battle:rollout'), [['battle:rollout', {}]], 'one rollout on main\'s bus');
}

// (round 2, app-flow) A network round takes the scene from whatever holds it before it covers anything: main's one
// owner leaves a Studio open in this tab first (its exit, awaited), then the app lifecycle's edge decides; the room's
// launch goes through it before its intent cover, and every round the composition enters through the room port. A
// round used to cover and load its world over the Studio, and only its activation refused studio -> battle.
{
  const { AppPhaseTransitionError, assertAppPhaseTransition, GarageScreenUnsettledError } = await import('../game/appLifecycle.ts');
  const events = [];
  const game = { phase: 'studio' };
  let exitLeaves = true;
  // (the return's state, and its owesGarage as garageReturnRuntime derives it in the Garage's scene)
  const garageReturn = { state: 'idle', whenSettled: () => null, get owesGarage() { return garageReturn.state === 'failed'; } };
  const scope = {
    game, assertAppPhaseTransition, GarageScreenUnsettledError, garageReturn, canTransitionAppPhase, AppPhaseTransitionError,
    loadStudioRuntime: async () => ({ exit: async () => { events.push('studio.exit'); if (exitLeaves) game.phase = 'garage'; } }),
    onlineMatch: { current: { beginRoom: async () => { events.push(`beginRoom:${game.phase}`); return true; } } },
    networkBattleIntentCover: { show: () => events.push('intentCover') },
  };
  const { takeSceneForRound, beginMultiplayerV2Battle } = runMainStatements(
    [mainFunction('function takeSceneForRound('), mainFunction('function beginMultiplayerV2Battle('),
      ...(mainSource.includes('\nfunction battleSceneRefusal(') ? [mainFunction('function battleSceneRefusal(')] : [])], scope,
    '{ takeSceneForRound, beginMultiplayerV2Battle }');
  assert.equal(await beginMultiplayerV2Battle({}), true);
  assert.deepEqual(events, ['studio.exit', 'beginRoom:garage'], "the room's launch leaves the Studio before the round begins");
  events.length = 0;
  assert.equal(takeSceneForRound(), null, 'from the Garage the scene hands over now (nothing waits: the cover stays in its task)');
  assert.equal(beginMultiplayerV2Battle({}) instanceof Promise, true);
  assert.deepEqual(events, ['beginRoom:garage'], 'and the launch begins in the same task');
  game.phase = 'battle';
  assert.equal(takeSceneForRound(), null, 'a rematch in place');
  game.phase = 'studio';
  exitLeaves = false; // the Studio's Garage return failed: the scene is still the Studio's
  await assert.rejects(takeSceneForRound(), (error) => error instanceof AppPhaseTransitionError && error.from === 'studio',
    'a Studio that could not leave refuses the round before its cover');
  // (review 2) a Studio whose Garage return failed after it wrote the Garage's scene: no Garage to hand over (its notice
  // is the screen, its frames suppressed), so the round is refused as well, never loaded over the failed return
  game.phase = 'studio';
  exitLeaves = true;
  garageReturn.state = 'failed';
  await assert.rejects(takeSceneForRound(), (error) => error instanceof GarageScreenUnsettledError,
    'a Studio whose return failed refuses the round before its cover');
  assert.equal(game.phase, 'garage');
  // (round 3 B2) every other phase takes the same rule: a round over the Garage of a failed return is refused (it covered,
  // loaded and revealed under the return's notice, whose Retry then disposed it), and a return in flight settles first
  // (rounds never waited: a Leave's veil fading in, its entry under the veil)
  events.length = 0;
  await assert.rejects(Promise.resolve(takeSceneForRound()), (error) => error instanceof GarageScreenUnsettledError && error.state === 'returning',
    "a failed return's Garage refuses the round before its cover");
  await assert.rejects(beginMultiplayerV2Battle({}), (error) => error instanceof GarageScreenUnsettledError, 'and the launch');
  assert.deepEqual(events, [], 'no intent cover, no room begun');
  let land;
  garageReturn.state = 'entering';
  garageReturn.whenSettled = () => (garageReturn.state === 'idle' ? null : new Promise((resolve) => { land = () => { garageReturn.state = 'idle'; resolve(); }; }));
  const waiting = beginMultiplayerV2Battle({});
  await flush();
  assert.deepEqual(events, [], 'the launch waits for the return in flight');
  land();
  assert.equal(await waiting, true);
  assert.deepEqual(events, ['beginRoom:garage'], 'and begins once it landed');
  assert.match(mainSource, /\n\s+takeSceneForRound,\n/, "main binds the room's takeSceneForRound to the same owner");
}

// Every Garage return caller without an exit of its own takes main's (garageReturnState.selftest.mjs runs it).
assert.match(mainSource, /setGarageSpots, setGarageSunTrim, enterGarage: enterGarageWithExit,/, "the Studio's exit");
assert.match(mainSource, /enterGarage: enterGarageWithExit,\n/, "the room's covered restore");
assert.match(mainSource, /\n\s+returnToGarage: returnRoomToGarage,\n/, "(round 2 U20) the room's own returns");
assert.match(mainStatement('const soloBattleEntry = createSoloBattleEntryRuntime({'),
  /presentReturnFailure: \(error, retry\) => presentGarageReturnFailure\(error, retry\),/, "the solo entry's recovery");
assert.match(mainStatement('const battleAgainAction = createBattleAgainAction({'),
  /getRetry: \(\) => \(garageReturn\.state === 'failed' \? retryGarageReturn : null\),/, "Battle Again's notice");

console.log('mainFlowPorts.selftest: main binds the entry announce, intent (retries included), return wait and notice, reveal, lifecycle readers and countdown beacons passed');
