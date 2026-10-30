// The release-262 Leopard 2-pattern hull and running gear, a fresh first-party build at the Christian II concept model's
// measured proportions (the owner, 2026-10-27: "the new leo ... should rightfully be based on the new model and use
// totally new tank generation"): the welded tub between the tracks, the sponsons over them, the upper glacis to the
// nose, the engine deck; seven road wheels, the raised front idler, the rear sprocket and four return rollers a side;
// three heavy bolted skirt blocks forward and six thin panels aft; the bow's lamps and tow eyes, the driver's hatch, the
// stern's grilles and lights. The Christian II (christian2.ts) and the Leopard 2A3 of the fourth batch ride it; the
// datums and the combat envelope on them are leopard2HullDatums.ts's.
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';

const H = LEOPARD2_HULL;

/** What a vehicle on the hull draws its own way. */
export interface Leopard2HullOptions {
  /** The rear mudguard flaps' articulation name (one per vehicle). */
  readonly flapName: string;
  /** The exhaust grilles at the engine deck's rear corners: pressed louvres, or round rods (the 2A3's fourth batch). */
  readonly exhaust: 'louvre' | 'rods';
}

/** Linear interpolation along a [z, y] station line, held past its ends. */
export function lineAt(line: readonly (readonly [number, number])[], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [z0, y0] = line[i - 1], [z1, y1] = line[i];
    if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return line[line.length - 1][1];
}

export const mirrorRing = (ring: readonly SectionPoint[]): SectionPoint[] =>
  ring.map(([x, y]) => [-x, y] as SectionPoint).reverse();

/** The hull stations: every deck and belly break, so both lines are drawn exactly. */
function hullStations(z0: number, z1: number): number[] {
  const zs = new Set<number>([z0, z1]);
  for (const [z] of [...H.deck, ...H.belly]) if (z > z0 && z < z1) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

/** The lower tub between the tracks, its sponsons over them, the ring's race collar. */
function hull(P: TankBuilderPort): void {
  const tw = H.tubHalfWidthM;
  P.add('hull', sectionSolid(hullStations(-3.80, 3.45).map((z): SolidSection => {
    const roof = lineAt(H.deck, z), floor = Math.min(lineAt(H.belly, z), roof - 0.08), bevel = Math.min(0.05, (roof - floor) * 0.3);
    return { z, ring: [[-tw + 0.03, floor], [tw - 0.03, floor], [tw, floor + bevel], [tw, roof], [-tw, roof], [-tw, floor + bevel]] };
  })));
  for (const side of [-1, 1]) {
    // sponsons from the tub's wall out over the track, flat-floored at 1.36, their tops the deck line
    const rows = hullStations(-3.80, 3.30).map((z): SolidSection => {
      const top = Math.max(lineAt(H.deck, z), H.sponsonFloorY + 0.06);
      const ring: SectionPoint[] = [[tw - 0.02, H.sponsonFloorY], [H.sponsonHalfWidthM, H.sponsonFloorY],
        [H.sponsonHalfWidthM, top - 0.025], [H.sponsonHalfWidthM - 0.025, top], [tw - 0.02, top]];
      return { z, ring: side > 0 ? ring : mirrorRing(ring) };
    });
    P.add('hull', sectionSolid(rows));
  }
  P.add('hullDark', KIT.cylY(1.02, 1.02, 0.03, P.q ? 48 : 24), 0, lineAt(H.deck, H.ring[2]) + 0.005, H.ring[2]);
}

/** The model's skirts: three heavy bolted blocks forward, chamfered at the leader, a long two-band run aft. */
function skirts(P: TankBuilderPort, o: Leopard2HullOptions): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    // the skirts hang 0.46 m from the sponson's floor: the upper hull's band stands bare above them
    const top = H.skirtTopY, bottom = top - 0.46;
    const blocks: Array<[number, number]> = [[1.42, 2.02], [2.04, 2.64], [2.66, 3.16]];
    for (const [z0, z1] of blocks) {
      const lead = z1 > 3.0;
      const ring = (z: number, foot: number): SolidSection => {
        const r: SectionPoint[] = [[1.70, foot], [1.818, foot], [1.818, top], [1.70, top]];
        return { z, ring: side > 0 ? r : mirrorRing(r) };
      };
      P.add('hull', sectionSolid(lead
        ? [ring(z0, bottom), ring(z1 - 0.18, bottom), ring(z1, top - 0.24)]
        : [ring(z0, bottom), ring(z1, bottom)]));
      // the heavy block's bolts: two rows of three on its face
      for (const z of [z0 + 0.10, (z0 + z1) / 2, z1 - (lead ? 0.26 : 0.10)]) {
        for (const y of [top - 0.08, bottom + 0.08]) P.add('hullDetail', KIT.cylX(0.022, 0.018, 8), side * 1.827, y, z);
      }
    }
    // six panels aft; over the sprocket the last is a 12 cm fender strip, so the sprocket and its wrap show whole
    const n = 6, a = -3.66, b = 1.40, L = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const zc = a + L * (k + 0.5), d = L - 0.016;
      if (k === 0) {
        P.add('hull', box(0.034, 0.12, d), side * 1.703, top - 0.06, zc);                  // fender strip
        P.add('hullDark', box(0.028, 0.12, 0.014), side * 1.708, top - 0.06, a);
        continue;
      }
      P.add('hull', box(0.034, 0.24, d), side * 1.703, top - 0.12, zc);                    // proud upper band
      P.add('hull', box(0.028, 0.22, d), side * 1.697, top - 0.35, zc);                    // recessed lower band
      P.add('hullDark', box(0.028, 0.44, 0.014), side * 1.708, top - 0.23, a + L * k); // seam, 23 mm clear of the belt
    }
    // the hanging rails along the sponson's edge, flush with each run's face (the fore blocks step 10 cm out)
    P.add('hullDetail', box(0.055, 0.02, b - a + 0.06), side * 1.6975, top + 0.01, (a + b) / 2);
    P.add('hullDetail', box(0.148, 0.02, 1.74), side * 1.744, top + 0.01, 2.29);
    // front mudguard over the idler, running out ahead of the nose with a turned-down lip, and the rear flap off the
    // sponson's end
    P.add('hull', sectionSolid([[3.16, 1.32, 1.40], [3.40, 1.25, 1.33], [3.62, 1.18, 1.26], [3.70, 1.12, 1.24]].map(([z, foot, lid]): SolidSection => {
      const r: SectionPoint[] = [[1.05, foot], [1.72, foot], [1.72, lid], [1.05, lid]];
      return { z, ring: side > 0 ? r : mirrorRing(r) };
    })));
    P.hangMudguard(o.flapName, 'hullRubber', box(0.60, 0.42, 0.025), side * 1.36, 1.15, -3.74);
  }
}

/** The glacis's slope at z (radians, nose down positive): a fitting set on it is turned by this about X. */
function glacisTilt(z: number): number {
  return Math.atan2(lineAt(H.deck, z - 0.05) - lineAt(H.deck, z + 0.05), 0.10);
}

/**
 * The bow's tow eyes, the armoured headlight pods with their guards and the splash board on the glacis, the driver's
 * hatch and periscopes on its slope; the engine deck's round fan covers, radiator louvres, access plates and exhaust
 * grilles, the lifting eyes; the stern's exhaust band, tail lights, tow hooks and crossed tow cables, convoy light and rack.
 */
function hullFittings(P: TankBuilderPort, o: Leopard2HullOptions): void {
  const { box, cylX, cylY, torus } = KIT;
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.12, 0.10, 0.12), side * 0.70, 1.02, 3.40);
    P.add('hullDark', torus(0.06, 0.018, 10), side * 0.70, 0.98, 3.47);
    // the headlight pod: an armoured box on the glacis's lower slope, two lamps in its face, a guard round it
    const pz = 3.08, py = lineAt(H.deck, pz), px = side * 1.16;
    P.add('hull', box(0.30, 0.15, 0.20), px, py + 0.07, pz);                                     // painted housing
    for (const dx of [-0.07, 0.07]) KIT.headlight(P, px + dx, py + 0.085, pz + 0.09, 0, 0.045);
    for (const gx of [-0.165, 0.165]) P.add('hullDetail', box(0.016, 0.20, 0.30), px + gx, py + 0.09, pz + 0.03);
    P.add('hullDetail', box(0.346, 0.016, 0.016), px, py + 0.19, pz + 0.17);
    // the splash board's arm: from the apex ahead of the driver back and out across the glacis
    P.add('hullDetail', box(0.88, 0.14, 0.05), side * 0.38, lineAt(H.deck, 2.78) + 0.065, 2.78, glacisTilt(2.78), side * 0.54, 0);
  }
  // the driver's hatch (right front) on the glacis's slope, its periscopes ahead of it
  const hz = 2.06, hy = lineAt(H.deck, hz), tilt = glacisTilt(hz);
  P.add('hullDetail', cylY(0.31, 0.32, 0.04, P.q ? 24 : 14), -0.55, hy + 0.012, hz, tilt, 0, 0);
  P.addHatch('hullHatch', cylY(0.26, 0.26, 0.03, P.q ? 20 : 12), -0.55, hy + 0.045, hz, tilt, 0, 0);
  P.add('hullDark', box(0.24, 0.02, 0.03), -0.55, hy + 0.068, hz - 0.12, tilt, 0, 0);
  P.add('hullDetail', box(0.12, 0.07, 0.10), -0.55, hy + 0.05, hz - 0.30, tilt, 0, 0);                 // hinge boss
  for (const dx of [-0.17, 0, 0.17]) {
    const z = 2.40, y = lineAt(H.deck, z);
    P.add('hullDetail', box(0.15, 0.08, 0.10), -0.55 + dx, y + 0.04, z, glacisTilt(z), 0, 0);
    P.add('hullGlass', box(0.11, 0.03, 0.012), -0.55 + dx, y + 0.055, z + 0.051, glacisTilt(z), 0, 0);
  }
  // the engine deck: the two round cooling-fan covers either side of a bolted access plate, the radiator louvres
  // outboard of them, two bolted access plates ahead on the deck's slope
  for (const side of [-1, 1]) {
    const fx = side * 0.62, fz = -3.12, fy = lineAt(H.deck, fz), seg = P.q ? 32 : 18;
    P.add('hullDark', cylY(0.42, 0.42, 0.008, seg), fx, fy + 0.002, fz);
    P.add('hullDetail', torus(0.42, 0.022, seg), fx, fy + 0.012, fz);
    P.add('hullDetail', torus(0.25, 0.012, seg), fx, fy + 0.012, fz);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) P.add('hullDetail', box(0.84, 0.016, 0.02), fx, fy + 0.012, fz, 0, a, 0);
    P.add('hullDetail', cylY(0.07, 0.07, 0.03, 12), fx, fy + 0.016, fz);
    const rx = side * 1.36, rz = -3.10, ry = lineAt(H.deck, rz);
    P.add('hullDark', box(0.40, 0.006, 0.70), rx, ry + 0.004, rz);
    for (let k = 0; k < 7; k++) P.add('hullDetail', box(0.40, 0.012, 0.035), rx, ry + 0.014, rz - 0.30 + k * 0.10, 0.35, 0, 0);
    const az = -2.10;
    P.add('hullDetail', box(0.80, 0.012, 0.66), side * 0.60, lineAt(H.deck, az) + 0.006, az, glacisTilt(az), 0, 0);
    // the exhaust grilles at the deck's rear corners: pressed louvres, or the fourth batch's round rods
    const ex = side * 1.38, ez = -3.66, ey = lineAt(H.deck, ez);
    P.add('hullDark', box(0.40, 0.006, 0.24), ex, ey + 0.004, ez);
    if (o.exhaust === 'rods') {
      for (let k = 0; k < 8; k++) P.add('hullDetail', cylX(0.011, 0.40, 8), ex, ey + 0.016, ez - 0.105 + k * 0.03);
    } else {
      for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.40, 0.012, 0.035), ex, ey + 0.014, ez - 0.09 + k * 0.045, 0.35, 0, 0);
    }
    for (const [lz, ly] of [[1.30, lineAt(H.deck, 1.30)], [-3.52, lineAt(H.deck, -3.52)]]) {
      KIT.liftEye(P, 'hullDetail', side * 1.50, ly + 0.015, lz);
    }
    // the stern's corners: a tail-light cluster under the exhaust band's ends, a tow hook low
    P.add('hullDetail', box(0.18, 0.12, 0.05), side * 1.36, 1.28, -3.825);
    for (const dx of [-0.045, 0.045]) P.add('hullGlass', box(0.06, 0.05, 0.012), side * 1.36 + dx, 1.28, -3.852);
    P.add('hullDetail', box(0.12, 0.10, 0.10), side * 0.80, 0.90, -3.85);
    P.add('hullDark', torus(0.055, 0.018, 10), side * 0.80, 0.84, -3.91);
  }
  P.add('hullDetail', box(0.30, 0.012, 0.80), 0, lineAt(H.deck, -3.12) + 0.006, -3.12);
  P.add('hullDetail', box(0.30, 0.10, 0.06), 0, 1.30, -3.83);                                  // convoy light
  // the exhaust outlet: one louvred band across the upper rear plate under the deck's lip
  P.add('hullDark', box(2.90, 0.40, 0.006), 0, 1.57, -3.803);
  for (let k = 0; k < 8; k++) P.add('hullDetail', box(2.90, 0.035, 0.014), 0, 1.40 + k * 0.048, -3.81, -0.5, 0, 0);
  for (const y of [1.36, 1.78]) P.add('hullDetail', box(2.94, 0.03, 0.03), 0, y, -3.815);
  // the stern rack: a tubular frame on the deck's lip, standing back over the exhaust
  for (const y of [1.72, 1.82]) P.add('hullDetail', box(1.10, 0.03, 0.03), 0, y, -4.14);
  for (const dx of [-0.55, 0.55]) {
    P.add('hullDetail', box(0.03, 0.03, 0.34), dx, 1.82, -3.97);
    P.add('hullDetail', box(0.03, 0.13, 0.03), dx, 1.765, -4.14);
    // a stay from the rack's corner down to the rear plate
    P.add('hullDetail', box(0.025, 0.025, 0.42), dx, 1.585, -3.985, -0.86, 0, 0);
  }
  // the two tow cables crossed on the lower rear plate, their eyes on the tow hooks
  for (const side of [-1, 1]) {
    KIT.towCable(P, [[side * 0.80, 0.90, -3.865], [side * 0.36, 1.00, -3.84], [0, 1.06, -3.835], [-side * 0.62, 1.14, -3.835],
      [-side * 1.12, 1.20, -3.84]], 0.0175);
  }
}

/** Seven measured road wheels, the raised front idler, the rear sprocket and four return rollers a side. */
function runningGear(P: TankBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.84,
    wheelR: H.wheelR, wheelW: 0.23, wheelY: H.wheelY, xc: H.trackXc,
    wheelZs: [...H.wheelZs],
    idler: { ...H.idler }, sprocket: { ...H.sprocket },
    rollers: H.rollers.map((z) => ({ z, y: H.rollerY, r: H.rollerR })),
    trackW: H.trackW, topY: H.rollerY + H.rollerR + 0.045, botY: 0.075,
    paintedEnds: true, coveredTop: true,
  });
}

/** The hull, its skirts and fittings, and the running gear (in this order). */
export function buildLeopard2Hull(P: TankBuilderPort, o: Leopard2HullOptions): void {
  hull(P);
  skirts(P, o);
  hullFittings(P, o);
  runningGear(P);
}
