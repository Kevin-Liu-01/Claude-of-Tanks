// The early production Leopard 2s on the release-262 construction (the owner, 2026-10-28: "all based on our new leeopard
// 2 ... make a nnnew 2a2 and 2 nnnew 2a3 variannts, one of which is the otco"): the 2A2 (leo2a2), the 2A3 of the fourth
// batch (leo2a3_b4) and the 2A3 OTCO (leo2a3). Fresh first-party builds: the release's Leopard 2-pattern hull and seven-wheel
// gear (leopard2Hull.ts) with the heavy fore skirt blocks hanging deeper than the aft run and the forward fuel fillers,
// and one vertical-faced turret at the Christian II concept model's measured Leopard 2 turret proportions (read for
// proportions only; nothing traced): two cheek blocks with chamfered outer corners framing the recessed mantlet and its
// round boss, the EMES 15 sight's tall window in the right cheek under its housing, the commander's PERI R17 and hatch
// with its periscope ring right, the loader's hatch and MG3 left, the ammunition hatch on the left wall, the eight smoke
// dischargers a side in one block at the bustle's rear corners, the stepped bustle with its rear basket.
//
// The batches, as built (Jerchel and Schnellbacher, "Leopard 2 Main Battle Tank 1979-1998"; en.wikipedia "Leopard 2"):
// - 2A2: the first batch brought to the second and third batches' standard. Its crosswind sensor's hole is closed by a
//   round plate; the ammunition hatch still opens; the SEM 25/35 radios' tall antenna bases; pressed exhaust louvres.
// - 2A3: the fourth batch (December 1984 - December 1985). The SEM 80/90 radios' short bases, the ammunition hatch welded
//   shut, round-rod exhaust grilles; no crosswind sensor.
// - OTCO: a fourth-batch 2A3 with the field-modification package: a bolted rim round the turret's foot, spaced shrouds
//   standing on it over the turret's sides, a tall barred cage off the bustle, a second radio pair in guard cages.
// Photo-checked against the cited Bundeswehr Leopard 2s on the owner's sheets (a blind critic, 2026-10-28).
//
// Frames: hull metres on the hull (+Z forward, y up from the ground; the world's right of a +Z hull is -X); turret metres
// from the ring's centre on the deck (world 0, 1.64, 0.37). The datums are leopard2a3B4Armor.ts's.
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { buildLeopard2Hull, mirrorRing } from './leopard2Hull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M, LEO2A3B4_TURRET } from '../leopard2a3B4Armor.ts';

const T = LEO2A3B4_TURRET;

/** What sets one early production tank apart on the shared construction. */
interface EarlyLeopard2 {
  readonly batch: '2A2' | '2A3';
  /** The OTCO field-modification package. */
  readonly otco: boolean;
  /** The rear mudguard flaps' articulation name. */
  readonly flapName: string;
  /** Seeds for the tank's own fittings. */
  readonly seed: number;
}

/** A welded section, counter-clockwise from +Z: chamfered lower corners, vertical walls, a bevelled roof edge. */
function shellRing(hw: number, bottom: number, shoulder: number, roof: number, foot = 0.05, bevel = 0.07): SectionPoint[] {
  return [
    [-hw + foot, bottom], [hw - foot, bottom], [hw, bottom + foot], [hw, shoulder],
    [hw - bevel, roof], [-hw + bevel, roof], [-hw, shoulder], [-hw, bottom + foot],
  ];
}

/** The welded shell from the bustle's rear plate to the cheeks' root, the roof falling toward the front. */
function turretShell(P: TankBuilderPort): void {
  const s = (z: number, hw: number, bottom: number, shoulder: number, roof: number): SolidSection =>
    ({ z, ring: shellRing(hw, bottom, shoulder, roof) });
  P.add('turret', sectionSolid([
    s(T.rearZ, T.rearHalfWidthM, 0.27, 0.76, 0.80),
    s(-2.45, T.bustleHalfWidthM, T.bustleFloorY, 0.78, T.roofY),
    // the bustle's floor eases up from the ring to its full 0.21 m only behind the step
    s(T.stepZ - 0.04, T.bustleHalfWidthM, 0.17, 0.78, T.roofY + 0.005),
    s(T.stepZ, T.halfWidthM, 0.16, 0.78, T.roofY + 0.005),
    s(-1.29, T.halfWidthM, 0.12, 0.78, T.roofY + 0.005),
    s(-0.87, T.halfWidthM, T.floorY, 0.78, T.roofY),
    s(-0.40, T.halfWidthM, T.floorY, 0.77, T.roofY),
    // the roof's bevel falls 6 cm over the last half metre to the cheeks
    s(0.77, T.halfWidthM, T.floorY, 0.76, 0.80),
    s(T.cornerZ, T.halfWidthM, T.floorY, 0.735, 0.775),
  ], { sideQuadDiagonal: 'convex' }));
}

/** The two cheek blocks: vertical faces either side of the gun slot, the outer corners chamfered back to the walls. */
function cheeks(P: TankBuilderPort): void {
  const { box } = KIT;
  const inner = T.slotHalfWidthM, z0 = T.cornerZ, z1 = T.frontZ, hw = T.halfWidthM;
  const right: SolidSection[] = [
    { z: z0 - 0.02, ring: [[-hw, T.floorY], [-inner, T.floorY], [-inner, 0.775], [-hw, 0.775]] },
    { z: z1, ring: [[-T.frontHalfWidthM, T.floorY + 0.02], [-inner, T.floorY + 0.02], [-inner, T.roofFrontY], [-T.frontHalfWidthM, T.roofFrontY]] },
  ];
  P.add('turret', sectionSolid(right));
  P.add('turret', sectionSolid(right.map((st) => ({ z: st.z, ring: mirrorRing(st.ring) }))));
  // the brow over the gun slot, closing it to a seam over the mantlet
  P.add('turret', box(inner * 2, 0.04, z1 - z0 - 0.02), 0, T.roofFrontY - 0.01, (z0 + z1) / 2 - 0.01);
  for (const sx of [-1, 1]) {
    // the welded joint between the front plate and the cheek's side, and the lifting lug on the left brow
    P.add('turretDark', box(0.012, 0.70, 0.012), sx * (inner + 0.012), 0.38, z1 + 0.002);
    if (sx > 0) P.add('turretDetail', box(0.08, 0.05, 0.06), sx * 0.80, T.roofFrontY + 0.02, z1 - 0.10);
  }
}

/**
 * The mantlet recessed 3 cm in the slot behind the cheeks' faces, the round boss standing 16 cm proud of it on a bolted
 * flange and narrowing to the thermal sleeve (the photographed gun root), the coaxial MG3's port on the gun's left and the
 * FERO Z18 auxiliary sight's on its right, the 120 mm L/44.
 */
function gunAssembly(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const face = T.mantletFaceZ, seg = P.q ? 24 : 14;
  P.gunG.position.set(T.gunLocal[0], T.gunLocal[1], T.gunLocal[2]);
  P.addGunExtra(sectionSolid([
    { z: -0.10, ring: [[-0.44, -0.27], [0.44, -0.27], [0.44, 0.30], [-0.44, 0.30]] },
    { z: face - 0.03, ring: [[-0.44, -0.27], [0.44, -0.27], [0.44, 0.30], [-0.44, 0.30]] },
    { z: face, ring: [[-0.42, -0.25], [0.42, -0.25], [0.42, 0.28], [-0.42, 0.28]] },
  ]), 0, 0, 0);
  P.addGunExtra(cylZ(0.25, 0.04, seg), 0, 0, face + 0.02);                         // the boss's flange
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    P.addGunExtraDark(cylZ(0.012, 0.02, 6), Math.cos(a) * 0.235, Math.sin(a) * 0.235, face + 0.05);
  }
  P.addGunExtra(cylZ(0.22, 0.12, seg), 0, 0, face + 0.10);                         // the boss
  P.addGunExtra(cylZ(0.15, 0.06, seg, 0.22), 0, 0, face + 0.19);                   // its shoulder down to the sleeve
  P.addGunExtraDark(cylZ(0.026, 0.06, 8), 0.28, 0.06, face + 0.02);                // coaxial MG3 port
  P.addGunExtraDark(box(0.12, 0.10, 0.014), -0.27, 0.08, face + 0.007);           // FERO Z18 auxiliary sight port
  KIT.buildGun(P, { len: T.barrelLengthM, r: T.barrelRadiusM, sleeve: true, evac: 0.56, evacR: 1.78, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: T.barrelLengthM, r: T.barrelRadiusM });
}

/**
 * The EMES 15 sight: its armoured housing on the right cheek's top (0.55 m wide at its foot, 0.7 m long, its sides sloped
 * 20 degrees, its front flush with the cheek's face), and the tall window in the cheek's face under it between the two
 * armoured door leaves, 0.26 m wide and 0.30 m tall as photographed.
 */
function emes15(P: TankBuilderPort): void {
  const { box } = KIT;
  const x = -0.74, foot = T.roofFrontY - 0.08, top = T.roofFrontY + 0.12, z1 = T.frontZ, z0 = z1 - 0.70;
  const half = 0.275, crown = half - (top - foot) * Math.tan(20 * Math.PI / 180);
  const ring: SectionPoint[] = [[x - half, foot], [x + half, foot], [x + crown, top], [x - crown, top]];
  P.add('turret', sectionSolid([{ z: z0, ring }, { z: z1, ring }]));
  const wy = T.roofFrontY - 0.13;
  P.add('turretDark', box(0.32, 0.36, 0.012), x, wy, z1 + 0.003);
  P.add('turretGlass', box(0.26, 0.30, 0.016), x, wy, z1 + 0.008);
  for (const dx of [-0.175, 0.175]) P.add('turretDetail', box(0.035, 0.38, 0.02), x + dx, wy, z1 + 0.012);
  P.add('turretDetail', box(0.40, 0.03, 0.03), x, wy + 0.20, z1 + 0.015);
}

/** The commander's PERI R17 and hatch with its periscope ring (right), the loader's hatch and MG3 (left), the lugs. */
function roofFittings(P: TankBuilderPort, v: EarlyLeopard2): void {
  const { box, cylY, torus } = KIT;
  // PERI R17 at the front right of the commander's ring: a drum 0.3 m across, its head 0.45 m over the roof, the window
  // box angled forward
  const px = -0.92, pz = -0.02;
  P.add('turret', cylY(0.15, 0.15, 0.16, P.q ? 20 : 12), px, T.roofY + 0.08, pz);
  P.add('turretDetail', box(0.26, 0.22, 0.24), px, T.roofY + 0.27, pz);
  P.add('turretDetail', box(0.22, 0.10, 0.10), px, T.roofY + 0.30, pz + 0.15, -0.25, 0, 0);
  P.add('turretGlass', box(0.17, 0.06, 0.016), px, T.roofY + 0.30, pz + 0.205, -0.25, 0, 0);
  P.add('turretDetail', box(0.28, 0.02, 0.26), px, T.roofY + 0.39, pz);
  // the commander's ring: a low collar, its eight periscopes 10 cm over the roof
  const cx = -0.78, cz = -0.48;
  P.add('turret', cylY(0.38, 0.40, 0.09, P.q ? 28 : 16), cx, T.roofY + 0.04, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.add('turretDetail', box(0.10, 0.06, 0.05), cx + Math.sin(a) * 0.35, T.roofY + 0.10, cz + Math.cos(a) * 0.35, 0, a, 0);
    P.add('turretGlass', box(0.07, 0.03, 0.012), cx + Math.sin(a) * 0.376, T.roofY + 0.105, cz + Math.cos(a) * 0.376, 0, a, 0);
  }
  P.addHatch('turretHatch', cylY(0.28, 0.28, 0.04, P.q ? 24 : 14), cx, T.roofY + 0.105, cz);
  P.add('turretDark', box(0.30, 0.025, 0.04), cx, T.roofY + 0.13, cz - 0.20);
  // the loader's flat hatch on its ring, the MG3 on the ring's mount
  const lx = 0.62, lz = -0.52;
  P.add('turret', cylY(0.34, 0.35, 0.06, P.q ? 24 : 14), lx, T.roofY + 0.025, lz);
  P.addHatch('turretHatch', cylY(0.29, 0.29, 0.03, P.q ? 24 : 14), lx, T.roofY + 0.07, lz);
  P.add('turretDark', box(0.28, 0.022, 0.035), lx, T.roofY + 0.09, lz - 0.20);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mg3', tone: 'two-tone', seed: v.seed + 3, rotation: [0, 0.10, 0],
    working: true, ridingCradle: true });
  mg.name = 'leo2a3b4LoaderMG3';
  mg.position.set(lx + 0.10, T.roofY + 0.09, lz - 0.16);
  P.turretG.add(mg);
  // the 2A2's round plate bolted over its crosswind sensor's hole (the later batches were built without the sensor)
  if (v.batch === '2A2') {
    P.add('turretDetail', cylY(0.10, 0.10, 0.015, P.q ? 20 : 12), 0, T.roofY + 0.008, -2.30);
    P.add('turretDark', torus(0.085, 0.006, P.q ? 20 : 12), 0, T.roofY + 0.016, -2.30);
  }
  for (const [x, z] of [[1.05, 0.55], [-0.30, 0.70], [0.95, -1.95], [-0.95, -1.95]]) {
    KIT.liftEye(P, 'turretDetail', x, T.roofY - (z > 0.4 ? 0.06 : 0) + 0.015, z);
  }
}

/**
 * The walls' fittings: two grab rails a side, the smoke dischargers (two rows of four a side in one block on a bracket at
 * the bustle's rear corner, raised and turned out past the cheeks), the ammunition hatch on the left wall (hinged and
 * handled on the 2A2, welded shut from the fourth batch), the radios' antenna bases on the bustle roof.
 */
function flankEquipment(P: TankBuilderPort, v: EarlyLeopard2): void {
  const { box, cylY, cylZ } = KIT;
  for (const sx of [-1, 1]) {
    // the grab rails on their stand-offs: one low on the wall's front half, one higher over the ammunition hatch (under
    // the OTCO's shrouds, none)
    for (const [y, z0, z1] of v.otco ? [] : [[0.30, 0.20, 0.95], [0.60, -1.05, -0.25]]) {
      P.add('turretDetail', box(0.022, 0.022, z1 - z0), sx * (T.halfWidthM + 0.06), y, (z0 + z1) / 2);
      for (const z of [z0 + 0.03, z1 - 0.03]) P.add('turretDetail', box(0.06, 0.02, 0.02), sx * (T.halfWidthM + 0.03), y, z);
    }
    // the discharger block's bracket on the bustle wall, its face flush with the turret's side ahead of it
    const bx = sx * (T.bustleHalfWidthM + 0.06);
    P.add('turretDetail', box(0.12, 0.30, 0.62), bx, 0.56, -2.24);
    for (const [y, row] of [[0.50, 0], [0.64, 1]]) {
      const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.04, len: 0.26, splay: sx * 1.05, pitch: -0.45,
        arc: 0.16, spacing: 0.13, slot: 'detail', seed: v.seed + 10 + (sx > 0 ? 1 : 0) + row * 2 });
      bank.position.set(sx * (T.bustleHalfWidthM + 0.14), y, -2.24);
      P.turretG.add(bank);
    }
    // the radios' antenna bases on the bustle roof, their whips: the SEM 25/35's tall bases (2A2), the SEM 80/90's short
    const tall = v.batch === '2A2';
    P.add('turretDetail', cylY(tall ? 0.065 : 0.05, tall ? 0.08 : 0.06, tall ? 0.15 : 0.08, 10), sx * 0.80,
      T.roofY + (tall ? 0.075 : 0.04), -2.25);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.20, r: 0.011, seed: v.seed + 20 + (sx > 0 ? 1 : 0),
      rotation: [-0.06, 0, 0] });
    whip.position.set(sx * 0.80, T.roofY + (tall ? 0.15 : 0.08), -2.25);
    P.turretG.add(whip);
  }
  // the ammunition hatch on the left (loader's) wall: a raised plate on its frame
  const hx = T.halfWidthM + 0.0175;
  P.add('turretDetail', box(0.035, 0.38, 0.54), hx, 0.42, -0.30);
  if (v.batch === '2A2') {
    // still in service: the hinge line along its top, two hinge knuckles and the handle
    P.add('turretDark', box(0.037, 0.012, 0.52), hx + 0.0015, 0.615, -0.30);
    for (const z of [-0.48, -0.12]) P.add('turretDetail', cylZ(0.022, 0.09, 8), hx + 0.03, 0.60, z);
    P.add('turretDetail', box(0.03, 0.03, 0.14), hx + 0.03, 0.38, -0.30);
  } else {
    // welded shut: the bead round its edge, no handle
    for (const [dy, dz, h, d] of [[0.195, 0, 0.012, 0.56], [-0.195, 0, 0.012, 0.56], [0, 0.275, 0.40, 0.012], [0, -0.275, 0.40, 0.012]]) {
      P.add('turretDark', box(0.04, h, d), hx + 0.002, 0.42 + dy, -0.30 + dz);
    }
  }
}

/** The bustle's rear plate and the open basket hung off it (the OTCO's deeper, wider rack). */
function rearBasket(P: TankBuilderPort, v: EarlyLeopard2): void {
  const { box } = KIT;
  const z = T.rearZ, depth = v.otco ? 0.50 : 0.34, half = v.otco ? 1.04 : 0.87, back = z - depth, low = 0.28;
  const top = v.otco ? 0.86 : 0.66, rails = v.otco ? [low, 0.47, 0.66, top] : [low, (low + top) / 2, top];
  for (const y of rails) P.add('turretDetail', box(half * 2, 0.035, 0.035), 0, y, back);
  const bars = v.otco ? 10 : 8;
  for (let k = 0; k <= bars; k++) P.add('turretDetail', box(0.03, top - low, 0.03), -half + 0.01 + k * (2 * half - 0.02) / bars, (low + top) / 2, back);
  for (const sx of [-1, 1]) {
    for (const y of v.otco ? rails : [low, top]) P.add('turretDetail', box(0.035, 0.035, depth + 0.02), sx * half, y, z - depth / 2 + 0.01);
    // the OTCO's cage: its sides barred too
    if (v.otco) for (const dz of [0.17, 0.34]) P.add('turretDetail', box(0.03, top - low, 0.03), sx * half, (low + top) / 2, z - dz);
  }
  P.add('turretDark', KIT.openRackGrid(half * 2 - 0.04, depth - 0.02, 0.016, 5, bars + 1), 0, low + 0.02, z - depth / 2);
  KIT.stowage(P, 'turretCloth', P.rng, v.otco
    ? [[-0.60, low + 0.16, z - 0.26, 0.62, 0.30, 0.34], [0.10, low + 0.15, z - 0.25, 0.56, 0.28, 0.32], [0.70, low + 0.14, z - 0.24, 0.40, 0.26, 0.30]]
    : [[-0.48, low + 0.16, z - 0.18, 0.58, 0.30, 0.26], [0.26, low + 0.15, z - 0.19, 0.52, 0.28, 0.25]]);
}

/**
 * The OTCO's field modification (the owner, 2026-10-28: "keep the rim thing around it that made it special (can redesign
 * it tho) and the cages"): a bolted rim round the turret's foot from ahead of the cheeks, round the corners and along the
 * walls and the bustle to its rear corners, four spaced shrouds a side standing on it from the cheek's corner to the step
 * (capped back to the wall), and a second radio pair at the bustle's front corners in their guard cages.
 */
function otcoPackage(P: TankBuilderPort, v: EarlyLeopard2): void {
  const { box, cylX, cylY } = KIT;
  // the rim: [z, inner x, outer x, inner z, outer z] stations, the inner edge on the turret's outline
  const rim: Array<[number, number, number, number]> = [
    [0.50, T.frontZ, 0.50, T.frontZ + 0.18], [T.frontHalfWidthM, T.frontZ, T.frontHalfWidthM + 0.10, T.frontZ + 0.18],
    [T.halfWidthM, T.cornerZ, T.halfWidthM + 0.18, T.cornerZ + 0.07], [T.halfWidthM, T.stepZ, T.halfWidthM + 0.18, T.stepZ],
    [T.bustleHalfWidthM, T.stepZ - 0.04, T.bustleHalfWidthM + 0.25, T.stepZ - 0.18],
    [T.bustleHalfWidthM, -2.45, T.bustleHalfWidthM + 0.25, -2.55], [T.rearHalfWidthM, T.rearZ, T.rearHalfWidthM + 0.09, T.rearZ - 0.17],
  ];
  const lo = 0.16, hi = 0.27;
  for (const sx of [-1, 1]) {
    for (let k = 0; k + 1 < rim.length; k++) {
      const [ax, az, bx, bz] = rim[k], [cx, cz, dx, dz] = rim[k + 1];
      const quad = (y: number) => [[sx * ax, y, az], [sx * bx, y, bz], [sx * dx, y, dz], [sx * cx, y, cz]];
      P.add('turret', orientedSlab(...quad(lo), ...quad(hi)));
    }
    // the rim's bolts along its outer edge
    for (let k = 1; k + 1 < rim.length; k++) {
      const [, , bx, bz] = rim[k];
      P.add('turretDetail', cylY(0.02, 0.02, 0.016, 8), sx * (bx - 0.05), hi + 0.008, bz - (k < 3 ? 0.03 : 0));
    }
    // the shrouds on the rim, leaning out 2 degrees
    const out = T.halfWidthM + 0.11, z0 = T.cornerZ - 0.06, z1 = T.stepZ + 0.04, n = 4, L = (z0 - z1) / n;
    for (let k = 0; k < n; k++) {
      const zc = z0 - L * (k + 0.5);
      P.add('turret', box(0.05, 0.45, L - 0.02), sx * out, hi + 0.225, zc, 0, 0, -sx * 0.035);
      for (const y of [hi + 0.06, hi + 0.39]) for (const dz of [-L / 2 + 0.08, L / 2 - 0.08]) {
        P.add('turretDetail', cylX(0.018, 0.016, 8), sx * (out + 0.03), y, zc + dz);
      }
    }
    P.add('turret', box(0.13, 0.03, z0 - z1), sx * (T.halfWidthM + 0.065), hi + 0.465, (z0 + z1) / 2);
    // the second radio pair's bases and whips, each in a four-post guard cage
    const ax = sx * 1.05, az = -1.50;
    P.add('turretDetail', cylY(0.035, 0.045, 0.06, 10), ax, T.roofY + 0.03, az);
    for (const [px, pz] of [[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14]]) {
      P.add('turretDetail', box(0.022, 0.26, 0.022), ax + px, T.roofY + 0.13, az + pz);
    }
    for (const y of [T.roofY + 0.12, T.roofY + 0.25]) {
      for (const dz of [-0.14, 0.14]) P.add('turretDetail', box(0.30, 0.02, 0.02), ax, y, az + dz);
      for (const dx of [-0.14, 0.14]) P.add('turretDetail', box(0.02, 0.02, 0.30), ax + dx, y, az);
    }
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: sx < 0 ? 0.78 : 0.66, r: 0.011, rake: sx * 0.038,
      seed: v.seed + 30 + (sx > 0 ? 1 : 0) });
    whip.position.set(ax, T.roofY + 0.05, az);
    P.turretG.add(whip);
  }
}

function turret(P: TankBuilderPort, v: EarlyLeopard2): void {
  P.turretG.position.set(T.pivot[0], T.pivot[1], T.pivot[2]);
  P.add('turret', KIT.cylY(1.00, 1.00, 0.03, P.q ? 48 : 24), 0, 0.013, 0);                       // ring guard
  turretShell(P);
  cheeks(P);
  gunAssembly(P);
  emes15(P);
  roofFittings(P, v);
  flankEquipment(P, v);
  rearBasket(P, v);
  if (v.otco) otcoPackage(P, v);
  const sideX = T.halfWidthM + (v.otco ? 0.137 : 0.002);
  for (const side of [-1, 1]) P.decal('turret', 'number', null, 0.24, [side * sideX, 0.42, 0.40], side * Math.PI / 2);
}

function earlyLeopard2(v: EarlyLeopard2): (P: TankBuilderPort) => void {
  return (P) => {
    buildLeopard2Hull(P, { flapName: v.flapName, exhaust: v.batch === '2A2' ? 'louvre' : 'rods',
      foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M, fuelFillers: true });
    turret(P, v);
    P.topY = 1.24;
  };
}

export const LEOPARD2A3B4_PROFILES = {
  leo2a2: { build: earlyLeopard2({ batch: '2A2', otco: false, flapName: 'leo2a2-rear-flap', seed: 26200 }) },
  leo2a3_b4: { build: earlyLeopard2({ batch: '2A3', otco: false, flapName: 'leo2a3b4-rear-flap', seed: 26220 }) },
  leo2a3: { build: earlyLeopard2({ batch: '2A3', otco: true, flapName: 'leo2a3-otco-rear-flap', seed: 26260 }) },
} satisfies VehicleProfileRecord;
