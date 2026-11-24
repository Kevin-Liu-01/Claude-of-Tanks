// The seat's discrete actions reach the recording (replay-system, docs/REPLAY.md §1 "Side stream"). A key handler changes the
// simulation between two steps through its rules port (game/playerBattleActions.ts ActionRules); a rule the recorder does
// not wrap makes a recording that drifts the first time it is used (275's self-right key, hull turbo and air spin did).
// Here: every rule of the port is either recorded or read-only, never both and never neither; every recorded rule makes a
// round trip (the call the handler made, recorded, replayed as the same call on the same hull with the same numbers);
// the replay runner's table is the recorded list; and a planted rule the lists do not name fails the check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READ_RULES, RECORDED_RULES, replaySeatAction, wrapRecordedRules } from './seatActions.ts';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** The names a `Pick<…, | 'a' | 'b'>` named `ActionRules` lists. */
function portRules(source) {
  const match = /type ActionRules = Pick<\w+,([^>]*)>/.exec(source);
  assert.ok(match, 'playerBattleActions.ts declares ActionRules as a Pick of the client access');
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

/** Port rules neither list names, rules both name, and listed rules the port no longer has. */
function classify(port) {
  const recorded = new Set(RECORDED_RULES), readOnly = new Set(READ_RULES);
  return {
    unclassified: port.filter((name) => !recorded.has(name) && !readOnly.has(name)),
    both: port.filter((name) => recorded.has(name) && readOnly.has(name)),
    stale: [...recorded, ...readOnly].filter((name) => !port.includes(name)),
  };
}

const actionsSource = read('../playerBattleActions.ts');
const port = portRules(actionsSource);
assert.ok(port.length >= RECORDED_RULES.length, 'the port lists its rules');
const verdict = classify(port);
assert.deepEqual(verdict.unclassified, [], `rules of the port the recorder neither records nor declares read-only (seatActions.ts RECORDED_RULES / READ_RULES): ${verdict.unclassified.join(', ')}`);
assert.deepEqual(verdict.both, [], 'a rule is recorded or read-only, not both');
assert.deepEqual(verdict.stale, [], 'the lists name only rules the port has');

// negative control: a new rule on the port, in neither list, is caught
const planted = actionsSource.replace("  | 'requestHullAirSpin'\n", "  | 'requestHullAirSpin'\n  | 'requestPlantedAction'\n");
assert.notEqual(planted, actionsSource, 'the control plants its rule');
assert.deepEqual(classify(portRules(planted)).unclassified, ['requestPlantedAction'], 'an unclassified rule fails the check');

// the replay runner implements exactly the recorded rules
const runnerTable = /const RULES = \{([^}]*)\}/.exec(read('./replayRunner.ts'));
assert.ok(runnerTable, 'replayRunner.ts keeps its RULES table');
assert.deepEqual(runnerTable[1].split(',').map((name) => name.trim()).filter(Boolean).sort(), [...RECORDED_RULES].sort(),
  'replayRunner.ts RULES is RECORDED_RULES');

// the round trip: each recorded rule called as its handler calls it, recorded, then replayed on the same hull
const bus = { emit() {} };
const TIME_S = 12.5;
const hull = () => ({ combat: {}, state: {}, specialAction: null, input: { throttle: 0.375, steer: -0.625 }, spec: {} });
/** The handler's call of each recorded rule (game/playerBattleActions.ts). */
const LIVE = {
  selectShell: (h) => [h.combat, 2, h.spec],
  repairAllModules: (h) => [h.combat],
  startMagazineReload: (h) => [h.combat, h.spec],
  activateSpecialAction: (h) => [h],
  useSoloConsumable: (h) => [h, bus, 1, TIME_S],
  requestTankSelfRight: (h) => [h.state, 0.5],
  requestTankJump: (h) => [h.state, 7.25, 0.5],
  pressSelfRight: (h) => [h, TIME_S],
  requestHullTurbo: (h) => [h, TIME_S],
  requestHullAirSpin: (h) => [h, TIME_S],
};
assert.deepEqual(Object.keys(LIVE).sort(), [...RECORDED_RULES].sort(), 'the round trip covers every recorded rule');

const shape = (args, h) => args.map((v) => (v === h ? 'hull' : v === h.combat ? 'combat' : v === h.state ? 'state' : v === h.spec ? 'spec' : v === bus ? 'bus' : v));
for (const kind of RECORDED_RULES) {
  const liveHull = hull();
  const liveSeen = [];
  const port = Object.fromEntries([...RECORDED_RULES, ...READ_RULES].map((name) => [name, (...args) => {
    if (name === kind) liveSeen.push({ args: shape(args, liveHull), input: { ...liveHull.input } });
    return true;
  }]));
  const recorded = [];
  const wrapped = wrapRecordedRules(port, (owner) => (owner === liveHull || owner === liveHull.combat || owner === liveHull.state ? 0 : -1),
    (seat, k, args) => recorded.push({ tick: 1, seat, kind: k, args }));
  for (const name of READ_RULES) wrapped[name](liveHull.combat);
  wrapped[kind](...LIVE[kind](liveHull));
  assert.equal(recorded.length, 1, `${kind}: one recorded action (and none for the read-only rules)`);
  const action = JSON.parse(JSON.stringify(recorded[0])); // the ACTIONS section is JSON

  const replayHull = hull();
  replayHull.input.throttle = 0; replayHull.input.steer = 0; // the replayed seat holds its quantized controls, not the handler's
  const replaySeen = [];
  const rules = Object.fromEntries(RECORDED_RULES.map((name) => [name, (...args) => {
    replaySeen.push({ name, args: shape(args, replayHull), input: { ...replayHull.input } });
  }]));
  replaySeatAction(action, replayHull, { rules, bus, timeS: TIME_S });
  assert.equal(replaySeen.length, 1, `${kind}: replayed as one call`);
  assert.equal(replaySeen[0].name, kind, `${kind}: replayed as the same rule`);
  assert.deepEqual(replaySeen[0].args, liveSeen[0].args, `${kind}: replayed with the handler's arguments`);
  if (kind === 'pressSelfRight' || kind === 'requestHullAirSpin') {
    assert.deepEqual(replaySeen[0].input, liveSeen[0].input, `${kind} reads the throttle and steer the handler found`);
    assert.deepEqual(replayHull.input, { throttle: 0, steer: 0 }, 'and the seat keeps its own controls after the call');
  }
}

console.log(`seatActions.selftest: the ${port.length} rules of the handlers' port are classified (${RECORDED_RULES.length} recorded, `
  + `${READ_RULES.length} read-only; a planted rule fails); each recorded rule replays as the handler's call; replayRunner implements them`);
