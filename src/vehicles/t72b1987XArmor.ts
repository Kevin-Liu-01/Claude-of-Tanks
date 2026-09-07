// Boot-light, X-only physical ERA registration. These seed coordinates identify
// the authored cassette fields; generated exact triangle receipts own hit space.
// Protection values retain the existing T-72B obr.1987 gameplay donor (whose
// inherited balance recipe originated in T-72B3), not a historical claim
// about the supplied T-72B obr.1987 mesh or the chemistry of its visible bricks.
import {plate,type ArmorPlate} from './specHelpers.ts';

export const T72B1987_X_ERA_ZONES=[
  {name:'glacis_era_L',owner:'hull',bounds:{min:[-.995,.91,1.79],max:[0,1.381,2.79]},backing:'closed glacis and individual permanent mounting rails'},
  {name:'glacis_era_R',owner:'hull',bounds:{min:[0,.91,1.79],max:[.86,1.381,2.79]},backing:'closed glacis and individual permanent mounting rails'},
  {name:'skirt_era_L',owner:'hull',bounds:{min:[-1.7855,.8035,-.658],max:[-1.7205,1.2605,2.461]},backing:'separate continuous fixed side apron'},
  {name:'skirt_era_R',owner:'hull',bounds:{min:[1.7145,.8035,-.658],max:[1.7795,1.2605,2.461]},backing:'separate continuous fixed side apron'},
  {name:'turret_era_L',owner:'turret',bounds:{min:[-1.42,1.55,-.02],max:[0,2.174,1.41]},backing:'cast turret and individual fixed cheek carriers'},
  {name:'turret_era_R',owner:'turret',bounds:{min:[0,1.55,-.02],max:[1.42,2.174,1.41]},backing:'cast turret and individual fixed cheek carriers'},
] as const;

export function createT72B1987XArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const main={kind:'era',era:{keReduction:.20,ceFlatMm:450}};
  const skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.99,.99,2.72],[-.01,.99,2.72],[-.99,1.335,1.93],main),
    plate('glacis_era_R',15,[.01,.99,2.72],[.855,.99,2.72],[.01,1.335,1.93],main),
    plate('skirt_era_L',12,[-1.7855,.8035,2.461],[-1.7855,.8035,-.658],[-1.7855,1.2605,2.461],skirt),
    plate('skirt_era_R',12,[1.7795,.8035,-.658],[1.7795,.8035,2.461],[1.7795,1.2605,-.658],skirt),
  ];
  const y=1.4040902854,z=-.0343498434;
  const turretPlates=[
    plate('turret_era_L',15,[-1.23,1.60-y,.55-z],[-.25,1.60-y,1.35-z],[-1.23,1.82-y,.55-z],main),
    plate('turret_era_R',15,[.25,1.60-y,1.35-z],[1.23,1.60-y,.55-z],[.25,1.82-y,1.35-z],main),
  ];
  return{hullPlates,turretPlates};
}
