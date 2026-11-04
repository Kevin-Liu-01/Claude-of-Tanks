// The T-14 152 (release 269; owner 2026-11-04, "a t14 armata with a 152 mm variannt"; DECISIONS "2026-11-04 Russian
// 152 mm line"): the T-14 Armata (profiles/t14X.ts) with the 152 mm 2A83 the Armata was designed to take (Uralvagonzavod
// and the Armata's designers: the turret was laid out for the 2A83; the 2A83 was fired from an Armata turret on trials).
// No photograph of the fitted turret is published, so the build follows the ruling: the Armata's hull and turret
// shell, and the 2A83's own installation. The 2A83's mantlet is larger than the 2A82's and needs the room the T-14 gives
// its lintel, so the trunnion rides 7 cm higher, a raised gun house over the breech takes the lintel's place and the
// roof panels' centre column, and the lower bearing drops under the mantlet. First-party procedural geometry: Kevin B.
// Liu (NOTICE.md); sources in docs/references/photos/russia-152-20261104.json.
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { T14X_RING, addHull, addRoofEquipment, addTurret } from './t14X.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { T14_152_GUN_FRAME } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ } = KIT;
const localY = (worldY: number) => worldY - T14X_RING.y;
const localZ = (worldZ: number) => worldZ - T14X_RING.z;


/** A gun-house station: [world z, half-width, bottom, top]. */
function houseSection(z: number, half: number, low: number, top: number): SolidSection {
  return { z: localZ(z), ring: [[-half, localY(low)], [half, localY(low)], [half, localY(top - .05)],
    [half - .06, localY(top)], [-half + .06, localY(top)], [-half, localY(top - .05)]] };
}

/** The raised armoured house over the 2A83's breech: from behind the ring's centre to a sloped brow over the mantlet,
 * its foot buried in the turret core's roof. */
function addGunHouse(P: TankBuilderPort): void {
  P.add('turret', sectionSolid([
    houseSection(-.86, .40, 2.38, 2.66),
    houseSection(-.40, .44, 2.36, 2.71),
    houseSection(.55, .44, 2.40, 2.71),
    houseSection(1.02, .43, 2.40, 2.62),
    houseSection(1.26, .40, 2.40, 2.47),
  ]));
  // the brow's lip over the mantlet and the house's bolted roof plate
  P.addEquipment('turretDetail', box(.80, .03, .06), 0, localY(2.395), localZ(1.24));
  P.addEquipment('turretDetail', box(.70, .016, 1.10), 0, localY(2.718), localZ(.08));
  for (const x of [-.30, .30]) for (const z of [-.40, .08, .56]) {
    P.addEquipment('turretDark', KIT.cylY(.012, .012, .012, 6), x, localY(2.728), localZ(z));
  }
}

/** The 2A83's mantlet: the T-14's octagonal shield at the 152 mm gun's size, and the cradle's collar. */
function addMantlet(P: TankBuilderPort): void {
  const ring: [number, number][] = [[-.19, -.30], [.19, -.30],
    [.36, -.17], [.36, .17], [.24, .26], [-.24, .26],
    [-.36, .17], [-.36, -.17]];
  P.addGunExtra(sectionSolid([{ z: -.55, ring }, { z: .045, ring }]));
  P.addGunExtra(cylZ(.235, .15, 28, .19), 0, 0, .12);
  P.addEquipment('gunMount', box(.24, .05, .34), .062, .232, .24);
}

export function buildT14_152X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, T14X_RING.y, T14X_RING.z);
  P.gunG.position.set(0, localY(T14_152_GUN_FRAME.trunnionY), localZ(T14_152_GUN_FRAME.trunnionZ));
  addHull(P);
  addTurret(P, true);
  addGunHouse(P);
  addRoofEquipment(P, true);
  addMantlet(P);
  build152Gun(P, { ...GUN_2A83, len: T14_152_GUN_FRAME.muzzleZ - T14_152_GUN_FRAME.trunnionZ });
  P.topY = localY(3.18);
}

export const T14_152_X_PROFILES = { t14_152: { build: buildT14_152X } };
