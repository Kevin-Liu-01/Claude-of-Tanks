import type { ExternalWeaponStock } from '../sim/armor.ts';
import type { AnatomyWeaponReceipt } from './combatAnatomyCalibrationRegistry.ts';

type Point = readonly [number, number, number];
const point = (p: readonly number[]): Point => [p[0], p[1], p[2]];

/** Compile offline native stock into renderer-free, demand-loaded hitboxes. */
export function prepareWeaponCollision(receipts: readonly AnatomyWeaponReceipt[] = []): ExternalWeaponStock[] {
  return receipts.map((part, i) => ({
    min: point(part.min), max: point(part.max), module: part.module,
    turretLocal: part.turretLocal, gunFollow: part.gunFollow,
    plates: part.faces.map(face => {
      const verts = face.map(index => point(part.vertices[index]));
      return { name: `weapon_${part.module}_${i}`, verts, physicalMm: part.armorMm,
        keMm: part.armorMm, ceMm: part.armorMm, kind: 'external',
        moduleLink: part.module, weaponHousing: true, gunFollow: part.gunFollow,
        convexPolygon: true,
        traceBounds: {
          min: point([0,1,2].map(axis => Math.min(...verts.map(v => v[axis])) - .000001)),
          max: point([0,1,2].map(axis => Math.max(...verts.map(v => v[axis])) + .000001)),
        } };
    }),
  }));
}
