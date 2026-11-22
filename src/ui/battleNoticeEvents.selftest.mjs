// battleNoticeEvents.selftest.mjs — the battle notices' event lane (notices-audit-275, Kevin approved 2026-11-21): one event
// at a time on NOTICE_PRIORITY's ladder, a repeat counted, a held input ignored, low rungs cooled down, a stale wait
// dropped, nothing under a threat while scoped (a turn waits for the scope), a slot replaced in place, the pause holding
// the time, an "A · B" line split into its line and detail, and a key line drawn (and drawn again when the keys change).
import assert from 'node:assert/strict';
import { NOTICE_PRIORITY } from './battleNotices.ts';
import {
  createBattleEventLane, EVENT_COOLDOWN_MS, EVENT_HELD_MS, EVENT_HOLD_MS, EVENT_STALE_MS, SCOPE_DEFER_MS,
} from './battleNoticeEvents.ts';

// ---- a clock and timers the receipt drives
let now = 0;
const timers = new Map();
let serial = 0;
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
globalThis.setTimeout = (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const advance = (ms) => {
  const end = now + ms;
  for (;;) {
    const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break;
    now = next[1].at;
    timers.delete(next[0]);
    next[1].fn();
  }
  now = end;
};

// ---- the smallest element the lane writes to
function element() {
  const classes = new Set();
  const attrs = new Map();
  return {
    dataset: {}, innerHTML: '', children: [],
    classList: { add: (c) => classes.add(c), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: (k) => attrs.get(k) ?? null,
    append(child) { this.children.push(child); },
    get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); for (const c of v.split(' ')) if (c) classes.add(c); },
  };
}
const root = element();
let keyLabel = 'F';
const lane = createBattleEventLane({
  root, doc: { createElement: () => element() }, now: () => now,
  keyLine: (line, actions) => `<span class="cot-key-line">[${Object.values(actions).map(() => keyLabel).join('][')}] ${line}</span>`,
});
const seat = lane.el;
const shown = () => seat.classList.contains('show');
const text = () => /cot-c-notice__text">([^<]*)</.exec(seat.innerHTML)?.[1] ?? null;
// (the detail runs to the body's close: the markup before any count, its last two closes the detail's and the body's)
const detail = () => /cot-c-notice__detail">(.*)<\/span><\/span>/.exec(seat.innerHTML.replace(/<span class="cot-c-notice__count[^]*$/, ''))?.[1] ?? null;
const count = () => /cot-c-notice__count[^>]*>×(\d+)/.exec(seat.innerHTML)?.[1] ?? null;
const { threat, turned, answered, ambient } = NOTICE_PRIORITY;

try {
  assert.equal(root.children[0], seat, 'the seat mounts in the HUD root');
  assert.equal(seat.className, 'cot-alert', 'as the planners\' alert seat');
  assert.equal(seat.dataset.datum, 'notices', 'carrying the notices datum');

  // one event, its words split "A · B"
  lane.raise({ text: 'SECTOR 1 OF 3 TAKEN · PUSH ON', priority: turned, severity: 'success', icon: 'modeFrontline' });
  assert.ok(shown(), 'an event shows');
  assert.equal(text(), 'SECTOR 1 OF 3 TAKEN', 'its line is the words before the dot');
  assert.equal(detail(), 'PUSH ON', 'and the rest is its detail');
  assert.equal(seat.dataset.tip, 'SECTOR 1 OF 3 TAKEN · PUSH ON', 'the whole words in the tip');
  assert.equal(seat.getAttribute('role'), 'status');
  advance(EVENT_HOLD_MS + 1);
  assert.ok(!shown(), 'it leaves after its hold');

  // a repeat counts; a held input does not
  lane.raise({ text: 'WAVE 2 INBOUND', priority: turned });
  advance(EVENT_HELD_MS - 50);
  lane.raise({ text: 'WAVE 2 INBOUND', priority: turned });
  assert.equal(count(), null, 'a repeat inside the held window is the same press');
  advance(400);
  lane.raise({ text: 'WAVE 2 INBOUND', priority: turned });
  assert.equal(count(), '2', 'a repeat while it shows counts');
  advance(EVENT_HOLD_MS + 1);
  assert.ok(!shown());

  // a higher rung displaces; the displaced one comes back; a stale wait is dropped
  lane.raise({ text: 'OUR FLAG IS STOLEN', priority: turned, severity: 'error' });
  advance(300);
  lane.raise({ text: 'ALL AMMUNITION DEPLETED', priority: threat, severity: 'error', icon: 'shell' });
  assert.equal(text(), 'ALL AMMUNITION DEPLETED', 'a threat takes the seat from a turn');
  assert.equal(seat.getAttribute('role'), 'alert', 'an error is assertive');
  assert.match(seat.innerHTML, /data-icon="alert"/, 'in the sprite\'s alert glyph');
  advance(EVENT_HOLD_MS + 1);
  assert.equal(text(), 'OUR FLAG IS STOLEN', 'the displaced turn shows again after it');
  advance(EVENT_HOLD_MS + 1);
  lane.raise({ text: 'MISSILES DEPLETED', priority: threat, severity: 'error' });
  advance(100);
  lane.raise({ text: 'ENEMY GOAL', priority: turned });
  advance(EVENT_HOLD_MS - 200);
  lane.raise({ text: 'ALL AMMUNITION DEPLETED', priority: threat, severity: 'error' });
  advance(150);
  assert.equal(text(), 'ALL AMMUNITION DEPLETED', 'the waiting threat goes ahead of the waiting turn');
  advance(EVENT_HOLD_MS + 1);
  assert.ok(EVENT_HOLD_MS * 2 > EVENT_STALE_MS, 'the turn has waited past its staleness by now');
  assert.ok(!shown(), 'a turn that waited past its staleness is dropped, never shown late');

  // a lower rung waits behind a higher one rather than displacing it
  lane.raise({ text: 'MISSILES DEPLETED', priority: threat, severity: 'error' });
  lane.raise({ text: 'NOTHING TO REPAIR', priority: answered, severity: 'info' });
  assert.equal(text(), 'MISSILES DEPLETED', 'an answer never displaces a threat');
  advance(EVENT_HOLD_MS + 1);
  assert.equal(text(), 'NOTHING TO REPAIR', 'it shows after, still fresh');
  advance(EVENT_HOLD_MS + 1);

  // the cooldown: an answer raised again soon after it left is dropped; a turn never cools down; a slot always answers
  lane.raise({ text: 'NOTHING TO REPAIR', priority: answered, severity: 'info' });
  assert.ok(!shown(), 'an answer raised again inside the cooldown is dropped');
  advance(EVENT_COOLDOWN_MS);
  lane.raise({ text: 'NOTHING TO REPAIR', priority: answered, severity: 'info' });
  assert.ok(shown(), 'after the cooldown it answers again');
  advance(EVENT_HOLD_MS + 1);
  lane.raise({ text: 'REPAIR CACHE DROPPED', priority: ambient, severity: 'info' });
  advance(EVENT_HOLD_MS + 1);
  lane.raise({ text: 'REPAIR CACHE DROPPED', priority: ambient, severity: 'info' });
  assert.ok(!shown(), 'an ambient event cools down too');
  lane.raise({ text: 'WAVE 3 INBOUND', priority: turned });
  advance(EVENT_HOLD_MS + 1);
  lane.raise({ text: 'WAVE 3 INBOUND', priority: turned });
  assert.ok(shown(), 'a turn never cools down');
  advance(EVENT_HOLD_MS + 1);

  // a slot: the newer state replaces the older in place, never counted, never cooled
  lane.raise({ text: 'ARMOR OVERLAY ON', priority: answered, severity: 'success', slot: 'armor', keys: { line: 'off', actions: { key: 'hitboxOverlay' } } });
  advance(400);
  lane.raise({ text: 'ARMOR OVERLAY OFF', priority: answered, severity: 'info', slot: 'armor', keys: { line: 'on', actions: { key: 'hitboxOverlay' } } });
  assert.equal(text(), 'ARMOR OVERLAY OFF', 'the newer state replaces the older in place');
  assert.equal(count(), null, 'a slot is not a repeat');
  assert.equal(detail(), '<span class="cot-key-line">[F] on</span>', 'its key line is its detail');
  keyLabel = 'G';
  lane.relabel();
  assert.equal(detail(), '<span class="cot-key-line">[G] on</span>', 'a rebinding draws the key line again');
  advance(EVENT_HOLD_MS + 1);
  lane.raise({ text: 'ARMOR OVERLAY ON', priority: answered, severity: 'success', slot: 'armor' });
  assert.ok(shown(), 'a slot answers inside the cooldown');
  advance(EVENT_HOLD_MS + 1);

  // a key line replaces the words after the dot
  lane.raise({ text: 'AMMUNITION TYPE EMPTY · SELECT ANOTHER TYPE', priority: threat, severity: 'error', keys: { line: 'pick', actions: { a: 'shell1' } } });
  assert.equal(text(), 'AMMUNITION TYPE EMPTY');
  assert.equal(detail(), '<span class="cot-key-line">[G] pick</span>', 'the key line, not the words after the dot');
  advance(EVENT_HOLD_MS + 1);

  // the pause holds the time
  lane.raise({ text: 'SECTOR LOST', priority: turned, severity: 'error' });
  lane.pause(true);
  advance(30_000);
  assert.ok(shown(), 'the pause holds its time');
  lane.pause(false);
  advance(EVENT_HOLD_MS + 1);
  assert.ok(!shown(), 'and it leaves with what it had left');

  // the scope: nothing under a threat interrupts; a turn waits for the scope to drop, if still fresh
  lane.scope(true);
  lane.raise({ text: 'CREW UNHARMED', priority: answered, severity: 'info' });
  assert.ok(!shown(), 'an answer is dropped while scoped');
  lane.raise({ text: 'SECTOR SECURED', priority: turned, severity: 'success' });
  assert.ok(!shown(), 'a turn waits while scoped');
  lane.raise({ text: 'MISSILES DEPLETED', priority: threat, severity: 'error' });
  assert.equal(text(), 'MISSILES DEPLETED', 'a threat shows through the scope');
  advance(EVENT_HOLD_MS + 1);
  lane.scope(false);
  assert.equal(text(), 'SECTOR SECURED', 'the turn shows when the scope drops');
  advance(EVENT_HOLD_MS + 1);
  lane.scope(true);
  lane.raise({ text: 'ENEMY FLAG CAPTURE', priority: turned, severity: 'error' });
  advance(SCOPE_DEFER_MS + 1);
  lane.scope(false);
  assert.ok(!shown(), 'a turn held past its freshness is dropped');
  lane.scope(true);
  lane.raise({ text: 'CREW UNHARMED', priority: answered, severity: 'info' });
  lane.scope(false);
  assert.ok(!shown(), 'an answer dropped while scoped never comes back');

  // clear empties everything
  lane.raise({ text: 'WAVE 4 INBOUND', priority: turned });
  lane.raise({ text: 'MISSILES DEPLETED', priority: threat, severity: 'error' });
  lane.clear();
  advance(10_000);
  assert.ok(!shown(), 'a cleared lane shows nothing from its waiting line');
} finally {
  globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear;
}

console.log('battleNoticeEvents.selftest: PASS (one event on the ladder, repeat counted, held press ignored, answers cooled, '
  + 'stale waits dropped, scope holds turns and drops answers, slots replace in place, pause holds, key lines redrawn)');
