// The AS21 Redback's datums (release 269; profiles/redback.ts builds it, australiaSpecs.ts fits the combat envelope to
// them): Hanwha's 8.8 m, 3.6 m wide and 3.8 m high; Janes' 7.9 m hull. The stations are read off the 2021 live-fire
// profile (side_L_livefire2021, a near-square left profile: 208 px a metre on the 7.9 m hull), checked on the 2026
// production vehicle (front34_L_hace_testtrack), the Commons head-on (front_commons_cc0) and the Land Forces 2021 and
// 2024 photographs: seven 0.53 m road wheels a side on a 0.78 m pitch, the sprocket ahead and the idler high astern,
// the 11-degree glacis from the 1.48 m nose to the roof's knee, the turret ring 0.30 m behind the hull's middle and the
// 30 mm muzzle 0.8 m inside the nose with the gun ahead. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

export const REDBACK = Object.freeze({
  /** Hull ends (hull metres, +Z forward, ground y 0), the hull's half-width over its appliqué (3.64 m over the ledges,
   *  Janes), its roof. */
  noseZ: 3.95, sternZ: -3.95, halfWidthM: 1.78, roofY: 2.00,
  /** The hull's own side under the appliqué, the lower hull between the tracks, the belly, the sponsons' floor. */
  wallX: 1.70, tubX: 1.12, bellyY: 0.46, sponsonY: 1.16,
  /** The glacis: its knee on the roof, the nose's top edge; the upper front plate down to its dark band, the lower
   *  front plate down to the belly. */
  glacisZ: 1.30, noseTopZ: 3.92, noseTopY: 1.50, frontPlateLowY: 1.12, lowerNoseZ: 3.74,
  /** The rear plate's foot and the belly's rear end. */
  rearPlateLowY: 0.82, rearBellyZ: -3.62,
  /** The side appliqué: the skirt's foot over the wheels, the course joint's ledge, the upper course's front edge; the
   *  lower course's raked front edge from its foot to the ledge, clear of the sprocket (front34_L_hace_testtrack). */
  skirtLowY: 0.60, ledgeY: 1.24, sideFrontZ: 3.88, skirtFootFrontZ: 3.20, skirtTopFrontZ: 3.62,
  /** Running gear: seven road wheels, the sprocket ahead, the idler astern, three hidden return rollers. */
  roadWheelCount: 7,
  wheelZs: Object.freeze([2.82, 2.035, 1.25, 0.465, -0.32, -1.105, -1.89] as const),
  wheelR: 0.265, wheelY: 0.34, trackXc: 1.42, trackW: 0.55,
  sprocket: Object.freeze({ z: 3.55, y: 0.77, r: 0.26 }),
  idler: Object.freeze({ z: -3.45, y: 0.70, r: 0.26 }),
  /** The turret ring's centre on the roof and the trunnion in the turret's frame (the gun 5 cm left of the ring). */
  ring: Object.freeze([0, 2.00, -0.30] as const),
  trunnion: Object.freeze([0.05, 0.44, 0.95] as const),
  /** The 30 mm Mk44S from the trunnion to the muzzle (the muzzle at hull z 3.15 with the gun ahead). */
  barrelM: 2.50,
  /** The T2000 turret (turret metres from the ring on the roof): the right half's roof, the left block's top, the walls,
   *  the prows' noses and the rear face. */
  turret: Object.freeze({ roofY: 0.70, blockTopY: 0.90, floorY: 0.10, rightX: -1.02, leftX: 1.12, slotR: -0.22,
    slotL: 0.30, noseZ: 1.45, rearZ: -1.58 }),
});
