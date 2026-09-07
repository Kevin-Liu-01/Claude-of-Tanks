// Original older-file turret solids; scalar sections are not source contours.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { classicTurret, LECLERC_CLASSIC_X_DATUMS as D } from './leclercClassicXFrame.ts';
import { addLeclercClassicXRoofDetails, addLeclercClassicXMast } from './leclercClassicXRoofDetails.ts';
import { addLeclercClassicXRearRoof } from './leclercClassicXRearRoof.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylY } = KIT;
type Row = readonly [z: number, left: number, right: number, floor: number, crown: number];

function shell(P: TankBuilderPort): void {
  const rows: readonly Row[] = [
    [-2.050062, -1.13, 1.08, 1.708, 2.027],
    [-1.80, -1.539123, 1.512279, 1.698768, 2.144423],
    [-1.50, -1.716796, 1.613315, 1.693603, 2.147],
    [-1.0, -1.719405, 1.6215, 1.679833, 2.150],
    [-.5, -1.721646, 1.628530, 1.656542, 2.156],
    [0, -1.72071, 1.628530, 1.620634, 2.159457],
    [.5, -1.713592, 1.628530, 1.616592, 2.139668],
    [1, -1.655113, 1.585158, 1.613487, 2.123],
    [1.5, -1.46447, 1.509085, 1.613486, 2.046],
    [1.8, -1.20, 1.16, 1.613486, 1.996],
    [1.987, -1.046, .215, 1.613486, 1.946],
    [2.10, -.953, -.338, 1.613486, 1.898],
    [2.27, -.351, -.338, 1.613486, 1.628],
  ];
  const sections: SolidSection[] = rows.map(([z, left, right, low, high]) => {
    const halfBevel = Math.min(.16, (right - left) * .12);
    const upper = Math.min(.16, (high - low) * .34);
    const lower = Math.min(.035, (high - low) * .12);
    return { z, ring: [[left + .002, low], [right - .002, low],
      [right, low + lower], [right, high - upper], [right - halfBevel, high],
      [left + halfBevel, high], [left, high - upper * .55], [left, low + lower]] };
  });
  const g = sectionSolid(sections).translate(-D.turretPivot[0], -D.turretPivot[1], -D.turretPivot[2]);
  P.add('turret', g);
  // Source187 outer ring retains its distinct offset from fixed inner173.
  P.add('turret', cylY(.9046745, .9046745, .339363, 64),
    -.0122025 - D.turretPivot[0], 1.4772595 - D.turretPivot[1], .5652065 - D.turretPivot[2]);
}

function roofWell(P: TankBuilderPort): void {
  const rows = [-2.015811, -1.824477, -1.44932, -.574613];
  const leftRoof = (x: number, z: number) =>
    (2.462858013 - .0050957871 * x + .0059195366 * z) / .9999694956;
  const floor = (x: number, z: number) =>
    (2.41667891 - .0160283861 * x + .0106264052 * z) / .9998150681;
  const geometry = sectionSolid(rows.map(z => {
    const topLeft = leftRoof(-1.13076, z), topRight = leftRoof(-.2553, z);
    return { z, ring: [[-1.13076, 2.12], [-.2553, 2.12], [-.2553, topRight],
      [-.276, leftRoof(-.276, z)], [-.276, floor(-.276, z)], [-.66999, floor(-.66999, z)],
      [-.66999, leftRoof(-.66999, z)],
      [-1.13076, topLeft]] as [number, number][] };
  }));
  classicTurret(P, 'turretDetail', geometry);
  // Thin perimeter rails and actual crossbars preserve the open well.
  classicTurret(P, 'turretDetail', box(.034674, .097627, 1.433817), -.251476, 2.4032945, -1.2913895);
  classicTurret(P, 'turretDetail', box(.014045, .071119, 1.640289), -1.1375015, 2.4211055, -1.1956665);
  for (const z of [-1.80256, -1.714976])
    classicTurret(P, 'turretDetail', box(.937246, .024, .02572), -.687031, 2.452, z);
  for (let i = 0; i < 8; i++)
    classicTurret(P, 'turretDetail', box(.019305, .022, .765694), -.64252 + i * .03836, 2.446, -1.103672);
  classicTurret(P, 'turretDetail', box(.238798, .025, .707808), -.865866, 2.477, -1.09145);
}

function rearTerrace(P: TankBuilderPort): void {
  addLeclercClassicXRearRoof(P);
  addLeclercClassicXRoofDetails(P);
  classicTurret(P, 'turretDetail', cylY(.260346, .260346, .36, 48),
    .528603, 2.305961, .801433);
}

function mainSight(P: TankBuilderPort): void {
  // Object690 glass sits at1.8639945 behind the genuine forward hood.
  const x = -.576845, a = -.793, b = -.34487;
  classicTurret(P, 'turretDetail', box(b - a, .027, .621476), (a + b) / 2, 2.335583, 1.567796);
  classicTurret(P, 'turretDetail', box(b - a, .024, .621476), (a + b) / 2, 1.927, 1.567796);
  for (const edge of [a + .008, b - .008])
    classicTurret(P, 'turretDetail', box(.016, .396, .621476), edge, 2.131, 1.567796);
  classicTurret(P, 'turretDark', box(.412, .350, .010), x, 2.16296, 1.850371);
  classicTurret(P, 'turretGlass', box(.409991, .349139, .002), x, 2.16296, 1.8629945);
  // Supporting trunk ends behind the aperture, never across its mouth.
  classicTurret(P, 'turretDetail', box(.44813, .30, .35), (a + b) / 2, 2.080, 1.43);
}

function panoramicSight(P: TankBuilderPort): void {
  // Closed base/back and individual four mouth walls; a real 54 mm relief
  // remains in front of the source glass. No black painted solid aperture.
  classicTurret(P, 'turretDetail', box(.369353, .040682, .238232),
    .5438485, 2.487914, .789619);
  classicTurret(P, 'turretDetail', box(.364646, .352377, .051055),
    .541103, 2.6844435, .69608);
  for (const x of [.34465, .746])
    classicTurret(P, 'turretDetail', box(.017, .405, .3137), x, 2.6747, .8158);
  for (const y of [2.483, 2.875])
    classicTurret(P, 'turretDetail', box(.40135, .022, .3137), .545325, y, .8158);
  classicTurret(P, 'turretDark', box(.249, .315, .010), .574089, 2.684444, .90052);
  classicTurret(P, 'turretGlass', box(.245412, .308755, .002),
    .574089, 2.6844435, .918432);
  // Rear roof stock measured to source diameter; contacts the crew support.
  classicTurret(P, 'turretDetail', cylY(.195, .195, .075, 40), .545, 2.447, .79);
}

function stocks(P: TankBuilderPort): void {
  // Rectangular taper, not the full-height source AABB or round cones.
  const rows = [[2.299278, .063872, .075828], [2.399816, .0556705, .066251],
    [2.420782, .03767, .0495], [2.652791, .03026, .039767],
    [2.674, .0110755, .0230855], [3.03352, .008749, .0182365],
    [3.05, .004274, .0137575], [3.19835755241, .004274, .0137575]];
  for (const x of [1.0040145, -1.1669338]) {
    const g = sectionSolid(rows.map(([height, half, depth]) => ({ z: height,
      ring: [[-half, -depth], [half, -depth], [half, depth], [-half, depth]],
    }))).rotateX(-Math.PI / 2);
    classicTurret(P, 'turretDetail', g, x, 0, -1.1813242);
  }
  addLeclercClassicXMast(P);
}

export function addLeclercClassicXTurret(P: TankBuilderPort): void {
  shell(P); roofWell(P); rearTerrace(P); mainSight(P); panoramicSight(P); stocks(P);
  const spine = sectionSolid([
    { z: -.58187, ring: [[-.326219, 1.82], [.486785, 1.82],
      [.478, 2.311761], [-.326219, 2.311761]] },
    { z: 1.396768, ring: [[-.326219, 1.67], [.486785, 1.67],
      [.478, 2.300], [-.326219, 2.300]] },
    { z: 1.987917, ring: [[-.326219, 1.613923], [.486785, 1.613923],
      [.44, 2.18], [-.29, 2.18]] },
  ]);
  classicTurret(P, 'turretDetail', spine);
}
