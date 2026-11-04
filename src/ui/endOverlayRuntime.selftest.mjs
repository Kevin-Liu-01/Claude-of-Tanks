import assert from 'node:assert/strict';
import { createEndOverlayRuntime, endRecordMarkup } from './endOverlayRuntime.ts';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.({ type: 'click' }); }
}

const body = new FakeElement('body');
const ownerDocument = {
  body,
  createElement: (tagName) => new FakeElement(tagName),
};
const events = [];
let returned = 0;
const record = {
  result: 'victory', kills: 2, damage: 4312, vehicleId: 'm1a1_abrams_hc',
  mapId: 'verdant', durationS: 92, completedAt: 42,
};
const overlay = createEndOverlayRuntime({
  bus: { emit: (event, payload) => events.push([event, payload]) },
  onReturnToGarage: () => { returned += 1; },
  getRecord: () => record,
  ownerDocument,
});

assert.ok(body.children[0] === overlay.root);
assert.equal(overlay.root.className, 'cot-end');
assert.equal(overlay.root.style.display, undefined);
overlay.show('victory');
assert.equal(overlay.root.style.display, 'flex');
assert.match(endRecordMarkup(record), /2 kills/);
assert.match(endRecordMarkup(record), /4,312 damage/);
assert.match(overlay.root.children[1].innerHTML, /4,312 damage/);
assert.equal(overlay.returnButton.dataset.uiSound, 'back', 'the return action sounds as back by role, in every locale');
overlay.returnButton.click();
assert.deepEqual(events, [['ui:click', {}]]);
assert.equal(returned, 1);
overlay.hide();
assert.equal(overlay.root.style.display, 'none');

// 2026-11-02 audit F8: the end screen adopts the Return button into its own actions row (endScreen.ts adoptEndOverlay);
// the emptied root is a fixed full-screen layer (inset 0, z 70) that only body.cot-es-armed hid, so a show() after the
// adoption kept an invisible layer over the page once endScreen.hide() dropped the class first. It stays down instead.
overlay.returnButton.parentNode = { tagName: 'DIV' }; // reparented by the end screen
overlay.show('defeat');
assert.equal(overlay.root.style.display, 'none', 'an emptied overlay root never shows');
overlay.returnButton.parentNode = overlay.root; // a fresh battle's overlay with its own button again
overlay.show('victory');
assert.equal(overlay.root.style.display, 'flex');

console.log('endOverlayRuntime.selftest: stable result action ownership passed');
