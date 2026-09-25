import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch, MAX_AUTHORITATIVE_PLAYERS } from './authoritativeMatch.ts';
import { createPoseHistory, createTankArmorPose } from './poseHistory.ts';
import { encodeAimIntent } from '../net/aimIntent.ts';

// ------------------------------------------------------------ 1. the ring
{
  const history = createPoseHistory({ capacityTicks: 4, maxSlots: 2 });
  const state = { pos: new Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 };
  const out = createTankArmorPose();
  assert.equal(history.latestTick(0), -1);
  assert.equal(history.rewind(0, 0, out), false, 'nothing recorded yet');
  for (let tick = 10; tick <= 17; tick++) {
    state.pos.set(tick, tick * 2, tick * 3); state.yaw = tick * 0.1; state.turretYaw = -tick * 0.01; state.gunPitch = tick * 0.001;
    state.visualPitch = tick * 0.02; state.visualRoll = -tick * 0.03;
    history.record(0, tick, state);
  }
  assert.equal(history.latestTick(0), 17);
  assert.equal(history.oldestTick(0), 14, 'capacity keeps the last four ticks');
  assert.equal(history.rewind(0, 13, out), false, 'evicted ticks are not served');
  assert.equal(history.rewind(0, 18, out), false, 'future ticks are not served');
  assert.equal(history.rewind(0, 15, out), true);
  assert.deepEqual([out.pos.x, out.pos.y, out.pos.z, out.yaw, out.pitch, out.roll, out.turretYaw, out.gunPitch],
    [15, 30, 45, 15 * 0.1, 15 * 0.02, -15 * 0.03, -15 * 0.01, 15 * 0.001]);
  assert.equal(history.rewind(1, 15, out), false, 'slots are independent');
  assert.throws(() => history.record(0, 16, state), RangeError, 'ticks never decrease');
  assert.throws(() => history.record(2, 20, state), RangeError, 'slot bounds');
  history.clear(0);
  assert.equal(history.latestTick(0), -1);
  assert.equal(history.rewind(0, 15, out), false);
  console.log('poseHistory.selftest: ring records, rewinds, evicts and clears per slot');
}

// ------------------------------------------------------------ 2. the seam: a rewound sweep hits where the shooter looked
function rangeMatch(shellRewind) {
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed: 4242, countdownS: 0,
    players: [
      { id: 'shooter', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -80, yaw: 0 } },
      { id: 'target', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 80, yaw: Math.PI / 2 } },
    ],
    shellRewind,
  });
  match.onMatchReady();
  return match;
}

function fireAt(match, point, ticks) {
  const shooter = match.entityById.get('shooter');
  const events = [];
  for (let tick = 0; tick < ticks; tick++) {
    const aim = encodeAimIntent(shooter.state.pos, point);
    const inputs = new Map([[ 'shooter', {
      throttle: 0, steer: 0, brake: true, fire: tick >= 30, aimLocked: false, shellSlot: 0, actionBits: 0, ...aim,
    }]]);
    match.step({ dt: 1 / 60, inputs });
    for (const event of match.eventsForViewer('shooter')) events.push(event);
    match.afterEventBroadcast();
    if (events.some((event) => event.type === 'shell_hit' || event.type === 'shell_impact')) break;
  }
  return events;
}

{
  // The target stood at A when the shooter looked; by the time the shell flies it is 6 m to the side.
  const live = rangeMatch(null);
  const target = live.entityById.get('target');
  const seenAt = target.state.pos.clone();
  const aimPoint = seenAt.clone(); aimPoint.y += 1.2;
  // settle the gun on the aim point before displacing the target
  fireAt(live, aimPoint, 0);
  for (let tick = 0; tick < 90; tick++) {
    const shooter = live.entityById.get('shooter');
    const aim = encodeAimIntent(shooter.state.pos, aimPoint);
    live.step({ dt: 1 / 60, inputs: new Map([['shooter', { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: false, shellSlot: 0, actionBits: 0, ...aim }]]) });
    live.afterEventBroadcast();
  }
  target.state.pos.x += 6;
  const liveEvents = fireAt(live, aimPoint, 120);
  const liveHit = liveEvents.find((event) => event.type === 'shell_hit');
  assert.ok(liveEvents.some((event) => event.type === 'shell_fired'), 'the shot was fired');
  assert.ok(!liveHit || liveHit.targetId !== 'target', 'without rewind the displaced target is missed');

  // Same range, but the actor rewinds the target to where it stood when the shooter looked.
  const rewoundPose = createTankArmorPose();
  const saved = { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
  let rewinds = 0;
  const hook = {
    begin(shell) {
      const entity = rewound.entityById.get('target');
      if (shell.shooterId !== 'shooter') return;
      saved.pos.copy(entity.state.pos); saved.yaw = entity.state.yaw; saved.pitch = entity.state.visualPitch;
      saved.roll = entity.state.visualRoll; saved.turretYaw = entity.state.turretYaw; saved.gunPitch = entity.state.gunPitch;
      entity.state.pos.copy(rewoundPose.pos); entity.state.yaw = rewoundPose.yaw; entity.state.visualPitch = rewoundPose.pitch;
      entity.state.visualRoll = rewoundPose.roll; entity.state.turretYaw = rewoundPose.turretYaw; entity.state.gunPitch = rewoundPose.gunPitch;
      rewinds++;
    },
    end(shell) {
      if (shell.shooterId !== 'shooter') return;
      const entity = rewound.entityById.get('target');
      entity.state.pos.copy(saved.pos); entity.state.yaw = saved.yaw; entity.state.visualPitch = saved.pitch;
      entity.state.visualRoll = saved.roll; entity.state.turretYaw = saved.turretYaw; entity.state.gunPitch = saved.gunPitch;
      restoredExactly = restoredExactly && entity.state.pos.equals(saved.pos) && entity.state.yaw === saved.yaw;
    },
  };
  let restoredExactly = true;
  const rewound = rangeMatch(hook);
  const target2 = rewound.entityById.get('target');
  const aimPoint2 = target2.state.pos.clone(); aimPoint2.y += 1.2;
  for (let tick = 0; tick < 90; tick++) {
    const shooter = rewound.entityById.get('shooter');
    const aim = encodeAimIntent(shooter.state.pos, aimPoint2);
    rewound.step({ dt: 1 / 60, inputs: new Map([['shooter', { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: false, shellSlot: 0, actionBits: 0, ...aim }]]) });
    rewound.afterEventBroadcast();
  }
  // record the pose the shooter saw, then displace the live target the same 6 m
  rewoundPose.pos.copy(target2.state.pos); rewoundPose.yaw = target2.state.yaw; rewoundPose.pitch = target2.state.visualPitch;
  rewoundPose.roll = target2.state.visualRoll; rewoundPose.turretYaw = target2.state.turretYaw; rewoundPose.gunPitch = target2.state.gunPitch;
  target2.state.pos.x += 6;
  const rewoundEvents = fireAt(rewound, aimPoint2, 120);
  const hit = rewoundEvents.find((event) => event.type === 'shell_hit');
  assert.ok(hit && hit.targetId === 'target', `with rewind the shot lands on the target where the shooter saw it (${rewoundEvents.map((e) => e.type).join(',')})`);
  assert.ok(rewinds > 0, 'the hook wrapped every sweep of the shell');
  assert.ok(restoredExactly, 'the live pose is restored exactly after every sweep');
  assert.ok(target2.state.pos.x > rewoundPose.pos.x + 5, 'the live target stays displaced from the pose it was hit at');
  assert.ok(Math.abs(hit.pos[0] - rewoundPose.pos.x) < 4, 'the recorded impact lies on the rewound hull, not the live one');
  console.log(`poseHistory.selftest: rewound sweep hits (${hit.kind}, ${hit.damage} dmg) where the live sweep misses a target displaced 6 m; ${rewinds} sweeps wrapped, live pose restored`);
}

// ------------------------------------------------------------ 3. the roster cap now admits 14v14 plus bots
{
  assert.equal(MAX_AUTHORITATIVE_PLAYERS, 64);
  const players = [];
  for (let index = 0; index < 28; index++) {
    players.push({ id: `p${index}`, specId: index % 2 ? 't90m' : 'm1a2', team: index < 14 ? 'alpha' : 'bravo', bot: index % 4 === 3 });
  }
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 77, countdownS: 0, players });
  match.onMatchReady();
  assert.equal(match.entities.length, 28);
  const positions = match.entities.map((entity) => entity.state.pos);
  for (let a = 0; a < positions.length; a++) {
    for (let b = a + 1; b < positions.length; b++) {
      assert.ok(positions[a].distanceTo(positions[b]) > 2, `spawns ${a}/${b} do not overlap`);
    }
  }
  for (let tick = 0; tick < 30; tick++) match.step({ dt: 1 / 60, inputs: new Map() });
  assert.ok(match.entities.every((entity) => Number.isFinite(entity.state.pos.x)));
  assert.throws(() => createAuthoritativeMatch({ players: Array.from({ length: 65 }, (_, i) => ({ id: `x${i}`, specId: 'm1a2', team: 'alpha' })) }), /1-64/);
  console.log('poseHistory.selftest: a 28-tank roster spawns without overlap and steps; 65 is refused');
}
