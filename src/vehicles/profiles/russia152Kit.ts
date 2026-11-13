// Shared construction for the Russian 152 mm line's own hulls (release 269: the Object 195, profiles/object195X.ts, and
// the Object 477 Molot, profiles/object477Molot.ts): the closed hull tub, its skirt panels, and the 30 mm cannon both
// carry beside the 152 mm gun (the 195's 2A42, the Molot's GSh-30). First-party procedural geometry: Kevin B. Liu
// (NOTICE.md).
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { beginAuxiliaryStation } from './auxiliaryStation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;

/**
 * One hull station: [z, roof, bottom, outer half-width, inner half-width, sponson floor]. The tub between the tracks runs
 * from the belly to the sponson floor, the sponsons over the tracks from there to the roof (the inner wall stands
 * vertical, clear of the return run). The sponson's top stays at least 4 cm thick under a falling glacis.
 */
export type HullStation = readonly [number, number, number, number, number, number];

function tubSection([z, roof, bottom, outer, inner, step]: HullStation): SolidSection {
  const s = Math.min(step, roof - .04);
  return { z, ring: [[-inner, bottom], [inner, bottom], [inner, s], [outer, s], [outer, roof - .035], [outer - .08, roof],
    [-outer + .08, roof], [-outer, roof - .035], [-outer, s], [-inner, s]] };
}

/** The closed hull tub through its stations (strictly increasing z). */
export function addHullTub(P: TankBuilderPort, stations: readonly HullStation[]): void {
  P.add('hull', sectionSolid(stations.map(tubSection)));
}

/** A solid through its stations on the left (s > 0), or mirrored onto the right (s < 0) with its rings kept counter-clockwise. */
export function sideSolid(sections: readonly SolidSection[], s: number): ReturnType<typeof sectionSolid> {
  return sectionSolid(s > 0 ? sections : sections.map((section) => ({ ...section,
    ring: section.ring.map(([x, y]): SectionPoint => [-x, y]).reverse() })));
}

/** A run of skirt panels at |x| = `x` from `z0` to `z1` (n panels, each with a recessed grab handle and a bolt row). */
export function addSkirtPanels(P: TankBuilderPort, o: { x: number; z0: number; z1: number; y0: number; y1: number;
  n: number; th: number; bucket?: string }): void {
  const len = (o.z1 - o.z0) / o.n;
  for (const side of [-1, 1]) for (let i = 0; i < o.n; i++) {
    const z = o.z0 + len * (i + .5);
    P.add(o.bucket ?? 'hull', box(o.th, o.y1 - o.y0, len - .02), side * o.x, (o.y0 + o.y1) / 2, z);
    P.addEquipment('hullDark', box(.012, .05, .16), side * (o.x + o.th / 2 + .004), o.y0 + .18, z);
    P.addEquipment('hullDetail', box(.016, .022, len - .10), side * (o.x + o.th / 2 + .006), o.y1 - .05, z);
  }
}

/**
 * A 30 mm cannon on its own trunnions beside the main gun (turret frame): a bearing on the deck, the yoke, the receiver
 * with its ammunition box, the barrel and its flash hider. A working auxiliary station (auxiliaryWeapons.ts gives the
 * line's ids the 3UBR6 round).
 */
export function add30mmCannon(P: TankBuilderPort, o: { name: string; x: number; deck: number; z: number; axisY: number;
  pivotZ: number; muzzleZ: number; yawArc?: readonly [number, number]; depressionByYaw?: readonly (readonly [number, number])[] }): void {
  const { x, deck, z, axisY, pivotZ, muzzleZ } = o;
  P.addEquipment('turretDetail', cylY(.20, .23, .06, 20), x, deck + .015, z);
  const station = beginAuxiliaryStation(P, { name: o.name, caliberMm: 30,
    yaw: [x, deck + .045, z], pivot: [x, axisY, pivotZ], muzzle: [x, axisY, muzzleZ] });
  // a measured traverse and depression keep the barrel out of the vehicle's own stock (tools/roof-station-arcs.mjs)
  if (o.yawArc) station.root.userData.yawArc = [...o.yawArc];
  if (o.depressionByYaw) station.root.userData.depressionByYaw = o.depressionByYaw.map(([y, d]) => [y, d]);
  P.addEquipment('turretDetail', cylY(.16, .18, .07, 20), x, deck + .08, z);
  for (const side of [-1, 1]) P.addEquipment('turretDetail', box(.05, axisY - deck - .05, .20), x + side * .17, (axisY + deck) / 2 + .03, pivotZ);
  station.mark('yaw');
  P.add('turretDark', cylX(.055, .40, 16), x, axisY, pivotZ);
  P.addEquipment('turretDetail', box(.20, .20, .62), x, axisY, pivotZ - .10);
  P.addEquipment('turretDetail', box(.16, .18, .26), x - .19, axisY - .02, pivotZ - .18);
  P.add('turretDark', box(.17, .03, .24), x - .19, axisY + .085, pivotZ - .18);
  P.add('turretDark', cylZ(.06, .22, 16), x, axisY, pivotZ + .32);
  const barrel = muzzleZ - .08 - (pivotZ + .43);
  P.add('turretDark', cylZ(.036, barrel, 14), x, axisY, pivotZ + .43 + barrel / 2);
  P.add('turretDark', cylZ(.050, .10, 14), x, axisY, muzzleZ - .05);
  station.mark('pitch');
}
