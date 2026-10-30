// Challenger 1 armour ratings (release 262; Main, 2026-10-27: "source public estimates for the Challenger 1 Mk 2 and
// Mk 3 armour ... so the CR1s stop inheriting the CR2's package", then "put the CR1 estimates on the fleet's own scale,
// and derive the factor rather than picking it"). Two documented steps, both in docs/references/tanks/challenger1_mk2.md
// ("Armour estimates"):
// 1. The public estimates in mm RHA equivalent, KE / CE (RAW): the Chobham turret front 470 / 600 (430-500 KE by
//    source, 430 the minimum across +-20 degrees), its gun slot at that minimum, the turret sides 140 / 300; the hull
//    front 300 / 580 on the early marks, raised to 350 / 700 on the late (Desert Storm) Mk 3. The marks differ only there.
// 2. The fleet's scale (SCALE): per zone, the median ratio of game value to public estimate over the fleet's sourced
//    Western peers. Turret front: Leopard 2A4 546/415 KE, 780/775 CE; M1A1 731/460 KE, 1075/750 CE; medians 1.452 KE,
//    1.220 CE. Hull front: the M1A1 alone (no sourced Leopard 2A4 hull figure), 516/350 KE, 645/750 CE.
// The plate layout and every other plate keep the Challenger 2 donor's.
import type { ArmorEnvelope } from './specHelpers.ts';

type Rating = readonly [keMm: number, ceMm: number];
const RAW = Object.freeze({
  turretFront: [470, 600] as Rating, gunSlot: [430, 600] as Rating, turretSide: [140, 300] as Rating,
  hullFront: { early: [300, 580] as Rating, late: [350, 700] as Rating },
});
const SCALE = Object.freeze({ turret: [1.452, 1.220] as Rating, hull: [1.474, .860] as Rating });
export type Challenger1HullFront = keyof typeof RAW.hullFront;
const scaled = ([ke, ce]: Rating, [kf, cf]: Rating): Rating => [Math.round(ke * kf), Math.round(ce * cf)];

/** Rates a Challenger 2-layout armour envelope with the Challenger 1's estimates on the fleet's scale, in place. */
export function rateChallenger1Armor(armor: ArmorEnvelope, hull: Challenger1HullFront): ArmorEnvelope {
  const front = scaled(RAW.turretFront, SCALE.turret), side = scaled(RAW.turretSide, SCALE.turret);
  const glacis = scaled(RAW.hullFront[hull], SCALE.hull);
  const ratings: Readonly<Record<string, Rating>> = {
    turret_cheek_R: front, turret_cheek_L: front, mantlet_slot: scaled(RAW.gunSlot, SCALE.turret),
    turret_side_R: side, turret_side_L: side, upper_glacis: glacis, lower_front: glacis,
  };
  for (const plate of [...armor.hullPlates, ...armor.turretPlates]) {
    const rating = ratings[plate.name];
    if (rating && (plate.kind ?? 'main') === 'main') [plate.keMm, plate.ceMm] = rating;
  }
  return armor;
}
