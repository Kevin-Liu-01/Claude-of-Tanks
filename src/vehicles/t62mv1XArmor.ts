// Boot-light X-only ERA registration. No source renderer or visual builder
// may enter this module. Scalar zones identify independently authored cover
// fields; the anatomy generator replaces these seed faces with the actual
// marked triangle faces of each removable cassette.
import {plate,type ArmorPlate} from './specHelpers.ts';

export const T62MV1_X_ERA_ZONE_NAMES={
  hull:['glacis_era_L','glacis_era_R'],turret:['turret_era_L','turret_era_R'],
} as const;

// Gameplay convention, NOT a protection measurement from a polygon model:
// the existing first-generation K1 balance preset (modern1.ts) is proposed.
// The source title is MV-1; its low-detail broad covers alone do not establish
// explosive composition. Parent registration must retain that provenance note.
export const T62MV1_X_ERA_CONTACT={keReduction:.05,ceFlatMm:280} as const;
export const T62MV1_X_ERA_ZONES=[
  {name:'glacis_era_L',owner:'hull',type:'first-generation-reactive',
    bounds:{min:[-.883,.90,1.93],max:[-.005,1.473,2.925]},
    permanentBacking:'closed central glacis plus six individual fixed rails'},
  {name:'glacis_era_R',owner:'hull',type:'first-generation-reactive',
    bounds:{min:[.005,.90,1.93],max:[.883,1.473,2.925]},
    permanentBacking:'closed central glacis plus six individual fixed rails'},
  {name:'turret_era_L',owner:'turret',type:'first-generation-reactive',
    bounds:{min:[-1.36,1.732,.414],max:[-.53,2.111,1.326]},
    permanentBacking:'permanent cast cheek and separate fixed support plates'},
  {name:'turret_era_R',owner:'turret',type:'first-generation-reactive',
    bounds:{min:[.135,1.752,.770],max:[1.064,2.153,1.670]},
    permanentBacking:'permanent cast cheek and separate fixed support plates'},
] as const;

/** Seed registration only; exact triangle receipts govern physical hit space. */
export function createT62MV1XArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const options={kind:'era',era:{...T62MV1_X_ERA_CONTACT}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.86,1.065,2.75],[-.015,1.065,2.75],[-.86,1.445,1.99],options),
    plate('glacis_era_R',15,[.015,1.065,2.75],[.86,1.065,2.75],[.015,1.445,1.99],options),
  ];
  const y=1.446436,z=.3041853764;
  const turretPlates=[
    plate('turret_era_L',15,[-1.26,1.79-y,1.24-z],[-.61,1.93-y,1.18-z],[-1.16,2.02-y,.57-z],options),
    plate('turret_era_R',15,[.32,1.82-y,1.62-z],[1.01,1.83-y,1.25-z],[.18,2.10-y,1.02-z],options),
  ];
  return {hullPlates,turretPlates};
}
