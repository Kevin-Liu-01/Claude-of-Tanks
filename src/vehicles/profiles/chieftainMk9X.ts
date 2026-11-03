// The Chieftain Mk 9 on the source-built Mk 10 X (chieftain10X.ts): its predecessor on the same hull and turret
// castings. Release 268b (owner 2026-11-02: "the cheiftain mk 3 and mk 9s look identical and way way too smimilar to the
// inspirations, make them look much more different inn editing the turret and hull appearances to like like
// precessors"). A Mk 9 is a Mk 2-built Mk 6 after every phase of Totem Pole (1979): IFCS, the laser sight, the muzzle
// reference system of 1975 (the Mk 10 X gun already carries its mirror) and Clansman radios, and no Stillbrew (Mk 10-12,
// 1984-86, en.wikipedia.org/wiki/Chieftain_(tank)). What it carries that the Mk 10 does not:
// - the bare cast turret nose: the casting's sloped front falls to the gun root (IWM Duxford's Mk 6 "01 EB 70"), where
//   the Mk 10 wears the Stillbrew cheeks;
// - the two six-tube smoke dischargers on the bare cheeks ahead of the side boxes (the same Mk 6), not on Stillbrew;
// - the turret-ring splash lip on the hull roof ahead of the turret, round the driver's hatch (the same Mk 6; the Mk 10's
//   Stillbrew collar stands there);
// - the BAOR crews' late-1970s/1980s stowage: a camouflage net rolled on the NBC pack and a tarpaulin roll in the open
//   carrier (NATO exercise photographs, 1979-90);
// - the turret's two front lifting eyes (glacis eyes do not fit under this gun's full depression over the bow).
// Sources and photographs: ~/cot-lanes/italy-korea-bmp-267-evidence/research/chieftain_mk9/. First-party: Kevin B. Liu.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { chamferedCase, clothRoll, grabRail, liftingEye, loftRings, periscopeHead, rollStraps, sightBox, tubeThrough } from './chieftainMarksX.ts';
import { reserveDecorVolume } from './fieldChest.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type LauncherSeat = readonly [x: number, y: number, z: number, yaw: number];
const { box } = KIT;

/** The Mk 9's two six-tube banks on the bare cast cheeks, ahead of the side boxes (the Mk 10's stand on Stillbrew). */
export const CHIEFTAIN_MK9_LAUNCHER_SEATS: readonly LauncherSeat[] = [[-1.215, 1.995, .985, -.67], [1.175, 2.025, 1.005, .67]];

/** One station of the bare nose, +X side, hull-frame metres: [z, inner x, low y, [x, y] of the lower cheek, the upper
 *  cheek, the shoulder, and the crown's outer edge]. */
type NoseRow = readonly [z: number, inner: number, low: number, lowX: number,
  midX: number, midY: number, roundX: number, roundY: number, flatX: number, crown: number];

function noseSection(row: NoseRow, side: number): SolidSection {
  const [z, inner, low, lowX, midX, midY, roundX, roundY, flatX, crown] = row;
  // the cheek from its foot over the shoulder to the crown as one rounded curve through the four measured points
  const cheek = new THREE.CatmullRomCurve3([[lowX, low], [midX, midY], [roundX, roundY], [flatX, crown]]
    .map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal').getPoints(8);
  const ring: [number, number][] = [[inner, low], ...cheek.map((p): [number, number] => [p.x, p.y]), [inner, crown]];
  if (side < 0) ring.reverse();
  return { z, ring: ring.map(([x, y]): [number, number] => [side * x, y]) };
}

/**
 * The bare cast nose. The Mk 10 X casting ends at z 1.55 behind the Stillbrew; without it the Mk 9's casting carries on
 * forward and down to the gun root as the Mk 6 at Duxford shows: each cheek a closed loft from inside the casting's
 * last station (its own measured shoulder, a centimetre inside) to the horn tip, leaving the gun's slot (|x| < 0.19)
 * open. The two sides follow their own castings (the port casting is lower than the starboard one).
 */
function bareNose(P: TankBuilderPort, pivot: Point): void {
  const plus: readonly NoseRow[] = [
    [1.50, .19, 1.66, 1.00, .820, 1.90, .680, 2.085, .20, 2.305],
    [1.62, .19, 1.66, .915, .745, 1.89, .610, 2.040, .22, 2.250],
    [1.78, .19, 1.66, .760, .625, 1.86, .505, 1.985, .24, 2.150],
    [1.94, .19, 1.66, .560, .470, 1.81, .385, 1.915, .23, 2.020],
    [2.06, .19, 1.67, .360, .320, 1.76, .275, 1.835, .21, 1.900],
    [2.12, .19, 1.69, .235, .225, 1.74, .212, 1.785, .20, 1.810],
  ];
  const minus: readonly NoseRow[] = [
    [1.50, .19, 1.66, 1.02, .910, 1.785, .715, 1.990, .20, 2.275],
    [1.62, .19, 1.66, .930, .820, 1.775, .640, 1.960, .22, 2.215],
    [1.78, .19, 1.66, .770, .680, 1.760, .530, 1.925, .24, 2.120],
    [1.94, .19, 1.66, .565, .500, 1.745, .400, 1.870, .23, 2.000],
    [2.06, .19, 1.67, .360, .330, 1.730, .280, 1.810, .21, 1.890],
    [2.12, .19, 1.69, .235, .225, 1.725, .212, 1.775, .20, 1.805],
  ];
  for (const [side, rows] of [[1, plus], [-1, minus]] as const) {
    const g = sectionSolid(rows.map((row) => noseSection(row, side)));
    g.userData.chieftainMk9 = 'bareNose';
    P.add('turret', g.translate(-pivot[0], -pivot[1], -pivot[2]));
  }
}

/**
 * Closures of the Mk 10 X's roof pockets (tools/roof-pocket-census.mjs: 18 on this build, 7,360 cm2, and the round-268
 * Mk 9 had none, so they may not come back): the wedge of air under each sponson's overhang above the fender, closed by
 * the sponson's own lower wall; the air under each turret side box, closed by the box's welded lower plate; the slots
 * between the rear fender cases and the hull. Hidden inside the hull and turret, they move no visible outline.
 */
function closures(P: TankBuilderPort, pivot: Point): void {
  // The fender deck's top under the overhang (chieftain10XFenders.ts, inner row), 4 mm into it.
  const fender = (z: number): number => {
    const rows = [[-3.20, 1.25473], [-3.04, 1.26835], [-1.70, 1.28587], [0, 1.31018], [.92, 1.30842], [2.16, 1.32466]];
    const i = Math.max(1, Math.min(rows.length - 1, rows.findIndex((r) => r[0] >= z)));
    const [z0, y0] = rows[i - 1], [z1, y1] = rows[i];
    return y0 + (y1 - y0) * (z - z0) / (z1 - z0) - .004;
  };
  for (const side of [-1, 1]) {
    // The sponson overhang (hull wall 1.03 at the bay height 1.29-1.31, out to 1.43 at 1.46; over the engine bay, aft of
    // z -2.60, its underside climbs to 1.58-1.61 at the edge) above the fender, from the rear side case (z -3.26) to
    // ahead of the turret's ring.
    const wedge: SolidSection[] = ([[-3.25, 1.62], [-2.62, 1.62], [-2.58, 1.47], [-1.70, 1.47], [0, 1.47], [.92, 1.47],
      [1.30, 1.47]] as const).map(([z, top]) => {
      const ring: [number, number][] = [[1.02, fender(z)], [1.425, fender(z)], [1.425, top], [1.02, 1.330]];
      if (side < 0) ring.reverse();
      return { z, ring: ring.map(([x, y]): [number, number] => [side * x, y]) };
    });
    const g = sectionSolid(wedge);
    g.userData.chieftainMk9 = 'sponsonWall';
    P.add('hull', g);
    // The slot between the hull's side and the rear fender case under the case's strap (z -2.42..-2.03).
    const slot = box(.064, .200, .44).translate(side * 1.453, 1.388, -2.225);
    slot.userData.chieftainMk9 = 'caseSlot';
    P.add('hull', slot);
    // The undercut of the casting's lower side under each side box, and under the aft casting's chamfered corners.
    for (const [x0, x1, y0, y1, z0, z1] of [[.968, 1.236, 1.640, 1.800, -.020, .270], [.784, .930, 1.784, 1.892, -1.585, -.560]]) {
      const fill = box(x1 - x0, y1 - y0, z1 - z0).translate(side * (x0 + x1) / 2 - pivot[0], (y0 + y1) / 2 - pivot[1],
        (z0 + z1) / 2 - pivot[2]);
      fill.userData.chieftainMk9 = 'undercut';
      P.add('turret', fill);
    }
  }
  // Under the starboard bow light's stock (x -1.17..-1.41, z 2.79..2.86).
  const bow = box(.25, .045, .10).translate(-1.292, 1.352, 2.825);
  bow.userData.chieftainMk9 = 'bowUndercut';
  P.add('hull', bow);
}

/**
 * The canvas mantlet cover the Chieftain wears at the gun root (no external mantlet: the Mk 6 at Duxford, the Mk 3s at
 * Latrun): a boot on the cradle (it elevates with the gun, does not recoil) from inside the casting's slot (z 1.555,
 * filling it to the slab's soffit, 2.075, and 10 mm inside the cheeks, x 0.19) over the recoil guide (r 0.164 to z 1.85)
 * to the barrel's root, where it is gathered 12 mm proud of the 0.1146 m tube. Gun-frame part from hull-frame metres.
 */
function mantletCover(P: TankBuilderPort, trunnion: Point): void {
  const bore = trunnion[1];
  const rows: readonly (readonly [z: number, half: number, low: number, top: number, round: number])[] = [
    [1.555, .180, 1.700, 2.072, .05], [1.70, .180, 1.725, 2.078, .08], [1.86, .176, 1.738, 2.082, .14],
    [1.91, .140, 1.780, 2.044, .13], [1.95, .127, 1.785, 2.039, .127]];
  const g = sectionSolid(rows.map(([z, half, low, top, round]) => {
    const cy = (low + top) / 2, hy = (top - low) / 2, r = Math.min(round, half, hy);
    const ring: [number, number][] = [];
    for (const [qx, qy, a0] of [[1, -1, -Math.PI / 2], [1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI]] as const) {
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * Math.PI / 8;
        ring.push([qx * (half - r) + Math.cos(a) * r, cy + qy * (hy - r) + Math.sin(a) * r - bore]);
      }
    }
    return { z: z - trunnion[2], ring: ring.map(([x, y]): [number, number] => [x - trunnion[0], y]) };
  }));
  g.userData.chieftainMk9 = 'mantletCover';
  P.add('gunMountCanvasSkin', g);
}

/** The BAOR crews' stowage: a camouflage net rolled across the NBC pack's lid (2.3056) with two webbing straps, and a
 * tarpaulin roll lashed on the open carrier's floor (1.942) between its aft can and forward stores. */
function laterStowage(P: TankBuilderPort, pivot: Point): void {
  const add = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2]);
  const r = .125, rollY = 2.3056 + r * .55 - .012;
  add('turretCloth', clothRoll(1.30, r, .004), -.02, rollY, -1.86);
  for (const strap of rollStraps(1.30, r, .004, [-.30, .30])) add('turretDark', strap, -.02, rollY, -1.86);
  const t = .105, tarpY = 1.942 + t * .55 - .010;
  add('turretCloth', clothRoll(.46, t, .008).rotateY(Math.PI / 2), -1.265, tarpY, -1.13);
  for (const strap of rollStraps(.46, t, .008, [-.22, .22])) add('turretDark', strap.rotateY(Math.PI / 2), -1.265, tarpY, -1.13);
}

/** The turret-ring splash lip on the hull roof ahead of the turret: a 30 mm bar on an arc about the ring's axis that
 * runs round the front of the driver's hatch, beyond the turret's lower casting as it turns and under the gun's full
 * depression (at 46 mm it held the recoiled cradle 1 cm short of the sweep's keep at 30 degrees of yaw). */
function splashLip(P: TankBuilderPort, ringZ: number): void {
  const radius = 1.73, n = 28, a0 = -.86, a1 = .86;
  // the hull roof under it (hull(): 1.558 at z 1.85, 1.528 at 2.33, 1.4115 at the glacis joint 3.0149)
  const roof = (z: number): number => z < 1.85 ? 1.558 : z < 2.33 ? 1.558 - (z - 1.85) * .0625 : 1.528 - (z - 2.33) * .1716;
  const sections = Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n;
    const x = radius * Math.sin(a), z = ringZ + radius * Math.cos(a), y = roof(z);
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    return [[-.016, -.010], [.016, -.010], [.016, .022], [.006, .030], [-.016, .030]].map(([u, v]) =>
      new THREE.Vector3(x + out.x * u, y + v, z + out.z * u));
  });
  P.addEquipment('hullDetail', loftRings(sections));
}

/** The turret's two front lifting eyes on the casting's shoulders, ahead of the cupola and the loader's hatches. */
function turretLiftingEyes(P: TankBuilderPort, pivot: Point): void {
  const turret = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0): void =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry);
  liftingEye(turret, 'turretDetail', .62, 2.392, .95, 0);
  liftingEye(turret, 'turretDetail', -.66, 2.372, .95, 0);
}

/** The decor keeps off the starboard side box's outer wall (fieldChest.ts reserveDecorVolume, turret frame): the side
 * slot's hung load there stood its L-arm through its own load (the contact receipt: one piece touching only by crossing),
 * so the load takes its next route. The Mk 10 X's decor does not hang one there. */
function keepDecorOffSideBox(P: TankBuilderPort, pivot: Point): void {
  if (!P.turretG) return;
  reserveDecorVolume(P.turretG, [-1.95 - pivot[0], 1.90 - pivot[1], -.30 - pivot[2]],
    [-1.53 - pivot[0], 2.28 - pivot[1], .20 - pivot[2]]);
}

/**
 * Release 269 (the owner, 2026-11-03: "for the cheiftain mk 3 and mk 9, add on all the equipment we had on teh turrets
 * from before onto the currennt mk 3 and mk 9"): the retired upper assembly's turret kit (chieftainMarksX.ts) seated on
 * the Mk 10 X casting where that build carried it: its armoured sight head with the window on the roof ahead of the
 * loader's hatches, the loader's periscopes, the sight box beside the cupola, the roof grab rails, stowed rods on the
 * left housing and the bustle rail basket with two tarpaulin rolls and the ammunition can. What this Mk 9 already carries
 * keeps its current part: the side housings and cases (the old side bins), the left carrier (the flank baskets), the
 * smoke banks, the whips, the cupola's L37. Heights are the casting's roof as measured on the build (within 3 mm).
 */
function oldTurretKit(P: TankBuilderPort, pivot: Point): void {
  const add = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry, rz);
  sightHead(add);
  periscopeHead(add, 'turretDetail', 'turretGlass', .14, 2.425, .30, -.08);
  periscopeHead(add, 'turretDetail', 'turretGlass', .33, 2.425, .30, .10);
  sightBox(add, 'turretDetail', 'turretDark', 'turretGlass', .12, 2.407, -.98, 0, .20, .14, .20);
  grabRail(add, 'turretDetail', [.28, 2.389, .82], [.66, 2.378, .82]);
  grabRail(add, 'turretDetail', [-.15, 2.411, .62], [-.55, 2.392, .62]);
  grabRail(add, 'turretDetail', [.40, 2.407, -1.02], [.80, 2.407, -1.02]);
  grabRail(add, 'turretDetail', [-.30, 2.407, -1.02], [-.68, 2.407, -1.02]);
  wallRods(add);
  bustleBasket(P, add, pivot);
}

/** The armoured sight head of the old Mk 9 (its window forward) on the roof ahead of the loader's hatches (their front
 * leaf reaches z 0.205) and inboard of the antenna support (x 0.854): a cast plinth bedded into the falling roof (2.425
 * at its inner rear corner, 2.36 at its outer front), the head on it, the dark window with its glass and hood, and the
 * lid plate. */
function sightHead(add: Add): void {
  const x = .69, z = .45, foot = 2.355;
  add('turretDetail', chamferedCase(.40, .10, .40), x, foot + .05, z);
  add('turretDetail', chamferedCase(.44, .24, .42), x, foot + .10 + .11, z);
  const top = foot + .10 + .23, front = z + .21;
  add('turretDetail', box(.46, .020, .40), x, top + .006, z - .01);
  add('turretDark', box(.30, .115, .016), x, foot + .225, front + .004);
  add('turretGlass', box(.23, .082, .004), x, foot + .225, front + .014);
  add('turretDetail', box(.34, .012, .070), x, foot + .300, front + .030, -.22);
  for (const dx of [-.16, .16]) add('turretDetail', box(.014, .115, .040), x + dx, foot + .225, front + .016);
}

type Add = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;

/** Stowed rods (cleaning staves and pickets, the old build's rods on its side bins) on two hook brackets on the left
 * housing's outer wall (x -1.5535, z -0.478..0.300, y 1.903-2.30): each bracket a plate 6 mm into the wall, an arm out to
 * x -1.630 and a lip; three rods on the arms under a strap. */
function wallRods(add: Add): void {
  const wall = -1.5535, armY = 2.060;
  for (const z of [-.33, .15]) {
    add('turretDetail', box(.014, .10, .050), wall - .001, armY + .030, z);
    add('turretDetail', box(.080, .014, .040), wall - .040, armY, z);
    add('turretDetail', box(.012, .048, .040), wall - .076, armY + .024, z);
    add('turretDark', box(.006, .062, .030), wall - .055, armY + .056, z);
  }
  const r = .016, y = armY + .007 + r;
  add('turretDark', KIT.cylZ(r, .80, 10), wall - .022, y, -.09);
  add('turretDark', KIT.cylZ(r, .72, 10), wall - .054, y, -.11);
  add('turretDark', KIT.cylZ(.019, .76, 10), wall - .038, y + .030, -.07);
}

/** The bustle rail basket of the old build (it had a tray, rails and two tarpaulin rolls behind the NBC pack) behind the
 * rear body (its rear face z -2.090, x -0.806..0.753 with 50 mm chamfers, y 1.872-2.306), past its rear plate (to z
 * -2.222) and ledges: floor bars from 5 mm into the body's face back to the rear rail, a lower and an upper rail bent
 * round the back (their ends into the face), uprights, a gusset under each outer floor bar, the two rolls and the can. */
function bustleBasket(P: TankBuilderPort, add: Add, pivot: Point): void {
  const x0 = -.75, x1 = .70, front = -2.085, rear = -2.56, low = 1.905, high = 2.27, side = -2.30;
  const bend = .06;
  for (const y of [low, high]) {
    add('turretOpenLattice', tubeThrough([[x0, y, front], [x0, y, rear + bend], [x0 + bend * .3, y, rear + bend * .3],
      [x0 + bend, y, rear], [x1 - bend, y, rear], [x1 - bend * .3, y, rear + bend * .3], [x1, y, rear + bend], [x1, y, front]],
    .011, 8), 0, 0, 0);
  }
  for (let i = 0; i <= 8; i++) {
    const x = x0 + bend + (x1 - x0 - 2 * bend) * i / 8;
    add('turretOpenLattice', KIT.cylY(.007, .007, high - low, 8), x, (high + low) / 2, rear);
  }
  for (const x of [x0, x1]) for (const z of [side, (side + rear) / 2 - .03]) {
    add('turretOpenLattice', KIT.cylY(.007, .007, high - low, 8), x, (high + low) / 2, z);
  }
  const bars = [-.70, -.42, -.14, .14, .42, .66];
  for (const x of bars) add('turretOpenLattice', box(.026, .012, front - rear + .005), x, low - .006, (front + rear) / 2 + .0025);
  for (const x of [bars[0], bars[bars.length - 1]]) add('turretDetail', box(.050, .060, .050), x, low - .040, front - .012);
  if (!P.mats) return;
  KIT.tarpRoll(P, 'turretCloth', -.32 - pivot[0], low + .095 - .004 - pivot[1], -2.40 - pivot[2], .48, .095, true);
  KIT.tarpRoll(P, 'turretCloth', .45 - pivot[0], low + .085 - .004 - pivot[1], -2.40 - pivot[2], .40, .085, true);
  KIT.ammoCan(P, 'turretDark', .14 - pivot[0], low + .10 - .004 - pivot[1], -2.40 - pivot[2], 0);
}

export function addChieftainMk9Kit(P: TankBuilderPort, pivot: Point, trunnion: Point): void {
  bareNose(P, pivot);
  mantletCover(P, trunnion);
  closures(P, pivot);
  laterStowage(P, pivot);
  splashLip(P, pivot[2]);
  turretLiftingEyes(P, pivot);
  keepDecorOffSideBox(P, pivot);
  oldTurretKit(P, pivot);
}
