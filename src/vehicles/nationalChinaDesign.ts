// Original Chinese modernization studies: scalar design datums, not service claims.
// All turret coordinates are relative to the vehicle's retained bearing centre.
export const NATIONAL_CHINA_DESIGNS = [
  {
    heightM:3.19,roofY:.70,rws:[.43,.70,-.72],cupola:[-.43,.70,-.45],
    hullLength:6.72,width:4.34,turretRear:-1.754,
    description:'Yun T-80U retrofit concept: original turbine hull and compact casting, swept arrowhead armor housing, linked low electronics and service cases, six thick layered skirt modules with fitted continuous shoulders and chamfered wrap returns.',
  },
  {
    heightM:3.36,roofY:.77,rws:[.43,.77,-.73],cupola:[-.43,.77,-.46],
    hullLength:7.31,width:4.54,turretRear:-2.105,
    description:'Kunlun T-72B3M retrofit concept: low T-72 hull and rounded casting, deep Chinese wedge housings with paired guarded sensors and wing service cases, open rear maintenance frame and seven thick staggered skirt modules with fitted shoulders and armored returns.',
  },
  {
    heightM:3.05,roofY:.69,rws:[.43,.69,-.70],cupola:[-.43,.69,-.43],
    hullLength:6.8784,width:4.363,turretRear:-1.799,
    description:'Qilin T-72B3 retrofit concept: exposed cast crown and lower shoulders within enclosing chevron armor, compact roof camera, field-tool roll and rear rack, original low hull and five ribbed layered skirt modules joined by fitted shoulders and tapered returns.',
  },
] as const;
