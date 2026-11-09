// 2026-11-02 audit F5: the Garage screen's one open-state owner (garageScreen.ts), the epoch its lazy openers check, the
// shared ready wait (gameReady.ts), the consumables picker's declared wait, and garage.ts routed through them. The
// browser hazards themselves (a cold Deploy opening over a battle, a picker's Tab trap under a hidden Garage) need a page:
// the owners are driven here, and the Garage's wiring is pinned in its source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGarageScreen, createLazyPanelToggle } from './garageScreen.ts';
import { createGameReadyWaiter } from './gameReady.ts';
import { createBootReadiness } from '../app/bootReadiness.ts';
import { CONSUMABLES_PICKER_CLOSED, nextConsumablesPicker } from './garageConsumables.ts';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import { stripTypeScriptTypes } from 'node:module';
import { createLazyChunk } from '../app/lazyChunk.ts';

// (dynamic: a base without it fails by assertion, case 1b, not at link time)
const { CouchChunkError } = await import('../app/couchOpener.ts').catch(() => ({}));

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
  assert.match(source, /if \(!ticket\.current\(\)\) return;\n      const screen = createTechTreeScreen/, 'so does the tech tree');
  assert.match(source, /if \(!ticket\.current\(\) \|\| battleMenu\.classList\.contains\('open'\)\) return;\n      closePhoto = openPhotoMode/,
    'and photo mode');
  assert.match(source, /if \(!quickMenus \|\| !ticket\.current\(\)\) return;/, 'and the quick menus');
  assert.match(source, /customCamoStudioAccess\?\.open\(garageScreen\.ticket\(\)\.current\)/, 'and the custom camo studio');
  // (round 8 Y4 s3-03) and the couch lobby: the press hands the Garage's ticket and its button (the modal's trigger, so
  // the hide's closeSurfacesWithin takes an in-time lobby), a repeat press while the chunks load does nothing, a failed
  // chunk is the kit's failure; main's onCouch opens through the one helper (couchOpener.selftest drives it)
  const couchPress = source.slice(source.indexOf('const openCouch = ('), source.indexOf("setupCouch.addEventListener('click'"));
  assert.ok(couchPress.length > 0, 'the Couch press is one function (before: an inline handler with no ticket)');
  assert.match(couchPress, /if \(couchOpening \|\| [^\n]*\) return false;/, 'an in-flight latch');
  assert.match(couchPress, /reloadsForFailure\(setupCouch, 'cot-couch-load', /, 'a press after a failed chunk reloads the page');
  assert.match(couchPress, /ticket: garageScreen\.ticket\(\), trigger: setupCouch,/, 'the ticket and the trigger');
  assert.match(couchPress, /reportLoadFailure\('cot-couch-load', /, 'a failed chunk marks the button');
  // (review r2) the press's failure policy runs as written (case 7 drives it): only a CouchChunkError marks the button
  assert.match(couchPress, /if \(!\(error instanceof CouchChunkError\)\) \{ console\.error\('\[couch\] the lobby failed to open', error\); return; \}/,
    'a lobby that failed to open once loaded is logged, not a failed chunk');
  // (review r2) every press that hands the player on from the Garage ends the lazy openers' tickets while it still shows:
  // the start launchBattle hands on, and the BATTLE/Watch, campaign and room presses before their play request
  const launch = source.slice(source.indexOf('  function launchBattle('), source.indexOf('\n  }\n', source.indexOf('  function launchBattle(')));
  assert.ok(launch.indexOf('if (refused) return false;') < launch.indexOf('garageScreen.handOff();'),
    'a refused press hands nothing on');
  assert.match(launch, /garageScreen\.handOff\(\);\n    onBattle\(specId, mapId, options, announce\);/, 'the start handed on hands the Garage on');
  for (const [name, head] of [['the BATTLE and Watch press', '  function battle('], ['the campaign press', '  function deployCampaign('],
    ['the room press', '  function openMultiplayer(']]) {
    const body = source.slice(source.indexOf(head), source.indexOf('\n  }\n', source.indexOf(head)));
    assert.ok(body.length > 0, `garage.ts holds ${name}`);
    const handOff = body.indexOf('garageScreen.handOff();');
    const request = body.search(/opts\.onPlayRequest(?:\?\.)?\(\{/);
    assert.ok(handOff > 0 && request > handOff, `${name} hands the player on before its play request`);
  }
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
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
  assert.match(source, /if \(!garageScreen\.isOpen\) return;\n\s+if \(facetVisible\(selectedId\) \|\| vehicleLocked\) return;/,
    'the filter\'s auto-select never changes the selection after the Garage hid');
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
//    next press reloaded the page, with no trace of the cause); a repeat press while one is in flight does nothing.
{
  const source = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const pressCode = stripTypeScriptTypes(source.slice(source.indexOf('  let couchOpening = false;'),
    source.indexOf("  setupCouch.addEventListener('click'")));
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  async function press(rejection) {
    const marks = [];
    const logged = [];
    const requests = [];
    const press = new Function('opts', 'setupCouch', 'selectedId', 'reloadsForFailure', 'reportLoadFailure', 't', 'fieldMapId',
      'battleGameMode', 'garageScreen', 'closeBattleMenu', 'launchBattle', 'CouchChunkError', 'console',
      `${pressCode}; return openCouch;`)(
      { onCouch: (request) => { requests.push(request); return Promise.reject(rejection); } },
      { disabled: false }, 'm1a2', () => false, (id) => marks.push(id), (key) => key, () => 'steppe', 'standard',
      { ticket: () => ({ epoch: 1, current: () => true }) }, () => {}, () => true, CouchChunkError,
      { error: (...args) => logged.push(['error', ...args]), warn: (...args) => logged.push(['warn', ...args]) });
    assert.equal(press(), true);
    assert.equal(press(), false, 'a repeat press while the chunks load does nothing');
    await flush();
    assert.equal(requests.length, 1);
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

console.log('garageOpenState.selftest: one open state, lapsing tickets, the hand-off, one ready wait, the consumables wait, the filter lazy toggle, the Garage wiring, the Couch press PASS');
