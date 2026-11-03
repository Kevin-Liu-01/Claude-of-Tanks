// 2026-11-02 audit M6, the module law and the lethal ram: a module's stage (ok / yellow / red) and its repair count-up are
// damage.ts's law (refreshModuleState, written from outside through setModuleHp) — sim/impact.ts re-implemented it inline;
// and a lethal ram reddens the struck track and the drivetrain on BOTH drivers through one rule (sim/impact.ts
// resolveRamPairDamage) — the solo step did it alone, so an online wreck kept healthy running gear. The same rule keeps
// the authority's teammate gate: a ram between teammates separates them and prices nothing on either driver (the solo
// step priced it and credited the kill).
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
}
{
  const { b, events } = authorityRam('alpha');
  assert.ok(!events.some((event) => event.type === 'tank_ram'), 'the authority: teammates separate without a priced ram');
  assert.equal(b.combat.hp, 1);
}

// ---- the solo step: the same contact, the same rule -------------------------------------------------------------
function soloRam(teamB) {
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
  b.combat.hp = 1;
  game.tanks = [a, b]; game.allTanks = [a, b]; game.tankById.set(a.id, a); game.tankById.set(b.id, b);
  const events = [];
  const bus = createBus((name, payload) => events.push([name, payload]));
  // the rammer meets the hull ahead: the push on a is from b to a (−z), a brings the closing speed
  const contact = { a, b, closing: 10, nx: 0, nz: -1, vAn: -10, vBn: 0, vertical: false };
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [contact], ramBestByPair: new Map(), queueRam() {} };
  simStep(game, bus, world, null, collider);
  return { b, events };
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
  const { b, events } = soloRam('player');
  assert.ok(!events.some(([name]) => name === 'tank:ram' || name === 'tank:destroyed'),
    'the solo step: a ram between teammates prices nothing and credits no kill, as the authority\'s');
  assert.equal(b.combat.hp, 1);
  assert.equal(b.combat.destroyed, false);
}

console.log('ramModuleLaw.selftest: one module law (damage.ts setModuleHp; impact.ts keeps no copy); a lethal ram reddens the struck '
  + 'track and the drivetrain on the authority as on the solo step, through sim/impact.ts resolveRamPairDamage; teammates separate '
  + 'without a priced ram on both');
