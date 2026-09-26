// Impact physics (owner 2026-09-25): the energy-based crash / fall / ram laws in sim/impact.ts and the ruleset
// physics blocks they read (sim/matchRuleset.ts). Pins the damage table, the thresholds, the zone factors, the
// module and crew effects, the fall curve, the ram split and the momentum exchange. Pure — no world, no DOM.
// Run: node src/sim/impact.selftest.mjs
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from './matchModes.ts';
import { matchRulesetFor, rulesetLines, STANDARD_PHYSICS } from './matchRuleset.ts';
import { ramDamage } from './damage.ts';
import {
  impactEnergyKj, excessEnergyKj, impactZoneFactor, hardImpactDamage, fallDamage, fallAttitudeFactor,
  resolveHullImpact, ramShares, ramAggression, exchangeRamMomentum, hullVelocityAlong, shiftHullVelocityAlong,
  CREW_SHOCK_IMPACT_MPS, CREW_SHOCK_FALL_MPS,
} from './impact.ts';

const near = (actual, expected, tol, message) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${message} — expected ${expected} ±${tol}, got ${actual}`);

// ---- ruleset blocks --------------------------------------------------------------------------------------
for (const mode of GAME_MODE_IDS) {
  const physics = matchRulesetFor(mode).physics;
  assert.ok(physics && Object.isFrozen(physics), `${mode}: the physics block is frozen`);
  for (const key of ['restitution', 'bounceMinMps', 'fallMinMps', 'fallHpPerKj', 'impactMinMps', 'impactHpPerKj', 'ramScale', 'ramRestitution']) {
    assert.ok(Number.isFinite(physics[key]) && physics[key] >= 0, `${mode}: ${key} is a finite non-negative number`);
  }
  assert.ok(physics.restitution < 1 && physics.ramRestitution <= 1, `${mode}: rebounds never gain energy`);
}
const standard = matchRulesetFor('standard').physics;
const turbo = matchRulesetFor('turbo_ball').physics;
const mars = matchRulesetFor('mars').physics;
assert.equal(standard, STANDARD_PHYSICS, 'Standard plays the whole-game block');
assert.deepEqual(standard, { restitution: 0.15, bounceMinMps: 1.2, fallMinMps: 6, fallHpPerKj: 0.25, impactMinMps: 4, impactHpPerKj: 0.16, ramScale: 1, ramRestitution: 0.2 });
for (const mode of ['capture_the_flag', 'zone_control', 'endless_horde', 'frontline_assault']) {
  assert.equal(matchRulesetFor(mode).physics, STANDARD_PHYSICS, `${mode} inherits the whole-game physics`);
}
assert.ok(mars.restitution > turbo.restitution && turbo.restitution > standard.restitution, 'the low-gravity modes rebound harder than the whole game');
assert.equal(matchRulesetFor('mars', null, { marsGravity: 'moon' }).physics, mars, 'a Mars gravity world keeps the Mars physics block');
// a plain jump lands at its launch speed: it is free in the modes that have a jump
assert.equal(fallDamage(turbo, 60, matchRulesetFor('turbo_ball').jumpMps), 0, 'a single Turbo Ball jump lands free');
assert.equal(fallDamage(mars, 60, matchRulesetFor('mars').jumpMps), 0, 'a single Mars rocket jump lands free');
assert.ok(fallDamage(mars, 60, matchRulesetFor('mars').jumpMps * 1.8) > 0, 'a double boost lands hard on Mars');
const turboKeys = rulesetLines(matchRulesetFor('turbo_ball')).map((line) => line.key);
assert.ok(turboKeys.includes('bounce') && turboKeys.includes('fallDamage'), 'the Turbo Ball card names its rebound and its fall threshold');
assert.equal(rulesetLines(matchRulesetFor('turbo_ball')).find((line) => line.key === 'bounce').values.value, '45 %');
assert.ok(!rulesetLines(matchRulesetFor('standard')).some((line) => line.key === 'bounce' || line.key === 'fallDamage'), 'Standard is the baseline');

// ---- energy and the damage table -------------------------------------------------------------------------
assert.equal(impactEnergyKj(60, 10), 3000, '½ · 60 t · (10 m/s)² = 3000 kJ');
assert.equal(excessEnergyKj(60, 10, 4), 0.5 * 60 * 36, 'the excess energy is the square of the speed above the threshold');
assert.equal(excessEnergyKj(60, 4, 4), 0, 'nothing at the threshold');
assert.equal(excessEnergyKj(60, 2, 4), 0, 'nothing below it');
assert.equal(excessEnergyKj(0, 10, 4), 0.5 * 40 * 36, 'a missing mass falls back to 40 t');
assert.equal(impactZoneFactor(1), 0.7, 'square on the glacis: 70 %');
assert.equal(impactZoneFactor(-1), 0.85, 'square on the stern: 85 %');
assert.equal(impactZoneFactor(0), 1, 'broadside: full');
assert.equal(impactZoneFactor(4), 0.7, 'clamped');
near(impactZoneFactor(0.5), 0.85, 1e-12, 'linear between broadside and glacis');

// the table (a 60 t hull, Standard, broadside): 4 m/s free, 6 → 19 hp, 10 → 173 hp, 60 km/h → 774 hp
const table = [[4, 0], [6, 19.2], [10, 172.8], [16.7, 0.5 * 60 * 12.7 * 12.7 * 0.16], [20, 0.5 * 60 * 256 * 0.16]];
for (const [speed, hp] of table) near(hardImpactDamage(standard, 60, speed, 0), hp, 1e-9, `impact table at ${speed} m/s`);
assert.ok(hardImpactDamage(standard, 60, 12, 0) === 4 * hardImpactDamage(standard, 60, 8, 0), 'quadratic in the excess: twice the excess, four times the damage');
assert.ok(hardImpactDamage(standard, 90, 10, 0) === 1.5 * hardImpactDamage(standard, 60, 10, 0), 'proportional to mass');
near(hardImpactDamage(standard, 60, 10, 1), 172.8 * 0.7, 1e-9, 'a frontal crash costs 70 % of a broadside');
near(hardImpactDamage(standard, 60, 10, -1), 172.8 * 0.85, 1e-9, 'a stern crash 85 %');
assert.ok(hardImpactDamage(turbo, 60, 12, 0) < hardImpactDamage(standard, 60, 12, 0), 'Turbo Ball forgives the same speed');
assert.equal(hardImpactDamage(turbo, 60, 9, 0), 0, 'Turbo Ball walls start hurting at 9 m/s');
for (let speed = 0; speed <= 40; speed += 0.5) {
  assert.ok(hardImpactDamage(standard, 60, speed + 0.5, 0) >= hardImpactDamage(standard, 60, speed, 0), 'monotone in speed');
}

// ---- the fall curve --------------------------------------------------------------------------------------
assert.equal(fallDamage(standard, 60, 6), 0, 'a 1.8 m drop (6 m/s at 1 g) is free');
near(fallDamage(standard, 60, 10), 120, 1e-9, 'a 5 m drop (10 m/s) costs a 60 t hull 120 hp');
near(fallDamage(standard, 60, 15), 607.5, 1e-9, 'an 11.5 m drop 607 hp');
near(fallDamage(standard, 60, 20), 1470, 1e-9, 'a 20 m drop 1470 hp');
assert.equal(fallDamage(standard, 60, 8) * 4, fallDamage(standard, 60, 10), 'the fall curve rises with the square of the excess');
assert.equal(fallAttitudeFactor(0, 0, 1), 1, 'a flat landing on the tracks');
near(fallAttitudeFactor(0.35, 0, 1), 1.6, 1e-12, 'a nose-first landing (20° off the ground plane) costs +60 %');
near(fallAttitudeFactor(-0.7, 0, 1), 1.6, 1e-12, 'saturates past 20°, either way');
near(fallAttitudeFactor(0, 0.35, 1), 1.3, 1e-12, 'a tilted landing +30 %');
near(fallAttitudeFactor(0, 0, 0.3), 1.5, 1e-12, 'a landing on the side or roof +50 %');
near(fallDamage(standard, 60, 10, 1.6), 192, 1e-9, 'the attitude factor scales the fall damage');
assert.equal(fallDamage(standard, 60, 10, 0), 120, 'a non-positive factor reads 1');

// ---- resolveHullImpact: hull, modules, crew, rulesets --------------------------------------------------------
function combatFixture(over = {}) {
  const module = () => ({ hp: 250, maxHp: 250, state: 'ok', repairT: 0 });
  return {
    hp: 2000, maxHp: 2000, destroyed: false,
    modules: { trackL: module(), trackR: module(), engine: module(), transmission: module(), gun: module() },
    crew: { commander: true, gunner: true, driver: true, loader: true },
    modeCriticalDamage: true,
    ...over,
  };
}
const noShock = () => 0.99;
const shock = () => 0.1;
const impactAt = (combat, closing, over = {}) => resolveHullImpact({
  combat, massTons: 60, physics: standard, kind: 'impact', closingMps: closing, faceForward: 0, sideSign: 1,
  attitudeFactor: 1, rng: noShock, ...over,
});

{
  const combat = combatFixture();
  assert.equal(impactAt(combat, 3), null, 'a blow under the threshold is not an event');
  assert.equal(combat.hp, 2000);
}
{
  // a broadside crash on the right: the right track carries it, the left a little, the engine nothing
  const combat = combatFixture();
  const result = impactAt(combat, 10);
  near(result.damage, 172.8, 1e-9, 'the hull loses the table value');
  assert.equal(combat.hp, 2000 - result.damage);
  assert.equal(result.kind, 'impact');
  assert.equal(result.destroyed, false);
  const byModule = Object.fromEntries(result.modulesHit.map((hit) => [hit.module, hit]));
  assert.deepEqual(Object.keys(byModule).sort(), ['trackL', 'trackR'], 'a broadside crash loads the tracks, not the engine');
  near(byModule.trackR.dmg, Math.round(172.8 * 0.8), 0.5, 'the near track takes 80 % of the hull damage');
  near(byModule.trackL.dmg, Math.round(172.8 * 0.3), 0.5, 'the far track 30 %');
  assert.equal(byModule.trackR.newState, 'yellow', 'a 36 km/h broadside crash yellows the near track');
  assert.equal(combat.modules.trackR.state, 'yellow');
  assert.equal(combat.modules.trackL.state, 'ok');
  assert.equal(combat.modules.engine.hp, 250);
  assert.deepEqual(result.crewHit, [], 'no crew shock under the threshold');
}
{
  // a head-on crash: both tracks and the engine
  const combat = combatFixture();
  const result = impactAt(combat, 10, { faceForward: 1, sideSign: 0 });
  near(result.damage, 172.8 * 0.7, 1e-9, 'the glacis takes 70 %');
  const modules = result.modulesHit.map((hit) => hit.module).sort();
  assert.deepEqual(modules, ['engine', 'trackL', 'trackR'], 'a frontal crash loads both tracks and the engine');
  near(combat.modules.engine.hp, 250 - 172.8 * 0.7 * 0.35, 1, 'the engine takes 35 % of the hull damage');
}
{
  // a left-side crash names the left track
  const combat = combatFixture();
  const result = impactAt(combat, 10, { sideSign: -1 });
  const near_ = result.modulesHit.find((hit) => hit.module === 'trackL');
  assert.ok(near_ && near_.dmg > result.modulesHit.find((hit) => hit.module === 'trackR').dmg, 'the struck side carries the blow');
}
{
  // a crash priced across two ticks costs what one blow would
  const one = combatFixture();
  impactAt(one, 12);
  const two = combatFixture();
  impactAt(two, 5);
  impactAt(two, 12, { priorClosingMps: 5 });
  near(two.hp, one.hp, 1e-9, 'a crash spread over two ticks is priced once, on its accumulated closing speed');
}
{
  // the ruleset damage-taken scale and the critical-damage switch
  const half = combatFixture({ modeDamageTakenScale: 0.5 });
  near(impactAt(half, 10).damage, 86.4, 1e-9, 'Turbo Ball halves every hit point lost');
  const intact = combatFixture({ modeCriticalDamage: false });
  const result = impactAt(intact, 20, { rng: shock });
  assert.ok(result.damage > 0 && result.modulesHit.length === 0 && result.crewHit.length === 0,
    'a mode without critical damage keeps modules and crew intact');
  assert.equal(intact.crew.driver, true);
}
{
  // crew shock: one draw above the threshold, the driver first
  const combat = combatFixture();
  const result = impactAt(combat, CREW_SHOCK_IMPACT_MPS, { rng: shock });
  assert.deepEqual(result.crewHit, ['driver'], 'a 16 m/s crash can knock the driver out');
  assert.equal(combat.crew.driver, false);
  const again = impactAt(combat, CREW_SHOCK_IMPACT_MPS, { rng: shock });
  assert.deepEqual(again.crewHit, ['commander'], 'with the driver down the roster follows in order');
  const calm = combatFixture();
  assert.deepEqual(impactAt(calm, CREW_SHOCK_IMPACT_MPS, { rng: noShock }).crewHit, [], 'the draw can miss');
  let draws = 0;
  impactAt(combatFixture(), CREW_SHOCK_IMPACT_MPS - 1, { rng: () => { draws++; return 0; } });
  assert.equal(draws, 0, 'no draw under the threshold: replay RNG order is stable');
}
{
  // destruction and wrecks
  const weak = combatFixture({ hp: 50 });
  const result = impactAt(weak, 12);
  assert.ok(result.destroyed && weak.destroyed && weak.hp === 0, 'a crash can destroy a weak hull');
  assert.equal(impactAt(weak, 30), null, 'a wreck takes nothing more');
}
{
  // a fall: both tracks and the engine, the attitude factor, the crew threshold
  const combat = combatFixture();
  const result = resolveHullImpact({
    combat, massTons: 60, physics: standard, kind: 'fall', closingMps: 12, faceForward: 0, sideSign: 0, attitudeFactor: 1, rng: noShock,
  });
  near(result.damage, 270, 1e-9, 'a 12 m/s landing costs a 60 t hull 270 hp');
  assert.deepEqual(result.modulesHit.map((hit) => hit.module).sort(), ['engine', 'trackL', 'trackR'], 'suspension first, then the engine');
  assert.equal(combat.modules.trackL.state, 'yellow');
  assert.equal(combat.modules.trackR.state, 'yellow');
  assert.equal(combat.modules.engine.state, 'ok');
  const nose = combatFixture();
  const noseResult = resolveHullImpact({
    combat: nose, massTons: 60, physics: standard, kind: 'fall', closingMps: 12, faceForward: 0, sideSign: 0, attitudeFactor: 1.6, rng: noShock,
  });
  near(noseResult.damage, 432, 1e-9, 'a nose-first landing costs 60 % more');
  const shocked = combatFixture();
  assert.deepEqual(resolveHullImpact({
    combat: shocked, massTons: 60, physics: standard, kind: 'fall', closingMps: CREW_SHOCK_FALL_MPS, faceForward: 0, sideSign: 0, attitudeFactor: 1, rng: shock,
  }).crewHit, ['driver'], 'a 14 m/s landing can shock the crew');
  assert.equal(resolveHullImpact({
    combat: combatFixture(), massTons: 60, physics: mars, kind: 'fall', closingMps: 9.5, faceForward: 0, sideSign: 0, attitudeFactor: 1, rng: noShock,
  }), null, 'a Mars rocket jump lands free');
}

// ---- the ram split ----------------------------------------------------------------------------------------
assert.equal(ramAggression(10, 10), 1, 'the hull that brought all the closing speed');
assert.equal(ramAggression(10, 0), 0, 'a hull hit standing');
assert.equal(ramAggression(10, -4), 0, 'a hull backing away brought none');
assert.equal(ramAggression(0, 5), 0, 'no closing, no aggression');
near(ramAggression(10, 4), 0.4, 1e-12);
{
  const pool = ramDamage(45, 45, 8);
  const classic = ramShares(standard, 45, 45, 8, 1, 0, 0, 0);
  near(classic.total, pool.total, 1e-9, 'the pool is damage.ts ramDamage');
  near(classic.toA, pool.toA, 1e-9, 'a deliberate broadside ram on a parked hull keeps the classic rammer discount');
  near(classic.toB, pool.toB, 1e-9, 'and the classic victim share');
  const headOn = ramShares(standard, 45, 45, 8, 0.5, 0.5, 1, 1);
  near(headOn.toA, pool.total * 0.5 * 0.825 * 0.7, 1e-9, 'a head-on meeting discounts both a little and both glacis take 70 %');
  near(headOn.toB, headOn.toA, 1e-9, 'symmetric');
  const tBone = ramShares(standard, 65, 20, 12, 1, 0, 1, 0);
  const heavyPool = ramDamage(65, 20, 12);
  near(tBone.toA, heavyPool.total * (20 / 85) * 0.65 * 0.7, 1e-9, 'the heavy rammer takes the light hull\'s mass share, discounted, on its glacis');
  near(tBone.toB, heavyPool.total * (65 / 85), 1e-9, 'the light hull broadside takes the heavy mass share in full');
  assert.ok(tBone.toB > 4 * tBone.toA, 'the heavier, faster hull takes proportionally less');
  assert.deepEqual(ramShares(standard, 45, 45, 2, 1, 0, 0, 0), { total: 0, toA: 0, toB: 0 }, 'parking bumps stay free');
  near(ramShares({ ...standard, ramScale: 2 }, 45, 45, 8, 1, 0, 0, 0).total, 2 * pool.total, 1e-9, 'the ruleset scales the pool');
}

// ---- the momentum exchange --------------------------------------------------------------------------------
const body = (yaw, speed) => ({ yaw, speed, _spring: { recoilVX: 0, recoilVZ: 0 } });
near(hullVelocityAlong(body(0, 10), 0, 1), 10, 1e-12, 'the drive along the heading');
near(hullVelocityAlong(body(Math.PI / 2, 10), 1, 0), 10, 1e-12);
{
  const b = body(0, 0);
  shiftHullVelocityAlong(b, 0, 1, 3);
  near(b.speed, 3, 1e-12, 'a shove along the heading joins the drive');
  shiftHullVelocityAlong(b, 1, 0, 2);
  near(b.speed, 3, 1e-12, 'a lateral shove leaves the drive alone');
  near(b._spring.recoilVX, 2, 1e-12, 'and rides the translation');
}
{
  // A drives +z into a parked B that faces it; n points from B to A (−z)
  const a = body(0, 10), b = body(Math.PI, 0);
  const vAn = hullVelocityAlong(a, 0, -1), vBn = hullVelocityAlong(b, 0, -1);
  near(vAn, -10, 1e-12); near(vBn, 0, 1e-12);
  assert.ok(exchangeRamMomentum(a, b, 0, -1, 45, 45, vAn, vBn, 0.2), 'the contact exchanges');
  near(a.speed, 4, 1e-9, 'the rammer keeps 4 m/s (centre 5 + 20 % rebound share)');
  near(b.speed, -6, 1e-9, 'the parked hull is knocked back at 6 m/s along its own heading');
  const momentumBefore = 45 * -10;
  const momentumAfter = 45 * hullVelocityAlong(a, 0, -1) + 45 * hullVelocityAlong(b, 0, -1);
  near(momentumAfter, momentumBefore, 1e-9, 'momentum along the normal is conserved');
  near(hullVelocityAlong(a, 0, -1) - hullVelocityAlong(b, 0, -1), 2, 1e-9, 'they separate at restitution × closing');
  const energyBefore = 0.5 * 45 * 100, energyAfter = 0.5 * 45 * 16 + 0.5 * 45 * 36;
  assert.ok(energyAfter < energyBefore, 'kinetic energy never grows');
}
{
  // the bleed the movement already applied is folded in, not doubled: A arrives already stopped
  const a = body(0, 0), b = body(Math.PI, 0);
  exchangeRamMomentum(a, b, 0, -1, 45, 45, -10, 0, 0.2);
  near(a.speed, 4, 1e-9, 'the targets are written against the current velocity');
  near(b.speed, -6, 1e-9);
}
{
  // a heavy hull shoves a light one and barely slows
  const a = body(0, 10), b = body(Math.PI, 0);
  exchangeRamMomentum(a, b, 0, -1, 65, 20, -10, 0, 0.2);
  assert.ok(a.speed > 7 && b.speed < -9, `the 65 t keeps ${a.speed.toFixed(2)} m/s, the 20 t flies at ${(-b.speed).toFixed(2)}`);
}
{
  // a broadside victim slides on the translation, its drive untouched
  const a = body(0, 10), b = body(Math.PI / 2, 0);
  exchangeRamMomentum(a, b, 0, -1, 45, 45, -10, 0, 0.2);
  near(b.speed, 0, 1e-12, 'a T-boned hull keeps its drive');
  near(b._spring.recoilVZ, 6, 1e-9, 'and slides sideways at the knocked speed');
}
{
  const a = body(0, 10), b = body(Math.PI, 0);
  exchangeRamMomentum(a, b, 0, -1, 45, 45, -10, 0, 0);
  near(a.speed, 5, 1e-9, 'no restitution: both leave at the centre-of-mass velocity');
  near(b.speed, -5, 1e-9);
  const c = body(0, 3), d = body(Math.PI, 0);
  assert.equal(exchangeRamMomentum(c, d, 0, -1, 45, 45, 0, 3, 0.2), false, 'a separating pair exchanges nothing');
  assert.equal(c.speed, 3);
}

console.log('impact.selftest: ruleset blocks, energy table, zones, modules, crew shock, fall curve, ram split and momentum exchange pass');
