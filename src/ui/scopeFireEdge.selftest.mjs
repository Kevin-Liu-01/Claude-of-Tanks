// fire-visible-275 (Kevin 2026-11-22: "if a tank is on fire or our tank we have to see the fire effects"; his pick for the
// sight, an edge flicker with the notice): in the sight our own hull's flames are out of frame, so the fire chip's owner
// (vehicleStatus.ts) burns the sight's bottom edge while we burn. Its real code on a stand-in DOM:
//  - the edge mounts on the HUD's layer (not the damage panel, which the HUD editor scales and moves), once;
//  - it burns while the combat record burns, and goes out with the fire, at a death, at a clear and with no record (a
//    flight's airframe passes none);
//  - its style shows it only in the sight (html[data-cot-scoped]) and burning, animates on the compositor alone
//    (transform and opacity) and stands still under reduced motion (the setting and the OS switch).
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.className = ''; this.hidden = false; this.textContent = ''; this.innerHTML = '';
    this.dataset = {}; this.style = { setProperty() {}, removeProperty() {} };
    this.parentNode = null; this.children = []; this.attributes = new Map(); this.type = '';
  }
  setAttribute(n, v) { this.attributes.set(n, String(v)); }
  getAttribute(n) { return this.attributes.get(n) ?? null; }
  removeAttribute(n) { this.attributes.delete(n); }
  hasAttribute(n) { return this.attributes.has(n); }
  toggleAttribute(n, force) { const on = force ?? !this.attributes.has(n); if (on) this.attributes.set(n, ''); else this.attributes.delete(n); return on; }
  append(...nodes) { for (const n of nodes) { if (n.parentNode) n.remove(); n.parentNode = this; this.children.push(n); } }
  prepend(...nodes) { for (const n of nodes.reverse()) { if (n.parentNode) n.remove(); n.parentNode = this; this.children.unshift(n); } }
  appendChild(n) { this.append(n); return n; }
  remove() { const p = this.parentNode; if (p) p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; }
  addEventListener() {} removeEventListener() {}
  getClientRects() { return [1]; }
  matches() { return false; } hidePopover() {} showPopover() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  closest() { return null; } contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}
const styles = new Map();
const head = new FakeElement('head');
globalThis.document = {
  head, body: new FakeElement('body'), documentElement: new FakeElement('html'),
  createElement: (tag) => new FakeElement(tag),
  getElementById: (id) => styles.get(id) ?? null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
const origAppend = head.append.bind(head);
head.append = (...nodes) => { for (const n of nodes) if (n.id) styles.set(n.id, n); origAppend(...nodes); };
head.appendChild = (n) => { head.append(n); return n; };
head.prepend = head.append;
head.insertBefore = (n) => { head.append(n); return n; };
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
globalThis.Event ??= class { constructor(type) { this.type = type; } };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', flexBasis: '34px', columnGap: '4px' });

const { createVehicleStatusStrip } = await import('./vehicleStatus.ts');
const strip = createVehicleStatusStrip();
const hudLayer = new FakeElement('div');
strip.mountEdge(hudLayer);
strip.mountEdge(hudLayer);
const edges = hudLayer.children.filter((c) => c.className === 'cot-scope-fire');
assert.equal(edges.length, 1, 'the edge mounts once, on the HUD layer');
const edge = edges[0];
assert.equal(edge.getAttribute('aria-hidden'), 'true', 'decoration: the chip and the notice speak for it');
const burning = () => edge.hasAttribute('data-burning');
const combat = (burningNow, destroyed = false) => ({ destroyed, fire: { burning: burningNow, ticksLeft: 4, tickTimer: 0 },
  modules: {}, crew: {}, hp: 500, maxHp: 1000 });

strip.update(combat(false));
assert.ok(!burning(), 'no fire, no edge');
strip.update(combat(true));
assert.ok(burning(), 'our tank burning: the edge burns');
strip.update(combat(false));
assert.ok(!burning(), 'the fire out: the edge goes out');
strip.update(combat(true));
strip.update(combat(true, true));
assert.ok(!burning(), 'a death puts it out (the wreck burns in the world, not in a sight)');
strip.update(combat(true));
strip.update(null);
assert.ok(!burning(), 'no record (a flight): no edge');
strip.update(combat(true));
strip.clear();
assert.ok(!burning(), 'a clear puts it out');

// its style: in the sight only, burning only; compositor-only motion; still under reduced motion
const css = [...styles.values()].map((s) => s.textContent).join('\n');
const shown = /html\[data-cot-scoped\] \.cot-scope-fire\[data-burning\]\{[^}]*opacity:1/.exec(css);
assert.ok(shown, 'shown only in the sight and burning');
assert.ok(/\.cot-scope-fire\{[^}]*opacity:0;visibility:hidden/.test(css), 'hidden otherwise');
let frames = 0;
for (const [, body] of css.matchAll(/@keyframes cot-scope-lick[\w-]*\{((?:[^{}]*\{[^}]*\})*)\}/g)) {
  frames++;
  for (const [, decls] of body.matchAll(/\{([^}]*)\}/g)) {
    for (const prop of decls.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean)) {
      assert.ok(prop === 'transform' || prop === 'opacity', `the flicker animates ${prop}: compositor only`);
    }
  }
}
assert.equal(frames, 2, 'two licks, offset');
// still under reduced motion: the loop stops (the --dur tokens fall to 1ms there, which would strobe), and the reduce
// selectors outrank the burning ones by one attribute instead of by !important
assert.ok(/:root\[data-motion=reduce\] \.cot-scope-fire\[data-burning\]::before,:root\[data-motion=reduce\] \.cot-scope-fire\[data-burning\]::after\{animation:none\}/.test(css),
  'still under the reduced-motion setting');
assert.ok(/@media \(prefers-reduced-motion:reduce\)\{:root:not\(\[data-motion\]\) \.cot-scope-fire\[data-burning\]::before,:root:not\(\[data-motion\]\) \.cot-scope-fire\[data-burning\]::after\{animation:none\}/.test(css),
  'and under the OS switch');
// its motion on the shared tokens: no literal time and no !important in the edge's rules
const edgeRules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/[^{}]*\.cot-scope-fire[^{}]*\{[^{}]*\}/g)].map((m) => m[0]).join('\n');
assert.ok(edgeRules.includes('var(--dur-stage)'), 'the licks run on the --dur-stage token');
assert.ok(!/(?:^|[\s,(:])\.?\d+(?:\.\d+)?m?s\b/.test(edgeRules), 'no literal duration in the edge rules');
assert.ok(!edgeRules.includes('!important'), 'no !important in the edge rules');
strip.dispose();
assert.equal(edge.parentNode, null, 'dispose takes the edge down');

console.log('scopeFireEdge.selftest: the sight edge mounts once on the HUD layer, burns with our own fire and goes out with it, at a death, a clear or with no record; shown only scoped and burning, compositor-only, still under reduced motion');
