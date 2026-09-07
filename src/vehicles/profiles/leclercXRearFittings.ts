// Original closed solids from scalar planes of the four source rear service
// brackets. The central depressed channels are not full bounding boxes.
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

function top(z: number): number {
  if (z < -3.458298) return (2.25196223065132 + .23104833641178665 * z) / .9729422728206158;
  if (z < -3.351443) return (3.0110833416416414 + .49564372652893435 * z) / .8685259330339602;
  return 1.5543135404586792;
}

function bottom(z: number): number {
  if (z < -3.458298) return (.9093540167972263 - .10602860978043217 * z) / .9943630795177528;
  if (z < -3.351443) return 1.301005864089664 + (z + 3.38) * .22096652566172845 / .9752813924898724;
  return 1.3375489965948684 + (z + 3.28) * .38796699853730804 / .9216732653418741;
}

function band(P: TankBuilderPort, a: number, b: number, zs: readonly number[],
  upper: (z: number) => number, lower: (z: number) => number, bucket = 'hullDetail'): void {
  P.addEquipment(bucket, sectionSolid(zs.map(z => ({ z,
    ring: [[a, lower(z)], [b, lower(z)], [b, upper(z)], [a, upper(z)]],
  }))));
}

function bracket(P: TankBuilderPort, a: number): void {
  const b = a + .267651, innerA = a + .085103, innerB = a + .178434;
  const zs = [-3.565152645111084, -3.458298, -3.351443, -3.176742];
  band(P, a, innerA, zs, top, bottom);
  band(P, innerB, b, zs, top, bottom);
  const floorRear = (z: number): number => (1.4572144652375782 + .016066726908546495 * z) / .9998709218126337;
  band(P, innerA, innerB, [-3.565152645111084, -3.458298, -3.40458], floorRear, bottom);
  const floorRamp = (z: number): number => 1.4015446155715545 + (z + 3.38) * .49564372652893435 / .8685259330339602;
  band(P, innerA, innerB, [-3.40458, -3.351443, -3.340951], floorRamp, bottom);
  band(P, innerA, innerB, [-3.340951, -3.187234], () => 1.4304746389389038, bottom);
  band(P, innerA, innerB, [-3.187234, -3.176742], z => 1.4304746389389038
    + (z + 3.187234) * (1.5543135404586792 - 1.4304746389389038) / .010492, bottom);
  // The small separate inset stock is attached through the lower channel;
  // source sidewalls remain higher, and the forward channel remains open.
  band(P, a + .092320, a + .171856, [-3.561271, -3.461298],
    z => 1.4622542119634723 + (z + 3.55) * .016069325,
    z => 1.3531075751477686 + (z + 3.55) * .016069325, 'hullDark');
}

export function addLeclercXRearFittings(P: TankBuilderPort): void {
  for (const left of [-.969233, -.493131, .182719, .680323]) bracket(P, left);
}
