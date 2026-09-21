// Owner-directed modern American missile carrier, all dimensions in metres.
import { GRIFFIN_TURRET_SCALE as S, GRIFFIN_TURRET_PIVOT } from './profiles/griffinProportions.ts';
export const VIPER = Object.freeze({
  turretPivot: [...GRIFFIN_TURRET_PIVOT] as [number, number, number],
  gunPivot: [0, 1.20*S, 0] as [number, number, number],
  mouthZ: 1.188, boreRadius: .07,
});
export const VIPER_MUZZLES = [-1, 1].flatMap(side =>
  [-.39, -.13, .13, .39].flatMap(dx => [-.14, .14].map(y =>
    ({ x: (side * 1.02 + dx)*S, y:y*S, z: VIPER.mouthZ }))));
