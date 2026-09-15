import assert from 'node:assert/strict';

import {
  GAME_MODE_DEFINITIONS,
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
  const run = controller('endless_horde', [player, ...enemies], 6000);
  assert.equal(run.match.state.horde.wave, 1);
  assert.equal(run.match.state.horde.total, 3);
  assert.equal(enemies.filter((target) => target.modeActive !== false).length, 3);
  assert.deepEqual(player.combat.ammo, [24, 16, 6]);
  player.combat.ammo = [0, 0, 0];
  for (const target of enemies) {
    if (target.modeActive !== false) target.combat.destroyed = true;
  }
  run.match.step(1 / 60, 1);
  const waveOneHealChance = run.match.state.horde.healChance;
  assert.equal(run.match.state.pickups.filter((pickup) => pickup.active).length, 1);
  run.match.step(1 / 60, 7.01);
  assert.equal(run.match.state.horde.wave, 2);
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

  let clock = 7.01;
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
    for (const target of enemies) {
      if (target.modeActive !== false) target.combat.destroyed = true;
    }
    clock += 0.5;
    run.match.step(1 / 60, clock);
    clock += 6.01;
    run.match.step(1 / 60, clock);
  }
  assert.equal(collectedAmmo, true, 'deterministic Horde sequence produces an ammo cache');
  assert.deepEqual(player.combat.ammo, [5, 4, 2],
    'ammo cache replenishes 20% of each real authored channel');
  snapshot = run.match.serialize('player');
  assert.equal(snapshot.playerAmmo, 11);
  assert.equal(snapshot.playerAmmoCapacity, 46);
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
  assert.equal(enemies.filter((target) => target.modeActive !== false).length, 3, 'wave 1 fields three defenders');
  assert.deepEqual(match.botTarget(ally), { x: match.state.zones[0].x, z: match.state.zones[0].z },
    'attackers push for the live sector');
  assert.deepEqual(match.botTarget(enemies[0]), { x: match.state.zones[0].x, z: match.state.zones[0].z },
    'defenders fall back on the live sector when no attacker is closer');
  let timeS = 0;
  const hold = (seconds) => {
    let result = null;
    for (let i = 0; i < Math.round(seconds * 60) && !result; i++) { timeS += 1 / 60; result = match.step(1 / 60, timeS); }
    return result;
  };
  for (const [index, expectedWave, expectedDefenders] of [[0, 2, 4], [1, 3, 5]]) {
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
  const run = controller('endless_horde', [player, ...enemies], 6000);
  assert.equal(run.match.state.respawns, false);
  player.combat.hp = 40;
  for (const target of enemies) if (target.modeActive !== false) target.combat.destroyed = true;
  run.match.step(1 / 60, 1);
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
  assert.equal(enemies.filter((target) => target.modeActive !== false).length, 4,
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
