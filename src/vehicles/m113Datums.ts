// The M113A1 hull's datums (release 269; profiles/m113.ts builds it, australiaSpecs.ts fits the combat envelope to it):
// the published M113A1 and the AS4's stretch. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

export type M113Mark = 'fsv' | 'mrv' | 'as4';

/** The AS4's stretch: a sixth road wheel and 0.666 m more hull ahead of the rear plate. */
const AS4_STRETCH = 0.666;
export const M113_BASE = Object.freeze({
  // shroudY: the side's foot over the tracks, clear of the track over the sprocket and through its top run's sweep (0.92 m
  // at most, the release check's clip audit); between the tracks the hull runs down to sideLowY and the belly
  length: 4.863, roofY: 1.86, noseY: 0.99, glacisRun: 0.79, sideLowY: 0.80, shroudY: 0.97, hw: 1.27, tubHw: 0.93, bellyY: 0.43,
  xc: 1.15, trackW: 0.38, wheelR: 0.305, wheelY: 0.39, wheelPitch: 0.70, firstWheelBack: 1.00, sprocketBack: 0.34,
  idlerFromRear: 0.32,
});
/** The turret ring's distance behind the nose (the AS4 profile; the FSV's and MRV's turrets over the fighting
 * compartment behind the driver). */
const RING_BACK: Readonly<Record<M113Mark, number>> = Object.freeze({ fsv: 1.95, mrv: 1.95, as4: 2.55 });

interface M113Datums {
  readonly length: number; readonly noseZ: number; readonly sternZ: number; readonly glacisTopZ: number;
  readonly wheelZs: readonly number[]; readonly ringZ: number;
}

export function m113Datums(mark: M113Mark): M113Datums {
  if (mark !== 'fsv' && mark !== 'mrv' && mark !== 'as4') throw new Error(`m113: unknown mark '${String(mark)}'`);
  const length = M113_BASE.length + (mark === 'as4' ? AS4_STRETCH : 0), noseZ = length / 2, sternZ = -length / 2;
  const wheels = mark === 'as4' ? 6 : 5;
  const wheelZs = Array.from({ length: wheels }, (_, k) => noseZ - M113_BASE.firstWheelBack - k * M113_BASE.wheelPitch);
  return { length, noseZ, sternZ, glacisTopZ: noseZ - M113_BASE.glacisRun, wheelZs, ringZ: noseZ - RING_BACK[mark] };
}
