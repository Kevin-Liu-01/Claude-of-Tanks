// MBT-70 / KPz 70 secondary weapon (owner markup 2026-10-14 on the M2-derived machine gun body; coordinator ruling
// the same day: "YES to the 20 mm Rh 202 station and weapon profile. It's calibre-true per the owner's field-equipment
// standard"). The German KPz 70 carried a 20 mm Rheinmetall Rh 202 in a remotely controlled mount on the turret roof
// beside the commander's station (the US prototypes a 20 mm XM139 in the same role); the build's .50-calibre M2 was
// not that weapon. The station is the vehicle's working roof gun (the inventory generator finds it by its
// remote-control datum), firing the 20 mm profile in auxiliaryWeapons.ts.
//
// 2026-10-21 (owner: "the mbt 70 needs a proper gun turret with a gun housing for a machine gun"): the old station was a
// bare receiver box between two yoke plates, and it did not work as built: its trunnion pin ran through both plates
// and its ammunition box through the left one, so pitch carried them through the yoke (0 mm, 1,713 crossing triangles
// over the profile's range). It is now a small gun turret. On the turntable an armoured yoke of two cheek plates
// carries an armoured gun housing on trunnion bosses; the housing elevates with the gun and holds the receiver and its
// feed, and a round armoured sleeve on its sloped front plate carries the barrel. The sight rides on the housing roof.
// The gun recoils inside the housing in its own group (StationDatum.recoilM): the recoil jacket and barrel slide in
// the sleeve's bore, and the jacket's back stands clear of the housing's front plate at the full stroke. Nothing that
// moves passes through what does not (the owner's field-equipment standard): the housing's whole sweep stays above the
// turntable and inside the cheeks, and the gun stays inside the sleeve's bore through the weapon's pitch range and
// recoil (mbt70Rh202.selftest measures it with every station mesh, as workingPintleCradleAudit does).
// 2026-10-21 (owner, the same evening: "the barrel is too long on the machine gun, with no ammo or ammo feed or lights
// or other technology"): the gun reaches 1.45 m from its trunnion (it was 2.06 m), and the housing carries its kit on
// the roof: the ammunition box on the left with its belt chute into the feed cover, the sight on the right with its
// laser rangefinder port under the window, and a work light ahead of the ammunition box.
import type * as THREE from 'three';
import { KIT } from './kit.ts';
import { sweptTube } from '../accessoryPrimitives.ts';
import { beginAuxiliaryStation } from './auxiliaryStation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** The gun's recoil stroke inside its housing (metres). */
export const MBT70_RH202_RECOIL_M = 0.025;

/** Turret-local datums: the yaw ring sits on the commander's station top (x 0.62, z -0.66). */
type Rh202Port = Pick<TankBuilderPort, 'add' | 'addEquipment' | 'forEachBucketPart' | 'turretG'> & { readonly q?: boolean };
export function addMbt70Rh202(P: Rh202Port, top: number): THREE.Group {
  const { box, cylX, cylY, cylZ, lathe, slab, xform } = KIT;
  // The trunnion stands 0.25 m over the station top and 0.02 m ahead of the ring's centre. Measured in the pitch frame
  // (origin on the trunnion, +Z along the bore), the housing's lowest swept point is its rear lower edge at full
  // elevation, 0.157 m under the trunnion: 33 mm over the turntable.
  const x = 0.62, z = -0.66, axisY = top + 0.25, pivotZ = z + 0.02, reach = 1.45, muzzleZ = pivotZ + reach;
  const HW = 0.13; // the housing's half-width; the cheeks stand 12 mm outboard of it, its bosses 4 mm short of them
  const station = beginAuxiliaryStation(P, { name: 'mbt70Rh202Station', caliberMm: 20,
    yaw: [x, top, z], pivot: [x, axisY, pivotZ], muzzle: [x, axisY, muzzleZ], recoilM: MBT70_RH202_RECOIL_M });
  const seg = P.q ? 20 : 12;
  /** A point in the pitch frame at rest (across, up, along the bore from the trunnion), turret-local. */
  const at = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx, axisY + dy, pivotZ + dz];
  const body: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  const flush = (stage: 'yaw' | 'pitch' | 'recoil') => {
    for (const g of body) P.addEquipment('turret', g);
    for (const g of dark) P.add('turretDark', g);
    for (const g of glass) P.add('turretGlass', g);
    body.length = 0; dark.length = 0; glass.length = 0; station.mark(stage);
  };

  // ---- yaw stage: turntable, race and the armoured yoke ----
  body.push(xform(cylY(0.20, 0.21, 0.06, seg), x, top + 0.03, z));
  dark.push(xform(cylY(0.215, 0.215, 0.012, seg), x, top + 0.006, z));
  const cheekBottom = top + 0.057, cheekTop = axisY + 0.077, cheekX = HW + 0.012 + 0.013;
  for (const s of [-1, 1]) {
    // each cheek stands on the turntable (3 mm in), its inner face 12 mm outboard of the housing's side
    body.push(xform(box(0.026, cheekTop - cheekBottom, 0.17), x + s * cheekX, (cheekBottom + cheekTop) / 2, pivotZ));
    // the bearing cap on its outer face, and the cap's four bolt heads
    dark.push(xform(cylX(0.052, 0.022, seg), x + s * (cheekX + 0.013 + 0.009), axisY, pivotZ));
    for (const [by, bz] of [[0.032, 0], [-0.032, 0], [0, 0.032], [0, -0.032]]) {
      dark.push(xform(cylX(0.008, 0.012, 6), x + s * (cheekX + 0.013 + 0.022), axisY + by, pivotZ + bz));
    }
  }
  flush('yaw');

  // ---- pitch stage: the armoured gun housing, its sleeve, bosses and sight ----
  // The housing's side profile: a flat floor, a sloped front plate (19 degrees) and a rear plate leaning back over a
  // chamfered lower edge, closed between flat sides (slab corners front-left, front-right, rear-right, rear-left).
  const yB = -0.09, yT = 0.11, zFB = 0.22, zFT = 0.15, zRB = -0.13, zRT = -0.15;
  body.push(slab(at(-HW, yB, zFB), at(HW, yB, zFB), at(HW, yB, zRB), at(-HW, yB, zRB),
    at(-HW, yT, zFT), at(HW, yT, zFT), at(HW, yT, zRT), at(-HW, yT, zRT)));
  // the gun's armoured sleeve: a round tube from inside the front plate, its bore 31 mm (the jacket's 26 mm runs in it)
  const sleeveR = 0.031, sleeveOut = 0.056, sleeve0 = 0.16, sleeve1 = 0.34;
  const sleeve = lathe([[sleeveR, 0], [sleeveOut, 0], [sleeveOut, sleeve1 - sleeve0], [sleeveR, sleeve1 - sleeve0], [sleeveR, 0]], seg);
  body.push(xform(xform(sleeve, 0, 0, 0, Math.PI / 2, 0, 0), ...at(0, 0, sleeve0)));
  dark.push(xform(xform(lathe([[sleeveR, 0], [sleeveOut + 0.006, 0], [sleeveOut + 0.006, 0.016], [sleeveR, 0.016],
    [sleeveR, 0]], seg), 0, 0, 0, Math.PI / 2, 0, 0), ...at(0, 0, sleeve1 - 0.012)));
  // trunnion bosses (8 mm proud of the housing's sides) and their dark hubs
  for (const s of [-1, 1]) {
    body.push(xform(cylX(0.046, 0.010, seg), ...at(s * (HW + 0.003), 0, 0)));
    dark.push(xform(cylX(0.022, 0.006, 8), ...at(s * (HW + 0.0055), 0, 0)));
  }
  // the sight on the roof's right side: its armoured box, its window under a hood, the laser rangefinder's port under
  // the window, and its cable gland
  body.push(xform(box(0.075, 0.085, 0.13), ...at(0.075, yT + 0.0405, 0.03)));
  glass.push(xform(box(0.058, 0.044, 0.008), ...at(0.075, yT + 0.046, 0.098)));
  dark.push(xform(box(0.085, 0.010, 0.05), ...at(0.075, yT + 0.087, 0.088)));
  dark.push(xform(cylZ(0.010, 0.006, 8), ...at(0.098, yT + 0.012, 0.097)));
  glass.push(xform(cylZ(0.007, 0.004, 8), ...at(0.098, yT + 0.012, 0.1005)));
  dark.push(xform(cylY(0.010, 0.010, 0.016, 6), ...at(0.075, yT + 0.004, -0.045)));
  // the ammunition box on the roof's left half (issue drab, its lid and two side latches), and the belt chute from its
  // inner face over into the feed cover beside the sight
  const ammo = xform(box(0.10, 0.085, 0.20), ...at(-0.07, yT + 0.0405, -0.04));
  const ammoLid = xform(box(0.104, 0.012, 0.204), ...at(-0.07, yT + 0.087, -0.04));
  ammo.userData.issueDrab = true; ammoLid.userData.issueDrab = true;
  body.push(ammo, ammoLid);
  for (const lz of [-0.10, 0.02]) dark.push(xform(box(0.012, 0.03, 0.022), ...at(-0.124, yT + 0.058, lz)));
  dark.push(sweptTube([at(-0.025, 0.05 + yT, 0.03), at(0, 0.055 + yT, 0.045), at(0.015, 0.03 + yT, 0.06),
    at(0.015, yT - 0.01, 0.07)], 0.014, 8, 10));
  dark.push(xform(box(0.006, 0.006, 0.12), ...at(0.03, yT + 0.001, -0.06)));
  // the work light ahead of the ammunition box: its body, a dark bezel and the lens, facing along the bore
  body.push(xform(box(0.075, 0.05, 0.05), ...at(-0.07, yT + 0.022, 0.105)));
  dark.push(xform(cylZ(0.020, 0.006, seg), ...at(-0.07, yT + 0.022, 0.131)));
  glass.push(xform(cylZ(0.016, 0.004, seg), ...at(-0.07, yT + 0.022, 0.1345)));
  // the spent-case chute under the floor, and the bolt rows of the side plates
  dark.push(xform(box(0.07, 0.016, 0.09), ...at(0, yB - 0.006, 0.02)));
  for (const s of [-1, 1]) for (const bz of [-0.09, 0.09]) for (const by of [-0.055, 0.075]) {
    dark.push(xform(cylX(0.007, 0.006, 6), ...at(s * (HW + 0.001), by, bz)));
  }
  flush('pitch');

  // ---- recoil stage: the Rh 202's recoil jacket, barrel and muzzle brake ----
  // The jacket's back stands 0.235 m ahead of the trunnion, 37 mm from the front plate at rest and 12 mm at the full
  // stroke (its lowest edge, where the plate leans furthest forward); the brake stands 1.0 m clear of the sleeve.
  const brakeL = 0.11, jacket0 = 0.235, jacket1 = 0.60, barrel1 = reach - brakeL;
  dark.push(xform(cylZ(0.026, jacket1 - jacket0, seg), ...at(0, 0, (jacket0 + jacket1) / 2)));
  dark.push(xform(cylZ(0.031, 0.022, seg), ...at(0, 0, jacket1 - 0.011)));
  dark.push(xform(cylZ(0.020, barrel1 - jacket1 + 0.01, seg), ...at(0, 0, (jacket1 - 0.01 + barrel1) / 2)));
  dark.push(xform(cylZ(0.031, brakeL, seg), ...at(0, 0, barrel1 + brakeL / 2)));
  for (const dz of [-0.03, 0.0, 0.03]) dark.push(xform(box(0.068, 0.010, 0.012), ...at(0, 0, barrel1 + brakeL / 2 + dz)));
  flush('recoil');
  // Traverse and depression measured against the built turret (tools/roof-station-arcs.mjs, 2026-10-21): the 1.45 m
  // reach clears everything from -155 to +158 degrees; behind that the rear whip antennas stop it, so the arc keeps its
  // +-153 degrees. The gun depresses the profile's full 0.14 rad over the whole arc (a 0.25-degree scan): the left
  // whip, which held the 2.06 m barrel to 0.021 rad at -114 degrees, now stands 1.63 m out, beyond its reach.
  station.root.userData.yawArc = [-2.6704, 2.6704];
  return station.root;
}
