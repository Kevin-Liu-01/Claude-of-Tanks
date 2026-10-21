// Boot-light source-fit registration, not a new protection/balance recipe.
// The original T-72B3 donor's combat values remain unchanged.
import {plate,type ArmorPlate} from './specHelpers.ts';

export const T72B3_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.356300116,overallLengthM:9.670799732,widthM:3.765600068,heightM:2.274000205},
  turretPivot:[.0000002374,1.457100315,.065591405],
  trunnion:[.006050285,1.758750301,1.096549988],muzzleZ:5.798749804,
  highestFittingM:5.456999902,structuralRoofM:2.274000205,
} as const;

/** Release 230 (the gun-hull lane): the T-72B3's main-gun depression by absolute turret yaw (degrees; sim/gunPitchLimits.ts),
 * measured with tools/gun-depression-sweep.mjs (the whole gun 26 mm off every hull mesh at every degree, both sides;
 * nationalGunClearance.selftest.mjs holds it at 25 mm). Full depression ahead; the side rubber at 32-35 (-5.6); the
 * engine deck's grilles and fittings from 130 (to -4 at 145); behind 159 the barrel meets the rear deck's fittings even
 * level, so it needs up to +4.2 degrees at 169-172. */
export const T72B3_X_GUN_PITCH_BY_YAW_DEG=Object.freeze([[0,-6],[31,-6],[32,-5.6],[35,-5.6],[37,-6],[129,-6],[131,-5.3],[132,-5.1],
  [138,-5],[142,-4.3],[145,-4],[153,-4.1],[158,-5.1],[159,-1.3],[160,1.4],[161,2.5],[162,2.9],[167,3.6],[168,4],[169,4.2],
  [172,4.2],[175,3.6],[179,3.1],[180,2.8]] as const);

export function createT72B3XArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const main={kind:'era',era:{keReduction:.20,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.87,.96,3.0],[-.016,.96,3.0],[-.87,1.32,2.22],main),
    plate('glacis_era_R',15,[.016,.96,3.0],[.85,.96,3.0],[.016,1.32,2.22],main),
    plate('skirt_era_L',12,[-1.84,.79,2.63],[-1.84,.79,.631],[-1.84,1.38,2.63],skirt),
    plate('skirt_era_R',12,[1.87,.79,.691],[1.87,.79,2.69],[1.87,1.38,.691],skirt),
  ];
  const [,y,z]=T72B3_X_SOURCE_DATUMS.turretPivot;
  const turretPlates=[
    plate('turret_era_L',15,[-1.70,1.52-y,.35-z],[-.30,1.52-y,1.62-z],[-1.70,1.94-y,.35-z],main),
    plate('turret_era_R',15,[.30,1.52-y,1.62-z],[1.70,1.52-y,.35-z],[.30,1.94-y,1.62-z],main),
  ];
  return{hullPlates,turretPlates};
}
