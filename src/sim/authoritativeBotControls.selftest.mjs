import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT } from './movement.ts';

function fixture(countdownS) {
  return createAuthoritativeMatch({
    mapId: 'verdant', seed: 123,
    ...(countdownS === undefined ? {} : { countdownS }),
    players: [
      { id: 'bot', specId: 'm1a2', team: 'alpha', bot: true,
        spawn: { x: 0, z: 0, yaw: 1 } },
      { id: 'human', specId: 't90m', team: 'bravo',
        spawn: { x: 50, z: 90, yaw: Math.PI } },
    ],
  });
}

// Real private/dedicated matches use a countdown; most older bot tests skipped
// it with countdownS: 0 and never encountered the countdown's aiming lock.
for (const countdownS of [undefined, SIM_DT, 0]) {
  const match = fixture(countdownS);
  const bot = match.entityById.get('bot');
  const human = match.entityById.get('human');
  const inputs = new Map();
  const spawn = bot.state.pos.clone();
  const initialYaw = bot.state.turretYaw;
  const initialPitch = bot.state.gunPitch;
  match.onMatchReady();
  let countdownTicks = 0;
  while (match.phase === 'countdown') {
    assert.ok(countdownTicks++ < 302, 'countdown is bounded');
    match.step({ dt: SIM_DT, inputs });
    for (const entity of match.entities) {
      assert.equal(entity.input.aimLocked, true, 'countdown holds every gun');
      assert.equal(entity.input.fire, false, 'countdown cannot fire');
      assert.equal(entity.input.throttle, 0, 'countdown cannot drive');
    }
    assert.ok(bot.state.pos.equals(spawn), 'bot stays at its countdown pose');
    assert.equal(bot.state.turretYaw, initialYaw);
    assert.equal(bot.state.gunPitch, initialPitch);
  }
  assert.equal(match.phase, 'playing');
  let minYaw = initialYaw, maxYaw = initialYaw;
  let minPitch = initialPitch, maxPitch = initialPitch;
  let shots = 0, engaged = false;
  for (let tick = 0; tick < 600; tick++) {
    match.step({ dt: SIM_DT, inputs });
    assert.equal(bot.input.aimLocked, false,
      'live AI regains gun control on the first playing tick after countdown');
    assert.equal(human.input.aimLocked, true,
      'a human without network input remains safely locked');
    minYaw = Math.min(minYaw, bot.state.turretYaw);
    maxYaw = Math.max(maxYaw, bot.state.turretYaw);
    minPitch = Math.min(minPitch, bot.state.gunPitch);
    maxPitch = Math.max(maxPitch, bot.state.gunPitch);
    engaged ||= bot.aiCtl.debugInfo().targetId === human.id;
    shots += match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 }).events
      .filter((event) => event.type === 'shell_fired' && event.shooterId === bot.id).length;
    match.afterSnapshotBroadcast();
  }
  assert.ok(engaged, 'the normal controller acquires the visible human');
  assert.ok(maxYaw - minYaw > 0.5, 'bot visibly traverses its turret');
  assert.ok(maxPitch - minPitch > 0.03, 'bot elevates/depresses its gun on terrain');
  assert.ok(shots > 0, 'unlocked bot aligns and fires actual authoritative shells');

  // Player aiming holds and disconnect safety remain human-owned. Releasing
  // bots must not globally unlock every vehicle at the end of the countdown.
  inputs.set(human.id, { throttle: 0, steer: 0, brake: true, fire: false,
    aimYaw: 1, aimPitch: 0.1, aimLocked: true, shellSlot: 0 });
  match.step({ dt: SIM_DT, inputs });
  assert.equal(human.input.aimLocked, true, 'explicit human aiming hold is preserved');
  inputs.get(human.id).aimLocked = false;
  match.step({ dt: SIM_DT, inputs });
  assert.equal(human.input.aimLocked, false, 'fresh human input releases its own hold');
  match.onPeerLeave({ peerId: human.id });
  inputs.clear();
  match.step({ dt: SIM_DT, inputs });
  assert.equal(human.input.aimLocked, true, 'disconnected human stays locked');
  assert.equal(bot.input.aimLocked, false, 'a human disconnect does not lock the bot');

  console.log(`bot controls: countdown=${countdownS ?? 'default 5s'}, `
    + `turret span=${(maxYaw - minYaw).toFixed(3)}, `
    + `pitch span=${(maxPitch - minPitch).toFixed(3)}, shots=${shots}`);
}

{
  const match = fixture(0);
  const bot = match.entityById.get('bot');
  const inputs = new Map();
  match.onMatchReady();
  bot.modeActive = false;
  bot.input.aimLocked = true;
  match.step({ dt: SIM_DT, inputs });
  assert.equal(bot.input.aimLocked, true, 'an inactive mode participant stays held');
  bot.modeActive = true;
  match.step({ dt: SIM_DT, inputs });
  assert.equal(bot.input.aimLocked, false, 'reactivated bot regains its AI aiming');
  bot.combat.destroyed = true;
  bot.input.aimLocked = true;
  const { turretYaw, gunPitch } = bot.state;
  match.step({ dt: SIM_DT, inputs });
  assert.equal(bot.input.aimLocked, true, 'destroyed bots are not unlocked');
  assert.equal(bot.input.fire, false, 'destroyed bots cannot fire');
  assert.equal(bot.state.turretYaw, turretYaw, 'destroyed turret is not steered by AI');
  assert.equal(bot.state.gunPitch, gunPitch, 'destroyed gun is not steered by AI');
}

console.log('authoritativeBotControls.selftest: countdown/AI/human/lifecycle control handoff passed');
