// The Type 10 marks' added armour (267; owner 2026-11-01, "different ... armor"; Main's ruling the same day: armour that
// reads as armour is armour, with its own plates). The datums the builders draw (profiles/japan.ts) and the plates the
// specs carry (type10FamilyFrames.ts), from one table, as type90bArmor.ts does for the Type 90 (B)'s roller plate.
// Boot-light: plain data and the plate helper, no geometry. Hull frame (metres); turret plates are returned in the
// turret's frame about the Type 10's pivot.
//
// Values, each a fleet precedent for the same class of package:
// - the TK-X's trial cheek modules: bolt-on composite boxes over the cheeks, the Leopard 2A5's bolt-on cheek chevrons'
//   values (turret_chevron_*: 90 mm spaced, KE 220, CE 750);
// - the TK-X's glacis trial plate: 40 mm of bolted rolled steel, spaced over the glacis (KE and CE its thickness);
// - the 10B's add-on wedges: the Leopard 2A5/2A6 add-on wedge module's values (turret_wedge_*: 90 mm spaced, KE 279,
//   CE 953), the same class of upgrade package.
import { plate, type ArmorPlate, type Vec3Tuple } from './specHelpers.ts';

/** The Type 10's turret pivot (profiles/type10X.ts PIVOT): turret plates are kept about it. */
const PIVOT = [-0.00276, 1.50832, 0.20655] as const;

/** The TK-X's trial module over each cheek, |x| xi..xo, y y0..y1, z z0..z1 (its front face at z1). */
export const TKX_TRIAL_MODULE = Object.freeze({ xi: 0.49, xo: 1.40, z0: 1.62, z1: 2.56, y0: 1.57, y1: 2.15 });
/** The TK-X's glacis trial plate: 1.50 x 0.62 m, 40 mm, centred at z 2.93 on the glacis (1.370 -> 1.3065 over z 2.50..3.3137). */
export const TKX_GLACIS_PLATE = Object.freeze({ halfW: 0.75, z0: 2.62, z1: 3.24, t: 0.04 });
/** The glacis' top line under the trial plate. */
export const tkxGlacisY = (z: number): number => 1.339 - (z - 2.898) * ((1.370 - 1.3065) / (3.3137 - 2.50));
/** The 10B's wedge over each cheek, as stations [z, |x| inner, |x| outer, y low, y high] from the cheek's face to its nose. */
export const TYPE10B_WEDGE_ROWS = Object.freeze([
  [1.62, 0.49, 1.42, 1.58, 2.15], [2.30, 0.62, 1.18, 1.61, 2.11], [2.86, 0.84, 0.94, 1.68, 1.98],
] as const);
/** The foot under the Type 10's nose (267, the shrink-only roof-pocket ledger): a mark's add-on beside the mantlet walled
 *  the air under the nose's sloped underside, a slot that read as a see-through pocket. The foot fills it flush with the
 *  nose's tip from the mantlet's side (|x| xinL; on the right the coaxial recess's wall, xinR) to the add-on (xo), y y0..y1,
 *  z z0..z1. */
const NOSE_FOOT = { xinL: 0.20, xinR: 0.50, y0: 1.62, y1: 1.80, z0: 2.22, z1: 2.49 } as const;
/** The 10B's wedges' foot, both sides. */
export const TYPE10B_WEDGE_FOOT = Object.freeze({ ...NOSE_FOOT, xo: 0.70 });
/** The TK-X's trial module's foot, the left only: on the right the recess's wall meets the module's inner face (0.49). */
export const TKX_MODULE_FOOT = Object.freeze({ ...NOSE_FOOT, xo: 0.52 });

const CHEVRON = { kind: 'spaced', keMm: 220, ceMm: 750 } as const;
const WEDGE = { kind: 'spaced', keMm: 279, ceMm: 953 } as const;

const local = ([x, y, z]: Vec3Tuple): Vec3Tuple => [x - PIVOT[0], y - PIVOT[1], z - PIVOT[2]];

/** A plate through v0, v1 and v3 whose normal looks along `out`. */
function facing(name: string, mm: number, v0: Vec3Tuple, v1: Vec3Tuple, v3: Vec3Tuple, out: Vec3Tuple,
  o: Parameters<typeof plate>[5]): ArmorPlate {
  const a = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]], b = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? plate(name, mm, v0, v1, v3, o) : plate(name, mm, v0, v3, v1, o);
}

/** The TK-X's trial cheek modules (turret frame: front, top, outer and inner faces a side, the left one's foot) and its
 *  glacis plate (hull). */
export function tkxTrialPlates(): { turret: ArmorPlate[]; hull: ArmorPlate[] } {
  const { xi, xo, z0, z1, y0, y1 } = TKX_TRIAL_MODULE, turret: ArmorPlate[] = [];
  for (const s of [-1, 1]) {
    const tag = s > 0 ? 'R' : 'L', p = (x: number, y: number, z: number): Vec3Tuple => local([s * x, y, z]);
    turret.push(
      facing(`tkx_trial_module_${tag}`, 90, p(xi, y0, z1), p(xo, y0, z1), p(xi, y1, z1), [0, 0, 1], CHEVRON),
      facing(`tkx_trial_module_${tag}`, 90, p(xi, y1, z0), p(xo, y1, z0), p(xi, y1, z1), [0, 1, 0], CHEVRON),
      facing(`tkx_trial_module_${tag}`, 90, p(xo, y0, z0), p(xo, y0, z1), p(xo, y1, z0), [s, 0, 0], CHEVRON),
      facing(`tkx_trial_module_${tag}`, 90, p(xi, y0, z0), p(xi, y0, z1), p(xi, y1, z0), [-s, 0, 0], CHEVRON));
  }
  const F = TKX_MODULE_FOOT, foot = (x: number, y: number, z: number): Vec3Tuple => local([-x, y, z]);
  turret.push(facing('tkx_trial_module_L', 90, foot(F.xinL, F.y0, F.z1), foot(F.xo, F.y0, F.z1), foot(F.xinL, F.y1, F.z1), [0, 0, 1], CHEVRON));
  const { halfW, z0: g0, z1: g1, t } = TKX_GLACIS_PLATE;
  const hull = [facing('tkx_glacis_trial_plate', 40, [-halfW, tkxGlacisY(g0) + t, g0], [halfW, tkxGlacisY(g0) + t, g0],
    [-halfW, tkxGlacisY(g1) + t, g1], [0, 1, 0], { kind: 'spaced' })];
  return { turret, hull };
}

/** The 10B's add-on wedges (turret frame): each face between two stations, outer, inner and top, the nose and the foot. */
export function type10bWedgePlates(): ArmorPlate[] {
  const out: ArmorPlate[] = [], R = TYPE10B_WEDGE_ROWS;
  for (const s of [-1, 1]) {
    const tag = s > 0 ? 'R' : 'L', name = `type10b_wedge_${tag}`, p = (x: number, y: number, z: number): Vec3Tuple => local([s * x, y, z]);
    for (let k = 0; k < R.length - 1; k++) {
      const [za, ia, oa, la, ha] = R[k], [zb, ib, ob, lb, hb] = R[k + 1];
      out.push(
        facing(name, 90, p(oa, la, za), p(ob, lb, zb), p(oa, ha, za), [s, 0, 1], WEDGE),
        facing(name, 90, p(ia, la, za), p(ib, lb, zb), p(ia, ha, za), [-s, 0, 1], WEDGE),
        facing(name, 90, p(ia, ha, za), p(oa, ha, za), p(ib, hb, zb), [0, 1, 0], WEDGE));
    }
    const [zn, inn, on, ln, hn] = R[R.length - 1];
    out.push(facing(name, 90, p(inn, ln, zn), p(on, ln, zn), p(inn, hn, zn), [0, 0, 1], WEDGE));
    const F = TYPE10B_WEDGE_FOOT, xin = s > 0 ? F.xinR : F.xinL;
    out.push(facing(name, 90, p(xin, F.y0, F.z1), p(F.xo, F.y0, F.z1), p(xin, F.y1, F.z1), [0, 0, 1], WEDGE));
  }
  return out;
}
