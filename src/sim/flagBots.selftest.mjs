// Capture the Flag bots (gameplay-modes-228; owner 2026-10-18: "increase aggression of bots trying to capturing flag").
// A capture needs the own flag home, so recovery unlocks the score: the nearest recoverMin go for a taken home flag
// before anything else and (huntWhenHomeFlagTaken) every bot that is not escorting; a carried flag is cut off at its
// carrier's point interceptLeadS ahead on its line home (the flag marker and the home are public). Three escorts lead
// the own carrier home, AHEAD on its route; defendShare of a large squad guards home; the rest raid on lanes.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor } from './matchRuleset.ts';

const rules = matchRulesetFor('capture_the_flag').flagBots;
const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const squad = Array.from({ length: 7 }, (_, i) => tank(`a${i}`, 'alpha', i * 15 - 45, -300));
const enemy = Array.from({ length: 7 }, (_, i) => tank(`b${i}`, 'bravo', i * 15 - 45, 300));
const mode = createMatchModeController({ mode: 'capture_the_flag', entities: [...squad, ...enemy], seed: 2, terrainHeight: () => 0,
  setActive(t, a) { t.modeActive = a; }, revive(t, s) { Object.assign(t.state.pos, { x: s.x, z: s.z }); t.combat.destroyed = false; } });
const own = mode.state.flags.find((f) => f.team === 'alpha'), theirs = mode.state.flags.find((f) => f.team === 'bravo');
const jobs = () => squad.map((b) => mode.botObjective(b));

// nothing carried: one guard (defendShare of seven), the rest raid
{
  const missions = jobs().map((j) => j.mission);
  assert.equal(missions.filter((m) => m === 'defend').length, Math.max(1, Math.round(7 * rules.defendShare)));
  assert.equal(missions.filter((m) => m === 'raid').length, 7 - Math.max(1, Math.round(7 * rules.defendShare)));
}
// our flag carried off by their carrier, ours carried by ours: the nearest two recover first, three escort, the rest recover
{
  const thief = enemy[0], carrier = squad[0];
  Object.assign(thief.state.pos, { x: 0, z: -150 }); thief.state.speed = 9;
  own.status = 'carried'; own.carrierId = thief.id; own.x = 0; own.z = -150;
  theirs.status = 'carried'; theirs.carrierId = carrier.id; Object.assign(carrier.state.pos, { x: 0, z: 150 }); theirs.x = 0; theirs.z = 150;
  const all = jobs();
  assert.equal(all[0].mission, 'carrier', 'our carrier heads home');
  const recover = all.filter((j) => j.mission === 'recover'), escort = all.filter((j) => j.mission === 'escort');
  assert.equal(escort.length, rules.escorts, 'three escorts');
  assert.equal(recover.length, 6 - rules.escorts, 'every other bot recovers (a capture needs our flag home)');
  // the intercept: the thief's point interceptLeadS ahead on its line to its own home (+z)
  const lead = Math.min(own.z + 9 * rules.interceptLeadS, 300) ;
  for (const j of recover) assert.ok(Math.abs(j.z - lead) < 1 && Math.abs(j.x) < 1, `recoverers cut the carrier off at z ${lead} (got ${j.z.toFixed(1)})`);
  // escorts lead the carrier: ahead of it on its route home (toward -z)
  for (const j of escort) assert.ok(j.z < carrier.state.pos.z - rules.escortAheadM + 1, `an escort leads at z ${j.z.toFixed(1)}`);
  const sides = escort.map((j) => Math.sign(Math.round(j.x)));
  assert.deepEqual(sides.sort(), [-1, 0, 1], 'one each side and one straight ahead');
}
// only our flag away: the nearest recoverMin are first, then every free bot (none raid while our flag is out)
{
  theirs.status = 'home'; theirs.carrierId = null; theirs.x = theirs.baseX; theirs.z = theirs.baseZ;
  own.status = 'dropped'; own.carrierId = null; own.x = 40; own.z = -100;
  const all = jobs();
  assert.ok(all.every((j) => j.mission === 'recover'), 'huntWhenHomeFlagTaken: everyone recovers a dropped home flag');
  assert.ok(all.every((j) => Math.hypot(j.x - 40, j.z + 100) < 1), 'at the dropped flag');
}
console.log('flagBots.selftest: recovery before everything, the intercept ahead of the carrier, three escorts leading it home, one guard, the raid');
