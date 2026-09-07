// Original closed solids from the approved supplied-file scalar study.
// Source triangles, contour samples, textures and donor geometry are not inputs.
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { chieftainDeckSolid, chieftainHullSection } from './chieftainXFoundation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Row = readonly [z: number, low: number, roof: number, halfWidth: number, crown: number];
type DeckRow = readonly [z: number, inner: number, outer: number, low: number, top: number];

function tub(): ReturnType<typeof sectionSolid> {
  // Longitudinal transitions describe the stern plate, dished belly, bearing
  // carrier and three bow slopes. The final narrow nose is not a flat cap.
  const rows: readonly Row[] = [
    [-3.28771, .64715, 1.68240, .8053, 0],
    [-3.20, .534, 1.6818, .851, 0], [-3.03, .518, 1.6802, .851, 0],
    [-2.65, .5097, 1.6758, .850, 0], [-1.03, .5030, 1.6619, .846, 0],
    [-.95, .5028, 1.422, .846, 0], [.45, .4974, 1.412, .846, 0],
    [1.25, .4943, 1.409, .846, 0], [1.65, .4927, 1.523, .846, .075],
    [2.15, .4908, 1.393, .846, .090], [2.57, .4891, 1.324, .846, .118],
    [2.73, .5027, 1.265, .871, .023], [3.02, .7466, 1.141, .915, .026],
    [3.163, .867, 1.0783, .937, .018], [3.24, .9318, 1.0307, .59, .013],
    [3.28771, .9867, .9968, .004, 0],
  ];
  return sectionSolid(rows.map(([z, low, roof, half, crown]): SolidSection => {
    const outer = z > 2.73 ? half : .978;
    const sideLow = Math.min(roof - .003, low + Math.min(.085, (roof - low) * .28));
    const elbow = Math.min(roof - crown - .005, 1.049);
    // Complete-source transverse rays give X.961934 at Y1.05 and X.973928
    // at Y1.18 near the bearing. The lower wall is not a vertical .978 slab.
    const lowerX = z >= -.95 && z <= 2.73 ? .961934 + Math.max(0, z) * .00147 : outer;
    const upperY = Math.max(elbow + .0005, Math.min(roof - crown - .001, 1.241));
    return chieftainHullSection(z, [[0, low], [half, sideLow],
      [lowerX, Math.max(sideLow + .001, elbow)], [outer, upperY],
      [outer, roof - crown], [half * .47, roof - crown * .30], [0, roof]]);
  }));
}

function deck(rows: readonly DeckRow[], side: number, crossfall = .064): ReturnType<typeof sectionSolid> {
  return chieftainDeckSolid(rows, side, crossfall);
}

function sponsons(P: TankBuilderPort, side: number): void {
  const rear: readonly DeckRow[] = [
    [-3.31, .90, 1.423, 1.235, 1.677], [-2.67, .90, 1.425, 1.235, 1.674],
    [-1.04, .90, 1.423, 1.241, 1.661], [-.96, .90, 1.423, 1.241, 1.543],
    [.27, .90, 1.423, 1.245, 1.536], [.95, .90, 1.344, 1.247, 1.533],
    [1.32, .90, 1.169, 1.249, 1.529],
  ];
  P.add('hull', deck(rear, side));
  // Permanent horizontal fender skin, separate from its much taller inboard
  // stowage/armor shoulders. This leaves genuine air under the overhang.
  const fenderRows = [
    [-3.40, .955, 1.575, 1.174, 1.252], [-3.18, .976, 1.620, 1.242, 1.301],
    [-1.00, .976, 1.620, 1.244, 1.304], [1.00, .976, 1.620, 1.250, 1.307],
    [2.92, .976, 1.620, 1.272, 1.308], [3.13, .955, 1.620, 1.262, 1.291],
    [3.38, .950, 1.618, 1.205, 1.239], [3.487, .950, 1.570, 1.054, 1.111],
  ] as const;
  P.addMudguard(`chieftain5_x_source_fender_${side}`, 'hullDetail', deck(fenderRows, side, .002));
}

function skirt(P: TankBuilderPort, side: number, back: number, front: number,
  outer: number, low: number, top: number, endLow?: number): void {
  const rows = [[back, low], [front, endLow ?? low]];
  P.addExternalArmor('hull', sectionSolid(rows.map(([z, bottom]) => {
    const a = side * outer, b = side * (outer - .0179);
    return { z, ring: [[Math.min(a, b), bottom], [Math.max(a, b), bottom],
      [Math.max(a, b), top], [Math.min(a, b), top]] };
  })));
}

function skirts(P: TankBuilderPort, side: number): void {
  skirt(P, side, -3.24738, -2.77, 1.64430, .881, 1.29877, .588);
  skirt(P, side, -2.77, -1.8787, 1.64430, .588, 1.29877);
  skirt(P, side, -1.8787, -.0547, 1.64341, .58709, 1.30236);
  skirt(P, side, -.0547, 1.8464, 1.64162, .58530, 1.30594);
  skirt(P, side, 1.8464, 2.785, 1.63893, .58440, 1.30684);
  skirt(P, side, 2.785, 3.20525, 1.63893, .58440, 1.30684, .881);
  for (const z of [-3.0807, -2.0172, -1.6425, -.3872, .1273, 1.6331, 1.9051, 2.7974]) {
    P.addEquipment('hullDetail', KIT.box(.0108, .0860, .0845),
      side * 1.6289, 1.3413, z);
    P.addEquipment('hullDetail', KIT.box(.115, .014, .047),
      side * 1.587, 1.316, z);
  }
}

export function addChieftain5XSourceHull(P: TankBuilderPort): void {
  P.add('hull', tub());
  for (const side of [-1, 1]) {
    sponsons(P, side);
    skirts(P, side);
  }
}
