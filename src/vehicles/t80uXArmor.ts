// Boot-light T-80U X cassette registration; source-fit scalar seed fields only.
// Exact generated exposed-triangle receipts define actual protection locations.
// Contact values preserve the existing T-80U gameplay convention and are NOT
// inferred physical protection measurements from the supplied polygon model.
import {plate,type ArmorPlate} from './specHelpers.ts';

export function createT80UXArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const options={kind:'era',era:{keReduction:.20,ceFlatMm:400}};
  const hullPlates=[
    plate('glacis_era_L',15,[-1.025,1.053,3.005],[-.077,1.053,3.005],[-1.025,1.504,1.85],options),
    plate('glacis_era_R',15,[.077,1.053,3.005],[1.025,1.053,3.005],[.077,1.504,1.85],options),
  ];
  const y=1.55158,z=.0718698169;
  const turretPlates=[
    plate('turret_era_L',15,[-1.60,1.605-y,.30-z],[-.70,1.605-y,1.57-z],[-1.33,1.83-y,.30-z],options),
    plate('turret_era_R',15,[.89,1.605-y,1.45-z],[1.58,1.605-y,.30-z],[.80,1.84-y,1.25-z],options),
  ];
  return{hullPlates,turretPlates};
}
