// Capture the Flag bots (gameplay-modes-228; owner 2026-10-18: "increase aggression of bots trying to capturing flag").
// A capture needs the own flag home, so recovery unlocks the score: with our flag away recoverShare of the squad (at
// least recoverMin, the nearest first) cuts its carrier off at the point interceptLeadS ahead on its line home (the flag
// marker and the home are public) and everyone else raids back (round 2: all-out recovery left the robbed side never
// raiding); our carrier takes three escorts AHEAD on its route home and, with our flag home, one guard stays on it and
// every other bot escorts too (the fourth on is the rearguard) — no longer every spare bot parked at home; with nothing
// carried defendShare of a large squad guards home and the rest raid on lanes.
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
// our flag carried off by their carrier, ours carried by ours (the standoff): recoverShare recovers, three escort, the
// rest escort too (our flag is away: no guard)
{
  const thief = enemy[0], carrier = squad[0];
  Object.assign(thief.state.pos, { x: 0, z: -150 }); thief.state.speed = 9;
  own.status = 'carried'; own.carrierId = thief.id; own.x = 0; own.z = -150;
  theirs.status = 'carried'; theirs.carrierId = carrier.id; Object.assign(carrier.state.pos, { x: 0, z: 150 }); theirs.x = 0; theirs.z = 150;
  const all = jobs();
  assert.equal(all[0].mission, 'carrier', 'our carrier heads home');
  const recover = all.filter((j) => j.mission === 'recover'), escort = all.filter((j) => j.mission === 'escort');
  assert.equal(recover.length, Math.max(rules.recoverMin, Math.ceil(6 * rules.recoverShare)), 'recoverShare of the six recover');
  assert.equal(escort.length, 6 - recover.length, 'the rest escort our carrier');
  // the intercept: the thief's point interceptLeadS ahead on its line to its own home (+z)
  const lead = Math.min(own.z + 9 * rules.interceptLeadS, 300);
  for (const j of recover) assert.ok(Math.abs(j.z - lead) < 1 && Math.abs(j.x) < 1, `recoverers cut the carrier off at z ${lead} (got ${j.z.toFixed(1)})`);
  // the first three escorts lead the carrier: ahead of it on its route home (toward -z), one each side, one straight
  const leading = escort.filter((j) => j.z < carrier.state.pos.z - rules.escortAheadM + 1);
  assert.equal(leading.length, Math.min(3, escort.length), 'three escorts lead it');
  assert.deepEqual(leading.map((j) => Math.sign(Math.round(j.x))).sort(), [-1, 0, 1].slice(0, leading.length).sort(), 'one each side and one straight ahead');
}
// our carrier running, our flag home: one guard on it (carrierGuards), every other bot escorts — none parked at home
{
  own.status = 'home'; own.carrierId = null; own.x = own.baseX; own.z = own.baseZ;
  const all = jobs();
  assert.equal(all.filter((j) => j.mission === 'defend').length, rules.carrierGuards, 'one guard stays on our flag');
  assert.equal(all.filter((j) => j.mission === 'escort').length, 6 - rules.carrierGuards, 'everyone else escorts the carrier home');
  const rear = all.filter((j) => j.mission === 'escort' && j.z > squad[0].state.pos.z + rules.escortAheadM - 1);
  assert.ok(rear.length >= 1, 'a rearguard sits between the carrier and the pursuit');
}
// only our flag away: recoverShare recovers (the nearest first), the rest raid back — the robbed side still threatens
{
  theirs.status = 'home'; theirs.carrierId = null; theirs.x = theirs.baseX; theirs.z = theirs.baseZ;
  own.status = 'dropped'; own.carrierId = null; own.x = 40; own.z = -100;
  const all = jobs();
  const recovering = all.filter((j) => j.mission === 'recover');
  assert.equal(recovering.length, Math.max(rules.recoverMin, Math.ceil(7 * rules.recoverShare)), 'recoverShare of the seven recover');
  assert.ok(recovering.every((j) => Math.hypot(j.x - 40, j.z + 100) < 1), 'at the dropped flag');
  assert.equal(all.filter((j) => j.mission === 'raid').length, 7 - recovering.length, 'the rest raid their flag');
  const byDistance = squad.slice().sort((a, b) => Math.hypot(a.state.pos.x - 40, a.state.pos.z + 100) - Math.hypot(b.state.pos.x - 40, b.state.pos.z + 100));
  assert.ok(byDistance.slice(0, recovering.length).every((b) => mode.botObjective(b).mission === 'recover'), 'the nearest recover');
}
// the roles are dealt once a second and at once on a change of hands, from a state compared in place (no key string)
{
  own.status = 'home'; own.x = own.baseX; own.z = own.baseZ;
  const before = jobs().map((j) => j.mission).join();
  theirs.status = 'carried'; theirs.carrierId = squad[1].id;
  assert.notEqual(jobs().map((j) => j.mission).join(), before, 'a flag taken re-deals the roles at once');
}
console.log('flagBots.selftest: the recovery share and the raid back, the intercept ahead of the carrier, three escorts leading it home and the rest behind, one guard, the raid');
