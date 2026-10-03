// Frontline regroup (bots lane, 2026-10-03). The last sector decided the frontline: its counter-attack wave met the
// survivors of the second sector while the bots revived at the spawn arrived 40-80 s behind them and died alone
// (Redrock Divide and Desert, 24 seeds each). When the attack takes the second-to-last sector, its bots hold that
// sector until every living bot has come up (or 60 s pass, or a human leads the way), then attack the last one
// together. The middle sector and the defenders are unchanged.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';

function entity(id, team, x, z, { bot = false } = {}) {
  return {
    id, team, bot,
    state: { pos: { x, y: 0, z }, yaw: team === 'alpha' ? 0 : Math.PI, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [24, 16, 6], ammoCapacity: [24, 16, 6] },
  };
}

/** A frontline with the attack two sectors in: bots 2-5 took both, bots 0 and 1 stayed at the spawn. */
function twoSectorsIn() {
  const human = entity('human', 'alpha', 0, -450);
  const bots = Array.from({ length: 6 }, (_, i) => entity(`ally-${i}`, 'alpha', 12 * i - 30, -440 + 4 * i, { bot: true }));
  const enemies = Array.from({ length: 10 }, (_, i) => entity(`enemy-${i}`, 'bravo', 10 * i - 45, 450, { bot: true }));
  const match = createMatchModeController({
    mode: 'frontline_assault', entities: [human, ...bots, ...enemies], seed: 6000, terrainHeight: () => 0,
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) {
      Object.assign(target.state.pos, { x: spawn.x, y: 0, z: spawn.z });
      target.combat.hp = target.combat.maxHp;
      target.combat.destroyed = false;
    },
  });
  let timeS = 0;
  const step = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) { timeS += 1 / 60; match.step(1 / 60, timeS); } };
  /** Steps until the line index reaches `index` (at most 20 s); the time it did. */
  const advanceTo = (index) => {
    for (let i = 0; i < 20 * 60 && match.state.line.index < index; i++) { timeS += 1 / 60; match.step(1 / 60, timeS); }
    assert.equal(match.state.line.index, index, `fixture: the line advances to ${index}`);
    return timeS;
  };
  const line = (index) => match.state.zones[index];
  const standAt = (index) => { for (const bot of bots.slice(2)) Object.assign(bot.state.pos, { x: line(index).x, z: line(index).z }); };
  step(1.1);
  standAt(0);
  advanceTo(1);
  step(1.1);
  const middle = bots.map((bot) => match.botTarget(bot));
  standAt(1);
  const takenAt = advanceTo(2);
  const until = (s) => step(takenAt + s - timeS);
  return { human, bots, enemies, match, step, until, line, middle };
}

const at = (target, point) => Math.hypot(target.x - point.x, target.z - point.z) < 1;

console.log('[1] after the second sector falls the bots hold it until the bots behind come up');
{
  const { bots, enemies, match, step, line, middle } = twoSectorsIn();
  assert.ok(middle.every((target) => at(target, line(1))), 'the middle sector is attacked at once (no regroup there)');
  step(1.1);
  for (const bot of bots) {
    const target = match.botTarget(bot);
    assert.ok(at(target, line(1)) && target.mission === 'assault',
      `${bot.id} holds the sector just taken (target ${target.x.toFixed(0)}, ${target.z.toFixed(0)})`);
  }
  for (const enemy of enemies.filter((e) => e.modeActive !== false)) {
    assert.ok(at(match.botTarget(enemy), line(2)), `defender ${enemy.id} still goes to the last sector`);
  }
  console.log('  ok  all six bots hold sector 2 while two of them are 500 m back; defenders go to sector 3');
  step(20);
  assert.ok(bots.every((bot) => at(match.botTarget(bot), line(1))), 'the wait goes on while the two are still back');
  for (const bot of bots.slice(0, 2)) Object.assign(bot.state.pos, { x: line(1).x + 40, z: line(1).z - 50 });
  step(1.1);
  for (const bot of bots) assert.ok(at(match.botTarget(bot), line(2)), `${bot.id} attacks the last sector together`);
  console.log('  ok  when the last two come within 80 m every bot attacks sector 3');
}

console.log('[2] the wait is bounded');
{
  const { bots, match, until, line } = twoSectorsIn();
  until(58);
  assert.ok(bots.every((bot) => at(match.botTarget(bot), line(1))), 'still holding at 58 s');
  until(61.5);
  assert.ok(bots.every((bot) => at(match.botTarget(bot), line(2))), 'after 60 s they attack without the two');
  console.log('  ok  with two bots never coming up, the attack goes in after 60 s');
}

console.log('[3] a human leading the way ends the wait');
{
  const { human, bots, match, step, line } = twoSectorsIn();
  Object.assign(human.state.pos, { x: line(2).x, z: line(2).z - 200 });
  step(1.1);
  assert.ok(bots.every((bot) => at(match.botTarget(bot), line(2))), 'the bots follow the human to the last sector');
  console.log('  ok  a human 200 m from sector 3: every bot attacks it');
}

console.log('[4] a wreck does not hold the wait');
{
  const { bots, match, step, line } = twoSectorsIn();
  for (const bot of bots.slice(0, 2)) bot.combat.destroyed = true;
  step(1.1);
  assert.ok(bots.slice(2).every((bot) => at(match.botTarget(bot), line(2))), 'the four living bots attack at once');
  console.log('  ok  the two bots behind destroyed: the four at sector 2 attack sector 3');
}

console.log('frontlineRegroup.selftest: the attack regroups before the last sector');
