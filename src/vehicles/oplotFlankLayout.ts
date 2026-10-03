// Shared turret-frame layout of the rebuilt T-84 Oplot's bustle flank and its three reactive side cassettes,
// read by the builder (profiles/oplotModern.ts), the gameplay seed plates (fleetRenewalSpecs.ts) and the
// flank ghillie drape (ghillieSuit.ts), so the visible cassettes, their combat plates and the net agree.
//
// The welded body's side wall is vertical up to y 0.30 and widens in plan from 1.14 m at the bustle rear
// (z -2.15) to 1.48 m at z -0.50. The front cassette rides the near-parallel shoulder ahead of that taper, as
// main's rebuild authored it (245aa4e4e). The middle and rear cassettes follow the taper: each is yawed onto
// the wall with its inboard face 12 mm into the vertical band. In a straight row at x 1.47 they stood 45 mm and
// 131 mm off the shell with nothing behind them (2026-10-03).
export const OPLOT_BUSTLE_FLANK = Object.freeze({ rearZ: -2.15, rearHalfWidthM: 1.14, rearRoofY: .66,
  shoulderZ: -.50, shoulderHalfWidthM: 1.48, shoulderRoofY: .74, wallTopY: .30 });
export const OPLOT_FLANK_CASSETTE = Object.freeze({ widthM: .12, heightM: .43, depthM: .39, centerY: .32,
  frontCenterX: 1.47, stations: Object.freeze([-.60, -1.04, -1.48]), embedM: .012 });

const taper = (OPLOT_BUSTLE_FLANK.shoulderHalfWidthM - OPLOT_BUSTLE_FLANK.rearHalfWidthM)
  / (OPLOT_BUSTLE_FLANK.shoulderZ - OPLOT_BUSTLE_FLANK.rearZ);
const secant = Math.hypot(1, taper);

/** Half-width of the bustle's vertical side wall at turret-frame z (rear to shoulder). */
function oplotBustleHalfWidth(z: number): number {
  return OPLOT_BUSTLE_FLANK.rearHalfWidthM + (z - OPLOT_BUSTLE_FLANK.rearZ) * taper;
}

interface OplotFlankCassetteSeat {
  /** Right-side centre; the left cassette mirrors x and the yaw. */
  readonly center: readonly [number, number, number];
  /** Rotation about y for the right side (left: negated). */
  readonly yaw: number;
  /** Right-side outer face at the cassette's front and rear ends, [x, z]. */
  readonly outerFront: readonly [number, number];
  readonly outerRear: readonly [number, number];
}

/** Seat of flank cassette `index` (0 front, 1 middle, 2 rear). */
export function oplotFlankCassetteSeat(index: number): OplotFlankCassetteSeat {
  const { widthM: w, depthM: d, centerY, frontCenterX, stations, embedM } = OPLOT_FLANK_CASSETTE;
  const z = stations[index];
  if (z === undefined) throw new RangeError(`Oplot flank cassette ${index} does not exist`);
  if (index === 0) {
    return { center: [frontCenterX, centerY, z], yaw: 0,
      outerFront: [frontCenterX + w / 2, z + d / 2], outerRear: [frontCenterX + w / 2, z - d / 2] };
  }
  // Outward wall normal (x, z) and the wall's forward direction, both unit length.
  const normal = [1 / secant, -taper / secant], along = [taper / secant, 1 / secant];
  const wallX = oplotBustleHalfWidth(z), offset = w / 2 - embedM;
  const cx = wallX + normal[0] * offset, cz = z + normal[1] * offset;
  const ox = cx + normal[0] * w / 2, oz = cz + normal[1] * w / 2;
  return { center: [cx, centerY, cz], yaw: Math.atan(taper),
    outerFront: [ox + along[0] * d / 2, oz + along[1] * d / 2], outerRear: [ox - along[0] * d / 2, oz - along[1] * d / 2] };
}

/** Right-side x of the cassettes' outer faces at turret-frame z, joined straight across the gap between the
 * front cassette and the tapered pair (for the flank drape that hangs over them). */
export function oplotFlankOuterX(z: number): number {
  const front = oplotFlankCassetteSeat(0), middle = oplotFlankCassetteSeat(1);
  if (z >= front.outerRear[1]) return front.outerRear[0];
  if (z >= middle.outerFront[1]) {
    const t = (z - middle.outerFront[1]) / (front.outerRear[1] - middle.outerFront[1]);
    return middle.outerFront[0] + (front.outerRear[0] - middle.outerFront[0]) * t;
  }
  return oplotBustleHalfWidth(z) + (OPLOT_FLANK_CASSETTE.widthM - OPLOT_FLANK_CASSETTE.embedM) * secant;
}
