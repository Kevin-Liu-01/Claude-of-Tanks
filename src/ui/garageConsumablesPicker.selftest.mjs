// garageConsumablesPicker.selftest.mjs — the Garage's consumables picker, its real code on a stand-in DOM (2026-11-02
// audit F5 and 05-ui-2 #6, round 2: U24).
// - The wait for the smoke table. The first open waits for the auxiliary inventory (a large generated table) and stands
//   on the surface stack meanwhile, so Escape, a press outside, another surface or the Garage's hide dismiss it. Its box
//   was the picker's panel, which is display:none until it opens, so any resize or layout sweep took a box with no client
//   rects for a hidden surface and dismissed the press without a word: the player's press did nothing.
// - A tank change. Choosing another tank redraws the slots, but the open picker kept the old tank's cards and locks over
//   the new tank's slots (display-only: the save is sanitized for the new tank, game/consumableLoadout.ts). The picker
//   now closes when the tank it shows is no longer the shown one, as the equipment picker's refreshEquipSel does.
// - The room's hold. A tank the room holds (the player is ready) closes the picker, as it closes the equipment's: a
//   choice would save over the held tank. Only the hold: garage.ts's setRoomStatus runs on every lobby update (a member
//   joins, readies or picks a tank), and the round-2 review found its first close ran on all of them, shutting an open
//   picker mid-choice. Case 4 runs garage.ts's own setRoomStatus in a vm, with this picker as its garageConsumables.
// The stand-in elements remember classes, data and listeners; a box has client rects only while it shows (the panel
// with its `open` class, the band of slots always). The surface stack and the table import are the real ones.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.hidden = false;
    this.tabIndex = 0;
    this.textContent = '';
    this.value = '';
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.parentElement = null;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.queried = new Map();
    this.clientWidth = 0;
    this.scrollLeft = 0;
    this.offsetLeft = 0;
    this.shows = () => true;
    const names = new Set();
    this.classList = {
      add: (...list) => { for (const name of list) names.add(name); },
      remove: (...list) => { for (const name of list) names.delete(name); },
      toggle: (name, force) => { const on = force ?? !names.has(name); if (on) names.add(name); else names.delete(name); return on; },
      contains: (name) => names.has(name),
    };
    this._html = '';
  }
  set innerHTML(html) { this._html = html; this.queried.clear(); this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, force) { const on = force ?? !this.attributes.has(name); if (on) this.attributes.set(name, ''); else this.attributes.delete(name); return on; }
  adopt(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...nodes) { for (const node of nodes) if (node instanceof FakeElement) this.adopt(node); }
  prepend(...nodes) { this.append(...nodes); }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement = null; }
  querySelector(selector) {
    if (!this.queried.has(selector)) {
      const child = new FakeElement('div');
      child.selector = selector;
      const slot = /\.csslot\[data-slot="(\d+)"\]/.exec(selector);
      if (slot) child.dataset.slot = slot[1];
      this.queried.set(selector, this.adopt(child));
    }
    return this.queried.get(selector);
  }
  querySelectorAll() { return []; }
  closest(selector) { return this.selector && selector === '.csslot' && this.selector.startsWith('.csslot') ? this : null; }
  contains(node) { for (let at = node; at; at = at.parentElement) if (at === this) return true; return false; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
  focus() { globalThis.document.activeElement = this; }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; }
  getClientRects() { return this.shows() ? [this.getBoundingClientRect()] : []; }
}

const body = new FakeElement('body');
globalThis.Element = FakeElement;
globalThis.HTMLElement = FakeElement;
globalThis.document = { body, activeElement: null, createElement: (tag) => new FakeElement(tag), addEventListener() {} };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.CSS = { escape: (value) => String(value) };
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };

const { createGarageConsumables } = await import('./garageConsumables.ts');
const { openSurfaceIds, sweepHiddenSurfaces } = await import('./components/surfaceStack.ts');

const root = new FakeElement('div');
const host = root.adopt(new FakeElement('div'));
let vehicle = { id: 't90sm_2013', era: 'modern', role: 'mbt' };
let locked = false;
const consumables = createGarageConsumables({
  host, root,
  vehicle: () => vehicle,
  locked: () => locked,
  text: () => ({ search: 'Search', favourites: 'Favourites', recent: 'Recent', favourite: 'Favourite', empty: 'None', clear: 'Clear', more: 'More' }),
  emit() {},
});
const panel = root.children.find((child) => child.className.includes('cot-cspick'));
assert.ok(panel, 'the picker mounts its panel on the Garage root');
panel.shows = () => panel.classList.contains('open'); // display:none until it opens (garage.css)
consumables.render();
const press = (slot) => host.dispatch('click', { target: host.querySelector(`.csslot[data-slot="${slot}"]`) });
// the table's own import, awaited here too (the picker's import of it then resolves from the module cache), and a few turns
const table = import('../vehicles/auxiliaryInventory.ts');
const settle = async () => { await table; for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };

const failures = [];
async function check(name, body) {
  try { await body(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}

// 1. A press while the smoke table loads survives a layout sweep, and the picker opens when the table lands.
await check('the wait survives a layout sweep', async () => {
  press(1);
  assert.deepEqual(openSurfaceIds(), ['garage-consumables'], 'the wait stands on the surface stack');
  assert.equal(panel.classList.contains('open'), false, 'the panel opens with the table');
  sweepHiddenSurfaces(); // a resize, a rotation or a cot:layoutchange while the table loads
  assert.deepEqual(openSurfaceIds(), ['garage-consumables'], 'a layout sweep dismissed the press (its box was the hidden panel)');
  await settle();
  assert.equal(panel.classList.contains('open'), true, 'the press opens the picker once the table is in');
  assert.deepEqual(openSurfaceIds(), ['garage-consumables']);
});
if (!panel.classList.contains('open')) {
  // (the wait was dismissed: open the picker on a loaded table, so the next case still runs)
  await settle();
  press(1);
}

// 2. A tank change closes the open picker: its cards and locks were the old tank's.
await check('a tank change closes the picker', async () => {
  assert.equal(panel.classList.contains('open'), true, 'the picker is open on the first tank');
  vehicle = { id: 'm1a2_sepv3', era: 'modern', role: 'mbt' };
  consumables.render(); // garage.ts renderStats: the new tank's slots
  assert.equal(panel.classList.contains('open'), false, 'the picker kept the old tank\'s cards and locks open over the new tank');
  assert.deepEqual(openSurfaceIds(), [], 'and its place on the stack');
});

// 3. A redraw for the same tank (a choice made, a language change) keeps the picker; Escape-free close still works.
await check('a redraw for the same tank keeps the picker', async () => {
  press(0);
  assert.equal(panel.classList.contains('open'), true);
  consumables.render();
  assert.equal(panel.classList.contains('open'), true, 'the same tank\'s redraw leaves the picker open');
  consumables.close({ restoreFocus: false });
  assert.equal(panel.classList.contains('open'), false);
  assert.deepEqual(openSurfaceIds(), []);
});

/** garage.ts's own setRoomStatus, with `consumables` as its picker and a count of the equipment picker's closes. */
function roomStatusOn(picker) {
  const garage = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const start = garage.indexOf('    setRoomStatus(status');
  const end = garage.indexOf('\n    },\n', start);
  assert.ok(start > 0 && end > start, 'garage.ts holds setRoomStatus');
  const method = stripTypeScriptTypes(`function ${garage.slice(start, end + '\n    }'.length).trimStart()}`);
  const element = () => new FakeElement('div');
  const context = {
    equipmentCloses: 0,
    garageConsumables: picker,
    closeEqPicker: () => { context.equipmentCloses += 1; },
    requiredElement: (parent, selector) => parent.querySelector(selector),
    t: (key) => key,
    battleWord: () => 'Battle',
    battleRuleMeta: {}, battleModeMeta: { solo: { label: 'Solo' } }, battleGameMode: 'solo',
    root: element(), battleBtn: element(), roomControls: element(), roomReady: element(), roomReminder: element(),
    document: { createElement: (tag) => new FakeElement(tag), createTextNode: (text) => ({ text }) },
  };
  runInNewContext(`let roomStatus = null;\nlet vehicleLocked = false;\n${method}\n`
    + 'globalThis.setRoomStatus = setRoomStatus;\nglobalThis.isLocked = () => vehicleLocked;', context);
  return { set: context.setRoomStatus, locked: context.isLocked, equipmentCloses: () => context.equipmentCloses };
}

// 4. The room's hold closes the picker, and only the hold: a lobby update with the tank free leaves an open picker open.
await check('only the room\'s hold closes the picker', async () => {
  const room = roomStatusOn(consumables);
  const status = { mode: 'private', roomCode: 'K7QX', canSetReady: true, total: 3 };
  press(2);
  assert.equal(panel.classList.contains('open'), true, 'the picker is open');
  room.set({ ...status, ready: false, readyCount: 1 }); // another member readies, joins or picks a tank
  room.set({ ...status, ready: false, readyCount: 2 });
  assert.equal(room.locked(), false);
  assert.equal(panel.classList.contains('open'), true, 'a lobby update with the tank free closed the player\'s open picker');
  assert.equal(room.equipmentCloses(), 0, 'and the equipment picker');
  room.set({ ...status, ready: true, readyCount: 3 }); // the player is ready: the room holds the tank
  locked = room.locked(); // (garage.ts gives the picker locked: () => vehicleLocked)
  assert.equal(locked, true, 'the ready player\'s tank is held');
  assert.equal(panel.classList.contains('open'), false, 'the room\'s hold leaves the picker open over the held tank');
  assert.deepEqual(openSurfaceIds(), [], 'and its place on the stack');
  assert.equal(room.equipmentCloses(), 1, 'the hold closes the equipment picker too');
  press(2);
  assert.equal(panel.classList.contains('open'), false, 'a held tank opens no picker');
  room.set({ ...status, ready: false, readyCount: 2 }); // not ready again: the tank is free
  locked = room.locked();
  assert.equal(locked, false);
  press(2);
  assert.equal(panel.classList.contains('open'), true, 'a free tank opens the picker again');
  room.set(null); // the room ends
  assert.equal(panel.classList.contains('open'), true, 'leaving the room leaves the picker as it was');
  assert.equal(room.equipmentCloses(), 1, 'only the hold closed the equipment picker');
  consumables.close({ restoreFocus: false });
});

consumables.dispose();
assert.deepEqual(failures, [], `garageConsumablesPicker.selftest: ${failures.length} case(s) failed`);
console.log('garageConsumablesPicker.selftest: the table wait survives a layout sweep; a tank change closes the picker; a redraw keeps it;'
  + ' only the room\'s hold closes it PASS');
