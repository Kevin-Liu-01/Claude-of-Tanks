// The Russian 152 mm line's datums (release 269), shared by the specs (russia152Specs.ts) and the builds
// (profiles/object292X.ts, object477Molot.ts, object195X.ts, t14_152X.ts) so the hit model's ring, gun and hull and the
// drawn ones are the same. Boot-light: plain data. World (hull-frame) metres, ground at y 0; tank forward is +Z.
import { T80U_X_RING_RAISE_M } from './t80uXArmor.ts';

/** The T-14 152's 2A83: the T-14's trunnion raised 7 cm for the larger mantlet, its muzzle 5.75 m ahead of it. */
export const T14_152_GUN_FRAME = Object.freeze({ trunnionY: 2.121, trunnionZ: 1.00, muzzleZ: 6.75 });

/** The Object 292 on the T-80U X hull (profiles/t80uX.ts; owner 2026-11-04: "only use modern new hulls like the new t80 x
 * hull"): the casting's ring on the T-80U X raised race, the LP-83's trunnion in the casting's own embrasure (the T-80U X
 * trunnion), its muzzle 3.5 m past the hull's nose at 3.36 (Kubinka); the welded box's roof 0.74 m over the ring, 0.12 m
 * over the casting's crown (the Kubinka photographs: the box stands about 0.6 m over the hull's roof). */
export const OBJECT292_FRAME = Object.freeze({
  ringY: 1.55158 + T80U_X_RING_RAISE_M, ringZ: 0.0718698169,
  trunnionY: 1.7564274071 + T80U_X_RING_RAISE_M, trunnionZ: 1.4199398169, muzzleZ: 6.86, boxRoof: 0.74,
});

/** The Object 195: a 7.9 m hull on seven road wheels (militaryrussia; btvt), its unmanned module's ring amidships over the
 * autoloader's carousel, the 2A83's trunnion in the module's lower half, about half a metre over the hull's roof (Gur Khan's
 * hangar photograph, owner image 2: the tube leaves the module's face 40 % of the way up; 2.30 m stood it a metre over
 * the roof), 10.6 m over the gun. */
export const OBJECT195_FRAME = Object.freeze({
  hullFrontZ: 3.95, hullRearZ: -3.95, roofY: 1.60, ringY: 1.60, ringZ: -0.30,
  trunnionY: 2.12, trunnionZ: 0.95, muzzleZ: 6.70,
});

/** The Object 477 Molot: btvt's 10,650 mm over the gun, 2,434 mm to the turret's roof and a 2,088 mm line of fire; the
 * high hull's long nose ahead of a low turret, the gun in its armoured casing on the turret's roof. */
export const MOLOT_FRAME = Object.freeze({
  hullFrontZ: 3.75, hullRearZ: -3.55, roofY: 1.60, ringY: 1.60, ringZ: -0.10,
  trunnionY: 2.088, trunnionZ: 0.80, muzzleZ: 7.10, casingTopY: 2.434,
});
