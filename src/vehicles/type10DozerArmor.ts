// The Type 10 (Dozer)'s bolted appliqué (owner 2026-10-22: "side armor and turret armor"): the module datums the
// builder draws (profiles/type10DozerFieldKit.ts) and the spaced plates its spec carries (type10DozerSpecs.ts), from one
// table. Boot-light: plain data, no geometry. Hull modules in the hull frame, turret modules in the turret frame (its
// pivot at the origin). The faces they bolt to are the modern Type 10's (type10X.ts): the skirt face at x 1.575, the
// turret wall at x 1.476 below its roof shelf.
import { plate, type ArmorPlate } from './specHelpers.ts';

/** Hull skirt modules: inner face 3 mm off the skirt, `t` thick, y0..y1, each a [rear, front] z span; the front module's
 * lower front corner is raked to follow the skirt's leading edge (`rake`: front z at y0). */
export const TYPE10_DOZER_HULL_APPLIQUE = Object.freeze({
  x0: 1.578, t: 0.09, y0: 0.74, y1: 1.21,
  spans: Object.freeze([[2.48, 3.33], [1.56, 2.41], [0.64, 1.49], [-0.28, 0.57]] as const),
  rake: 3.05,
});

/** Turret modules: two on the wall forward of the field cage, and a cheek module along the wedge (inner line through
 * `cheek` [z, x] points, measured on the turret's cheek). */
export const TYPE10_DOZER_TURRET_APPLIQUE = Object.freeze({
  x0: 1.479, t: 0.10, y0: 0.08, y1: 0.42,
  spans: Object.freeze([[0.16, 0.60], [0.64, 1.08]] as const),
  cheek: Object.freeze([[1.12, 1.472], [1.45, 1.405], [1.80, 1.290]] as const),
});

const HULL_PROTECTION = { kind: 'spaced', keMm: 100, ceMm: 280 } as const;
const TURRET_PROTECTION = { kind: 'spaced', keMm: 140, ceMm: 360 } as const;

/** The spaced plates over each module's outer face, both sides. */
export function type10DozerAppliquePlates(): { hullPlates: ArmorPlate[]; turretPlates: ArmorPlate[] } {
  const H = TYPE10_DOZER_HULL_APPLIQUE, T = TYPE10_DOZER_TURRET_APPLIQUE;
  const hullPlates: ArmorPlate[] = [], turretPlates: ArmorPlate[] = [];
  const hx = H.x0 + H.t, tx = T.x0 + T.t;
  for (const [s, tag] of [[1, 'R'], [-1, 'L']] as const) {
    H.spans.forEach(([rear, front], i) => {
      const name = `type10_dozer_skirt_applique_${tag}${i}`;
      hullPlates.push(s > 0
        ? plate(name, 60, [hx, H.y0, front], [hx, H.y0, rear], [hx, H.y1, front], HULL_PROTECTION)
        : plate(name, 60, [-hx, H.y0, rear], [-hx, H.y0, front], [-hx, H.y1, rear], HULL_PROTECTION));
    });
    T.spans.forEach(([rear, front], i) => {
      const name = `type10_dozer_turret_applique_${tag}${i}`;
      turretPlates.push(s > 0
        ? plate(name, 80, [tx, T.y0, front], [tx, T.y0, rear], [tx, T.y1, front], TURRET_PROTECTION)
        : plate(name, 80, [-tx, T.y0, rear], [-tx, T.y0, front], [-tx, T.y1, rear], TURRET_PROTECTION));
    });
    for (let i = 0; i + 1 < T.cheek.length; i++) {
      const [[za, xa], [zb, xb]] = [T.cheek[i], T.cheek[i + 1]];
      // the cheek's outer face: the inner line pushed out along the face's own outward normal
      const len = Math.hypot(zb - za, xb - xa), nx = (zb - za) / len, nz = (xa - xb) / len;
      const a: [number, number] = [za + nz * T.t, xa + nx * T.t], b: [number, number] = [zb + nz * T.t, xb + nx * T.t];
      const name = `type10_dozer_cheek_applique_${tag}${i}`;
      turretPlates.push(s > 0
        ? plate(name, 80, [b[1], T.y0, b[0]], [a[1], T.y0, a[0]], [b[1], T.y1, b[0]], TURRET_PROTECTION)
        : plate(name, 80, [-a[1], T.y0, a[0]], [-b[1], T.y0, b[0]], [-a[1], T.y1, a[0]], TURRET_PROTECTION));
    }
  }
  return { hullPlates, turretPlates };
}
