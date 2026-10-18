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
  // Zubr (owner 2026-10-15, VEH-22): the T-72B3M (2016) turret on the T-72B3 hull (nationalDonorTurrets.ts), so the
  // turret datums are the donor's in its own frame: roof crown .82, the remote station on the commander's cupola.
  {
    heightM:3.05,roofY: .82, rws: [-.627, .808, -.359], cupola: [-.627, .808, -.359],
    hullLength:6.95035, width:4.283, turretRear: -1.47,
    // Release 227 (owner 2026-10-16): its own Krata frontal package (profiles/polandFrontEra.ts) and a 12.7 mm WKM-B
    // field emplacement in place of the 30 mm low-shield cannon.
    description: 'Polish T-72B3 compact modernization concept on its low native hull, carrying the T-72B3M (2016) turret with its ring of stowage boxes. Welded cheek boxes wrap the turret front and forward flanks, faced by a grid of ERAWA-2 cassettes in a welded frame of bars and mullions, with a two-tile roof row ahead of the cupolas; slat screens hang outboard of the stowage boxes from welded roof-shoulder stanchions that carry round driving lamps and guarded laser-warning heads; a 12.7 mm WKM-B field emplacement open in its cradle behind a bolted square light shield with raked wings, aimed and fired by its remote station, replaces the commander\'s machine gun on his cupola, beside a flat sensor head and a roof radome; a compact rear rack carries the strapped camouflage roll, a service case, clamped tools and the whips. The hull carries framed glacis cassette fields with armoured lamp pockets, a framed lower front plate, beveled wraparound skirts with a fitted front grid joined to the native fenders by continuous fitted shoulders, slat screens and the woodland field suit with leaves.'
  },
] as const;
