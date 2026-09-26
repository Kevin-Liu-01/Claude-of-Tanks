/** Remap a flat loaded course to the actual side's axle stations at build time.
 * Moving only its end arcs can fold a short ground segment back on itself when
 * torsion-bar stagger exceeds that segment. Shoe normals then point into soil.
 * The same monotone interpolation moves every duplicate of each ground point;
 * it leaves the return run, end wheels and complete band cross-section intact.
 */
export function seatStaggeredTrackGround(
  positions: ArrayLike<number> & { [index: number]: number },
  rest: ArrayLike<number>, course: readonly (readonly [number, number])[],
  stations: readonly number[], sideStations: readonly number[], bottomY: number,
): void {
  if (stations.length !== sideStations.length || stations.length < 2) {
    throw new Error('Staggered ground run requires matching axle stations');
  }
  for (let i = 1; i < stations.length; i++) {
    if (!(stations[i] > stations[i - 1] && sideStations[i] > sideStations[i - 1])) {
      throw new Error('Staggered axle stations must be strictly increasing');
    }
  }
  const useNext = [1,1,0,1,0,0, 0,0,1,0,1,1, 0,1,1,0,1,0, 0,0,1,0,1,1];
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const segment = Math.floor(vertex / 24);
    const point = course[(segment + useNext[vertex % 24]) % course.length];
    if (Math.abs(point[1] - bottomY) > 1e-6) continue;
    const z = point[0];
    if (z < stations[0] - 1e-6 || z > stations.at(-1)! + 1e-6) continue;
    let next = 1;
    while (next < stations.length - 1 && z > stations[next]) next++;
    const ratio = (z - stations[next - 1]) / (stations[next] - stations[next - 1]);
    const shifted = sideStations[next - 1] + ratio * (sideStations[next] - sideStations[next - 1]);
    positions[vertex * 3 + 2] = rest[vertex * 3 + 2] + shifted - z;
  }
}
