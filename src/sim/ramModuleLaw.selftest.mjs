// 2026-11-02 audit M6, the module law and the lethal ram: a module's stage (ok / yellow / red) and its repair count-up are
// damage.ts's law (refreshModuleState, written from outside through setModuleHp) — sim/impact.ts re-implemented it inline;
// and a lethal ram reddens the struck track and the drivetrain on BOTH drivers through one rule (sim/impact.ts
// resolveRamPairDamage) — the solo step did it alone, so an online wreck kept healthy running gear — and both publish
// those hits as module-state receipts (source 'ram') before the destruction: an online client sets a peer's module
// stage only from the authority's module_state events. The same rule keeps the authority's teammate gate: a ram between
// teammates deals no damage, module hit or kill on either driver (the solo step priced it and credited the kill), but
// the contact is still reported with zero damage (the crunch, the crew's friendly_ram call, the cab's jolt).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createCombatState, setModuleHp } from './damage.ts';
import { createTankState } from './movement.ts';
import { resolveHullImpact } from './impact.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';

const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
const impact = readFileSync(new URL('./impact.ts', import.meta.url), 'utf8');

// ---- the module law has one writer ------------------------------------------------------------------------------
{
  const module = { hp: 100, maxHp: 100, state: 'ok', repairT: 0 };
  assert.equal(setModuleHp(module, 60), 'ok');
  module.repairT = 2;
  assert.equal(setModuleHp(module, 40), 'yellow');
  assert.equal(module.repairT, 0, 'a new stage restarts the repair count-up');
  assert.equal(setModuleHp(module, -5), 'red');
  assert.equal(module.hp, 0, 'hit points floor at 0');
  module.repairT = 3;
  setModuleHp(module, 0);
  assert.equal(module.repairT, 3, 'a red module struck again keeps its count-up (refreshModuleState)');
  assert.doesNotMatch(impact, /module\.state\s*=(?!=)/, 'sim/impact.ts writes no module stage of its own');
  assert.match(impact, /setModuleHp\(module, module\.hp - amount\)/, 'a crash damages a module through the law');
  // a crash through the law: a frontal blow on a red track keeps its count-up, as a shell's would
  const spec = getSpec('m1a1_abrams_hc');
  const combat = createCombatState(spec);
  combat.modules.trackL.hp = 0; combat.modules.trackL.state = 'red'; combat.modules.trackL.repairT = 1.5;
  combat.modules.trackR.repairT = 0.7;
  const hit = resolveHullImpact({ combat, massTons: spec.weightTons, physics: matchRulesetFor('standard').physics, kind: 'impact',
    closingMps: 16, faceForward: 1, sideSign: 0, attitudeFactor: 1, rng: () => 0.99 });
  assert.ok(hit && hit.modulesHit.some((entry) => entry.module === 'trackR'), 'the crash loads the tracks');
  assert.equal(combat.modules.trackL.repairT, 1.5, 'the red track is untouched (no hit points to take)');
  assert.ok(combat.modules.trackR.state !== 'ok' && combat.modules.trackR.repairT === 0, 'the struck track drops a stage and restarts');
}

// ---- both drivers price a ram through one rule --------------------------------------------------------------------
for (const [name, text] of [['the solo step', solo], ['the authority', authority]]) {
  assert.match(text, /resolveRamPairDamage\((game\.)?ruleset\.physics, contact\)/, `${name} prices a ram through sim/impact.ts resolveRamPairDamage`);
  assert.doesNotMatch(text, /ramShares\(|applyLethalRamModuleDamage\(|hullDamageTaken\(a\.combat/, `${name} keeps no ram law of its own`);
}

// ---- the authority: a lethal ram reddens the struck track and the drivetrain -------------------------------------
const openWorld = { mapId: 'verdant', getObstacles: () => [], queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; return out; }, raycast: () => null };
function authorityRam(teamB) {
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 5, countdownS: 0, worldCollision: openWorld, players: [
    { id: 'ram-a', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -80, yaw: 0 } },
    { id: 'ram-b', specId: 'm1a1_abrams_hc', team: teamB, spawn: { x: 0, z: -40, yaw: 0 } },
    ...(teamB === 'alpha' ? [{ id: 'ram-c', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 300, z: 300, yaw: 0 } }] : []),
  ] });
  match.onMatchReady();
  const b = match.entityById.get('ram-b');
  b.combat.hp = 1;
  const drive = new Map([['ram-a', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
  const events = [];
  const seen = new Set();
  let tick = 0;
  for (; tick < 600 && !b.combat.destroyed; tick++) {
    match.step({ dt: 1 / 60, inputs: drive });
    for (const event of match.eventsForViewer('ram-a')) if (!seen.has(event)) { seen.add(event); events.push(event); }
    if (events.some((event) => event.type === 'tank_ram')) break;
  }
  return { b, events, tick };
}
{
  const { b, events, tick } = authorityRam('bravo');
  assert.ok(events.some((event) => event.type === 'tank_ram' && event.bId === 'ram-b'), `the hull rams the one ahead (tick ${tick})`);
  assert.equal(b.combat.destroyed, true, 'the ram kills the hull at 1 hp');
  assert.ok(events.some((event) => event.type === 'tank_destroyed' && event.id === 'ram-b' && event.cause === 'ram'));
  const drivetrain = b.combat.modules.transmission ? 'transmission' : 'engine';
  const reds = Object.entries(b.combat.modules).filter(([, module]) => module.state === 'red').map(([name]) => name).sort();
  assert.equal(b.combat.modules[drivetrain].state, 'red', `the authority: a ram-killed wreck's ${drivetrain} is red (${reds.join(', ')})`);
  assert.ok(['trackL', 'trackR'].filter((track) => b.combat.modules[track].state === 'red').length === 1,
    `and exactly the struck track (${reds.join(', ')})`);
  // the receipts a client reads: one module_state per reddened module, source 'ram', before the wreck's destruction
  const track = ['trackL', 'trackR'].find((name) => b.combat.modules[name].state === 'red');
  const destroyedAt = events.findIndex((event) => event.type === 'tank_destroyed' && event.id === 'ram-b');
  for (const module of [drivetrain, track]) {
    const at = events.findIndex((event) => event.type === 'module_state' && event.id === 'ram-b' && event.module === module);
    assert.ok(at >= 0, `the authority publishes ram-b's ${module} going red (events: ${events.map((event) => event.type).join(', ')})`);
    assert.equal(events[at].state, 'red');
    assert.equal(events[at].source, 'ram', 'the receipt names the ram, as the solo step\'s module:state does');
    assert.ok(at < destroyedAt, `and before the destruction (${module} at ${at}, tank_destroyed at ${destroyedAt})`);
  }
  assert.equal(events.filter((event) => event.type === 'module_state' && event.source === 'ram').length, 2,
    'exactly the two lethal-ram modules');
}
{
  const { b, events, tick } = authorityRam('alpha');
  const ram = events.find((event) => event.type === 'tank_ram');
  assert.ok(ram && ram.aId === 'ram-a' && ram.bId === 'ram-b', `the authority: a teammate contact is still a reported ram (tick ${tick})`);
  assert.equal(ram.damageA, 0, 'with no damage to the rammer');
  assert.equal(ram.damageB, 0, 'nor to the teammate');
  assert.equal(b.combat.hp, 1);
  assert.equal(b.combat.destroyed, false);
  assert.ok(!events.some((event) => event.type === 'tank_destroyed' || event.type === 'module_state'),
    'and no kill credit or module hit');
}

// ---- the solo step: the same contact, the same rule -------------------------------------------------------------
function soloRam(teamB, { playerA = false } = {}) {
  const up = new Vector3(0, 1, 0);
  const world = { heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => up }, raycast: () => null };
  const game = createGameState();
  const hull = (id, team, z, speed) => {
    const spec = getSpec('m1a1_abrams_hc'), combat = createCombatState(spec);
    combat.equipMults = {};
    const state = createTankState(spec, new Vector3(0, 0, z), 0);
    state.speed = speed;
    return { id, specId: spec.id, spec, isPlayer: false, team, combat, state,
      input: { throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 300, actionBits: 0 },
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(0, 5, z + 10), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {}, setDestroyed() {} } };
  };
  const a = hull('solo-a', 'player', 0, 10), b = hull('solo-b', teamB, 8, 0);
  a.isPlayer = playerA;
  b.combat.hp = 1;
  game.tanks = [a, b]; game.allTanks = [a, b]; game.tankById.set(a.id, a); game.tankById.set(b.id, b);
  const events = [];
  const bus = createBus((name, payload) => events.push([name, payload]));
  // the rammer meets the hull ahead: the push on a is from b to a (−z), a brings the closing speed
  const contact = { a, b, closing: 10, nx: 0, nz: -1, vAn: -10, vBn: 0, vertical: false };
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [contact], ramBestByPair: new Map(), queueRam() {} };
  const traumas = [];
  simStep(game, bus, world, { addTrauma: (amount) => traumas.push(amount) }, collider);
  return { a, b, events, traumas };
}
{
  const { b, events } = soloRam('enemy');
  assert.ok(events.some(([name, payload]) => name === 'tank:ram' && payload.bId === 'solo-b'), 'the solo step prices the ram');
  assert.equal(b.combat.destroyed, true);
  const drivetrain = b.combat.modules.transmission ? 'transmission' : 'engine';
  assert.equal(b.combat.modules[drivetrain].state, 'red', 'the solo step: the wreck\'s drivetrain is red');
  assert.equal(['trackL', 'trackR'].filter((track) => b.combat.modules[track].state === 'red').length, 1, 'and the struck track');
  assert.ok(events.some(([name, payload]) => name === 'module:state' && payload.id === 'solo-b' && payload.source === 'ram'));
}
{
  const { a, b, events, traumas } = soloRam('player', { playerA: true });
  const rams = events.filter(([name]) => name === 'tank:ram').map(([, payload]) => payload);
  assert.equal(rams.length, 1, 'the solo step: a teammate contact is still a reported ram (the crunch and the friendly_ram call)');
  assert.equal(rams[0].dmgA, 0, 'with no damage to the rammer');
  assert.equal(rams[0].dmgB, 0, 'nor to the teammate, as the authority\'s');
  assert.equal(rams[0].aIsPlayer, true);
  assert.ok(!events.some(([name]) => name === 'tank:destroyed' || name === 'module:state'), 'and no kill credit or module hit');
  assert.equal(b.combat.hp, 1);
  assert.equal(b.combat.destroyed, false);
  assert.equal(a.combat.hp, a.combat.maxHp);
  assert.ok(traumas.some((amount) => amount >= 0.12), `the player's cab still feels the shove (${traumas.join(', ')})`);
}

console.log('ramModuleLaw.selftest: one module law (damage.ts setModuleHp; impact.ts keeps no copy); a lethal ram reddens the struck '
  + 'track and the drivetrain on the authority as on the solo step, through sim/impact.ts resolveRamPairDamage, and both publish '
  + 'the module receipts (source ram) before the destruction; a teammate contact is reported with zero damage and no kill on both');
