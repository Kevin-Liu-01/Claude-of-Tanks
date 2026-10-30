// battleKeyCaps.selftest.mjs: every battle key cap is its action's live binding, keyboard and pad, made again only when a
// binding or the layout changes (owner 2026-10-28: "make sure to relabel if a person changes it in settings"; "why is
// atgm labeled Q? E does it for me").
import assert from 'node:assert/strict';
import { CAP_ACTIONS, createBattleKeyCaps, keyCapFor } from './battleKeyCaps.ts';
import { DEFAULT_PAD_BINDINGS, createInput } from './input.ts';

// the real input layer over an empty storage
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, pointerLockElement: null };
const input = createInput();
let pad = false;
const view = new Proxy(input, { get: (target, key) => (key === 'padActive' ? () => pad : target[key]) });
const caps = createBattleKeyCaps(view);

// keyboard: each cap is labelFor of its binding
const first = caps.read();
for (const action of CAP_ACTIONS) {
  assert.equal(first[action], input.labelFor(input.getBinding(action, 0) ?? input.getBinding(action, 1)), `${action}: its keyboard key`);
}
assert.equal(first.atgm, 'Q');
assert.equal(first.specialAction, 'E');
assert.equal(caps.read(), first, 'no change, the same caps (no work in a frame)');

// a rebind (Settings writes the same setBinding) names the new key at once, every action in turn
for (const action of CAP_ACTIONS) {
  const before = input.getBinding(action, 0);
  input.setBinding(action, 'KeyP', 0);
  assert.equal(caps.read()[action], 'P', `${action}: the rebound key`);
  input.setBinding(action, before, 0);
  assert.equal(caps.read()[action], input.labelFor(before), `${action}: back to its key`);
}

// a pad layout: each cap is padLabelFor of its pad binding; the hull's system shows LB where its action has no button
pad = true;
const padCaps = caps.read();
for (const action of CAP_ACTIONS) {
  const index = input.getPadBinding(action);
  assert.equal(padCaps[action], index == null ? '' : input.padLabelFor(index), `${action}: its pad button`);
}
assert.equal(DEFAULT_PAD_BINDINGS.atgm, undefined, 'the ATGM has no pad button of its own');
assert.equal(padCaps.atgm, '', 'a hull whose LB is its suspension shows no pad cap for the ATGM');
assert.equal(caps.read('atgm').atgm, input.padLabelFor(input.getPadBinding('specialAction')), 'a launcher without suspension: the ATGM is LB');
assert.equal(keyCapFor(view, 'atgm', true, 'atgm'), 'LB');
input.setPadBinding('atgm', 3);
assert.equal(caps.read('atgm').atgm, input.padLabelFor(3), 'its own pad button once bound');
input.setPadBinding('atgm', null);
pad = false;
assert.equal(caps.read('atgm').atgm, 'Q', 'the keyboard again: Q');

console.log(`battleKeyCaps.selftest: PASS (${CAP_ACTIONS.length} actions, keyboard and pad, live rebinds, LB for the hull's system)`);
