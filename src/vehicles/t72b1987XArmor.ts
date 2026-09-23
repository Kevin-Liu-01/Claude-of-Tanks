// Boot-light, X-only physical ERA registration. These seed coordinates identify
// the authored cassette fields; generated exact triangle receipts own hit space.
// Protection values retain the existing T-72B obr.1987 gameplay donor (whose
// inherited balance recipe originated in T-72B3), not a historical claim
// about the supplied T-72B obr.1987 mesh or the chemistry of its visible bricks.
import {plate,type ArmorPlate} from './specHelpers.ts';

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
