import type {BufferGeometry} from 'three';
import {turnedGearStock, gearFastener} from './runningGearPrimitives.ts';
import {mergeAll, xform} from './factoryGeometry.ts';

export interface PairedRunningGearStockOptions {
  radiusM: number;
  axialWidthM: number;
  guideGapM: number;
  high: boolean;
  steel?: boolean;
}

function mergeOwnedStock(parts: readonly BufferGeometry[]): BufferGeometry {
  // mergeAll owns its non-indexed intermediates. Its indexed inputs remain
  // caller-owned; these new leaf primitives never retain or share them.
  try { return mergeAll(parts); }
  finally { for (const part of parts) if (part.index) part.dispose(); }
}

/** Two closed turned wheel halves, a recessed hub and an actual guide channel.
 * No source buffers or independent static overlays. Local X is the spin axle;
 * returned fresh buffers transfer to the canonical running-gear owner. */
export function pairedRunningGearStock(options: PairedRunningGearStockOptions): {
  disc: BufferGeometry; dark: BufferGeometry; tire: BufferGeometry | null;
} {
  const {radiusM:r, axialWidthM:w, guideGapM:gap, high, steel=false}=options;
  if (![r,w,gap].every(v=>Number.isFinite(v)&&v>0) || gap>=w
    || typeof high!=='boolean' || typeof steel!=='boolean')
    throw new RangeError('Invalid paired running-gear stock');
  const segments=high?20:12,inner=gap/2,outer=w/2;
  const tire:BufferGeometry[]=[],paint:BufferGeometry[]=[],dark:BufferGeometry[]=[];
  for (const side of [-1,1]) {
    const ring=turnedGearStock([[r*.87,inner],[r,inner],
      [r,outer],[r*.87,outer],[r*.87,inner]],segments,side);
    (steel?paint:tire).push(ring);
    paint.push(turnedGearStock([[r*.27,inner],[r*.90,inner],[r*.90,outer+.002],
      [r*.27,w*.615],[r*.27,inner]],segments,side));
    if (high) for (let index=0;index<12;index++) {
      const angle=index*Math.PI/6+.13;
      dark.push(xform(gearFastener(r*.04,.012,true),side*(outer+.011),
        Math.sin(angle)*r*.63,Math.cos(angle)*r*.63));
    }
  }
  paint.push(turnedGearStock([[0,-w*.74],[r*.14,-w*.74],
    [r*.27,-w*.58],[r*.27,w*.58],[r*.14,w*.74],[0,w*.74],[0,-w*.74]],high?10:8));
  dark.push(turnedGearStock([[r*.27,-w*.637],[r*.32,-w*.637],
    [r*.32,w*.637],[r*.27,w*.637],[r*.27,-w*.637]],high?8:6));
  return {disc:mergeOwnedStock(paint),dark:mergeOwnedStock(dark),tire:tire.length?mergeOwnedStock(tire):null};
}
