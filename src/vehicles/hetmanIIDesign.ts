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
  // Release 227 (owner 2026-10-16: "brand new era packages ... innovate for the hetman 2"): its own frontal package
  // (profiles/ukraineFrontEra.ts) replaces the donor's Relikt fan and roof cassettes and the hull's native glacis Relikt.
  description: 'A Ukrainian command modernization of the Hetman line on the T-72B3M (2016) turret with its own frontal package: a stepped prow of three raked courses of deep discrete ERA blocks on two facets a side, each course set back as it rises, the blocks standing in open joints on short gunmetal ledges and divider plates behind a cheek frame post, with stacked jaw collars round the mantlet, shoulder returns and a roof course of three swept wedge blocks a side on a gunmetal sill rail and cleats; a framed chevron glacis of three sawtooth bands a side laid as shingled wedge blocks on gunmetal retainer ribs and joint cleats between a keel and two side rails; three hinged two-tier aprons a side on the lower front plate and two-layer bow modules on the front skirt banks; two three-segment LED bars in raised dark bezels in a nose sill and red infrared dazzler pods on the prow shelves. Squared armour cabinets with two wall courses and a lid course of chamfered ERA cassettes enclose the bustle boxes on both flanks, and an open command basket with slat walls, stowage and a rear cable drum extends the bustle. Twin sensor heads, a scanner, two command panoramas, slit lamps, wide anti-drone roof cage wings, a 30 mm remote weapon on the commander\u2019s cupola, fitted heavy skirts and its own field nets set it apart from the compact Hetman.',
} as const;
