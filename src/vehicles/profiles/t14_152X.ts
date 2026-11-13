// The T-14 152 (release 269; owner 2026-11-04, "a t14 armata with a 152 mm variannt"; DECISIONS "2026-11-04 Russian
// 152 mm line"): the T-14 Armata (profiles/t14X.ts) with the 152 mm 2A83 the Armata was designed to take (Uralvagonzavod
// and the Armata's designers: the turret was laid out for the 2A83; the 2A83 was fired from an Armata turret on trials).
// No photograph of the fitted turret is published, so the build follows the ruling: the Armata's hull and turret
// shell, and the 2A83's own installation. The 2A83's mantlet is larger than the 2A82's and needs the room the T-14 gives
// its lintel, so the trunnion rides 7 cm higher, a raised gun house over the breech takes the lintel's place and the
// roof panels' centre column, and the lower bearing drops under the mantlet. The owner's looks round (2026-11-05: "a
// true new variation of the normal t14 armata") kits it out as a field variant over that shell: new ERA, a weapon tower
// with a 12.7 mm Kord, fuel drums and cans (profiles/t14_152Kit.ts) and a full camouflage net (profiles/t14_152Suit.ts).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md); sources in docs/references/photos/russia-152-20261104.json.
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { T14X_RING, addHull, addTurret } from './t14X.ts';
import { addT14_152FieldKit, T14_152_TOWER_TOP } from './t14_152Kit.ts';
import { addT14_152Suit } from './t14_152Suit.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { T14_152_GUN_FRAME } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ } = KIT;
const localY = (worldY: number) => worldY - T14X_RING.y;
const localZ = (worldZ: number) => worldZ - T14X_RING.z;


/** A gun-house station: [world z, half-width at the foot, bottom, top]. The walls stand vertical to a shoulder 0.17 m
 * under the roof, then rake in 60 mm to a chamfered roof edge (the house's tumblehome). */
function houseSection(z: number, half: number, low: number, top: number): SolidSection {
  const upper = half - .06, shoulder = top - .17;
  return { z: localZ(z), ring: [[-half, localY(low)], [half, localY(low)], [half, localY(shoulder)],
    [upper, localY(top - .03)], [upper - .05, localY(top)], [-upper + .05, localY(top)], [-upper, localY(top - .03)],
    [-half, localY(shoulder)]] };
}

/**
 * The raised armoured casemate over the 2A83's breech (looks round 2, the critics: "the raised housing over the gun is a
 * flat visor-like hood ... from the side the turret silhouette barely changes"): a tall house 0.49 m over the roof, from
 * ahead of the panoramic sight to a steep front plate over the lintel, its foot buried in the turret core and the front
 * shroud's tops. Its walls carry bolted add-on plates, its roof a bolted access plate with lifting eyes, its rear wall a
 * service hatch, its front plate a lip over the mantlet. The front plate stands 9 cm behind the mantlet's boot at full
 * elevation (20 degrees).
 */
function addGunHouse(P: TankBuilderPort): void {
  P.add('turret', sectionSolid([
    houseSection(-.86, .46, 2.40, 2.90),
    houseSection(-.74, .50, 2.38, 3.02),
    houseSection(.50, .50, 2.40, 3.04),
    houseSection(.84, .48, 2.40, 3.00),
    houseSection(1.10, .46, 2.40, 2.64),
  ]));
  const { cylY } = KIT;
  // the front plate's lip over the mantlet and the roof's bolted access plate with its bolts and four lifting eyes
  P.addEquipment('turretDetail', box(.84, .035, .06), 0, localY(2.418), localZ(1.085));
  P.addEquipment('turretDetail', box(.70, .018, 1.30), 0, localY(3.046), localZ(.05));
  for (const x of [-.31, .31]) for (const z of [-.52, .05, .62]) P.addEquipment('turretDark', cylY(.013, .013, .012, 6), x, localY(3.058), localZ(z));
  for (const x of [-.36, .36]) for (const z of [-.66, .76]) P.addEquipment('turretDark', KIT.torus(.032, .009, 10, 5), x, localY(3.05), localZ(z));
  for (const s of [-1, 1]) {
    // bolted add-on plates on the lower walls, a seam between them, a row of bolts along each plate's head
    for (const [z0, z1] of [[-.70, -.05], [.03, .80]]) {
      P.addEquipment('turretDetail', box(.03, .30, z1 - z0), s * (.50 + .012), localY(2.69), localZ((z0 + z1) / 2));
      for (let k = 0; k < 4; k++) P.addEquipment('turretDark', box(.016, .024, .024), s * .53, localY(2.81), localZ(z0 + .08 + k * (z1 - z0 - .16) / 3));
    }
  }
  // the rear wall's service hatch and its hinge bar
  P.addEquipment('turretDetail', box(.46, .26, .025), 0, localY(2.66), localZ(-.868));
  P.addEquipment('turretDark', box(.40, .022, .03), 0, localY(2.80), localZ(-.88));
}

/** A mantlet station's octagon: half-width `w`, from `lo` to `hi` about the bore, corners chamfered by `c`. */
function octagon(w: number, lo: number, hi: number, c: number): [number, number][] {
  return [[-w + c, lo], [w - c, lo], [w, lo + c], [w, hi - c], [w - c, hi], [-w + c, hi], [-w, hi - c], [-w, lo + c]];
}

/**
 * The 2A83's mantlet: the T-14's octagonal shield at the 152 mm gun's size inside the gun opening, and ahead of the
 * turret face the big armoured boot round the gun's root (looks round 2: the 152 mm installation reads at a glance): it
 * steps out past the opening's cheeks to 0.88 m across and runs 0.34 m ahead of them to a chamfered, bolted front with
 * the coaxial gun's port, the barrel leaving it through a dark ring and a root collar. Its top stays under the gun house's
 * front plate through the 20 degree elevation, and at the -8 degree stop its foot clears the crew hatches.
 */
function addMantlet(P: TankBuilderPort): void {
  const ring: [number, number][] = [[-.19, -.30], [.19, -.30],
    [.36, -.17], [.36, .17], [.24, .26], [-.24, .26],
    [-.36, .17], [-.36, -.17]];
  P.addGunExtra(sectionSolid([{ z: -.55, ring }, { z: .045, ring }]));
  P.addGunExtra(sectionSolid([
    { z: .03, ring: octagon(.36, -.26, .22, .08) },
    { z: .29, ring: octagon(.38, -.26, .22, .08) },
    { z: .30, ring: octagon(.44, -.27, .27, .09) },
    { z: .56, ring: octagon(.43, -.27, .27, .09) },
    { z: .63, ring: octagon(.36, -.22, .22, .08) },
  ]));
  P.addGunExtraDark(cylZ(.235, .02, 28), 0, 0, .635);
  // the root collar stays inside 0.225 m of the bore: at the -8 degree stop ahead of the turret the gun passes 25 mm over
  // the crew's periscopes (the gun-hull receipt)
  P.addGunExtra(cylZ(.215, .10, 28, .225), 0, 0, .68);
  P.addGunExtraDark(KIT.box(.07, .06, .02), .27, -.10, .634);
  for (const [x, y, z] of [[-.30, .19, .632], [.30, .19, .632], [-.30, -.19, .632], [.30, -.19, .632], [-.385, 0, .60], [.385, 0, .60]]) {
    P.addGunExtraDark(KIT.box(.024, .024, .02), x, y, z);
  }
}

export function buildT14_152X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, T14X_RING.y, T14X_RING.z);
  P.gunG.position.set(0, localY(T14_152_GUN_FRAME.trunnionY), localZ(T14_152_GUN_FRAME.trunnionZ));
  addHull(P);
  addTurret(P, true);
  addGunHouse(P);
  addT14_152FieldKit(P);
  addMantlet(P);
  build152Gun(P, { ...GUN_2A83, len: T14_152_GUN_FRAME.muzzleZ - T14_152_GUN_FRAME.trunnionZ });
  addT14_152Suit(P);
  P.topY = T14_152_TOWER_TOP;
}

export const T14_152_X_PROFILES = { t14_152: { build: buildT14_152X } };
