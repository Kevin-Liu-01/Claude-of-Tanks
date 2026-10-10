/**
 * smokeFan.ts — the smoke-grenade launchers' fan law (2026-10-08, coordinator ruling on the smoke gap).
 *
 * A real launcher does not fire its grenades in parallel: each tube is set at its own angle, so one salvo lays a wall
 * across the frontal arc (the M1's M250 pair, the Leopard 2's and the Challenger's dischargers, Type 10, KF51, the
 * T-72 and T-80's 902 Tucha arcs). Many of the fleet's modelled launchers are drawn as parallel tubes, and their
 * apertures were taken as the launch directions: a 12-tube M1A2 salvo landed in two tight clusters 27 m apart, and 34 of
 * the 211 smoke-equipped vehicles left the line of sight dead ahead open at full growth.
 *
 * The law, per launcher side (the tubes of one owner frame — hull or turret — on one side of the centreline):
 *   - the tubes keep their modelled mouths, their count, their side and their elevations (each tube's own; floored at
 *     MIN_ELEVATION_DEG so a near-flat tube still lofts its grenade clear of the hull);
 *   - ordered from the innermost bore outward (bore azimuth, then the mouth's distance from the centreline, then its
 *     height and its station along the hull), each tube takes its own azimuth, spread evenly from the side's inner
 *     azimuth to its outer one;
 *   - the inner azimuth is the side's innermost bore, brought in to INNER_MAX_DEG when it points wider (the two sides'
 *     inner clouds then meet over the bow); the outer azimuth is the side's widest bore, widened when needed so the
 *     side's tubes stand at least MIN_STEP_DEG apart (each grenade lands on its own patch of the arc);
 *   - a family with a documented pattern sets its own arc (FAMILY_ARCS); the rest take this generic fan;
 *   - tubes on the centreline (no side) keep their bores; a launcher on one side only spreads across the bow.
 *
 * Pure data, no three: tools/vehicle-controls-inventory.mjs applies it to the mouths it reads off each model before it
 * writes src/vehicles/auxiliaryInventory.generated.ts, and the receipts re-derive it from the live bores.
 */

type Vec3 = readonly [number, number, number];
export interface SmokeMountLike { owner: 'hull' | 'turret'; position: Vec3; direction: Vec3 }

/** The generic fan: the inner azimuth's widest value, the least step between tubes, the elevation floor (degrees). */
const INNER_MAX_DEG = 8;
const MIN_STEP_DEG = 5;
const MIN_ELEVATION_DEG = 12;
/** a mouth within this of the centreline belongs to no side (m) */
const CENTRE_M = 0.15;

/** Documented launcher arcs (degrees off the bow, per side: inner, outer). */
interface FamilyArc { readonly pattern: RegExp; readonly inner: number; readonly outer: number; readonly note: string }
const FAMILY_ARCS: readonly FamilyArc[] = [
  // M1 family: two M250 six-tube launchers (M257 eight-tube on the early hulls), a salvo across ~120 degrees
  { pattern: /^(m1a1|m1a2|ua_m1a1|m1ip|m1e1|m1_)/, inner: 6, outer: 60, note: 'M250/M257 pair' },
  // Chieftain and Challenger: L8 five-barrel dischargers, one each side of the turret
  { pattern: /^(chieftain|challenger|vickers)/, inner: 6, outer: 58, note: 'L8 dischargers' },
  // Type 10: two four-tube launchers on the turret cheeks
  { pattern: /^type10/, inner: 6, outer: 54, note: 'Type 10 launchers' },
  // KF51 Panther: the turret's two four-tube banks
  { pattern: /^kf51/, inner: 6, outer: 56, note: 'KF51 banks' },
  // T-64/T-72/T-80/T-90 and their descendants: 902 Tucha arcs on the turret front
  { pattern: /(^|_)(t64|t72|t80|t84|t90|pt91|oplot|bmpt)/, inner: 5, outer: 52, note: '902 Tucha arcs' },
];

const DEG = Math.PI / 180;

/** The arc a vehicle's launchers follow: its family's, or null for the generic fan. */
export function smokeFanArc(id: string): { inner: number; outer: number } | null {
  for (const arc of FAMILY_ARCS) if (arc.pattern.test(id)) return { inner: arc.inner, outer: arc.outer };
  return null;
}

interface Tube { index: number; side: -1 | 0 | 1; az: number; el: number; x: number; y: number; z: number; owner: string }

/** The fanned launch directions for one vehicle's mounts (same order, same mouths, same owners). */
export function fanSmokeMounts<T extends SmokeMountLike>(id: string, mounts: readonly T[]): T[] {
  const tubes: Tube[] = mounts.map((m, index) => {
    const [x, y, z] = m.position;
    const [dx, dy, dz] = m.direction;
    const side: -1 | 0 | 1 = Math.abs(x) > CENTRE_M ? (x > 0 ? 1 : -1) : Math.abs(dx) > 0.05 ? (dx > 0 ? 1 : -1) : 0;
    return { index, side, az: Math.atan2(dx, dz), el: Math.atan2(dy, Math.hypot(dx, dz)), x, y, z, owner: m.owner };
  });
  const out = mounts.map((m) => ({ ...m, direction: [...m.direction] as unknown as Vec3 }));
  const family = smokeFanArc(id);
  const sides = new Set(tubes.filter((t) => t.side !== 0).map((t) => t.side));
  for (const owner of ['hull', 'turret']) {
    for (const side of [-1, 1] as const) {
      const group = tubes.filter((t) => t.owner === owner && t.side === side);
      if (!group.length) continue;
      // innermost first: the bore's own azimuth off the bow, then the mouth nearest the centreline, then low to high,
      // then front to back (a stable order for parallel tubes)
      group.sort((a, b) => Math.abs(a.az) - Math.abs(b.az) || Math.abs(a.x) - Math.abs(b.x) || a.y - b.y || b.z - a.z
        || a.index - b.index);
      const boreInner = Math.min(...group.map((t) => Math.abs(t.az))) / DEG;
      const boreOuter = Math.max(...group.map((t) => Math.abs(t.az))) / DEG;
      let inner = family ? family.inner : Math.min(Math.max(boreInner, 2), INNER_MAX_DEG);
      let outer = family ? Math.max(family.outer, inner) : Math.max(boreOuter, inner);
      if (group.length > 1) outer = Math.max(outer, inner + MIN_STEP_DEG * (group.length - 1));
      // a launcher on one side only spreads across the bow, so its own salvo closes it
      const lone = sides.size === 1;
      if (lone) inner = -inner;
      for (let k = 0; k < group.length; k++) {
        const t = group[k]!;
        const a = (group.length === 1 ? inner : inner + (outer - inner) * (k / (group.length - 1))) * DEG * side;
        const el = Math.max(t.el, MIN_ELEVATION_DEG * DEG);
        const c = Math.cos(el);
        out[t.index]!.direction = [round(Math.sin(a) * c), round(Math.sin(el)), round(Math.cos(a) * c)];
      }
    }
  }
  return out as T[];
}

const round = (v: number): number => +v.toFixed(4);
