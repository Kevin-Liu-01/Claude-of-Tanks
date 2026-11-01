import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';

// One set of authored stations owns both the original curved roof and its
// fitted outer return. The toe narrows only beyond the forward track bend.
// 267 fix 2 (the blind A/B, both critics, round 2: the 266 A guard won on the T-90A, the obr. 2004 and the Burlak, "a
// fuller rounded hood with a visible front flange", against the 267 sheet's "thin curved sliver"; in round 1 the critics
// had not called it an oversized wedge): the A hull's bow guard and its fitted outer return are the 266 build's exactly.
// The pressed-sheet helpers below stay for the T-90M bow guard (t90MXHullEnds.ts).
const T90A_FRONT_GUARD_ROWS: readonly (readonly [number, number, number])[] = [
  [3.180,1.278,1.827],[3.300,1.265,1.827],[3.400,1.247,1.827],
  [3.500,1.216,1.826],[3.590,1.161,1.825],[3.685,1.071,1.825],[3.782,.857,1.698],
];
const BOW_RETURN_DEPTH_M = [.28,.27,.25,.21,.16,.10,.026] as const;
const mirror = (side: number, ring: SolidSection['ring']): SolidSection['ring'] =>
  side > 0 ? ring : ring.map(([x,y]) => [-x,y] as const).reverse();

/** One station of a pressed sheet mudguard (267, S1: "the bow mudguards read as oversized wedges"): a sheet `thick` thick
 * whose top runs out from `inner` and rolls over a `roll` radius at `outer` into a short turned-down lip, `drop` below the
 * top. The T-90M X bow guard's (t90MXHullEnds.ts). */
export type SheetGuardStation = readonly [z: number, top: number, inner: number, outer: number, roll: number, drop: number,
  thick: number];
export function sheetGuardSection(side: number, [z, top, inner, outer, roll, drop, thick]: SheetGuardStation): SolidSection {
  if (!(roll > thick + .001 && drop > roll + .002 && outer - roll > inner + .01))
    throw new Error('sheet guard station: roll must exceed the sheet, the lip the roll, and the top run the roll');
  const arc = (r: number, angles: readonly number[]) => angles.map((a) => [outer - roll + r * Math.cos(a),
    top - roll + r * Math.sin(a)] as const);
  const ring: SolidSection['ring'] = [
    [inner, top - thick], [outer - roll, top - thick], ...arc(roll - thick, [Math.PI / 3, Math.PI / 6]),
    [outer - thick, top - roll], [outer - thick, top - drop], [outer, top - drop], [outer, top - roll],
    ...arc(roll, [Math.PI / 6, Math.PI / 3]), [outer - roll, top], [inner, top],
  ];
  return { z, ring: mirror(side, ring) };
}

/** Underside height of a sheet guard (and the toe flap that follows it) at station z and |x|: the flat run, or the roll. */
export function sheetUnderside(guard: readonly SheetGuardStation[], toe: readonly SheetGuardStation[], z: number, x: number): number {
  // over the hinge the flap tucks under the sheet's front edge: ahead of the sheet the flap is what hangs there
  const rows = z <= guard[guard.length - 1][0] ? guard : toe;
  let i = 1; while (i < rows.length - 1 && z > rows[i][0]) i++;
  const a = rows[i - 1], b = rows[i], t = Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0])));
  const [, top, , outer, roll, , thick] = a.map((v, k) => v + (b[k] - v) * t) as unknown as SheetGuardStation;
  const dx = Math.abs(x) - (outer - roll), r = roll - thick;
  return dx <= 0 ? top - thick : top - roll + Math.sqrt(Math.max(0, r * r - Math.min(dx, r) ** 2));
}

export function addT90AXFrontGuard(P: TankBuilderPort, side: number): void {
  const sections = T90A_FRONT_GUARD_ROWS.map(([z,top,outer]): SolidSection => ({
    z, ring: mirror(side, [[1.097,top-.014],[outer,top-.014],[outer,top],[1.097,top]]),
  }));
  P.addMudguard('t90a-x-bow','hull',sectionSolid(sections));
}

/** Closed bent sheet bridging the original upper shelf and skirt root.
 * The outer return is outside the complete moving shoe, not a filled wheel
 * bay. Its 15 mm shelf overlaps the existing shelf by 8.5 mm; the 18 mm
 * vertical lip overlaps the skirt root by 5 mm. Lower wheels stay exposed.
 */
export function addT90AXFenderClosures(P: TankBuilderPort): void {
  const profile: readonly (readonly [number, number])[] = [
    [1.684,1.2765],[1.795,1.2765],[1.795,1.1394],
    [1.813,1.1394],[1.813,1.2915],[1.684,1.2915],
  ];
  for (const side of [-1,1]) {
    const ring = mirror(side, profile);
    P.addMudguard('t90a-x-upper-skirt-return','hullFixedPaintedBodywork',
      sectionSolid([{z:-3.19,ring},{z:3.19,ring}]));
    const bow = T90A_FRONT_GUARD_ROWS.map(([z,top,outer], i): SolidSection => ({
      z, ring: mirror(side, [[outer-.018,top-BOW_RETURN_DEPTH_M[i]],
        [outer,top-BOW_RETURN_DEPTH_M[i]],[outer,top-.006],[outer-.018,top-.006]]),
    }));
    // Eight millimetres of finite roof overlap, not coplanar cover faces.
    // The aft end laps the long skirt return; the toe tapers with the roof.
    P.addMudguard('t90a-x-bow-side-return','hullFixedPaintedBodywork',sectionSolid(bow));
  }
}
