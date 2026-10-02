// Original Polish modernization studies, not claims of fielded PT-91 variants.
// Datum-only module: safe for the spec registry's demand-loading boundary.
export const NATIONAL_POLAND_DESIGNS = [
  {
    heightM:3.24,roofY: .74, rws: [.48, .74, -.48], cupola: [-.47, .74, -.48],
    hullLength:6.82, width:4.303, turretRear: -1.43,
    description: 'Polish T-80U modernization concept retaining its native low hull and rounded turret ancestry, with a connected ERAWA cheek-and-pannier armor frame, a broad rear basket carrying field stores and a strapped canvas roll, guarded sensors, pannier tool racks, turbine service fittings and thick wraparound skirts joined to the native fenders by continuous fitted shoulders.'
  },
  {
    heightM:3.39,roofY: .78, rws: [.48, .78, -.48], cupola: [-.47, .78, -.48],
    hullLength:7.31, width:4.463, turretRear: -1.49,
    description: 'Polish T-72B3M heavy modernization concept retaining the native glacis and compact cast turret, with a deep connected cheek-and-bustle armor assembly, three-course ERAWA protection, armored communications cabinets and spare-track stores, guarded sensors and heavy layered skirts with continuous fitted shoulders and front and rear returns.'
  },
  {
    heightM:3.05,roofY: .68, rws: [.46, .68, -.47], cupola: [-.46, .68, -.47],
    hullLength:6.95035, width:4.283, turretRear: -1.33,
    description: 'Polish T-72B3 compact modernization concept retaining its low native hull and small rounded cast turret, with a compact connected ERAWA armor frame, fine cheek tile fields, asymmetric service cabinets, clamped tools, a compact camouflage-roll basket and beveled wraparound skirts joined to the native fenders by continuous fitted shoulders.'
  },
] as const;
