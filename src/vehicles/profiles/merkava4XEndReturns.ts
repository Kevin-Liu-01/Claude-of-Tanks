// First-party finite folds, not a filled wheel bay. The independently measured
// source has a tapered front side skin and a high rear return above open air.
// Keep the native guard roofs, wheel stations and existing rubber flaps fixed.
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';

const FRONT = [
  // Z, receiving guard outer X, guard outer roof, new outer X, lower hem.
  [2.992,1.79073,1.28613,1.8734,.680],
  [3.000,1.790,1.285,1.8734,.684],
  [3.150,1.770,1.250,1.834,.762],
  [3.300,1.770,1.235,1.784,.832],
  [3.450,1.770,1.219,1.784,.840],
  [3.600,1.770,1.115,1.784,.831],
  [3.760,1.770,1.048,1.784,.820],
] as const;
const REAR = [
  // Z and unchanged native roof. Its old rear folds and recessed right cover
  // remain intact; the added side sheet is not a replacement rear-hull loft.
  [-3.660,1.25655],[-3.602664,1.533695],[-3.476,1.533695],
  [-3.460,1.533695],[-3.376,1.533695],[-3.360,1.556735],
  [-3.100,1.57778],[-2.972,1.588147],
] as const;

function mirrored(ring: SectionPoint[], side: number): SectionPoint[] {
  return side<0?ring.map(([x,y])=>[-x,y] as SectionPoint).reverse():ring;
}

export function addMerkava4XEndReturns(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    const bucket=side<0?'hullTrackGuardL':'hullTrackGuardR';
    P.addMudguard('merkava4-x-front-side-return',bucket,sectionSolid(
      FRONT.map(([z,receiver,roof,outer,hem])=>({z,ring:mirrored([
        [receiver-.010,roof-.014],[outer-.012,roof-.014],
        [outer-.012,hem],[outer,hem],[outer,roof-.002],
        [receiver-.010,roof-.002],
      ],side)}))));
    // Keep the flap's rake with a 2 mm finite cap on each Y/Z face. The
    // positive inner lap has no coincident painted/rubber planes.
    // This remains only the small outer corner, not the lower track mouth.
    P.addMudguard('merkava4-x-front-corner-return',bucket,
      KIT.box(.072,.239,.049),side*1.748,.928,3.760,-.13);
    P.addMudguard('merkava4-x-rear-side-return',bucket,sectionSolid(
      REAR.map(([z,roof])=>{
        // A real ~28 mm right-side recess remains below the original cover.
        // The final short taper receives the native wider last skirt.
        const outer=z>=-3.10?1.780+(z+3.10)/.128*.0584:
          side>0&&z>=-3.460&&z<=-3.376?1.752:1.780;
        return {z,ring:mirrored([
          [1.730,roof-.014],[outer-.012,roof-.014],
          [outer-.012,1.180],[outer,1.180],[outer,roof-.002],
          [1.730,roof-.002],
        ],side)};
      })));
  }
}
