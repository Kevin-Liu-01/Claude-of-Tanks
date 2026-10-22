// Turbo Ball bots (gameplay-modes-228; owner 2026-10-18: "increase aggression of bots ... pursuing ball"). The striker
// aims at where the ball WILL be — P(t) = ball + v·τ(1 − e^(−t/τ)) with τ = 2.08 s (the drag law, 0.992 per 60 Hz
// step), t its ETA iterated twice and clamped to leadMaxS — not where it was; two strikers (a chaser and its support);
// at most crowdCap of a team within crowdM of the ball; a keeper off the own goal; the striker's shot at the ball only
// toward the opponent goal; a ball nobody touches goes back to the kick-off spot after idleResetS.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor } from './matchRuleset.ts';

const rules = matchRulesetFor('turbo_ball');
const tank = (id, team, x, z) => ({ id, team, bot: true, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const alpha = Array.from({ length: 7 }, (_, i) => tank(`a${i}`, 'alpha', i * 20 - 60, -150));
const bravo = Array.from({ length: 7 }, (_, i) => tank(`b${i}`, 'bravo', i * 20 - 60, 150));
const events = [];
const mode = createMatchModeController({ mode: 'turbo_ball', entities: [...alpha, ...bravo], seed: 9, terrainHeight: () => 0,
  emit: (type, payload) => events.push({ type, payload }),
  setActive(t, a) { t.modeActive = a; }, revive(t, s) { Object.assign(t.state.pos, { x: s.x, z: s.z }); t.combat.destroyed = false; } });
const ball = mode.state.ball;
const TAU = -1 / (60 * Math.log(0.992));
assert.ok(Math.abs(TAU - 2.08) < 0.01, 'the coasting time constant');
// a rolling ball: the striker leads it
Object.assign(ball, { x: 0, z: 0, vx: 20, vz: 0 });
const jobs = alpha.map((b) => mode.botObjective(b));
const strikers = jobs.filter((j) => j.mission === 'striker');
assert.equal(strikers.length, rules.ballBots.strikers, 'the ruleset\'s strikers');
assert.equal(jobs.filter((j) => j.mission === 'keeper').length, rules.ballBots.keepers, 'a keeper');
// the chaser: the striker nearest the ball (the support striker and any shooter carry the ball on their objective too)
const reach = (b) => Math.hypot(b.state.pos.x - ball.x, b.state.pos.z - ball.z);
const chaser = alpha.filter((b) => mode.botObjective(b).mission === 'striker').sort((p, q) => reach(p) - reach(q))[0];
assert.ok(chaser && mode.botObjective(chaser).ball, 'the chaser carries the ball (its jump and its shot read it)');
{
  const d = Math.hypot(chaser.state.pos.x, chaser.state.pos.z);
  let t = Math.min(rules.ballBots.leadMaxS, d / 10);
  for (let k = 0; k < rules.ballBots.leadIterations; k++) {
    const px = 20 * TAU * (1 - Math.exp(-t / TAU));
    t = Math.min(rules.ballBots.leadMaxS, Math.hypot(px - chaser.state.pos.x, chaser.state.pos.z) / 10);
  }
  const lead = 20 * TAU * (1 - Math.exp(-t / TAU));
  const j = mode.botObjective(chaser);
  // the setup point stands 20 m behind P on the line to the goal (or swings round): its x follows P, not the ball
  assert.ok(Math.abs(j.x - lead) < 25 && lead > 10, `the striker leads the rolling ball (P at x ${lead.toFixed(1)}, aim ${j.x.toFixed(1)})`);
}
// the crowd cap: only the strikers and the first screen close on the ball
for (const team of [alpha, bravo]) {
  const near = team.filter((b) => { const j = mode.botObjective(b); return Math.hypot(j.x - ball.x, j.z - ball.z) < rules.ballBots.crowdM; }).length;
  assert.ok(near <= rules.ballBots.crowdCap, `at most ${rules.ballBots.crowdCap} of a team sent within ${rules.ballBots.crowdM} m (${near})`);
}
// the keeper stands off the own goal
{
  const keeper = alpha.find((b) => mode.botObjective(b).mission === 'keeper');
  const goal = mode.state.goals.find((g) => g.team === 'alpha');
  const j = mode.botObjective(keeper);
  assert.ok(Math.hypot(j.x - goal.x, j.z - goal.z) <= rules.ballBots.keeperM + 1, 'the keeper is 30 m out from its goal');
}
// the shot at the ball: only when the ball lies toward the opponent goal — and (shootBall.everyRole) from any role, so
// the keeper and the screens move it too, the shot before a farther tank (overTanks)
{
  Object.assign(ball, { x: 0, z: 0, vx: 0, vz: 0 });
  const striker = chaser;
  Object.assign(striker.state.pos, { x: 0, z: -60 });
  assert.equal(mode.botObjective(striker).shootBall, true, 'behind the ball, on the line to the bravo goal: it may shoot');
  Object.assign(striker.state.pos, { x: 0, z: 60 });
  assert.equal(mode.botObjective(striker).shootBall, false, 'beyond the ball it never shoots it toward its own goal');
  const keeper = alpha.find((b) => mode.botObjective(b).mission === 'keeper');
  const keeperAt = { ...keeper.state.pos };
  Object.assign(keeper.state.pos, { x: 0, z: -90 });
  const kept = mode.botObjective(keeper);
  assert.equal(kept.shootBall, rules.ballBots.shootBall.everyRole, 'the keeper behind the ball may clear it toward their goal');
  assert.equal(kept.ballFirst, rules.ballBots.shootBall.everyRole && rules.ballBots.shootBall.overTanks, 'and takes that shot before a farther tank');
  Object.assign(keeper.state.pos, keeperAt);
}
// the idle reset
{
  Object.assign(ball, { x: 120, z: 40, vx: 0, vz: 0 });
  for (const b of [...alpha, ...bravo]) Object.assign(b.state.pos, { x: -400, z: b.state.pos.z });
  let t = 1;
  for (let i = 0; i < (rules.ball.idleResetS + 1) * 4; i++) { t += 0.25; mode.step(1 / 60, t); }
  assert.ok(events.some((e) => e.type === 'mode_ball_reset'), 'an untouched ball goes back to the kick-off spot');
  assert.ok(Math.hypot(ball.x - 120, ball.z - 40) > 50, 'it left the dead corner');
}
console.log('ballIntercept.selftest: the drag-law intercept, two strikers and a keeper, the crowd cap, the shot toward the goal, the idle reset');
