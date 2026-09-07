// Boot-light source-fit registration, not a new protection/balance recipe.
// The original T-72B3 donor's combat values remain unchanged.
import {plate,type ArmorPlate} from './specHelpers.ts';

export const T72B3_X_SOURCE_DATUMS={
  dims:{hullLengthM:6.356300116,overallLengthM:9.670799732,widthM:3.765600068,heightM:2.274000205},
  turretPivot:[.0000002374,1.457100315,.065591405],
  trunnion:[.006050285,1.758750301,1.096549988],muzzleZ:5.798749804,
  highestFittingM:5.456999902,structuralRoofM:2.274000205,
} as const;

export const T72B3_X_ERA_ZONES=[
  {name:'glacis_era_L',owner:'hull',bounds:{min:[-.872,.839,2.188],max:[-.016,1.362,3.180]},backing:'separate closed main glacis'},
  {name:'glacis_era_R',owner:'hull',bounds:{min:[-.018,.839,2.202],max:[.850,1.362,3.192]},backing:'separate closed main glacis'},
  {name:'skirt_era_L',owner:'hull',bounds:{min:[-1.863,.788,.631],max:[-1.787,1.417,2.631]},backing:'permanent folded frame, not the removable outer plates'},
  {name:'skirt_era_R',owner:'hull',bounds:{min:[1.806,.788,.691],max:[1.903,1.417,2.690]},backing:'permanent folded frame, not the removable outer plates'},
  {name:'turret_era_L',owner:'turret',bounds:{min:[-1.856,1.506,-.526],max:[.041,2.370,1.668]},backing:'closed casting and separate fixed cassette carriers'},
  {name:'turret_era_R',owner:'turret',bounds:{min:[-.027,1.506,-.185],max:[1.744,2.306,1.683]},backing:'closed casting and separate fixed cassette carriers'},
] as const;

export function createT72B3XArmorZones():{hullPlates:ArmorPlate[];turretPlates:ArmorPlate[]} {
  const main={kind:'era',era:{keReduction:.20,ceFlatMm:450}},skirt={kind:'era',era:{keReduction:.05,ceFlatMm:280}};
  const hullPlates=[
    plate('glacis_era_L',15,[-.87,.96,3.0],[-.016,.96,3.0],[-.87,1.32,2.22],main),
    plate('glacis_era_R',15,[.016,.96,3.0],[.85,.96,3.0],[.016,1.32,2.22],main),
    plate('skirt_era_L',12,[-1.84,.79,2.63],[-1.84,.79,.631],[-1.84,1.38,2.63],skirt),
    plate('skirt_era_R',12,[1.87,.79,.691],[1.87,.79,2.69],[1.87,1.38,.691],skirt),
  ];
  const [,y,z]=T72B3_X_SOURCE_DATUMS.turretPivot;
  const turretPlates=[
    plate('turret_era_L',15,[-1.70,1.52-y,.35-z],[-.30,1.52-y,1.62-z],[-1.70,1.94-y,.35-z],main),
    plate('turret_era_R',15,[.30,1.52-y,1.62-z],[1.70,1.52-y,.35-z],[.30,1.94-y,1.62-z],main),
  ];
  return{hullPlates,turretPlates};
}
