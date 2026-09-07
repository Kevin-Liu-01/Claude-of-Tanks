import {plate,type ArmorPlate} from './specHelpers.ts';
export const T90MS_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.36530017853,overallLengthM:10.096710205,widthM:3.7802,heightM:2.1855900287628174},
  turretPivot:[-.00094997882843,1.4433900117874146,.1200934632560673],
  trunnion:[-.0016399808228014,1.8143100142478943,1.3700721232514588],
  muzzleZ:6.294960021972652,boreFloorZ:4.99215984344482,highestFittingM:4.747099876403809,
} as const;
// Physical placement follows the independently authored cassettes. Protection
// values are game conventions and never claimed as mesh-derived performance.
export function createT90MSXArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]}{
  const main={kind:'era',era:{keReduction:.2,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.897,.85,3.19],[-.01,.85,3.19],[-.897,1.43,2.03],main),
    plate('glacis_era_R',15,[-.008,.85,3.19],[.878,.85,3.19],[-.008,1.43,2.03],main),
    plate('skirt_era_L',12,[-1.792,.76,2.98],[-1.792,.76,-1],[-1.792,1.435,2.98],skirt),
    plate('skirt_era_R',12,[1.792,.76,-1],[1.792,.76,2.98],[1.792,1.435,-1],skirt),
  ];
  const [,y,z]=T90MS_X_SOURCE_DATUMS.turretPivot;
  return{hullPlates,turretPlates:[
    plate('turret_era_L',15,[-1.83,1.59-y,.57-z],[-.38,1.59-y,1.80-z],[-1.83,2.15-y,.57-z],main),
    plate('turret_era_R',15,[.29,1.59-y,1.80-z],[1.84,1.59-y,.57-z],[.29,2.15-y,1.80-z],main),
    plate('side_era_L',15,[-1.61,1.60-y,.36-z],[-.89,1.60-y,-1.38-z],[-1.61,2.07-y,.36-z],main),
    plate('side_era_R',15,[.80,1.60-y,-1.70-z],[1.60,1.60-y,.07-z],[.80,2.07-y,-1.70-z],main),
  ]};
}
