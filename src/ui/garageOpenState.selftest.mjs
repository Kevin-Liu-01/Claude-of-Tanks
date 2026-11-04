// 2026-11-02 audit F5: the Garage screen's one open-state owner (garageScreen.ts), the epoch its lazy openers check, the
// shared ready wait (gameReady.ts), the consumables picker's declared wait, and garage.ts routed through them. The
// browser hazards themselves (a cold Deploy opening over a battle, a picker's Tab trap under a hidden Garage) need a page:
// the owners are driven here, and the Garage's wiring is pinned in its source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGarageScreen, createLazyPanelToggle } from './garageScreen.ts';
import { createGameReadyWaiter } from './gameReady.ts';
import { CONSUMABLES_PICKER_CLOSED, nextConsumablesPicker } from './garageConsumables.ts';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

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

// 2. The shared ready wait: one poll for every waiter, ready runs each once, a halted boot ends the wait.
{
  const timers = [];
  let ready = false;
  let halted = false;
  const waiter = createGameReadyWaiter({
    isReady: () => ready,
    hasFailed: () => halted,
    schedule: (callback, delayMs) => { const handle = { callback, delayMs }; timers.push(handle); return handle; },
    cancel: (handle) => { const at = timers.indexOf(handle); if (at >= 0) timers.splice(at, 1); },
  });
  const ran = [];
  waiter.whenReady(() => ran.push('gallery'));
  waiter.whenReady(() => ran.push('deploy'));
  const cancelHotspots = waiter.whenReady(() => ran.push('hotspots'));
  assert.equal(timers.length, 1, 'three waiters share one poll (the Garage ran four chains)');
  cancelHotspots();
  timers.shift().callback();
  assert.equal(timers.length, 1);
  ready = true;
  timers.shift().callback();
  assert.deepEqual(ran, ['gallery', 'deploy']);
  assert.equal(timers.length, 0, 'the poll ends once the game is playable');
  waiter.whenReady(() => ran.push('late'));
  assert.deepEqual(ran.at(-1), 'late', 'a waiter after ready runs at once');
  assert.equal(waiter.state, 'ready');

  ready = false;
  const failing = createGameReadyWaiter({
    isReady: () => ready,
    hasFailed: () => halted,
    schedule: (callback, delayMs) => { const handle = { callback, delayMs }; timers.push(handle); return handle; },
    cancel: () => {},
    pollMs: 100,
    slowAfterMs: 300,
    slowPollMs: 1000,
  });
  failing.whenReady(() => ran.push('never'));
  for (let i = 0; i < 3; i++) timers.shift().callback();
  assert.equal(timers.at(-1).delayMs, 1000, 'a stalled boot keeps one slow poll');
  halted = true;
  timers.shift().callback();
  assert.equal(failing.state, 'failed');
  assert.equal(timers.length, 0, 'a halted boot stops the poll: a terminal state, not a chain for the session');
  failing.whenReady(() => ran.push('never'));
  assert.equal(timers.length, 0);
  assert.equal(ran.includes('never'), false);
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

console.log('garageOpenState.selftest: one open state, lapsing tickets, one ready wait, the consumables wait, the filter lazy toggle, the Garage wiring PASS');
