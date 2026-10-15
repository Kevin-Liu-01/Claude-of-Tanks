// MBT-70 / KPz 70 secondary weapon (owner markup 2026-10-14 on the M2-derived machine gun body; coordinator ruling
// the same day: "YES to the 20 mm Rh 202 station and weapon profile. It's calibre-true per the owner's field-equipment
// standard"). The German KPz 70 carried a 20 mm Rheinmetall Rh 202 in a remotely controlled mount on the turret roof
// beside the commander's station (the US prototypes a 20 mm XM139 in the same role); the build's .50-calibre M2 was
// not that weapon. One remote station on the commander's station top: a low turntable with a two-plate yoke, the
// receiver with its belt feed and ammunition box on the left, the recoil jacket, the slim 20 mm barrel and its
// multi-slot muzzle brake. The station is the vehicle's working roof gun (the inventory generator finds it by its
// remote-control datum), firing the 20 mm profile in auxiliaryWeapons.ts.
import type * as THREE from 'three';
import { KIT } from './kit.ts';
import { beginAuxiliaryStation } from './auxiliaryStation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Turret-local datums: the yaw ring sits on the commander's station top (x 0.62, z -0.66). */
export function addMbt70Rh202(P: TankBuilderPort, top: number): THREE.Group {
  const { box, cylX, cylY, cylZ, xform } = KIT;
  const x = 0.62, z = -0.66, axisY = top + 0.20;
  const station = beginAuxiliaryStation(P, { name: 'mbt70Rh202Station', caliberMm: 20,
    yaw: [x, top, z], pivot: [x, axisY, z + 0.04], muzzle: [x, axisY, 1.42] });
  const seg = P.q ? 20 : 12;
  // yaw stage: the turntable on the station top and the yoke's two side plates
  const body: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  body.push(xform(cylY(0.19, 0.21, 0.06, seg), x, top + 0.03, z));
  dark.push(xform(cylY(0.215, 0.215, 0.012, seg), x, top + 0.006, z));
  for (const s of [-1, 1]) body.push(xform(box(0.030, 0.20, 0.26), x + s * 0.125, top + 0.15, z + 0.02));
  for (const g of body) P.addEquipment('turret', g);
  for (const g of dark) P.add('turretDark', g);
  body.length = 0; dark.length = 0; station.mark('yaw');
  // pitch stage: trunnion, receiver, belt feed and ammunition box, recoil jacket, barrel, muzzle brake
  dark.push(xform(cylX(0.034, 0.27, seg), x, axisY, z + 0.04));
  body.push(xform(box(0.15, 0.15, 0.66), x, axisY, z + 0.10));
  body.push(xform(box(0.15, 0.04, 0.50), x, axisY + 0.09, z + 0.06));
  body.push(xform(box(0.12, 0.18, 0.32), x - 0.145, axisY - 0.01, z - 0.02));
  dark.push(xform(box(0.06, 0.05, 0.12), x - 0.075, axisY + 0.03, z + 0.02));
  dark.push(xform(cylZ(0.040, 0.30, seg), x, axisY, z + 0.58));
  dark.push(xform(cylZ(0.020, 1.24, seg), x, axisY, z + 1.35));
  dark.push(xform(cylZ(0.031, 0.11, seg), x, axisY, 1.365));
  for (const dz of [-0.03, 0.0, 0.03]) dark.push(xform(box(0.068, 0.010, 0.012), x, axisY, 1.365 + dz));
  for (const g of body) P.addEquipment('turret', g);
  for (const g of dark) P.add('turretDark', g);
  station.mark('pitch');
  // Traverse and depression measured against the built turret (tools/roof-station-arcs.mjs, 10-14): the 2.04 m reach
  // clears everything to +-155 degrees; behind that the rear whip antennas stop it (2 degrees margin). Over the turret's
  // left side at -115 degrees the roof lets it depress 0.113 rad, and at the +153 degree stop 0.131 (0.01 margin each).
  station.root.userData.yawArc = [-2.6704, 2.6704];
  station.root.userData.depressionByYaw = [[-2.0944, .14], [-2.0071, .103], [-1.9199, .14], [2.618, .14], [2.6704, .121]];
  return station.root;
}
