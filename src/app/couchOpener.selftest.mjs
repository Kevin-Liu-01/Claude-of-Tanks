// round 8 Y4 s3-03: the couch lobby is a lazy Garage opener (2026-11-02 audit F5's rule). The Couch press loaded the couch
// runtime and the lobby's chunk and then opened the lobby with no check that the Garage still showed: a press, then
// Launch on the same Deploy foot inside a cold download, opened the lobby's modal over the loader or the battle and a
// pairing lobby nobody wanted (runtime.open(), a PadPair object and a socket). The one path is openCouchWhenCurrent
// (src/app/couchOpener.ts), driven here with the real Garage screen owner (garageScreen.ts) and a deferred load; main.ts's
// onCouch and garage.ts's press are pinned to it in garageOpenState.selftest (case 5).
// (review r2) Launch does not hide the Garage: the solo entry shows its loader and loads the world under it, and the
// Garage hides only at the activation after that (soloBattleStartRuntime.ts ui.hideGarage). Chunks that landed inside
// that covered load still held the ticket and opened the lobby over the loader. garage.ts's own launchBattle and battle()
// run here over the real screen owner: the start launchBattle hands on, and the BATTLE/Launch press before its play
// request, end the press's ticket while the Garage still shows (handOff). And a lobby that failed to open once loaded is
// not a failed chunk: only a load rejection is a CouchChunkError.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as garageScreenModule from '../ui/garageScreen.ts';

// (dynamic: the press's opener owner, round 8 Y4 residual; a tree without it fails by assertion, not at link time)
const { createGarageScreen, createLazyOpener } = garageScreenModule;

const { openCouchWhenCurrent, CouchChunkError } = await import('./couchOpener.ts').catch(() => ({}));
assert.equal(typeof openCouchWhenCurrent, 'function', 'one couch opener checks the Garage that asked (before: none)');

/** garage.ts's own launchBattle over stand-ins for its closure (its failed-load gate, the refusal, the bus, the entry) and
 *  the given Garage screen owner. */
const garageSource = readFileSync(new URL('../ui/garage.ts', import.meta.url), 'utf8');
const garageFunction = (head) => {
  const start = garageSource.indexOf(head);
  assert.ok(start > 0, `garage.ts holds ${head.trim()}`);
  return stripTypeScriptTypes(garageSource.slice(start, garageSource.indexOf('\n  }\n', start) + 4));
};
const launchCode = garageFunction('  function launchBattle(');
assert.ok(launchCode.includes('onBattle(specId, mapId, options, announce)'), 'garage.ts holds launchBattle');
const battleCode = garageFunction('  function battle(');
function garageLaunch({ garageScreen, failed = false, refused = false, started }) {
  return new Function('garageScreen', 'pressFailed', 'battleBtn', 'opts', 'emit', 'onBattle', 'battleGameMode',
    `${launchCode}; return launchBattle;`)(
    garageScreen, () => failed, {}, { refusesBattle: () => refused }, () => {},
    (specId) => started.push(specId), 'standard');
}
/** garage.ts's own battle() (the BATTLE button and the Deploy foot's Launch, [data-battle-launch]) and launchBattle, with
 *  main.ts's onPlayRequest as playSurface.open runs a solo request: request.startSolo after an await (on the play menu's
 *  chunk when one is in flight, `menu`). */
function garageBattlePress({ garageScreen, refused = false, started, menu = Promise.resolve() }) {
  const opts = { refusesBattle: () => refused, onPlayRequest: (request) => { void menu.then(() => request.startSolo()); } };
  return new Function('garageScreen', 'pressFailed', 'battleBtn', 'opts', 'emit', 'onBattle', 'battleGameMode', 'selectedId',
    'fieldMapId', 'closeBattleMenu', 'battleMode', `${launchCode}\n${battleCode}; return battle;`)(
    garageScreen, () => false, {}, opts, () => {}, (specId) => started.push(specId), 'standard', 'm1a2', () => 'steppe',
    () => {}, 'solo');
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** The loaded pair as main.ts's onCouch has it: the couch runtime (its open() starts the pairing lobby) and the lobby's
 *  module (its openCouchLobby calls runtime.open() and opens the modal). */
function loadedPair(calls) {
  const runtime = { open: () => { calls.push('lobby factory'); return {}; } };
  const lobby = { openCouchLobby: (target) => { calls.push('openCouchLobby'); target.open(); } };
  return [runtime, lobby];
}
const show = ([runtime, lobby]) => lobby.openCouchLobby(runtime);

// A press, then a start launchBattle hands on (Test Drive, the couch lobby's Start, Battle Again's couch replay call it
// directly; the BATTLE/Launch press reaches it through its play request, the next case), with the chunks landing during
// the covered world load: the Garage still shows under the loader, and nothing opens over it.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const started = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  assert.equal(garageLaunch({ garageScreen: screen, started })('m1a2', 'steppe'), true, 'Launch hands the start on');
  assert.deepEqual(started, ['m1a2']);
  assert.equal(screen.phase, 'open', 'the Garage shows under the loader until the activation hides it');
  load.resolve(loadedPair(calls));
  assert.equal(await opening, false, 'a start handed on ends the press: the lobby opens nothing over the loader');
  assert.deepEqual(calls, [], 'no lobby modal and no pairing lobby (before: both, over the loader)');
}

// A press, then the activation hides the Garage before a slow download lands: nothing opens over the battle.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  screen.hide(); // the battle's activation (soloBattleStartRuntime.ts ui.hideGarage -> garage.ts hide)
  load.resolve(loadedPair(calls));
  assert.equal(await opening, false, 'the Garage that asked hid: the press opens nothing');
  assert.deepEqual(calls, []);
}

// A press, then BATTLE or the Deploy foot's Launch: battle() hands the player on before its play request (a solo start
// can wait there on the play menu's chunk), so the lobby opens nothing whether the start then follows or launchBattle
// refuses it (a network round entering, a failed return's notice). The newest press wins: a refused one leaves the
// player at its notice, and a Couch press after it opens the lobby (the hand-off case 1b, garageOpenState), also while
// the first press's chunks still load (the next case; round 8 Y4 residual: before, the press's latch swallowed that one).
for (const { refused, menuWait } of [{ refused: false }, { refused: true }, { refused: false, menuWait: true }]) {
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const started = [];
  const load = deferred();
  const menu = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  garageBattlePress({ garageScreen: screen, refused, started, menu: menuWait ? menu.promise : Promise.resolve() })();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await flush();
  // the couch chunks land while the solo start waits on the play menu's chunk (menuWait), or after the start
  load.resolve(loadedPair(calls));
  const label = refused ? ', its start refused after it' : menuWait ? ', the chunks landing before its start' : '';
  assert.equal(await opening, false, `the BATTLE/Launch press ends the press${label}`);
  assert.deepEqual(calls, []);
  menu.resolve();
  await flush();
  assert.equal(started.length, refused ? 0 : 1, refused ? 'a refused start starts nothing' : 'the press starts the battle');
  assert.equal(screen.phase, 'open', 'the Garage still shows (under the loader, or at the refusal notice)');
}

// (round 8 Y4 residual, review r4) The Couch pressed again while its chunks still load, as garage.ts writes the press (its
// own openCouch, types stripped) and main.ts its onCouch (its own, the download a deferred stand-in), over the real screen
// owner. A BATTLE or Launch press whose start was refused (or a room press whose menu the player closed) handed the
// player on and lapsed the first press's ticket while the Garage still shows. Before, the next Couch press inside that
// download returned at the press's in-flight latch with no new ticket: the chunks landed on the lapsed one, opened
// nothing, and only a third press opened the lobby. Now a press while the chunks load is the press they open for (its
// ticket and its Deploy selection: garageScreen.ts createLazyOpener, the lazy toggle's rule), and the load still checks
// that ticket, so nothing opens over the loader or the battle.
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const onCouchStart = mainSource.indexOf('\n  onCouch: ');
const onCouchCode = mainSource.slice(onCouchStart, mainSource.indexOf('\n  },', onCouchStart) + 5).replace(/\bimport\(/g, '__load(');
assert.ok(onCouchStart > 0 && onCouchCode.includes('openCouchWhenCurrent({ ticket: request.ticket'), 'main.ts holds onCouch');
const couchHead = "  const setupCouch = requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-couch]');\n";
const couchStart = garageSource.indexOf(couchHead);
const couchCode = stripTypeScriptTypes(garageSource.slice(couchStart + couchHead.length,
  garageSource.indexOf("  setupCouch.addEventListener('click'", couchStart)));
assert.ok(couchStart > 0 && couchCode.includes('const openCouch = ('), 'garage.ts holds the Couch press');
/** main.ts's own onCouch: the couch runtime's preload is the download, the lobby's module opens the request. */
function mainOnCouch({ preload, lobbies }) {
  return new Function('openCouchWhenCurrent', 'couchOwner', '__load', `return ({${onCouchCode}\n}).onCouch;`)(
    openCouchWhenCurrent, { preload }, async (specifier) => {
      assert.equal(specifier, './ui/couchLobby.ts');
      return { openCouchLobby: (runtime, request) => lobbies.push(request) };
    });
}
/** garage.ts's own Couch press over stand-ins for its closure; `select` changes the Deploy selection it reads. */
function garageCouchPress({ garageScreen, onCouch, launches }) {
  return new Function('opts', 'setupCouch', 'reloadsForFailure', 'reportLoadFailure', 't', 'fieldMapId', 'garageScreen',
    'closeBattleMenu', 'launchBattle', 'CouchChunkError', 'createLazyOpener',
    `let selectedId = 'm1a2'; let battleGameMode = 'standard';\n${couchCode}\n`
    + 'return { openCouch, select(specId, gameMode) { selectedId = specId; battleGameMode = gameMode; } };')(
    { onCouch }, { disabled: false }, () => false, () => {}, (key) => key, () => 'steppe', garageScreen, () => {},
    (specId, mapId, options) => { launches.push([specId, mapId, options.gameMode]); return true; }, CouchChunkError,
    createLazyOpener);
}
for (const variant of ['pressed again', 'handed on', 'pressed again, then hidden', 'pressed twice']) {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const screen = createGarageScreen();
  screen.show();
  const downloads = [];
  const lobbies = [];
  const launches = [];
  const onCouch = mainOnCouch({ preload: () => { const download = deferred(); downloads.push(download); return download.promise; }, lobbies });
  const press = garageCouchPress({ garageScreen: screen, onCouch, launches });
  assert.equal(press.openCouch(), true, 'the press asks for the chunks');
  await flush();
  // BATTLE or Launch whose start was refused, or a room press whose menu the player closed: the Garage still shows
  if (variant !== 'pressed twice') screen.handOff();
  if (variant !== 'handed on') {
    press.select('t90m', 'assault'); // the player changed the Deploy selection meanwhile
    assert.equal(press.openCouch(), true, `a repeat press while the chunks load is taken (${variant}; before: dropped at the latch)`);
  }
  await flush();
  assert.equal(downloads.length, 1, 'one download however many presses come before it lands');
  if (variant === 'pressed again, then hidden') screen.hide(); // the battle's activation (ui.hideGarage)
  downloads[0].resolve({ open() {} });
  await flush();
  await flush();
  if (variant === 'handed on' || variant === 'pressed again, then hidden') {
    assert.equal(lobbies.length, 0, `nothing opens over the loader or the battle (${variant})`);
    continue;
  }
  assert.equal(lobbies.length, 1, `the repeat press opens the lobby once the chunks land (${variant}; before: none after a hand-off, and a third press opened it)`);
  assert.equal(lobbies[0].gameMode, 'assault', 'for the newest press\'s Deploy mode');
  assert.equal(lobbies[0].trigger.disabled, false, 'with the Couch button as its trigger');
  assert.equal(lobbies[0].start({ seats: [1], sides: null, names: ['Seat 1'] }), true);
  assert.deepEqual(launches, [['t90m', 'steppe', 'assault']], 'and its Start deploys the newest press\'s vehicle, map and mode');
}

// A start launchBattle refuses or cannot make (a press after a failed chunk, a refused battle), called directly (Test
// Drive, the couch lobby's Start, Battle Again's couch replay), hands nothing on: the Garage that asked still shows and
// is the player's, so the lobby opens over it once.
for (const refusal of [{ failed: true }, { refused: true }]) {
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const started = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  assert.equal(garageLaunch({ garageScreen: screen, started, ...refusal })('m1a2', 'steppe'), false);
  assert.deepEqual(started, []);
  load.resolve(loadedPair(calls));
  assert.equal(await opening, true, `a direct start that started nothing keeps the press (${Object.keys(refusal)[0]})`);
  assert.deepEqual(calls, ['openCouchLobby', 'lobby factory']);
}

// A press whose chunks land while the Garage still shows opens the lobby once.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  load.resolve(loadedPair(calls));
  assert.equal(await opening, true);
  assert.deepEqual(calls, ['openCouchLobby', 'lobby factory'], 'exactly one lobby, over the Garage that asked');
}

// A Garage hidden and shown again before the chunks land is a new open span: the old press's ticket lapsed.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  screen.hide();
  screen.show();
  load.resolve(loadedPair(calls));
  assert.equal(await opening, false);
  assert.deepEqual(calls, []);
}

// A chunk that did not arrive rejects to the press as a CouchChunkError with its cause (garage.ts reports it under the
// loaders' policy: the button's error state and Reload page), and opens nothing.
assert.equal(typeof CouchChunkError, 'function', 'a failed chunk is told apart from a lobby that failed to open (before: one rejection)');
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const failure = new Error('chunk failed');
  await assert.rejects(openCouchWhenCurrent({ ticket: screen.ticket(), load: () => Promise.reject(failure), open: show }),
    (error) => error instanceof CouchChunkError && error.cause === failure);
  await assert.rejects(openCouchWhenCurrent({ ticket: screen.ticket(), load: () => { throw failure; }, open: show }),
    (error) => error instanceof CouchChunkError && error.cause === failure, 'a load that throws at once is a failed chunk too');
  assert.deepEqual(calls, []);
}

// A lobby that fails to open once its chunks landed (the lobby's socket, a bug) rejects with its own error, not as a
// failed chunk: the press keeps the button a press and logs the cause.
{
  const screen = createGarageScreen();
  screen.show();
  const broken = new Error('the lobby failed to open');
  await assert.rejects(openCouchWhenCurrent({ ticket: screen.ticket(), load: async () => loadedPair([]), open: () => { throw broken; } }),
    (error) => error === broken && !(error instanceof CouchChunkError));
}

console.log('couchOpener.selftest: the couch lobby opens only over the Garage that asked, once, never over a start handed on, for the newest press while its chunks load, and only a failed chunk is a load failure passed');
