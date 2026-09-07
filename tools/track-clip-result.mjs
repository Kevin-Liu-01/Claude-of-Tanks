/** A missing/failed track audit is not evidence of zero intersections. */
export function strictTrackClipPassed(result) {
  if (!result) return false;
  return ['front', 'rear', 'sweepBand', 'sweepShoe'].every(key => {
    const value = result[key];
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return Number(value) === 0;
  });
}
