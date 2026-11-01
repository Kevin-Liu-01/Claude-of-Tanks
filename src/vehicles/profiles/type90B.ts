// The Type 90 (B): the production Type 90 (type90X.ts) built ready for the Type 92 mine-clearing roller (267; owner
// 2026-10-31, "add a type 90 b esp with that awesome machine gun"; Main: the roller-ready Type 90, its kit the
// difference). The roller's 10 mm mounting plate covers the lower front plate with its six seats for the roller's push
// frames, and two hitch lugs on the glacis take its lift chains; the roller itself is not carried. A Type 90 built this
// way cannot take the dozer kit. The roof M2 is the Type 90's own (type90X.ts). First-party procedural geometry: Kevin B.
// Liu (NOTICE.md); photographs and sources in docs/references/photos/type90b-20261031.json.
import { KIT } from './kit.ts';
import { buildType90X } from './type90X.ts';
import { TYPE90B_ROLLER_PLATE } from '../type90bArmor.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX } = KIT;

const { foot: FOOT, up: UP, out: OUT, lengthM: PLATE_LEN } = TYPE90B_ROLLER_PLATE;
const TILT = Math.atan2(UP[1], UP[0]);                          // a box's +Y along the plate, its +Z out of it

/** Hull [y, z] `s` metres up the lower front plate from its foot and `o` metres out of it. */
function onPlate(s: number, o: number): [number, number] {
  return [FOOT[0] + UP[0] * s + OUT[0] * o, FOOT[1] + UP[1] * s + OUT[1] * o];
}

function addRollerMounts(P: TankBuilderPort): void {
  const t = TYPE90B_ROLLER_PLATE.thicknessM;
  // the plate, bolted on 2 mm into the hull plate's face, with its bolt rows along the top and bottom edges
  const [py, pz] = onPlate(PLATE_LEN / 2, t / 2 - 0.002);
  P.addEquipment('hullDetail', box(TYPE90B_ROLLER_PLATE.halfW * 2, PLATE_LEN - 0.02, t), 0, py, pz, TILT, 0, 0);
  for (const s of [0.03, PLATE_LEN - 0.03]) {
    for (let i = 0; i < 9; i++) {
      const [by, bz] = onPlate(s, t + 0.004);
      P.addEquipment('hullDark', box(0.03, 0.03, 0.012), -0.80 + i * 0.20, by, bz, TILT, 0, 0);
    }
  }
  // six seats for the roller's push frames, three in front of each track: a pad, two lug cheeks and the pin
  for (const side of [-1, 1]) {
    for (const x of [0.26, 0.50, 0.74]) {
      const sx = side * x, s = 0.11;
      const [ay, az] = onPlate(s, t + 0.0125 - 0.002);
      P.addEquipment('hullDetail', box(0.15, 0.11, 0.025), sx, ay, az, TILT, 0, 0);
      for (const o of [-1, 1]) {
        const [cy, cz] = onPlate(s, t + 0.025 + 0.045 - 0.002);
        P.addEquipment('hullDetail', box(0.024, 0.10, 0.09), sx + o * 0.045, cy, cz, TILT, 0, 0);
      }
      const [qy, qz] = onPlate(s, t + 0.025 + 0.062);
      P.addEquipment('hullDark', cylX(0.019, 0.13, 12), sx, qy, qz);
    }
  }
  // the lift chains' hitch lugs on the glacis (its top falls 1.4677 -> 1.2751 from z 2.324 to 3.408), inboard of the
  // headlight guards
  const glacisRake = Math.atan2(1.4677 - 1.2751, 3.408 - 2.324);
  for (const side of [-1, 1]) {
    const x = side * 0.70, z = 3.28, y = 1.4677 - (z - 2.324) * Math.tan(glacisRake);
    P.addEquipment('hullDetail', box(0.17, 0.028, 0.15), x, y + 0.010, z, glacisRake, 0, 0);
    for (const o of [-1, 1]) P.addEquipment('hullDetail', box(0.026, 0.11, 0.12), x + o * 0.045, y + 0.075, z, glacisRake, 0, 0);
    P.addEquipment('hullDark', cylX(0.022, 0.13, 12), x, y + 0.095, z + 0.01);
  }
}

export function buildType90B(P: TankBuilderPort): void {
  buildType90X(P);
  addRollerMounts(P);
}
