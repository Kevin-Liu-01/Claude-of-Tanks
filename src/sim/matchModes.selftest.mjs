import assert from 'node:assert/strict';

import {
  GAME_MODE_DEFINITIONS,
  createMatchModeController,
  normalizeGameMode,
} from './matchModes.ts';

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

function controller(mode, entities, seed = 42) {
  const events = [];
  let revives = 0;
  const match = createMatchModeController({
    mode,
    entities,
    seed,
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
  assert.ok(match.state.score.alpha >= 1000);
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

console.log('matchModes.selftest: standard, flags, zones, turbo ball, horde, respawns, and loot passed');
