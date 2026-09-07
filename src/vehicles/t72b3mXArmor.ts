// Boot-light physical registration; protection values remain the T-72B3M
// donor's gameplay convention, not protection inferred from a reference mesh.
import {plate,type ArmorPlate} from './specHelpers.ts';

export const T72B3M_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.68398928642,overallLengthM:10.26753902435,widthM:3.95101606846,heightM:2.35125696659},
  turretPivot:[.0000072471277,1.52948397398,.1143146502203],
  trunnion:[.0014311877863,1.82199396492,1.334185526985],
  muzzleZ:6.587516409117,boreFloorZ:5.890883855316,
  structuralRoofM:2.35125696659,highestFittingM:3.76104700565,
  sourceGunElevationRad:.01460832,
} as const;

export function createT72B3MXArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const main={kind:'era',era:{keReduction:.20,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-1.10,1.035,3.22],[-.014,1.035,3.22],[-1.10,1.475,2.0],main),
    plate('glacis_era_R',15,[.014,1.035,3.22],[1.10,1.035,3.22],[.014,1.475,2.0],main),
    plate('skirt_era_L',12,[-1.965,.80,3.18],[-1.965,.80,-3.15],[-1.965,1.53,3.18],skirt),
    plate('skirt_era_R',12,[1.962,.80,-3.15],[1.962,.80,3.18],[1.962,1.53,-3.15],skirt),
  ];
  const [,y,z]=T72B3M_X_SOURCE_DATUMS.turretPivot;
  const turretPlates=[
    plate('turret_era_L',15,[-1.70,1.63-y,.55-z],[-.42,1.66-y,1.78-z],[-1.70,2.03-y,.55-z],main),
    plate('turret_era_R',15,[.42,1.66-y,1.78-z],[1.70,1.63-y,.55-z],[.42,2.04-y,1.78-z],main),
  ];
  return{hullPlates,turretPlates};
}
