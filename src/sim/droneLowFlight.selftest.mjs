import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT } from './movement.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// Owner 2026-10-12: "i cant fly as low as i want now, it feels like there ssome ground hitbox thats preventing me.
// deploy 212 was when it was still good." A human pilot in the shared authority, on Verdant's real terrain and
// collision shard, holds a 1.5 m skim with a plain height-hold autopilot. Deploy 213's look-ahead avoidance never let
// that airframe below 2.3 m and kept it 7-18 m up; free flight must follow the stick down to the ground, and the
// flight ends only on real contact.
function skim(throttle) {
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  const match = createAuthoritativeMatch({ players: [
    { id: 'h1', specId: 'm1a1_abrams_hc', team: 'alpha' },
    { id: 'b1', specId: 't90am', team: 'bravo', bot: true, difficulty: 'easy' },
  ], mapId: 'verdant', seed: 7, countdownS: 0, gameMode: 'drone', worldCollision: world });
  match.onMatchReady();
  const pilot = match.entityById.get('h1'), inputs = new Map();
  const yaw = Math.atan2(-pilot.state.pos.x, -pilot.state.pos.z), ground = (x, z) => match.heightField.getHeightAt(x, z);
  let prevY = null, flown = 0, low = 0, minAgl = Infinity, launched = false, contact = null;
  for (let tick = 1; tick <= 60 * 30; tick++) {
    const a = pilot.aerial;
    let aimPitch = 0, th = 0;
    if (a?.active && !a.launching) {
      const agl = a.y - Math.max(ground(a.x, a.z), ground(a.x + Math.sin(yaw) * 15, a.z + Math.cos(yaw) * 15));
      const vy = prevY === null ? 0 : (a.y - prevY) / SIM_DT;
      aimPitch = Math.max(-.25, Math.min(.35, .06 * (1.5 - agl) - .03 * vy)); th = throttle;
    }
    inputs.set('h1', { throttle: th, steer: 0, brake: false, fire: false, fireIntentSeq: null, aimLocked: false, shellSlot: 0,
      actionBits: tick === 5 ? PLAYER_ACTION_BITS.DRONE : 0, aimYaw: yaw, aimPitch, aimDistance: 300 });
    match.step({ dt: SIM_DT, inputs });
    for (const e of match.eventsForViewer('__low_flight__')) if (e.type === 'shell_impact' && e.shooterId === 'h1') contact ??= e;
    match.afterEventBroadcast();
    const v = pilot.aerial;
    prevY = v?.active ? v.y : null;
    if (v?.active) launched = true;
    if (launched && v?.active && !v.launching) {
      const agl = v.y - ground(v.x, v.z);
      flown++; minAgl = Math.min(minAgl, agl); if (agl < 3) low++;
    }
    if (launched && !v?.active) break;
  }
  world.release?.();
  return { flownS: flown / 60, lowS: low / 60, minAgl, contact };
}
for (const throttle of [1, .5]) {
  const run = skim(throttle);
  assert.ok(run.minAgl < 2, `throttle ${throttle}: a human pilot flies as low as they steer (lowest ${run.minAgl.toFixed(2)} m)`);
  assert.ok(run.lowS >= 1.5, `throttle ${throttle}: and holds it, not bounced back up (${run.lowS.toFixed(2)} s under 3 m)`);
  if (run.contact) assert.ok(['prop', 'terrain', 'structure', 'tank'].includes(run.contact.kind),
    `throttle ${throttle}: the skim ends only on real contact (${run.contact.kind}/${run.contact.surfaceKind})`);
  console.log(`droneLowFlight: throttle ${throttle}: lowest ${run.minAgl.toFixed(2)} m, ${run.lowS.toFixed(2)} s under 3 m in ${run.flownS.toFixed(2)} s, ended on ${run.contact ? `${run.contact.kind}/${run.contact.surfaceKind}` : 'the battery/range'}`);
}
console.log('droneLowFlight: a human pilot skims Verdant at 1.5 m with no ground cushion');
