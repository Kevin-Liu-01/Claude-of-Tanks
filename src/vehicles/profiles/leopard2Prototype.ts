// The Leopard 2 Prototype (leopard2_proto) as PT 10 / T 17: Krauss-Maffei's hull 10 under turret 17, one of the seven
// prototype turrets (T 11 to T 17) armed with the Rheinmetall 120 mm smoothbore, tried at Yuma in 1975 and kept at the
// Musee des Blindes, Saumur (the owner, 2026-11-20: "completely redesign the leopard 2 prototype"). A fresh first-party
// build from the walkarounds (panzerplace.eu: "Leopard 2 Prototype (PT 10 / T 17)" at Saumur and the PT 7 / T 05 at
// Strangnas, the same welded turret family and hull):
// - hull: the Leopard-1-like wedge bow, a long shallow upper glacis to a sharp nose over a raked lower glacis; the turret
//   deck, the raised engine deck with its two round fan grilles; the full-width louvred upper rear plate, the rear gun
//   crutch and the large mudflaps; PT 10's revised front fenders with the headlights built into them in hoop guards, the
//   forward travel lock's two brackets standing proud of the glacis and the tow eyes on the belly plate; full-length
//   panelled skirts hung from a fender ledge, scalloped over the road wheels, and long stowage bins on the fenders;
// - turret: the welded spaced-armour shell modelled on the Leopard 1A3 (so the EMES 12 could be retrofitted to the
//   Leopard 1): faceted walls flaring to a crease and leaning in to a flat roof, a long prow narrowing to the gun's face,
//   the base a little wider than the walls, the long bustle with its undercut rear plate; the EMES 12 rangefinder's ends
//   behind the armoured blocks on the front shoulders; the commander's PERI R12 and cupola (right), the loader's hatch
//   (left) and, by Kevin's call, the T 11's 20 mm Rh 202 on its left-roof mount, the four stand-offs T 16 and T 17 carried the fault-detection box on; one rack of four smoke mortars
//   a side; five grab handles a side (the later turrets'); the 120 mm under its canvas cover, a plain tube with a bore
//   evacuator;
// - running gear: the production Leopard 2's wheels, idler, sprocket, return rollers and track (leopard2Hull.ts), which
//   the prototypes introduced, on the prototype's own stations.
//
// Frames: hull metres (+Z forward, y up from the ground; the world's right of a +Z hull is -X); turret metres from the
// ring's pivot (world 0, 1.72, 0.55); gun metres from the trunnion. The datums are leopard2ProtoArmor.ts's.
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { buildLeopard2RunningGear, lineAt, mirrorRing } from './leopard2Hull.ts';
import { addMbt70Rh202 } from './mbt70Rh202.ts';
import { reserveDecorVolume } from './fieldChest.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEOPARD2_PROTO as D } from '../leopard2ProtoArmor.ts';

const deckAt = (z: number): number => lineAt(D.deck, z);
const bellyAt = (z: number): number => lineAt(D.belly, z);
/** The deck's slope at z (radians, nose down positive): a fitting set on it is turned by this about X. */
const deckTilt = (z: number): number => Math.atan2(deckAt(z - 0.05) - deckAt(z + 0.05), 0.10);
const side = <T extends SectionPoint[]>(s: number, ring: T): SectionPoint[] => (s > 0 ? ring : mirrorRing(ring));

/** Every deck and belly break between z0 and z1, so both lines are drawn exactly. */
function stations(z0: number, z1: number, extra: readonly number[] = []): number[] {
  const zs = new Set<number>([z0, z1, ...extra.filter((z) => z > z0 && z < z1)]);
  for (const [z] of [...D.deck, ...D.belly]) if (z > z0 && z < z1) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------

/** The welded tub between the tracks (the wedge bow, the raked rear) and the sponsons over the tracks. */
function hullShell(P: TankBuilderPort): void {
  const tw = D.tubHalfWidthM;
  P.add('hull', sectionSolid(stations(D.rearZ, D.noseZ, [3.80]).map((z): SolidSection => {
    const roof = deckAt(z), floor = Math.min(bellyAt(z), roof - 0.06), bevel = Math.min(0.05, (roof - floor) * 0.3);
    return { z, ring: [[-tw + 0.03, floor], [tw - 0.03, floor], [tw, floor + bevel], [tw, roof], [-tw, roof], [-tw, floor + bevel]] };
  })));
  // the sponsons: out over the tracks to the fender line, flat-floored, their tops the deck line until the glacis falls
  // to the floor ahead of the turret
  const glacisEnd = 1.80 + (deckAt(1.80) - (D.sponsonFloorY + 0.06)) / ((deckAt(1.80) - deckAt(3.86)) / (3.86 - 1.80));
  for (const s of [-1, 1]) {
    P.add('hull', sectionSolid(stations(D.rearZ, glacisEnd).map((z): SolidSection => {
      const top = Math.max(deckAt(z), D.sponsonFloorY + 0.06), hw = D.sponsonHalfWidthM;
      return { z, ring: side(s, [[tw - 0.02, D.sponsonFloorY], [hw, D.sponsonFloorY], [hw, top - 0.025], [hw - 0.025, top], [tw - 0.02, top]]) };
    })));
  }
  // the ring's race collar on the turret deck
  P.add('hullDark', KIT.cylY(1.02, 1.02, 0.02, P.q ? 48 : 24), 0, deckAt(D.turretPivot[2]) + 0.004, D.turretPivot[2]);
}

/** The front fender's top line [z, y] over the idler, falling with the glacis past the nose. */
const FRONT_FENDER: ReadonlyArray<readonly [number, number]> = [[2.80, 1.38], [3.10, 1.33], [3.45, 1.27], [3.80, 1.18], [3.94, 1.13]];

/** The hull side's top edge at z: the deck line along the sponsons, then the front fender's line down past the nose. */
function sideTop(z: number): number {
  return z <= FRONT_FENDER[0][0] ? deckAt(z) : lineAt(FRONT_FENDER, z);
}

/**
 * The fenders: one plate along the hull's whole side, from the stern's corner over the sponson's edge to the skirt's
 * face and on as PT 10's front fender over the idler, down the glacis's line to past the nose, its top the hull side's
 * top edge (the bins stand on it); the headlights built into the front fenders under hoop guards.
 */
function fenders(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const x0 = D.sponsonHalfWidthM - 0.01, x1 = D.skirtOuterX;
  const zs = stations(D.rearZ, FRONT_FENDER[0][0], [-3.30, -2.40, -0.60, 0.60, 2.30]);
  for (const s of [-1, 1]) {
    P.add('hull', sectionSolid(zs.map((z): SolidSection =>
      ({ z, ring: side(s, [[x0, sideTop(z) - 0.04], [x1, sideTop(z) - 0.04], [x1, sideTop(z)], [x0, sideTop(z)]]) }))));
    P.add('hull', sectionSolid(FRONT_FENDER.map(([z, y]): SolidSection =>
      ({ z, ring: side(s, [[1.02, y - 0.04], [x1, y - 0.04], [x1, y], [1.02, y]]) }))));
    // the headlight in the fender (PT 10's revised layout), a hoop guard over it
    const hz = 3.48, hy = lineAt(FRONT_FENDER, hz), hx = s * 1.40;
    P.add('hull', box(0.22, 0.12, 0.18), hx, hy + 0.05, hz);
    KIT.headlight(P, hx, hy + 0.06, hz + 0.11, 0, 0.055);
    P.add('hullDetail', cylZ(0.02, 0.012, 8), hx + 0.16 * s, hy + 0.03, hz + 0.12);
    for (const gx of [-0.13, 0.13]) P.add('hullDetail', box(0.022, 0.20, 0.022), hx + gx, hy + 0.11, hz + 0.16);
    P.add('hullDetail', box(0.28, 0.022, 0.022), hx, hy + 0.21, hz + 0.16);
    for (const gx of [-0.13, 0.13]) P.add('hullDetail', box(0.022, 0.022, 0.16), hx + gx, hy + 0.21, hz + 0.08);
  }
}

/**
 * The skirts: seven bolted panels a side hung under the fender plate from the sponson's rear corner to the front fender
 * over the idler, their top the hull side's line (level along the sponsons, falling with the glacis at the bow), their
 * foot scalloped over the road wheels and rising at both ends over the sprocket and the idler.
 */
function skirts(P: TankBuilderPort): void {
  const { cylX } = KIT;
  const [z0, z1] = D.skirtZ, x1 = D.skirtOuterX, x0 = x1 - 0.03;
  const top = (z: number): number => sideTop(z) - 0.04;
  const pitch = D.wheelZs[0] - D.wheelZs[1];
  // the scallop: high over each road wheel's hub, low between them
  const scallop = (z: number): number => {
    const phase = ((z - D.wheelZs[6]) / pitch) % 1, t = phase < 0 ? phase + 1 : phase;
    const c = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);
    return D.skirtFootOverWheelY - (D.skirtFootOverWheelY - D.skirtFootBetweenY) * c;
  };
  // the foot: the scallop along the wheels, rising aft over the sprocket and forward over the idler to 12 cm under the top
  const rearRamp = D.sprocket.z + 0.25, frontRamp = D.wheelZs[0] + 0.35;
  const foot = (z: number): number => {
    if (z < rearRamp) return scallop(rearRamp) + (top(z0) - 0.30 - scallop(rearRamp)) * (rearRamp - z) / (rearRamp - z0);
    if (z > frontRamp) return scallop(frontRamp) + (top(z1) - 0.12 - scallop(frontRamp)) * (z - frontRamp) / (z1 - frontRamp);
    return scallop(z);
  };
  const panels = 7, L = (z1 - z0) / panels;
  for (const s of [-1, 1]) {
    for (let k = 0; k < panels; k++) {
      const a = z0 + k * L + (k > 0 ? 0.006 : 0), b = z0 + (k + 1) * L - (k + 1 < panels ? 0.006 : 0);
      const n = 12, rows: SolidSection[] = [];
      for (let i = 0; i <= n; i++) {
        const z = a + (b - a) * i / n;
        rows.push({ z, ring: side(s, [[x0, foot(z)], [x1, foot(z)], [x1, top(z)], [x0, top(z)]]) });
      }
      P.add('hull', sectionSolid(rows));
      // two bolts a panel under the fender plate
      for (const z of [a + 0.12, b - 0.12]) P.add('hullDetail', cylX(0.02, 0.012, 8), s * (x1 - 0.004), top(z) - 0.05, z);
    }
  }
}

/** The long stowage bins on the fenders (the walkaround: two ahead on the turret deck, one aft on the engine deck). */
function fenderBins(P: TankBuilderPort): void {
  const { box } = KIT;
  const bins: Array<[number, number, number]> = [[-0.80, 0.62, 0.18], [0.68, 1.74, 0.18], [-3.30, -1.74, 0.12]];
  for (const s of [-1, 1]) {
    for (const [z0, z1, h] of bins) {
      const zc = (z0 + z1) / 2, len = z1 - z0, y = deckAt(zc), x = s * 1.64;
      P.addEquipment('hull', box(0.36, h, len), x, y + h / 2, zc);
      P.add('hullDark', box(0.362, 0.006, len - 0.02), x, y + h - 0.03, zc);                     // lid seam
      for (const dz of [-len / 2 + 0.18, len / 2 - 0.18]) {
        P.add('hullDetail', box(0.012, 0.05, 0.05), x + s * 0.186, y + h - 0.06, zc + dz);        // latches
      }
    }
  }
}

/** The bow and glacis: tow eyes on the belly plate, the forward travel lock's brackets, the driver's hatch and periscopes. */
function bowFittings(P: TankBuilderPort): void {
  const { box, cylY, torus } = KIT;
  for (const s of [-1, 1]) {
    // tow eyes on the lower glacis (PT 10 moved them off the upper glacis)
    const ez = 3.50, ey = bellyAt(ez);
    P.add('hullDetail', box(0.12, 0.12, 0.10), s * 0.66, ey + 0.02, ez - 0.02);
    P.add('hullDark', torus(0.06, 0.018, 10), s * 0.66, ey - 0.02, ez + 0.05);
    // the forward travel lock's two brackets, standing proud of the glacis
    const bz = 3.02, by = deckAt(bz), t = deckTilt(bz);
    P.add('hullDetail', box(0.05, 0.12, 0.16), s * 0.20, by + 0.05, bz, t, 0, 0);
    P.add('hullDark', KIT.cylX(0.025, 0.06, 8), s * 0.20, by + 0.09, bz);
    // lifting eyes at the glacis's shoulders
    KIT.liftEye(P, 'hullDetail', s * 1.48, deckAt(2.30) + 0.015, 2.30);
  }
  // the driver's hatch (right front) on the glacis's slope, its three periscopes ahead
  const hz = 2.12, hy = deckAt(hz), t = deckTilt(hz);
  P.add('hullDetail', cylY(0.30, 0.31, 0.04, P.q ? 24 : 14), -0.55, hy + 0.012, hz, t, 0, 0);
  P.addHatch('hullHatch', cylY(0.25, 0.25, 0.03, P.q ? 20 : 12), -0.55, hy + 0.045, hz, t, 0, 0);
  P.add('hullDark', box(0.22, 0.02, 0.03), -0.55, hy + 0.066, hz - 0.11, t, 0, 0);
  for (const dx of [-0.17, 0, 0.17]) {
    const z = 2.46, y = deckAt(z);
    P.add('hullDetail', box(0.15, 0.08, 0.10), -0.55 + dx, y + 0.04, z, deckTilt(z), 0, 0);
    P.add('hullGlass', box(0.11, 0.03, 0.012), -0.55 + dx, y + 0.055, z + 0.051, deckTilt(z), 0, 0);
  }
}

/** The engine deck: two round fan grilles, the access plate between, louvres outboard, the rear gun crutch, lifting eyes. */
function engineDeck(P: TankBuilderPort): void {
  const { box, cylY, torus } = KIT;
  const seg = P.q ? 32 : 18;
  for (const s of [-1, 1]) {
    const fx = s * 0.60, fz = -2.86, fy = deckAt(fz);
    P.add('hullDark', cylY(0.40, 0.40, 0.008, seg), fx, fy + 0.002, fz);
    P.add('hullDetail', torus(0.40, 0.022, seg), fx, fy + 0.012, fz);
    P.add('hullDetail', torus(0.22, 0.012, seg), fx, fy + 0.012, fz);
    for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) P.add('hullDetail', box(0.80, 0.016, 0.02), fx, fy + 0.012, fz, 0, a, 0);
    P.add('hullDetail', cylY(0.07, 0.07, 0.03, 12), fx, fy + 0.016, fz);
    // radiator louvres ahead of the fans
    const rz = -2.10, ry = deckAt(rz);
    P.add('hullDark', box(0.66, 0.006, 0.52), fx, ry + 0.004, rz);
    for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.66, 0.012, 0.035), fx, ry + 0.014, rz - 0.22 + k * 0.088, 0.35, 0, 0);
    KIT.liftEye(P, 'hullDetail', s * 1.30, deckAt(-3.62) + 0.015, -3.62);
  }
  P.add('hullDetail', box(0.36, 0.014, 0.90), 0, deckAt(-2.86) + 0.007, -2.86);                  // access plate
  for (const [x, z] of [[-0.14, -2.48], [0.14, -2.48], [-0.14, -3.24], [0.14, -3.24]]) {
    P.add('hullDark', cylY(0.016, 0.016, 0.01, 8), x, deckAt(z) + 0.016, z);
  }
  // the rear travel lock (the gun crutch at 6 o'clock), folded down on the deck's lip
  const cz = -3.56, cy = deckAt(cz);
  P.add('hullDetail', box(0.40, 0.05, 0.10), 0, cy + 0.025, cz);
  for (const dx of [-0.14, 0.14]) P.add('hullDetail', box(0.04, 0.04, 0.46), dx, cy + 0.07, cz + 0.20);
  P.add('hullDetail', box(0.32, 0.06, 0.05), 0, cy + 0.075, cz + 0.42);
}

/** The stern: the louvred upper rear plate across the full width, tail lights, tow hooks, the number plate, mudflaps. */
function stern(P: TankBuilderPort): void {
  const { box, torus } = KIT;
  const z = D.rearZ, hw = D.sponsonHalfWidthM;
  P.add('hullDark', box(2.60, 0.34, 0.006), 0, 1.51, z - 0.002);
  for (let k = 0; k < 7; k++) P.add('hullDetail', box(2.60, 0.03, 0.03), 0, 1.36 + k * 0.05, z - 0.016, -0.5, 0, 0);
  for (const y of [1.33, 1.70]) P.add('hullDetail', box(2.66, 0.026, 0.03), 0, y, z - 0.012);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.18, 0.12, 0.05), s * (hw - 0.17), 1.50, z - 0.025);                  // tail-light cluster
    for (const dx of [-0.045, 0.045]) P.add('hullGlass', box(0.06, 0.05, 0.012), s * (hw - 0.17) + dx, 1.50, z - 0.052);
    P.add('hullDetail', box(0.12, 0.10, 0.10), s * 0.70, 1.08, z - 0.03);                          // tow hook
    P.add('hullDark', torus(0.055, 0.018, 10), s * 0.70, 1.02, z - 0.07);
    P.hangMudguard('leopard2-proto-rear-flap', 'hullRubber', box(0.62, 0.46, 0.025), s * 1.36, 1.07, z + 0.06);
  }
  // the Bundeswehr registration plate (Y-647 083, still on the rear at Saumur)
  P.add('hullDetail', box(0.42, 0.20, 0.012), 0.45, 1.16, z - 0.006);
  P.decal('hull', 'number', 'Y-647 083', 0.16, [0.45, 1.16, z - 0.014], Math.PI, 0);
}

function hull(P: TankBuilderPort): void {
  hullShell(P);
  fenders(P);
  skirts(P);
  fenderBins(P);
  bowFittings(P);
  engineDeck(P);
  stern(P);
  buildLeopard2RunningGear(P, D);
}

// ---------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------

/** A welded section, counter-clockwise from +Z: the foot, the walls flaring to the crease, leaning in to the roof. */
function shellRing(hwFoot: number, foot: number, hwCrease: number, crease: number, hwRoof: number, roof: number): SectionPoint[] {
  return [[-hwFoot, foot], [hwFoot, foot], [hwCrease, crease], [hwRoof, roof], [-hwRoof, roof], [-hwCrease, crease]];
}

/**
 * The shell's stations [z, foot half-width, foot y, crease half-width, crease y, roof half-width, roof y]: the Leopard 1 x
 * Leopard 2 turret (the owner, 2026-11-20: "more leopard 1 x leopard 2 turret fusion inspired", which is what the PT turrets
 * were). The Leopard 2's vertical lower walls to a hard crease and the Leopard 1A3's upper walls leaning in to the roof;
 * the Leopard 2's bustle, narrower than the turret behind a step, its roof rising aft, its rear plate near vertical with
 * the Leopard 1's slight undercut; the floor steps up ahead of the ring so the cheeks sweep clear of the fender bins.
 */
const SHELL: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
  [-2.66, 1.00, 0.24, 1.03, 0.44, 0.96, 0.78],
  [-2.54, 1.02, 0.20, 1.05, 0.44, 0.98, 0.78],
  [-1.50, 1.04, 0.20, 1.07, 0.44, 1.00, 0.77],
  // the step: the turret proper stands 0.19 m wider than its bustle
  [-1.46, 1.24, 0.20, 1.27, 0.42, 1.07, 0.76],
  [-0.78, 1.25, 0.18, 1.27, 0.40, 1.08, 0.75],
  // over the ring the floor steps down
  [-0.66, 1.26, -0.03, 1.27, 0.40, 1.08, D.roofY],
  [0.40, 1.26, -0.03, 1.27, 0.40, 1.08, D.roofY],
  // ahead of the ring it steps up again under the cheeks
  [0.46, 1.26, 0.14, 1.27, 0.40, 1.08, D.roofY],
  [D.frontZ, 1.26, 0.14, 1.27, 0.40, 1.08, D.roofY],
];

/** The cheek blocks' datums (turret metres): the gun slot's half-width between them, their swept faces, bevelled tops. */
const CHEEK = Object.freeze({ slotHalfW: 0.64, sideEndZ: 1.00, noseZ: 1.32, noseHalfW: 0.70, noseRoofY: 0.62 });

function turretShell(P: TankBuilderPort): void {
  P.add('turret', sectionSolid(SHELL.map(([z, a, b, c, d, e, f]) => ({ z, ring: shellRing(a, b, c, d, e, f) })),
    { sideQuadDiagonal: 'convex' }));
  // the base: a ring a little wider than the walls, the bulge along the turret's foot
  P.add('turret', KIT.cylY(1.30, 1.32, 0.10, P.q ? 48 : 24), 0, -0.01, 0);
  cheekBlocks(P);
  // the welded seams along the crease
  for (const s of [-1, 1]) {
    for (let k = 0; k + 1 < SHELL.length; k++) {
      const [za, , , ca, ya] = SHELL[k], [zb, , , cb, yb] = SHELL[k + 1];
      if (zb - za < 0.15) continue;
      const len = Math.hypot(zb - za, cb - ca), yaw = Math.atan2(s * (cb - ca), zb - za);
      P.add('turretDark', KIT.box(0.012, 0.012, len), s * ((ca + cb) / 2 + 0.004), (ya + yb) / 2, (za + zb) / 2, 0, yaw, 0);
    }
  }
}

/**
 * The Leopard 2's cheek blocks either side of the gun slot: the walls run on to z 1.00, then each block's face sweeps back
 * 29 degrees from the slot's edge at z 1.32, vertical to the crease and leaning in above it, its top bevelled down to the
 * face; the slot between them open to the shell's front face, a brow over it.
 */
function cheekBlocks(P: TankBuilderPort): void {
  const c = CHEEK, [, footW, footY, creaseW, creaseY, roofW, roofY] = SHELL[SHELL.length - 1];
  const ring = (s: number, outFoot: number, outCrease: number, outRoof: number, roof: number): SectionPoint[] =>
    side(s, [[c.slotHalfW, footY], [outFoot, footY], [outCrease, creaseY], [outRoof, roof], [c.slotHalfW, roof]]);
  for (const s of [-1, 1]) {
    P.add('turret', sectionSolid([
      { z: D.frontZ - 0.02, ring: ring(s, footW, creaseW, roofW, roofY) },
      { z: c.sideEndZ, ring: ring(s, footW, creaseW, roofW, roofY - 0.02) },
      { z: c.noseZ, ring: ring(s, c.noseHalfW - 0.01, c.noseHalfW, c.slotHalfW + 0.02, c.noseRoofY) },
    ]));
    // the weld down each block's leading edge
    P.add('turretDark', KIT.box(0.012, creaseY - footY, 0.012), s * (c.noseHalfW + 0.002), (footY + creaseY) / 2, c.noseZ + 0.002);
  }
  // the brow over the slot, under the cheeks' tops
  P.add('turret', KIT.box(c.slotHalfW * 2, 0.06, 0.36), 0, 0.68, D.frontZ + 0.17);
}

/** The shell's half-width at turret z and height y: up the flaring lower wall to the crease, in along the upper wall. */
function wallAt(z: number, y: number): number {
  const at = (k: number): number => lineAt(SHELL.map((r) => [r[0], r[k]] as const), z);
  const [footW, footY, creaseW, creaseY, roofW, roofY] = [at(1), at(2), at(3), at(4), at(5), at(6)];
  if (y <= creaseY) return footW + (creaseW - footW) * (y - footY) / (creaseY - footY);
  return creaseW + (roofW - creaseW) * (y - creaseY) / (roofY - creaseY);
}

/** The roof's height at turret z (it rises aft over the bustle). */
function roofAt(z: number): number {
  return lineAt(SHELL.map((r) => [r[0], r[6]] as const), z);
}

/** The EMES 12's two ends behind their armoured blocks on the front shoulders (slid aside to range). */
function rangefinderBlocks(P: TankBuilderPort): void {
  const { box } = KIT;
  // each block a 5 cm plate laid on the wall over the crease, from 0.24 to 0.56 m, 0.42 m long
  const ys = [0.24, 0.36, 0.56], t = 0.05, z0 = 0.45, z1 = 0.87;
  for (const s of [-1, 1]) {
    P.add('turret', sectionSolid([z0, (z0 + z1) / 2, z1].map((z): SolidSection => {
      const w = ys.map((y) => wallAt(z, y));
      return { z, ring: side(s, [[w[0] - 0.01, ys[0]], [w[0] + t, ys[0]], [w[1] + t, ys[1]], [w[2] + t, ys[2]],
        [w[2] - 0.01, ys[2]], [w[1] - 0.01, ys[1]]]) };
    })));
    P.add('turretDark', box(0.06, 0.26, 0.012), s * (wallAt(z1, 0.36) + t / 2), 0.40, z1 + 0.004);   // its leading edge
    P.add('turretDetail', box(0.03, 0.04, 0.10), s * (wallAt(0.62, 0.30) + t + 0.012), 0.30, 0.62);  // slide handle
  }
}

/**
 * The mantlet section's [half-width, y] points at gun z (gun metres from the trunnion, +Z along the bore): a flat floor,
 * the sides flaring to a crease, a top sloping in, the Leopard 1A3 pattern's wedge.
 */
function mantletRing(footW: number, footY: number, creaseW: number, creaseY: number, topW: number, topY: number): SectionPoint[] {
  return [[-footW, footY], [footW, footY], [creaseW, creaseY], [topW, topY], [-topW, topY], [-creaseW, creaseY]];
}

/** The mantlet's stations [gun z, foot half-width, foot y, crease half-width, crease y, top half-width, top y]. */
const MANTLET: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
  // in the slot: a block 4 cm clear of the cheeks' inner walls, seated 2 cm into the shell's front face
  [D.frontZ - D.gunLocal[2] - 0.02, 0.58, -0.17, 0.60, 0.02, 0.52, 0.30],
  [CHEEK.noseZ - D.gunLocal[2] - 0.02, 0.58, -0.17, 0.60, 0.02, 0.50, 0.29],
  // out of the slot: the Leopard 1's wedge to the nose the gun leaves through
  [0.50, 0.38, -0.13, 0.40, 0.01, 0.28, 0.20],
  [0.72, 0.18, -0.09, 0.20, 0.0, 0.13, 0.11],
];

/** The mantlet's half-width at gun z and height y, on its flaring lower side or its sloping upper side. */
function mantletSideAt(z: number, y: number): number {
  const at = (k: number): number => lineAt(MANTLET.map((r) => [r[0], r[k]] as const), z);
  const [footW, footY, creaseW, creaseY, topW, topY] = [at(1), at(2), at(3), at(4), at(5), at(6)];
  if (y <= creaseY) return footW + (creaseW - footW) * (y - footY) / (creaseY - footY);
  return creaseW + (topW - creaseW) * (y - creaseY) / (topY - creaseY);
}

/**
 * The gun mount: the external wedge mantlet of the Leopard 1A3-pattern turret, standing on the turret's front face
 * between the cheeks and pitching with the gun, its welded side creases, the two rectangular plates welded on its top
 * (T 17's, to carry its trial equipment at Yuma in 1975; panzerplace.eu), the coaxial MG3's port in its left side; the
 * canvas boot from its nose onto the tube; the 120 mm.
 */
function gunAssembly(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const seg = P.q ? 24 : 14;
  P.gunG.position.set(D.gunLocal[0], D.gunLocal[1], D.gunLocal[2]);
  P.addGunExtra(sectionSolid(MANTLET.map(([z, a, b, c, d, e, f]) => ({ z, ring: mantletRing(a, b, c, d, e, f) })),
    { sideQuadDiagonal: 'convex' }));
  // the crease seams down each side
  for (const sx of [-1, 1]) {
    const [za, , , ca, ya] = MANTLET[1], [zb, , , cb, yb] = MANTLET[3];
    const len = Math.hypot(zb - za, cb - ca, yb - ya), yaw = Math.atan2(sx * (cb - ca), zb - za);
    P.addGunExtraDark(xformSeam(box(0.010, 0.010, len), (ya - yb) / Math.hypot(zb - za, yb - ya), yaw),
      sx * ((ca + cb) / 2 + 0.003), (ya + yb) / 2, (za + zb) / 2);
  }
  // the two plates welded on its top slope
  const topRise = Math.atan2(MANTLET[1][6] - MANTLET[3][6], MANTLET[3][0] - MANTLET[1][0]);
  for (const x of [-0.14, 0.14]) {
    const z = 0.44, y = lineAt(MANTLET.map((r) => [r[0], r[6]] as const), z);
    P.addGunExtra(KIT.xform(box(0.12, 0.02, 0.16), 0, 0, 0, topRise, 0, 0), x, y + 0.008, z);
  }
  // the coaxial MG3's port in the left side, its muzzle ring proud of the flare
  const cz = 0.42, cy = -0.02, cx = mantletSideAt(cz, cy) - 0.03;
  P.addGunExtra(cylZ(0.045, 0.09, 12), cx, cy, cz);
  P.addGunExtraDark(cylZ(0.026, 0.012, 12), cx, cy, cz + 0.042);
  // the canvas boot from the nose onto the tube, two straps round it
  const nose = MANTLET[3][0];
  P.addGunExtra(cylZ(0.095, 0.26, seg, 0.15), 0, 0, nose + 0.11);
  for (const dz of [0.04, 0.17]) P.addGunExtraDark(cylZ(0.15 - dz * 0.24, 0.02, seg), 0, 0, nose + dz);
  KIT.buildGun(P, { len: D.barrelLengthM, r: D.barrelRadiusM, sleeve: false, evac: 0.50, evacR: 1.55, collar: false, baseR: 0.13 });
  muzzleBore(P, { len: D.barrelLengthM, r: D.barrelRadiusM });
}

/** A seam bar turned down by `pitch` (its fall over its run) and swung by `yaw`. */
function xformSeam(g: ReturnType<typeof KIT.box>, fall: number, yaw: number): ReturnType<typeof KIT.box> {
  return KIT.xform(g, 0, 0, 0, Math.asin(Math.max(-1, Math.min(1, fall))), yaw, 0);
}

/**
 * The commander's PERI R12 and cupola (right), the loader's hatch (left), the gunner's periscope, the stand-offs; and the
 * roof gun. Kevin's call (2026-11-20, via Main): the 20 mm Rh 202 on the T 11's mount. Only T 05 and T 11 were built with
 * the circular cutout on the left of the roof, the bulge round it, that took the KPz 70's remotely controlled Rh 202, and
 * only T 11 had the gun fitted (panzerplace.eu, "Sekundarlafette fur Turm KPZ Leopard 2 (PT)"); this tank is a T 17
 * carrying the T 11's roof gun. The station is the KPz 70's own (profiles/mbt70Rh202.ts), the vehicle's working roof gun,
 * and it takes the loader's MG3's place: its barrel passes over the loader's hatch at rest.
 */
function roofFittings(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const roof = D.roofY, q = P.q;
  // PERI R12: a drum ahead of the cupola, its armoured head with the window forward
  const px = -0.62, pz = 0.22;
  P.add('turret', cylY(0.13, 0.14, 0.08, q ? 20 : 12), px, roof + 0.04, pz);
  P.add('turretDetail', box(0.22, 0.16, 0.24), px, roof + 0.16, pz);
  P.add('turretDetail', box(0.20, 0.08, 0.08), px, roof + 0.17, pz + 0.14, -0.2, 0, 0);
  P.add('turretGlass', box(0.15, 0.045, 0.012), px, roof + 0.17, pz + 0.184, -0.2, 0, 0);
  // the commander's cupola: a low ring of eight periscopes, the hatch on it
  const cx = -0.60, cz = -0.42;
  P.add('turret', cylY(0.36, 0.38, 0.06, q ? 28 : 16), cx, roof + 0.03, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.add('turretDetail', box(0.10, 0.05, 0.05), cx + Math.sin(a) * 0.33, roof + 0.07, cz + Math.cos(a) * 0.33, 0, a, 0);
    P.add('turretGlass', box(0.07, 0.025, 0.012), cx + Math.sin(a) * 0.356, roof + 0.072, cz + Math.cos(a) * 0.356, 0, a, 0);
  }
  P.addHatch('turretHatch', cylY(0.27, 0.27, 0.035, q ? 24 : 14), cx, roof + 0.075, cz);
  P.add('turretDark', box(0.28, 0.02, 0.035), cx, roof + 0.10, cz - 0.18);
  // the gunner's periscope ahead of the commander, by the rangefinder's line
  KIT.periscope(P, 'turretDetail', -0.28, roof + 0.03, 0.66);
  // the loader's hatch on its ring
  const lx = 0.58, lz = -0.46;
  P.add('turret', cylY(0.33, 0.34, 0.05, q ? 24 : 14), lx, roof + 0.02, lz);
  P.addHatch('turretHatch', cylY(0.28, 0.28, 0.03, q ? 24 : 14), lx, roof + 0.06, lz);
  P.add('turretDark', box(0.26, 0.02, 0.035), lx, roof + 0.08, lz - 0.18);
  // the T 11's mount: the raised armoured collar (the bulge) round the roof's cutout, the Rh 202 station on it; the collar
  // stands 0.16 m so the gun's full depression clears the commander's cupola across the right front
  const gx = 0.55, gz = -1.30, collar = 0.16, gr = roofAt(gz);
  P.add('turret', cylY(0.33, 0.36, collar + 0.02, q ? 32 : 18), gx, gr + collar / 2 - 0.01, gz);
  P.add('turretDark', KIT.torus(0.335, 0.008, q ? 32 : 18), gx, gr + collar, gz);
  addMbt70Rh202(P, gr + collar, { x: gx, z: gz, name: 'leo2ProtoRh202Station',
    // measured (tools/roof-station-arcs.mjs, 2026-11-20): clear the full circle at every pitch
    yawArc: [-Math.PI, Math.PI] });
  // the gun's sweep is kept clear of the field cargo (the decor keeps clear of pintle guns by their yaw supports; this
  // station has none): its 1.45 m reach round the ring, from the roof to over the trunnion
  const reach = 1.50, axis = gr + collar + 0.25;
  reserveDecorVolume(P.turretG, [gx - reach, roof - 0.02, gz - reach], [gx + reach, axis + 0.20, gz + reach]);
  // the four stand-offs T 16 and T 17 carried the fault-detection box on (empty, as at Saumur)
  for (const [x, z] of [[-0.55, -1.45], [-0.15, -1.45], [-0.55, -1.85], [-0.15, -1.85]]) {
    P.add('turretDetail', cylY(0.025, 0.03, 0.05, 10), x, roofAt(z) + 0.025, z);
  }
  // the anemometer's mast on the roof's right front, the radios' two antenna bases and whips at the bustle's right rear
  // corner: all beyond the roof gun's 1.45 m reach (tools/roof-station-arcs.mjs)
  P.add('turretDetail', cylY(0.014, 0.018, 0.22, 8), -1.00, roofAt(0.40) + 0.11, 0.40);
  P.add('turretDark', box(0.12, 0.024, 0.024), -1.00, roofAt(0.40) + 0.23, 0.40);
  for (const [k, ax, az] of [[0, -0.90, -2.50], [1, -0.40, -2.58]] as const) {
    P.add('turretDetail', cylY(0.05, 0.06, 0.08, 10), ax, roofAt(az) + 0.04, az);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.10, r: 0.011, seed: 27420 + k, rotation: [-0.06, 0, 0] });
    whip.position.set(ax, roofAt(az) + 0.08, az);
    P.turretG.add(whip);
  }
  for (const [x, z] of [[0.95, 0.55], [-0.95, 0.55], [0.85, -2.30], [-0.85, -2.30]]) {
    KIT.liftEye(P, 'turretDetail', x, roofAt(z) + 0.015, z);
  }
}

/** The walls: one rack of four smoke mortars a side, five grab handles a side, the turret number and the cross. */
function flankEquipment(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    // the smoke mortars: a bracket on the upper wall aft of the rangefinder block, four cups raised forward
    const mz = -0.30, wall = wallAt(mz, 0.56);
    P.add('turretDetail', box(0.10, 0.06, 0.56), s * (wall - 0.01), 0.56, mz);
    const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.045, len: 0.24, splay: s * 0.35, pitch: -0.55,
      arc: 0.10, spacing: 0.13, slot: 'detail', seed: 27430 + (s > 0 ? 1 : 0) });
    bank.position.set(s * (wall + 0.03), 0.62, mz);
    P.turretG.add(bank);
    // five grab handles a side on their stand-offs (the later turrets'; the early ones had two)
    for (const [z, y] of [[0.36, 0.22], [-0.95, 0.22], [-1.55, 0.22], [-2.10, 0.24], [-1.25, 0.50]]) {
      const x = s * (wallAt(z, y) + 0.05);
      P.add('turretDetail', box(0.022, 0.022, 0.40), x, y, z);
      for (const dz of [-0.18, 0.18]) P.add('turretDetail', box(0.06, 0.02, 0.02), x - s * 0.03, y, z + dz);
    }
  }
  // the crosses on the lower walls, laid on the wall's flare (its outward normal dips under the crease)
  const cz = -0.05, cy = 0.17, flare = Math.atan2(wallAt(cz, 0.36) - wallAt(cz, -0.03), 0.39);
  for (const s of [-1, 1]) {
    P.decal('turret', 'crossgrey', null, 0.24, [s * (wallAt(cz, cy) + 0.004), cy, cz], s * Math.PI / 2, 0, -s * flare);
  }
  P.decal('turret', 'number', 'T 17', 0.10, [wallAt(-2.25, 0.27) + 0.004, 0.27, -2.25], Math.PI / 2, 0,
    -Math.atan2(wallAt(-2.25, 0.40) - wallAt(-2.25, 0.18), 0.22));
}

/** The Leopard 2's open basket on the bustle's rear plate, a mesh floor, a rolled tarpaulin and packs in it. */
function rearBasket(P: TankBuilderPort): void {
  const { box } = KIT;
  const rear = SHELL[0][0], depth = 0.34, half = 0.86, back = rear - depth, low = 0.30, top = 0.68, bars = 8;
  for (const y of [low, (low + top) / 2, top]) P.add('turretDetail', box(half * 2, 0.035, 0.035), 0, y, back);
  for (let k = 0; k <= bars; k++) P.add('turretDetail', box(0.03, top - low, 0.03), -half + 0.01 + k * (2 * half - 0.02) / bars, (low + top) / 2, back);
  for (const sx of [-1, 1]) for (const y of [low, top]) {
    P.add('turretDetail', box(0.035, 0.035, depth + 0.04), sx * half, y, rear - depth / 2 + 0.02);
  }
  P.add('turretDark', KIT.openRackGrid(half * 2 - 0.04, depth - 0.02, 0.016, 5, bars + 1), 0, low + 0.02, rear - depth / 2);
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.48, low + 0.16, rear - 0.18, 0.58, 0.30, 0.26], [0.26, low + 0.15, rear - 0.19, 0.52, 0.28, 0.25]]);
  KIT.tarpRoll(P, 'turretCloth', 0, top + 0.07, rear - 0.17, 1.40, 0.08, true, P.q ? 12 : 8);
}

function turret(P: TankBuilderPort): void {
  P.turretG.position.set(D.turretPivot[0], D.turretPivot[1], D.turretPivot[2]);
  turretShell(P);
  rangefinderBlocks(P);
  gunAssembly(P);
  roofFittings(P);
  flankEquipment(P);
  rearBasket(P);
}

/** The PT 10 / T 17 (leopard2_proto). */
export function buildLeopard2Prototype(P: TankBuilderPort): void {
  hull(P);
  turret(P);
  P.topY = 1.24;
}
