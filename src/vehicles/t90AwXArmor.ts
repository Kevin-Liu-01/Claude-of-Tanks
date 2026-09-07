import {plate,type ArmorPlate} from './specHelpers.ts';
// Physical source joints are independently inferred; protection is a gameplay
// convention inherited by the X spec, never measured from mesh thickness.
export const T90_AW_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.36329984665,overallLengthM:10.17326974869,widthM:3.81588006020,heightM:2.27397990227},
  turretPivot:[-.00094997882843,1.408079981803894,.115670447585103],
  trunnion:[-.0007899813354,1.726339995861054,1.271363670175725],
  muzzleZ:6.370519876480101,boreFloorZ:5.964219808578489,highestFittingM:4.47114992142,
} as const;
export function createT90AWXArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]}{
  const main={kind:'era',era:{keReduction:.2,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.89,.88,3.21],[-.012,.88,3.21],[-.89,1.33,2.18],main),
    plate('glacis_era_R',15,[.012,.88,3.21],[.89,.88,3.21],[.012,1.33,2.18],main),
    plate('skirt_era_L',12,[-1.83,.75,3.0],[-1.83,.75,.1],[-1.83,1.32,3.0],skirt),
    plate('skirt_era_R',12,[1.83,.75,.1],[1.83,.75,3.0],[1.83,1.32,.1],skirt),
  ];
  const [,y,z]=T90_AW_X_SOURCE_DATUMS.turretPivot;
  const turretPlates=[
    plate('turret_era_L',15,[-1.73,1.68-y,.45-z],[-.40,1.66-y,1.67-z],[-1.73,2.04-y,.45-z],main),
    plate('turret_era_R',15,[.40,1.66-y,1.67-z],[1.73,1.68-y,.45-z],[.40,2.04-y,1.67-z],main),
  ];return{hullPlates,turretPlates};
}
