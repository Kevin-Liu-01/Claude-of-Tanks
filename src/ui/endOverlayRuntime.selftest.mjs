import assert from 'node:assert/strict';
import { createEndOverlayRuntime, endRecordMarkup } from './endOverlayRuntime.ts';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.style = {};
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
  result: 'victory', kills: 2, damage: 4312, vehicleId: 'm1a2',
  mapId: 'verdant', durationS: 92, completedAt: 42,
};
const overlay = createEndOverlayRuntime({
  bus: { emit: (event, payload) => events.push([event, payload]) },
  onReturnToGarage: () => { returned += 1; },
  getRecord: () => record,
  ownerDocument,
});

assert.equal(body.children[0], overlay.root);
assert.equal(overlay.root.className, 'cot-end');
assert.equal(overlay.root.style.display, undefined);
overlay.show('victory');
assert.equal(overlay.root.style.display, 'flex');
assert.match(endRecordMarkup(record), /2 kills/);
assert.match(endRecordMarkup(record), /4,312 damage/);
assert.match(overlay.root.children[1].innerHTML, /4,312 damage/);
overlay.returnButton.click();
assert.deepEqual(events, [['ui:click', {}]]);
assert.equal(returned, 1);
overlay.hide();
assert.equal(overlay.root.style.display, 'none');

console.log('endOverlayRuntime.selftest: stable result action ownership passed');
