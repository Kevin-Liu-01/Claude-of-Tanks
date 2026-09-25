import assert from 'node:assert/strict';
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';
import { buildJevTeamState, createJevCommander, createJevFetchTransport } from './jevCommander.ts';
import { buildJevQuestions, JEV_FOCUS_NONE, JEV_TARGET_NONE, validateJevRequest, validateJevState } from './jevProtocol.ts';

// The commander is driven headless with real controllers (game/ai.ts) on a
// fixture battle and a fake transport: the team document, the question set
// the proxy would build from it, the answer application through setOrder, the
// freshness / confidence gates, the fallback and back-off, the budget, the
// quiet cadence, the order expiry and the absence of personal or positional
// data are all observed here. The browser transport is exercised with a fake
// fetch.

const hf = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

function entity(id, specId, team, x, z, { yaw = 0, isPlayer = false, hp = 1000 } = {}) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state, isPlayer, bot: !isPlayer,
    combat: {
      hp, maxHp: 1000, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      ammo: [20, 10], ammoCapacity: [30, 10],
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
      magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

function wire(tanks, seedBase = 41) {
  tanks.forEach((tank, index) => {
    if (tank.isPlayer) return;
    tank.aiCtl = createAI(tank, {
      difficulty: 'normal', rng: mulberry32(seedBase + index),
      deps: {
        heightField: hf, raycast: () => null,
        getEnemies: () => tanks.filter((other) => other.team !== tank.team && !other.combat.destroyed),
        getAllies: () => tanks.filter((other) => other !== tank && other.team === tank.team && !other.combat.destroyed),
        getObstacles: () => [], spotting: { isSpotted: () => true },
      },
    });
  });
  return tanks;
}

/** A 3+human v 3 fixture on a zone map: the enemy team is spotted except one hull the spotting sim hides. */
function fixture() {
  const tanks = wire([
    entity('m1a2', 'm1a2', 'player', 0, 0, { isPlayer: true }),
    entity('leo2a6', 'leo2a6', 'player', -30, 10),
    entity('t90m', 't90m', 'player', 30, 5, { hp: 420 }),
    entity('strv103', 'strv103', 'player', -10, -40),
    entity('t72b3m', 't72b3m', 'enemy', 40, 300, { yaw: Math.PI }),
    entity('kv2', 'kv2', 'enemy', -60, 320, { yaw: Math.PI / 2 }),
    entity('t90ms', 't90ms', 'enemy', 0, 700, { yaw: Math.PI }),
  ]);
  const hidden = new Set(['t90ms']);
  const zones = [
    { id: 'A', x: 0, z: 150, owner: 'bravo', contested: true },
    { id: 'B', x: -200, z: 100, owner: null, contested: false },
    { id: 'C', x: 200, z: 100, owner: 'alpha', contested: false },
  ];
  let timeS = 0;
  const view = {
    get timeS() { return timeS; },
    mode: 'zone_control', timeLimitS: 900, tanks,
    spotting: { isSpotted: (id, team) => (team === 'player' ? !hidden.has(id) : true) },
    modeState: { score: { alpha: 120, bravo: 90.4 }, target: 750, zones, flags: null, ball: null, goals: null, line: null },
    objectiveFor: (tank) => (tank.team === 'player' ? { x: 0, z: 150, radiusM: 30 } : { x: 0, z: 150, radiusM: 30 }),
  };
  const byId = (id) => tanks.find((tank) => tank.id === id);
  return { tanks, view, zones, byId, advance: (seconds) => { timeS += seconds; }, set: (seconds) => { timeS = seconds; } };
}

/** A transport that parks every request until the receipt answers it (oldest first by default). */
function fakeTransport() {
  const requests = [];
  const pending = [];
  let mode = 'hold';
  const transport = {
    sid: 'session-test-0001',
    send(body, signal) {
      const request = { body: JSON.parse(JSON.stringify(body)), signal };
      requests.push(request);
      if (mode === 'fail') return Promise.resolve({ ok: false, error: 'upstream_timeout', status: 504 });
      if (mode === 'limited') return Promise.resolve({ ok: false, error: 'session_rate_limited', status: 429, retryAfterMs: 12_000 });
      if (mode === 'reject') return Promise.reject(new TypeError('network down'));
      return new Promise((resolve) => { pending.push({ request, resolve }); });
    },
  };
  /** Answer one parked request (the oldest by default) with what `make` returns per question id. */
  const answer = (make, index = 0) => {
    const [{ request, resolve }] = pending.splice(index, 1);
    const questions = buildJevQuestions(request.body.state);
    const answers = {};
    for (const [id, question] of Object.entries(questions)) {
      const made = make(id, question);
      if (made) answers[id] = made;
    }
    resolve({ ok: true, body: { v: 1, model: 'jev-1.13.0', answers, usage: { input_tokens: 3000, output_tokens: 150 }, latencyMs: 310 } });
    return request;
  };
  return { transport, requests, answer, setMode: (next) => { mode = next; }, get pending() { return pending.length > 0; } };
}

const confident = (choiceId, options, confidence = 0.9) => ({
  type: 'choice', choice: choiceId, confidence,
  probabilities: Object.fromEntries(options.map((option) => [option, option === choiceId ? confidence : (1 - confidence) / Math.max(1, options.length - 1)])),
});
const scoreAnswer = (score, confidence = 0.7) => ({ type: 'score', score, confidence, probabilities: { 0: 0.1, 1: 0.2, 2: 0.5, 3: 0.2 } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

{
  console.log('[1] the team document: labels, spotting, bearings and distances, no coordinates, no names');
  const f = fixture();
  f.set(245);
  const player = buildJevTeamState(f.view, 'player', null);
  const state = player.state;
  assert.equal(validateJevState(state).ok, true, `the document validates: ${JSON.stringify(validateJevState(state))}`);
  assert.equal(validateJevRequest({ v: 1, sid: 'session-test-0001', kind: 'team_orders', state }).ok, true);
  assert.deepEqual(Object.keys(state.our_tanks), ['b1', 'b2', 'b3'], 'three bots, the human player is not a bot');
  assert.deepEqual([...player.labels.botIds.entries()], [['b1', 'leo2a6'], ['b2', 'strv103'], ['b3', 't90m']], 'labels are assigned in id order');
  assert.deepEqual(Object.keys(state.enemies), ['e1', 'e2'], 'the hidden enemy is not in the document');
  assert.deepEqual([...player.labels.enemyIds.entries()], [['e1', 'kv2'], ['e2', 't72b3m']]);
  assert.equal(state.battle.alive.theirs, 3, 'the count of living enemies is a fact the team knows; their positions are not');
  assert.equal(state.battle.mode, 'zone_control');
  assert.match(state.battle.goal, /750 points/);
  assert.deepEqual(state.battle.score, { ours: 120, theirs: 90, target: 750 }, 'the player side is alpha');
  assert.equal(state.battle.elapsed_s, 245);
  assert.equal(state.battle.remaining_s, 655);
  assert.equal(state.battle.human_ally.vehicle, getSpec('m1a2').name, 'the allied view names the human as a teammate');
  assert.equal(state.battle.human_ally.hp, 1);
  const b3 = state.our_tanks.b3;
  assert.equal(b3.vehicle, getSpec('t90m').name);
  assert.equal(b3.class, 'main battle tank');
  assert.equal(b3.hp, 0.42);
  assert.equal(b3.ammo, 0.75);
  assert.equal(b3.gun, 'ready');
  assert.deepEqual(b3.sees.map((seen) => seen.id), ['e2', 'e1'], 'sees lists the spotted enemies nearest first');
  assert.equal(b3.sees[0].m, 300, 'distances are rounded to 10 m');
  assert.deepEqual(b3.objective, { bearing: 'N', distance_m: 150 }, 'the bot objective is a bearing and a distance from the bot');
  assert.equal(b3.nearest_ally_m, 30);
  assert.equal(b3.under_fire, false, 'no previous snapshot: nothing is under fire yet');
  const e2 = state.enemies.e2;
  assert.equal(e2.vehicle, getSpec('t72b3m').name);
  assert.equal(e2.human_player, false);
  assert.equal(e2.bearing, 'N');
  assert.equal(e2.facing, 'toward us', 'a hull whose nose points at the team centroid faces us');
  assert.equal(state.enemies.e1.facing, 'side-on');
  assert.deepEqual(e2.seen_by, ['b1', 'b2', 'b3']);
  assert.deepEqual(Object.keys(state.objectives), ['zone_a', 'zone_b', 'zone_c']);
  assert.deepEqual(state.objectives.zone_a, { kind: 'zone', owner: 'theirs', contested: true, distance_m: 160, bearing: 'N' });
  assert.equal(state.objectives.zone_c.owner, 'ours');
  const text = JSON.stringify(state);
  assert.doesNotMatch(text, /"(x|z|pos|name|nick|playerName|room)":/, 'no coordinate or name field leaves the browser');
  assert.doesNotMatch(text, /m1a2|t90m|leo2a6|IronMaus|Claude/, 'no entity id or nickname either — labels and vehicle names only');
  const enemyView = buildJevTeamState(f.view, 'enemy', null).state;
  assert.deepEqual(Object.keys(enemyView.our_tanks), ['b1', 'b2', 'b3']);
  assert.equal(enemyView.battle.human_ally, null);
  const human = Object.values(enemyView.enemies).find((row) => row.human_player);
  assert.ok(human && human.vehicle === getSpec('m1a2').name, 'the enemy view lists the human player as such');
  assert.equal(enemyView.battle.score.ours, 90, 'the enemy side is bravo');
  assert.equal(enemyView.objectives.zone_a.owner, 'ours');
  assert.match(enemyView.battle.goal, /750 points/);
  // under fire: a hull that lost hit points since the previous document
  f.byId('t90m').combat.hp = 300;
  const next = buildJevTeamState(f.view, 'player', player.hp).state;
  assert.equal(next.our_tanks.b3.under_fire, true);
  assert.equal(next.our_tanks.b1.under_fire, false);
  f.byId('t90m').combat.hp = 420;
  // the questions the proxy builds from it: one fan-out per team
  const questions = buildJevQuestions(state);
  assert.deepEqual(Object.keys(questions).sort(), ['fire_b1', 'fire_b2', 'fire_b3', 'focus', 'posture_b1', 'posture_b2', 'posture_b3',
    'target_b1', 'target_b2', 'target_b3', 'threat_b1', 'threat_b2', 'threat_b3'].sort(), 'four questions per seeing bot plus the team focus');
  assert.deepEqual(Object.keys(questions.target_b3.criteria), ['e2', 'e1', JEV_TARGET_NONE]);
  assert.deepEqual(Object.keys(questions.focus.criteria), ['zone_a', 'zone_b', 'zone_c', JEV_FOCUS_NONE]);
  const size = JSON.stringify({ state, questions, model: 'jev-latest' }).length;
  assert.ok(size < 12_000, `a 3-bot request is ${size} characters`);
  console.log(`  document ${JSON.stringify(state).length} chars, questions ${JSON.stringify(questions).length} chars, ${Object.keys(questions).length} questions`);
  // a mode without objectives asks no focus and the standard goal
  const standard = buildJevTeamState({ ...f.view, mode: 'standard', timeLimitS: 900, modeState: null, objectiveFor: () => null }, 'enemy', null).state;
  assert.deepEqual(standard.objectives, {});
  assert.equal(standard.battle.score, null);
  assert.equal(buildJevQuestions(standard).focus, undefined);
  assert.equal(standard.our_tanks.b1.objective, null);
  // a team with no living bot builds nothing
  for (const id of ['t72b3m', 'kv2', 't90ms']) f.byId(id).combat.destroyed = true;
  assert.equal(buildJevTeamState(f.view, 'enemy', null), null);
  for (const id of ['t72b3m', 'kv2', 't90ms']) f.byId(id).combat.destroyed = false;
}

{
  console.log('[2] one request per team on the cadence; answers become orders the controllers take');
  const f = fixture();
  const fake = fakeTransport();
  const commander = createJevCommander({ transport: fake.transport, teams: ['enemy', 'player'], cadenceS: 2, orderTtlS: 5, now: () => 0 });
  assert.equal(commander.commands(f.byId('t72b3m')), true);
  assert.equal(commander.commands(f.byId('leo2a6')), true);
  assert.equal(commander.commands(f.byId('m1a2')), false, 'the human player is never commanded');
  commander.step(f.view);
  assert.equal(fake.requests.length, 2, 'one request per team, each in flight on its own');
  assert.equal(fake.requests[0].body.sid, 'session-test-0001');
  assert.equal(fake.requests[0].body.kind, 'team_orders');
  assert.equal(fake.requests[0].body.v, 1);
  assert.deepEqual(Object.keys(fake.requests[0].body.state.our_tanks), ['b1', 'b2', 'b3'], 'the enemy document first');
  assert.equal(fake.requests[0].body.state.battle.human_ally, null);
  assert.equal(fake.requests[1].body.state.battle.human_ally !== null, true, 'the player document names the human ally');
  f.advance(SIM_DT);
  commander.step(f.view);
  assert.equal(fake.requests.length, 2, 'no second request while one is in flight for a team');
  // the player answer carries nothing usable: a fallback, nothing applied, nothing broken
  fake.answer(() => null, 1);
  await tick();
  f.advance(SIM_DT);
  commander.step(f.view);
  assert.equal(commander.stats('player').answered, 1);
  assert.equal(commander.stats('player').ordersApplied, 0);
  // the enemy answer: b1 (kv2) pushes at the human, b2 (t72b3m) flanks left, b3 (t90ms) holds without confidence
  const enemyLabels = { kv2: 'b1', t72b3m: 'b2', t90ms: 'b3' };
  const humanLabel = Object.entries(fake.requests[0].body.state.enemies).find(([, row]) => row.human_player)[0];
  f.set(2.5);
  fake.answer((id, question) => {
    if (id === `posture_${enemyLabels.kv2}`) return confident('push', Object.keys(question.criteria));
    if (id === `target_${enemyLabels.kv2}`) return confident(humanLabel, Object.keys(question.criteria), 0.8);
    if (id === `fire_${enemyLabels.kv2}`) return { type: 'noul', noul: 0.9 };
    if (id === `posture_${enemyLabels.t72b3m}`) return confident('flank_left', Object.keys(question.criteria));
    if (id === `target_${enemyLabels.t72b3m}`) return confident(JEV_TARGET_NONE, Object.keys(question.criteria));
    if (id === `fire_${enemyLabels.t72b3m}`) return { type: 'noul', noul: 0.2 };
    if (id === `posture_${enemyLabels.t90ms}`) return confident('hold', Object.keys(question.criteria), 0.2);
    if (id.startsWith('threat_')) return scoreAnswer(2.6);
    if (id === 'focus') return confident('zone_a', Object.keys(question.criteria));
    return null;
  });
  await tick();
  f.advance(SIM_DT);
  commander.step(f.view);
  const enemyStats = commander.stats('enemy');
  assert.equal(enemyStats.answered, 1);
  assert.equal(enemyStats.ordersApplied, 2, 'two confident postures became orders');
  assert.equal(enemyStats.lowConfidence, 1, 'the 0.2-confidence hold kept the classic brain');
  assert.equal(enemyStats.inputTokens, 3000);
  assert.equal(enemyStats.lastLatencyMs, 0);
  const kv2 = f.byId('kv2').aiCtl.debugInfo();
  assert.equal(kv2.orderPosture, 'push');
  assert.equal(kv2.orderTarget, 'm1a2', 'the target label resolved back to the entity id');
  assert.equal(kv2.orderFire, 'press');
  assert.equal(kv2.ordersTaken, 1);
  const t72 = f.byId('t72b3m').aiCtl.debugInfo();
  assert.equal(t72.orderPosture, 'flank_left');
  assert.equal(t72.orderTarget, null, 'a none target keeps the classic pick');
  assert.equal(t72.orderFire, 'hold');
  assert.equal(f.byId('t90ms').aiCtl.debugInfo().orderPosture, null);
  assert.equal(f.byId('leo2a6').aiCtl.debugInfo().orderPosture, null, 'the other team took no order from this answer');
  // the controllers act on the orders: the pushed bot claims the ordered target on its next perception tick
  for (let i = 0; i < 30; i++) f.byId('kv2').aiCtl.update(SIM_DT, f.view.timeS + i * SIM_DT);
  assert.equal(f.byId('kv2').aiCtl.targetId, 'm1a2', 'the ordered target takes the slot');
  assert.ok(f.byId('kv2').aiCtl.debugInfo().pressing, 'a push order presses');
  const applied = commander.orderLog.filter((entry) => entry.applied);
  assert.deepEqual(applied.map((entry) => [entry.team, entry.id, entry.posture, entry.target, entry.fire]),
    [['enemy', 'kv2', 'push', 'm1a2', 'press'], ['enemy', 't72b3m', 'flank_left', null, 'hold']]);
  assert.equal(commander.orderLog.find((entry) => entry.id === 't90ms').reason, 'low_confidence');
  assert.equal(applied[0].threat, 2.6);
  // orders expire on their own: after the ttl the controllers are classic again
  f.set(2.5 + SIM_DT + 5.01);
  f.byId('kv2').aiCtl.update(SIM_DT, f.view.timeS);
  assert.equal(f.byId('kv2').aiCtl.debugInfo().orderPosture, null, 'the order expired');
  commander.dispose();
}

{
  console.log('[3] freshness gates: stale answers, dead bots, hulls that changed a lot, unmapped postures');
  const f = fixture();
  const fake = fakeTransport();
  const commander = createJevCommander({ transport: fake.transport, teams: ['enemy'], cadenceS: 2, staleAfterS: 6, orderTtlS: 5, now: () => 0 });
  const answerAll = (posture = 'hold') => fake.answer((id, question) => {
    if (id.startsWith('posture_')) return confident(posture, Object.keys(question.criteria));
    if (id.startsWith('target_')) return confident(Object.keys(question.criteria)[0], Object.keys(question.criteria), 0.8);
    if (id.startsWith('fire_')) return { type: 'noul', noul: 0.5 };
    if (id.startsWith('threat_')) return scoreAnswer(1);
    return null;
  });
  commander.step(f.view);
  f.set(7);            // the answer arrives 7 s after it was asked
  answerAll();
  await tick();
  commander.step(f.view);
  assert.equal(commander.stats('enemy').discardedStale, 1);
  assert.equal(commander.stats('enemy').ordersApplied, 0, 'a stale answer is discarded whole');
  f.set(9);
  commander.step(f.view);
  f.byId('kv2').combat.destroyed = true;              // one bot died while the request was out
  f.byId('t72b3m').combat.hp = 300;                    // one lost 70% of its hull
  f.set(9.5);
  answerAll('push');
  await tick();
  commander.step(f.view);
  const stats = commander.stats('enemy');
  assert.equal(stats.discardedDead, 1);
  assert.equal(stats.discardedChanged, 1);
  assert.equal(stats.ordersApplied, 1, 'only the untouched bot took the order');
  assert.equal(f.byId('t90ms').aiCtl.debugInfo().orderPosture, 'push');
  assert.equal(f.byId('t72b3m').aiCtl.debugInfo().orderPosture, null);
  // a target that died or fell out of the team's spotting before the answer landed is dropped, the posture kept
  f.byId('kv2').combat.destroyed = false;
  f.byId('t72b3m').combat.hp = 1000;
  f.set(12);
  commander.step(f.view);
  const targetLabel = Object.entries(fake.requests.at(-1).body.state.enemies).find(([, row]) => row.human_player)[0];
  f.byId('m1a2').combat.destroyed = true;
  fake.answer((id, question) => {
    if (id.startsWith('posture_')) return confident('hold', Object.keys(question.criteria));
    if (id.startsWith('target_')) return question.criteria[targetLabel] ? confident(targetLabel, Object.keys(question.criteria)) : null;
    return null;
  });
  await tick();
  commander.step(f.view);
  assert.equal(f.byId('t72b3m').aiCtl.debugInfo().orderPosture, 'hold');
  assert.equal(f.byId('t72b3m').aiCtl.debugInfo().orderTarget, null, 'a dead target is never ordered');
  f.byId('m1a2').combat.destroyed = false;
  // a weak posture with a confident target is a target-only order: the target claim, no posture effect
  // (the request issued while the human was dead is answered empty first, so the next document lists it again)
  if (fake.pending) { fake.answer(() => null); await tick(); }
  f.set(15);
  commander.step(f.view);
  const humanLabelNow = Object.entries(fake.requests.at(-1).body.state.enemies).find(([, row]) => row.human_player)[0];
  fake.answer((id, question) => {
    if (id.startsWith('posture_')) return confident('push', Object.keys(question.criteria), 0.1);
    if (id.startsWith('target_')) return question.criteria[humanLabelNow] ? confident(humanLabelNow, Object.keys(question.criteria), 0.9) : null;
    return null;
  });
  await tick();
  commander.step(f.view);
  const targetOnly = f.byId('t72b3m').aiCtl.debugInfo();
  assert.equal(targetOnly.orderPosture, null, 'no posture effect below the bar');
  assert.equal(targetOnly.orderTarget, 'm1a2', 'the confident target is still ordered');
  assert.equal(commander.stats('enemy').targetOnly >= 1, true);
  assert.equal(commander.orderLog.filter((entry) => entry.reason === 'target_only').length >= 1, true);
  // capture without any objective and support without a teammate keep the classic brain
  const lone = fixture();
  for (const id of ['kv2', 't90ms']) lone.byId(id).combat.destroyed = true;
  const loneFake = fakeTransport();
  const loneCommander = createJevCommander({ transport: loneFake.transport, teams: ['enemy'], now: () => 0 });
  const loneView = { ...lone.view, mode: 'standard', modeState: null, objectiveFor: () => null, get timeS() { return lone.view.timeS; } };
  loneCommander.step(loneView);
  loneFake.answer((id, question) => (id.startsWith('posture_') ? confident('capture', Object.keys(question.criteria)) : null));
  await tick();
  loneCommander.step(loneView);
  assert.equal(loneCommander.stats('enemy').unmapped, 1, 'capture with no objective anywhere keeps the classic brain');
  lone.set(3);
  loneCommander.step(loneView);
  loneFake.answer((id, question) => (id.startsWith('posture_') ? confident('support', Object.keys(question.criteria)) : null));
  await tick();
  loneCommander.step(loneView);
  assert.equal(loneCommander.stats('enemy').unmapped, 2, 'support with no living teammate keeps the classic brain');
  assert.equal(loneCommander.orderLog.at(-1).reason, 'no_teammate');
  commander.dispose();
  loneCommander.dispose();
}

{
  console.log('[4] capture and support orders carry a point; the focus answer picks the capture objective');
  const f = fixture();
  const fake = fakeTransport();
  const commander = createJevCommander({ transport: fake.transport, teams: ['player'], now: () => 0 });
  commander.step(f.view);
  fake.answer((id, question) => {
    if (id === 'posture_b1') return confident('capture', Object.keys(question.criteria));
    if (id === 'posture_b3') return confident('support', Object.keys(question.criteria));
    if (id === 'focus') return confident('zone_b', Object.keys(question.criteria));
    return null;
  });
  await tick();
  commander.step(f.view);
  const leo = f.byId('leo2a6').aiCtl.debugInfo();
  assert.equal(leo.orderPosture, 'capture');
  assert.equal(commander.orderLog.find((entry) => entry.id === 'leo2a6').applied, true);
  assert.equal(leo.wpCount, 1, 'a capture order routes the idle bot to the focus objective');
  f.byId('leo2a6').aiCtl.update(SIM_DT, f.view.timeS);
  const t90 = f.byId('t90m').aiCtl.debugInfo();
  assert.equal(t90.orderPosture, 'support');
  // the support point is the weakest living teammate — with the fixture's t90m ordered, that is the human at full
  // hull or the two bots; the weakest is chosen deterministically (t90m itself is excluded)
  assert.equal(t90.wpCount, 1, 'a support order routes to the weakest teammate');
  commander.dispose();
}

{
  console.log('[5] fallback and back-off: a failing proxy never stalls the battle, and the budget ends the requests');
  const f = fixture();
  const fake = fakeTransport();
  fake.setMode('fail');
  const commander = createJevCommander({ transport: fake.transport, teams: ['enemy'], cadenceS: 2, now: () => 0 });
  commander.step(f.view);
  await tick();
  f.set(1.5);           // the failure lands 1.5 s after the request went out
  commander.step(f.view);
  const stats = commander.stats('enemy');
  assert.equal(stats.failed, 1);
  assert.equal(stats.lastError, 'upstream_timeout');
  assert.equal(stats.backoffS, 2, 'the first failure backs off one cadence from the failure');
  f.set(2.5);
  commander.step(f.view);
  assert.equal(fake.requests.length, 1, 'no request inside the back-off');
  f.set(4.2);
  commander.step(f.view);
  assert.equal(fake.requests.length, 2, 'the next request goes out after the back-off');
  await tick();
  commander.step(f.view);
  assert.equal(commander.stats('enemy').backoffS, 4, 'the back-off doubles');
  fake.setMode('limited');
  f.set(9);
  commander.step(f.view);
  await tick();
  commander.step(f.view);
  assert.equal(commander.stats('enemy').backoffS, 12, 'a retry-after from the proxy is honoured');
  fake.setMode('reject');
  f.set(22);
  commander.step(f.view);
  await tick();
  commander.step(f.view);
  assert.equal(commander.stats('enemy').lastError, 'network down', 'a rejected transport promise is a failure, not an exception');
  // every controller kept updating through all of it
  for (const tank of f.tanks) if (tank.aiCtl) tank.aiCtl.update(SIM_DT, f.view.timeS);
  assert.ok(f.tanks.filter((tank) => tank.aiCtl).every((tank) => tank.aiCtl.debugInfo().orderPosture === null), 'classic brains throughout');
  fake.setMode('hold');
  f.set(60);
  commander.step(f.view);
  fake.answer((id, question) => (id.startsWith('posture_') ? confident('hold', Object.keys(question.criteria)) : null));
  await tick();
  commander.step(f.view);
  assert.equal(commander.stats('enemy').backoffS, 0, 'a success resets the back-off');
  assert.equal(commander.stats('enemy').ordersApplied, 3);
  // the budget
  const budgeted = fixture();
  const budgetFake = fakeTransport();
  const budgetCommander = createJevCommander({ transport: budgetFake.transport, teams: ['enemy'], cadenceS: 1, requestsPerTeam: 2, now: () => 0 });
  for (let i = 0; i < 6; i++) {
    budgeted.set(i * 1.5);
    budgetCommander.step(budgeted.view);
    if (budgetFake.pending) { budgetFake.answer(() => null); await tick(); }
  }
  assert.equal(budgetFake.requests.length, 2, 'the per-team budget caps the requests');
  assert.equal(budgetCommander.stats('enemy').budgetSpent, true);
  assert.equal(budgetCommander.stats().budgetSpent, true, 'the totals see the spent budget');
  // stop and dispose
  const stopped = fixture();
  const stopFake = fakeTransport();
  const stopCommander = createJevCommander({ transport: stopFake.transport, teams: ['enemy'], now: () => 0 });
  stopCommander.step(stopped.view);
  stopCommander.stop();
  stopFake.answer((id, question) => (id.startsWith('posture_') ? confident('push', Object.keys(question.criteria)) : null));
  await tick();
  stopped.set(1);
  stopCommander.step(stopped.view);
  assert.equal(stopCommander.stats('enemy').ordersApplied, 0, 'after stop() an arriving answer is not applied');
  assert.equal(stopCommander.active, false);
  const disposed = fixture();
  const disposeFake = fakeTransport();
  const disposeCommander = createJevCommander({ transport: disposeFake.transport, teams: ['enemy'], now: () => 0 });
  disposeCommander.step(disposed.view);
  const signal = disposeFake.requests[0].signal;
  disposeCommander.dispose();
  assert.equal(signal.aborted, true, 'dispose aborts the request in flight');
  commander.dispose();
  budgetCommander.dispose();
}

{
  console.log('[6] the quiet cadence: a team that sees nothing asks less often');
  const f = fixture();
  for (const id of ['t72b3m', 'kv2', 't90ms']) f.byId(id).state.pos.set(0, 0, 2000);
  const view = { ...f.view, spotting: { isSpotted: () => false }, get timeS() { return f.view.timeS; } };
  const fake = fakeTransport();
  const commander = createJevCommander({ transport: fake.transport, teams: ['player'], cadenceS: 2, quietCadenceS: 8, now: () => 0 });
  const cycle = async () => { commander.step(view); if (fake.pending) { fake.answer(() => null); await tick(); commander.step(view); } };
  for (let t = 0; t <= 17; t += 2.1) { f.set(t); await cycle(); }
  assert.equal(fake.requests.length, 3, 'over 17 s a quiet team asks at 0, ~8 and ~17 s instead of every 2 s');
  assert.ok(commander.stats('player').skippedQuiet >= 5, `quiet skips: ${commander.stats('player').skippedQuiet}`);
  assert.deepEqual(Object.keys(fake.requests[0].body.state.enemies), [], 'nothing spotted, nothing listed');
  commander.dispose();
}

{
  console.log('[7] the browser transport: one same-origin POST, the proxy errors mapped, the timeout bounded');
  const calls = [];
  const replies = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (reply.hang) return new Promise((_, reject) => init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }));
    return { status: reply.status, json: async () => reply.body };
  };
  const transport = createJevFetchTransport({ url: '/api/jev', fetch, timeoutMs: 15, sid: 'sess_fetch_0001' });
  const f = fixture();
  const snapshot = buildJevTeamState(f.view, 'enemy', null);
  const body = { v: 1, sid: transport.sid, kind: 'team_orders', state: snapshot.state };
  replies.push({ status: 200, body: { v: 1, model: 'jev-1.13.0', answers: { posture_b1: { type: 'choice', choice: 'hold', probabilities: { hold: 1 }, confidence: 1 }, bogus: { type: 'noul', noul: 7 } }, usage: { input_tokens: 10, output_tokens: 2 }, latencyMs: 300 } });
  const ok = await transport.send(body, new AbortController().signal);
  assert.equal(ok.ok, true);
  assert.equal(calls[0].url, '/api/jev');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].init.body), body, 'the request body is the envelope and the document, nothing else');
  assert.deepEqual(Object.keys(ok.body.answers), ['posture_b1'], 'a malformed answer is dropped by the reply parser');
  assert.equal(ok.body.usage.input_tokens, 10);
  replies.push({ status: 429, body: { error: 'session_rate_limited', retryAfterMs: 5000 } });
  const limited = await transport.send(body, new AbortController().signal);
  assert.deepEqual(limited, { ok: false, error: 'session_rate_limited', status: 429, retryAfterMs: 5000 });
  replies.push({ status: 503, body: { error: 'not_configured' } });
  assert.equal((await transport.send(body, new AbortController().signal)).error, 'not_configured');
  replies.push({ status: 200, body: { nonsense: true } });
  assert.equal((await transport.send(body, new AbortController().signal)).error, 'invalid_reply');
  replies.push({ hang: true });
  const timedOut = await transport.send(body, new AbortController().signal);
  assert.equal(timedOut.error, 'timeout', 'the transport bounds its own wait');
  replies.push({ hang: true });
  const outer = new AbortController();
  const aborted = transport.send(body, outer.signal);
  outer.abort();
  assert.equal((await aborted).error, 'aborted', 'the commander can abort a request (dispose)');
  const generated = createJevFetchTransport({ fetch });
  assert.match(generated.sid, /^s[a-z0-9]{8,31}$/, 'a generated session id is an opaque token');
}

console.log('jevCommander.selftest: team document, question fan-out, order application, freshness and confidence gates, fallback, budget, quiet cadence and the browser transport pass');
