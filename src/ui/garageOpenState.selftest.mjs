// 2026-11-02 audit F5: the Garage screen's one open-state owner (garageScreen.ts), the epoch its lazy openers check, the
// shared ready wait (gameReady.ts), the consumables picker's declared wait, and garage.ts routed through them. The
// browser hazards themselves (a cold Deploy opening over a battle, a picker's Tab trap under a hidden Garage) need a page:
// the owners are driven here, and the Garage's wiring is pinned in its source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as garageScreenModule from './garageScreen.ts';
import { createGameReadyWaiter } from './gameReady.ts';
import { createBootReadiness } from '../app/bootReadiness.ts';
import { CONSUMABLES_PICKER_CLOSED, nextConsumablesPicker } from './garageConsumables.ts';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import { stripTypeScriptTypes } from 'node:module';
import { createLazyChunk } from '../app/lazyChunk.ts';
// (round 8 Y4 residual fix-up r1: case 10 runs garage.ts's own launchBattle and onKey, and hands a start to the real entry)
import { runMainStatements } from '../app/mainComposition.test-support.mjs';
import { createSoloBattleEntryRuntime } from '../game/soloBattleEntryRuntime.ts';
import { createBattleEntryLifecycle } from '../game/battleEntryLifecycle.ts';

// (dynamic: a base without it fails by assertion, case 1b, not at link time)
const { CouchChunkError } = await import('../app/couchOpener.ts').catch(() => ({}));
// (and the latched openers' owner, round 8 Y4 residual: case 1c)
const { createGarageScreen, createLazyPanelToggle, createLazyOpener } = garageScreenModule;

// 1. The screen: one state, an epoch per open span, tickets that lapse on hide, closers run once per hide.
{
  const screen = createGarageScreen();
  assert.equal(screen.phase, 'unpresented');
  const early = screen.ticket();
  assert.equal(screen.hide(), false, 'a hide before the first show keeps the first presentation first');
  assert.equal(screen.phase, 'unpresented');
  assert.equal(screen.show(), 'first');
  assert.equal(early.current(), false, 'a ticket from before the first show lapses at it');
  assert.equal(screen.show(), 'already');
  const ticket = screen.ticket();
  assert.equal(ticket.current(), true);
  const closed = [];
  const stop = screen.onHide(() => closed.push('rotation'));
  screen.onHide(() => { throw new Error('a closer that fails'); });
  screen.onHide(() => closed.push('timer'));
  const warned = [];
  const quiet = createGarageScreen({ warn: (message) => warned.push(message) });
  quiet.show();
  quiet.onHide(() => { throw new Error('boom'); });
  assert.equal(quiet.hide(), true);
  assert.equal(warned.length, 1, 'a failing closer is reported, and the hide completes');
  screen.onHide(() => {}); // a closer that does nothing
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.equal(screen.hide(), true); } finally { console.warn = originalWarn; }
  assert.deepEqual(closed, ['timer', 'rotation'], 'every closer ran (newest first), past the one that threw');
  assert.equal(ticket.current(), false, 'a lazy opener started before the hide opens nothing after its load');
  assert.equal(screen.isOpen, false);
  assert.equal(screen.show(), 'reopen');
  assert.equal(ticket.current(), false, 'nor after the Garage came back: that is another open span');
  stop();
  closed.length = 0;
  console.warn = () => {};
  try { screen.hide(); } finally { console.warn = originalWarn; }
  assert.deepEqual(closed, ['timer']);
  assert.equal(screen.hide(), false, 'hiding a hidden Garage changes nothing');
}

// 1b. (round 8 Y4 s3-03, review r2) The hand-off: a battle start (or the play menu) takes the player on while the Garage
//     still shows (under the loader until the activation hides it). Every ticket taken before lapses; the open state,
//     its closers and a new press's ticket are untouched.
{
  const screen = createGarageScreen();
  assert.equal(typeof screen.handOff, 'function', 'the screen owns the hand-off (before: only a hide lapsed a ticket)');
  assert.equal(screen.handOff(), false, 'nothing to hand on before the first show');
  screen.show();
  const before = screen.ticket();
  const closed = [];
  screen.onHide(() => closed.push('closer'));
  assert.equal(screen.handOff(), true);
  assert.equal(before.current(), false, 'a lazy opener started before the hand-off opens nothing after its load');
  assert.equal(screen.phase, 'open', 'the Garage still shows');
  assert.equal(screen.isOpen, true);
  assert.equal(screen.show(), 'already', 'and is not shown again');
  const after = screen.ticket();
  assert.equal(after.current(), true, 'a press after the hand-off (a refused start leaves the Garage) takes a live ticket');
  assert.deepEqual(closed, [], 'a hand-off runs no closer: the hide does');
  assert.equal(screen.hide(), true);
  assert.deepEqual(closed, ['closer']);
  assert.equal(after.current(), false);
  const epoch = screen.epoch;
  assert.equal(screen.handOff(), false, 'a hidden Garage hands nothing on');
  assert.equal(screen.epoch, epoch);
}

// 1c. (round 8 Y4 residual, review r4) A lazy opener with one load in flight (the Couch press, the tech tree, the Service
//     Record): createLazyOpener. A press while the load is in flight is the press it opens for (its values, a fresh
//     ticket), the lazy toggle's rule (case 6), instead of being dropped at a latch: after a hand-off lapsed the first
//     press's ticket while the Garage still shows, the player's next press used to be lost, and only a third one opened.
{
  assert.equal(typeof createLazyOpener, 'function',
    'the latched openers have one owner (before: three latches that dropped a press while their load was in flight)');
  const screen = createGarageScreen();
  screen.show();
  const opener = createLazyOpener(screen);
  assert.equal(opener.phase, 'idle');
  assert.equal(opener.wanted, false);
  const load = opener.press('bar');
  assert.ok(load, 'the first press starts the load');
  assert.equal(opener.phase, 'loading');
  assert.equal(load.current(), true);
  assert.equal(opener.wanted, true, 'a load the press still holds reads as opening (the Service Record\'s toggle)');
  assert.equal(screen.handOff(), true);
  assert.equal(load.current(), false, 'a hand-off ends the press: its load opens nothing over the loader');
  assert.equal(opener.wanted, false);
  assert.equal(opener.press('menu'), null, 'a press while it loads starts no second load');
  assert.equal(load.current(), true, 'it renews the ticket the load checks (before: the load landed on the lapsed one)');
  assert.equal(load.press, 'menu', 'and the load opens for the newest press');
  opener.cancel();
  assert.equal(load.current(), false, 'a close while it loads cancels it');
  assert.equal(opener.wanted, false);
  assert.equal(opener.press('bar'), null);
  assert.equal(load.current(), true, 'a press after the close asks for it again');
  assert.equal(load.press, 'bar');
  screen.hide();
  assert.equal(load.current(), false, 'the hide ends it: nothing opens over a battle');
  screen.show();
  assert.equal(load.current(), false, 'nor in the next open span');
  opener.settle(load);
  assert.equal(opener.phase, 'idle', 'the load settled');
  assert.equal(opener.wanted, false);
  assert.equal(load.press, 'bar', 'its press stays the one it opened for');
  const next = opener.press('trigger');
  assert.ok(next && next !== load, 'the next press starts a new load');
  assert.equal(load.press, 'bar', 'and a settled load is not renewed');
  opener.settle(load);
  assert.equal(opener.phase, 'loading', 'a stale settle changes nothing');
  opener.settle(next);
  assert.equal(opener.phase, 'idle');
  screen.hide();
  const hidden = opener.press('trigger');
  assert.equal(hidden.current(), false, 'a press over a hidden Garage holds nothing');
  opener.settle(hidden);
}

// 1d. (round 8 Y4 residual fix-up r1, review res-r1) A start the Garage handed on is in flight (launchBattle: enter()). The
//     Garage still shows (under the battle's loader until the activation hides it) but is not the player's: a ticket taken
//     or checked then is not current, and it is not `interactive` (its keys do nothing, case 10), until the start ends with
//     the Garage still showing (refused, or failed before the activation: the give-back enter() returned), a hide (the
//     activation) or a show (a return). Before, the hand-off lapsed only the tickets taken before it: a press under the
//     loader took a live ticket, and since the residual's renewal it also revived a load in flight, so the tree opened over
//     the loader. A cover main puts over the Garage (the battle loader, a network round's too) holds the same while it stands.
{
  const screen = createGarageScreen();
  assert.equal(typeof screen.enter, 'function',
    'the screen owns a start in flight (before: the hand-off lapsed only the tickets taken before it)');
  screen.enter()();
  assert.equal(screen.phase, 'unpresented', 'nothing to hand on before the first show');
  screen.show();
  assert.equal(screen.interactive, true, 'an open Garage is the player\'s');
  const before = screen.ticket();
  const giveBack = screen.enter();
  assert.equal(screen.phase, 'entering');
  assert.equal(screen.isOpen, true, 'the Garage still shows (under the loader)');
  assert.equal(screen.interactive, false, 'but is not the player\'s');
  assert.equal(before.current(), false, 'a press before the start opens nothing over its loader');
  const under = screen.ticket();
  assert.equal(under.current(), false, 'a press under the loader takes no live ticket (before: it did, and opened over the loader)');
  assert.equal(screen.handOff(), false, 'a hand-off under the loader hands nothing more on');
  assert.equal(screen.show(), 'already', 'a return shows a Garage that still showed');
  assert.equal(screen.phase, 'open', 'and gives it back to the player (a failed start\'s recovery)');
  assert.equal(under.current(), false, 'a press made under the loader stays spent');
  const refused = screen.enter();
  const nested = screen.enter(); // a second start while one is in flight (the entry refuses it: busy)
  nested();
  assert.equal(screen.phase, 'entering', 'a second start\'s give-back does not give back the first start\'s Garage');
  giveBack();
  assert.equal(screen.phase, 'entering', 'nor does an earlier start\'s late settle');
  refused(); // the start was refused: the Garage still shows, and is the player's again
  assert.equal(screen.phase, 'open');
  assert.equal(screen.interactive, true);
  const after = screen.ticket();
  assert.equal(after.current(), true, 'a press after the refusal takes a live ticket');
  refused();
  assert.equal(after.current(), true, 'a second give-back changes nothing');
  const accepted = screen.enter();
  const closed = [];
  screen.onHide(() => closed.push('closer'));
  assert.equal(screen.hide(), true, 'the activation hides a Garage handed on');
  assert.deepEqual(closed, ['closer'], 'and runs its closers');
  assert.equal(screen.isOpen, false);
  accepted();
  assert.equal(screen.phase, 'hidden', 'the accepted start\'s settle after its activation gives nothing back');
  assert.equal(screen.show(), 'reopen');
  assert.equal(screen.interactive, true);
}
{
  // a cover main puts over the Garage (garage.ts reads main's battle-loader gate, setDecorativeWorkGate: a network
  // round's loader too, which hides the Garage only at its activation, activationRuntime.ts)
  let covered = false;
  const screen = createGarageScreen({ covered: () => covered });
  screen.show();
  const before = screen.ticket();
  covered = true;
  assert.equal(screen.interactive, false, 'a covered Garage is not the player\'s (before: a cover changed nothing)');
  assert.equal(screen.isOpen, true, 'though it shows under the cover');
  assert.equal(before.current(), false, 'a load that lands under the cover opens nothing over it');
  const under = screen.ticket();
  covered = false;
  assert.equal(screen.interactive, true, 'the lifted cover gives the Garage back');
  assert.equal(before.current(), true, 'a press made on the uncovered Garage holds again once the cover lifts');
  assert.equal(under.current(), false, 'a press made under the cover stays spent');
}

// 2. The shared ready wait rides the boot latch's edge (round 2: no poll; gameReady.selftest drives it over garage.ts's
//    callouts): ready runs each waiter once, a cancelled one never, and a halted boot ends the wait.
{
  const latch = createBootReadiness();
  let halted = false;
  const waiter = createGameReadyWaiter({ isReady: () => latch.ready, hasFailed: () => halted,
    onReady: (callback) => latch.whenReady(callback) });
  const ran = [];
  waiter.whenReady(() => ran.push('gallery'));
  waiter.whenReady(() => ran.push('deploy'));
  const cancelHotspots = waiter.whenReady(() => ran.push('hotspots'));
  cancelHotspots();
  assert.equal(waiter.state, 'waiting');
  assert.deepEqual(ran, [], 'nothing runs before the boot settles, and reading the state runs nothing');
  latch.markReady();
  assert.deepEqual(ran, ['gallery', 'deploy']);
  waiter.whenReady(() => ran.push('late'));
  assert.deepEqual(ran.at(-1), 'late', 'a waiter after ready runs at once');
  assert.equal(waiter.state, 'ready');

  const halting = createBootReadiness();
  const failing = createGameReadyWaiter({ isReady: () => halting.ready, hasFailed: () => halted,
    onReady: (callback) => halting.whenReady(callback) });
  halted = true;
  assert.equal(failing.state, 'failed');
  failing.whenReady(() => ran.push('never'));
  assert.equal(ran.includes('never'), false, 'a halted boot runs no waiter');
}

// 3. The consumables picker: its wait for the smoke table is a state every dismissal clears.
{
  let state = CONSUMABLES_PICKER_CLOSED;
  const step = (event) => { const next = nextConsumablesPicker(state, event); state = next.state; return next.show; };
  assert.equal(step({ type: 'press', slot: 1, tableReady: false }), null);
  assert.deepEqual(state, { phase: 'pending', slot: 1 });
  assert.equal(step({ type: 'dismiss' }), null, 'an outside press while the table loads');
  assert.equal(step({ type: 'tableSettled', loaded: true }), null,
    'the late table opens nothing over what the player did meanwhile');
  assert.equal(state.phase, 'closed');
  step({ type: 'press', slot: 0, tableReady: false });
  step({ type: 'press', slot: 2, tableReady: false });
  assert.equal(step({ type: 'tableSettled', loaded: true }), 2, 'the newest press wins');
  assert.deepEqual(state, { phase: 'open', slot: 2 });
  assert.equal(step({ type: 'press', slot: 2, tableReady: true }), null, 'a press on the open slot shuts it');
  assert.equal(state.phase, 'closed');
  step({ type: 'press', slot: 1, tableReady: false });
  assert.equal(step({ type: 'tableSettled', loaded: false }), null);
  assert.equal(state.phase, 'closed', 'a table that did not arrive leaves no wait behind (the next press asks again)');
  assert.equal(step({ type: 'press', slot: 0, tableReady: true }), 0);
  assert.equal(step({ type: 'press', slot: 1, tableReady: true }), 1, 'another slot opens over the open one');
}

// 4. The custom camo studio opens only while the page that asked still wants it.
{
  let opens = 0;
  const access = createCustomCamoStudioAccess(async () => ({ open() { opens += 1; }, syncSelected() {}, close() {}, dispose() {} }));
  await access.open(() => false);
  assert.equal(opens, 0, 'a Garage that hid during the load opens no studio');
  await access.open(() => true);
  await access.open();
  assert.equal(opens, 2);
}

// 5. The Garage's wiring.
{
  const source = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /window\.__GAME_READY/, 'no Garage feature polls the boot flag itself (gameReady.ts)');
  assert.doesNotMatch(source, /api\.isOpen = /, 'show() and hide() are not the open state: the owner is');
  assert.match(source, /get isOpen\(\) \{ return garageScreen\.isOpen; \}/);
  assert.doesNotMatch(source, /garageSwatchOpen = (true|false)/, 'the swatch gate reads the screen');
  const hide = source.slice(source.indexOf('    hide() {'), source.indexOf('/** Normalize packaged tank portraits'));
  for (const closer of ['garageScreen.hide()', 'closeEqPicker({ restoreFocus: false })', 'garageConsumables?.close({ restoreFocus: false })',
    'rivalMenu?.close()', 'quickMenus?.mode.close()', 'quickMenus?.field.close()', 'techTreeScreen?.close({ restoreFocus: false })',
    'closePhoto?.()', 'facetPanelToggle.panel?.close()', 'clearTimeout(facetSelectTimer)', 'closeSurfacesWithin(root)',
    'sweepHiddenSurfaces()']) {
    assert.ok(hide.includes(closer), `hide() runs ${closer}`);
  }
  assert.ok(hide.indexOf('garageScreen.hide()') < hide.indexOf('closeBattleMenu()'), 'the tickets lapse before the closes');
  assert.match(source, /const reopen = \(\): void => \{ if \(ticket\.current\(\)\) openBattleMenu\(\); \};/,
    'a cold Deploy opens only over the Garage that asked for it');
  // (round 8 Y4 residual) the latched openers check their newest press (createLazyOpener, case 1c; cases 8, 9 and
  // couchOpener.selftest drive them as garage.ts writes them)
  assert.match(source, /const techTreeOpener = createLazyOpener<HTMLElement \| null>\(garageScreen\);/, 'the tech tree\'s press is a lazy opener');
  assert.match(source, /if \(!opening\.current\(\)\) return;\n      const screen = createTechTreeScreen/, 'so does the tech tree');
  assert.match(source, /if \(!ticket\.current\(\) \|\| battleMenu\.classList\.contains\('open'\)\) return;\n      closePhoto = openPhotoMode/,
    'and photo mode');
  assert.match(source, /if \(!quickMenus \|\| !ticket\.current\(\)\) return;/, 'and the quick menus');
  assert.match(source, /customCamoStudioAccess\?\.open\(garageScreen\.ticket\(\)\.current\)/, 'and the custom camo studio');
  // (round 8 Y4 fix-up r3) and the Service Record (case 8 drives it)
  assert.match(source, /const recordOpener = createLazyOpener<HTMLElement>\(garageScreen\);/, 'the record press is a lazy opener');
  assert.match(source, /const opening = recordOpener\.press\(trigger\);\n    if \(!opening\) return;/, 'the record press takes the ticket');
  assert.match(source, /if \(!opening\.current\(\)\) return;\n      serviceRecord \?\?= createServiceRecordDialog/,
    'and the Service Record');
  assert.match(source, /const closeServiceRecord = [^\n]*\n    recordOpener\.cancel\(\);/, 'whose close while it loads cancels it');
  // (round 8 Y4 s3-03) and the couch lobby: the press hands the Garage's ticket and its button (the modal's trigger, so
  // the hide's closeSurfacesWithin takes an in-time lobby), a repeat press while the chunks load is the press they open
  // for (residual; it used to do nothing), a failed chunk is the kit's failure; main's onCouch opens through the one
  // helper (couchOpener.selftest drives it)
  const couchPress = source.slice(source.indexOf('const openCouch = ('), source.indexOf("setupCouch.addEventListener('click'"));
  assert.ok(couchPress.length > 0, 'the Couch press is one function (before: an inline handler with no ticket)');
  assert.match(source, /const couchOpener = createLazyOpener<[^\n]*>\(garageScreen\);\n  const openCouch = \(/, 'a lazy opener');
  assert.match(couchPress, /const opening = couchOpener\.press\(\{ specId: selectedId, mapId: fieldMapId\(\), gameMode: battleGameMode \}\);\n    if \(!opening\) return true;/,
    'one load in flight: a press while it loads renews it');
  assert.match(couchPress, /reloadsForFailure\(setupCouch, 'cot-couch-load', /, 'a press after a failed chunk reloads the page');
  assert.match(couchPress, /ticket: opening, trigger: setupCouch,/, 'the ticket and the trigger');
  assert.match(couchPress, /reportLoadFailure\('cot-couch-load', /, 'a failed chunk marks the button');
  // (review r2) the press's failure policy runs as written (case 7 drives it): only a CouchChunkError marks the button
  assert.match(couchPress, /if \(!\(error instanceof CouchChunkError\)\) \{ console\.error\('\[couch\] the lobby failed to open', error\); return; \}/,
    'a lobby that failed to open once loaded is logged, not a failed chunk');
  // (review r2) every press that hands the player on from the Garage ends the lazy openers' tickets while it still shows:
  // the start launchBattle hands on, and the BATTLE/Watch, campaign and room presses before their play request
  const launch = source.slice(source.indexOf('  function launchBattle('), source.indexOf('\n  }\n', source.indexOf('  function launchBattle(')));
  // (residual fix-up r1) the start launchBattle hands on: enter() (case 1d), given back on the entry's settle (case 10)
  assert.ok(launch.indexOf('if (refused) return false;') < launch.indexOf('const giveBack = garageScreen.enter();'),
    'a refused press hands nothing on');
  assert.match(launch, /const giveBack = garageScreen\.enter\(\);\n    let settled[^\n]*\n    try \{\n      settled = onBattle\(specId, mapId, options, announce\);/,
    'the start handed on hands the Garage on');
  assert.match(launch, /if \(settled && typeof settled\.then === 'function'\) void Promise\.resolve\(settled\)\.finally\(giveBack\);\n    else giveBack\(\);/,
    'and gives it back when the entry settles (at once for an entry that returns no settle)');
  assert.match(source, /const garageScreen = createGarageScreen\(\{ covered: \(\) => garageSwatchCover\(\) \}\);/,
    'the screen reads main\'s battle-loader cover (a network round\'s loader too)');
  assert.match(source, /setDecorativeWorkGate\(covered: \(\) => boolean\) \{ garageSwatchCover = covered; \},/, 'which the gate sets');
  assert.match(source, /function onKey\(e: KeyboardEvent\): void \{\n(?:\s+\/\/[^\n]*\n)*\s+if \(!garageScreen\.interactive\) return;/,
    'the Garage\'s keys act only while it is the player\'s (case 10 drives them)');
  for (const [name, head] of [['the BATTLE and Watch press', '  function battle('], ['the campaign press', '  function deployCampaign('],
    ['the room press', '  function openMultiplayer(']]) {
    const body = source.slice(source.indexOf(head), source.indexOf('\n  }\n', source.indexOf(head)));
    assert.ok(body.length > 0, `garage.ts holds ${name}`);
    const handOff = body.indexOf('garageScreen.handOff();');
    const request = body.search(/opts\.onPlayRequest(?:\?\.)?\(\{/);
    assert.ok(handOff > 0 && request > handOff, `${name} hands the player on before its play request`);
  }
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  // (residual fix-up r1) main's onBattle returns the entry's settle (the solo entry's begin), which gives the Garage back
  assert.match(main, /\n {2}onBattle: \(specId, mapId, options, announce\) => \(\n\s+beginLocalBattleEntry\(specId, mapId, options, announce\)\n\s+\),/,
    "main's onBattle returns the entry's settle");
  assert.match(main, /\n {2}return soloBattleEntry\.begin\(specId, mapId, options, announcePress\);\n\}/, 'beginLocalBattleEntry returns it');
  assert.match(main, /\ngarage\.setDecorativeWorkGate\(\(\) => battleLoad\.covering\);/, "main's cover is the battle loader's");
  const onCouch = main.slice(main.indexOf('\n  onCouch: '), main.indexOf('\n  },', main.indexOf('\n  onCouch: ')));
  assert.match(onCouch, /openCouchWhenCurrent\(\{ ticket: request\.ticket, load: /, "main's onCouch opens through the helper");
  assert.doesNotMatch(onCouch, /console\.error/, 'and hands a failure to the press, not the console alone');
  assert.match(source, /const facetPanelToggle = createLazyPanelToggle\(garageScreen, \(\) => \{/,
    'the filter button is the lazy toggle (case 6 drives it)');
  // (integration IR3) loaders-workers' opener chunk sits under the toggle: a press after a failed load reloads the page
  // (components/loadFailure.ts) before it reaches the toggle
  assert.match(source, /facetToggle\.addEventListener\('click', \(\) => \{\n\s+emit\('ui:click', \{\}\);\n(?:\s+\/\/[^\n]*\n)?\s+if \(reloadsForFailure\(facetToggle, 'cot-facets-load', t\('loadFailed\.generic'\)\)\) return;\n\s+facetPanelToggle\.press\(\);\n\s+\}\);/,
    'and every press goes through it');
  assert.match(source, /const facetPanelToggle = createLazyPanelToggle\(garageScreen, \(\) => \{\n\s+const loading = facetPanel\.load\(\);/,
    'the toggle loads the opener chunk');
  assert.match(source, /onOpenChange: \(open\) => root\.classList\.toggle\('facets-open', open\),\n\s+\}\)\), \{ opener: true \}\);/,
    'the facet panel is an opener chunk (case 6 drives the toggle over one)');
  assert.match(source, /void loading\.then\(\(\) => \{\}, \(\) => reportLoadFailure\('cot-facets-load', /, 'whose failure marks the button');
  assert.match(source, /if \(!garageScreen\.interactive\) return;\n\s+if \(facetVisible\(selectedId\) \|\| vehicleLocked\) return;/,
    'the filter\'s auto-select never changes the selection after the Garage hid, nor under a start\'s loader (fix-up r1)');
  assert.match(source, /if \(battleMode === 'solo' && remembered && normalizeGameMode\(remembered\) !== battleGameMode\) setBattleGameMode\(remembered\);/,
    'a return to the Garage keeps a Private or LAN choice');
  assert.equal((source.match(/\.battle-word'\)\.textContent = battleWord\(\);/g) || []).length, 2,
    'the battle button\'s word has one rule (the room status), wherever it is written');
  assert.doesNotMatch(source, /\.battle-word'\)\.textContent = t\(/);
}

// 6. The roster filter's lazy toggle: a press while the panel loads means open (two impatient presses used to queue two
//    toggles and leave it closed), a press after the mount toggles, a hide during the load opens nothing, and after a
//    failed load the toggle goes back to idle (a loader that asks again then loads on the next press). In the Garage the
//    loader is loaders-workers' opener chunk, whose failure is kept: the last sub-case drives that wiring (the failure
//    marks the button, a second load asks nothing, and garage.ts's next press reloads the page, case 5).
{
  const panel = () => ({ isOpen: false, toggles: 0, toggle() { this.toggles += 1; this.isOpen = !this.isOpen; } });
  const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  {
    const screen = createGarageScreen();
    screen.show();
    const loads = [];
    const toggle = createLazyPanelToggle(screen, () => { const load = deferred(); loads.push(load); return load.promise; });
    assert.equal(toggle.phase, 'idle');
    toggle.press();
    toggle.press();
    assert.equal(loads.length, 1, 'one load however many presses come before the mount');
    assert.equal(toggle.phase, 'loading');
    const mounted = panel();
    loads[0].resolve(mounted);
    await flush();
    assert.equal(toggle.phase, 'mounted');
    assert.equal(mounted.isOpen, true, 'two presses during the load end open');
    assert.equal(mounted.toggles, 1);
    toggle.press();
    assert.equal(mounted.isOpen, false, 'a press after the mount toggles');
    toggle.press();
    assert.equal(mounted.isOpen, true);
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const load = deferred();
    const toggle = createLazyPanelToggle(screen, () => load.promise);
    toggle.press();
    screen.hide();
    const mounted = panel();
    load.resolve(mounted);
    await flush();
    assert.equal(mounted.isOpen, false, 'a load that lands after the Garage hid opens nothing');
    screen.show();
    assert.equal(mounted.isOpen, false, 'nor when the Garage comes back');
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const load = deferred();
    const toggle = createLazyPanelToggle(screen, () => load.promise);
    toggle.press();
    screen.hide();
    screen.show();
    toggle.press();
    const mounted = panel();
    load.resolve(mounted);
    await flush();
    assert.equal(mounted.isOpen, true, 'a press in the new span opens it');
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const loads = [];
    const toggle = createLazyPanelToggle(screen, () => { const load = deferred(); loads.push(load); return load.promise; });
    toggle.press();
    loads[0].reject(new Error('offline'));
    await flush();
    assert.equal(toggle.phase, 'idle', 'a failed load goes back to idle');
    assert.equal(toggle.panel, null);
    toggle.press();
    assert.equal(loads.length, 2, 'and the next press asks again');
    const mounted = panel();
    loads[1].resolve(mounted);
    await flush();
    assert.equal(mounted.isOpen, true);
  }
  {
    // (integration review r1) the Garage's wiring (garage.ts facetPanel / facetPanelToggle): the toggle over an opener
    // chunk (createLazyChunk { opener: true }), whose failure is terminal for the document
    const screen = createGarageScreen();
    screen.show();
    let imports = 0;
    const marks = [];
    const facetPanel = createLazyChunk(() => { imports += 1; return Promise.reject(new Error('offline')); },
      { opener: true, online: () => true, classify: () => Promise.resolve('transient') });
    const toggle = createLazyPanelToggle(screen, () => {
      const loading = facetPanel.load();
      void loading.then(() => {}, () => marks.push('cot-facets-load'));
      return loading;
    });
    toggle.press();
    await flush();
    assert.equal(imports, 1, 'one press imports once');
    assert.equal(toggle.phase, 'idle', 'the toggle goes back to idle');
    assert.equal(toggle.panel, null);
    assert.deepEqual(marks, ['cot-facets-load'], 'the failure reaches the button\'s mark (reportLoadFailure)');
    assert.equal(facetPanel.state, 'failed');
    assert.equal(facetPanel.terminal, true, 'the opener chunk keeps its failure');
    await assert.rejects(facetPanel.load(), /offline/, 'a second load returns the kept failure');
    assert.equal(imports, 1, 'without a second import');
    // garage.ts's click takes the next press to reloadsForFailure first (case 5); a press that reached the toggle asks nothing
    toggle.press();
    await flush();
    assert.equal(imports, 1, 'a press after the failure imports nothing');
    assert.equal(toggle.phase, 'idle');
    assert.equal(marks.length, 2, 'and marks the button again');
  }
}

// 7. (round 8 Y4 s3-03, review r2) The Couch press as garage.ts writes it, over stand-ins for its closure: a chunk that did
//    not arrive is the kit's failure (the button's mark, Reload page); a lobby that failed to open once loaded is logged
//    and leaves the button a press (before: every rejection marked the button "part of the game did not arrive", and its
//    next press reloaded the page, with no trace of the cause); a repeat press while one is in flight asks for nothing
//    more (round 8 Y4 residual: it is the press the load opens for; it used to be dropped).
{
  const source = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const couchHead = "  const setupCouch = requiredElement<HTMLButtonElement>(battleMenu, '[data-battle-couch]');\n";
  const pressCode = stripTypeScriptTypes(source.slice(source.indexOf(couchHead) + couchHead.length,
    source.indexOf("  setupCouch.addEventListener('click'")));
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  async function press(rejection) {
    const marks = [];
    const logged = [];
    const requests = [];
    const press = new Function('opts', 'setupCouch', 'selectedId', 'reloadsForFailure', 'reportLoadFailure', 't', 'fieldMapId',
      'battleGameMode', 'garageScreen', 'closeBattleMenu', 'launchBattle', 'CouchChunkError', 'console', 'createLazyOpener',
      `${pressCode}; return openCouch;`)(
      { onCouch: (request) => { requests.push(request); return Promise.reject(rejection); } },
      { disabled: false }, 'm1a2', () => false, (id) => marks.push(id), (key) => key, () => 'steppe', 'standard',
      { ticket: () => ({ epoch: 1, current: () => true }) }, () => {}, () => true, CouchChunkError,
      { error: (...args) => logged.push(['error', ...args]), warn: (...args) => logged.push(['warn', ...args]) },
      createLazyOpener);
    assert.equal(press(), true);
    // (round 8 Y4 residual) a repeat press while the chunks load is the press they open for (couchOpener.selftest drives
    // it after a hand-off); it asks for nothing more
    assert.equal(press(), true, 'a repeat press while the chunks load is taken');
    await flush();
    assert.equal(requests.length, 1, 'one request: the repeat press loads nothing again');
    return { marks, logged };
  }
  const chunk = await press(new CouchChunkError(new Error('offline')));
  assert.deepEqual(chunk.marks, ['cot-couch-load'], 'a failed chunk marks the button (Reload page)');
  assert.equal(chunk.logged.length, 1);
  assert.equal(chunk.logged[0][0], 'warn');
  const broken = new Error('the socket was refused');
  const open = await press(broken);
  assert.deepEqual(open.marks, [], 'a lobby that failed to open is not a failed chunk: the button stays a press');
  assert.equal(open.logged.length, 1);
  assert.equal(open.logged[0][0], 'error');
  assert.equal(open.logged[0][2], broken, 'and its cause reaches the console');
}

// 8. (round 8 Y4 fix-up r3) The Service Record as garage.ts writes it (openServiceRecord and closeServiceRecord, types
//    stripped, its chunk imports a deferred stand-in), over the real screen owner: a lazy opener like the others. Its own
//    revision lapsed only at a close, so a record press, then BATTLE (the hand-off) inside the record chunk's download,
//    opened the record's modal (z-index 10050) over the battle's loader (150) until the activation's hide closed it.
{
  const source = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const head = '  const isRecordOpen = () => ';
  const recordCode = stripTypeScriptTypes(source.slice(source.indexOf(head), source.indexOf('  const isMobileNavigationOpen = ')))
    .replace(/\bimport\(/g, '__load(');
  assert.ok(source.indexOf(head) > 0 && recordCode.includes('const openServiceRecord = async'), 'garage.ts holds the Service Record opener');
  // (round 8 Y4 residual) the record's state as garage.ts declares it, and its trigger's press as garage.ts wires it
  const stateHead = '  let serviceRecord: ';
  const stateCode = stripTypeScriptTypes(source.slice(source.indexOf(stateHead), source.indexOf('  const recordNames: ')));
  assert.ok(source.indexOf(stateHead) > 0, 'garage.ts holds the Service Record\'s state');
  const triggerHead = "  recordTrigger.addEventListener('click', () => {";
  const triggerCode = source.slice(source.indexOf(triggerHead), source.indexOf('\n  });\n', source.indexOf(triggerHead)) + 6);
  assert.ok(source.indexOf(triggerHead) > 0 && triggerCode.includes('if (isRecordOpen()) closeServiceRecord();'),
    'the record trigger toggles the record');
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  function recordPress(screen) {
    const opened = [];
    const marks = [];
    let release;
    const chunk = new Promise((resolve) => { release = resolve; });
    const dialog = { open: (trigger) => opened.push(trigger), close: () => {}, isOpen: () => opened.length > 0 };
    const recordTrigger = { setAttribute() {}, addEventListener(type, handler) { this.press = handler; } };
    const record = new Function('garageScreen', '__load', 'reloadsForFailure', 'recordTrigger', 't', 'closeGarageVariantMenu',
      'setGaragePanel', 'document', 'HTMLElement', 'recordNames', 'refreshServiceRecord', 'reportLoadFailure', 'emit',
      'createLazyOpener', `${stateCode}\n${recordCode}\n${triggerCode}\n`
      + 'return { openServiceRecord, closeServiceRecord, isRecordOpen };')(
      screen, (specifier) => (specifier === './serviceRecordDialog.ts' ? chunk : Promise.resolve({})), () => false,
      recordTrigger, (key) => key, () => {}, () => {}, { activeElement: null }, class {}, {}, () => {},
      (id) => marks.push(id), () => {}, createLazyOpener);
    const pressed = record.openServiceRecord('record-trigger');
    return { record, opened, marks, pressed, toggle: () => recordTrigger.press(),
      land: () => release({ createServiceRecordDialog: () => dialog }) };
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    assert.equal(press.record.isRecordOpen(), true, 'the press is in flight');
    screen.handOff(); // BATTLE, Watch, a campaign or room press, or a start launchBattle hands on
    press.land();
    await press.pressed;
    await flush();
    assert.deepEqual(press.opened, [], 'a record press handed on opens nothing over the loader (before: the record modal)');
    assert.deepEqual(press.marks, [], 'and is no failed chunk');
    assert.equal(press.record.isRecordOpen(), false, 'the press settled');
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    screen.hide();
    press.land();
    await press.pressed;
    assert.deepEqual(press.opened, [], 'nor over a hidden Garage');
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    press.toggle(); // (residual fix-up r1) the trigger's own second press, as garage.ts wires it: closeServiceRecord()
    assert.equal(press.record.isRecordOpen(), false, 'the trigger\'s second press reads as a close');
    press.land();
    await press.pressed;
    assert.deepEqual(press.opened, [],
      'a second press on the trigger while it loads still closes it (its close cancels the opener: recordOpener.cancel())');
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    press.land();
    await press.pressed;
    assert.deepEqual(press.opened, ['record-trigger'], 'a record landing over the Garage that asked opens once, on its trigger');
  }
  // (round 8 Y4 residual, review r4) pressed again inside the download, after a hand-off whose start did not follow (BATTLE
  // refused, a room menu closed: the Garage still shows). Before: the phone menu's press returned at the record's latch,
  // the trigger's closed a load the hand-off had already ended, and the record landed on the lapsed ticket: nothing
  // opened, and only a third press did. Now that press is the one the load opens for (createLazyOpener, case 1c).
  for (const again of ['the phone menu', 'the trigger']) {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    screen.handOff();
    if (again === 'the trigger') {
      assert.equal(press.record.isRecordOpen(), false, 'a press handed on no longer reads as opening: the trigger asks again');
    }
    const repeat = again === 'the phone menu' ? press.record.openServiceRecord('menu-trigger') : press.toggle();
    press.land();
    await press.pressed;
    await repeat;
    await flush();
    assert.equal(press.opened.length, 1,
      `the record pressed again from ${again} while it loads opens once it lands (before: nothing, and a third press opened it)`);
    if (again === 'the phone menu') assert.equal(press.opened[0], 'menu-trigger', 'on the newest press\'s trigger');
    assert.deepEqual(press.marks, []);
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    screen.handOff();
    const repeat = press.record.openServiceRecord('menu-trigger');
    screen.hide(); // the battle's activation
    press.land();
    await press.pressed;
    await repeat;
    assert.deepEqual(press.opened, [], 'the repeat press lapses at the hide: no record over the battle');
  }
  {
    const screen = createGarageScreen();
    screen.show();
    const press = recordPress(screen);
    press.toggle(); // the trigger's second press while it loads: close
    press.toggle(); // and its third: open again (before: a second close)
    press.land();
    await press.pressed;
    await flush();
    assert.equal(press.opened.length, 1, 'the trigger toggles the record while it loads: closed, then wanted again, it opens once');
  }
}

// 9. (round 8 Y4 residual, review r4) The tech tree as garage.ts writes it (openTechTree, types stripped, its chunks a
//    deferred stand-in) over the real screen owner: a press while the tree loads is the press it opens for. Before, its
//    in-flight latch dropped that press: after a hand-off lapsed the first press's ticket (BATTLE refused, a room menu
//    closed) the tree landed on the lapsed ticket and opened nothing, and only a third press opened it.
{
  const source = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const head = "  const techTreeTrigger = requiredElement<HTMLButtonElement>(root, '.cot-techtree-trigger');\n";
  const start = source.indexOf(head);
  const treeCode = stripTypeScriptTypes(source.slice(start + head.length,
    source.indexOf("  techTreeTrigger.addEventListener('click'", start))).replace(/\bimport\(/g, '__load(');
  assert.ok(start > 0 && treeCode.includes('const openTechTree = async'), 'garage.ts holds the tech tree opener');
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  function treePresses(screen) {
    const releases = [];
    const opened = [];
    const marks = [];
    const tree = { open: (opener) => opened.push(opener), close() {}, dispose() {} };
    const __load = (specifier) => (specifier === './techTree.ts'
      ? new Promise((resolve) => releases.push(() => resolve({ createTechTreeScreen: () => tree })))
      : specifier === './techTreeStrings.ts' ? Promise.resolve({ ensureTechTreeStrings: () => {} }) : Promise.resolve({}));
    const open = new Function('__load', 'reloadsForFailure', 'techTreeTrigger', 't', 'emit', 'closeMobileNavigation',
      'setGaragePanel', 'garageScreen', 'heroCardChunk', 'specById', 'selectedId', 'applySelection', 'onSelect',
      'reportLoadFailure', 'root', 'createLazyOpener', `${treeCode}\nreturn openTechTree;`)(
      __load, () => false, { setAttribute() {} }, (key) => key, () => {}, () => {}, () => {}, screen,
      { load: () => Promise.resolve() }, new Map(), 'm1a2', () => true, () => {}, (id) => marks.push(id),
      { querySelector: () => null }, createLazyOpener);
    return { open, opened, releases, marks };
  }
  for (const variant of ['pressed again', 'handed on', 'pressed again, then hidden', 'pressed twice']) {
    const screen = createGarageScreen();
    screen.show();
    const tree = treePresses(screen);
    const presses = [tree.open('bar-trigger')];
    await flush();
    if (variant !== 'pressed twice') screen.handOff(); // BATTLE refused, or a room menu closed: the Garage still shows
    if (variant !== 'handed on') presses.push(tree.open('menu-trigger'));
    await flush();
    assert.equal(tree.releases.length, 1, `one download however many presses come before it lands (${variant})`);
    if (variant === 'pressed again, then hidden') screen.hide(); // the battle's activation
    tree.releases[0]();
    await Promise.all(presses);
    await flush();
    assert.deepEqual(tree.marks, []);
    if (variant === 'handed on' || variant === 'pressed again, then hidden') {
      assert.deepEqual(tree.opened, [], `no tree over the loader or the battle (${variant})`);
      continue;
    }
    assert.deepEqual(tree.opened, ['menu-trigger'],
      `the tree pressed again while it loads opens once it lands, on the newest press's opener (${variant}; before: nothing after a hand-off, and a third press opened it)`);
  }
}

// 10. (round 8 Y4 residual fix-up r1, review res-r1) The Garage's keys and lazy openers under a start it handed on, as
//     garage.ts writes them (launchBattle, openTechTree and onKey, types stripped, over the real screen owner; the last
//     sub-cases hand the start to the real solo entry runtime, as main.ts's onBattle does). The hand-off kept the Garage
//     'open' under the battle's loader until the activation's hide, with onKey still registered: T under the loader took a
//     live ticket (and, since the residual, revived a tree download in flight), so the tree opened over the loader; B, F,
//     the arrows and the rest acted on the Garage under it. A held key repeated its action per auto-repeat (a held T
//     sounded the tree's click per keydown while it loaded; F, I and R flipped their toggles at the repeat rate).
//     (residual fix-up r2, review res-r2) (a) and (f) also press ticks later with the entry in flight and no cover over
//     the Garage (in (f) refused, while the entry waits on a Garage return, before its loader): the Garage stays not the
//     player's until the entry settles, not for one tick (only case 5's pin caught an early asynchronous give-back).
{
  const source = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const garageFunction = (head) => {
    const start = source.indexOf(head);
    assert.ok(start > 0, `garage.ts holds ${head.trim()}`);
    return source.slice(start, source.indexOf('\n  }\n', start) + 4);
  };
  const treeHead = "  const techTreeTrigger = requiredElement<HTMLButtonElement>(root, '.cot-techtree-trigger');\n";
  const treeStart = source.indexOf(treeHead);
  const treeCode = source.slice(treeStart + treeHead.length, source.indexOf("  techTreeTrigger.addEventListener('click'", treeStart))
    .replace(/\bimport\(/g, '__load(');
  const launchCode = garageFunction('  function launchBattle(');
  const keyCode = garageFunction('  function onKey(e: KeyboardEvent): void {');
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  // (residual fix-up r2, review res-r2) a key under the loader arrives in the browser tasks after the press: microtasks,
  // immediates and a timer later (so a give-back that runs a microtask, an immediate or a 0 ms timer after the press,
  // instead of at the entry's settle, has run by then; timers fire in expiry order, so the 2 ms wait comes after it)
  const ticksLater = async () => { await flush(); await flush(); await flush(); await new Promise((resolve) => setTimeout(resolve, 2)); };
  const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
  /** garage.ts's own three over the given screen; `onBattle` is the entry the start is handed to. */
  function garageKeys({ screen, onBattle }) {
    const calls = [];
    const opened = [];
    const releases = [];
    const techTreeTrigger = { setAttribute() {} };
    const tree = { open: (opener) => opened.push(opener), close() {}, dispose() {} };
    const scope = {
      garageScreen: screen, api: { get isOpen() { return screen.isOpen; } }, onBattle, opts: { refusesBattle: () => false },
      pressFailed: () => false, battleBtn: {}, battleGameMode: 'standard', emit: (event) => calls.push(`emit:${event}`),
      __load: (specifier) => (specifier === './techTree.ts'
        ? new Promise((resolve) => releases.push(() => resolve({ createTechTreeScreen: () => tree })))
        : specifier === './techTreeStrings.ts' ? Promise.resolve({ ensureTechTreeStrings: () => {} }) : Promise.resolve({})),
      reloadsForFailure: () => false, techTreeTrigger, t: (key) => key, closeMobileNavigation: () => calls.push('tree'),
      setGaragePanel: () => {}, heroCardChunk: { load: () => Promise.resolve() }, specById: new Map(), selectedId: 'm1a2',
      applySelection: () => true, onSelect: () => {}, reportLoadFailure: (id) => calls.push(`failed:${id}`),
      root: { querySelector: () => null }, createLazyOpener,
      eventElement: (event) => event.target ?? null, eqOpenSlot: -1, openGaragePanel: () => '', containModalTab: () => {},
      battleMenu: { classList: { contains: () => false } }, rosterSearchInput: { focus: () => calls.push('search') },
      document: { body: { dataset: { cotPanels: 'persistent' } } }, station: 'armor',
      GARAGE_STATIONS: [['overview'], ['armor'], ['mobility'], ['firepower'], ['camo']],
      setStation: (id) => calls.push(`station:${id}`), openBattleMenu: () => calls.push('deploy'),
      openSelectedInGallery: () => calls.push('gallery'), toggleFavourite: () => calls.push('favourite'), photo: {},
      openPhoto: () => calls.push('photo'), setCallouts: () => calls.push('callouts'), calloutsShown: false,
      recordTrigger: { click: () => calls.push('record') }, openDocs: () => calls.push('docs'), deployModes: null,
      step: (dir) => calls.push(`step:${dir}`), stepToEnd: () => calls.push('end'), battle: () => calls.push('battle'),
    };
    const garage = runMainStatements([treeCode, launchCode, keyCode], scope, '{ openTechTree, launchBattle, onKey }');
    const key = (code, { repeat = false } = {}) => {
      const event = { code, key: code === 'Slash' ? '/' : '', repeat, target: null, metaKey: false, ctrlKey: false,
        altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      garage.onKey(event);
      return event;
    };
    const land = async () => { await flush(); for (const release of releases.splice(0)) release(); await flush(); await flush(); };
    return { ...garage, key, calls, opened, releases, techTreeTrigger, land };
  }
  const EVERY_KEY = ['KeyT', 'KeyB', 'KeyV', 'KeyF', 'KeyP', 'KeyI', 'KeyR', 'F1', 'Slash', 'Digit2', 'KeyG', 'ArrowRight', 'Enter'];

  // (a) T pressed (the tree's download in flight), then BATTLE whose start proceeds (the entry loads under its loader),
  //     then T again under the loader, every other key, and the trigger's own press (a focused trigger's Enter); the
  //     download lands; the activation hides the Garage and the start settles after it.
  for (const renew of [true, false]) {
    const label = renew ? 'pressed before BATTLE and again under the loader' : 'pressed only under the loader';
    const screen = createGarageScreen();
    screen.show();
    const entry = deferred();
    const garage = garageKeys({ screen, onBattle: () => entry.promise });
    if (renew) {
      garage.key('KeyT');
      await flush();
      assert.deepEqual(garage.calls, ['emit:ui:click', 'tree'], 'T opens the tree on the open Garage (its download in flight)');
    }
    assert.equal(garage.launchBattle('m1a2', 'steppe'), true, 'BATTLE hands the start on');
    garage.calls.length = 0;
    garage.key('KeyT');
    assert.deepEqual(garage.calls, [], `T under the loader does nothing (${label}; before: it reached the tree's opener)`);
    for (const code of EVERY_KEY) garage.key(code);
    assert.deepEqual(garage.calls, [], 'no Garage key acts under the loader (before: Deploy, the favourite, the record, a tank step...)');
    // (residual fix-up r2, review res-r2) and ticks later, as a key under the loader arrives in the browser, with the
    // entry still in flight and nothing over the Garage (this screen reads no cover): only the start in flight holds its
    // keys (a give-back that ran before the entry settled let them act here; the presses above, in the press's own
    // task, could not see it)
    await ticksLater();
    for (const code of EVERY_KEY) garage.key(code);
    assert.deepEqual(garage.calls, [], `no Garage key acts ticks later while the start is in flight (${label})`);
    assert.equal(screen.phase, 'entering', `the Garage waits out the start in flight, ticks after its press (${label})`);
    void garage.openTechTree(garage.techTreeTrigger); // the trigger's own press reached under the loader
    await garage.land();
    assert.deepEqual(garage.opened, [], `no tree over the loader (${label}; before: it opened when its download landed)`);
    assert.deepEqual(garage.calls.filter((call) => call.startsWith('failed:')), []);
    screen.hide(); // the activation (soloBattleStartRuntime.ts ui.hideGarage)
    entry.resolve();
    await flush();
    assert.equal(screen.phase, 'hidden', 'the start settles after its activation: nothing given back');
  }

  // (b) the start ends with the Garage still showing (refused after its hand-off, or failed before its activation): the
  //     Garage is the player's again, and T opens the tree. (c) an entry that returns no settle: the player's at once.
  for (const settles of [true, false]) {
    const screen = createGarageScreen();
    screen.show();
    const entry = deferred();
    const garage = garageKeys({ screen, onBattle: () => (settles ? entry.promise : undefined) });
    assert.equal(garage.launchBattle('m1a2', 'steppe'), true);
    if (settles) {
      garage.key('KeyT');
      assert.deepEqual(garage.calls.filter((call) => call === 'tree'), [], 'T waits out the start in flight');
      entry.resolve();
      await flush();
    }
    assert.equal(screen.phase, 'open', settles ? 'a start refused gives the Garage back' : 'an entry with no settle hands nothing on');
    garage.key('KeyT');
    await garage.land();
    assert.deepEqual(garage.opened, [garage.techTreeTrigger], 'then T opens the tree');
  }

  // (d) a network round's loader, which the Garage does not raise (the room's match start; activationRuntime.ts hides the
  //     Garage only at its activation): main's battle-loader gate covers it the same way.
  {
    let covered = false;
    const screen = createGarageScreen({ covered: () => covered });
    screen.show();
    const garage = garageKeys({ screen, onBattle: () => undefined });
    covered = true;
    for (const code of EVERY_KEY) garage.key(code);
    void garage.openTechTree(garage.techTreeTrigger);
    assert.deepEqual(garage.calls.filter((call) => call !== 'tree' && call !== 'emit:ui:click'), [],
      'no Garage key acts under a network round\'s loader');
    await garage.land();
    assert.deepEqual(garage.opened, [], 'and no tree opens over it');
    covered = false;
    garage.calls.length = 0;
    garage.key('KeyT');
    await garage.land();
    assert.deepEqual(garage.opened, [garage.techTreeTrigger], 'the lifted cover gives the keys back');
  }

  // (e) a held key: its auto-repeat is not another press. The arrows still step per repeat (holding one runs the strip).
  {
    const screen = createGarageScreen();
    screen.show();
    const garage = garageKeys({ screen, onBattle: () => undefined });
    garage.key('KeyT');
    for (let i = 0; i < 11; i += 1) garage.key('KeyT', { repeat: true }); // T held through the tree's download
    await garage.land();
    assert.equal(garage.calls.filter((call) => call === 'emit:ui:click').length, 1,
      'a held T sounds one click (before: one per auto-repeat while the tree loaded)');
    assert.deepEqual(garage.opened, [garage.techTreeTrigger], 'and opens the tree once');
    for (const [code, action] of [['KeyB', 'deploy'], ['KeyV', 'gallery'], ['KeyF', 'favourite'], ['KeyP', 'photo'],
      ['KeyI', 'callouts'], ['KeyR', 'record'], ['F1', 'docs'], ['Enter', 'battle']]) {
      garage.calls.length = 0;
      const first = garage.key(code);
      garage.key(code, { repeat: true });
      const repeat = garage.key(code, { repeat: true });
      assert.equal(garage.calls.filter((call) => call === action).length, 1, `a held ${code} acts once (before: per auto-repeat)`);
      assert.equal(repeat.defaultPrevented, first.defaultPrevented, `and its repeat's default stays as the press's (${code})`);
    }
    garage.calls.length = 0;
    garage.key('ArrowRight');
    garage.key('ArrowRight', { repeat: true });
    assert.deepEqual(garage.calls, ['step:1', 'step:1'], 'a held arrow still steps per repeat');
  }

  // (f) the start handed to the real solo entry runtime (main.ts: onBattle -> beginLocalBattleEntry -> soloBattleEntry.begin):
  //     accepted (the activation hides the Garage mid-load, the entry settles after the reveal), refused after a Garage
  //     return's wait (a scene no battle may take), and failed before its activation (the recovery's return shows it).
  for (const outcome of ['accepted', 'refused', 'failed']) {
    const screen = createGarageScreen();
    screen.show();
    const returning = deferred();
    const load = deferred();
    const events = [];
    let refuse = false;
    const entry = createSoloBattleEntryRuntime({
      lifecycle: createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 }),
      loading: { begin: () => { events.push('load'); return load.promise; } },
      battleLoad: { showPending: () => events.push('cover'), hide: async () => { events.push('uncover'); } },
      audio: { loadingOn() {} },
      enterGarage: () => { screen.show(); events.push('garage'); },
      nextFrame: async () => {},
      isVisibleSpecId: () => true, getSelectedSpecId: () => 'm1a2', getSelectedMapId: () => 'steppe',
      reportError: () => {},
      whenGarageSettled: () => (outcome === 'refused' ? returning.promise : null),
      canTakeScene: () => !refuse,
      presentSceneRefusal: () => events.push('refusal notice'),
      presentFailure: () => events.push('failure notice'),
    });
    const garage = garageKeys({ screen, onBattle: (specId, mapId, options, announce) => entry.begin(specId, mapId, options, announce) });
    assert.equal(garage.launchBattle('m1a2', 'steppe'), true);
    garage.key('KeyT');
    assert.deepEqual(garage.calls.filter((call) => call === 'tree'), [], `T does nothing while the entry runs (${outcome})`);
    // (residual fix-up r2, review res-r2) and ticks later, the entry still in flight. The refused start still waits on
    // the Garage return, before its cover (showPending): the span only the start in flight guards, since main's battle
    // loader is not up yet. The others load under their cover (this screen reads none, so the start in flight alone
    // holds the keys here too). Every key, then the trigger's own press, whose download lands before the start ends.
    await ticksLater();
    assert.deepEqual(events, outcome === 'refused' ? [] : ['cover', 'load'],
      outcome === 'refused' ? 'the entry waits on the Garage return, uncovered' : `the entry loads (${outcome})`);
    garage.calls.length = 0;
    for (const code of EVERY_KEY) garage.key(code);
    assert.deepEqual(garage.calls, [], outcome === 'refused'
      ? 'no Garage key acts while the entry waits on the Garage return (its start then refused)'
      : `no Garage key acts ticks later while the entry runs (${outcome})`);
    void garage.openTechTree(garage.techTreeTrigger);
    await garage.land();
    assert.deepEqual(garage.opened, [], `and no tree opens while it runs (${outcome})`);
    assert.equal(screen.phase, 'entering', `the Garage waits out the entry in flight (${outcome})`);
    if (outcome === 'accepted') {
      screen.hide(); // soloBattleStartRuntime.ts startBattle: ui.hideGarage(), mid-load
      load.resolve();
    } else if (outcome === 'refused') {
      refuse = true; // a Studio opened meanwhile, a failed return that owes the Garage
      returning.resolve();
    } else load.reject(new Error('the battlefield did not load'));
    await flush();
    await flush();
    if (outcome === 'accepted') {
      assert.equal(screen.phase, 'hidden', 'an accepted start gives nothing back after its activation');
      continue;
    }
    assert.ok(events.includes(outcome === 'refused' ? 'refusal notice' : 'failure notice'), `the entry ${outcome}`);
    assert.equal(screen.phase, 'open', `the Garage is the player's again once the start ${outcome}`);
    garage.calls.length = 0;
    garage.key('KeyT');
    await garage.land();
    assert.deepEqual(garage.opened, [garage.techTreeTrigger], `T opens the tree after the start ${outcome}`);
  }
}

console.log('garageOpenState.selftest: one open state, lapsing tickets, the hand-off, a start in flight, one ready wait, the consumables wait, the filter lazy toggle, the Garage wiring, the Couch press, the Service Record, the latched openers\' newest press, the keys under a loader PASS');
