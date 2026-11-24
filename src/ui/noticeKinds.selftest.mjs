// noticeKinds.selftest.mjs — the battle notices' kinds (notices-276b; Kevin 2026-11-24: "should we combine stuff, the art
// system is awesome, and theres so much and hexagons look better for the bigger notis", the plan he approved through Main):
// - every kind declares its subject and its shape: a large or subject kind the hexagon plate, with art or without, a
//   one-line status the pill, never with art;
// - the lanes read it: the event lane writes the shape and, off the tank (Air Support's binoculars, the drone's feed, the
//   gunship), holds the tank's own events and shows them back on the tank if still fresh, a crew's danger and the battle's
//   turns showing in every view; the condition lane takes the tank's conditions down off the tank and raises the ones
//   still raised back on it;
// - the air subject has one lane: Air Support raises plates in the condition lane alone (no event), so no two notices
//   on one air subject show at once.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOTICE_KINDS, VIEW_HOLD_MS, noticeKind, shownInView } from './noticeKinds.ts';
import { NOTICE_PRIORITY } from './battleNotices.ts';
import { createBattleEventLane, EVENT_HOLD_MS } from './battleNoticeEvents.ts';

// ---- the table
const SUBJECTS = new Set(['tank', 'crew', 'air', 'battle', 'link', 'teaching']);
for (const [kind, declared] of Object.entries(NOTICE_KINDS)) {
  assert.ok(SUBJECTS.has(declared.subject), `${kind}: a subject`);
  assert.ok(declared.shape === 'plate' || declared.shape === 'pill', `${kind}: a shape`);
  if (declared.shape === 'pill') assert.ok(!declared.art, `${kind}: a pill carries no art`);
  if (declared.subject === 'air') assert.ok(declared.shape === 'plate' && declared.art, `${kind}: an air plate carries its airframe`);
}
assert.equal(noticeKind('nonsense'), NOTICE_KINDS.objective, 'an unknown kind reads as a battle plate');
for (const view of ['binoculars', 'drone', 'gunship']) {
  assert.equal(shownInView('ammoTypeEmpty', view), false, `the tank's own held off ${view}`);
  for (const kind of ['fire', 'scuttle', 'airIncoming', 'objective', 'link', 'hint']) assert.equal(shownInView(kind, view), true, `${kind} shows in ${view}`);
}
for (const kind of Object.keys(NOTICE_KINDS)) assert.equal(shownInView(kind, 'tank'), true, `${kind} shows from the tank`);

// ---- the raises: each names a kind the table declares (TypeScript holds the type; this holds the literals and the art)
const OWNERS = ['src/ui/hud.ts', 'src/ui/airSupportHud.ts', 'src/ui/firstUseHints.ts', 'src/ui/multiplayerStatus.ts', 'src/game/pointerLockFeedbackRuntime.ts'];
let named = 0;
for (const file of OWNERS) {
  const source = readFileSync(file, 'utf8');
  for (const [, kind] of source.matchAll(/\bkind: '([A-Za-z]+)'/g)) {
    if (!Object.hasOwn(NOTICE_KINDS, kind)) continue;
    named++;
  }
  for (const [call] of source.matchAll(/(?:events\.raise|\.condition)\(\{[^]{0,200}/g)) {
    assert.match(call, /\bkind[:,]/, `${file}: a raise names its kind: ${call.slice(0, 90)}`);
  }
}
assert.ok(named >= 30, `the raises name declared kinds (${named})`);
const hud = readFileSync('src/ui/hud.ts', 'utf8');
assert.match(hud, /kind: 'autoAimOn'[^\n]*\n?[^\n]*art: targetSpecId/, 'the auto-aim lock, an art kind, carries its target');
const air = readFileSync('src/ui/airSupportHud.ts', 'utf8');
assert.doesNotMatch(air, /BATTLE_EVENT/, 'the air subject raises no event: one lane');
assert.match(air, /notices\.condition\(\{ kind, id,/, 'its plates are the condition lane\'s');
// the HUD tells both lanes what the crew looks through, each frame
assert.match(hud, /const noticeView: NoticeView = flier\?\.aerial\?\.active \? \(flier\.aerial\.kind === 'gunship' \? 'gunship' : 'drone'\)\s*: strikeView\.open \? 'binoculars' : 'tank';/);
assert.match(hud, /events\.view\(noticeView\);\s*if \(!ownsFramePlayer\) battleNotices\.view\(noticeView\);/, 'both lanes, the condition lane from the page\'s HUD');
// the condition lane's hold
const lane = readFileSync('src/ui/battleNotices.ts', 'utf8');
// (battle-teardown-276: every condition is kept under its battle's scope; a tank one is held off the tank)
assert.match(lane, /raised\.set\(options\.id, options\);\s*if \(shownInView\(options\.kind, view\)\) show\(options\);/,
  'a tank condition raised off the tank waits');
assert.match(lane, /for \(const options of raised\.values\(\)\) \{\s*if \(noticeKind\(options\.kind\)\.subject !== 'tank'\) continue;\s*if \(shownInView\(options\.kind, next\)\) show\(options\); else takeDown\(options\.id\);/,
  'a view change takes them down or raises them again');
assert.match(lane, /dismiss\(id\) \{\s*raised\.delete\(id\);/, 'one dismissed while held does not come back');
assert.match(lane, /shape: noticeKind\(kind\)\.shape/, 'the kit draws the kind\'s shape');

// ---- the event lane, live: the shape written; the tank's own held off the tank and back on it
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
    now = next[1].at; timers.delete(next[0]); next[1].fn();
  }
  now = end;
};
function element() {
  const classes = new Set(), attrs = new Map();
  return {
    dataset: {}, innerHTML: '', children: [],
    classList: { add: (c) => classes.add(c), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: (k) => attrs.get(k) ?? null,
    append(child) { this.children.push(child); },
    get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); for (const c of v.split(' ')) if (c) classes.add(c); },
  };
}
try {
  const events = createBattleEventLane({ root: element(), doc: { createElement: () => element() }, now: () => now, keyLine: () => '' });
  const seat = events.el;
  const text = () => (seat.classList.contains('show') ? /cot-c-notice__text">([^<]*)</.exec(seat.innerHTML)?.[1] ?? null : null);
  const { threat, turned, answered } = NOTICE_PRIORITY;
  const ammo = { kind: 'ammoTypeEmpty', text: 'AMMUNITION TYPE EMPTY', priority: threat, severity: 'error' };
  const flag = { kind: 'objective', text: 'FLAG CAPTURED', priority: turned, severity: 'success' };
  const aps = { kind: 'apsIntercepted', text: 'APS INTERCEPTED', priority: answered, severity: 'success' };

  events.raise(aps);
  assert.equal(text(), 'APS INTERCEPTED');
  assert.equal(seat.dataset.shape, 'pill', 'a one-line status is the pill');
  // the binoculars come up: the shown tank event is taken down and held, a new one held, the battle's turn shows
  events.view('binoculars');
  assert.equal(text(), null, 'the tank\'s own event leaves with the view');
  events.raise(ammo);
  assert.equal(text(), null, 'and one raised now waits behind the binoculars');
  events.raise(flag);
  assert.equal(text(), 'FLAG CAPTURED', 'the battle turning shows in every view');
  assert.equal(seat.dataset.shape, 'plate', 'on the hexagon plate');
  advance(EVENT_HOLD_MS + 50);
  assert.equal(text(), null);
  // back on the tank: the held ones still fresh show, the higher rung first
  events.view('tank');
  assert.equal(text(), 'AMMUNITION TYPE EMPTY', 'restored when the crew returns to the tank');
  advance(EVENT_HOLD_MS + 50);
  assert.equal(text(), 'APS INTERCEPTED', 'and the other after it');
  advance(EVENT_HOLD_MS + 50);
  // one held past VIEW_HOLD_MS no longer applies
  events.view('drone');
  events.raise({ ...ammo, text: 'MISSILES DEPLETED' });
  advance(VIEW_HOLD_MS + 100);
  events.view('tank');
  assert.equal(text(), null, 'a held event past its time is dropped');
  // the gunship too; the same event on the tank shows at once
  events.view('gunship');
  events.raise({ ...aps, text: 'ARMOUR OVERLAY ON' });
  assert.equal(text(), null);
  events.view('tank');
  assert.equal(text(), 'ARMOUR OVERLAY ON');
} finally {
  globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear;
}

console.log(`noticeKinds.selftest: PASS (${Object.keys(NOTICE_KINDS).length} kinds, each a subject and a shape; the raises name them; `
  + 'the tank\'s own held off the binoculars, the drone and the gunship and restored on the tank; the air subject one lane)');
