// Frontline Assault (gameplay-modes-228; owner 2026-10-18: "up its aggression of tanks more"). Sector 1 fell in 24 s
// with no shot fired: its three defenders were still driving from the bravo base 800 m back. Pins: the opening four
// stand ON the line (lineBandM behind its centre, facing the attack); a sector's reinforcements form on its own line;
// a counter-attack squad drives AT the sector just taken afterCaptureS after it falls, for forS, then falls back; while
// a sector is contested and short, one defender arrives from the rear every reinforceTrickleS; the attackers push in
// groups (pushMinGroup within pushGroupM, or pushAfterS at the edge) and flank on lanes.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor } from './matchRuleset.ts';

const rules = matchRulesetFor('frontline_assault');
const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const human = tank('human', 'alpha', 0, -400, false);
const allies = [0, 1, 2].map((i) => tank(`ally-${i}`, 'alpha', i * 12 - 12, -400));
const defenders = Array.from({ length: 12 }, (_, i) => tank(`def-${i}`, 'bravo', i * 8 - 44, 400));
const events = [];
const mode = createMatchModeController({ mode: 'frontline_assault', entities: [human, ...allies, ...defenders], seed: 11, terrainHeight: () => 0,
  emit: (type, payload) => events.push({ type, payload }),
  setActive(target, active) { target.modeActive = active; },
  revive(target, spawn) { Object.assign(target.state.pos, { x: spawn.x, z: spawn.z }); target.state.yaw = spawn.yaw; target.combat.destroyed = false; } });
const live = () => defenders.filter((d) => d.modeActive !== false && !d.combat.destroyed);
const zone = (i) => mode.state.zones[i];
// the axis runs alpha -> bravo (+z here): "behind" a sector is further along it
const along = (target, i) => target.state.pos.z - zone(i).z;
assert.equal(live().length, rules.assault.initialActive, 'the opening line: four defenders');
for (const d of live()) {
  const back = along(d, 0);
  assert.ok(back >= rules.assault.lineBandM[0] - 1 && back <= rules.assault.lineBandM[1] + 1, `${d.id} dug in ${back.toFixed(0)} m behind sector 1`);
  assert.ok(Math.abs(Math.cos(d.state.yaw) + 1) < 0.05, `${d.id} faces the attack`);
  assert.deepEqual(mode.botTarget(d), { x: zone(0).x, z: zone(0).z, mission: 'assault' }, 'and holds sector 1');
}
// the attackers push together: the humans and the allies stand within pushGroupM, so the push goes in at once
allies.forEach((a, i) => Object.assign(a.state.pos, { x: zone(0).x + i * 10, z: zone(0).z - 60 }));
Object.assign(human.state.pos, { x: zone(0).x, z: zone(0).z - 70 });
let t = 0;
const step = (s) => { for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; mode.step(1 / 60, t); } };
step(1.1);
for (const a of allies) assert.deepEqual(mode.botTarget(a), { x: zone(0).x, z: zone(0).z, mission: 'assault' }, `${a.id} pushes into the centre with the group`);
// a lone attacker at the edge waits for its group (or pushAfterS)
{
  const lone = tank('lone', 'alpha', 0, -400);
  const solo = createMatchModeController({ mode: 'frontline_assault', entities: [tank('h', 'alpha', 0, -600, false), lone, ...Array.from({ length: 6 }, (_, i) => tank(`d${i}`, 'bravo', i * 8, 400))],
    seed: 3, terrainHeight: () => 0, setActive(x, a) { x.modeActive = a; }, revive(x, s) { Object.assign(x.state.pos, { x: s.x, z: s.z }); x.combat.destroyed = false; } });
  const z0 = solo.state.zones[0];
  Object.assign(lone.state.pos, { x: z0.x, z: z0.z - 70 });
  let ts = 0; const go = (s) => { for (let i = 0; i < Math.round(s * 60); i++) { ts += 1 / 60; solo.step(1 / 60, ts); } };
  go(1.1);
  const wait = solo.botTarget(lone);
  assert.ok(Math.hypot(wait.x - z0.x, wait.z - z0.z) > 40, 'alone at the edge, it stages outside the zone');
  go(rules.assaultBots.pushAfterS + 1);
  assert.deepEqual(solo.botTarget(lone), { x: z0.x, z: z0.z, mission: 'assault' }, `after ${rules.assaultBots.pushAfterS} s it pushes in anyway`);
}
// take sector 1: the next line forms on sector 2 and the counter-attack goes in on sector 1
Object.assign(human.state.pos, { x: zone(0).x, z: zone(0).z });
for (const d of live()) d.combat.destroyed = true; // the opening line died fighting
step(9);
assert.equal(mode.state.line.index, 1, 'sector 1 taken');
const takenAt = t;
const fresh = live();
assert.equal(fresh.length, rules.assault.initialActive + 1, 'sector 2 fields five');
for (const d of fresh) assert.ok(along(d, 1) >= rules.assault.lineBandM[0] - 1 && along(d, 1) <= rules.assault.lineBandM[1] + 1, `${d.id} forms on sector 2's line`);
step(rules.assault.counterAttack.afterCaptureS + 0.5);
const counter = fresh.filter((d) => mode.botTarget(d)?.mission === 'counter');
assert.equal(counter.length, rules.assault.counterAttack.squad, 'two fresh defenders counter-attack');
for (const d of counter) assert.ok(Math.hypot(mode.botTarget(d).x - zone(0).x, mode.botTarget(d).z - zone(0).z) < 1, 'at the sector just taken');
assert.ok(events.some((e) => e.type === 'mode_counter_attack'));
step(takenAt + rules.assault.counterAttack.afterCaptureS + rules.assault.counterAttack.forS + 1 - t);
assert.ok(counter.every((d) => mode.botTarget(d).mission === 'assault'), 'the squad falls back to its line after forS');
// contested and short: one defender from the rear every reinforceTrickleS, up to the count + reinforceExtra
fresh.slice(0, 3).forEach((d) => { d.combat.destroyed = true; });
Object.assign(human.state.pos, { x: zone(1).x, z: zone(1).z - 50 });
const before = live().length;
step(rules.assault.reinforceTrickleS * 2 + 1);
assert.ok(live().length > before, 'the contested line takes reinforcements from the rear');
assert.ok(events.some((e) => e.type === 'mode_line_reinforced'));
console.log('frontlineDefenders.selftest: the line dug in from the start, reinforcements on their own line, the counter-attack, the rear trickle, grouped pushes');
