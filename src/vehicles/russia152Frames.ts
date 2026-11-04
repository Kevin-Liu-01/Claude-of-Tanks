// The Russian 152 mm line's datums (release 269), shared by the specs (russia152Specs.ts) and the builds
// (profiles/object292.ts, object477Molot.ts, object195X.ts, t14_152X.ts) so the hit model's ring, gun and hull and the
// drawn ones are the same. Boot-light: plain data. World (hull-frame) metres, ground at y 0; tank forward is +Z.

/** The T-14 152's 2A83: the T-14's trunnion raised 7 cm for the larger mantlet, its muzzle 5.75 m ahead of it. */
export const T14_152_GUN_FRAME = Object.freeze({ trunnionY: 2.121, trunnionZ: 1.00, muzzleZ: 6.75 });

/** The Object 292's LP-83: its trunnion low in the casting's reworked embrasure, a little higher and further forward than
 * the 2A46's, its muzzle 6.15 m ahead (Kubinka: the muzzle stands about 3.5 m past the nose). */
export const OBJECT292_GUN_FRAME = Object.freeze({ trunnionY: 1.70, trunnionZ: 0.70, muzzleZ: 6.85 });

/** The Object 195: a 7.9 m hull on seven road wheels (militaryrussia; btvt), its unmanned module's ring amidships over the
 * autoloader's carousel, the 2A83's trunnion high in the tall module (the photographs), 10.6 m over the gun. */
export const OBJECT195_FRAME = Object.freeze({
  hullFrontZ: 3.95, hullRearZ: -3.95, roofY: 1.60, ringY: 1.60, ringZ: -0.30,
  trunnionY: 2.30, trunnionZ: 0.95, muzzleZ: 6.70,
});

/** The Object 477 Molot: btvt's 10,650 mm over the gun, 2,434 mm to the turret's roof and a 2,088 mm line of fire; the
 * high hull's long nose ahead of a low turret, the gun in its armoured casing on the turret's roof. */
export const MOLOT_FRAME = Object.freeze({
  hullFrontZ: 3.75, hullRearZ: -3.55, roofY: 1.60, ringY: 1.60, ringZ: -0.10,
  trunnionY: 2.088, trunnionZ: 0.80, muzzleZ: 7.10, casingTopY: 2.434,
});
