// The controls guide's copy on the game screen (round 8 Y5 s6-04; docs/PHONE-CONTROLLER.md "The controls guide"). The
// phone owns the guide; the game screen's copy is a bounded mirror: it opens on the phone's on:true and closes on its
// on:false, on Skip here (the phone hears it), when the desktop's link leaves live, or at the time the phone's guide had
// left (its on:true carries it), whichever comes first. Before, the copy kept its own ten-second clock and stayed open
// over Settings or the couch lobby when the phone's link went away mid-guide (the phone's on:false never came). Driven
// through the real receiver (padReceiver.ts) and the real screen (padTourScreen.ts) over a socket stand-in, with a
// small stand-in for the page's DOM: the open class is what pad-e2e reads in the browser.
import assert from 'node:assert/strict';

// ---- a page stand-in: enough DOM for the guide's screen, and the open state pad-e2e reads ------------------------------
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.textContent = '';
    this.popoverOpen = false;
    this.animations = [];
    this.found = new Map();
    const classes = new Set();
    this.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
  }
  set className(value) { for (const name of String(value).split(/\s+/).filter(Boolean)) this.classList.add(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  append(child) { this.children.push(child); }
  appendChild(child) { this.children.push(child); return child; }
  set innerHTML(markup) { this.markup = markup; this.found.clear(); }
  querySelector(selector) { if (!this.found.has(selector)) this.found.set(selector, new FakeElement('i')); return this.found.get(selector); }
  querySelectorAll() { return []; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const listener of this.listeners.click ?? []) listener({}); }
  animate(_keyframes, options) { const animation = { options, cancel() { animation.cancelled = true; } }; this.animations.push(animation); return animation; }
  showPopover() { this.popoverOpen = true; }
  hidePopover() { this.popoverOpen = false; }
  matches(selector) { return selector === ':popover-open' && this.popoverOpen; }
  get offsetWidth() { return 60; }
  get offsetHeight() { return 20; }
}
const body = new FakeElement('body');
globalThis.document = {
  body, head: new FakeElement('head'), documentElement: new FakeElement('html'),
  createElement: (tag) => new FakeElement(tag), createElementNS: (_ns, tag) => new FakeElement(tag), getElementById: () => null,
};
globalThis.innerWidth ??= 1280;
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { startPadReceiver } = await import('./padReceiver.ts');
const { encodePadTour, readPadCtl, PAD_RELAY_CTL, PAD_RELAY_DATA_MAX, PAD_TOUR_MAX_PARTS, PAD_TOUR_MS, PAD_TOUR_PARTS, PAD_TOUR_STOPS } = await import('./padProtocol.ts');

/** The guide's drawing on the page (the screen makes one host element and keeps it). */
const screen = () => body.children.find((child) => child.classList.contains('cot-pad-tour')) ?? null;
const screenOpen = () => !!screen()?.classList.contains('is-open');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (test, label, ms = 3000) => {
  const end = Date.now() + ms;
  while (!test()) { if (Date.now() > end) throw new Error(`timed out: ${label}`); await wait(5); }
};

/** A desktop receiver on a socket stand-in: the test speaks for the pairing service and the phone (over the relay). */
function pairedReceiver() {
  const listeners = { open: [], message: [], close: [] };
  const sent = [];
  const socket = {
    readyState: 0,
    addEventListener: (type, listener) => listeners[type].push(listener),
    send: (text) => sent.push(text),
    close: () => { if (socket.readyState === 3) return; socket.readyState = 3; for (const listener of listeners.close) listener({}); },
  };
  const host = (message) => { for (const listener of listeners.message) listener({ data: JSON.stringify(message) }); };
  const receiver = startPadReceiver('ws://pad.test', {
    input: { setVirtualMove() {}, addVirtualAim() {}, pressVirtual() {}, releaseVirtual() {}, tapVirtual() {} },
    source: () => null,
    togglePause() {},
  }, undefined, { createSocket: () => socket, remember: false });
  socket.readyState = 1;
  for (const listener of listeners.open) listener({});
  host({ t: 'code', code: 'K7Q4MZ', expiresAt: Date.now() + 120_000, token: 'tok-0123456789abcdef' });
  host({ t: 'peer', state: 'here' });
  /** A ctl message from the phone, over the relay (it makes the link live). */
  const fromPhone = (message) => host({ t: 'relay', data: `${PAD_RELAY_CTL}${JSON.stringify(message)}` });
  /** What the receiver told the phone over the relay. */
  const toPhone = () => sent.map((text) => JSON.parse(text)).filter((m) => m.t === 'relay' && m.data.startsWith(PAD_RELAY_CTL))
    .map((m) => JSON.parse(m.data.slice(1)));
  return { receiver, host, fromPhone, toPhone, socket };
}
const layout = { w: 812, h: 366, parts: [['key', 400, 0, 48, 48], ['fire', 700, 250, 104, 104]],
  stops: [['fire', 700, 250, 104, 104, 752, 302, 1, 0], ['aim', 500, 60, 300, 300, 650, 80, 2, 1]] };
const l = encodePadTour(layout);

// ---- the phone's link goes away mid-guide: the copy here closes (its on:false will not come) --------------------------
{
  const pair = pairedReceiver();
  pair.fromPhone({ k: 'tour', on: true, l, ms: PAD_TOUR_MS });
  assert.equal(pair.receiver.view.state.kind, 'live');
  assert.ok(screenOpen(), 'the phone\'s guide opens on the game screen');
  pair.host({ t: 'peer', state: 'away' });
  assert.equal(pair.receiver.view.state.kind, 'away');
  assert.equal(screenOpen(), false, 'the copy closes when the link leaves live (it stayed open over Settings until its own clock ran out)');
  pair.receiver.disconnect();
}

// ---- the phone's on:false closes it ------------------------------------------------------------------------------------
{
  const pair = pairedReceiver();
  pair.fromPhone({ k: 'tour', on: true, l, ms: PAD_TOUR_MS });
  assert.ok(screenOpen());
  pair.fromPhone({ k: 'tour', on: false });
  assert.equal(screenOpen(), false, 'the phone\'s end closes the copy');
  pair.receiver.disconnect();
}

// ---- no on:false arrives (the phone's tab closed, the message lost): the copy closes at the phone's time left ---------
{
  const pair = pairedReceiver();
  pair.fromPhone({ k: 'tour', on: true, l, ms: 120 });
  assert.ok(screenOpen());
  const clock = screen().querySelector('.cot-pad-tour-clock').animations.at(-1);
  assert.equal(clock?.options.duration, 120, 'its bar counts down the time the phone\'s guide has left');
  await wait(60);
  assert.ok(screenOpen(), 'open while the phone\'s guide has time left');
  await until(() => !screenOpen(), 'the copy closes at the carried deadline');
  // an older phone's on:true carries no time: the guide's own life bounds the copy
  pair.fromPhone({ k: 'tour', on: true, l });
  assert.equal(screen().querySelector('.cot-pad-tour-clock').animations.at(-1)?.options.duration, PAD_TOUR_MS);
  pair.receiver.disconnect();
  assert.equal(screenOpen(), false, 'a pairing that ends closes it');
}

// ---- Skip here closes it and tells the phone ---------------------------------------------------------------------------
{
  const pair = pairedReceiver();
  pair.fromPhone({ k: 'tour', on: true, l, ms: PAD_TOUR_MS });
  screen().querySelector('.cot-pad-tour-skip').click();
  assert.equal(screenOpen(), false, 'Skip here closes the copy');
  assert.deepEqual(pair.toPhone().filter((m) => m.k === 'tour'), [{ k: 'tour', on: false }], 'and the phone hears it once');
  pair.receiver.disconnect();
}

// ---- a couch lobby: another phone's guide replaces this one's drawing; this link going away leaves the other's alone ---
{
  const one = pairedReceiver();
  const two = pairedReceiver();
  one.fromPhone({ k: 'tour', on: true, l, ms: PAD_TOUR_MS });
  two.fromPhone({ k: 'tour', on: true, l, ms: PAD_TOUR_MS });
  one.host({ t: 'peer', state: 'away' });
  assert.ok(screenOpen(), "seat 1's link going away leaves seat 2's guide on the screen");
  two.fromPhone({ k: 'tour', on: false });
  assert.equal(screenOpen(), false);
  one.receiver.disconnect();
  two.receiver.disconnect();
}

// ---- the wire: the time left travels with the picture, bounded, and still fits one relay payload ------------------------
{
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'tour', on: true, l, ms: 9200 })), { k: 'tour', on: true, l, ms: 9200 });
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'tour', on: true, l, ms: 9e9 })), { k: 'tour', on: true, l, ms: 60_000 }, 'a time left is bounded');
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'tour', on: true, l, ms: 'soon' })), { k: 'tour', on: true, l }, 'a time that is no number is left out');
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'tour', on: false, ms: 5 })), { k: 'tour', on: false }, 'an ending carries none');
  const parts = Array.from({ length: PAD_TOUR_MAX_PARTS + 5 }, (_, i) => [PAD_TOUR_PARTS[i % PAD_TOUR_PARTS.length], 60000, 60000, 60000, 60000]);
  const stops = PAD_TOUR_STOPS.map((stop) => [stop, 60000, 60000, 60000, 60000, 60000, 60000, 2, 2]);
  const big = `${PAD_RELAY_CTL}${JSON.stringify({ k: 'tour', on: true, l: encodePadTour({ w: 2732, h: 2048, parts, stops }), ms: PAD_TOUR_MS })}`;
  assert.ok(big.length <= PAD_RELAY_DATA_MAX, `the biggest picture and its time fit one relay payload (${big.length} of ${PAD_RELAY_DATA_MAX})`);
}

// ---- the copy's machine: closed or open, one writer (setTour), each close leaving no deadline behind ------------------
{
  const { PAD_TOUR_MIRROR_STATES } = await import('./padReceiver.ts');
  assert.deepEqual(PAD_TOUR_MIRROR_STATES, ['closed', 'open']);
  const pair = pairedReceiver();
  const seen = [];
  const note = (event) => seen.push(`${event}:${pair.receiver.tour}`);
  note('start');
  pair.fromPhone({ k: 'tour', on: true, l, ms: 40 });
  note('on');
  pair.fromPhone({ k: 'tour', on: false });
  note('off');
  pair.fromPhone({ k: 'tour', on: true, l, ms: 40 });
  pair.fromPhone({ k: 'tour', on: true, l: 'not-a-picture' });
  note('refused');
  pair.fromPhone({ k: 'tour', on: true, l, ms: 40 });
  note('again');
  await wait(80);
  note('deadline');
  pair.fromPhone({ k: 'tour', on: true, l, ms: 40 });
  pair.host({ t: 'peer', state: 'away' });
  note('away');
  await wait(80);
  assert.deepEqual(seen, ['start:closed', 'on:open', 'off:closed', 'refused:open', 'again:open', 'deadline:closed', 'away:closed']);
  assert.equal(screenOpen(), false, 'no deadline outlived its close to reopen anything');
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./padReceiver.ts', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/\btourState = '(\w+)'/g)].map((match) => match[1]), ['closed', 'open'], 'setTour is the one writer');
  assert.equal([...source.matchAll(/showPadTour\(/g)].length, 1, 'the guide is drawn from setTour only');
  pair.receiver.disconnect();
}

console.log('padTour.selftest: PASS — the game screen\'s guide closes on the phone\'s end, on Skip here (the phone told), when the link leaves live and at the phone\'s time left; one phone\'s link leaves another\'s guide alone; the time fits the relay');
process.exit(0);
