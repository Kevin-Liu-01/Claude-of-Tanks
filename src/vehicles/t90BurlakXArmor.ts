import {plate,type ArmorPlate} from './specHelpers.ts';
// Boot-light physical source measurements. Protection values are gameplay
// conventions, not an inference of real protection from supplied geometry.
export const T90_BURLAK_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.36329984665,overallLengthM:10.063049793,widthM:4.0703,heightM:2.26367998123},
  turretPivot:[-.001247544176495,1.544579982757568,.114670021536425],
  trunnion:[.001410018652678,1.784449994564055,1.283482024669646],
  muzzleZ:6.260299921035765,boreFloorZ:5.853999853134153,highestFittingM:4.627689838,
} as const;
export function createT90BurlakXArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]}{
  const main={kind:'era',era:{keReduction:.2,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.88,.89,3.21],[-.012,.89,3.21],[-.88,1.33,2.18],main),
    plate('glacis_era_R',15,[.012,.89,3.21],[.88,.89,3.21],[.012,1.33,2.18],main),
    plate('skirt_era_L',12,[-1.83,.75,3.0],[-1.83,.75,.1],[-1.83,1.32,3.0],skirt),
    plate('skirt_era_R',12,[1.83,.75,.1],[1.83,.75,3.0],[1.83,1.32,.1],skirt),
  ];
  const [,y,z]=T90_BURLAK_X_SOURCE_DATUMS.turretPivot;
  return {hullPlates,turretPlates:[
    plate('turret_era_L',15,[-1.91,1.57-y,.91-z],[-.38,1.57-y,1.98-z],[-1.91,2.08-y,.91-z],main),
    plate('turret_era_R',15,[.31,1.57-y,1.83-z],[1.89,1.57-y,.87-z],[.31,2.07-y,1.83-z],main),
  ]};
}
