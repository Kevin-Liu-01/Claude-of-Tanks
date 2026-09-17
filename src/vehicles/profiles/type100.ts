// Type 100 (ZTZ-100) — fourth build, 2026-09-16. Owner: "MAKE THE HULL TAKE INSPO FROM THE T90M AND THE TURRET
// TAKE INSPIRATION FROM THE T14 ARMATA AND REDESIGN FROM SCRATCH. RN YOU'RE USING THE PRIMITIVES ONLY".
// Construction follows the source-study vocabulary instead of boxes:
//  * Hull (T-90M X grammar): one bevelled-keel body loft (tub, sponson floor, upper flank, inclined band, roof)
//    carrying the two-plane front (15° upper glacis, 70° lower glacis, nose z 3.31); a fender lip and hinge
//    rail along the skirt line; seven HANGING curtain panels a side plus the slanted leading panel that ends on
//    the lower glacis, with hinge blocks, clip bolts and stiffeners; a stepped appliqué field on the upper
//    glacis; bow gear (guarded lamp clusters, tow hooks, driver's hatch with periscope blocks, bolted bow strip);
//    a louvred engine deck with hinged access covers, exhaust housing and round intake; stern grilles, shackle
//    plates, tail lamps, tow hooks, mud flap; tow cable on the band; pressed wheel faces with hubs and bolts.
//  * Turret (T-14 X grammar): a chamfered structural core loft wrapped in faceted panel slabs (two steep flank
//    facets, cheek facets, shoulder faces, hexagonal bustle face), a trapezoidal gun housing with the moving
//    trapezoid mantlet on the gun, a rimmed sight cavity right of the gun, plate-grid roof with bolts, cupola
//    with periscopes, drum-stack panoramic sight, pedestal weapon station with a forked cradle and a real pintle
//    machine gun fitting, twin quad pods on brackets, smoke banks, radar panels, corner receivers, stowage boxes
//    with bolts, whips, rails, lifting eyes, louvred bustle grille and a muzzle-reference bracket on the gun.
// The owner's RenderHub render set and CCTV photo are references only; no source model geometry participates.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT, FITTINGS, orientedSlab, convexSlab, muzzleBore } from './kit.ts';
import { sectionSolid, type SolidSection, type SectionPoint } from './sectionSolid.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

type Vec3 = readonly [number, number, number];
type XYZ = [number, number, number];
const { box, cylX, cylY, cylZ, torus } = KIT;

function tag(geometry: THREE.BufferGeometry, part: string): THREE.BufferGeometry {
  geometry.userData.type100 = part;
  return geometry;
}

function mount(P: TankBuilderPort, owner: 'hull' | 'turret', object: THREE.Object3D,
  x: number, y: number, z: number, rotation: Vec3 = [0, 0, 0]): void {
  object.position.set(x, y, z);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
}

/** Closed panel whose EXTERIOR is the plane through a,b,c,d (CCW seen from outside); extruded inward by depth. */
function facetSlab(a: XYZ, b: XYZ, c: XYZ, d: XYZ, depth: number, inwardHint: XYZ): THREE.BufferGeometry {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n: XYZ = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n = [n[0] / len, n[1] / len, n[2] / len];
  const centre: XYZ = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
  const toInside = [inwardHint[0] - centre[0], inwardHint[1] - centre[1], inwardHint[2] - centre[2]];
  if (n[0] * toInside[0] + n[1] * toInside[1] + n[2] * toInside[2] < 0) n = [-n[0], -n[1], -n[2]];
  const inner = (p: XYZ): XYZ => [p[0] + n[0] * depth, p[1] + n[1] * depth, p[2] + n[2] * depth];
  return orientedSlab(a, b, c, d, inner(a), inner(b), inner(c), inner(d));
}

/** Louvred grille: dark backing plate with `count` slats (faceNormal 'z' = vertical face, 'y' = deck). */
function louvres(P: TankBuilderPort, owner: 'hull' | 'turret', part: string, center: XYZ, width: number,
  height: number, count: number, faceNormal: 'z' | 'y', depth = 0.04): void {
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  const [x, y, z] = center;
  const pitch = (height - 0.08) / (count - 1);
  if (faceNormal === 'z') {
    P.add(dark, tag(box(width, height, depth), part), x, y, z);
    for (let i = 0; i < count; i++) P.add(dark, tag(box(width - 0.08, 0.014, depth + 0.024), `${part}-slat`), x, y - (height - 0.08) / 2 + i * pitch, z);
  } else {
    P.add(dark, tag(box(width, depth, height), part), x, y, z);
    for (let i = 0; i < count; i++) P.add(dark, tag(box(width - 0.08, depth + 0.024, 0.014), `${part}-slat`), x, y, z - (height - 0.08) / 2 + i * pitch);
  }
}

// ------------------------------------------------------------------ hull ----
const BELLY = 0.40;
const FLOOR = 1.02;      // sponson floor
const ROOF = 1.80;
const HEM = 0.62;        // skirt hem
const SIDE_X = 1.83;     // outer face of the hanging curtains (published width 3.66)
const FLANK_X = 1.78;    // hull flank behind the curtains
const SEAM_Y = 1.37;     // fender line: curtain tops, hull/skirt joint
const BAND_X = 0.22;     // the upper flank leans in by this over its top BAND_Y (T-14-like band)
const BAND_Y = ROOF - SEAM_Y;
const BAND_TILT = Math.atan(BAND_X / BAND_Y);
// IFV prow (owner: "it should look like the Puma's or CV90's or Light Tiger's or PL-01's"): a shallow trapezoidal
// upper glacis from the roof edge (±1.61 at z 2.20) to the nose line (±1.12, y 1.40, z 3.31); a narrow steep lower
// bow plate rising from the belly (z 2.85) to that nose line; the body narrows in plan toward the nose so the
// glacis side edges are the cheek facets; fender-shoulder wedges carry the glacis edges out to the skirt line; the
// skirt's leading panel runs to the nose at full height and the idler shows in the notch under the shoulder.
const GLACIS_TOP_Z = 2.20;
const NOSE_Z = 3.31;
const NOSE_Y = 1.40;
const BOW_FOOT_Z = 2.85;
const UPPER_SLOPE = (ROOF - NOSE_Y) / (NOSE_Z - GLACIS_TOP_Z);      // 0.36 (20°)
const LOWER_SLOPE = (NOSE_Y - 0.04 - BELLY) / (NOSE_Z - BOW_FOOT_Z); // 2.09 (64°)
const glacisY = (z: number): number => ROOF - (z - GLACIS_TOP_Z) * UPPER_SLOPE;
const glacisZ = (y: number): number => GLACIS_TOP_Z + (ROOF - y) / UPPER_SLOPE;
/** Lower bow plate height at a hull z between its foot and the nose. */
const bowY = (z: number): number => BELLY + (z - BOW_FOOT_Z) * LOWER_SLOPE;
const bowZ = (y: number): number => BOW_FOOT_Z + (y - BELLY) / LOWER_SLOPE;
const UPPER_TILT = Math.atan(UPPER_SLOPE);
const LOWER_TILT = Math.atan(LOWER_SLOPE);
/** Half-width of the glacis (and the narrowing body) at a hull z ahead of the roof edge. */
const prowHalf = (z: number): number => 1.78 - (z - GLACIS_TOP_Z) * ((1.78 - 1.12) / (NOSE_Z - GLACIS_TOP_Z));

interface HullStation { z: number; tub: number; floor: number; flank: number; seam: number; roof: number; cx: number; belly?: number }

/** T-90-style bevelled keel, sponson floor, upper flank, inclined band, roof — twelve points. */
function hullRing(s: HullStation): SolidSection {
  const belly = s.belly ?? BELLY;
  const bevel = Math.min(0.11, (s.floor - belly) * 0.3);
  const r: SectionPoint[] = [
    [-s.tub + 0.075, belly], [s.tub - 0.075, belly], [s.tub, belly + bevel], [s.tub, s.floor],
    [s.flank, s.floor], [s.flank, s.seam], [s.flank - s.cx, s.roof],
    [-(s.flank - s.cx), s.roof], [-s.flank, s.seam], [-s.flank, s.floor], [-s.tub, s.floor], [-s.tub, belly + bevel],
  ];
  return { z: s.z, ring: r };
}

/** A prow station: the roof follows the upper glacis, the belly the lower bow plate, the plan narrows. */
function prowStation(z: number): HullStation {
  const roof = glacisY(z);
  const belly = z > BOW_FOOT_Z ? bowY(z) : BELLY;
  const flank = prowHalf(z);
  const tub = Math.min(1.15, flank - 0.02);
  const floor = Math.max(Math.min(FLOOR, roof - 0.03), belly + 0.012);
  const seam = Math.max(Math.min(SEAM_Y, roof - 0.014), floor + 0.006);
  const cx = Math.min(BAND_X * ((flank - 1.12) / (FLANK_X - 1.12)) + 0.01, (roof - seam) * 0.4);
  return { z, tub, floor, flank, seam, roof, cx, belly };
}

const HULL_STATIONS: readonly HullStation[] = [
  { z: -3.75, tub: 1.15, floor: FLOOR, flank: 1.46, seam: SEAM_Y, roof: ROOF, cx: BAND_X },     // stern plate, chamfered plan corners
  { z: -3.42, tub: 1.15, floor: FLOOR, flank: FLANK_X, seam: SEAM_Y, roof: ROOF, cx: BAND_X },
  { z: GLACIS_TOP_Z, tub: 1.15, floor: FLOOR, flank: FLANK_X, seam: SEAM_Y, roof: ROOF, cx: BAND_X },
  prowStation(2.55),
  prowStation(BOW_FOOT_Z),
  prowStation(3.10),
  prowStation(NOSE_Z - 0.01),
];

function buildType100Hull(P: TankBuilderPort): void {
  P.add('hull', tag(sectionSolid(HULL_STATIONS.map(hullRing)), 'hull-body'));
  const bandX = (y: number): number => FLANK_X - BAND_X * ((y - SEAM_Y) / BAND_Y);
  for (const s of [-1, 1]) {
    // fender lip and curtain hinge rail along the skirt line (T-90M fender strip grammar)
    P.add('hull', tag(box(SIDE_X + 0.04 - FLANK_X + 0.02, 0.03, 6.30), 'fender-lip'), s * ((FLANK_X + SIDE_X + 0.04) / 2 - 0.01), SEAM_Y + 0.015, -0.27);
    P.add('hullDark', tag(box(0.05, 0.05, 6.24), 'hinge-rail'), s * (SIDE_X - 0.005), SEAM_Y - 0.035, -0.27);
    // band furniture: recessed service panels, lifting handle, tow cable on the right
    for (const z of [-2.10, -0.20, 1.20]) P.add('hullDark', tag(box(0.006, 0.20, 0.44), 'flank-panel'), s * (bandX(1.58) + 0.004), 1.58, z, 0, 0, s * BAND_TILT);
    P.add('hullDark', tag(cylZ(0.014, 0.42, 10), 'flank-handle'), s * (bandX(1.60) + 0.05), 1.62, -3.05);
    for (const z of [-3.24, -2.86]) P.add('hullDark', tag(box(0.06, 0.024, 0.024), 'flank-handle-post'), s * (bandX(1.60) + 0.026), 1.61, z, 0, 0, s * BAND_TILT);
    KIT.liftEye(P, 'hullDetail', s * 1.36, ROOF + 0.03, -3.30);
    KIT.liftEye(P, 'hullDetail', s * 1.36, ROOF + 0.03, 1.45);
    // stern: tail-lamp clusters, shackle plates with bolts, tow eyes
    P.add('hullDark', tag(box(0.22, 0.12, 0.06), 'tail-lamp'), s * 1.24, 1.66, -3.78);
    for (const [k, dx] of [-0.07, 0, 0.07].entries()) {
      P.addModuleVisual('optics', 'hullGlass', tag(box(0.05, 0.07, 0.012), `tail-lamp-glass-${k}`), s * 1.24 + dx, 1.66, -3.815);
    }
    P.add('hull', tag(box(0.42, 0.38, 0.05), 'shackle-plate'), s * 0.72, 0.84, -3.78);
    for (const dx of [-0.13, 0.13]) P.add('hullDark', tag(cylZ(0.016, 0.04, 8), 'shackle-bolt'), s * 0.72 + dx, 1.00, -3.81);
    P.add('hullDark', tag(torus(0.075, 0.02, 14), 'tow-eye'), s * 0.72, 0.72, -3.84, Math.PI / 2, 0, 0);
  }
  KIT.towCable(P, [[1.52, 1.66, 1.10], [1.60, 1.60, 0.20], [1.62, 1.58, -1.00], [1.60, 1.60, -2.10], [1.50, 1.66, -2.90]], 0.02);
  // fender shoulders (Puma / CV90 grammar): one wedge a side whose inner rail follows the glacis edge down to the
  // nose, whose outer rail keys into the skirt line, and whose front face stands over the exposed idler
  for (const s of [-1, 1]) {
    const zr = 2.28;
    P.addExternalArmor('hull', tag(convexSlab(
      [s * (prowHalf(zr) - 0.16), SEAM_Y - 0.02, zr], [s * SIDE_X, SEAM_Y - 0.02, zr], [s * SIDE_X, SEAM_Y - 0.02, NOSE_Z], [s * (prowHalf(NOSE_Z) - 0.02), SEAM_Y - 0.02, NOSE_Z],
      [s * (prowHalf(zr) - 0.16), glacisY(zr) - 0.02, zr], [s * SIDE_X, SEAM_Y + 0.14, zr], [s * SIDE_X, NOSE_Y + 0.02, NOSE_Z], [s * (prowHalf(NOSE_Z) - 0.02), NOSE_Y + 0.02, NOSE_Z],
    ), 'fender-shoulder'));
    P.add('hullDark', tag(box(0.10, 0.03, 0.03), 'shoulder-step'), s * 1.62, SEAM_Y + 0.16, zr + 0.06);
  }
  for (const s of [-1, 1]) louvres(P, 'hull', 'stern-grille', [s * 0.82, 1.40, -3.78], 0.66, 0.54, 6, 'z');
  louvres(P, 'hull', 'stern-grille', [0, 1.40, -3.78], 0.66, 0.54, 6, 'z');
  P.add('hullRubber', tag(box(2.28, 0.22, 0.03), 'mud-flap'), 0, 0.50, -3.79);
  buildType100Curtains(P);
  buildType100Glacis(P);
  buildType100Deck(P);
}

/** Hanging skirt curtains (T-90M curtain grammar): flat panels below the fender line with mounting furniture. */
function buildType100Curtains(P: TankBuilderPort): void {
  const panelZs = [-3.40, -2.54, -1.68, -0.82, 0.04, 0.90, 1.76, 2.62];
  const xIn = SIDE_X - 0.04;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panelZs.length - 1; i++) {
      const z0 = panelZs[i] + 0.012, z1 = panelZs[i + 1] - 0.012, zc = (z0 + z1) / 2;
      P.addExternalArmor('hull', tag(box(0.04, SEAM_Y - HEM - 0.02, z1 - z0), 'curtain-panel'), s * (xIn + 0.02), (SEAM_Y + HEM) / 2 - 0.01, zc);
      // hinge blocks at the rail, clip bolts at the hem, a stiffener rib and two face bolts
      for (const dz of [-0.28, 0.28]) {
        P.add('hullDark', tag(box(0.06, 0.08, 0.07), 'curtain-hinge'), s * (SIDE_X + 0.012), SEAM_Y - 0.06, zc + dz);
        P.add('hullDetail', tag(cylX(0.014, 0.024, 8), 'curtain-bolt'), s * (SIDE_X + 0.008), HEM + 0.07, zc + dz);
        P.add('hullDetail', tag(cylX(0.012, 0.02, 8), 'curtain-bolt'), s * (SIDE_X + 0.006), 1.05, zc + dz * 1.4);
      }
      P.add('hullDetail', tag(box(0.012, 0.03, z1 - z0 - 0.10), 'curtain-rib'), s * (SIDE_X + 0.006), 0.84, zc);
    }
    // leading panel: its front edge follows the lower glacis plane, so flank and glacis meet on one line
    const zr = panelZs[panelZs.length - 1] + 0.012;
    P.addExternalArmor('hull', tag(box(0.04, SEAM_Y - HEM - 0.02, NOSE_Z - 0.03 - zr), 'curtain-lead'), s * (xIn + 0.02), (SEAM_Y + HEM) / 2 - 0.01, (zr + NOSE_Z - 0.03) / 2);
    for (const dz of [-0.24, 0.24]) P.add('hullDetail', tag(cylX(0.014, 0.024, 8), 'curtain-bolt'), s * (SIDE_X + 0.008), HEM + 0.07, (zr + NOSE_Z - 0.03) / 2 + dz);
    P.add('hullDark', tag(box(0.06, 0.08, 0.07), 'curtain-hinge'), s * (SIDE_X + 0.012), SEAM_Y - 0.06, zr + 0.14);
    P.add('hullRubber', tag(box(0.03, 0.10, 6.40), 'hem-strip'), s * (SIDE_X - 0.03), HEM - 0.04, -0.20);
  }
}

/** Glacis field and bow gear (T-90M bow grammar): appliqué courses, driver's hatch, guarded lamps, bolted strip. */
function buildType100Glacis(P: TankBuilderPort): void {
  // stepped appliqué courses across the upper glacis, seated through the plate
  const course = (z0: number, z1: number, x0: number, x1: number, depth: number, part: string): void => {
    P.addExternalArmor('hull', tag(sectionSolid([
      { z: z0, ring: [[x0, glacisY(z0) - depth], [x1, glacisY(z0) - depth], [x1, glacisY(z0) + 0.03], [x0, glacisY(z0) + 0.03]] },
      { z: z1, ring: [[x0, glacisY(z1) - depth], [x1, glacisY(z1) - depth], [x1, glacisY(z1) + 0.03], [x0, glacisY(z1) + 0.03]] },
    ]), part));
    for (const x of [x0 + 0.05, x1 - 0.05]) P.add('hullDetail', tag(cylY(0.012, 0.014, 0.02, 6), 'glacis-course-bolt'), x, glacisY(z0 + 0.06) + 0.04, z0 + 0.06, UPPER_TILT, 0, 0);
  };
  for (let i = 0; i < 5; i++) {
    const x0 = -1.30 + i * 0.52 + 0.01, x1 = x0 + 0.52 - 0.02;
    if (i === 1 || i === 3) continue; // hatch stations stay clear
    course(2.28, 2.58, x0, x1, 0.05, 'glacis-course');
  }
  for (let i = 0; i < 4; i++) {
    const x0 = -1.06 + i * 0.53 + 0.01, x1 = x0 + 0.53 - 0.02;
    course(2.64, 3.00, x0, x1, 0.05, 'glacis-course');
  }
  for (const [s, scopes] of [[-1, [-0.84, -0.62, -0.40]], [1, [0.46, 0.68]]] as const) {
    // crew hatches on the upper glacis with hinge and periscope blocks
    const hz = 2.44, hy = glacisY(hz) + 0.03;
    P.addCupola('hull', tag(box(0.50, 0.04, 0.30), 'hull-hatch'), s * 0.78, hy, hz, UPPER_TILT, 0, 0);
    P.add('hullDark', tag(box(0.50, 0.016, 0.04), 'hull-hatch-hinge'), s * 0.78, glacisY(hz - 0.16) + 0.055, hz - 0.16, UPPER_TILT, 0, 0);
    P.add('hullDark', tag(box(0.12, 0.024, 0.03), 'hull-hatch-handle'), s * 0.78, glacisY(hz + 0.13) + 0.06, hz + 0.13, UPPER_TILT, 0, 0);
    for (const x of scopes) {
      P.add('hullDark', tag(box(0.15, 0.05, 0.09), 'periscope-block'), x, ROOF + 0.025, 2.08);
      P.addModuleVisual('optics', 'hullGlass', tag(box(0.115, 0.026, 0.008), 'periscope-glass'), x, ROOF + 0.03, 2.13);
    }
    // grab rails on the glacis corners, guarded lamp clusters and tow hooks on the lower glacis
    P.add('hullDark', tag(cylZ(0.015, 0.40, 10), 'glacis-rail'), s * 1.34, glacisY(2.50) + 0.12, 2.50, UPPER_TILT, 0, 0);
    for (const dz of [-0.18, 0.18]) P.add('hullDark', tag(box(0.024, 0.13, 0.024), 'glacis-rail-post'), s * 1.34, glacisY(2.50 + dz) + 0.06, 2.50 + dz, UPPER_TILT, 0, 0);
    const lz = 3.08, ly = glacisY(lz), lx = prowHalf(lz) - 0.22;
    P.add('hullDark', tag(cylZ(0.075, 0.10, 14), 'lamp'), s * lx, ly + 0.06, lz, UPPER_TILT, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', tag(markVehicleNightLens(cylZ(0.056, 0.014, 16), 'headlight'), 'lamp-lens'), s * lx, ly + 0.08, lz + 0.055, UPPER_TILT, 0, 0);
    P.add('hullDetail', tag(box(0.24, 0.026, 0.22), 'lamp-guard'), s * lx, ly + 0.16, lz + 0.02, UPPER_TILT - 0.10, 0, 0);
    for (const dx of [-0.10, 0.10]) P.add('hullDetail', tag(cylY(0.012, 0.012, 0.14, 8), 'lamp-guard-post'), s * lx + dx, ly + 0.10, lz + 0.08, UPPER_TILT, 0, 0);
    P.add('hullDark', tag(torus(0.06, 0.02, 12), 'tow-eye'), s * 0.78, 0.86, bowZ(0.86) + 0.05, Math.PI / 2 - LOWER_TILT, 0, 0);
    P.add('hullDark', tag(box(0.08, 0.09, 0.10), 'tow-eye-block'), s * 0.78, 0.86, bowZ(0.86) - 0.01, LOWER_TILT, 0, 0);
    P.add('hullDark', tag(box(0.18, 0.08, 0.06), 'bow-sensor'), s * 0.40, bowY(3.14) + 0.03, 3.14, LOWER_TILT, 0, 0);
  }
  // bolted bow strip along the foot of the lower glacis
  P.add('hullDark', tag(box(1.96, 0.05, 0.05), 'bow-strip'), 0, 0.64, bowZ(0.64) + 0.03, LOWER_TILT, 0, 0);
  for (let i = 0; i < 8; i++) P.add('hullDetail', tag(cylZ(0.018, 0.012, 8), 'bow-strip-bolt'), -0.84 + i * 0.24, 0.64, bowZ(0.64) + 0.06, LOWER_TILT, 0, 0);
  // round vent and its concentric rings on the roof edge, service box on the glacis
  P.add('hullDark', tag(cylY(0.17, 0.17, 0.03, 24), 'glacis-vent'), 1.16, ROOF + 0.015, 1.95);
  for (const r of [0.06, 0.11, 0.15]) P.add('hullDark', tag(torus(r, 0.005, 20), 'glacis-vent-ring'), 1.16, ROOF + 0.03, 1.95, Math.PI / 2, 0, 0);
  P.add('hull', tag(box(0.30, 0.06, 0.26), 'glacis-box'), 1.30, glacisY(2.46) + 0.03, 2.46, UPPER_TILT, 0, 0);
}

/** Engine deck (T-90M deck grammar): grille frame with louvres, hinged access covers, exhaust housing, intake. */
function buildType100Deck(P: TankBuilderPort): void {
  for (const x of [-0.78, 0.78]) P.add('hullDark', tag(box(0.02, 0.006, 4.90), 'roof-seam'), x, ROOF + 0.003, -0.95);
  for (const z of [1.30, -2.45]) P.add('hullDark', tag(box(3.20, 0.006, 0.02), 'roof-seam'), 0, ROOF + 0.003, z);
  // grille frame and louvres
  P.add('hullDark', tag(box(1.70, 0.03, 1.00), 'deck-grille'), -0.42, ROOF + 0.015, -3.08);
  P.add('hullDetail', tag(box(1.74, 0.02, 0.06), 'deck-grille-frame'), -0.42, ROOF + 0.04, -2.58);
  P.add('hullDetail', tag(box(1.74, 0.02, 0.06), 'deck-grille-frame'), -0.42, ROOF + 0.04, -3.58);
  for (const x of [-1.29, 0.45]) P.add('hullDetail', tag(box(0.06, 0.02, 1.06), 'deck-grille-frame'), x, ROOF + 0.04, -3.08);
  for (let i = 0; i < 9; i++) P.add('hullDark', tag(box(1.56, 0.03, 0.014), 'deck-grille-slat'), -0.42, ROOF + 0.045, -2.64 - i * 0.11);
  // hinged access covers with handles
  for (const [x, z, w, l] of [[1.15, -3.36, 0.70, 0.52], [1.15, -2.70, 0.70, 0.60]] as const) {
    P.add('hull', tag(box(w, 0.045, l), 'deck-cover'), x, ROOF + 0.0225, z);
    P.add('hullDark', tag(cylX(0.016, w - 0.06, 10), 'deck-cover-hinge'), x, ROOF + 0.05, z + l / 2 - 0.02);
    P.add('hullDark', tag(box(0.10, 0.02, 0.03), 'deck-cover-handle'), x, ROOF + 0.055, z - l / 2 + 0.08);
  }
  // exhaust housing on the left rear with a louvred outboard face, round intake on the right
  P.add('hull', tag(box(0.42, 0.16, 0.70), 'exhaust-housing'), -1.30, ROOF + 0.08, -2.05);
  for (let i = 0; i < 5; i++) P.add('hullDark', tag(box(0.012, 0.10, 0.06), 'exhaust-louvre'), -1.516, ROOF + 0.08, -2.30 + i * 0.125);
  P.add('hullDark', tag(cylY(0.30, 0.30, 0.045, 28), 'intake'), 1.10, ROOF + 0.022, -1.75);
  P.add('hullDark', tag(torus(0.31, 0.014, 28), 'intake-rim'), 1.10, ROOF + 0.046, -1.75, Math.PI / 2, 0, 0);
  for (const r of [0.09, 0.17, 0.25]) P.add('hullDark', tag(torus(r, 0.006, 24), 'intake-ring'), 1.10, ROOF + 0.048, -1.75, Math.PI / 2, 0, 0);
}

function buildType100RunningGear(P: TankBuilderPort): void {
  const wheelR = 0.36, halfWidth = 0.125;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.74, wheelR, wheelW: halfWidth * 2, wheelY: 0.42, xc: 1.40,
    wheelZs: [2.32, 1.40, 0.48, -0.44, -1.36, -2.28],
    sprocket: { z: -3.02, y: 0.86, r: 0.34 }, idler: { z: 2.85, y: 0.70, r: 0.28 },
    rollerR: 0.085, rollers: [{ z: 1.44, y: 1.05 }, { z: 0.02, y: 1.06 }, { z: -1.40, y: 1.05 }],
    trackW: 0.58, trackTh: 0.09, topY: 1.20, botY: 0.06,
    wheelPattern: 'flanged-twelve', trackPattern: 'compact-ifv', linkPitchM: 0.150, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.50, contactZR: -2.48,
  });
  // pressed wheel faces: hub, rim ring and six bolt heads (T-90M wheel-face grammar)
  const rim = torus(wheelR * 0.80, 0.012, 32, 8).rotateZ(Math.PI / 2);
  const bolts = KIT.mergeAll(Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3;
    return cylX(0.012, 0.024, 6).translate(0, Math.sin(a) * wheelR * 0.30, Math.cos(a) * wheelR * 0.30);
  }));
  P.gear?.addRoadWheelLayer(rim, P.mats.wheels, { outset: halfWidth + 0.008, name: 'type100RoadWheelRims', appearanceRole: 'wheelDish' });
  P.gear?.addRoadWheelLayer(cylX(wheelR * 0.24, 0.03, 20), P.mats.wheels, { outset: halfWidth + 0.004, name: 'type100RoadWheelHubs', appearanceRole: 'wheelDish' });
  P.gear?.addRoadWheelLayer(bolts, P.mats.dark, { outset: halfWidth + 0.006, name: 'type100RoadWheelBolts', appearanceRole: 'wheelInset' });
}

// ---------------------------------------------------------------- turret ----
// T-14 X grammar: chamfered structural core loft wrapped in faceted panel slabs.
const ROOF_Y = 0.68;
const GUN_LEN = 5.60;
const GUN_Y = 0.34;
const APEX_Z = 2.35;     // wedge apex (hull z 1.40; turret pivot at hull z -0.95)
const FLANK_Z0 = 0.95;   // cheeks start
const MAIN_HALF = 1.32;  // flank foot half-width
const BUSTLE_HALF = 1.02;
const LEAN_LOW = 0.16;   // lower facet lean over y 0.02..0.40
const LEAN_UP = 0.26;    // upper facet lean over y 0.42..0.68

function coreRing(z: number, half: number, roof: number): SolidSection {
  return { z, ring: [[-half + 0.09, 0.0], [half - 0.09, 0.0], [half, 0.12], [half, roof - 0.09],
    [half - 0.12, roof], [-half + 0.12, roof], [-half, roof - 0.09], [-half, 0.12]] };
}

/** Foot half-width of the outer skin at a turret z (bustle, shoulder step, flank, cheek wedge). */
function skinHalf(z: number): number {
  if (z <= -2.12) return BUSTLE_HALF;
  if (z <= FLANK_Z0) return MAIN_HALF;
  return MAIN_HALF - (z - FLANK_Z0) * ((MAIN_HALF - 0.46) / (APEX_Z - FLANK_Z0));
}

/** Two steep facets (lower, upper) between z0 and z1 on one side, split into `parts` panels. */
function flankFacets(P: TankBuilderPort, s: number, z0: number, z1: number, parts: number, part: string): void {
  const inward: XYZ = [0, 0.30, (z0 + z1) / 2];
  for (let i = 0; i < parts; i++) {
    const za = z0 + (i * (z1 - z0)) / parts + 0.012, zb = z0 + ((i + 1) * (z1 - z0)) / parts - 0.012;
    const foot = (z: number): number => s * skinHalf(z);
    const low = (z: number): number => s * (skinHalf(z) - LEAN_LOW);
    const up = (z: number): number => s * (skinHalf(z) - LEAN_LOW - LEAN_UP);
    P.add('turret', tag(facetSlab([foot(za), 0.02, za], [foot(zb), 0.02, zb], [low(zb), 0.40, zb], [low(za), 0.40, za], 0.07, inward), `${part}-low`));
    P.add('turret', tag(facetSlab([low(za), 0.42, za], [low(zb), 0.42, zb], [up(zb), ROOF_Y, zb], [up(za), ROOF_Y, za], 0.07, inward), `${part}-up`));
  }
}

function weaponStation(P: TankBuilderPort, z: number): void {
  P.add('turretDark', tag(cylY(0.38, 0.40, 0.05, 24), 'rws-ring'), 0, ROOF_Y + 0.025, z);
  P.add('turret', tag(box(0.58, 0.16, 0.58), 'rws-base'), 0, ROOF_Y + 0.13, z);
  P.add('turretDark', tag(cylY(0.20, 0.22, 0.56, 8), 'rws-column'), 0, ROOF_Y + 0.49, z);
  for (const a of [0.4, 2.0, 3.6, 5.2]) P.add('turretDark', tag(box(0.024, 0.50, 0.024), 'rws-frame'), Math.sin(a) * 0.26, ROOF_Y + 0.49, z + Math.cos(a) * 0.26);
  P.add('turretDark', tag(cylY(0.30, 0.30, 0.04, 20), 'rws-bearing'), 0, ROOF_Y + 0.79, z);
  // forked cradle (T-14 cradle grammar): receiver floor, two fork walls, trunnion bolts
  const by = ROOF_Y + 0.81;
  const section = (x0: number, x1: number, low: number, high: number, back0: number, front0: number, back1: number, front1: number, part: string): void => {
    P.addEquipment('turret', tag(orientedSlab(
      [x0, low, back0], [x1, low, back0], [x1, low, front0], [x0, low, front0],
      [x0, high, back1], [x1, high, back1], [x1, high, front1], [x0, high, front1]), part), 0, by, z);
  };
  section(-0.26, 0.26, 0.00, 0.22, -0.44, 0.30, -0.48, 0.24, 'rws-cradle');
  for (const x of [-0.26, 0.20]) {
    section(x, x + 0.06, 0.22, 0.42, -0.48, 0.24, -0.44, 0.12, 'rws-fork');
    P.add('turretDark', tag(cylX(0.025, 0.02, 12), 'rws-fork-bolt'), x + 0.03 + (x < 0 ? -0.012 : 0.072), by + 0.36, z - 0.16);
  }
  const weapon = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 1.35, tone: 'two-tone', elev: 0, ammo: true, shield: false, ring: false, barrelBridge: true, seed: 100260 });
  weapon.name = 'type100RemoteMachineGun';
  weapon.position.set(0.0, by + 0.30, z + 0.02);
  P.turretG.add(weapon);
  // thermal sight box with dome left of the fork, junction box right
  P.addEquipment('turret', tag(box(0.24, 0.26, 0.24), 'rws-sensor'), -0.40, by + 0.20, z + 0.10);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.14, 0.14, 0.012), 'rws-sensor-glass'), -0.40, by + 0.22, z + 0.226);
  P.add('turretDark', tag(cylY(0.08, 0.10, 0.07, 16), 'rws-sight-dome'), -0.40, by + 0.365, z + 0.10);
  P.add('turretDark', tag(box(0.10, 0.12, 0.16), 'rws-junction'), 0.36, by + 0.10, z - 0.30);
}

function buildType100Turret(P: TankBuilderPort): void {
  P.add('turretDark', tag(cylY(1.30, 1.36, 0.08, 32), 'ring'), 0, -0.04, 0);
  // structural core: narrower than the skin so the facet panels wrap it
  P.add('turret', tag(sectionSolid([
    coreRing(-2.76, 0.78, ROOF_Y - 0.02), coreRing(-2.16, 0.78, ROOF_Y - 0.02), coreRing(-2.10, 1.04, ROOF_Y),
    coreRing(FLANK_Z0, 1.04, ROOF_Y), coreRing(1.95, 0.42, ROOF_Y - 0.04),
  ]), 'citadel'));
  for (const s of [-1, 1]) {
    flankFacets(P, s, -2.74, -2.16, 1, 'bustle-facet');
    flankFacets(P, s, -2.08, FLANK_Z0, 3, 'flank-facet');
    flankFacets(P, s, FLANK_Z0 + 0.02, APEX_Z - 0.05, 2, 'cheek-facet');
    // shoulder faces closing the step between bustle and main body
    const inward: XYZ = [0, 0.30, -1.90];
    P.add('turret', tag(facetSlab([s * BUSTLE_HALF, 0.02, -2.12], [s * MAIN_HALF, 0.02, -2.12], [s * (MAIN_HALF - LEAN_LOW), 0.40, -2.12], [s * (BUSTLE_HALF - LEAN_LOW), 0.40, -2.12], 0.06, inward), 'shoulder-face-low'));
    P.add('turret', tag(facetSlab([s * (BUSTLE_HALF - LEAN_LOW), 0.42, -2.12], [s * (MAIN_HALF - LEAN_LOW), 0.42, -2.12], [s * (MAIN_HALF - LEAN_LOW - LEAN_UP), ROOF_Y, -2.12], [s * (BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y, -2.12], 0.06, inward), 'shoulder-face-up'));
  }
  // hexagonal bustle face with the louvred grille, roof plate over the core
  P.add('turret', tag(sectionSolid([
    { z: -2.80, ring: [[-BUSTLE_HALF, 0.02], [BUSTLE_HALF, 0.02], [BUSTLE_HALF - LEAN_LOW, 0.40], [BUSTLE_HALF - LEAN_LOW - LEAN_UP, ROOF_Y], [-(BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y], [-(BUSTLE_HALF - LEAN_LOW), 0.40]] },
    { z: -2.74, ring: [[-BUSTLE_HALF, 0.02], [BUSTLE_HALF, 0.02], [BUSTLE_HALF - LEAN_LOW, 0.40], [BUSTLE_HALF - LEAN_LOW - LEAN_UP, ROOF_Y], [-(BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y], [-(BUSTLE_HALF - LEAN_LOW), 0.40]] },
  ]), 'bustle-face'));
  louvres(P, 'turret', 'turret-grille', [0, 0.30, -2.81], 1.56, 0.40, 7, 'z');
  P.add('turret', tag(sectionSolid([
    { z: -2.74, ring: [[-(BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y - 0.03], [BUSTLE_HALF - LEAN_LOW - LEAN_UP, ROOF_Y - 0.03], [BUSTLE_HALF - LEAN_LOW - LEAN_UP, ROOF_Y + 0.01], [-(BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y + 0.01]] },
    { z: -2.12, ring: [[-(BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y - 0.03], [BUSTLE_HALF - LEAN_LOW - LEAN_UP, ROOF_Y - 0.03], [BUSTLE_HALF - LEAN_LOW - LEAN_UP, ROOF_Y + 0.01], [-(BUSTLE_HALF - LEAN_LOW - LEAN_UP), ROOF_Y + 0.01]] },
    { z: -2.08, ring: [[-(MAIN_HALF - LEAN_LOW - LEAN_UP), ROOF_Y - 0.03], [MAIN_HALF - LEAN_LOW - LEAN_UP, ROOF_Y - 0.03], [MAIN_HALF - LEAN_LOW - LEAN_UP, ROOF_Y + 0.01], [-(MAIN_HALF - LEAN_LOW - LEAN_UP), ROOF_Y - 0.03 + 0.04]] },
    { z: FLANK_Z0, ring: [[-(MAIN_HALF - LEAN_LOW - LEAN_UP), ROOF_Y - 0.03], [MAIN_HALF - LEAN_LOW - LEAN_UP, ROOF_Y - 0.03], [MAIN_HALF - LEAN_LOW - LEAN_UP, ROOF_Y + 0.01], [-(MAIN_HALF - LEAN_LOW - LEAN_UP), ROOF_Y + 0.01]] },
    { z: APEX_Z - 0.05, ring: [[-(0.46 - LEAN_LOW - LEAN_UP + 0.30), ROOF_Y - 0.03], [0.46 - LEAN_LOW - LEAN_UP + 0.30, ROOF_Y - 0.03], [0.46 - LEAN_LOW - LEAN_UP + 0.30, ROOF_Y + 0.01], [-(0.46 - LEAN_LOW - LEAN_UP + 0.30), ROOF_Y + 0.01]] },
  ]), 'roof-plate'));
  // trapezoidal gun housing (fixed) and the moving trapezoid mantlet on the gun with its collar
  P.add('turret', tag(orientedSlab(
    [-0.50, 0.06, 1.90], [0.50, 0.06, 1.90], [0.48, 0.06, 2.34], [-0.48, 0.06, 2.34],
    [-0.32, 0.64, 1.90], [0.32, 0.64, 1.90], [0.30, 0.62, 2.34], [-0.30, 0.62, 2.34],
  ), 'mantlet-housing'));
  P.add('turretDark', tag(box(0.34, 0.08, 0.16), 'mantlet-brow'), 0, 0.60, 2.30);
  const mantletRing: SectionPoint[] = [[-0.42, -0.24], [0.42, -0.24], [0.30, 0.26], [-0.30, 0.26]];
  P.addGunExtra(tag(sectionSolid([{ z: -0.30, ring: mantletRing }, { z: 0.96, ring: mantletRing.map(([x, y]) => [x * 0.92, y * 0.92] as SectionPoint) }]), 'mantlet'), 0, 0, 0);
  P.addGunExtraDark(tag(cylZ(0.150, 0.16, 24), 'trunnion-collar'), 0, 0, 1.04);
  KIT.buildGun(P, { len: GUN_LEN, r: 0.078, sleeve: true, evac: 0.55, evacR: 1.55, collar: true, baseR: 0.150 });
  muzzleBore(P, { len: GUN_LEN, r: 0.078, seg: 20 });
  P.muzzleZ = GUN_LEN;
  // muzzle-reference bracket and guide (T-14 cannon grammar)
  P.addGunExtraDark(tag(cylZ(0.098, 0.026, 24), 'mrs-collar'), 0, 0, GUN_LEN - 0.34);
  P.addGunExtra(tag(box(0.075, 0.07, 0.04), 'mrs-bracket'), 0, 0.11, GUN_LEN - 0.20);
  P.addGunExtraDark(tag(cylZ(0.01, 0.50, 10), 'mrs-guide'), 0, 0.10, GUN_LEN - 0.62);
  // gunner's sight cavity right of the housing: boxed head, rim frame, recessed glass, round cover
  P.addEquipment('turret', tag(box(0.42, 0.30, 0.44), 'gunner-sight'), 0.66, 0.40, 1.94);
  for (const dy of [-0.13, 0.13]) P.add('turretDark', tag(box(0.30, 0.008, 0.06), 'gunner-sight-rim'), 0.66, 0.40 + dy, 2.14);
  P.add('turretDark', tag(box(0.28, 0.24, 0.03), 'gunner-sight-frame'), 0.66, 0.40, 2.155);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.22, 0.18, 0.012), 'gunner-sight-glass'), 0.66, 0.40, 2.172);
  P.add('turretDetail', tag(cylZ(0.05, 0.02, 20), 'gunner-sight-cover'), 0.90, 0.40, 2.14);
  P.add('turretDark', tag(box(0.44, 0.05, 0.14), 'gunner-sight-hood'), 0.66, 0.575, 2.12);
  for (const s of [-1, 1]) {
    const lowTilt = Math.atan(LEAN_LOW / 0.38), upTilt = Math.atan(LEAN_UP / 0.26);
    // cheek sensor on the lower cheek facet, corner receivers with windows (T-14 corner sensor grammar)
    P.addEquipment('turret', tag(box(0.30, 0.22, 0.26), 'cheek-sensor'), s * (skinHalf(1.50) - 0.08), 0.26, 1.50, 0, s * 0.56, s * lowTilt);
    P.addModuleVisual('optics', 'turretGlass', tag(box(0.16, 0.10, 0.012).rotateY(s * 0.56), 'cheek-sensor-glass'), s * (skinHalf(1.50) - 0.08 + 0.10), 0.28, 1.50 + 0.11);
    for (const z of [0.72, -1.95]) {
      P.addEquipment('turret', tag(box(0.12, 0.12, 0.10), 'das'), s * 0.80, ROOF_Y + 0.06, z, 0, s * 0.38, 0);
      P.addModuleVisual('optics', 'turretGlass', tag(box(0.05, 0.05, 0.01).rotateY(s * 0.38), 'das-glass'), s * 0.80 + s * 0.02, ROOF_Y + 0.06, z + 0.05);
    }
    // active-protection radar panels on the upper facets, side plate and lamps on the lower facet
    for (const z of [0.45, -1.55]) {
      const x = skinHalf(z) - LEAN_LOW - LEAN_UP / 2 + 0.02;
      P.addEquipment('turret', tag(box(0.04, 0.30, 0.28), 'radar-panel'), s * x, 0.55, z, 0, 0, s * upTilt);
      P.add('turretDark', tag(box(0.012, 0.24, 0.22), 'radar-face'), s * (x + 0.026), 0.55, z, 0, 0, s * upTilt);
    }
    P.add('turretDark', tag(box(0.012, 0.20, 0.32), 'side-plate'), s * (MAIN_HALF - LEAN_LOW / 2 + 0.004), 0.21, 0.10, 0, 0, s * lowTilt);
    for (const dz of [-0.09, 0.09]) P.addModuleVisual('optics', 'turretGlass', tag(cylX(0.025, 0.012, 12), 'side-lamp'), s * (MAIN_HALF - LEAN_LOW * 0.55 + 0.006), 0.19, -0.45 + dz, 0, 0, s * lowTilt);
    // stowage box with bolts on the bustle lower facet, grab handles, roof rails, lifting eyes
    P.addEquipment('turret', tag(box(0.14, 0.32, 0.46), 'stowage-box'), s * (BUSTLE_HALF - LEAN_LOW / 2 + 0.05), 0.24, -2.45, 0, 0, s * lowTilt);
    for (const dy of [-0.11, 0.11]) P.add('turretDark', tag(cylX(0.012, 0.018, 8), 'stowage-bolt'), s * (BUSTLE_HALF - LEAN_LOW / 2 + 0.12), 0.24 + dy, -2.45, 0, 0, s * lowTilt);
    P.add('turretDark', tag(cylZ(0.012, 0.30, 8), 'grab-handle'), s * 0.56, ROOF_Y + 0.08, -1.45);
    P.add('turretDark', tag(cylZ(0.012, 1.30, 8), 'roof-rail'), s * 0.80, ROOF_Y + 0.10, -0.75);
    for (const z of [-1.36, -0.75, -0.14]) P.add('turretDark', tag(box(0.024, 0.10, 0.024), 'roof-rail-post'), s * 0.80, ROOF_Y + 0.05, z);
    KIT.liftEye(P, 'turretDetail', s * 0.70, ROOF_Y + 0.02, 0.30);
    KIT.liftEye(P, 'turretDetail', s * 0.56, ROOF_Y + 0.02, -2.10);
    // smoke discharger bank on the front roof corner
    P.add('turretDark', tag(box(0.08, 0.06, 0.44), 'smoke-base'), s * 0.60, ROOF_Y + 0.03, 1.15, 0, s * 0.55, 0);
    for (let i = 0; i < 4; i++) {
      const dz = -0.15 + i * 0.10;
      P.add('turretDark', tag(cylZ(0.036, 0.30, 12).rotateX(-0.55).translate(0, 0.12, dz), 'smoke-tube'), s * 0.60, ROOF_Y + 0.05, 1.15, 0, s * 0.55, 0);
      P.add('turretDark', tag(cylZ(0.040, 0.012, 12).rotateX(-0.55).translate(0, 0.198, dz + 0.125), 'smoke-cap'), s * 0.60, ROOF_Y + 0.05, 1.15, 0, s * 0.55, 0);
    }
    // twin quad pods on brackets at the rear roof corners, pitched up and splayed outward
    const podX = s * 0.72, podY = ROOF_Y + 0.28, podZ = -1.80, pitch = -0.42, yaw = s * 0.34;
    P.addEquipment('turret', tag(box(0.12, 0.28, 0.32), 'pod-bracket'), podX, ROOF_Y + 0.12, podZ);
    P.addEquipment('turret', tag(box(0.36, 0.36, 0.46), 'pod-frame'), podX, podY, podZ, pitch, yaw, 0);
    for (const dy of [-0.10, 0.10]) for (const dx of [-0.10, 0.10]) {
      P.add('turretDark', tag(cylZ(0.085, 0.68, 16).translate(dx, dy, 0.08), 'pod-tube'), podX, podY, podZ, pitch, yaw, 0);
      P.add('turretDark', tag(torus(0.086, 0.008, 16).rotateX(Math.PI / 2).translate(dx, dy, 0.42), 'pod-mouth'), podX, podY, podZ, pitch, yaw, 0);
      P.add('turretDark', tag(cylZ(0.072, 0.012, 16).translate(dx, dy, 0.42), 'pod-cap'), podX, podY, podZ, pitch, yaw, 0);
    }
  }
  // roof plate grid with corner bolts (T-14 roof grammar), hatches, panoramic drum stack, met mast, GPS dome, vent
  for (const [x, z] of [[-0.52, 0.42], [0, 0.42], [0.52, 0.42], [-0.56, -0.10], [0.56, -0.10]] as const) {
    P.add('turretDetail', tag(box(0.44, 0.017, 0.40), 'roof-tile'), x, ROOF_Y + 0.0085, z);
    for (const dx of [-0.17, 0.17]) for (const dz of [-0.15, 0.15]) P.add('turretDark', tag(cylY(0.011, 0.011, 0.012, 6), 'roof-tile-bolt'), x + dx, ROOF_Y + 0.023, z + dz);
  }
  P.addCupola('turret', tag(box(0.44, 0.04, 0.40), 'roof-hatch'), 0, ROOF_Y + 0.02, -0.10);
  P.add('turretDark', tag(box(0.44, 0.016, 0.04), 'roof-hatch-hinge'), 0, ROOF_Y + 0.045, 0.12);
  P.addCupola('turret', tag(cylY(0.30, 0.32, 0.05, 28), 'commander-hatch'), -0.44, ROOF_Y + 0.025, -0.80);
  P.add('turretDark', tag(torus(0.31, 0.012, 28), 'commander-hatch-ring'), -0.44, ROOF_Y + 0.05, -0.80, Math.PI / 2, 0, 0);
  P.add('turretDark', tag(box(0.12, 0.03, 0.03), 'commander-hatch-handle'), -0.44, ROOF_Y + 0.06, -0.54);
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.6;
    KIT.periscope(P, 'turretDetail', -0.44 + Math.sin(a) * 0.40, ROOF_Y + 0.02, -0.80 + Math.cos(a) * 0.40, a);
  }
  const px = 0.48, pz = -1.08;
  P.add('turretDetail', tag(cylY(0.20, 0.28, 0.05, 32), 'panoramic-bearing'), px, ROOF_Y + 0.025, pz);
  P.add('turret', tag(cylY(0.20, 0.20, 0.22, 32), 'panoramic-drum'), px, ROOF_Y + 0.16, pz);
  P.add('turretDetail', tag(cylY(0.185, 0.185, 0.05, 32), 'panoramic-collar'), px, ROOF_Y + 0.295, pz);
  P.add('turret', tag(cylY(0.18, 0.18, 0.18, 32), 'panoramic-upper'), px, ROOF_Y + 0.41, pz);
  P.addEquipment('turret', tag(box(0.17, 0.24, 0.10), 'panoramic-head'), px - 0.05, ROOF_Y + 0.42, pz + 0.16);
  P.addModuleVisual('optics', 'turretGlass', tag(box(0.13, 0.17, 0.009), 'panoramic-glass'), px - 0.05, ROOF_Y + 0.43, pz + 0.215);
  P.add('turretDetail', tag(cylY(0.185, 0.185, 0.013, 32), 'panoramic-cap'), px, ROOF_Y + 0.51, pz);
  P.add('turretDark', tag(cylY(0.012, 0.012, 0.46, 8), 'met-mast'), 0.74, ROOF_Y + 0.23, 1.15);
  P.add('turretDark', tag(box(0.12, 0.02, 0.02), 'met-mast-cross'), 0.74, ROOF_Y + 0.44, 1.15);
  P.add('turretDark', tag(cylY(0.03, 0.03, 0.04, 12), 'met-mast-head'), 0.74, ROOF_Y + 0.48, 1.15);
  P.add('turretDark', tag(cylY(0.09, 0.10, 0.06, 16), 'gps-dome'), 0.30, ROOF_Y + 0.03, 0.85);
  P.add('turret', tag(box(0.30, 0.10, 0.28), 'roof-vent'), -0.60, ROOF_Y + 0.05, 0.95);
  P.add('turretDark', tag(box(0.24, 0.012, 0.22), 'roof-vent-grille'), -0.60, ROOF_Y + 0.105, 0.95);
  P.add('turretDark', tag(box(0.20, 0.08, 0.14), 'roof-junction-box'), -0.62, ROOF_Y + 0.04, 0.60);
  weaponStation(P, -1.72);
  // bustle: curved rail and three whip antennas on pots
  P.add('turretDark', tag(new THREE.TorusGeometry(0.18, 0.012, 8, 16, Math.PI), 'bustle-rail'), 0, ROOF_Y + 0.02, -2.15, 0, Math.PI / 2, 0);
  for (const [x, z, h] of [[-0.46, -2.62, 1.50], [0.02, -2.66, 1.20], [0.46, -2.62, 1.36]] as const) {
    P.add('turretDark', tag(cylY(0.040, 0.052, 0.09, 10), 'antenna-pot'), x, ROOF_Y + 0.045, z);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed: 1265 + Math.round(x * 10) }), x, ROOF_Y + 0.09, z);
  }
  P.topY = Math.max(P.topY || 0, ROOF_Y + 0.81 + 0.42);
}

function buildType100(P: TankBuilderPort): void {
  buildType100Hull(P);
  buildType100RunningGear(P);
  buildType100Turret(P);
  for (const s of [-1, 1]) {
    P.decal('hull', 'star', null, 0.22, [s * (SIDE_X + 0.012), 1.04, 2.20], s * -Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || 'LZ83', 0.26, [s * (SIDE_X + 0.012), 1.04, 1.34], s * -Math.PI / 2);
    P.decal('turret', 'star', null, 0.18, [s * (skinHalf(1.25) - LEAN_LOW * 0.55 + 0.02), 0.22, 1.25], s * -(Math.PI / 2 - 0.55), 0, s * Math.atan(LEAN_LOW / 0.38));
  }
  if (P.geometryReceipt) {
    P.hullG.userData.type100Receipt = Object.freeze({
      architecture: 'type100-ztz100-r4', hullStations: HULL_STATIONS.length, curtainPanelsPerSide: 8,
      roadWheelsPerSide: 6, launcherTubes: 8, rwsTopM: ROOF_Y + 0.81 + 0.42, gunLengthM: GUN_LEN,
    });
  }
}

export const TYPE100_PROFILES = Object.freeze({
  type100: Object.freeze({ build: buildType100 }),
}) satisfies VehicleProfileRecord;
