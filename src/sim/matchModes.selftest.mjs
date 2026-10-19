import assert from 'node:assert/strict';

import {
  GAME_MODE_DEFINITIONS,
  ZONE_DESTRUCTION_POINTS,
  createMatchModeController,
  normalizeGameMode,
} from './matchModes.ts';
import { FLAG_CARRIER_SPEED_SCALE, HORDE_WAVE_REPAIR, matchRulesetFor } from './matchRuleset.ts';

function entity(id, team, x, z, { bot = false } = {}) {
  return {
    id,
    team,
    bot,
    state: { pos: { x, y: 0, z }, yaw: team === 'alpha' ? 0 : Math.PI, speed: 0 },
    combat: {
      hp: 100,
      maxHp: 100,
      destroyed: false,
      ammo: [24, 16, 6],
      ammoCapacity: [24, 16, 6],
    },
  };
}

// gameplay-modes-228: on these flat test fields every arrival point is in the humans' sight, so the Horde tests that are
// about something else open the sight rule (the arrival law has its own receipt: hordeWaveLaw.selftest.mjs)
const openHorde = (rules = matchRulesetFor('endless_horde')) => ({ ...rules, horde: { ...rules.horde, spawnOutOfSight: false } });
const fielded = (enemies) => enemies.filter((target) => target.modeActive !== false && !target.combat.destroyed);
/** Destroy the wave as it arrives (the queue trickles in) until its lull begins; returns the clock. */
function clearWave(run, enemies, clock) {
  const wave = run.match.state.horde.wave;
  for (let guard = 0; guard < 400; guard++) {
    for (const target of fielded(enemies)) target.combat.destroyed = true;
    clock += 0.5; run.match.step(1 / 60, clock);
    if (run.match.state.horde.wave !== wave || run.match.state.horde.nextWaveInS > 0) return clock;
  }
  throw new Error('the wave never cleared');
}

function controller(mode, entities, seed = 42, extra = {}) {
  const events = [];
  let revives = 0;
  const match = createMatchModeController({
    mode,
    entities,
    seed,
    ...extra,
    terrainHeight: () => 0,
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn, healthScale) {
      revives++;
      target.state.pos.x = spawn.x;
      target.state.pos.y = 0;
      target.state.pos.z = spawn.z;
      target.state.yaw = spawn.yaw;
      target.state.speed = 0;
      target.combat.maxHp = Math.round(100 * healthScale);
      target.combat.hp = target.combat.maxHp;
      target.combat.destroyed = false;
    },
    emit(type, payload) { events.push({ type, payload }); },
  });
  return { match, events, get revives() { return revives; } };
}

assert.equal(normalizeGameMode('zone_control'), 'zone_control');
assert.equal(normalizeGameMode('made_up'), 'standard');
assert.equal(GAME_MODE_DEFINITIONS.turbo_ball.respawns, true);

{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 100);
  const { match } = controller('standard', [alpha, bravo]);
  assert.equal(match.usesElimination, true);
  assert.equal(alpha.modeSpeedMultiplier, 1);
  assert.equal(match.step(1 / 60, 1), null);
}

{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 100);
  const run = controller('capture_the_flag', [alpha, bravo]);
  for (let capture = 0; capture < 3; capture++) {
    alpha.state.pos.z = 100;
    run.match.step(1 / 60, capture * 2 + 1);
    assert.equal(run.match.state.flags[1].carrierId, 'alpha');
    alpha.state.pos.z = -100;
    const result = run.match.step(1 / 60, capture * 2 + 2);
    if (capture < 2) assert.equal(result, null);
    else assert.deepEqual(result, { result: 'alpha', reason: 'flag_limit' });
  }
  assert.equal(run.match.state.score.alpha, 3);
}

{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 100);
  const run = controller('capture_the_flag', [alpha, bravo]);
  alpha.combat.destroyed = true;
  run.match.step(1 / 60, 1);
  assert.equal(run.revives, 0);
  run.match.step(1 / 60, 7.01);
  assert.equal(alpha.combat.destroyed, false);
  assert.equal(run.revives, 1);
}

{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 100);
  const { match } = controller('zone_control', [alpha, bravo]);
  alpha.state.pos.x = 0;
  alpha.state.pos.z = 0;
  let result = null;
  for (let tick = 1; tick <= 32000 && !result; tick++) {
    result = match.step(1 / 60, tick / 60);
  }
  assert.deepEqual(result, { result: 'alpha', reason: 'score_limit' });
  assert.ok(match.state.score.alpha >= 750, 'zone control plays to the ruleset target (750)');
  assert.equal(match.state.target, 750);
}

// A held point the other side drives onto is announced to its holders (mode_zone_contested, the crew's "they're
// contesting the point"): once per incursion, never a stream from a tank idling on the rim.
{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 300);
  const { match, events } = controller('zone_control', [alpha, bravo]);
  const zone = match.state.zones[0];
  alpha.state.pos.x = zone.x;
  alpha.state.pos.z = zone.z;
  let tick = 0;
  const run = (seconds) => { for (const end = tick + Math.round(seconds * 60); tick < end;) { tick++; match.step(1 / 60, tick / 60); } };
  run(12);
  assert.equal(zone.owner, 'alpha', 'one tank turns the point in 8 s');
  const contested = () => events.filter((event) => event.type === 'mode_zone_contested').map((event) => event.payload);
  assert.deepEqual(contested(), [], 'a point nobody challenges is not announced');
  bravo.state.pos.x = zone.x + 5;
  bravo.state.pos.z = zone.z;
  run(1);
  assert.deepEqual(contested(), [{ zoneId: zone.id, team: 'alpha' }], 'the holders hear it once, with their own team');
  for (let i = 0; i < 6; i++) { bravo.state.pos.z = zone.z + (i % 2 ? 0 : 200); run(1); }
  assert.equal(contested().length, 1, 'in and out on the rim is one alert');
  bravo.state.pos.z = zone.z + 200;
  run(20);
  bravo.state.pos.z = zone.z;
  run(1);
  assert.equal(contested().length, 2, 'a fresh incursion after a quiet spell is announced again');
  assert.equal(zone.owner, 'alpha', 'a contested point does not change hands while its holder stays');
}

{
  const alpha = entity('alpha', 'alpha', 0, -180);
  const bravo = entity('bravo', 'bravo', 0, 180);
  const { match } = controller('turbo_ball', [alpha, bravo]);
  assert.equal(alpha.modeSpeedMultiplier, 1.85);
  assert.equal(match.state.goals.length, 2);
  assert.equal(match.tryHitBall({
    prevPos: { x: 0, y: 2.2, z: -2 },
    pos: { x: 0, y: 2.2, z: 2 },
    vel: { x: 0, y: 0, z: 100 },
    shooterId: 'alpha',
  }), true);
  alpha.state.pos.x = 80;
  bravo.state.pos.x = 80;
  let result = null;
  for (let goal = 0; goal < 5; goal++) {
    alpha.state.pos.x = 80;
    bravo.state.pos.x = 80;
    match.state.ball.x = match.state.goals[1].x;
    match.state.ball.y = match.state.goals[1].y + 2.2;
    match.state.ball.z = match.state.goals[1].z;
    match.state.ball.vx = 0;
    match.state.ball.vy = 0;
    match.state.ball.vz = 0;
    result = match.step(1 / 60, goal + 1);
  }
  assert.deepEqual(result, { result: 'alpha', reason: 'goal_limit' });
}

{
  const player = entity('player', 'alpha', 0, -150);
  const enemies = Array.from({ length: 5 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  // the cache law under the vehicles' own rounds (the base Horde plays unlimited rounds: every cache a repair, below)
  const run = controller('endless_horde', [player, ...enemies], 6000, { ruleset: openHorde({ ...matchRulesetFor('endless_horde'), ammo: 'spec' }) });
  assert.equal(run.match.state.horde.wave, 1);
  // the first wave's total is six (gameplay-modes-228): the five-strong pool caps the field, the sixth waits in the queue
  assert.equal(run.match.state.horde.total, 6);
  assert.equal(run.match.state.horde.queued, 1);
  assert.equal(run.match.state.horde.remaining, 6, 'remaining = alive + queued');
  assert.equal(enemies.filter((target) => target.modeActive !== false).length, 5);
  assert.deepEqual(player.combat.ammo, [24, 16, 6]);
  player.combat.ammo = [0, 0, 0];
  let lull = clearWave(run, enemies, 0);
  const waveOneHealChance = run.match.state.horde.healChance;
  assert.equal(run.match.state.pickups.filter((pickup) => pickup.active).length, 1);
  run.match.step(1 / 60, lull + 8.01);
  assert.equal(run.match.state.horde.wave, 2, 'the next wave follows the 8 s lull');
  assert.ok(run.match.state.horde.healChance < waveOneHealChance);
  let snapshot = run.match.serialize('player');
  assert.equal(snapshot.playerAmmo, 0);
  assert.equal(snapshot.playerAmmoCapacity, 46);
  // tactical map 2026-09-15: the team spawn centres ride the presentation state (and its
  // serialisation clones them) so the map and the world can mark them
  assert.deepEqual(snapshot.spawns.map((spawn) => spawn.team), ['alpha', 'bravo']);
  assert.ok(snapshot.spawns.every((spawn) => Number.isFinite(spawn.x) && Number.isFinite(spawn.y) && Number.isFinite(spawn.z)));
  assert.notEqual(snapshot.spawns, run.match.state.spawns, 'serialize clones the spawn list');
  assert.deepEqual(snapshot.spawns, run.match.state.spawns);

  let clock = lull + 8.01;
  let collectedAmmo = false;
  for (let cycle = 0; cycle < 20 && !collectedAmmo; cycle++) {
    const cache = run.match.state.pickups.find((pickup) => pickup.active && pickup.kind === 'ammo');
    if (cache) {
      player.state.pos.x = cache.x;
      player.state.pos.z = cache.z;
      run.match.step(1 / 60, clock + 0.01);
      collectedAmmo = true;
      break;
    }
    clock = clearWave(run, enemies, clock);
    clock += 8.01;
    run.match.step(1 / 60, clock);
  }
  assert.equal(collectedAmmo, true, 'deterministic Horde sequence produces an ammo cache');
  assert.deepEqual(player.combat.ammo, [5, 4, 2],
    'ammo cache replenishes 20% of each real authored channel');
  snapshot = run.match.serialize('player');
  assert.equal(snapshot.playerAmmo, 11);
  assert.equal(snapshot.playerAmmoCapacity, 46);
}

// unlimited rounds (owner 2026-10-17): every Horde cache is a repair, drawn from the same seeded stream as under spec
// rounds, so the caches land where they would have; a hostile revives at the fodder hull (15 % of its own)
{
  const caches = (ammo) => {
    const player = entity('player', 'alpha', 0, -150);
    const enemies = Array.from({ length: 5 }, (_, index) => entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
    const run = controller('endless_horde', [player, ...enemies], 6000, { ruleset: openHorde(ammo ? { ...matchRulesetFor('endless_horde'), ammo } : undefined) });
    const hull = enemies.find((target) => target.modeActive !== false).combat.maxHp;
    let clock = 0;
    for (let cycle = 0; cycle < 12; cycle++) {
      clock = clearWave(run, enemies, clock);
      clock += 8.01; run.match.step(1 / 60, clock);
    }
    const spawned = run.events.filter((event) => event.type === 'mode_pickup_spawned').map((event) => event.payload);
    return { spawned, hull, healChance: run.match.state.horde.healChance };
  };
  const endless = caches(null);
  const spec = caches('spec');
  assert.ok(endless.spawned.length >= 10, 'a cache drops on every cleared wave');
  assert.ok(endless.spawned.every((pickup) => pickup.kind === 'heal'), 'unlimited rounds: every cache repairs');
  assert.equal(endless.healChance, 1);
  assert.ok(spec.spawned.some((pickup) => pickup.kind === 'ammo'), 'spec rounds still drop ammunition caches');
  assert.deepEqual(endless.spawned.map((pickup) => [pickup.x, pickup.z]), spec.spawned.map((pickup) => [pickup.x, pickup.z]),
    'the kind draw is kept, so every cache lands where it would under spec rounds');
  const scale = matchRulesetFor('endless_horde').horde.hostileHpScale / matchRulesetFor('endless_horde').hpScale;
  assert.equal(endless.hull, Math.round(100 * scale), 'a wave-one hostile revives at hostileHpScale over the humans\' hpScale');
}

// owner 2026-09-15 ("they're the same tanks each round"): waves draw fresh identities from the pool, rested vehicles
// first; gameplay-modes-228: the wave TOTAL follows the law (6, 9, 13, …) while the field holds at most the pool, the
// rest trickling in as the field thins
{
  const player = entity('player', 'alpha', 0, -150);
  const enemies = Array.from({ length: 9 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  const run = controller('endless_horde', [player, ...enemies], 4242, { ruleset: openHorde() });
  const active = () => new Set(enemies.filter((target) => target.modeActive !== false).map((target) => target.id));
  const waveOne = active();
  assert.equal(waveOne.size, 6, 'wave 1 fields six of the nine');
  let clock = clearWave(run, enemies, 0);
  clock += 8.01; run.match.step(1 / 60, clock);
  const waveTwo = active();
  assert.equal(run.match.state.horde.wave, 2); assert.equal(run.match.state.horde.total, 9, 'wave 2 brings nine');
  assert.equal(waveTwo.size, 9, 'the nine-strong pool fields them all');
  const rested = enemies.filter((target) => !waveOne.has(target.id)).map((target) => target.id);
  assert.ok(rested.every((id) => waveTwo.has(id)), 'every vehicle rested on wave 1 leads wave 2');
  clock = clearWave(run, enemies, clock); clock += 8.01; run.match.step(1 / 60, clock);
  assert.equal(run.match.state.horde.wave, 3); assert.equal(run.match.state.horde.total, 13, 'wave 3 brings thirteen');
  assert.equal(active().size, 9, 'the pool caps the field; four wait in the queue');
  assert.equal(run.match.state.horde.queued, 4);
  const started = run.events.filter((event) => event.type === 'mode_wave_started').map((event) => event.payload.total);
  assert.deepEqual(started, [6, 9, 13]);
  const arrivals = run.events.filter((event) => event.type === 'mode_respawn' && event.payload.team === 'bravo').length;
  assert.equal(arrivals, 6 + 9 + 9, 'every arrival so far is a revive of a pool identity (no new entities)');
  // the same seed replays the same draws
  const enemiesAgain = Array.from({ length: 9 }, (_, index) => entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  controller('endless_horde', [entity('player', 'alpha', 0, -150), ...enemiesAgain], 4242, { ruleset: openHorde() });
  assert.deepEqual(new Set(enemiesAgain.filter((target) => target.modeActive !== false).map((target) => target.id)), waveOne,
    'the seed decides the draw');
}

// campaign slice 1 (2026-09-12): Frontline Assault — three sectors on the axis
// to the enemy, a counter-attack wave per sector, hold the last one to win.
{
  assert.equal(GAME_MODE_DEFINITIONS.frontline_assault.respawns, false);
  const player = entity('player', 'alpha', 0, -150);
  const ally = entity('ally', 'alpha', 10, -150, { bot: true });
  const enemies = Array.from({ length: 6 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  const { match, events } = controller('frontline_assault', [player, ally, ...enemies], 6000);
  assert.equal(match.usesElimination, false);
  assert.deepEqual(match.state.line, { index: 0, total: 3, holdS: 0 });
  assert.deepEqual(match.state.zones.map((zone) => Math.round(zone.z)), [-75, 15, 105],
    'sectors sit at 25/55/85 % of the way from the alpha centre to the bravo centre');
  assert.equal(match.state.horde.wave, 1);
  assert.equal(enemies.filter((target) => target.modeActive !== false).length, 4, 'wave 1 fields four defenders (gameplay-modes-228)');
  // a push waits for two friends within 80 m (or 15 s at the edge): with one, the attacker stages at the zone's edge on
  // the attack's side (assaultBots.stageM past the radius)
  const staged = match.botTarget(ally), zone0 = match.state.zones[0];
  assert.equal(staged.mission, 'assault');
  const stagedOff = Math.hypot(staged.x - zone0.x, staged.z - zone0.z);
  assert.ok(stagedOff > 40 && stagedOff < 60 && staged.z < zone0.z, `one friend: the attacker stages at the edge (${stagedOff.toFixed(1)} m)`);
  const defender = enemies.find((target) => target.modeActive !== false);
  assert.deepEqual(match.botTarget(defender), { x: match.state.zones[0].x, z: match.state.zones[0].z, mission: 'assault' },
    'defenders fall back on the live sector when no attacker is closer');
  let timeS = 0;
  const hold = (seconds) => {
    let result = null;
    for (let i = 0; i < Math.round(seconds * 60) && !result; i++) { timeS += 1 / 60; result = match.step(1 / 60, timeS); }
    return result;
  };
  for (const [index, expectedWave, expectedDefenders] of [[0, 2, 5], [1, 3, 6]]) {
    player.state.pos.x = match.state.zones[index].x; player.state.pos.z = match.state.zones[index].z;
    assert.equal(hold(9), null);
    assert.equal(match.state.line.index, index + 1, `sector ${index + 1} taken advances the line`);
    assert.equal(match.state.horde.wave, expectedWave);
    assert.equal(enemies.filter((target) => target.modeActive !== false).length, expectedDefenders,
      'each sector taken brings a larger counter-attack');
  }
  assert.equal(events.filter((event) => event.type === 'mode_line_advanced').length, 2);
  player.state.pos.x = match.state.zones[2].x; player.state.pos.z = match.state.zones[2].z;
  assert.equal(hold(9), null);
  assert.equal(match.state.zones[2].owner, 'alpha');
  assert.ok(match.state.line.holdS > 15 && match.state.line.holdS <= 20, 'the final sector starts its hold countdown');
  assert.deepEqual(hold(21), { result: 'alpha', reason: 'line_held' });
  assert.equal(match.serialize('player').line.index, 3);
}
// Capturing a sector reinforces the line instead of re-fielding it (owner 2026-09-17: "capturing bases in
// frontline assault shouldnt reset tanks"): living defenders keep identity, position and damage; their wrecks
// stay wrecks while rested identities are available; only the shortfall arrives fresh.
{
  const player = entity('player', 'alpha', 0, -150);
  const enemies = Array.from({ length: 6 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  const run = controller('frontline_assault', [player, ...enemies], 6000);
  const match = run.match;
  const living = () => enemies.filter((target) => target.modeActive !== false && !target.combat.destroyed);
  const wave1 = living();
  assert.equal(wave1.length, 4, 'wave 1 fields four defenders');
  const revivesAfterWave1 = run.revives;
  const [scarred, fallen, untouched] = wave1;
  scarred.combat.hp = 37;
  scarred.state.pos.x += 7.5;
  scarred.state.pos.z -= 22;
  const scarredPos = { x: scarred.state.pos.x, z: scarred.state.pos.z };
  fallen.combat.destroyed = true;
  let timeS = 0;
  for (let i = 0; i < 9 * 60; i++) {
    timeS += 1 / 60;
    player.state.pos.x = match.state.zones[0].x; player.state.pos.z = match.state.zones[0].z;
    assert.equal(match.step(1 / 60, timeS), null);
  }
  assert.equal(match.state.line.index, 1, 'the first sector is taken');
  assert.equal(match.state.horde.wave, 2);
  assert.equal(scarred.combat.hp, 37, 'a living defender keeps its damage across the capture');
  assert.deepEqual({ x: scarred.state.pos.x, z: scarred.state.pos.z }, scarredPos, 'and its position');
  assert.equal(scarred.modeActive !== false && untouched.modeActive !== false, true, 'living defenders stay fielded');
  assert.equal(fallen.combat.destroyed, true, 'the sector\'s wreck is not resurrected while rested identities remain');
  assert.equal(living().length, 5, 'the counter-attack brings the line up to five living defenders');
  assert.equal(run.revives - revivesAfterWave1, 2, 'exactly the shortfall arrives fresh (two arrivals)');
  const arrivals = living().filter((target) => !wave1.includes(target));
  assert.equal(arrivals.length, 2);
  for (const arrival of arrivals) {
    assert.equal(arrival.combat.hp, arrival.combat.maxHp, 'arrivals come at the new line\'s full strength');
    assert.ok(arrival.combat.maxHp > 100, 'with the per-line health scale');
  }
}
{
  const player = entity('player', 'alpha', 0, -150);
  const enemies = Array.from({ length: 3 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  const { match } = controller('frontline_assault', [player, ...enemies], 7);
  player.combat.destroyed = true;
  assert.deepEqual(match.step(1 / 60, 1), { result: 'bravo', reason: 'assault_overrun' },
    'the human attacker falling ends the assault');
}

// RULESETS (2026-09-14): the controller reads sim/matchRuleset.ts — respawn delay, speed and gravity
// stamps, the flag-carrier penalty, the wave-clear repair and the campaign escalation.
{
  const alpha = entity('alpha', 'alpha', 0, -180);
  const bravo = entity('bravo', 'bravo', 0, 180);
  const { match, events } = controller('turbo_ball', [alpha, bravo]);
  assert.equal(match.ruleset.mode, 'turbo_ball');
  assert.equal(alpha.modeGravityScale, 0.6, 'Turbo Ball stamps the 0.6 g ruleset gravity');
  assert.equal(match.state.respawns, true);
  alpha.combat.destroyed = true;
  match.step(1 / 60, 1);
  match.step(1 / 60, 3.99);
  assert.equal(alpha.combat.destroyed, true, 'a Turbo Ball respawn waits the ruleset\'s 3 s');
  match.step(1 / 60, 4.01);
  assert.equal(alpha.combat.destroyed, false, 'and revives at 3 s');
  assert.equal(alpha.modeSpeedMultiplier, 1.85);
  assert.equal(alpha.modeGravityScale, 0.6, 'the revive restamps the gravity');
  assert.ok(events.some((event) => event.type === 'mode_respawn'));
  match.state.ball.y += 30;
  match.state.ball.vy = 0;
  match.step(1 / 60, 4.02);
  assert.ok(Math.abs(match.state.ball.vy + 9.81 * 0.6 / 60) < 1e-9, 'the ball falls at the ruleset gravity');
}
{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 100);
  const { match } = controller('capture_the_flag', [alpha, bravo]);
  assert.equal(match.state.respawns, true);
  const enemyFlag = match.state.flags.find((flag) => flag.team === 'bravo');
  const ownFlag = match.state.flags.find((flag) => flag.team === 'alpha');
  alpha.state.pos.x = enemyFlag.x; alpha.state.pos.z = enemyFlag.z;
  match.step(1 / 60, 1);
  assert.equal(enemyFlag.carrierId, 'alpha');
  assert.ok(Math.abs(alpha.modeSpeedMultiplier - FLAG_CARRIER_SPEED_SCALE) < 1e-9, 'the carrier drives at 85 %');
  alpha.state.pos.x = ownFlag.baseX; alpha.state.pos.z = ownFlag.baseZ;
  match.step(1 / 60, 2);
  assert.equal(match.state.score.alpha, 1);
  assert.equal(alpha.modeSpeedMultiplier, 1, 'scoring restores the mode speed');
}
{
  const player = entity('player', 'alpha', 0, -150);
  const enemies = Array.from({ length: 4 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  const run = controller('endless_horde', [player, ...enemies], 6000, { ruleset: openHorde() });
  assert.equal(run.match.state.respawns, false);
  player.combat.hp = 40;
  clearWave(run, enemies, 0);
  assert.equal(player.combat.hp, 40 + Math.round(100 * HORDE_WAVE_REPAIR), 'clearing a wave repairs the survivors by 30 %');
  const cleared = run.events.find((event) => event.type === 'mode_wave_cleared');
  assert.equal(cleared.payload.repaired, 30);
}
{
  const player = entity('player', 'alpha', 0, -150);
  const enemies = Array.from({ length: 8 }, (_, index) =>
    entity(`enemy-${index}`, 'bravo', index * 8, 150, { bot: true }));
  const { match } = controller('frontline_assault', [player, ...enemies], 6000,
    { ruleset: matchRulesetFor('frontline_assault', { difficulty: 4 }) });
  assert.equal(match.ruleset.assault.extraDefenders, 1);
  assert.equal(enemies.filter((target) => target.modeActive !== false).length, 5,
    'operation 4 fields an extra defender on the first sector');
  const active = enemies.find((target) => target.modeActive !== false);
  assert.equal(active.combat.maxHp, Math.round(100 * 1.18), 'operation 4 defenders carry +18 % hull');
}
{
  const alpha = entity('alpha', 'alpha', 0, -100);
  const bravo = entity('bravo', 'bravo', 0, 100);
  const { match } = controller('standard', [alpha, bravo], 42, { ruleset: matchRulesetFor('turbo_ball') });
  assert.equal(match.ruleset.mode, 'standard', 'a ruleset for another mode is ignored');
  assert.equal(alpha.modeSpeedMultiplier, 1);
  assert.equal(alpha.modeGravityScale, 1);
}

console.log('matchModes.selftest: standard, flags, zones, turbo ball, horde, assault, respawns, loot, and rulesets passed');

// Only confirmed hostile destructions earn points; repeated snapshots cannot farm scores.
for (const mode of ['zone_control','mars','standard','capture_the_flag','turbo_ball','endless_horde','frontline_assault']) {
  // a Horde needs its hostile pool (gameplay-modes-228): the bravo side there is a bot
  const a=entity('a','alpha',0,-100), b=entity('b','bravo',0,100,{bot:mode==='endless_horde'}), ally=entity('ally','alpha',20,-100);
  if(mode==='mars'){a.team=ally.team='player';b.team='enemy';}
  const {match,events}=controller(mode,[a,b,ally]);
  match.recordDestruction(b.id,a.id);
  assert.equal(match.state.score.alpha,0,'living targets never score');
  b.combat.destroyed=true;
  match.recordDestruction(b.id,b.id);match.recordDestruction(b.id,null);match.recordDestruction(b.id,'missing');
  assert.equal(match.state.score.bravo,0,'suicides and missing attackers never score');
  ally.combat.destroyed=true;match.recordDestruction(ally.id,a.id);
  assert.equal(match.state.score.alpha,0,'friendly fire never scores');
  match.recordDestruction(b.id,a.id);match.recordDestruction(b.id,a.id);
  const points=mode==='zone_control'||mode==='mars';
  assert.equal(match.state.score.alpha,points?ZONE_DESTRUCTION_POINTS:0,mode);
  assert.equal(events.filter(e=>e.type==='mode_destruction_scored').length,points?1:0);
  if(!points)continue;
  match.step(0,1);match.step(0,100);
  assert.equal(b.combat.destroyed,false);
  b.combat.destroyed=true;match.recordDestruction(b.id,a.id);
  assert.equal(match.state.score.alpha,ZONE_DESTRUCTION_POINTS*2,'new life can score again');
  match.state.score.alpha=match.state.target-ZONE_DESTRUCTION_POINTS;
  a.combat.destroyed=true;match.recordDestruction(a.id,b.id);
  ally.combat.destroyed=true;match.recordDestruction(ally.id,b.id);
  // A final valid kill can end the match without anyone occupying a zone.
  match.step(0,101);match.step(0,200);
  b.combat.destroyed=true;match.recordDestruction(b.id,a.id);
  assert.deepEqual(match.step(0,201),{result:'alpha',reason:'score_limit'});
}

// Each mission needs a formation, not a team-sized pile at one point.
{
  const bots = Array.from({length: 9}, (_, i) => entity(`squad-${i}`, 'alpha', i * 2, -100, {bot: true}));
  const enemy = entity('opponent', 'bravo', 0, 100);
  const {match} = controller('zone_control', [...bots, enemy]);
  const targets = new Set(bots.map(bot => JSON.stringify(match.botTarget(bot))));
  assert.ok(targets.size >= 2, 'a squad allocates capture pressure across more than one zone');
}

{
  const carrier=entity('carrier','alpha',0,-100,{bot:true});
  const rescue=entity('rescue','alpha',10,-100,{bot:true});
  const bravo=entity('thief','bravo',0,100,{bot:true});
  const {match}=controller('capture_the_flag',[carrier,rescue,bravo]);
  const own=match.state.flags.find(f=>f.team==='alpha'), stolen=match.state.flags.find(f=>f.team==='bravo');
  stolen.status='carried';stolen.carrierId=carrier.id;stolen.x=0;stolen.z=70;
  own.status='dropped';own.x=40;own.z=-20;
  assert.deepEqual(match.botTarget(carrier),{x:own.baseX,z:own.baseZ,mission:'carrier'},'carrier heads home, not toward another flag');
  assert.deepEqual(match.botTarget(rescue),{x:40,z:-20,mission:'recover'},'another bot recovers the dropped home flag');
}
{
  const striker=entity('striker','alpha',0,-100,{bot:true});
  const enemy=entity('other','bravo',0,100,{bot:true});
  const {match}=controller('turbo_ball',[striker,enemy]);
  const ball=match.state.ball, goal=match.state.goals.find(g=>g.team==='bravo');
  const dz=Math.sign(goal.z-ball.z);
  striker.state.pos.x=ball.x;striker.state.pos.z=ball.z+dz*20;
  const approach=match.botTarget(striker);
  assert.ok((approach.z-ball.z)*dz<0,'a striker on the wrong side circles behind the ball');
  striker.state.pos.z=ball.z-dz*25;
  const push=match.botTarget(striker);
  assert.ok((push.z-ball.z)*dz>0,'an aligned striker drives through the ball toward the enemy goal');
}

{
  const bots = Array.from({length: 7}, (_, i) => entity(`roles-${i}`, 'alpha', i * 12, -100, {bot: true}));
  const {match} = controller('capture_the_flag', [...bots, entity('enemy-base', 'bravo', 0, 100)]);
  const jobs = bots.map(bot => match.botObjective(bot));
  assert.ok(jobs.some(job => job.mission === 'raid') && jobs.some(job => job.mission === 'defend'),
    'flag team retains home defense while sending separated raiders');
  const flag = match.state.flags.find(f => f.team === 'bravo');
  flag.status = 'carried'; flag.carrierId = bots[0].id;
  const escorts = bots.slice(1).map(bot => match.botObjective(bot)).filter(job => job.mission === 'escort');
  assert.equal(escorts.length, 3, 'three escorts lead the carrier home (gameplay-modes-228)');
  assert.ok(Math.hypot(escorts[0].x - escorts[1].x, escorts[0].z - escorts[1].z) > 30,
    'escorts cover opposite sides of the carrier instead of blocking its hull');
}
{
  const bots = Array.from({length: 6}, (_, i) => entity(`ball-role-${i}`, 'alpha', i * 10, -80, {bot: true}));
  const {match} = controller('turbo_ball', [...bots, entity('goalkeeper', 'bravo', 0, 100)]);
  const jobs = bots.map(bot => match.botObjective(bot));
  assert.equal(jobs.filter(job => job.mission === 'striker').length, 2, 'two strikers: the chaser and its support (gameplay-modes-228)');
  assert.equal(jobs.filter(job => job.mission === 'keeper').length, 1, 'a keeper off the own goal');
  assert.equal(jobs.filter(job => job.mission === 'screen').length, 3, 'the rest cover lanes');
  assert.ok(jobs.filter(job => job.mission !== 'striker').every(job => Math.hypot(job.x - match.state.ball.x, job.z - match.state.ball.z) >= 30
    || job === jobs.find(j => j.mission === 'screen')), 'the crowd cap: only the strikers and the first screen close on the ball');
  assert.ok(new Set(jobs.map(job => `${job.x.toFixed(1)}:${job.z.toFixed(1)}`)).size >= 3,
    'screening positions spread across the field');
}
