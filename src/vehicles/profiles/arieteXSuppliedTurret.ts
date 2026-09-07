// Original source-scalar Ariete turret. Frontal sight depression, gun throat
// and rising rear underside are explicit solids/air, not dark decals.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { ARIETE_SUPPLIED_X_DATUMS as D, arieteSourceTurret as add } from './arieteXSuppliedFrame.ts';
import { arietePlaneStock, arieteForePlanes, type ArietePlane } from './arieteXSuppliedArmor.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylY } = KIT;

type RoofStation = readonly [z: number, bottom: number, crown: number, edge: number];
function rearShell(P: TankBuilderPort): void {
  const rows: readonly RoofStation[] = [[-1.612388, 1.609024, 2.101908, 2.0174],
    [-1.10, 1.598, 2.0785, 2.015], [-.90, 1.4814, 2.0766, 2.0136],
    [-.689702, 1.356694, 2.0756, 2.0122], [.393635, 1.356694, 2.063218, 2.0043],
    [.545033, 1.356694, 2.059, 1.995]];
  const sections: SolidSection[] = rows.map(([z, bottom, crown, edge]) => ({ z,
    ring: [[-1.118, bottom], [1.118, bottom], [1.118, edge],
      [.408, crown - .012], [-.370, crown], [-.923, crown - .035], [-1.118, edge]],
  }));
  const shell = sectionSolid(sections).translate(-D.turretPivot[0], -D.turretPivot[1], -D.turretPivot[2]);
  P.add('turret', shell);
  // The visible lower bearing occupies the true hull well. The inner ring
  // wall is original inferred stock, not a solid disk across the well.
  const bearing = new THREE.LatheGeometry([[.683, 1.306228], [.74185, 1.306228],
    [.74185, 1.3575], [.683, 1.407], [.683, 1.306228]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 64);
  add(P, 'turret', bearing, 0, 0, .328029);
}

function foreCheek(P: TankBuilderPort, side: -1 | 1): void {
  // Intersections of actual roof, front, lower and lip planes eliminate the
  // draft's diagonal ridges. Port sight shelf is a real depressed surface.
  for (const [inner, outer] of [[.203546, .374289], [.374289, .985769], [.985769, 1.118]]) {
    const planes = arieteForePlanes(side < 0 ? -outer : inner, side < 0 ? -inner : outer);
    const center = outer < .4;
    const roof: ArietePlane = center ? [-.00225784, .998026338, .062756117, -2.089986113]
      : side < 0 && outer < 1 ? [.001292976, .998104248, .061532410, -1.928610690]
        : [side * .098527762, .993403061, .058673999, -2.112812741];
    const front: ArietePlane = center ? [0, .787566602, .616226037, -2.428220880]
      : [side * .3353845, .741495078, .581121576, -2.413526348];
    planes.push(roof, front);
    if (!center) planes.push([side * .443911178, -.008558941, .896029916, -1.905472784]);
    add(P, 'turret', arietePlaneStock(planes));
  }
}

function centralBridge(P: TankBuilderPort): void {
  // Circular throat over the measured axis. A continuous original rear stock
  // carries the gun bearing; only the forward annular portion is open.
  const half = .203546, radius = .2165833, axis = D.trunnion[1];
  for (let i = 0; i < 28; i++) {
    const a = -half + 2 * half * i / 28, b = -half + 2 * half * (i + 1) / 28;
    const ya = axis + Math.sqrt(radius ** 2 - a ** 2), yb = axis + Math.sqrt(radius ** 2 - b ** 2);
    const slope = (yb - ya) / (b - a), intercept = ya - slope * a;
    const planes = arieteForePlanes(a, b);
    planes.push([slope, -1, 0, intercept],
      [-.00225784, .998026338, .062756117, -2.089986113],
      [0, .787566602, .616226037, -2.428220880]);
    add(P, 'turret', arietePlaneStock(planes));
  }
  add(P, 'turret', box(.392, .048, .62), 0, 1.381, .848);
}

function sideArmor(P: TankBuilderPort, side: -1 | 1): void {
  const station = (z: number, roof: number, outer: number): SolidSection => {
    const ring: [number, number][] = [[1.134644, 1.418935], [outer, 1.418935],
      [outer, roof - .078], [Math.min(1.30707, outer - .003), roof],
      [1.29109, roof - .00084], [1.134644, roof - .12196]];
    return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring };
  };
  for (const [a, b] of [[-.104296, .199], [.205, .512], [.518, .833]])
    add(P, 'turretExternalArmor', sectionSolid([station(a, 1.967332, 1.443327), station(b, 1.967332, 1.443327)]));
  // The forward return is a falling wedge, not another rectangular cassette.
  const wedge = arietePlaneStock([
    [-side, 0, 0, 1.134644], [side, 0, 0, -1.443327],
    [0, -1, 0, 1.418935], [0, 0, -1, .84], [0, 0, 1, -1.539212],
    [-side * .626816, .779167, 0, -.722951],
    [side * .511188, .859469, 0, -2.359019],
    [side * .361481, .727789, .5828, -2.398172],
  ]);
  add(P, 'turretExternalArmor', wedge);
  // Source cassettes stand16mm outside the primary body: small actual carriers
  // bridge that space at their rear upper mounting line, never a full filler.
  for (const z of [-.064, .245, .559, .843]) {
    add(P, 'turretDetail', box(.062, .072, .040), side * 1.126, 1.902, z);
    add(P, 'turretDetail', box(.090, .028, .052), side * 1.168, 1.946, z);
  }
}

function aftCarry(P: TankBuilderPort): void {
  add(P, 'turretDetail', box(2.191906, .014298, .52118), 0, 1.622902, -1.865117);
  add(P, 'turretDetail', box(2.191906, .37513, .027756), 0, 1.817616, -2.104011);
  for (const side of [-1, 1]) add(P, 'turretDetail', box(.021, .373, .51), side * 1.085453, 1.817, -1.865);
  add(P, 'turretDetail', box(1.902568, .347374, .185883), 0, 1.816355, -2.21083);
  for (const side of [-1, 1]) {
    add(P, 'turretDetail', cylY(.035, .035, .365, 16), side * 1.073, 1.815, -2.129);
  }
}

export function addArieteXSuppliedTurret(P: TankBuilderPort): void {
  rearShell(P); centralBridge(P);
  for (const side of [-1, 1] as const) { foreCheek(P, side); sideArmor(P, side); }
  aftCarry(P);
}
