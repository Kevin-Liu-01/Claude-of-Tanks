// 2026-10-20 (the fleet ZTZ-99A2 lane; the coordinator's split of buildZTZ99A2ProductionTurret gives this receipt the
// QJC-88's mount and traverse limits): the fleet ZTZ-99A2's commander's QJC-88 traversed -98..+95 degrees, the arc its
// drone stand left it (src/vehicles/roofStationArcs.ts, tools/roof-station-arcs.mjs --dock), and swung its barrel and
// receiver through the commander's stabilised sight on the right of the roof. Its arc is now the station's own,
// measured against the whole moving mass (tools/roof-station-sweep.mjs: the CN clearance receipt's two-way dense sweep,
// src/vehicles/cnClearance.selftest.mjs check 4): it stops short of the sight (-79..-58 deg); its other end is the
// drone stand's. The pintle stands on a 10 mm riser (the coordinator's approval): on the old seat the gun's rear passed
// 17 mm over the cupola periscope at full elevation from +58 deg on.
//  1. The built station publishes its own arc and depression table; the inventory and the combat anatomy carry them,
//     and the drone-stand table no longer lists the station (a station's own arc takes precedence).
//  2. The moving mass (the pitch group at rest, half and full recoil, and the yaw stage above its foot) keeps 25 mm
//     from every other turret mesh over the arc and its pitch range [-depression(yaw), elevation].
//  3. The barrel's axis lines (tools/roof-station-arcs.mjs) clear the stock over the arc from level to full elevation
//     and at the table's depression.
//  4. The arc is tight: within 4 degrees past its sight end the moving mass meets the stock.
//  5. The drone stand clears the station's sweep over the new arc; 4 degrees past its other end, or over the full
//     circle, the station would sweep the stand.
// Negative controls: the old arc's stretch over the sight meets it, and without its depression table the station
// meets the roof under its barrel.
import assert from 'node:assert/strict';
import '../../tools/tank-surface-collect.mjs'; // node canvas shim for the builders' canvas textures
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
import { AUXILIARY_ROOF_GUNS } from './auxiliaryRoofGuns.generated.ts';
import { ROOF_STATION_ARCS } from './roofStationArcs.ts';
import { MISSION_ATTACHMENT_SEATS } from '../sim/missionAttachmentSeats.generated.ts';
import { missionAttachmentMotionClear } from '../sim/missionAttachment.ts';
import { stationSweepModel, sweepArc, tableDepression, pitchSteps } from '../../tools/roof-station-sweep.mjs';
import { stationProbe } from '../../tools/roof-station-arcs.mjs';

const ID = 'ztz99a2', NAME = 'fitting_browningDerived_qjc88', DEG = Math.PI / 180, T0 = Date.now();
const OLD_ARC = [-1.7104, 1.6581]; // the drone stand's arc alone, through the sight
const SIGHT = [-79 * Math.PI / 180, -58 * Math.PI / 180]; // the yaws where the moving mass meets the commander's sight (measured)
const secs = () => ((Date.now() - T0) / 1000).toFixed(0);
const mm = (d) => (d * 1000).toFixed(1);

const tank = createTank(ID, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242, decor: true });
try {
  tank.root.updateMatrixWorld(true);
  const station = tank.root.getObjectByName(NAME);
  assert.ok(station?.userData.remoteControlled, `${ID}: the working QJC-88 station`);
  const profile = auxiliaryWeaponProfile(station.userData.caliberMm, ID);
  const arc = station.userData.yawArc, table = station.userData.depressionByYaw ?? null;

  // ---- 1. the published arc and table
  assert.ok(Array.isArray(arc) && arc[0] < 0 && arc[1] > 0, `${ID}: the station carries its own arc round its rest bearing`);
  // the pintle's 10 mm riser: the trunnion stands 0.314 m over the foot (0.304 on the plain column)
  assert.ok(Math.abs(station.userData.auxiliaryPivot[1] - .314) < 1e-6, `${ID}: the QJC-88 stands on its 10 mm riser (trunnion ${station.userData.auxiliaryPivot[1]} m)`);
  const gun = AUXILIARY_INVENTORY[ID].guns.find((g) => g.name === NAME);
  assert.deepEqual(gun.yawArc, [...arc], `${ID}: the inventory carries the station's arc`);
  assert.deepEqual(gun.depressionByYaw ?? null, table && table.map((r) => [...r]), `${ID}: the inventory carries the station's table`);
  assert.deepEqual(AUXILIARY_ROOF_GUNS[ID].yawArc, [...arc], `${ID}: the combat anatomy carries the station's arc`);
  assert.deepEqual(AUXILIARY_ROOF_GUNS[ID].depressionByYaw ?? null, table && table.map((r) => [...r]), `${ID}: the combat anatomy carries the station's table`);
  assert.equal(ROOF_STATION_ARCS[ID], undefined, `${ID}: the drone-stand table leaves the station's own arc alone`);

  // ---- 2. the moving mass over the arc and its pitch range
  const model = stationSweepModel(tank.root, station), depAt = tableDepression(table, profile.depressionRad);
  const s2 = sweepArc(model, arc, depAt, profile.elevationRad);
  const where = (s) => `yaw ${(s.yaw / DEG).toFixed(1)}, el ${typeof s.el === 'number' ? (s.el / DEG).toFixed(1) : s.el}`;
  assert.ok(s2.d >= .025 - 1e-4, `${ID}: the QJC-88's moving mass keeps 25 mm from the turret over its arc (${mm(s2.d)} mm at ${where(s2)})`);
  assert.ok(SIGHT[0] > OLD_ARC[0] && SIGHT[1] < arc[0], `${ID}: the old arc held the sight's yaws, the new one leaves them out`);
  const old = sweepArc(model, SIGHT, depAt, profile.elevationRad, { stop: .025 });
  assert.ok(old.d < .025, `negative control: the old arc's stretch over the commander's sight meets it (${mm(old.d)} mm at ${where(old)})`);
  if (table) {
    const bare = sweepArc(model, arc, () => profile.depressionRad, profile.elevationRad, { stop: .025 });
    assert.ok(bare.d < .025, `negative control: without its depression table the station meets the roof under its barrel (${mm(bare.d)} mm at ${where(bare)})`);
  }

  // ---- 3. the barrel's axis lines
  const { probe } = stationProbe(tank.root, station);
  for (let yaw = arc[0]; yaw <= arc[1] + 1e-9; yaw += DEG) {
    for (const el of pitchSteps(0, profile.elevationRad, .05)) assert.ok(!probe(yaw, el), `${ID}: the barrel clears the roof at ${(yaw / DEG).toFixed(0)} deg, +${el.toFixed(2)}`);
    assert.ok(!probe(yaw, -depAt(yaw)), `${ID}: the barrel clears the roof at ${(yaw / DEG).toFixed(0)} deg at its depression ${depAt(yaw).toFixed(3)}`);
  }

  // ---- 4. tight at the sight: within four degrees past the arc's start the moving mass meets the stock
  const meets = (yaw) => pitchSteps(0, profile.elevationRad, .0125).some((el) => model.recoils.some((rc) => model.pose(yaw, el, rc, true, .025) < .025));
  const past = [1, 2, 3, 4].find((k) => meets(arc[0] - k * DEG));
  assert.ok(past !== undefined, `${ID}: the arc starts within 4 degrees of the sight it keeps clear of`);

  // ---- 5. the drone stand
  const seat = MISSION_ATTACHMENT_SEATS[ID];
  assert.ok(missionAttachmentMotionClear({ ...TANK_SPECS[ID] }, seat), `${ID}: the drone stand clears the station's sweep over its arc`);
  const saved = gun.yawArc;
  try {
    gun.yawArc = [arc[0], arc[1] + 4 * DEG];
    assert.equal(missionAttachmentMotionClear({ ...TANK_SPECS[ID] }, seat), false, `${ID}: the arc ends within 4 degrees of the drone stand`);
    gun.yawArc = [-Math.PI, Math.PI];
    assert.equal(missionAttachmentMotionClear({ ...TANK_SPECS[ID] }, seat), false, 'negative control: over the full circle the station sweeps the drone stand');
  } finally { gun.yawArc = saved; }

  console.log(`ztz99a2RoofArc: the QJC-88 traverses ${(arc[0] / DEG).toFixed(0)}..${(arc[1] / DEG).toFixed(0)} deg, ${mm(s2.d)} mm at worst `
    + `(${where(s2)})${table ? `, ${table.length} depression samples` : ''}; the old arc meets the sight (${mm(old.d)} mm at ${where(old)}); `
    + `the sight ${past} deg past the start, the stand within 4 deg past the end PASS (${secs()} s)`);
} finally { tank.dispose(); }
