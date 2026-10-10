// Original Chinese modernization studies: scalar design datums, not service claims.
// All turret coordinates are relative to the vehicle's retained bearing centre.
export const NATIONAL_CHINA_DESIGNS = [
  {
    heightM:3.19,roofY:.70,rws:[.43,.70,-.72],cupola:[-.43,.70,-.45],
    hullLength:6.72,width:4.34,turretRear:-1.754,
    description:'Yun T-80U retrofit concept: original turbine hull and compact casting, broad swept arrowhead armor housings, paired rectangular warning optics and lamps, a horizontal slat rear cage, six thick layered skirt modules and two small transverse fuel drums on native transom brackets.',
  },
  {
    heightM:3.36,roofY:.77,rws:[.43,.77,-.73],cupola:[-.43,.77,-.46],
    hullLength:7.31,width:4.54,turretRear:-2.105,
    description:'Kunlun T-72B3M retrofit concept: low T-72 hull and rounded casting, deep two-stage Chinese wedge housings with paired guarded sensors and twin circular driving lamps, extended open maintenance cage with a three-cell rear console, seven thick staggered skirt modules and large transverse auxiliary fuel drums.',
  },
  {
    heightM:3.05,roofY:.69,rws:[.43,.69,-.70],cupola:[-.43,.69,-.43],
    hullLength:6.8784,width:4.363,turretRear:-1.799,
    description:'Qilin T-72B3 retrofit concept: exposed cast crown and lower shoulders within compact segmented chevron armor, round driving lamps, roof camera, a low field-service box and small open rear basket, original low hull and five ribbed layered skirt modules, plus two individually cradled rear fuel drums.',
  },
] as const;
