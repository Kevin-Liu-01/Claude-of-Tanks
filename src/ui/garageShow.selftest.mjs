// garageShow.selftest.mjs — what garage.ts's show() does with the boot splash and with surfaces a battle left open
// (2026-11-02 audit F5, round 2: U24).
// - The boot cover. A first show() hides the Garage under the boot splash (`awaiting-boot`, visibility:hidden) until the
//   splash's cot:boot-dismiss. bootScreen.ts dismiss() fires that event, then fades the splash (cot-boot-out) and drops
//   it 620 ms later, so a first show inside the fade (a Studio boot left in that window, a staging call) armed a
//   reveal that had already happened: the Garage stayed invisible for the session. show()'s own block runs here on a
//   stand-in document, across the splash's three moments.
// - The return sweep. A surface the battle left open under its hidden HUD (the touch ammo rack, the ally picker) kept its
//   place on the surface stack and took the Garage's first Escape or outside press: only a resize swept it. show() now
//   sweeps before the Garage is laid out. The stack's sweep runs here on stand-ins; show()'s call is pinned in its source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { closeSurface, openSurface, openSurfaceIds, sweepHiddenSurfaces } from './components/surfaceStack.ts';

const garage = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
const showStart = garage.indexOf('    show(selected = selectedId) {');
const show = garage.slice(showStart, garage.indexOf('    /** Close the garage screen. */', showStart));
assert.ok(showStart > 0 && show.length > 0, 'garage.ts holds show()');

const failures = [];
function check(name, body) {
  try { body(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}

// show()'s boot-cover block, as written, over a stand-in document
const coverStart = show.indexOf('      const firstPresentation = ');
const coverEnd = show.indexOf('      // The first Garage is already revealed');
assert.ok(coverStart > 0 && coverEnd > coverStart, 'show() holds the boot-cover block');
const cover = new Function('garageScreen', 'root', 'document', stripTypeScriptTypes(show.slice(coverStart, coverEnd)));

const classes = () => {
  const set = new Set();
  return { set, add: (name) => set.add(name), remove: (name) => set.delete(name), contains: (name) => set.has(name) };
};
/** A document with the boot splash at one of its moments: 'covering', 'fading' (dismissed, cot-boot-out) or 'gone'. */
function page(moment) {
  const splash = moment === 'gone' ? null : { id: 'cot-boot', classList: classes() };
  if (moment === 'fading') splash.classList.add('cot-boot-out');
  const listeners = [];
  const matches = (selector) => {
    if (!splash) return false;
    const [, id, without] = /^#([\w-]+)(?::not\(\.([\w-]+)\))?$/.exec(selector) ?? [];
    return id === splash.id && (!without || !splash.classList.contains(without));
  };
  return {
    listeners,
    getElementById: (id) => (splash && id === splash.id ? splash : null),
    querySelector: (selector) => (matches(selector) ? splash : null),
    addEventListener: (type, listener) => listeners.push({ type, listener }),
    dismiss() {
      for (const { type, listener } of listeners.splice(0)) if (type === 'cot:boot-dismiss') listener();
      splash?.classList.add('cot-boot-out');
    },
  };
}
const firstShow = (doc, phase = 'unpresented') => {
  const root = { classList: classes() };
  cover({ phase }, root, doc);
  return root;
};

check('a first show under the splash waits for its dismiss', () => {
  const doc = page('covering');
  const root = firstShow(doc);
  assert.equal(root.classList.contains('awaiting-boot'), true, 'the Garage waits under the splash');
  doc.dismiss();
  assert.equal(root.classList.contains('awaiting-boot'), false, 'and shows as the splash fades');
});
check('a first show inside the splash\'s fade shows the Garage', () => {
  const doc = page('fading'); // dismiss() already fired cot:boot-dismiss; the splash leaves in 620 ms
  const root = firstShow(doc);
  assert.equal(root.classList.contains('awaiting-boot'), false,
    'the Garage stayed visibility:hidden for the session (a reveal that had already happened)');
  assert.equal(doc.listeners.length, 0, 'and no listener waits for a dismiss that will not come');
});
check('a first show after the splash shows the Garage', () => {
  const root = firstShow(page('gone'));
  assert.equal(root.classList.contains('awaiting-boot'), false);
});
check('a later show never waits for the splash', () => {
  const root = firstShow(page('covering'), 'hidden');
  assert.equal(root.classList.contains('awaiting-boot'), false);
});

// the return sweep: a battle surface under the hidden HUD leaves the stack when the Garage comes back
check('the return sweeps the battle\'s hidden surfaces', () => {
  const closed = [];
  const surface = (id, shows) => {
    const s = { id, element: () => ({ getClientRects: () => (shows() ? [{ width: 1 }] : []), contains: () => false }),
      close: (reason) => { closed.push(`${id}:${reason}`); closeSurface(s); } };
    return s;
  };
  let hudShows = true;
  const ammoRack = surface('hud-ammo-rack', () => hudShows);
  const settingsSheet = surface('settings', () => true);
  openSurface(ammoRack, null);
  hudShows = false; // the battle ended with the rack open: hideHud() hid it, the stack kept it
  assert.deepEqual(openSurfaceIds(), ['hud-ammo-rack'], 'the rack keeps its place under the hidden HUD');
  sweepHiddenSurfaces();
  assert.deepEqual(openSurfaceIds(), [], 'the sweep takes it off the stack');
  assert.deepEqual(closed, ['hud-ammo-rack:replace'], 'as a replacement: no focus goes back into the battle');
  openSurface(settingsSheet, null);
  sweepHiddenSurfaces();
  assert.deepEqual(openSurfaceIds(), ['settings'], 'a surface that shows stays');
  closeSurface(settingsSheet);
  // and show() runs that sweep before it lays the Garage out (the battle's surfaces are hidden by then: the return's
  // showGarageScreen runs hideHud() first, garageReturnRuntime.ts)
  const sweepAt = show.indexOf('sweepHiddenSurfaces();');
  assert.ok(sweepAt > 0, 'show() sweeps the stack');
  assert.ok(sweepAt < show.indexOf("root.style.display = 'block';"), 'while the Garage is still display:none');
});

assert.deepEqual(failures, [], `garageShow.selftest: ${failures.length} case(s) failed`);
console.log('garageShow.selftest: a first show waits under the splash only while it covers; the return sweeps the battle\'s hidden surfaces PASS');
