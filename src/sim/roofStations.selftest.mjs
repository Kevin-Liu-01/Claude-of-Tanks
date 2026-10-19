// VH.02 (2026-10-14; the owner's field-equipment standard: "no duplicate or non-functional guns"): a vehicle with two
// remote roof stations fires both. On the M551A1 TTS the 30 mm (guns[0], the owner's 10-12 order) and the roof M2 the
// owner placed twice each aim at their own target, inside a traverse arc that keeps each barrel out of the other
// station, the antenna masts and the stowage, and the 30 mm never depresses into the turret front. On/off, damage and
// the roofGun module stay the one roof-gun system's. Every one-station vehicle keeps its old step exactly.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { auxiliaryShot, auxiliaryState, createAuxiliaryState, defeatableShare, requestAuxiliary, roofStationCount, stepRoofGun, stepRoofStation, thinnestVerticalArmourMm } from './auxiliarySystems.ts';
import { penAtDistanceMm } from './ballistics.ts';
import { stationDepression, stationProbe } from '../../tools/roof-station-arcs.mjs';

const ID = 'm551a1_tts', kit = AUXILIARY_INVENTORY[ID];
const [cannon, mg] = kit.guns;
assert.equal(kit.guns.length, 2, 'the TTS has two remote roof stations');
assert.equal(roofStationCount(TANK_SPECS[ID]), 2);
assert.equal(cannon.name, 'm551a1TtsRemoteAutocannon', 'guns[0] is the 30 mm (the owner, 10-12)');
assert.equal(mg.name, 'm551a1TtsRoofM2', 'guns[1] is the roof M2 the owner placed');
for (const gun of [cannon, mg]) assert.ok(gun.yawArc && gun.yawArc[0] < 0 && gun.yawArc[1] > 0, `${gun.name}: a traverse arc round its rest bearing`);
assert.ok(cannon.depressionByYaw?.length, 'the 30 mm carries the turret front depression table');
// One-station vehicles have no extra station state and no arc. (VH.14: the Abrams loaders' M240s now work, so the
// controls are vehicles with one real roof weapon.)
for (const id of ['abramsx', 'k2_black_panther', 't90am']) {
  assert.equal(AUXILIARY_INVENTORY[id].guns.length, 1, `${id}: one station`);
  assert.equal(createAuxiliaryState(TANK_SPECS[id]).stations, undefined, `${id}: no extra station state`);
  assert.equal(AUXILIARY_INVENTORY[id].guns[0].yawArc, undefined, `${id}: full traverse`);
}
assert.equal(createAuxiliaryState(TANK_SPECS[ID]).stations?.length, 1, 'the TTS state carries its second station');

const DEG = Math.PI / 180;
function battle(bearingDeg, distanceM = 150, yM = 0) {
  const shooter = { id: 'tts', team: 'blue', spec: TANK_SPECS[ID], state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: { modules: {} } };
  const target = { id: 'enemy', team: 'red', spec: { id: 'target', dims: { heightM: 2.5 } },
    state: { pos: { x: Math.sin(bearingDeg * DEG) * distanceM, y: yM, z: Math.cos(bearingDeg * DEG) * distanceM }, yaw: 0, turretYaw: 0 }, combat: {} };
  return { shooter, target, context: { entities: [shooter, target], visible: () => true, clear: () => true } };
}
/** Steps both stations for `seconds`; returns each station's shots and the shells' calibres and muzzles. */
function run({ shooter, context }, seconds = 12) {
  const shots = [[], []];
  for (let i = 0; i < seconds * 60; i++) {
    if (stepRoofGun(shooter, i / 60, 1 / 60, context)) shots[0].push({ caliber: auxiliaryShot.shell.caliberMm, origin: auxiliaryShot.origin.clone() });
    if (stepRoofStation(shooter, 1, i / 60, 1 / 60, context)) shots[1].push({ caliber: auxiliaryShot.shell.caliberMm, origin: auxiliaryShot.origin.clone() });
    const s = shooter.combat.auxiliary;
    assert.ok(s.gunYaw >= cannon.yawArc[0] - 1e-9 && s.gunYaw <= cannon.yawArc[1] + 1e-9, 'the 30 mm stays inside its arc');
    const m = s.stations[0];
    assert.ok(m.gunYaw >= mg.yawArc[0] - 1e-9 && m.gunYaw <= mg.yawArc[1] + 1e-9, 'the M2 stays inside its arc');
  }
  return shots;
}

// 1. Dead ahead: both stations fire, each its own calibre from its own muzzle, in independent bursts.
{
  const b = battle(0), shots = run(b);
  assert.ok(shots[0].length >= 3 && shots[1].length >= 3, `both stations fire (${shots[0].length} x 30 mm, ${shots[1].length} x 12.7 mm)`);
  assert.ok(shots[0].every((s) => s.caliber === 30) && shots[1].every((s) => s.caliber === 12.7), 'each station fires its own round');
  // the 30 mm muzzle is on the left of the roof, the M2's on the right
  assert.ok(shots[0][0].origin.x < -0.2 && shots[1][0].origin.x > 0.4, 'each shell leaves its own station');
  const state = b.shooter.combat.auxiliary;
  assert.equal(state.shots, shots[0].length); assert.equal(state.stations[0].shots, shots[1].length);
  assert.ok(JSON.stringify(state).length <= 512 - 120, `the auxiliary row still fits the 512-byte wire string with a smoke summary (${JSON.stringify(state).length})`);
  // determinism: the same battle twice is identical
  const again = run(battle(0));
  assert.deepEqual(again.map((s) => s.map((x) => x.origin.toArray())), shots.map((s) => s.map((x) => x.origin.toArray())), 'deterministic');
}
// 2. Forward right (inside the 30 mm's arc, past the M2's right-hand antenna stop): only the 30 mm fires.
{ const shots = run(battle(25)); assert.ok(shots[0].length > 0 && shots[1].length === 0, 'the M2 holds past its arc; the 30 mm fires'); }
// 3. Hard left (past the M2's stop at the 30 mm station): only the 30 mm, which turns the long way round, fires.
{ const shots = run(battle(-100)); assert.ok(shots[0].length > 0 && shots[1].length === 0, 'the 30 mm fires over the left; the M2 holds'); }
// 4. Right of the roof (the M2, the antennas): neither barrel sweeps through them.
{ const shots = run(battle(60)); assert.ok(shots[0].length === 0 && shots[1].length === 0, 'no station fires through the right-hand stock'); }
// 5. Close and low dead ahead: the 30 mm may not depress into the turret front; the M2 (clear to 0.18 rad) fires.
{
  const b = battle(-2, 9, 0), shots = run(b, 6);
  assert.ok(shots[0].length === 0 && shots[1].length > 0, `the 30 mm holds at the roof's depression limit; the M2 fires (${shots[1].length})`);
  assert.ok(b.shooter.combat.auxiliary.gunPitch >= -0.106, 'the 30 mm never pitches below the table');
}
// 6. One system: the toggle and a red roofGun module silence both stations.
{
  const b = battle(0); auxiliaryState(b.shooter); requestAuxiliary(b.shooter, 'roofGun', 0);
  let shots = run(b, 4); assert.ok(shots[0].length === 0 && shots[1].length === 0, 'B switches both stations off');
  requestAuxiliary(b.shooter, 'roofGun', 0); b.shooter.combat.modules.roofGun = { state: 'red' };
  shots = run(b, 4); assert.ok(shots[0].length === 0 && shots[1].length === 0, 'a red roof-gun module silences both');
}

// 7. The traverse interlock: the M2 never turns its barrel across the 30 mm's in plan. With the 30 mm held dead ahead,
//    a target at -54 degrees (inside the M2's arc) would take the M2's muzzle over the 30 mm's barrel: it stops short and
//    holds fire; with the 30 mm traversed left out of the way it reaches the target and fires.
{
  const b = battle(-54); auxiliaryState(b.shooter); const s = b.shooter.combat.auxiliary;
  let fired = 0;
  for (let i = 0; i < 360; i++) { s.gunYaw = 0; if (stepRoofStation(b.shooter, 1, i / 60, 1 / 60, b.context)) fired++; }
  assert.equal(fired, 0, 'the M2 holds rather than cross the 30 mm barrel');
  assert.ok(s.stations[0].gunYaw > -54 * DEG + .02, `the M2 stops short of the crossing (${(s.stations[0].gunYaw / DEG).toFixed(1)} deg)`);
  for (let i = 360; i < 900; i++) { s.gunYaw = -1.2; if (stepRoofStation(b.shooter, 1, i / 60, 1 / 60, b.context)) fired++; }
  assert.ok(fired > 0, 'with the 30 mm traversed away the M2 reaches the target and fires');
}

// 8. The arcs and the table hold against the built stock (tools/roof-station-arcs.mjs), and they are tight: within 4° past
//    each end the barrel touches something.
{
  const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, decor: true });
  tank.root.updateMatrixWorld(true);
  for (const gun of [cannon, mg]) {
    const station = tank.root.getObjectByName(gun.name), profile = auxiliaryWeaponProfile(gun.caliberMm, ID);
    const { probe } = stationProbe(tank.root, station), [lo, hi] = gun.yawArc;
    for (let yaw = lo; yaw <= hi + 1e-9; yaw += DEG) {
      for (let pitch = 0; pitch <= profile.elevationRad + 1e-9; pitch += .05) assert.ok(!probe(yaw, pitch), `${gun.name}: clear at ${(yaw / DEG).toFixed(0)}°, +${pitch.toFixed(2)}`);
      const table = gun.depressionByYaw, inTable = table && yaw >= table[0][0] && yaw <= table.at(-1)[0];
      if (!inTable) assert.ok(!probe(yaw, -profile.depressionRad), `${gun.name}: full depression clear at ${(yaw / DEG).toFixed(0)}°`);
    }
    for (const [yaw, depression] of gun.depressionByYaw ?? []) {
      assert.ok(!probe(yaw, -depression), `${gun.name}: the table's ${depression} rad is clear at ${(yaw / DEG).toFixed(0)}°`);
      const [deepest] = stationDepression(tank.root, station, profile, [yaw / DEG]);
      assert.ok(depression <= deepest + 1e-9 && depression >= deepest - .02, `${gun.name}: the table at ${(yaw / DEG).toFixed(0)}° is the measured limit less its margin (${depression} vs ${deepest})`);
    }
    const blockedNear = (from, sign) => { for (let k = 1; k <= 4; k++) { const yaw = from + sign * k * DEG; for (let p = 0; p <= profile.elevationRad; p += .05) if (probe(yaw, p)) return true; } return false; };
    assert.ok(blockedNear(lo, -1) && blockedNear(hi, 1), `${gun.name}: the arc ends within 4° of the stock it keeps clear of`);
  }
  tank.dispose();
}
// 8. VH.14 balance (the coordinator's check, 2026-10-15): a station engages only a vehicle its round can hurt where it
//    strikes it (at least the profile's engageShare of the main armour the target turns towards the station, by
//    presented area, defeated at the range: defeatableShare). The K1's 12.7 mm K6 engages a BMP-2 seen from behind at
//    100 m; its 7.62 mm M60 never engages a vehicle (no hull in the fleet is under 15 mm); neither engages an Abrams;
//    and no MBT is engaged head-on.
{
  const duel = (targetId, distanceM, targetYaw = 0) => {
    const shooter = { id: 'k1', team: 'blue', spec: TANK_SPECS.k1e1, state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: { modules: {} } };
    const target = { id: 'enemy', team: 'red', spec: TANK_SPECS[targetId], state: { pos: { x: 0, y: 0, z: distanceM }, yaw: targetYaw, turretYaw: 0 }, combat: {} };
    const context = { entities: [shooter, target], visible: () => true, clear: () => true }, shots = [0, 0];
    for (let i = 0; i < 8 * 60; i++) {
      if (stepRoofGun(shooter, i / 60, 1 / 60, context)) shots[0]++;
      if (stepRoofStation(shooter, 1, i / 60, 1 / 60, context)) shots[1]++;
    }
    return shots;
  };
  const k1 = AUXILIARY_INVENTORY.k1e1.guns;
  assert.deepEqual(k1.map((g) => g.caliberMm), [12.7, 7.62], 'the K1 carries its K6 and M60 stations, heaviest first');
  assert.ok(thinnestVerticalArmourMm(TANK_SPECS.bmp2) <= 16 && thinnestVerticalArmourMm(TANK_SPECS.m1a1_abrams_hc) > 26, 'armour reads');
  const [k6, m60] = duel('bmp2', 100);
  assert.ok(k6 > 0 && m60 === 0, `vs a BMP-2 at 100 m the K6 fires (${k6}), the M60 holds (${m60})`);
  assert.deepEqual(duel('m1a1_abrams_hc', 100), [0, 0], 'neither gun wastes fire (and its flash) on an Abrams');
  // aspect: the rule reads the plates turned towards the station, hull plates by the hull's yaw, turret plates by the
  // turret's too; a target that turns its front to the K6 is engaged only if that front is defeatable
  const heavy = auxiliaryWeaponProfile(12.7), pen100 = penAtDistanceMm(heavy.shell, 100), at = (spec, yaw, turretYaw = 0) =>
    defeatableShare({ spec, state: { pos: { x: 0, y: 0, z: 100 }, yaw, turretYaw } }, 0, 0, pen100);
  const bmp2Rear = at(TANK_SPECS.bmp2, 0), bmp2Front = at(TANK_SPECS.bmp2, Math.PI);
  assert.ok(bmp2Rear >= heavy.engageShare, `the BMP-2's rear (${(bmp2Rear * 100).toFixed(0)} % defeatable) is engaged at 100 m`);
  if (bmp2Front < heavy.engageShare) assert.equal(duel('bmp2', 100, Math.PI)[0], 0, 'a BMP-2 head-on is not engaged');
  const headOn = Object.values(TANK_SPECS).filter((spec) => spec.role === 'mbt' && at(spec, Math.PI) >= heavy.engageShare).map((spec) => spec.id);
  assert.deepEqual(headOn, [], 'no MBT is engaged head-on by a 12.7 mm station at 100 m');
  // a turret traversed broadside shows the turret's flank: the turret plates follow the turret's yaw
  assert.ok(at(TANK_SPECS.bmp2, Math.PI, Math.PI / 2) >= at(TANK_SPECS.bmp2, Math.PI) - 1e-9, 'turret plates follow the turret');
  // 2026-10-19 (owner: "Make roof guns hold fire where their rounds cannot hurt"): the share is the target's, the round
  // is judged where it lands. A BMP-2 50 degrees off its rear shows mostly armour the K6 defeats, but the line to its
  // centre meets armour it cannot: it took every round of the K6's bursts; now the K6 holds (src/sim/roofHoldFire.selftest
  // .mjs: every round, every station, host and solo)
  assert.ok(at(TANK_SPECS.bmp2, -50 * DEG) >= heavy.engageShare, 'the share rule would engage the BMP-2 50 degrees off its rear');
  assert.deepEqual(duel('bmp2', 100, -50 * DEG), [0, 0], 'the K6 holds where the line to its centre meets armour it cannot defeat');
}
// 9. VH.14 launch interlock (coordinator ruling 2026-10-15): while the vehicle's own drone launches, every roof station
//    turns back to its rest bearing, levels and holds fire; it takes its target again once the launch is over. The
//    T-62MV's DShK stands beside its drone stand: its stand clears the gun's whole sweep docked and the gun at rest
//    launching (missionAttachmentMotionClear).
{
  const shooter = { id: 't62', team: 'blue', spec: TANK_SPECS.t62_1975, state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: { modules: {} } };
  const target = { id: 'apc', team: 'red', spec: { id: 'target', dims: { heightM: 2.5 } },
    state: { pos: { x: 45, y: 0, z: 60 }, yaw: 0, turretYaw: 0 }, combat: {} };
  const context = { entities: [shooter, target], visible: () => true, clear: () => true };
  let fired = 0, i = 0;
  for (; i < 6 * 60; i++) if (stepRoofGun(shooter, i / 60, 1 / 60, context)) fired++;
  const aimed = shooter.combat.auxiliary.gunYaw;
  assert.ok(fired > 0 && Math.abs(aimed) > .5, `the DShK takes its target off the bow (yaw ${aimed.toFixed(2)}, ${fired} rounds)`);
  shooter.aerial = { kind: 'drone', active: true, launching: true, x: 0, y: 0, z: 0 };
  let launchShots = 0;
  for (let k = 0; k < 2.4 * 60; k++, i++) if (stepRoofGun(shooter, i / 60, 1 / 60, context)) launchShots++;
  assert.equal(launchShots, 0, 'no round while its drone launches');
  assert.ok(Math.abs(shooter.combat.auxiliary.gunYaw) < 1e-9 && Math.abs(shooter.combat.auxiliary.gunPitch) < 1e-9,
    'parked at its rest bearing, level');
  shooter.aerial.launching = false;
  let after = 0;
  for (let k = 0; k < 4 * 60; k++, i++) if (stepRoofGun(shooter, i / 60, 1 / 60, context)) after++;
  assert.ok(after > 0, 'fires again once the launch is over');
  const { missionAttachmentMotionClear } = await import('./missionAttachment.ts');
  const { MISSION_ATTACHMENT_SEATS } = await import('./missionAttachmentSeats.generated.ts');
  for (const id of ['t62_1975', 'type59']) assert.ok(missionAttachmentMotionClear(TANK_SPECS[id], MISSION_ATTACHMENT_SEATS[id]),
    `${id}: the drone stand clears its DShK (whole sweep docked, at rest launching)`);
}
console.log('roofStations: the TTS 30 mm and roof M2 both fire, each in its arc (30 mm -148..35°, M2 -56..12°), never across each other, and the 30 mm above the roof front; one toggle and one module; arcs measured against the stock; and (VH.14) a station engages only a vehicle its round can hurt where the round lands; the launch interlock parks every station while its drone launches');
