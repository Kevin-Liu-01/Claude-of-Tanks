// Frontline cover (bots lane, 2026-10-03). The attackers lose when their humans die (assault_overrun). An idle human
// stays at its deployment; once the attack was spent at the last line, the defenders' no-contact search found it alone
// at its pad (Redrock Divide and Desert, every overrun of 48 seeds came after the last attacking bot had died). On the
// last line, while a human of the attacking side stands far behind it and a defender is left, two of its bots (one when
// fewer than four are left) hold covering points in front of it; they rejoin the attack when no defender is left or the
// human comes up to the line. The middle lines keep every bot in the attack.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';

function entity(id, team, x, z, { bot = false } = {}) {
  return {
    id, team, bot,
    state: { pos: { x, y: 0, z }, yaw: team === 'alpha' ? 0 : Math.PI, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [24, 16, 6], ammoCapacity: [24, 16, 6] },
  };
}

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
const missions = () => bots.map((bot) => match.botTarget(bot)?.mission ?? null);
const covers = () => bots.filter((bot) => match.botTarget(bot)?.mission === 'cover');
const lineOf = (index) => match.state.zones[index];
const far = (index) => Math.hypot(lineOf(index).x - human.state.pos.x, lineOf(index).z - human.state.pos.z);
const attackers = bots.slice(2);
const standAt = (index, short = 0) => {
  for (const bot of attackers) Object.assign(bot.state.pos, { x: lineOf(index).x, z: lineOf(index).z - short });
};

step(1.1);
assert.ok(far(0) < 250, 'fixture: line 1 is near the pad');
assert.deepEqual(missions(), Array(6).fill('assault'), 'with the live line near the human every bot attacks');
console.log(`  ok  line 1, ${far(0).toFixed(0)} m from the human: all six bots attack`);

// the attack takes line 1: the middle line stands far from the idle human, and every bot still attacks
standAt(0);
step(10);
assert.equal(match.state.line.index, 1, 'fixture: line 1 taken');
standAt(1, 40);
step(1.1);
assert.ok(far(1) > 250, 'fixture: line 2 is far from the pad');
assert.deepEqual(missions(), Array(6).fill('assault'), `the middle line keeps every bot in the attack (${missions()})`);
console.log(`  ok  line 2, ${far(1).toFixed(0)} m from the human: all six bots attack`);

// the attack takes line 2: on the last line the two bots nearest the human cover it
standAt(1);
step(10);
assert.equal(match.state.line.index, 2, 'fixture: line 2 taken, the last line is live');
standAt(2, 40);
step(1.1);
assert.ok(enemies.some((enemy) => enemy.modeActive !== false && !enemy.combat.destroyed), 'fixture: defenders are left');
const pair = covers();
assert.equal(pair.length, 2, `two bots cover the human on the last line (${missions().join(', ')})`);
assert.deepEqual(pair.map((bot) => bot.id).sort(), ['ally-0', 'ally-1'], 'the two bots nearest the human cover it');
for (const bot of pair) {
  const point = match.botTarget(bot);
  const fromHuman = Math.hypot(point.x - human.state.pos.x, point.z - human.state.pos.z);
  assert.ok(fromHuman < 40, `${bot.id}'s covering point stands ${fromHuman.toFixed(1)} m from the human`);
  assert.ok(point.z > human.state.pos.z, `${bot.id}'s covering point is on the line's side of the human`);
}
assert.equal(bots.filter((bot) => match.botTarget(bot)?.mission === 'assault').length, 4, 'the other four attack');
console.log(`  ok  line 3, ${far(2).toFixed(0)} m from the human: the two nearest bots cover it, four attack`);

// kept once chosen: an attacker that drives back past them does not take the job
Object.assign(bots[5].state.pos, { x: 0, z: -445 });
step(2.1);
assert.deepEqual(covers().map((bot) => bot.id).sort(), ['ally-0', 'ally-1'], 'the covering pair is kept once chosen');
Object.assign(bots[5].state.pos, { x: lineOf(2).x, z: lineOf(2).z - 40 });
console.log('  ok  the covering pair is kept once chosen');

// losses: three bots left keep one cover; a lone survivor stays with the human while a defender is left
for (const bot of [bots[2], bots[3], bots[1]]) bot.combat.destroyed = true;
step(1.1);
assert.deepEqual(covers().map((bot) => bot.id), ['ally-0'], 'three bots left: one covers');
for (const bot of [bots[4], bots[5]]) bot.combat.destroyed = true;
step(1.1);
assert.deepEqual(covers().map((bot) => bot.id), ['ally-0'], 'a lone survivor stays with the human');
console.log('  ok  three bots left keep one cover; a lone survivor stays');

// no defender left: the cover goes to take the line
const fielded = enemies.filter((enemy) => enemy.modeActive !== false && !enemy.combat.destroyed);
for (const enemy of fielded) enemy.combat.destroyed = true;
step(1.1);
assert.deepEqual(missions().filter(Boolean), ['assault'], 'with no defender left the last bot attacks the line');
for (const enemy of fielded) enemy.combat.destroyed = false;
console.log('  ok  no defender left: the cover attacks the line');

// the human comes up to the line: every bot attacks; defenders never cover
for (const bot of bots) bot.combat.destroyed = false;
Object.assign(human.state.pos, { x: lineOf(2).x, z: lineOf(2).z - 150 });
step(1.1);
assert.deepEqual(missions(), Array(6).fill('assault'), 'with the human near the line every bot attacks again');
for (const enemy of enemies) assert.notEqual(match.botTarget(enemy)?.mission, 'cover', 'defenders never cover');
console.log('  ok  the human at the front: every bot attacks; defenders never cover');

console.log('frontlineCover.selftest: an idle human far behind the last line keeps cover');
