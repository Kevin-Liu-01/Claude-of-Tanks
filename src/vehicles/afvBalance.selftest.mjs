/** Regression coverage for the class-wide AFV durability package. */

import './tankFactory.js'; // registers modern roster extension specs
import { AFV_HP_BONUS, getSpec } from './specs.js';

const expected = [
  ['m2a2_bradley', 1300, 60],
  ['bmp2', 900, 35],
  ['spz_puma', 1500, 160],
  ['type89', 1200, 45],
];

for (const [id, baseHp, baseFrontKe] of expected) {
  const spec = getSpec(id);
  if (spec.hp !== baseHp + AFV_HP_BONUS) {
    throw new Error(`${id}: expected ${baseHp + AFV_HP_BONUS} HP, got ${spec.hp}`);
  }
  const front = spec.armor.hullPlates.find((p) => p.name === 'upper_glacis');
  if (!front || front.keMm !== baseFrontKe + 45) {
    throw new Error(`${id}: frontal protection package was not applied`);
  }
  const track = spec.armor.hullPlates.find((p) => p.name === 'track_R');
  if (!track || track.keMm !== 20) {
    throw new Error(`${id}: external track protection must remain unchanged`);
  }
  if (getSpec(id).hp !== spec.hp) {
    throw new Error(`${id}: repeated lookup applied the HP bonus twice`);
  }
}
