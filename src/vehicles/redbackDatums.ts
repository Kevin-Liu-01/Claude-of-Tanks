// The AS21 Redback's datums (release 269; profiles/redback.ts builds it, australiaSpecs.ts fits the combat envelope to
// them): Hanwha's 8.8 m over the gun, 3.6 m wide and 3.8 m high; Janes' 7.9 m hull; seven road wheels a side, the
// sprocket ahead. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

export const REDBACK = Object.freeze({
  /** Hull ends (hull metres, +Z forward, ground y 0), the hull's half-width over its appliqué, its roof. */
  noseZ: 3.95, sternZ: -3.95, halfWidthM: 1.80, roofY: 2.05,
  /** The turret ring's centre on the roof and the trunnion in the turret's frame. */
  ring: Object.freeze([0, 2.05, 0.10] as const),
  trunnion: Object.freeze([0, 0.42, 0.90] as const),
  /** The 30 mm Mk44S from the trunnion to the muzzle. */
  barrelM: 3.20,
  roadWheelCount: 7,
});
