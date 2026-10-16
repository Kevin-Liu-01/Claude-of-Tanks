// Owner-authorized reinterpretation of the original broad welded Hetman.
// It is a separate concept; the twelve current national designs are unchanged.
export const HETMAN_II_DESIGN = {
  id: 't72b3m_hetman_ii',
  name: 'T-72B3M Hetman II (Concept)',
  y: 1.445, z: .114315,
  // Owner 2026-10-15 (VEH-21): the T-72B3M (2016) turret itself (nationalDonorTurrets.ts); the station stands on its
  // commander's cupola (turret frame).
  roofY: .82,
  rws: [-.627, .808, -.359],
  cupola: [-.627, .808, -.359],
  heightM:3.31,
  width:4.60824,
  hullLength:7.509,
  description: 'A Ukrainian command modernization of the Hetman line on the T-72B3M (2016) turret, its Relikt cheek fan and roof cassettes retained: squared armour cabinets with two wall courses and a lid course of ERA enclose the bustle boxes on both flanks, and an open command basket with slat walls, stowage and a rear cable drum extends the bustle. Twin sensor heads, a scanner, two command panoramas, slit lamps, wide anti-drone roof cage wings, a 30 mm remote weapon on the commander\u2019s cupola, fitted heavy skirts and its own field nets set it apart from the compact Hetman.',
} as const;
