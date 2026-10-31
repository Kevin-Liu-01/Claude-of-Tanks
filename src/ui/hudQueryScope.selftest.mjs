// (local-fps-266) The battle HUD layout's queries skip the screens that hold no HUD part (battleHudLayout.ts hudQueryAll,
// hudQuery): in battle the Garage, the icon sprite and the play screen were 10,221 of the document's 12,028 elements, and
// each of a layout pass's ~30 document queries walked them. Held here on a small tree whose element queries match against
// the whole document (as Element.querySelectorAll does):
// - with nothing to find in those screens, hudQueryAll is document.querySelectorAll, the same elements in the same order
//   (a body child that matches itself, parts outside the HUD root, a combinator whose ancestor stands above a body child),
//   and hudQuery is document.querySelector;
// - a match inside a skipped screen is left out, and nothing else;
// - a document stand-in without its body's children is queried whole.
import assert from 'node:assert/strict';

/** compound: tag, #id, .classes, [attr], :not([attr]); combinators ' ' and '>'; comma lists */
function compoundMatches(node, compound) {
  const re = /(#[\w-]+)|(\.[\w-]+)|(:not\(\[([\w-]+)\]\))|(\[([\w-]+)\])|(^[a-z]+)/g;
  let m, any = false;
  while ((m = re.exec(compound))) {
    any = true;
    if (m[1] && node.id !== m[1].slice(1)) return false;
    if (m[2] && !node.classes.has(m[2].slice(1))) return false;
    if (m[3] && m[4] in node.attrs) return false;
    if (m[5] && !(m[6] in node.attrs)) return false;
    if (m[7] && node.tag !== m[7]) return false;
  }
  return any;
}
function complexMatches(node, parts) {
  // parts: [compound, combinator, compound, ...] read right to left
  if (!compoundMatches(node, parts[parts.length - 1])) return false;
  if (parts.length === 1) return true;
  const combinator = parts[parts.length - 2], rest = parts.slice(0, -2);
  if (combinator === '>') return !!node.parent && node.parent.tag !== '#document' && complexMatches(node.parent, rest);
  for (let up = node.parent; up && up.tag !== '#document'; up = up.parent) if (complexMatches(up, rest)) return true;
  return false;
}
const parse = (selector) => selector.split(',').map((s) => {
  const words = s.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/), parts = [];
  for (const word of words) {
    if (word !== '>' && parts.length && parts[parts.length - 1] !== '>') parts.push(' ');
    parts.push(word);
  }
  return parts;
});
class Node {
  constructor(tag, { id = '', cls = '', attrs = {} } = {}, children = []) {
    this.tag = tag; this.id = id; this.classes = new Set(cls.split(/\s+/).filter(Boolean)); this.attrs = attrs;
    this.children = children; this.parent = null; for (const c of children) c.parent = this;
  }
  matches(selector) { return parse(selector).some((parts) => complexMatches(this, parts)); }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(selector) { return [...this.descendants()].filter((n) => n.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
const el = (tag, opts, kids) => new Node(tag, opts, kids);
function page({ decoys = false } = {}) {
  const garage = el('div', { cls: 'cot-garage' }, [el('div', { cls: 'garage-card' }, decoys ? [el('span', { cls: 'cot-shell' }), el('div', { cls: 'cot-minimap' })] : [el('span', { cls: 'chip' })])]);
  const hud = el('div', { cls: 'cot-hud' }, [
    el('div', { cls: 'cot-touch on' }, [el('button', { cls: 'round' }), el('div', { cls: 'joy' })]),
    el('div', { cls: 'cot-shells' }, [el('span', { cls: 'cot-shell' }), el('span', { cls: 'cot-shell' })]),
    el('div', { cls: 'cot-vehicle-controls' }, [el('button', { cls: 'tile' }), el('button', { cls: 'tile', attrs: { hidden: '' } })]),
    el('div', { cls: 'cot-minimap' }),
    el('div', { cls: 'cot-alert show' }),
  ]);
  const sprite = el('svg', { id: 'cot-icon-sprite' }, decoys ? [el('g', { cls: 'cot-con' })] : [el('symbol')]);
  const play = el('div', { cls: 'cot-play' }, decoys ? [el('div', { cls: 'cot-alert show' })] : [el('div', { cls: 'room' })]);
  const hints = el('div', { cls: 'cot-hints show' });
  const medals = el('div', { cls: 'cot-medal-toasts' }, [el('div', { cls: 'cot-medal-toast' })]);
  const net = el('div', { cls: 'cot-mp-status battle' });
  const body = el('body', { cls: 'cot-touch-layout' }, [garage, hud, sprite, play, hints, medals, net]);
  const root = el('#document', {}, [el('html', {}, [el('head'), body])]);
  return { body, root, document: { body, querySelectorAll: (s) => root.querySelectorAll(s), querySelector: (s) => root.querySelector(s) } };
}

const { hudQueryAll, hudQuery } = await import('./battleHudLayout.ts');
const SELECTORS = ['.cot-shell,.cot-con,.cot-minimap', '.cot-touch.on .round,.cot-touch.on .joy', '.cot-vehicle-controls>button',
  '.cot-vehicle-controls>button:not([hidden])', '.cot-hints.show', '.cot-medal-toasts .cot-medal-toast', '.cot-sixth.on,.cot-alert.show',
  '.cot-touch-layout .cot-shell', '.cot-mp-status.battle,.cot-flight-hud', '.cot-watch'];
const names = (list) => list.map((n) => `${n.tag}.${[...n.classes].join('.')}${n.id ? '#' + n.id : ''}`);
{
  const p = page();
  globalThis.document = p.document;
  for (const selector of SELECTORS) {
    assert.deepEqual(hudQueryAll(selector), p.document.querySelectorAll(selector), `${selector}: the document query's elements in its order`);
    assert.equal(hudQuery(selector), p.document.querySelector(selector), `${selector}: the document query's first match`);
  }
  assert.deepEqual(names(hudQueryAll('.cot-hints.show,.cot-alert.show')), ['div.cot-alert.show', 'div.cot-hints.show'],
    'a body child that matches itself, after the HUD root\'s matches before it');
  assert.equal(hudQueryAll('.cot-touch-layout .cot-shell').length, 2, 'an ancestor above the body\'s children still reads');
}
{
  const p = page({ decoys: true });
  globalThis.document = p.document;
  const inSkipped = (n) => { for (let up = n; up; up = up.parent) if (up.classes.has('cot-garage') || up.classes.has('cot-play') || up.id === 'cot-icon-sprite') return true; return false; };
  for (const selector of SELECTORS) {
    const all = p.document.querySelectorAll(selector);
    assert.deepEqual(hudQueryAll(selector), all.filter((n) => !inSkipped(n)), `${selector}: the skipped screens' matches left out, nothing else`);
  }
  assert.ok(p.document.querySelectorAll('.cot-shell,.cot-con,.cot-minimap').some(inSkipped), 'the decoys are there to leave out');
  assert.equal(names([hudQuery('.cot-shell')])[0], 'span.cot-shell', 'hudQuery passes over the Garage\'s decoy to the HUD\'s shell');
  assert.ok(!inSkipped(hudQuery('.cot-shell')), 'the first match outside the skipped screens');
}
{
  const marker = [{ marker: true }];
  globalThis.document = { body: {}, querySelectorAll: () => marker, querySelector: () => marker[0] };
  assert.deepEqual(hudQueryAll('.x'), marker, 'a stand-in without its body\'s children is queried whole');
  assert.equal(hudQuery('.x'), marker[0]);
}
console.log('hudQueryScope selftest passed: the HUD layout\'s queries equal the document\'s, in its order, less the Garage, '
  + 'icon sprite and play screen; a stand-in document is queried whole');
process.exit(0);
