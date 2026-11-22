// Boot-light ERA registration for the T-62MV (obr. 1985). No renderer or visual builder may enter this module. The zones
// name the Kontakt-1 fields drawn by profiles/t62Family.ts (lane t62-275): the glacis, the top of each rubber skirt's
// front and the two turret cheeks. The anatomy generator replaces these seed faces with the actual marked triangle faces
// of each removable cassette. Armour-record sides: L at -X, R at +X.
import {plate,type ArmorPlate} from './specHelpers.ts';

// Gameplay convention, NOT a protection measurement: the fleet's first-generation Kontakt-1 balance preset.
const T62MV1_X_ERA_CONTACT={keReduction:.05,ceFlatMm:280} as const;

/** The T-62 family's turret ring centre (t62Family.ts TURRET_PIVOT): turret seeds are turret-local. */
const RING:[number,number,number]=[0,1.47,.16];

/** Seed registration only; exact triangle receipts govern physical hit space. */
export function createT62MV1XArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const options={kind:'era',era:{...T62MV1_X_ERA_CONTACT}};
  const hullPlates=[
    plate('glacis_era_L',15,[-1.10,1.00,3.00],[-.02,1.00,3.00],[-1.10,1.42,2.24],options),
    plate('glacis_era_R',15,[.02,1.00,3.00],[1.10,1.00,3.00],[.02,1.42,2.24],options),
    plate('skirt_era_L',15,[-1.73,.48,1.00],[-1.73,.48,2.72],[-1.73,1.10,1.00],options),
    plate('skirt_era_R',15,[1.73,.48,2.72],[1.73,.48,1.00],[1.73,1.10,2.72],options),
  ];
  const [, y, z]=RING;
  const turretPlates=[
    plate('turret_era_L',15,[-1.30,1.62-y,1.00-z],[-.30,1.62-y,1.62-z],[-1.10,2.02-y,.80-z],options),
    plate('turret_era_R',15,[.30,1.62-y,1.62-z],[1.30,1.62-y,1.00-z],[.30,2.02-y,1.40-z],options),
  ];
  return {hullPlates,turretPlates};
}
