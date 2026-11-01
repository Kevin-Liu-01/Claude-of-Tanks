import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { KIT } from './kit.ts';

// The bow guard keeps its measured crown and plan (z, top, outer: the toe narrows only beyond the forward track bend).
// 267 (S1, blind critics: "the bow mudguards read as oversized wedges jutting forward over the tracks"; the 28 cm outer
// return wall under the 73 cm shelf read as one solid wedge): the guard is the oracle's two parts. A 14 mm pressed sheet
// on the measured crown rolls over a 10 cm shoulder into a 2.5 cm lip (the oracle guard's chamfered shoulder, 1.69 to
// 1.826 m across and 10-12 cm down); from the hinge at z 3.59 the toe is a separate flap down the steep nose; under the
// roll hangs the oracle's separate front skirt panel, 19 mm inboard of the lip, to its measured low edge, hemmed in
// rubber. The guard reaches no further forward or wider than the former one (x 1.827, z 3.782).
export const T90A_GUARD: readonly SheetGuardStation[] = [
  [3.180,1.278,1.097,1.827,.100,.125,.014],[3.300,1.265,1.097,1.827,.100,.125,.014],
  [3.400,1.247,1.097,1.827,.100,.125,.014],[3.500,1.216,1.097,1.826,.100,.125,.014],
  [3.590,1.161,1.097,1.825,.098,.122,.014],
];
export const T90A_TOE: readonly SheetGuardStation[] = [
  [3.585,1.1495,1.100,1.822,.094,.118,.013],[3.685,1.071,1.110,1.825,.090,.118,.016],
  [3.782,.857,1.140,1.698,.036,.046,.030],
];
// [z, low edge, outer face x]: the front skirt panel, 19 mm inboard of the lip (tucking in with the toe's plan at the
// nose), its top buried 3 mm in the roll above
const T90A_FRONT_SKIRT: readonly (readonly [number, number, number])[] = [
  [3.192,.825,1.808],[3.45,.82,1.808],[3.55,.838,1.808],[3.62,.842,1.808],[3.68,.862,1.806],[3.700,.880,1.786],
  [3.712,.900,1.770],
];
const mirror = (side: number, ring: SolidSection['ring']): SolidSection['ring'] =>
  side > 0 ? ring : ring.map(([x,y]) => [-x,y] as const).reverse();

/** One station of a pressed sheet mudguard (267, S1: "the bow mudguards read as oversized wedges"): a sheet `thick` thick
 * whose top runs out from `inner` and rolls over a `roll` radius at `outer` into a short turned-down lip, `drop` below the
 * top. Shared by the T-90 X bow guards (A, M, SM) so the four hulls' guards read as one family of thin pressed sheet. */
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
  P.addMudguard('t90a-x-bow','hull',sectionSolid(T90A_GUARD.map((row) => sheetGuardSection(side,row))));
  P.addMudguard('t90a-x-toe-flap','hull',sectionSolid(T90A_TOE.map((row) => sheetGuardSection(side,row))));
  // the hinge: a pin through three knuckles along the joint, half proud of the sheet's front edge
  P.addEquipment('hullDetail',KIT.cylX(.008,.62,10),side*1.43,1.158,3.592);
  for (const x of [1.20,1.43,1.66]) P.addEquipment('hullDetail',KIT.cylX(.015,.12,12),side*x,1.158,3.592);
  // the rubber hem along the foot of the front skirt panel (addT90AXFenderClosures), wrapping its low edge
  P.addMudguard('t90a-x-front-skirt-hem','hullRubber',sectionSolid(T90A_FRONT_SKIRT.map(([z,low,x]): SolidSection => ({
    z, ring: mirror(side, [[x-.016,low-.032],[x+.003,low-.032],[x+.003,low+.010],[x-.016,low+.010]]),
  }))));
}

/** Closed bent sheet bridging the original upper shelf and skirt root, and the hinged front skirt panel under the bow
 * guard. The long return is outside the complete moving shoe, not a filled wheel bay: its 15 mm shelf overlaps the
 * existing shelf by 8.5 mm and its 18 mm vertical lip overlaps the skirt root by 5 mm. Lower wheels stay exposed.
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
    // the front skirt panel hangs 6 mm ahead of the long skirt's front edge (its hinge line), 12 mm sheet
    const top = (z: number, x: number) => sheetUnderside(T90A_GUARD,T90A_TOE,z,x)+.003;
    P.addMudguard('t90a-x-front-skirt','hullFixedPaintedBodywork',sectionSolid(T90A_FRONT_SKIRT.map(([z,low,x]): SolidSection => ({
      z, ring: mirror(side, [[x-.012,low],[x,low],[x,top(z,x-.012)],[x-.012,top(z,x-.012)]]),
    }))));
  }
}
