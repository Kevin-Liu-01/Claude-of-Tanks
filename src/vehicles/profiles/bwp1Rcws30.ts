// First-party procedural BWP-1 modernisation (267, owner: "now update the ... bwp-1"): the Polish licence BMP-1 hull
// (profiles/bmpBoatHull.ts, 'bwp1' stations: BMP-1 deck with the commander's cupola behind the driver, four troop
// hatches, 4+4 firing ports, the narrower 2.94 m fender bins) carrying the BWP-1M "Puma" demonstrator fit shown at
// MSPO 2004: bolted appliqué armour over the raked sides and the fender bins, and the unmanned Rafael RCWS-30
// overhead weapon station in place of the 2A28 turret. Round 2 (critics: "a tall, thin pedestal ... perched"; "the head
// should be bigger: a wide box head on a strut frame, with the Spike on a side arm"): the head now sits low on its strut
// frame over the ring adapter and spans the photographed 1.3 m — the long ammunition box on the left, the cradle and
// 30 mm between two yoke cheeks, the two-window sight head on the right — with the single Spike-LR canister (the
// RCWS-30's catalogue ATGM option; the spec carries one ready tube) on a side arm beyond the sight.
// Photos followed (research/bwp1/photos): Pibwl, "MSPO2004 PICT0102 / PICT0105 BWP1 RCWS30" (Wikimedia Commons,
// CC BY-SA 4.0); the hull: Commons BWP-1 service and museum photographs.
// Turret-local frame: ring plane at local y 0 (world 1.66), +x = the vehicle's LEFT, +z forward.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { weaponAssembly } from './weaponStock.ts';
import { bmpSidePlate, type BmpHullPort } from './bmpBoatHull.ts';

/** Trunnion of the RCWS-30 cradle (turret-local); afvFamily.ts sets bwp1's spec gunPivot to the same point. */
const RCWS30_TRUNNION: readonly [number, number, number] = [0, 0.55, 0.10];

function mirror(half: readonly SectionPoint[]): SectionPoint[] {
  return [...half, ...half.slice().reverse().map(([x, y]) => [-x, y] as SectionPoint)];
}

/** The RCWS-30 on its ring adapter: turntable, strut frame, box head, cradle, sight, Spike arm, smoke, whips. */
export function buildBwp1Rcws30(P: BmpHullPort): void {
  const { box, cylY, cylZ, cylX, torus, xform, buildGun } = KIT;
  P.gunG.position.set(RCWS30_TRUNNION[0], RCWS30_TRUNNION[1], RCWS30_TRUNNION[2]);
  // ring adapter plate over the old 2A28 ring (sunk 4 cm into the deck) and the low chamfered turntable
  P.add('turret', cylY(0.84, 0.86, 0.06, 32), 0, -0.035, 0.0);
  P.add('turretDark', torus(0.80, 0.012, 32), 0, -0.004, 0.0);
  P.add('turret', sectionSolid([
    { z: -0.56, ring: mirror([[0.44, -0.01], [0.50, 0.08], [0.44, 0.12]]) },
    { z: -0.42, ring: mirror([[0.60, -0.01], [0.64, 0.08], [0.58, 0.12]]) },
    { z: 0.34, ring: mirror([[0.60, -0.01], [0.64, 0.08], [0.58, 0.12]]) },
    { z: 0.50, ring: mirror([[0.46, -0.01], [0.50, 0.08], [0.44, 0.12]]) },
  ]));
  // strut frame: the central column, two yoke cheeks carrying the trunnions, and an A-frame strut pair per side from
  // the turntable's shoulders up under the head
  P.add('turret', box(0.36, 0.26, 0.44), 0, 0.23, -0.06);
  for (const s of [-1, 1]) {
    const xl = s > 0 ? 0.20 : -0.28;
    const cheek = (y1: number): SectionPoint[] => [[xl, 0.10], [xl + 0.08, 0.10], [xl + 0.08, y1], [xl, y1]];
    P.add('turret', sectionSolid([{ z: -0.30, ring: cheek(0.50) }, { z: -0.02, ring: cheek(0.66) },
      { z: 0.30, ring: cheek(0.66) }]));
    P.add('turretDark', cylX(0.06, 0.09, 14), s * 0.32, RCWS30_TRUNNION[1], RCWS30_TRUNNION[2]);   // trunnion caps
    for (const zc of [-0.28, 0.24]) {
      const x0 = s * 0.54, y0 = 0.10, x1 = s * 0.30, y1 = 0.36;
      const len = Math.hypot(x1 - x0, y1 - y0);
      P.add('turret', box(0.06, len + 0.04, 0.07), (x0 + x1) / 2, (y0 + y1) / 2, zc, 0, 0, Math.atan2(x0 - x1, y1 - y0));
    }
  }
  // head, LEFT: the long ammunition box on its arm off the left cheek, lid and latches, and the feed chute arcing over
  P.add('turret', box(0.44, 0.48, 1.04), 0.50, 0.58, -0.08);
  P.add('turretDark', box(0.40, 0.012, 0.96), 0.50, 0.822, -0.08);
  for (const z of [-0.40, 0.24]) P.add('turretDetail', box(0.05, 0.07, 0.05), 0.725, 0.70, z);
  P.add('turret', box(0.10, 0.26, 0.60), 0.31, 0.43, -0.06);                         // box arm into the left cheek
  // the head's mounting plinths on the turntable: the ammunition box and the sight arm stand on closed bases, no
  // open well under the head (roof-pocket census)
  P.add('turret', box(0.42, 0.24, 0.98), 0.50, 0.23, -0.08);
  P.add('turret', box(0.56, 0.20, 0.50), -0.62, 0.21, 0.04);
  P.add('turretDark', new THREE.TorusGeometry(0.11, 0.045, 4, 10, Math.PI), 0.30, 0.78, 0.12);
  weaponAssembly(P, () => {
    // receiver and cradle (elevating): the 30 mm and its muzzle brake, the coax riding on the receiver
    P.addGunExtra(box(0.28, 0.24, 0.96), 0, 0, 0.12);
    P.addGunExtra(box(0.20, 0.10, 0.30), 0, 0.15, -0.18);                         // feed tray cover
    P.addGunExtra(cylZ(0.085, 0.32, 16), 0, 0, 0.74);                            // cradle nose / barrel jacket
    buildGun(P, { len: 2.60, r: 0.034, brake: true, baseR: 0.075 });
    P.addGunExtraDark(box(0.07, 0.08, 0.40), 0.08, 0.15, 0.22);
    P.addGunExtraDark(cylZ(0.014, 0.36, 8), 0.08, 0.15, 0.60);
    // head, RIGHT: the day/thermal sight housing, elevating with the cradle, two windows forward
    P.addGunExtra(box(0.34, 0.34, 0.46), -0.45, 0.06, 0.12);
    P.addGunExtra(box(0.10, 0.10, 0.16), -0.26, 0.0, 0.10);
    for (const x of [-0.52, -0.38]) P.addGunExtraDark(cylZ(0.052, 0.03, 14), x, 0.10, 0.355);
  }, 'gun', 14);
  // the single Spike-LR canister on a side arm beyond the sight (fixed in the turret frame)
  weaponAssembly(P, () => {
    P.add('turret', box(0.62, 0.08, 0.22), -0.56, 0.22, -0.08);                    // side arm off the right cheek
    P.add('turret', box(0.12, 0.16, 0.22), -0.84, 0.30, -0.08);                    // arm knuckle
    P.add('turret', box(0.20, 0.06, 0.46), -0.88, 0.40, 0.06);                     // cradle shoe
    P.add('turretDark', cylZ(0.088, 1.16, 18), -0.88, 0.51, 0.12);                 // canister
    P.add('turretDetail', cylZ(0.096, 0.05, 18), -0.88, 0.51, 0.68);               // front collar
    P.add('turretDetail', cylZ(0.096, 0.05, 18), -0.88, 0.51, -0.44);              // rear collar
    for (const z of [-0.16, 0.30]) P.add('turretDetail', box(0.20, 0.035, 0.05), -0.88, 0.425, z);
  });
  // 902-type smoke banks on the turntable's front shoulders, and the radio whips on its rear
  for (const side of [-1, 1]) {
    P.add('turret', box(0.20, 0.07, 0.16), side * 0.50, 0.135, 0.36);             // bank shoe on the turntable
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.038, len: 0.22, spacing: 0.085,
      splay: side * 0.55, pitch: -0.55, arc: 0.50, slot: 'detail', seed: 3410 + (side > 0 ? 1 : 0),
    });
    bank.position.set(side * 0.50, 0.268, 0.36);                                     // bracket resting on the shoe
    P.turretG.add(bank);
    P.add('turretDetail', cylY(0.032, 0.042, 0.06, 10), side * 0.40, 0.14, -0.46);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: side < 0 ? 0.72 : 0.60, r: 0.011, rake: -side * 0.04,
      seed: 3420 + (side > 0 ? 1 : 0) });
    whip.position.set(side * 0.40, 0.145, -0.46);
    P.turretG.add(whip);
  }
  P.add('turretDetail', xform(cylX(0.02, 0.02, 6), 0, 0, 0), 0.722, 0.46, 0.30);    // box drain plug
  P.decal('turret', 'number', 'BWP-1', 0.16, [0.722, 0.58, -0.10], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 0.9);
}

/** The demonstrator's bolted appliqué: continuous plates on the raked sides (the firing-port bosses stand proud of
 * them) and panels over the fender bins. Round 2: the side plates no longer break at every port (the gaps and bolt
 * rows read as "diagonal chain-like lines along the roof edges" from above). */
export function addBwp1Applique(P: BmpHullPort, binOuter: number): void {
  const { box, cylX, xform } = KIT;
  for (const s of [-1, 1]) {
    for (const [zf, zr] of [[1.62, 0.42], [0.40, -1.00], [-0.98, -2.96]] as Array<[number, number]>) {
      P.add('hullExternalArmor', bmpSidePlate(s, zf, zr, 1.29, 1.51, -0.005, 0.035));
    }
    // bin face panels seated on the rolled stiffeners, front end raked with the bin
    const x = s * (binOuter + 0.024);
    const panels: Array<[number, number]> = [[-2.86, -1.72], [-1.70, -0.56], [-0.54, 0.60], [0.62, 1.78], [1.80, 2.40]];
    for (const [zr, zf] of panels) {
      P.add('hullExternalArmor', box(0.032, 0.34, zf - zr), x, 1.06, (zf + zr) / 2);
      for (const z of [zr + 0.10, zf - 0.10]) {
        for (const y of [0.92, 1.20]) P.add('hullDetail', xform(cylX(0.016, 0.02, 6), 0, 0, 0), x + s * 0.02, y, z);
      }
    }
    const nose: SectionPoint[][] = [[[-0.016, 0.89], [0.016, 0.89], [0.016, 1.23], [-0.016, 1.23]],
      [[-0.016, 1.08], [0.016, 1.08], [0.016, 1.23], [-0.016, 1.23]]];
    P.add('hullExternalArmor', sectionSolid([
      { z: 2.42, ring: nose[0].map(([dx, y]) => [x + dx, y] as SectionPoint) },
      { z: 2.80, ring: nose[1].map(([dx, y]) => [x + dx, y] as SectionPoint) },
    ]));
  }
}
