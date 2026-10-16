// Original Chinese modernization studies: scalar design datums, not service claims.
// All turret coordinates are relative to the vehicle's retained bearing centre.
export const NATIONAL_CHINA_DESIGNS = [
  {
    heightM:3.19,roofY:.70,rws:[.43,.70,-.72],cupola:[-.43,.70,-.45],
    hullLength:6.72,width:4.34,turretRear:-1.754,
    description:'Yun T-80U retrofit concept: original turbine hull and compact casting, broad swept arrowhead armor housings, paired rectangular warning optics and lamps, a horizontal slat rear cage, six thick layered skirt modules and two small transverse fuel drums on native transom brackets.',
  },
  {
    // Owner 2026-10-15 (VEH-20): the Type 96B turret (nationalDonorTurrets.ts); roofY is its roof, rws the 30 mm
    // station's seat on the 96B commander's cupola and cupola that cupola's base on the roof, turretRear the 96B
    // bustle and bins (the open maintenance cage reaches -2.28).
    heightM:3.36,roofY:.70,rws:[-.592,.886,.105],cupola:[-.592,.683,.105],
    hullLength:7.31,width:4.54,turretRear:-1.92,
    description:'Kunlun T-72B3M retrofit concept: the low T-72B3M hull carries a Type 96B turret. Its wedge front wears twelve Chinese single-piece chevron ERA cassettes on permanent carriers, two Shtora-style infrared dazzler heads flank the mantlet, and a 30 mm stabilised cannon station stands on the commander\'s cupola; square guarded roof lamps, a scanner head, service cases, a second whip and an open maintenance cage with a three-cell rear console complete the turret. The hull keeps seven thick staggered skirt modules, glacis cassettes, twin circular driving lamps, engine-deck cooling panels, large transverse auxiliary fuel drums and a rear field rack.',
  },
  {
    // Owner 2026-10-15 (VEH-19): the production ZTZ-99A2 turret (nationalDonorTurrets.ts); roofY is its roof, rws the
    // 12.7 mm station's seat on the 99A2 commander's cupola and cupola that cupola ring, turretRear its rear armour box.
    heightM:3.05,roofY:.83,rws:[.52,.932,-.88],cupola:[.52,.8775,-.88],
    hullLength:6.8784,width:4.363,turretRear:-2.265,
    description:'Qilin T-72B3 retrofit concept: the original low T-72B3 hull carries the production ZTZ-99A2 turret with its arrowhead chevron armour and face ERA, side cassettes, smoke banks and sights, and a compact 12.7 mm remote station on the commander\'s cupola. The Qilin\'s own inexpensive field fit adds round guarded roof lamps, a side camera, a low field-service box and tool chest, a roll and a field-service carrier, and a small open tool basket on the 99A2 bustle. The hull keeps five ribbed layered skirt modules, glacis cassettes, round driving lamps, engine-deck cooling panels, two individually cradled rear fuel drums and a rear field rack.',
  },
] as const;
