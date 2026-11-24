// The battle's own actions in a recording (replay-system, game/replay/battleActions.ts; no world, no DOM):
//   - every call of the solo runtime (game/soloBattleAccess.ts SoloBattleRuntime) is classified once: recorded, or the
//     step, the setup, a read, or the Leave that ends the recording; a planted call in neither fails;
//   - the replay runner implements exactly the recorded calls, and main.ts reaches them only through the recorder's
//     wrapper (never the runtime's own, which would change a battle its replay never sees);
//   - each recorded call, made as main.ts makes it, is recorded once with its arguments (a training cue's actor key as the
//     action's key), survives the ACTIONS section's JSON, and replays as the same call on the replayed battle; a call
//     naming another battle is not recorded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECORDED_BATTLE_RULES, UNRECORDED_BATTLE_RULES, isBattleAction, replayBattleAction, wrapBattleRules } from './battleActions.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

/** The runtime's calls, as its interface lists them. */
function runtimeCalls(source) {
  const body = /interface SoloBattleRuntime \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(body, 'soloBattleAccess.ts declares SoloBattleRuntime');
  return [...body[1].matchAll(/^\s*([A-Za-z]\w*)\(/gm)].map((match) => match[1]);
}
const unrecorded = Object.values(UNRECORDED_BATTLE_RULES).flat();
function classify(calls) {
  const known = new Set([...RECORDED_BATTLE_RULES, ...unrecorded]);
  return {
    unclassified: calls.filter((name) => !known.has(name)),
    both: RECORDED_BATTLE_RULES.filter((name) => unrecorded.includes(name)),
    twice: unrecorded.filter((name, i) => unrecorded.indexOf(name) !== i),
    stale: [...known].filter((name) => !calls.includes(name)),
  };
}

const accessSource = read('../soloBattleAccess.ts');
const calls = runtimeCalls(accessSource);
assert.ok(calls.length >= RECORDED_BATTLE_RULES.length + unrecorded.length, `the runtime lists its calls (${calls.join(', ')})`);
const verdict = classify(calls);
assert.deepEqual(verdict.unclassified, [], `solo runtime calls neither recorded nor declared unrecorded (battleActions.ts): ${verdict.unclassified.join(', ')}`);
assert.deepEqual(verdict.both, [], 'a call is recorded or unrecorded, not both');
assert.deepEqual(verdict.twice, [], 'an unrecorded call has one reason');
assert.deepEqual(verdict.stale, [], 'the lists name only calls the runtime has');

// negative control: a new call on the runtime, in neither list, is caught
const planted = accessSource.replace('  simStep(...args: RuntimeValue[]): RuntimeValue;\n',
  '  simStep(...args: RuntimeValue[]): RuntimeValue;\n  plantBattleChange(...args: RuntimeValue[]): RuntimeValue;\n');
assert.notEqual(planted, accessSource, 'the control plants its call');
assert.deepEqual(classify(runtimeCalls(planted)).unclassified, ['plantBattleChange'], 'an unclassified call fails the check');

// the replay runner implements exactly the recorded calls
const runnerTable = /const BATTLE_RULES = \{([^}]*)\}/.exec(read('./replayRunner.ts'));
assert.ok(runnerTable, 'replayRunner.ts keeps its BATTLE_RULES table');
assert.deepEqual(runnerTable[1].split(',').map((name) => name.trim()).filter(Boolean).sort(), [...RECORDED_BATTLE_RULES].sort(),
  'replayRunner.ts BATTLE_RULES is RECORDED_BATTLE_RULES');

// main.ts takes every recorded call from the recorder's wrapper, and never the runtime's own
const main = read('../../main.ts');
const wrapped = /const \{([^}]*)\} =\s*replayRecorder\.wrapBattleRules\(\{([^}]*)\}\)/.exec(main);
assert.ok(wrapped, 'main.ts binds the battle actions from replayRecorder.wrapBattleRules');
const bound = wrapped[1].split(',').map((name) => name.trim()).filter(Boolean).sort();
assert.deepEqual(bound, [...RECORDED_BATTLE_RULES].sort(), 'main.ts binds every recorded call from the wrapper');
for (const name of RECORDED_BATTLE_RULES) {
  assert.ok(wrapped[2].includes(`${name}: soloBattleRuntime.${name}`), `the wrapper is handed the runtime's ${name}`);
  const direct = main.split(`soloBattleRuntime.${name}`).length - 1;
  assert.equal(direct, 1, `main.ts reaches the runtime's ${name} only to wrap it (${direct} mentions)`);
}
const destructured = /const \{([^}]*)\} = soloBattleRuntime;/.exec(main);
assert.ok(destructured, 'main.ts destructures the rest of the runtime');
const leaked = RECORDED_BATTLE_RULES.filter((name) => new RegExp(`\\b${name}\\b`).test(destructured[1]));
assert.deepEqual(leaked, [], 'no recorded call is taken from the runtime unwrapped');

// the round trip: each recorded call as main.ts makes it, recorded, through the ACTIONS section's JSON, then replayed
const liveGame = { id: 'live' }, otherGame = { id: 'other' }, replayGame = { id: 'replay' };
/** main.ts's call of each recorded rule (the tutorial's ports and the proving controls). */
const LIVE = {
  cueTrainingActor: (game) => [game, 'sentry3', true],
  setTrainingCheckpoint: (game) => [game, -326.15, 30.115],
  finishTrainingBattle: (game) => [game],
  resetProvingRange: (game) => [game],
  setProvingTargetsMoving: (game) => [game, true],
};
assert.deepEqual(Object.keys(LIVE).sort(), [...RECORDED_BATTLE_RULES].sort(), 'the round trip covers every recorded call');
const shape = (args, game) => args.map((value) => (value === game ? 'game' : value));
for (const kind of RECORDED_BATTLE_RULES) {
  const liveSeen = [];
  const rules = Object.fromEntries(RECORDED_BATTLE_RULES.map((name) => [name, (...args) => {
    if (name === kind) liveSeen.push(args);
    return name === 'cueTrainingActor';
  }]));
  const recorded = [];
  const wrappedRules = wrapBattleRules(rules, (game) => game === liveGame,
    (k, args, key) => recorded.push({ tick: 7, seat: -1, kind: k, args, ...(key !== undefined ? { key } : {}) }));
  wrappedRules[kind](...LIVE[kind](otherGame));
  assert.equal(recorded.length, 0, `${kind}: a call naming another battle is not recorded`);
  const returned = wrappedRules[kind](...LIVE[kind](liveGame));
  assert.equal(returned, kind === 'cueTrainingActor', `${kind}: the wrapper returns the rule's own result`);
  assert.equal(recorded.length, 1, `${kind}: one recorded action`);
  const action = JSON.parse(JSON.stringify(recorded[0])); // the ACTIONS section is JSON
  assert.ok(isBattleAction(action.kind), `${kind}: a battle action`);
  const replaySeen = [];
  const replayRules = Object.fromEntries(RECORDED_BATTLE_RULES.map((name) => [name, (...args) => { replaySeen.push({ name, args }); }]));
  replayBattleAction(action, replayGame, replayRules);
  assert.equal(replaySeen.length, 1, `${kind}: replayed as one call`);
  assert.equal(replaySeen[0].name, kind, `${kind}: replayed as the same call`);
  assert.deepEqual(shape(replaySeen[0].args, replayGame), shape(liveSeen[1], liveGame), `${kind}: replayed with main.ts's arguments`);
}
assert.throws(() => replayBattleAction({ tick: 1, seat: -1, kind: 'plantBattleChange', args: [] }, replayGame, {}), /unknown battle action/);

console.log(`battleActions.selftest: the solo runtime's ${calls.length} calls are classified (${RECORDED_BATTLE_RULES.length} recorded, `
  + `${unrecorded.length} not: the step, the setup, reads, the Leave; a planted call fails); the runner implements the recorded ones and `
  + 'main.ts takes them only through the recorder; each recorded call (a training cue\'s key included) replays as main.ts made it');
