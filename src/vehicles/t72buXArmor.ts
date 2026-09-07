// Boot-light registration from an independently scaled owner-supplied source.
// Reactive performance is the donor gameplay convention, not a mesh-derived
// protection claim; only the physical placement recipe is newly authored.
import {plate,type ArmorPlate} from './specHelpers.ts';
export const T72BU_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.34341572519,overallLengthM:10.34772314839,widthM:3.59,heightM:2.16259918790},
  turretPivot:[.00489819586996,1.33032792438745,.248076543568282],
  trunnion:[.002245869663885,1.629788855115796,1.37094868816255],
  muzzleZ:6.558946867971733,boreFloorZ:6.453155544449773,
  highestFittingM:3.39756178023,
} as const;
export function createT72BUXArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const main={kind:'era',era:{keReduction:.2,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-1.06,.88,3.08],[-.012,.88,3.08],[-1.06,1.36,1.78],main),
    plate('glacis_era_R',15,[.012,.88,3.08],[1.06,.88,3.08],[.012,1.36,1.78],main),
    plate('skirt_era_L',12,[-1.795,.81,3.127],[-1.795,.91,.95],[-1.795,1.286,3.127],skirt),
    plate('skirt_era_R',12,[1.784,.91,.95],[1.784,.81,3.127],[1.784,1.39,.95],skirt),
  ];
  const [,y,z]=T72BU_X_SOURCE_DATUMS.turretPivot;
  const turretPlates=[
    plate('turret_era_L',15,[-1.58,1.53-y,.45-z],[-.41,1.55-y,1.67-z],[-1.58,1.91-y,.45-z],main),
    plate('turret_era_R',15,[.41,1.55-y,1.67-z],[1.59,1.53-y,.45-z],[.41,1.91-y,1.67-z],main),
  ];return{hullPlates,turretPlates};
}
