// Spaced combat plates on the owner-requested AMX 56 field kit's thick folded
// side modules (6e8c2fbd3). Each plate is one actual triangle of the visual loft,
// in sectionSolid's own order, on the faces that look away from the hull. The
// open lower slat screens keep no invisible solid armor, the AMX-10P 25 kit's
// rule (amx10pSpecs.ts). Like every bolt-on kit the modules never resize the
// retained structural armor envelope (armorFitDimensions keeps the 3.6 m frame),
// and the original source skirt faces stay the inner layer behind them.
import type { FleetTankSpec } from './specContracts.ts';
import { plate, type Vec3Tuple } from './specHelpers.ts';
import {
  AMX56_KIT_EXPOSED_SEGMENTS, AMX56_KIT_SIDE_STATIONS, amx56KitRightSegment, amx56KitSideRing,
} from './leclercClassicXKitLayout.ts';

export const AMX56_KIT_SURFACE_GROUP = 'amx56:fieldKit';
// The AMX-10P 25 standoff kit's protection family (amx10pSpecs.ts): a balance
// convention for the same owner-requested kit design, not source evidence.
const PROTECTION = { physicalMm: 8, keMm: 15, ceMm: 30 } as const;

export function applyLeclercClassicXFieldKitArmor(spec: FleetTankSpec): void {
  // Idempotent: a repeated authored-frame pass replaces, never duplicates.
  spec.armor.hullPlates = spec.armor.hullPlates.filter(p => !p.surfaceGroup?.startsWith(`${AMX56_KIT_SURFACE_GROUP}:`));
  for (const side of [-1, 1]) {
    const rings = AMX56_KIT_SIDE_STATIONS.map((_, station) => amx56KitSideRing(side, station));
    const point = (station: number, i: number): Vec3Tuple =>
      [rings[station][i][0], rings[station][i][1], AMX56_KIT_SIDE_STATIONS[station][0]];
    for (let station = 0; station < AMX56_KIT_SIDE_STATIONS.length - 1; station++) {
      for (let k = 0; k < rings[station].length; k++) {
        const segment = amx56KitRightSegment(side, k);
        if (!AMX56_KIT_EXPOSED_SEGMENTS.includes(segment)) continue;
        const j = (k + 1) % rings[station].length;
        // sectionSolid: tri(s,i | s,j | s+1,j) and tri(s,i | s+1,j | s+1,i).
        const triangles: Vec3Tuple[][] = [
          [point(station, k), point(station, j), point(station + 1, j)],
          [point(station, k), point(station + 1, j), point(station + 1, k)],
        ];
        triangles.forEach((verts, triangle) => {
          const surface = plate(`skirt_${side < 0 ? 'L' : 'R'}_field_kit_${station}_${segment}_${triangle}`,
            PROTECTION.physicalMm, verts[0], verts[1], verts[2],
            { kind: 'spaced', keMm: PROTECTION.keMm, ceMm: PROTECTION.ceMm });
          surface.verts = verts;
          surface.convexPolygon = true;
          surface.surfaceGroup = `${AMX56_KIT_SURFACE_GROUP}:${side}`;
          spec.armor.hullPlates.push(surface);
        });
      }
    }
  }
}
