// Boot-light T-80U X cassette registration; source-fit scalar seed fields only.
// Exact generated exposed-triangle receipts define actual protection locations.
// Contact values preserve the existing T-80U gameplay convention and are NOT
// inferred physical protection measurements from the supplied polygon model.
import {plate,type ArmorPlate} from './specHelpers.ts';

/** Release 231 (the gun-hull fleet lane; the owner approved, 2026-10-21): the T-80U X casting rides this far (m) above the
 * source's yaw datum (1.55158), on a stationary machined ring race (profiles/t80uX.ts). Seated at the datum, the gun
 * mount's underside stood 0-3 cm over the roof ahead and met the engine deck's panel astern (its top 1.586 m) at every
 * pitch, on the fleet T-80U, the T-80UK and the T-72 Ryś (tools/gun-depression-sweep.mjs: 98 mount-conflict yaws, blocked
 * at full elevation on 167). Measured against the fleet's T-72B3 (t72b3XArmor.ts: trunnion 0.302 m over its roof, ring
 * 5.2 cm over its engine deck), raised: 0.298 m and 5.4 cm; the whole mount keeps 31 mm from the hull at every yaw and
 * pitch (26.5 mm from a 6 cm raise). The turret's plates, crew and modules are turret-local and rise with it. */
export const T80U_X_RING_RAISE_M=.065;

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
