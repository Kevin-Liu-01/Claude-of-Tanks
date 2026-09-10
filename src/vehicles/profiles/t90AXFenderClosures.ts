import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';

// One set of authored stations owns both the original curved roof and its
// fitted outer return. The toe narrows only beyond the forward track bend.
export const T90A_FRONT_GUARD_ROWS: readonly (readonly [number, number, number])[] = [
  [3.180,1.278,1.827],[3.300,1.265,1.827],[3.400,1.247,1.827],
  [3.500,1.216,1.826],[3.590,1.161,1.825],[3.685,1.071,1.825],[3.782,.857,1.698],
];
const BOW_RETURN_DEPTH_M = [.28,.27,.25,.21,.16,.10,.026] as const;
const mirror = (side: number, ring: SolidSection['ring']): SolidSection['ring'] =>
  side > 0 ? ring : ring.map(([x,y]) => [-x,y] as const).reverse();

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
