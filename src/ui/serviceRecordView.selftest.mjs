import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { installBattleRecords } = await import('../game/profile.ts');
const { installServiceRecord, getServiceRecord, markServiceRecordSeen, MEDALS, ACHIEVEMENTS } = await import('../game/serviceRecord.ts');
const { RECORD_TABS, recordSummary, recordTabMarkup, recordTabForKey, recordFocusWrap } = await import('./serviceRecordView.ts');

// Keyboard: arrows rove the tabs with wrap-around, Home/End jump to the ends, other keys belong to the browser.
assert.equal(recordTabForKey('ArrowRight', 'overview'), 'medals');
assert.equal(recordTabForKey('ArrowLeft', 'overview'), 'history', 'wraps backwards');
assert.equal(recordTabForKey('ArrowRight', 'history'), 'overview', 'wraps forwards');
assert.equal(recordTabForKey('End', 'medals'), 'history');
assert.equal(recordTabForKey('Home', 'achievements'), 'overview');
for (const key of ['Enter', ' ', 'Tab', 'ArrowDown', 'a']) assert.equal(recordTabForKey(key, 'medals'), null, `${JSON.stringify(key)} is left to the browser`);
// Tab stays inside the dialog: it wraps at either end, enters at the right end from outside, and otherwise moves on.
const order = ['close', 'tab', 'panel', 'row1', 'row2'];
assert.equal(recordFocusWrap(order, 'row2', true, false), 'close', 'Tab from the last control returns to the first');
assert.equal(recordFocusWrap(order, 'close', true, true), 'row2', 'Shift+Tab from the first goes to the last');
assert.equal(recordFocusWrap(order, 'tab', true, false), null, 'inside, the browser moves focus');
assert.equal(recordFocusWrap(order, null, false, false), 'close', 'focus outside enters at the first control');
assert.equal(recordFocusWrap(order, null, false, true), 'row2');
assert.equal(recordFocusWrap([], null, false, false), null);
const { medalSVG, achievementSVG } = await import('./medalArt.ts');

const handlers = new Map();
const bus = {
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
  emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
};
let clock = 0;
const teams = { me: 'player', e1: 'enemy', e2: 'enemy', e3: 'enemy', e4: 'enemy' };
installBattleRecords(bus);
installServiceRecord(bus, {
  playerId: () => 'me', playerTeam: () => 'player', teamOf: (id) => teams[id] ?? null, gameMode: () => 'standard',
  clockS: () => clock, playerHpFraction: () => 1, playerMaxHp: () => 2000, playerNation: () => 'Japan',
  playerAerialKind: () => null, respawns: () => false,
});
const names = { vehicle: (id) => `veh:${id}`, map: (id) => `map:${id}`, modeIcon: () => 'modeStandard' };

// An empty record still renders every tab.
for (const tab of RECORD_TABS) assert.ok(recordTabMarkup(tab, names).length > 100, `${tab} renders before any battle`);
assert.match(recordTabMarkup('history', names), /cot-record-empty/);

// One battle: a three-kill chain, then a kill 80 s later.
bus.emit('ui:battleStart', { specId: 'type10', mapId: 'arctic' });
let shell = 0;
const kill = (target, t) => {
  clock = t;
  shell++;
  bus.emit('shell:fired', { shooterId: 'me', shellId: shell, caliberMm: 120 });
  bus.emit('shell:hit', { attackerId: 'me', targetId: target, shellId: shell, damage: 2100, kind: 'pen', destroyed: true, flightDistM: 200 });
  bus.emit('tank:destroyed', { id: target, killerId: 'me', specId: `spec-${target}`, cause: 'shot' });
};
kill('e1', 30); kill('e2', 36); kill('e3', 44); kill('e4', 124);
bus.emit('battle:ended', { result: 'victory', mapId: 'arctic', durationS: 200, gameMode: 'standard', roster: [] });

const view = getServiceRecord();
const summary = recordSummary(view);
assert.equal(summary.counts.medals, `${Object.keys(view.medals).length}/${MEDALS.length}`);
assert.match(summary.chips, /cot-record-chip signature/);

const overview = recordTabMarkup('overview', names, view);
for (const id of ['chain_of_thought', 'step_by_step', 'zero_shot', 'few_shot']) assert.ok(overview.includes(medalNameOf(id)), `overview lists ${id}`);
const career = overview.slice(0, overview.indexOf('<div class="cot-record-cards">'));
assert.doesNotMatch(career, /cot-record-ring|--record-pct/, 'win rate is a regular stat, never a clipped badge');
assert.match(career, /cot-record-outcome win-rate.*?<strong>100%<\/strong>/);
const statIcons = [...career.matchAll(/data-stat-icon="([^"]+)"/g)].map(match => match[1]);
assert.equal((career.match(/<svg /g) || []).length, 10, 'every stat resolves to real vector artwork');
assert.equal(statIcons.length, 10, 'each career stat has its own adjacent vector icon');
assert.equal(new Set(statIcons).size, 10, 'career icons distinguish all ten stats');
assert.match(overview, /cot-record-reasoning/);
assert.match(overview, /cot-record-latest-medal/);

const medals = recordTabMarkup('medals', names, view);
assert.equal((medals.match(/<article class="cot-record-medal/g) || []).length, MEDALS.length, 'every medal has a card');
assert.ok(/data-medal="chain_of_thought"/.test(medals) && /cot-record-medal is-earned is-new" data-medal="chain_of_thought"/.test(medals),
  'an unseen earned medal is marked new');
assert.equal((medals.match(/<section class="cot-record-medal-group"/g) || []).length, 5, 'five medal groups');

const achievements = recordTabMarkup('achievements', names, view);
assert.equal((achievements.match(/<article class="cot-record-ach /g) || []).length, ACHIEVEMENTS.length);
assert.match(achievements, /data-achievement="chain_thinker"/);
assert.match(achievements, /role="progressbar"/);

const history = recordTabMarkup('history', names, view);
assert.equal((history.match(/<details class="cot-record-battle result-victory"/g) || []).length, 1);
assert.match(history, /veh:type10/);
assert.match(history, /map:arctic/);
assert.equal((history.match(/<li class="linked">/g) || []).length, 2, 'the second and third kills link into a chain; the fourth stands alone');
assert.equal((history.match(/<li class="">/g) || []).length, 2);
assert.match(history, /veh:spec-e1/);

// Seen: the marks go, the awards stay.
markServiceRecordSeen();
const seen = getServiceRecord();
assert.deepEqual(seen.unseen, []);
assert.ok(!/is-new/.test(recordTabMarkup('medals', names, seen)));

// Artwork: one gradient namespace per drawing, a locked variant, three tier pips.
const a = medalSVG(MEDALS[0], 48);
const b = medalSVG(MEDALS[0], 48);
const idOf = (svg) => svg.match(/id="(cm\d+)m"/)[1];
assert.notEqual(idOf(a), idOf(b), 'two drawings never share gradient ids');
assert.match(a, /viewBox="0 0 64 84" width="48" height="63"/);
assert.match(medalSVG(MEDALS[4], 40, { locked: true }), /is-locked/);
for (const medal of MEDALS) assert.ok(medalSVG(medal, 32).includes('<svg') && medalSVG(medal, 32).includes('</svg>'), medal.id);
assert.equal((achievementSVG(ACHIEVEMENTS[0], 2, 40).match(/<polygon/g) || []).length, 3);
assert.match(achievementSVG(ACHIEVEMENTS[0], 0, 40), /is-locked/);

function medalNameOf(id) {
  return { chain_of_thought: 'Chain of Thought', step_by_step: 'Let Me Think Step by Step', zero_shot: 'Zero-Shot', few_shot: 'Few-Shot' }[id];
}

console.log('serviceRecordView selftest: tabs, new marks, chained kill traces and medal artwork passed');
