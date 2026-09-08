// First-party folded fender returns. The source carries a thin outer skin,
// but its narrower static sprocket is not the native animated assembly.
// Keep the existing shoulder/axle datums and fit outside the native stock.
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';

const REAR_Z = 3.19;
const FRONT_Z = 3.8058175;
const INNER_X = 1.832;
const OUTER_X = 1.92;
const WALL_INNER_X = 1.904;
const roofAt = (z: number): number => 1.55 - (z - 3.0058175) * .11 / .8;
const STATIONS = [[REAR_Z,1.20],[3.26,1.20],[3.38,1.075],
  [3.72,1.075],[FRONT_Z,1.075]] as const;

export function addMerkava3dXFrontReturns(P: TankBuilderPort): void {
  for (const side of [-1,1]) {
    const bucket = side < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR';
    const geometry = sectionSolid(STATIONS.map(([z,hem]) => {
      const roof = roofAt(z);
      const ring: SectionPoint[] = [[INNER_X,roof-.016],[WALL_INNER_X,roof-.016],
        [WALL_INNER_X,hem],[OUTER_X,hem],[OUTER_X,roof],[INNER_X,roof]];
      return {z,ring:side<0 ? ring.map(([x,y])=>[-x,y] as SectionPoint).reverse() : ring};
    }));
    P.addMudguard('merkava3d-x-front-side-return',bucket,geometry);
    // A short folded end shares the original flap's rake and finite stock.
    // It is only the outboard 90 mm, never a face spanning the track mouth.
    P.addMudguard('merkava3d-x-front-corner-return',bucket,
      KIT.box(.090,.36,.045),side*1.877,1.25,3.8158175,-.12);
  }
}
