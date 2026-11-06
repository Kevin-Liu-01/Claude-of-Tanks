// verdictBallShot.selftest — a shell already in flight at the verdict does not play the Turbo Ball in the ending hold
// (round 3 A1 / round 2 U4, 2026-11-06). The verdict stops the mode's rules, not the bodies already moving: the hold
// keeps stepping shells (authoritativeMatch.ts stepShells, state.ts advanceGuidedShell), and each step asks the mode
// controller's tryHitBall first. tryHitBall had no verdict check, unlike recordDestruction, step and reviveAll, so a round
// fired just before the time limit still launched the ball, made its shooter the last toucher and announced
// mode_ball_hit after match_ended; settleAfterVerdict then flew the ball for the rest of the hold. Through the hold the
// ball is touched by nothing (tanks drive through it, shells fly through it) and only comes to rest.
//
// The real path: the authority's own step, a human seat aiming at the ball and firing, the battle clock ending the match
// one tick after the shot leaves and one tick before it reaches the ball.
import assert from 'node:assert/strict';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc']); // the roster's calibration only, not the whole fleet's builders
const DT = 1 / 60;
const FIRE_TICK = 60;
const HIT_TICK = 62; // M829A4 at 1670 m/s from 6 m ahead of the hull covers the 90 m to the ball in two ticks
const HOLD_TICKS = 180;

/** One battle: the striker lays on the kick-off ball and fires at FIRE_TICK; battleLimitS ends it on the clock. */
function battle(battleLimitS, ticks) {
  const match = createAuthoritativeMatch({ gameMode: 'turbo_ball', countdownS: 0, mapId: 'verdant', seed: 31, battleLimitS,
    players: [
      { id: 'striker', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: -10, z: -60, yaw: 0 } },
      { id: 'keeper', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 200, z: 300, yaw: Math.PI } },
    ] });
  match.onMatchReady();
  const striker = match.entityById.get('striker');
  const ball = match.modeController.state.ball;
  const rest = { x: ball.x, y: ball.y, z: ball.z };
  const input = { throttle: 0, steer: 0, brake: true, fire: false, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
  const inputs = new Map([['striker', input], ['keeper', { ...input }]]);
  const events = [];
  let endedAt = null;
  for (let tick = 1; tick <= ticks; tick++) {
    // the aim intent's origin is the hull (sim/aimIntent.ts decodeAimIntent): lay on the ball's centre
    const dx = ball.x - striker.state.pos.x, dy = ball.y - striker.state.pos.y, dz = ball.z - striker.state.pos.z;
    const d = Math.hypot(dx, dy, dz);
    input.aimYaw = Math.atan2(dx, dz); input.aimPitch = Math.asin(dy / d); input.aimDistance = d;
    input.fire = tick >= FIRE_TICK;
    match.step({ dt: DT, inputs });
    for (const event of match.eventsForViewer('striker')) {
      if (event.type === 'shell_fired' || event.type === 'match_ended' || event.type.startsWith('mode_')) events.push({ tick, type: event.type });
    }
    match.afterEventBroadcast();
    if (match.result && endedAt == null) endedAt = tick;
  }
  return { match, ball, rest, events, endedAt };
}

// teeth: with no clock the round leaves at FIRE_TICK and plays the ball at HIT_TICK
{
  const { ball, events } = battle(undefined, HIT_TICK);
  assert.deepEqual(events, [{ tick: FIRE_TICK, type: 'shell_fired' }, { tick: HIT_TICK, type: 'mode_ball_hit' }],
    'the striker\'s round reaches the ball two ticks after it leaves');
  assert.equal(ball.lastTouchId, 'striker');
  assert.ok(Math.hypot(ball.vx, ball.vz) > 30, 'and launches it');
}

// the clock ends the battle between the shot and the ball: the hold flies the round on, through a ball nobody touches
{
  const { match, ball, rest, events, endedAt } = battle((FIRE_TICK + 0.5) * DT, HIT_TICK + HOLD_TICKS);
  assert.equal(endedAt, FIRE_TICK + 1, 'the verdict lands the tick after the round leaves');
  assert.equal(match.resultReason, 'time_limit');
  assert.deepEqual(events.slice(0, 2), [{ tick: FIRE_TICK, type: 'shell_fired' }, { tick: FIRE_TICK + 1, type: 'match_ended' }]);
  assert.deepEqual(events.slice(2), [], `no ball hit or other mode event is announced in the hold (${JSON.stringify(events.slice(2))})`);
  assert.equal(ball.lastTouchId, null, 'the late round does not make its shooter the last toucher');
  assert.ok(Math.hypot(ball.vx, ball.vy, ball.vz) < 0.5, `the ball is not launched (v ${ball.vx.toFixed(2)},${ball.vy.toFixed(2)},${ball.vz.toFixed(2)})`);
  assert.ok(Math.hypot(ball.x - rest.x, ball.z - rest.z) < 0.5, `and rests at its kick-off spot (${ball.x.toFixed(1)},${ball.z.toFixed(1)})`);
  assert.equal(match.result, 'draw', 'the verdict stands');
}

console.log('verdictBallShot selftest passed: a round in flight at the verdict flies through the ball; no hit, touch or launch in the hold');
