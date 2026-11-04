// K21 (k21X.ts) — r268b deck and roof kit (owner, 2026-11-02: "add more upper glacis and roof details").
//
// Every part rides on the measured source-X hull and turret (builder metres, the source frame; the factory's 0.90 size
// policy scales them with the rest). Hull and turret shells, stations and envelopes are unchanged: the parts sit in the
// detail buckets. Two limits shape the hull parts: the turret's rear basket sweeps the deck out to 2.17 m from the ring
// axis (z -0.55) with its seated floor at 2.041, so deck parts inside that radius stand no higher than 2.015 (the old
// right-hand periscopes and the floating driver's plate stood 2.07-2.10 there, into the basket's sweep), yet at least
// 2.009 somewhere at every radius they covered, so the turret seat's swept-deck receipt keeps its 4 cm cap; and the
// bow and rear-hull receipts' witness rays (x 0 and -0.76 forward of z 1.95; x ±0.8, ±1.0, ±1.4, ±1.5 over the rear
// roof) stay on their stock.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { equipment } from './easternSourceKit.ts';
import { K21_HATCHES, k21TurretRoofAt } from './k21Turret.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;

/** The hull's top in front of the turret: the roof loft (z 0.81 1.995 -> z 1.8389 1.953), then the bow deck plate
 *  (1.9667 at z 1.8428, falling 0.29095 a metre). */
function frontDeckY(z: number): number {
  return z < 1.8428 ? 1.995 - (z - 0.81) * (0.042 / 1.0289) : 1.9667 - (z - 1.8428) * 0.29095;
}

/** A (z, y) side profile listed CLOCKWISE (z to the right, y up), lofted across x from x0 to x1; its ends shrink to
 *  `end` of the profile about its centroid over `c` metres. */
function sideLoft(profile: readonly (readonly [number, number])[], x0: number, x1: number, c = 0, end = 1): THREE.BufferGeometry {
  const cz = profile.reduce((s, p) => s + p[0], 0) / profile.length;
  const cy = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  const st: [number, number][] = c > 0 ? [[x0, end], [x0 + c, 1], [x1 - c, 1], [x1, end]] : [[x0, 1], [x1, 1]];
  return sectionSolid(st.map(([x, k]) => ({
    z: x, ring: profile.map(([z, y]): SectionPoint => [-(cz + (z - cz) * k), cy + (y - cy) * k]),
  })), { sideQuadDiagonal: 'convex' }).rotateY(Math.PI / 2);
}

/** A periscope head in its own frame (y up from the plate, +z the way it looks): 0.10 deep, 0.07 tall, its window raked
 *  back 37 degrees with the dark glass 3 mm proud of it, its foot 10 mm into the plate. */
function periscopeHead(halfW: number): { housing: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const housing = sideLoft([[-0.05, -0.01], [-0.05, 0.056], [-0.036, 0.07], [0.004, 0.07], [0.046, 0.014], [0.046, -0.01]],
    -halfW, halfW, 0.012, 0.9);
  const lean = Math.atan2(0.042, 0.056), len = Math.hypot(0.042, 0.056);
  const glass = KIT.xform(box(halfW * 2 - 0.035, len * 0.74, 0.006), 0, 0.042 + Math.sin(lean) * 0.003,
    0.025 + Math.cos(lean) * 0.003, -lean, 0, 0);
  return { housing, glass };
}

function periscope(P: TankBuilderPort, owner: 'hull' | 'turret', x: number, y: number, z: number, tilt: number, yaw: number,
  halfW = 0.06): void {
  const { housing, glass } = periscopeHead(halfW);
  equipment(P, owner, 'Detail', housing, x, y, z, tilt, yaw, 0);
  equipment(P, owner, 'Glass', glass, x, y, z, tilt, yaw, 0);
}

/** A U grab handle along x: two feet and a round bar `h` over its seat, tilted `tilt` about x with its seat. */
function grabHandle(P: TankBuilderPort, owner: 'hull' | 'turret', x: number, y: number, z: number, w: number, h: number,
  tilt = 0): void {
  const parts = [box(0.016, h + 0.008, 0.016).translate(-w / 2, (h - 0.008) / 2, 0),
    box(0.016, h + 0.008, 0.016).translate(w / 2, (h - 0.008) / 2, 0), cylX(0.009, w + 0.016, 8).translate(0, h, 0)];
  equipment(P, owner, 'Detail', KIT.mergeAll(parts), x, y, z, tilt, 0, 0);
}

/** The driver's station (left front, x 0.39..1.06): the source's raised hatch housing as a closed welded box on the
 *  deck (it replaces the 4 cm plate whose front stood 16 cm off the deck, tilted the wrong way), three periscopes on its
 *  sloped front looking ahead (photographs: the K21's driver sits front left, his periscopes in front of the hatch), and
 *  on its top a round hatch lid (round 2, the blind critics: "make the lid read as a hatch") with its seam ring, an
 *  outboard hinge and a grab handle. Inside the basket's reach (2.17 m off the ring axis) nothing stands over 2.015. */
function addK21DriverStation(P: TankBuilderPort): void {
  const cx = 0.725;
  // [z, half width at the foot, half width at the top, top]: a near-level top (1.997 -> 1.990), then the sloped front
  const st: readonly (readonly [number, number, number, number])[] = [[1.17, 0.335, 0.31, 1.997],
    [1.86, 0.335, 0.31, 1.990], [2.16, 0.18, 0.17, frontDeckY(2.16) + 0.005]];
  equipment(P, 'hull', 'Detail', sectionSolid(st.map(([z, hb, ht, top]) => {
    const foot = frontDeckY(z) - 0.02;
    return { z, ring: [[cx - hb, foot], [cx + hb, foot], [cx + ht, top], [cx - ht, top]] as SectionPoint[] };
  }), { sideQuadDiagonal: 'convex' }), 0, 0, 0);
  const topAt = (z: number): number => 1.997 - (z - 1.17) * (0.007 / 0.69), slope = Math.atan2(0.007, 0.69);
  // the round lid (r 0.24, 18 mm, 2 mm into the top) and its dark seam ring at the top
  const lz = 1.50, seg = P.q ? 28 : 16;
  equipment(P, 'hull', 'Detail', cylY(0.235, 0.245, 0.018, seg), cx, topAt(lz) + 0.007, lz, slope, 0, 0);
  equipment(P, 'hull', 'Dark', KIT.torus(0.246, 0.006, seg), cx, topAt(lz) + 0.0005, lz, slope, 0, 0);
  // the hinge on the lid's outboard edge (2.27 m off the ring axis, past the basket): a bracket on the housing's top, a
  // barrel along z and a strap onto the lid
  equipment(P, 'hull', 'Detail', box(0.05, 0.03, 0.15), cx + 0.268, topAt(lz) + 0.012, lz);
  equipment(P, 'hull', 'Dark', cylZ(0.02, 0.17, 10), cx + 0.262, topAt(lz) + 0.030, lz);
  equipment(P, 'hull', 'Detail', box(0.11, 0.010, 0.045), cx + 0.205, topAt(lz) + 0.019, lz);
  // the lid's grab handle, on its inboard front (2.26 m off the ring axis)
  grabHandle(P, 'hull', cx - 0.06, topAt(1.62) + 0.012, 1.62, 0.15, 0.03, slope);
  // three periscopes on the sloped front (z 1.86 -> 2.16, 20 degrees), splayed 12 degrees
  const front = Math.atan2(1.990 - (frontDeckY(2.16) + 0.005), 0.30);
  const zp = 1.965, yp = 1.990 - (zp - 1.86) * Math.tan(front);
  for (const k of [-1, 0, 1]) periscope(P, 'hull', cx + k * 0.13, yp, zp - Math.abs(k) * 0.012, front, k * 0.21, 0.055);
}

/** The engine deck right of the driver (the powerpack is front right): the cooling-air grille in front of the turret
 *  (x -0.06..-0.70, z 0.75..1.62, its rear under the turret front's overhang, as the photographs' covered grille sits),
 *  round 2 (the blind critics): a thin level frame round a flush covered mesh, no deep well and no proud louvres; and
 *  the access plate outboard of it
 *  (x -0.86..-1.38). They replace a second round hatch and three driver's periscopes drawn
 *  over the engine (the source and the photographs have neither). */
function addK21EngineDeck(P: TankBuilderPort): void {
  const x0 = -0.70, x1 = -0.06, z0 = 0.75, z1 = 1.62, top = 2.012, w = 0.03;
  const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
  // frame strips: level top at 2.012, feet 15 mm into the roof (deeper toward the bow as the roof falls)
  const strip = (xa: number, xb: number, za: number, zb: number): void => {
    const footA = frontDeckY(za) - 0.015, footB = frontDeckY(zb) - 0.015;
    equipment(P, 'hull', 'Detail', sectionSolid([
      { z: za, ring: [[xa, footA], [xb, footA], [xb, top], [xa, top]] },
      { z: zb, ring: [[xa, footB], [xb, footB], [xb, top], [xa, top]] },
    ]), 0, 0, 0);
  };
  strip(x0, x0 + w, z0, z1); strip(x1 - w, x1, z0, z1);
  strip(x0 + w, x1 - w, z0, z0 + w); strip(x0 + w, x1 - w, z1 - w, z1);
  // the covered mesh: a dark cover 4 mm under the frame's top, with a coarse grid of thin flat bars 2 mm proud of it
  const roofTilt = Math.atan(0.042 / 1.0289), iw = x1 - x0 - 2 * w, il = z1 - z0 - 2 * w;
  equipment(P, 'hull', 'Dark', box(iw, 0.006, il), xc, top - 0.007, zc);
  if (P.q) {
    const bars: THREE.BufferGeometry[] = [];
    for (let k = 1; k < 4; k++) bars.push(box(0.01, 0.004, il).translate(x0 + w + iw * k / 4, 0, zc));
    for (let k = 1; k < 7; k++) bars.push(box(iw, 0.004, 0.01).translate(xc, 0, z0 + w + il * k / 7));
    equipment(P, 'hull', 'Detail', KIT.mergeAll(bars), 0, top - 0.003, 0);
  }
  // outboard access plate: 7 mm proud and plain (no bolt ring, no handles in guards: the critics read such rows of
  // small items as clutter)
  const px = -1.12, pz = 1.30, pw = 0.50, pl = 0.86, c = 0.05;
  const shape = new THREE.Shape();
  shape.moveTo(-pw / 2 + c, -pl / 2);
  for (const [a, b] of [[pw / 2 - c, -pl / 2], [pw / 2, -pl / 2 + c], [pw / 2, pl / 2 - c], [pw / 2 - c, pl / 2],
    [-pw / 2 + c, pl / 2], [-pw / 2, pl / 2 - c], [-pw / 2, -pl / 2 + c]] as const) shape.lineTo(a, b);
  shape.closePath();
  const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
  equipment(P, 'hull', 'Detail', plate, px, frontDeckY(pz) - 0.005, pz, roofTilt, 0, 0);
}

/** r268b round 2 (the blind critics on both builds: "the upper glacis 2 x 6 grid of appliqué tiles"; the photographs
 *  show a plain sloped plate with the lamp clusters at the corners): the source's fourteen clamped blocks become two
 *  plain plates on the blocks' own top plane (so the measured bow line stays the source's), closed down to the deck,
 *  chamfered round their top edges and parted by one 15 mm seam where the source's columns part (x 0.34..0.42).
 *  Frame: the blocks' pitch about x, origin midway between the two block rows' centres. */
export function addK21GlacisPlates(P: TankBuilderPort, pitch: number): void {
  // the rear face 3 cm forward of the blocks' rear edge, so the deck behind keeps the bow receipt's source witness at
  // z 2.65 (it lay in the gap under the stood-off blocks)
  const top = 0.0549, foot = -0.1164, rear = -0.3112, half = 0.3412, c = 0.035, ends = 0.06;
  for (const [x0, x1] of [[-1.1058, 0.370], [0.385, 1.4977]]) {
    const ring = (t: number): SectionPoint[] => [[x0, foot], [x1, foot], [x1, t - c], [x1 - c, t], [x0 + c, t], [x0, t - c]];
    const plate = sectionSolid([{ z: rear, ring: ring(top - ends) }, { z: rear + ends, ring: ring(top) },
      { z: half - ends, ring: ring(top) }, { z: half, ring: ring(top - ends) }], { sideQuadDiagonal: 'convex' });
    equipment(P, 'hull', 'Detail', plate, 0, 1.7423055, 2.9944655, pitch);
  }
}

/** The bow deck's service lid: a U grab handle on its open rear corner (x -0.58, z 2.53, behind the glacis armour
 *  plates), as the photographs show the lid's handles. */
function addK21LidHandles(P: TankBuilderPort): void {
  const slope = 0.2266 / 0.7793, lidTop = (z: number): number => 1.8329 + slope * 2.4551 - slope * z;
  grabHandle(P, 'hull', -0.58, lidTop(2.53) - 0.004, 2.53, 0.17, 0.035, Math.atan(slope));
}

/** Rear roof stowage (source: pioneer tools in clamps either side of the troop hatch, on the roof's bevelled edges),
 *  clear of the rear-hull receipt's witness lines (x ±1.0 and ±1.4) and of the tie-down bars at x ±1.27..1.43:
 *  a sledgehammer on the left, a shovel on the right, each in two clamps; and the troop hatch's lift handle. */
function addK21RearStowage(P: TankBuilderPort): void {
  // the bevel: flat 1.954 to x 1.06, then down 0.2165 a metre to 1.861 at x 1.4885
  const bevel = Math.atan(0.0928 / 0.4287), roofAt = (x: number): number => 1.954 - Math.max(0, Math.abs(x) - 1.0598) * 0.2165;
  const lay = (owner: 'Detail' | 'Dark' | 'Wood', g: THREE.BufferGeometry, x: number, h: number, z: number): void => {
    const s = Math.sign(x);
    equipment(P, 'hull', owner, g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-s * bevel)), x, roofAt(x) + h, z);
  };
  // sledgehammer (left): handle along z, head at its rear end, 2.4 m off the ring axis (the 40 mm's -8 degree line over
  // the stern quarters is 7 cm over it there; at the roof's rear corner it would be under 3 cm)
  const hx = 1.16;
  lay('Wood', cylZ(0.016, 0.70, 8), hx, 0.012, -2.33);
  lay('Dark', box(0.075, 0.07, 0.16), hx, 0.031, -2.74);
  // shovel (right): handle with a D grip at the rear, blade forward
  const sx = -1.16;
  lay('Wood', cylZ(0.016, 0.72, 8), sx, 0.012, -2.42);
  lay('Dark', box(0.21, 0.008, 0.27), sx, 0.002, -1.93);
  lay('Dark', box(0.12, 0.02, 0.02), sx, 0.008, -2.81);
  for (const s of [-1, 1]) lay('Dark', box(0.018, 0.02, 0.07), sx + s * 0.05, 0.008, -2.78);
  // clamps: a strap over each handle on two feet
  for (const [x, z] of [[hx, -2.12], [hx, -2.52], [sx, -2.25], [sx, -2.62]]) {
    lay('Detail', box(0.07, 0.008, 0.04), x, 0.030, z);
    for (const s of [-1, 1]) lay('Detail', box(0.01, 0.04, 0.04), x + s * 0.035, 0.014, z);
  }
  // the troop hatch's lift handle on its upper lid (top 1.9813), at the centre between the witness lines x ±0.2
  grabHandle(P, 'hull', 0, 1.9813 - 0.004, -2.90, 0.16, 0.03);
}

/** Turret roof: the two crew hatches' torsion-spring housings and lid handles, a periscope in each lid's outboard
 *  edge, two periscopes ahead of the left hatch, and the source's rear-roof fittings: a mount ring on the right, a twin
 *  sensor head at the centre and two vent caps on the left. Turret builder frame (world metres before the 0.90 size). */
function addK21TurretRoofKit(P: TankBuilderPort): void {
  // 2026-11-04: the new turret's roof (k21Turret.ts): flat at 2.606, its rear bevel falling to the rear wall's 2.49
  const roofAt = k21TurretRoofAt;
  for (const [x, z, s] of K21_HATCHES) {
    const top = 2.656, rear = z - 0.31;
    // spring housing behind the two hinge barrels (x ±0.12 at y 2.645), on the roof behind the cover
    equipment(P, 'turret', 'Dark', cylX(0.024, 0.24, 10), x, roofAt(rear - 0.05) + 0.022, rear - 0.05);
    for (const d of [-0.12, 0.12]) equipment(P, 'turret', 'Detail', box(0.03, 0.05, 0.06), x + d, roofAt(rear - 0.05) + 0.018, rear - 0.045);
    grabHandle(P, 'turret', x - s * 0.08, top - 0.003, z + 0.06, 0.15, 0.03);
    // a periscope in the lid's outboard edge looking out over the roof's edge (ahead lie the sights)
    periscope(P, 'turret', x + s * 0.27, top - 0.004, z - 0.02, 0, s * Math.PI / 2, 0.05);
  }
  // the left hatch's two forward periscopes on the roof ahead of it, inboard of the panoramic sight
  for (const [px, yaw] of [[0.16, -0.20], [0.30, 0]]) periscope(P, 'turret', px, roofAt(-0.61), -0.61, 0, yaw, 0.055);
  // The rear fittings stand on the roof's bevel: the flat ones lie on its slope, the sensor head's base is level and
  // deeper at its rear edge so it neither stands off the slope nor drops below it.
  const lie = (z: number): number => -Math.atan((roofAt(z + 0.005) - roofAt(z - 0.005)) / 0.01);
  // mount ring (right rear): a low ring plate and its plug
  const mx = -0.74, mz = -1.40, my = roofAt(mz), seg = P.q ? 24 : 14;
  equipment(P, 'turret', 'Detail', cylY(0.15, 0.15, 0.016, seg), mx, my + 0.002, mz, lie(mz));
  equipment(P, 'turret', 'Detail', cylY(0.05, 0.055, 0.03, 12), mx, my + 0.012, mz, lie(mz));
  // twin sensor head (rear centre): a base block and two upright cylinders side by side
  const tz = -1.55, baseBottom = roofAt(tz - 0.07) - 0.005, ty = roofAt(tz + 0.07) + 0.02;
  equipment(P, 'turret', 'Detail', box(0.30, ty - baseBottom, 0.14), 0, (ty + baseBottom) / 2, tz);
  for (const s of [-1, 1]) {
    equipment(P, 'turret', 'Detail', cylY(0.05, 0.055, 0.11, 14), s * 0.075, ty + 0.05, tz);
    equipment(P, 'turret', 'Dark', cylY(0.042, 0.042, 0.008, 14), s * 0.075, ty + 0.106, tz);
  }
  // two low vent caps (left rear)
  for (const [vx, vz] of [[0.86, -1.42], [0.52, -1.50]]) {
    equipment(P, 'turret', 'Detail', cylY(0.065, 0.075, 0.03, 16), vx, roofAt(vz) + 0.01, vz, lie(vz));
    equipment(P, 'turret', 'Dark', cylY(0.04, 0.04, 0.006, 12), vx, roofAt(vz) + 0.026, vz, lie(vz));
  }
}

/** The hull's r268b kit (buildK21Hull). */
export function addK21HullDeckKit(P: TankBuilderPort): void {
  addK21DriverStation(P);
  addK21EngineDeck(P);
  addK21LidHandles(P);
  addK21RearStowage(P);
}

/** The turret's r268b kit (buildK21Turret). */
export function addK21TurretDeckKit(P: TankBuilderPort): void {
  addK21TurretRoofKit(P);
}
