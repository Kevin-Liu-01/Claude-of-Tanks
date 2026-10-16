// Owner-authorized Ukrainian concepts. These are authored design datums, not
// claimed measurements of historical vehicles. Native hull cores, fenders and
// running gear remain donor-owned; the packages are bolted onto that ancestry.
export const NATIONAL_UKRAINE_DESIGNS = [
  {
    heightM:3.17,roofY: .69, rws: [.55, .69, -.70], cupola: [-.55, .69, -.70],
    hullLength:6.72, width:4.331, turretRear: -1.44,
    description: 'Ukrainian T-80U assault modernization: the native low turbine hull and curved fenders carry a compact rounded turret, connected split-chevron cheek and flank housings, a short joined rear return, mounted ERA, assault utility cases, guarded lamps and thick chamfered skirt assemblies joined to the native fenders by fitted shoulder panels.',
  },
  {
    // Owner 2026-10-15 (VEH-21): the T-72B3M (2016) turret itself (nationalDonorTurrets.ts); the station stands on its
    // commander's cupola (turret frame), the bustle screen reaches 2.1 m aft of the ring.
    heightM:3.33,roofY: .82, rws: [-.627, .808, -.359], cupola: [-.627, .808, -.359],
    hullLength:7.31, width:4.391, turretRear: -2.10,
    description: 'Ukrainian T-72B3M command modernization: the retained low native hull keeps its layered skirt assemblies, glacis cassettes and fitted shoulder panels, and carries the T-72B3M (2016) turret itself with its Relikt cheek fan and roof cassettes. The Ukrainian package clamps Nizh module housings with two courses of cassettes on the forward bustle boxes of both flanks, wraps the rear boxes in a slat screen, and adds anti-drone roof cage wings, a 30 mm remote cannon on the commander\u2019s cupola, paired guarded lamps, a sensor head, a roof radome, a command panorama, radio cases, aerials and a leafy field net.',
  },
  {
    // Owner 2026-10-15 (VEH-21): the T-72B3 turret itself (nationalDonorTurrets.ts); the station stands on its
    // cupola's raised hatch ring (turret frame), the bustle screen reaches 1.84 m aft of the ring.
    heightM:3.05,roofY: .82, rws: [-.614, .993, -.499], cupola: [-.614, .993, -.499],
    hullLength:6.8784, width:4.53417, turretRear: -1.84,
    description: 'Ukrainian T-72B3 field modernization: the original low glacis and folded fenders remain exposed above thick removable skirt modules on a permanent wraparound carrier, and the turret is the T-72B3\u2019s own with its Kontakt-5 cheeks and roof cassettes. Kontakt-style brick banks are clamped on both side stowage cases and on a housing built out from the bare commander-side flank, a slat screen wraps the rear cases, and anti-drone cage wings, a 30 mm remote cannon on the raised cupola ring, slit lamps, a sensor head, a spine sensor, a shovel and pry bar, utility cans, a tarpaulin roll and leafy camouflage complete the field fit.',
  },
] as const;
