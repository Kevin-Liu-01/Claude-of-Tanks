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
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';

// §8's head-on rule (Main's 262 ruling): the armour a station 100 m ahead of a target at `yaw` (turret dead ahead) can
// strike, without the roof structures' box faces (combatAnatomy appendStructurePlates) whose line to the station meets
// main armour first.
const STRUCTURE_FACE = /_(?:hatch|cupola|roof_structure)_\d\d_(?:front|rear|right|left|top)$/;
function exposedArmour(armour, yaw) {
  const dir = [Math.sin(yaw), 0, -Math.cos(yaw)], pivot = armour.turretPivot || [0, 0, 0];
  const hullFrame = (plate, turret) => plate.verts.map((v) => (turret ? [v[0] + pivot[0], v[1] + pivot[1], v[2] + pivot[2]] : v));
  const main = (plate) => (plate.kind || 'main') === 'main' && plate.verts?.length >= 3 && !STRUCTURE_FACE.test(plate.name || '');
  const occluders = [...armour.hullPlates.filter(main).map((p) => hullFrame(p, false)),
    ...armour.turretPlates.filter(main).map((p) => hullFrame(p, true))];
  const hidden = (plate, turret) => {
    const v = hullFrame(plate, turret), from = [0, 1, 2].map((k) => v.reduce((s, p) => s + p[k], 0) / v.length + dir[k] * .01);
    return occluders.some((polygon) => rayMeetsPolygon(from, dir, polygon));
  };
  const keep = (turret) => (plate) => !STRUCTURE_FACE.test(plate.name || '') || !hidden(plate, turret);
  return { ...armour, hullPlates: armour.hullPlates.filter(keep(false)), turretPlates: armour.turretPlates.filter(keep(true)) };
}
/** Whether the ray from `o` along `d` meets the planar polygon (Newell normal, crossing number in its dominant plane). */
function rayMeetsPolygon(o, d, polygon) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const along = nx * d[0] + ny * d[1] + nz * d[2];
  if (Math.abs(along) < 1e-12) return false;
  const t = (nx * (polygon[0][0] - o[0]) + ny * (polygon[0][1] - o[1]) + nz * (polygon[0][2] - o[2])) / along;
  if (t <= 0) return false;
  const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  const drop = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
  const [u, w] = [[1, 2], [0, 2], [0, 1]][drop];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[w] > p[w]) !== (b[w] > p[w]) && p[u] < ((b[u] - a[u]) * (p[w] - a[w])) / (b[w] - a[w]) + a[u]) inside = !inside;
  }
  return inside;
}

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
// 2026-10-31 (lane t90-family-266; the owner: "make some of our reworked t90s have new or unique machine gun
// arrangmenet,s like 2 machine guns"): the T-90AM now carries two stations (its RWS and the twin 7.62 mm anti-drone mount),
// so the plain T-90SM it is built on stands in as the one-station control.
for (const id of ['abramsx', 'k2_black_panther', 't90sm']) {
  assert.equal(AUXILIARY_INVENTORY[id].guns.length, 1, `${id}: one station`);
  assert.equal(createAuxiliaryState(TANK_SPECS[id]).stations, undefined, `${id}: no extra station state`);
  assert.equal(AUXILIARY_INVENTORY[id].guns[0].yawArc, undefined, `${id}: full traverse`);
}
assert.equal(createAuxiliaryState(TANK_SPECS[ID]).stations?.length, 1, 'the TTS state carries its second station');
for (const [id, second, caliber] of [['t90am', 't90amTwinPkt', 7.62], ['t90m_proryv', 't90mProryvGunnerPkt', 7.62]]) {
  const guns = AUXILIARY_INVENTORY[id].guns;
  assert.equal(guns.length, 2, `${id}: two roof stations`);
  assert.equal(guns[0].caliberMm, 12.7, `${id}: guns[0] is the 12.7 mm station`);
  assert.equal(guns[1].name, second, `${id}: guns[1] is the second gun the owner asked for`);
  assert.equal(guns[1].caliberMm, caliber, `${id}: ${second} is a 7.62 mm gun`);
  assert.equal(roofStationCount(TANK_SPECS[id]), 2);
  assert.equal(createAuxiliaryState(TANK_SPECS[id]).stations?.length, 1, `${id}: its state carries the second station`);
}

const DEG = Math.PI / 180;
function battle(bearingDeg, distanceM = 150, yM = 0) {
  const shooter = { id: 'tts', team: 'blue', spec: TANK_SPECS[ID], state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: { modules: {} } };
  const target = { id: 'enemy', team: 'red', spec: { id: 'target', dims: { heightM: 2.5 } },
    state: { pos: { x: Math.sin(bearingDeg * DEG) * distanceM, y: yM, z: Math.cos(bearingDeg * DEG) * distanceM }, yaw: 0, turretYaw: 0 }, combat: {} };
  return { shooter, target, context: { entities: [shooter, target], visible: () => true, clear: () => true } };
}
/** Steps both stations for `seconds` (`each` after every tick); returns each station's shots and the shells' calibres
 * and muzzles. */
function run({ shooter, context }, seconds = 12, each = () => {}) {
  const shots = [[], []];
  for (let i = 0; i < seconds * 60; i++) {
    if (stepRoofGun(shooter, i / 60, 1 / 60, context)) shots[0].push({ caliber: auxiliaryShot.shell.caliberMm, origin: auxiliaryShot.origin.clone() });
    if (stepRoofStation(shooter, 1, i / 60, 1 / 60, context)) shots[1].push({ caliber: auxiliaryShot.shell.caliberMm, origin: auxiliaryShot.origin.clone() });
    const s = shooter.combat.auxiliary;
    assert.ok(s.gunYaw >= cannon.yawArc[0] - 1e-9 && s.gunYaw <= cannon.yawArc[1] + 1e-9, 'the 30 mm stays inside its arc');
    const m = s.stations[0];
    assert.ok(m.gunYaw >= mg.yawArc[0] - 1e-9 && m.gunYaw <= mg.yawArc[1] + 1e-9, 'the M2 stays inside its arc');
    each();
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
// 5. Close and low dead ahead: the 30 mm may not depress into the turret front — it never pitches below the table at
//    any tick (since 2026-10-19 it lays on the upper hull it can reach rather than idle on a centre below the table);
//    the M2 (clear to 0.18 rad) fires.
{
  const b = battle(-2, 9, 0);
  let lowest = Infinity;
  const shots = run(b, 6, () => { lowest = Math.min(lowest, b.shooter.combat.auxiliary.gunPitch); });
  assert.ok(shots[1].length > 0, `the M2 fires (${shots[1].length})`);
  assert.ok(lowest >= -0.106, `the 30 mm never pitches below the table (lowest ${lowest.toFixed(3)} rad; ${shots[0].length} rounds on the upper hull)`);
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
  // Main's 262 ruling (2026-10-30, the rebuilt Merkava Mk 1B): the share counts every plate turned towards the station,
  // and a roof structure's box (combatAnatomy appendStructurePlates: <frame>_<kind>_NN_<side>) behind the hull's main
  // armour turns faces to it that no round reaches (the rear doors' fronts inside the hull); the sim's ray walk occludes
  // them. The head-on rule reads the share over the exposed faces: a structure face is dropped when the line from its
  // centre to the station meets main armour, never when it stands proud (the negative control).
  const exposedAt = (spec, yaw) => at({ ...spec, armor: exposedArmour(spec.armor, yaw) }, yaw);
  const headOn = Object.values(TANK_SPECS).filter((spec) => spec.role === 'mbt' && exposedAt(spec, Math.PI) >= heavy.engageShare).map((spec) => spec.id);
  assert.deepEqual(headOn, [], 'no MBT is engaged head-on by a 12.7 mm station at 100 m');
  const proud = structuredClone(TANK_SPECS.merkava1b.armor), front = Math.max(...proud.hullPlates.flatMap((p) => (p.verts || []).map((v) => v[2]))) + .5;
  proud.hullPlates.push({ name: 'hull_hatch_99_front', verts: [[-1.5, .6, front], [1.5, .6, front], [1.5, 2.4, front], [-1.5, 2.4, front]],
    physicalMm: 16, keMm: 16, ceMm: 16, kind: 'main', era: null, moduleLink: null, gunFollow: false });
  assert.ok(exposedArmour(proud, Math.PI).hullPlates.some((p) => p.name === 'hull_hatch_99_front')
    && at({ ...TANK_SPECS.merkava1b, armor: exposedArmour(proud, Math.PI) }, Math.PI) >= heavy.engageShare,
  'a 16 mm structure face standing proud of the main armour is still counted (the filter only drops hidden faces)');
  // a turret traversed broadside shows the turret's flank: the turret plates follow the turret's yaw
  assert.ok(at(TANK_SPECS.bmp2, Math.PI, Math.PI / 2) >= at(TANK_SPECS.bmp2, Math.PI) - 1e-9, 'turret plates follow the turret');
  // 2026-10-19 (owner: "Make roof guns hold fire where their rounds cannot hurt"): the share picks the target, each
  // round is judged where it lands (src/sim/roofHoldFire.selftest.mjs and roofTargetOrder.selftest.mjs prove the law on
  // the live damage model; this receipt guards the stations' mechanics under it). A BMP-2 50 degrees off
  // its rear: the line to its centre meets its side a little thicker than the K6's nominal penetration, which its pen
  // roll still defeats nearly one round in two; the K6 fires, the M60 holds
  assert.ok(at(TANK_SPECS.bmp2, -50 * DEG) >= heavy.engageShare, 'the share rule engages the BMP-2 50 degrees off its rear');
  const [quarterK6, quarterM60] = duel('bmp2', 100, -50 * DEG);
  assert.ok(quarterK6 >= 15 && quarterM60 === 0, `the K6 fires where its round may well penetrate (${quarterK6}), the M60 holds (${quarterM60})`);
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
// 10. VH.14 hold fire, the stations' side of it (lane 235, 2026-10-22: this receipt passed in full on the module before
//     hold fire — the 229 critic's r5 and r6 runs, 13,193 assertions and none failing — so it guarded none of a
//     refusal's mechanics). The TTS on a BMP-2 head-on at 100 m and 20 degrees off it: the share rule engages it, but
//     the 30 mm's round at its centre meets a glacis it cannot defeat, so that round is never fired (no flash, the burst
//     clock untouched) and the station lays on a point of the front it hurts and fires there: no round passes within
//     0.4 m of the centre (the old station fired every round down the centre line, 0.14 m off it by the muzzle's
//     offset, from its first tick); the M2 holds (the share rule).
{
  await ensureAuthorityFleet(['bmp2']);
  for (const aspectDeg of [0, 20]) {
    const shooter = { id: 'tts', team: 'blue', spec: TANK_SPECS[ID], state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw: 0 }, combat: { modules: {} } };
    const ifv = getSpec('bmp2'), target = { id: 'bmp', team: 'red', spec: ifv, state: { pos: { x: 0, y: 0, z: 100 }, yaw: Math.PI + aspectDeg * DEG, turretYaw: 0 }, combat: {} };
    const context = { entities: [shooter, target], visible: () => true, clear: () => true };
    const centre = new THREE.Vector3(0, ifv.dims.heightM * .5, 100), misses = [], m2 = [];
    let first = -1;
    for (let i = 0; i < 6 * 60; i++) {
      if (stepRoofGun(shooter, i / 60, 1 / 60, context)) {
        const origin = auxiliaryShot.origin, direction = auxiliaryShot.direction.clone().normalize();
        misses.push(origin.clone().addScaledVector(direction, centre.clone().sub(origin).dot(direction)).distanceTo(centre));
        if (first < 0) first = i;
      }
      if (stepRoofStation(shooter, 1, i / 60, 1 / 60, context)) m2.push(i);
    }
    const label = `the TTS on a BMP-2 ${aspectDeg ? `${aspectDeg} degrees off head-on` : 'head-on'} at 100 m`;
    assert.ok(misses.length >= 6, `${label}: the 30 mm fires (${misses.length})`);
    assert.ok(Math.min(...misses) >= .4, `${label}: no 30 mm round down the centre line it cannot hurt (nearest ${Math.min(...misses).toFixed(2)} m)`);
    assert.ok(first > 0 && shooter.combat.auxiliary.shots === misses.length, `${label}: the refused round leaves the clock untouched (first round on tick ${first})`);
    assert.equal(m2.length, 0, `${label}: the M2 holds`);
  }
}
console.log('roofStations: the TTS 30 mm and roof M2 both fire, each in its arc (30 mm -148..35°, M2 -56..12°), never across each other, and the 30 mm above the roof front; one toggle and one module; arcs measured against the stock; and (VH.14) a station engages only a vehicle its round can hurt where the round lands, a round refused at the centre is never fired and the station lays where its round hurts; the launch interlock parks every station while its drone launches');
