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
// - turret: a Leopard 1 x Leopard 2A2 fusion, which is what the PT turrets were (the owner, 2026-11-20 and 2026-11-21: "the
//   leopard 2 you were supposed to fuse with was the leopard 2a2"). The Leopard 1A3-pattern welded spaced-armour shell
//   (faceted walls flaring to a crease and leaning in to a flat roof) on its ring standing clear of the deck, with the
//   2A2's stepped bustle, and the 2A2's front: its cheek blocks (faces vertical, swept back 27 degrees, bevelled to flat
//   tops, a short chamfer to the walls, grab rails across them), its block mantlet with the chamfered top under the brow
//   and its seal cover, the cone root, the coaxial MG3's and FERO Z18's ports; the EMES 12 rangefinder's ends behind
//   the armoured blocks on the front shoulders (the prototype's); the 2A2's PERI R17 by the commander's cupola (right),
//   the loader's hatch (left) and, by Kevin's call, the T 11's 20 mm Rh 202 on its left-roof mount; the four stand-offs
//   T 16 and T 17 carried the fault-detection box on; the 2A2's smoke discharger blocks at the bustle's rear corners;
//   five grab handles a side (the later turrets'); the 120 mm, a plain tube with a bore evacuator;
// - running gear: the production Leopard 2's wheels, idler, sprocket, return rollers and track (leopard2Hull.ts), which
//   the prototypes introduced, on the prototype's own stations.
//
// Frames: hull metres (+Z forward, y up from the ground; the world's right of a +Z hull is -X); turret metres from the
// ring's pivot (world 0, 1.72, 0.55); gun metres from the trunnion. The datums are leopard2ProtoArmor.ts's.
import { KIT, FITTINGS, convexSlab, muzzleBore } from './kit.ts';
import { latheY } from '../accessoryPrimitives.ts';
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
  // the turret ring's race on the turret deck: a raised collar round the ring (its foot under the deck), its bolt circle
  // outside the turret's ring
  const seg = P.q ? 48 : 24, rz = D.turretPivot[2], r = D.ringRadiusM, top = D.ringTopY - 0.01;
  P.add('hull', KIT.cylY(r + 0.12, r + 0.14, 0.06, seg), 0, top - 0.03, rz);
  for (let k = 0; k < (P.q ? 36 : 18); k++) {
    const a = (k / (P.q ? 36 : 18)) * Math.PI * 2;
    P.add('hullDetail', KIT.cylY(0.014, 0.014, 0.014, 6), Math.sin(a) * (r + 0.08), top + 0.006, rz + Math.cos(a) * (r + 0.08));
  }
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
  // the two on the turret deck stand 0.10 m, under the turret's floor (world 1.78), so the turret's ring shows over them
  const bins: Array<[number, number, number]> = [[-0.80, 0.62, 0.10], [0.68, 1.74, 0.10], [-3.30, -1.74, 0.12]];
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
  // over the ring the floor steps down to the turret's ring, clear of the deck
  [-0.66, 1.26, D.turretFloorY, 1.27, 0.40, 1.08, D.roofY],
  [0.40, 1.26, D.turretFloorY, 1.27, 0.40, 1.08, D.roofY],
  // ahead of the ring it steps up again under the cheeks
  [0.46, 1.26, 0.14, 1.27, 0.40, 1.08, D.roofY],
  [D.frontZ, 1.26, 0.14, 1.27, 0.40, 1.08, D.roofY],
];

/**
 * The cheek front's datums (turret metres), the Leopard 2A2's front on the Leopard 1-pattern shell (the owner, 2026-11-21:
 * "the leopard 2 you were supposed to fuse with was the leopard 2a2"): the faces vertical to faceTopY across the gun slot
 * at faceZ, swept back 27 degrees outward (the 2A2's, leopard2CheekFrontDatums.ts), a short chamfer to the walls, bevelled
 * back to flat tops under the roof.
 */
const CHEEK = Object.freeze({
  slotHalfW: 0.52, faceZ: 1.32, sweepDeg: 27, chamferX: 0.07, chamferZ: 0.10,
  floorY: 0.14, faceTopY: 0.52, topY: 0.72, bevelM: 0.18,
});
const SWEEP = CHEEK.sweepDeg * Math.PI / 180;

/** The vertical face's z at |x| off the bore: faceZ at the slot, swept back outward. */
const cheekFaceZ = (x: number): number => CHEEK.faceZ - Math.max(0, Math.abs(x) - CHEEK.slotHalfW) * Math.tan(SWEEP);

function turretShell(P: TankBuilderPort): void {
  P.add('turret', sectionSolid(SHELL.map(([z, a, b, c, d, e, f]) => ({ z, ring: shellRing(a, b, c, d, e, f) })),
    { sideQuadDiagonal: 'convex' }));
  // the turret's ring under its floor, standing on the hull's race: the dark bearing band, then the ring's skirt up into
  // the floor
  const ringFoot = D.ringTopY - D.turretPivot[1], seg = P.q ? 48 : 24;
  P.add('turretDark', KIT.cylY(D.ringRadiusM + 0.02, D.ringRadiusM + 0.02, 0.03, seg), 0, ringFoot + 0.005, 0);
  const skirtFoot = ringFoot + 0.02, skirtTop = D.turretFloorY + 0.02;
  P.add('turret', KIT.cylY(D.ringRadiusM + 0.04, D.ringRadiusM + 0.04, skirtTop - skirtFoot, seg), 0, (skirtTop + skirtFoot) / 2, 0);
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
 * The Leopard 2A2's cheek blocks either side of the gun slot, from 2 cm inside the shell's front face: each face vertical to
 * faceTopY and bevelled back to the block's flat top, swept back outward from the slot, a short chamfer to the side wall;
 * the outer walls the shell's (the Leopard 1-pattern lean above the crease), so the blocks narrow to their tops. Convex
 * pieces in three height bands (under the crease, to the faces' top, the bevel), each split at the chamfer.
 */
function cheekBlocks(P: TankBuilderPort): void {
  const c = CHEEK, root = D.frontZ - 0.02, crease = SHELL[SHELL.length - 1][4];
  const wall = (y: number): number => wallAt(D.frontZ, y);
  const bevel = (y: number): number => Math.max(0, y - c.faceTopY) / (c.topY - c.faceTopY) * c.bevelM;
  const faceOut = (y: number): number => wall(y) - c.chamferX;
  const corner = (y: number): number => Math.max(root + 0.03, cheekFaceZ(faceOut(y)) - c.chamferZ - bevel(y));
  const front = (x: number, y: number): number => Math.max(root + 0.03, cheekFaceZ(x) - bevel(y));
  for (const sx of [-1, 1]) {
    for (const [ya, yb] of [[c.floorY, crease], [crease, c.faceTopY], [c.faceTopY, c.topY]] as const) {
      // the face, from the slot to the chamfer
      P.add('turret', convexSlab(
        [sx * c.slotHalfW, ya, root], [sx * faceOut(ya), ya, root], [sx * faceOut(ya), ya, front(faceOut(ya), ya)], [sx * c.slotHalfW, ya, front(c.slotHalfW, ya)],
        [sx * c.slotHalfW, yb, root], [sx * faceOut(yb), yb, root], [sx * faceOut(yb), yb, front(faceOut(yb), yb)], [sx * c.slotHalfW, yb, front(c.slotHalfW, yb)],
      ));
      // the chamfer to the wall
      P.add('turret', convexSlab(
        [sx * faceOut(ya), ya, root], [sx * wall(ya), ya, root], [sx * wall(ya), ya, corner(ya)], [sx * faceOut(ya), ya, front(faceOut(ya), ya)],
        [sx * faceOut(yb), yb, root], [sx * wall(yb), yb, root], [sx * wall(yb), yb, corner(yb)], [sx * faceOut(yb), yb, front(faceOut(yb), yb)],
      ));
    }
    // the welded joint between the slot's wall and the face
    P.add('turretDark', KIT.box(0.012, c.faceTopY - c.floorY - 0.04, 0.012), sx * (c.slotHalfW + 0.012),
      (c.faceTopY + c.floorY) / 2, cheekFaceZ(c.slotHalfW) + 0.002);
  }
  // the grab rails across the faces, the right one lower (the 2A2's), each a round bar on two stand-off brackets, and the
  // rubber-faced pad low on the right face
  for (const [x0, x1, y] of [[-0.56, -1.08, 0.26], [0.56, 1.08, 0.33]] as const) {
    const xc = (x0 + x1) / 2, sx = Math.sign(xc), len = Math.abs(x1 - x0) / Math.cos(SWEEP);
    P.add('turretDetail', KIT.cylZ(0.013, len, 8), xc, y, cheekFaceZ(xc) + 0.055, 0, Math.PI / 2 + sx * SWEEP, 0);
    for (const xe of [x0, x1]) {
      const xs = xe + Math.sign(xc - xe) * 0.02;
      P.add('turretDetail', KIT.box(0.03, 0.03, 0.06), xs, y, cheekFaceZ(xs) + 0.025);
    }
  }
  P.add('turretDark', KIT.box(0.40, 0.09, 0.05), -0.83, c.floorY + 0.06, cheekFaceZ(0.83) + 0.025, 0, -SWEEP, 0);
  // the brow over the slot, closing it where the mantlet's chamfer meets it, the mantlet's seal on it: the dark groove,
  // the bolted cover's plate and its lip
  const browFront = D.gunLocal[2] + MANTLET.faceZ - MANTLET.chamferRun;
  P.add('turret', KIT.box(c.slotHalfW * 2, 0.04, browFront - root), 0, c.topY - 0.02, (browFront + root) / 2);
  const coverW = c.slotHalfW * 2 - 0.04, coverZ1 = browFront - 0.05;
  P.add('turretDark', KIT.box(coverW - 0.02, 0.004, 0.05), 0, c.topY + 0.002, browFront - 0.025);
  P.add('turretDetail', KIT.box(coverW, 0.04, 0.28), 0, c.topY + 0.02, coverZ1 - 0.14);
  P.add('turretDetail', KIT.box(coverW - 0.02, 0.014, 0.016), 0, c.topY + 0.008, coverZ1 + 0.008);
  // the dark gun port behind the mantlet, on the shell's face between the cheeks
  P.add('turretDark', KIT.box(MANTLET.halfW * 2, 0.16, 0.012), 0, CHEEK.floorY + 0.09, D.frontZ + 0.008);
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
 * The Leopard 2A2's block mantlet in the gun slot (gun metres from the trunnion): its face 4 cm proud of the cheeks' faces
 * so it reads as the mantlet the Leopard 1 carried, its vertical edges bevelled, its top one chamfer from the face's top
 * edge back up under the brow, its back seated in the shell's front face.
 */
const MANTLET = Object.freeze({
  faceZ: CHEEK.faceZ + 0.04 - D.gunLocal[2], halfW: 0.48, bottom: -0.17, top: 0.30, chamferRun: 0.20, bevel: 0.03,
  backZ: D.frontZ - 0.04 - D.gunLocal[2],
});

/**
 * The gun mount: the block mantlet pitching with the gun; on its chamfer, the two rectangular plates welded on T 17's
 * mantlet to carry its trial equipment at Yuma in 1975 (panzerplace.eu); the coaxial MG3's port on the gun's left and
 * the FERO Z18 auxiliary sight's on its right (raised rings round their holes, the 2A2's); the gun's root one cone from
 * the face to the bolted ring, a canvas boot down onto the tube; the 120 mm.
 */
function gunAssembly(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const m = MANTLET, seg = P.q ? 24 : 14, face = m.faceZ, hw = m.halfW, lo = m.bottom;
  P.gunG.position.set(D.gunLocal[0], D.gunLocal[1], D.gunLocal[2]);
  const rect = (x: number, top: number): SectionPoint[] => [[-x, lo], [x, lo], [x, top], [-x, top]];
  const faceTop = m.top - 0.08, crown = CHEEK.topY - 0.045 - D.gunLocal[1], run = m.chamferRun;
  P.addGunExtra(sectionSolid([
    { z: m.backZ, ring: rect(hw, crown) },
    { z: face - run, ring: rect(hw, crown) },
    { z: face - m.bevel, ring: rect(hw, faceTop + (crown - faceTop) * m.bevel / run) },
    { z: face, ring: rect(hw - m.bevel, faceTop) },
  ]), 0, 0, 0);
  // T 17's two plates on the chamfer
  const rise = Math.atan2(crown - faceTop, run);
  for (const x of [-0.16, 0.16]) {
    const t = 0.45, z = face - run + t * run, y = crown - t * (crown - faceTop);
    P.addGunExtra(xform(box(0.12, 0.02, 0.14), 0, 0, 0, rise, 0, 0), x, y + 0.01, z);
  }
  // the root: one cone from the face to the bolted ring, its eight bolts, the canvas boot onto the tube
  P.addGunExtra(cylZ(0.13, 0.24, seg, 0.20), 0, 0, face + 0.12);
  P.addGunExtra(cylZ(0.135, 0.03, seg), 0, 0, face + 0.225);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    P.addGunExtraDark(cylZ(0.011, 0.015, 6), Math.cos(a) * 0.145, Math.sin(a) * 0.145, face + 0.20);
  }
  P.addGunExtra(cylZ(1.3 * D.barrelRadiusM, 0.14, seg, 0.125), 0, 0, face + 0.31);
  // the ports: a raised ring round the hole's dark floor
  const port = (x: number, y: number, rIn: number, rOut: number, proud: number): void => {
    P.addGunExtra(xform(latheY([[rOut, -0.01], [rOut, proud], [rIn, proud], [rIn, -0.01]], P.q ? 20 : 12),
      0, 0, 0, Math.PI / 2, 0, 0), x, y, face);
    P.addGunExtraDark(cylZ(rIn, 0.012, P.q ? 16 : 10), x, y, face + 0.008);
  };
  port(0.30, 0.12, 0.034, 0.05, 0.03);                                              // coaxial MG3
  port(-0.27, 0, 0.0425, 0.07, 0.10);                                               // FERO Z18
  P.add('gunMountGlass', cylZ(0.038, 0.006, P.q ? 16 : 10), -0.27, 0, face + 0.017);
  KIT.buildGun(P, { len: D.barrelLengthM, r: D.barrelRadiusM, sleeve: false, evac: 0.50, evacR: 1.55, collar: false, baseR: 0.13 });
  muzzleBore(P, { len: D.barrelLengthM, r: D.barrelRadiusM });
}

/**
 * The commander's PERI R17 and cupola (right), the loader's hatch (left), the gunner's periscope, the stand-offs; and the
 * roof gun. Kevin's call (2026-11-20, via Main): the 20 mm Rh 202 on the T 11's mount. Only T 05 and T 11 were built with
 * the circular cutout on the left of the roof, the bulge round it, that took the KPz 70's remotely controlled Rh 202, and
 * only T 11 had the gun fitted (panzerplace.eu, "Sekundarlafette fur Turm KPZ Leopard 2 (PT)"); this tank is a T 17
 * carrying the T 11's roof gun. The station is the KPz 70's own (profiles/mbt70Rh202.ts), the vehicle's working roof gun,
 * and it takes the loader's MG3's place: its barrel passes over the loader's hatch at rest.
 */
function roofFittings(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const roof = D.roofY, q = P.q;
  // the 2A2's PERI R17 at the front right of the commander's ring: a drum 0.3 m across, its head 0.45 m over the roof, the
  // window box angled forward
  const px = -0.80, pz = 0.06;
  P.add('turret', cylY(0.15, 0.15, 0.16, q ? 20 : 12), px, roof + 0.08, pz);
  P.add('turretDetail', box(0.26, 0.22, 0.24), px, roof + 0.27, pz);
  P.add('turretDetail', box(0.22, 0.10, 0.10), px, roof + 0.30, pz + 0.15, -0.25, 0, 0);
  P.add('turretGlass', box(0.17, 0.06, 0.016), px, roof + 0.30, pz + 0.205, -0.25, 0, 0);
  P.add('turretDetail', box(0.28, 0.02, 0.26), px, roof + 0.39, pz);
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

/** The walls: the 2A2's smoke discharger block at each rear corner, five grab handles a side, the turret number and the cross. */
function flankEquipment(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    // the 2A2's smoke dischargers: two rows of four in one block on a bracket at the bustle's rear corner, raised and
    // turned out past the cheeks
    const mz = SHELL[0][0] + 0.49, wall = wallAt(mz, 0.56);
    P.add('turretDetail', box(0.12, 0.30, 0.62), s * (wall + 0.06), 0.56, mz);
    for (const [y, row] of [[0.50, 0], [0.64, 1]] as const) {
      const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.04, len: 0.26, splay: s * 1.05, pitch: -0.45,
        arc: 0.16, spacing: 0.13, slot: 'detail', seed: 27430 + (s > 0 ? 1 : 0) + row * 2 });
      bank.position.set(s * (wall + 0.14), y, mz);
      P.turretG.add(bank);
    }
    // five grab handles a side on their stand-offs (the later turrets'; the early ones had two)
    for (const [z, y] of [[0.36, 0.22], [-0.95, 0.22], [-1.55, 0.22], [-2.10, 0.24], [-1.25, 0.50]]) {
      const x = s * (wallAt(z, y) + 0.05);
      P.add('turretDetail', box(0.022, 0.022, 0.40), x, y, z);
      for (const dz of [-0.18, 0.18]) P.add('turretDetail', box(0.06, 0.02, 0.02), x - s * 0.03, y, z + dz);
    }
  }
  // the crosses on the lower walls, laid on the wall's flare (its outward normal dips under the crease)
  const cz = -0.05, cy = 0.17, flare = Math.atan2(wallAt(cz, 0.36) - wallAt(cz, D.turretFloorY), 0.36 - D.turretFloorY);
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
