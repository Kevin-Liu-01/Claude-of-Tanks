// First-party procedural BMP-1 / BMP-2 boat hull and the BMP-2 two-man turret (267, owner: "now update the ... bmp2,
// ... bwp-1"). The two hulls are one construction: the BMP-2 hull is the BMP-1's with wider fender bins and the
// turret crew moved up, so `bmp2` and `bwp1` (Polish licence BMP-1) draw the same lofts with their own deck, port and
// fender stations.
//
// Frame: the BMP-2 lines are the registered m_bergman print (public/models/tanks/community/bmp2_bergman.glb) in the
// fidelity gate's frame (x/y x0.9431, z x1.0009; mid features +0.076 forward, the bmp2 registration law), +x = the
// vehicle's LEFT (forward +z, up +y). Measured print sections (gate frame):
//   fender bin  outer +-1.556, y 0.88..1.23, full length, rounded rear end, lifted front end;
//   upper side  foot +-1.37 at y 1.27 leaning to +-1.31 at 1.55 amidships, converging in plan behind z -0.6 to
//               +-1.03 / +-0.985 at the stern (the troop compartment's raked walls), roof-edge chamfer to the 1.629 deck;
//   glacis      1.545 at z 1.84 to 1.305 at z 2.90 (12.8 deg), nose plate 1.28, folded trim vane to 1.41;
//   stern       rear plate z -3.12, twin fuel-cell doors bulging to -3.36.
// Photos followed (research/bmp2/photos): Kuzmin 4thTankDivisionOpenDay17p1-47/-49, Alf van Beem landmachtdagen 2010.
// Running gear, tub, prow planes and stern underside are the certified lines of the earlier build (clip 0/0, gate
// registration); everything above the track run is rebuilt here.
import * as THREE from 'three';
import { KIT } from '../tankFactoryCore.ts';
import { FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { weaponAssembly } from './weaponStock.ts';
import type { Modern3BuilderPort } from '../modern3.ts';

type Vec3Tuple = [number, number, number];
export type BmpHullVariant = 'bmp2' | 'bwp1';

interface HullStation {
  /** station z */
  readonly z: number;
  /** side foot x at y 1.27 (top of the fender shelf) */
  readonly foot: number;
  /** side top (x, y) where the raked side meets the roof-edge chamfer */
  readonly top: readonly [number, number];
  /** chamfer end (x, y) */
  readonly edge: readonly [number, number];
  /** deck x where the flat deck (DECK_Y) begins */
  readonly deck: number;
}

const DECK_Y = 1.629;
const BODY_BOTTOM_Y = 1.205; // over the track run: 4+ cm over the moving belt (clip B4)
const SHELF_Y = 1.27;
/** Upper hull: constant amidships, the troop compartment walls converge behind z -0.6. */
const BODY_STATIONS: readonly HullStation[] = [
  { z: -3.12, foot: 1.03, top: [0.985, 1.505], edge: [0.82, 1.570], deck: 0.62 },
  { z: -2.42, foot: 1.12, top: [1.065, 1.510], edge: [0.89, 1.578], deck: 0.68 },
  { z: -1.42, foot: 1.25, top: [1.19, 1.520], edge: [1.02, 1.595], deck: 0.84 },
  { z: -0.60, foot: 1.37, top: [1.31, 1.545], edge: [1.15, 1.612], deck: 1.00 },
  { z: 1.72, foot: 1.37, top: [1.31, 1.545], edge: [1.15, 1.612], deck: 1.00 },
];

/** Full counter-clockwise ring from the +x half listed bottom to top. */
function mirrorRing(half: readonly SectionPoint[]): SectionPoint[] {
  const left = half.slice().reverse().map(([x, y]) => [-x, y] as SectionPoint);
  return [...half, ...left];
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** The body station interpolated at z (clamped to the body's span). */
function bodyAt(z: number): HullStation {
  const s = BODY_STATIONS;
  if (z <= s[0].z) return s[0];
  for (let i = 1; i < s.length; i++) {
    if (z <= s[i].z) {
      const a = s[i - 1], b = s[i], t = (z - a.z) / (b.z - a.z);
      return {
        z, foot: lerp(a.foot, b.foot, t),
        top: [lerp(a.top[0], b.top[0], t), lerp(a.top[1], b.top[1], t)],
        edge: [lerp(a.edge[0], b.edge[0], t), lerp(a.edge[1], b.edge[1], t)],
        deck: lerp(a.deck, b.deck, t),
      };
    }
  }
  return s[s.length - 1];
}

/** Point on the raked upper side at height y (0 = foot, 1 = side top) and its outward normal angle about z. */
function sidePoint(z: number, y: number): { x: number; lean: number } {
  const b = bodyAt(z);
  const t = (y - SHELF_Y) / (b.top[1] - SHELF_Y);
  return { x: lerp(b.foot, b.top[0], t), lean: Math.atan2(b.foot - b.top[0], b.top[1] - SHELF_Y) };
}

const GLACIS_TOP = (z: number): number => 1.545 - 0.2264 * (z - 1.84);

export type BmpHullPort = Modern3BuilderPort;

/** A point standing `off` metres off the raked upper side along its normal (s = side sign), and the plate lean. */
export function bmpSidePoint(s: number, z: number, y: number, off: number): { x: number; y: number; lean: number } {
  const p = sidePoint(z, y);
  return { x: s * (p.x + off * Math.cos(p.lean)), y: y + off * Math.sin(p.lean), lean: p.lean };
}

/** A plate lying on the raked upper side (buried `-standoff` into it), z zFront..zRear, y y0..y1. */
export function bmpSidePlate(s: number, zFront: number, zRear: number, y0: number, y1: number, standoff: number,
  thick: number): THREE.BufferGeometry {
  const pt = (z: number, y: number, off: number): Vec3Tuple => {
    const p = bmpSidePoint(s, z, y, off);
    return [p.x, p.y, z];
  };
  const a = standoff, b = standoff + thick;
  return orientedSlabLocal(pt(zFront, y0, a), pt(zFront, y0, b), pt(zRear, y0, b), pt(zRear, y0, a),
    pt(zFront, y1, a), pt(zFront, y1, b), pt(zRear, y1, b), pt(zRear, y1, a));
}

interface BmpHullOptions {
  /** fender bin outer half-width (BMP-2 1.556; BMP-1 1.47) */
  readonly binOuter: number;
  /** firing ports per side, +x (left) then -x (right) */
  readonly ports: readonly [readonly number[], readonly number[]];
  /** firing-port bosses stand this far off the raked plate (the BWP-1 demonstrator's appliqué is 35 mm) */
  readonly portStandoff: number;
  /** the owner's BMP-2M modernization package (2026-08-14, PROGRAM-STATE §5.238): side and glacis cassettes cover the
   * ports, protected headlight clusters */
  readonly bmp2m: boolean;
}

export const BMP_HULL_OPTIONS: Readonly<Record<BmpHullVariant, BmpHullOptions>> = {
  // BMP-2: 4 left / 3 right firing ports (bmp2 reference packet), left-front driver, engine front-right
  bmp2: { binOuter: 1.556, ports: [[-0.504, -1.144, -1.784, -2.414], [-0.824, -1.464, -2.104]], portStandoff: 0, bmp2m: true },
  // BMP-1 / BWP-1: 4 + 4 ports, the narrower fender bins (2.94 m vehicle width)
  bwp1: { binOuter: 1.47, ports: [[-0.47, -1.10, -1.73, -2.36], [-0.47, -1.10, -1.73, -2.36]], portStandoff: 0.035, bmp2m: false },
};

/** One fender bin per side: outboard skirt-box over the track run with its shelf running in under the raked side. */
function addFenderBins(P: Modern3BuilderPort, outer: number): void {
  const inner = 1.40; // 4.5 cm outboard of the 1.355 track edge
  const shelf = 1.262;
  // rear end rolls down and in (photo: the bin's rounded stern end), front end lifts over the sprocket with the prow
  const stations: Array<[number, number, number, number]> = [
    // z, bottom y, outer x, top y
    [-3.23, 1.16, outer - 0.05, 1.228],
    [-3.19, 1.07, outer - 0.015, 1.236],
    [-3.12, 0.98, outer, 1.240],
    [-3.00, 0.915, outer, 1.240],
    [-2.84, 0.885, outer, 1.240],
    [2.24, 0.885, outer, 1.240],
    [2.40, 0.72, outer, 1.240],
    [2.64, 0.72, outer, 1.240],
    [2.86, 1.00, outer, 1.240],
    [3.06, 1.15, inner + 0.08, 1.235],
  ];
  for (const s of [-1, 1]) {
    const sections: SolidSection[] = stations.map(([z, bot, out, top]) => {
      const o = Math.max(out, inner + 0.06);
      const right: SectionPoint[] = [
        [inner, bot], [o, bot], [o, top - 0.035], [o - 0.03, top], [1.0, Math.min(top, shelf)],
        [1.0, BODY_BOTTOM_Y], [inner, BODY_BOTTOM_Y],
      ];
      const ring = s > 0 ? right : right.slice().reverse().map(([x, y]) => [-x, y] as SectionPoint);
      return { z, ring };
    });
    P.add('hull', sectionSolid(sections));
    // three rolled stiffeners along the bin face (photo: the bin is three rolled courses), half-buried in the face,
    // and the panel joints
    for (const y of [0.955, 1.065, 1.170]) {
      P.add('hull', KIT.cylZ(0.016, 5.30, 6), s * (outer - 0.004), y, -0.32);
    }
    for (const z of [-1.86, -0.62, 0.62, 1.70]) {
      P.add('hullDark', KIT.box(0.012, 0.32, 0.018), s * (outer + 0.004), 1.06, z);
    }
  }
}

/** Raked troop-compartment side, the deck and the roof-edge chamfer as one loft. */
function addUpperBody(P: Modern3BuilderPort): void {
  const sections: SolidSection[] = BODY_STATIONS.map((b) => ({
    z: b.z,
    ring: mirrorRing([[b.foot, BODY_BOTTOM_Y], [b.foot, SHELF_Y], [b.top[0], b.top[1]], [b.edge[0], b.edge[1]],
      [b.deck, DECK_Y]]),
  }));
  P.add('hull', sectionSolid(sections));
}

/** Upper glacis: the crest drop, the 12.8-degree plate and the nose plate converging to the prow. */
function addGlacis(P: Modern3BuilderPort): void {
  const st: Array<[number, number, number, number, number, number]> = [
    // z, side x, bottom y, side-top y, top-edge x, top y
    [1.72, 1.37, BODY_BOTTOM_Y, 1.545, 1.15, 1.612],
    [1.84, 1.37, BODY_BOTTOM_Y, 1.500, 1.21, GLACIS_TOP(1.84)],
    [2.60, 1.37, BODY_BOTTOM_Y, 1.355, 1.23, GLACIS_TOP(2.60)],
    [2.97, 1.37, 1.12, 1.262, 1.24, GLACIS_TOP(2.97)],
    [3.20, 1.10, 1.02, 1.245, 1.02, 1.272],
    [3.36, 1.065, 1.00, 1.262, 0.98, 1.285],
  ];
  const sections: SolidSection[] = st.map(([z, sx, bot, sTop, tx, top]) => ({
    z, ring: mirrorRing([[sx, bot], [sx, sTop], [tx, top]]),
  }));
  P.add('hull', sectionSolid(sections));
  // wave-breaker ribs across the glacis (8, photo/print): triangular bars seated 8 mm into the plate
  const slope = Math.atan(0.2264);
  for (let k = 0; k < 8; k++) {
    const z = 1.98 + k * 0.118;
    const ribW = 2.30 - Math.max(0, z - 2.70) * 0.6;
    P.add('hullDetail', KIT.xform(KIT.cylX(0.026, ribW, 3), 0, 0, 0, -slope + Math.PI / 6, 0, 0), 0, GLACIS_TOP(z) + 0.010, z);
  }
  // splash board at the crest (the 7 cm drop from the deck to the glacis)
  P.add('hullDetail', KIT.box(2.18, 0.06, 0.05), 0, 1.585, 1.745);
}

/** Prow below the glacis: the certified boat-run planes, belly pan and no-air closure plates (unchanged lines). */
function addProw(P: Modern3BuilderPort): void {
  const { box, frustum, slab } = KIT;
  P.add('hull', frustum(0.98, 2.276, 2.136, 1.02, 3.176, 3.056, 0.40, 1.03));     // prow plane A (boat run)
  P.add('hull', frustum(1.02, 3.176, 3.056, 1.055, 3.365, 3.28, 1.03, 1.225));   // prow plane B (knuckle -> lip)
  // folded trim vane: the board lying on the nose plate (gate tip band 0.33 thick keeps the published 6.72)
  P.add('hull', slab(
    [-1.065, 1.00, 3.365], [1.065, 1.00, 3.365], [1.065, 1.00, 3.13], [-1.065, 1.00, 3.13],
    [-1.065, 1.33, 3.365], [1.065, 1.33, 3.365], [1.065, 1.42, 3.13], [-1.065, 1.42, 3.13]));
  P.add('hullDark', box(1.96, 0.03, 0.035), 0, 1.395, 3.16, -0.38, 0, 0);       // vane frame lip
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.06, 0.20), s * 0.80, 1.385, 3.24, -0.38, 0, 0); // vane hinge brackets
  }
  P.add('hull', box(1.96, 0.06, 0.56), 0, 0.435, 1.98);                         // belly pan: tub front -> plane A
  for (const s of [-1, 1]) {
    const m = (x: number): number => (s < 0 ? -x : x);
    P.add('hull', orientedSlabLocal(
      [m(0.92), 0.38, 1.90], [m(0.98), 0.38, 1.90], [m(0.98), 0.38, 1.72], [m(0.92), 0.38, 1.72],
      [m(0.92), 1.518, 1.90], [m(0.98), 1.518, 1.90], [m(0.98), 1.518, 1.72], [m(0.92), 1.518, 1.72]));
    P.add('hull', orientedSlabLocal(
      [m(0.92), 0.38, 2.16], [m(0.98), 0.38, 2.16], [m(0.98), 0.38, 1.90], [m(0.92), 0.38, 1.90],
      [m(0.92), 1.470, 2.16], [m(0.98), 1.470, 2.16], [m(0.98), 1.527, 1.90], [m(0.92), 1.527, 1.90]));
    P.add('hull', orientedSlabLocal(
      [m(0.92), 0.92, 2.94], [m(0.98), 0.92, 2.94], [m(0.98), 0.386, 2.16], [m(0.92), 0.386, 2.16],
      [m(0.92), 1.298, 2.94], [m(0.98), 1.298, 2.94], [m(0.98), 1.470, 2.16], [m(0.92), 1.470, 2.16]));
    // bow tow hooks (print: the U hooks at the nose corners)
    P.add('hullDark', KIT.xform(KIT.torus(0.06, 0.016, 10, 6), 0, 0, 0, Math.PI / 2, 0, 0), m(0.86), 1.06, 3.36);
    P.add('hullDetail', box(0.10, 0.08, 0.10), m(0.86), 1.06, 3.30);
  }
}

/** Tub between the tracks and the certified stern underside (unchanged lines). */
function addTubAndStern(P: Modern3BuilderPort): void {
  const { box, slab } = KIT;
  P.add('hull', box(2.08, 1.23, 4.58), 0, 1.025, -0.534);                       // centre tub y 0.41..1.64
  P.add('hull', slab(
    [-1.02, 0.35, -2.754], [1.02, 0.35, -2.754], [1.02, 0.375, -2.96], [-1.02, 0.375, -2.96],
    [-1.02, 0.66, -2.754], [1.02, 0.66, -2.754], [1.02, 0.66, -2.96], [-1.02, 0.66, -2.96]));
  P.add('hull', slab(
    [-1.02, 0.375, -2.96], [1.02, 0.375, -2.96], [1.02, 0.47, -3.01], [-1.02, 0.47, -3.01],
    [-1.02, 0.66, -2.96], [1.02, 0.66, -2.96], [1.02, 0.66, -3.01], [-1.02, 0.66, -3.01]));
  P.add('hull', box(2.04, 0.54, 0.235), 0, 0.79, -2.9025);                      // stern body lower (inter-track)
  P.add('hull', slab(
    [-0.86, 0.50, -3.01], [0.86, 0.50, -3.01], [0.86, 0.97, -3.09], [-0.86, 0.97, -3.09],
    [-0.86, 1.59, -3.01], [0.86, 1.59, -3.01], [0.86, 1.59, -3.09], [-0.86, 1.59, -3.09]));
  // rear plate band between the tracks up to the body (closes the tub-to-plate band over the boat-tail cliff)
  P.add('hull', box(2.04, 0.25, 0.34), 0, 1.105, -2.95);
  // raked lower rear plate under the doors (print: 0.40 at z -2.96 rising to 1.00 at -3.19), between the tracks
  const q: Array<[number, number]> = [[-2.96, 0.40], [-3.19, 1.00], [-3.10, 1.22], [-2.96, 1.22]];
  P.add('hull', orientedSlabLocal(
    ...q.map(([z, y]) => [-0.98, y, z] as Vec3Tuple) as [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple],
    ...q.map(([z, y]) => [0.98, y, z] as Vec3Tuple) as [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple]));
}

/** Twin outward-opening troop doors with their fuel-cell bulges (photo: tall pillow doors filling the stern). */
function addSternDoors(P: Modern3BuilderPort, variant: BmpHullVariant): void {
  const { box, cylY, cylZ, xform } = KIT;
  // Round 2 (critic: "the rear doors read as square boxes"): each fuel-cell door is a convex shell — an arched top
  // (big upper corner radius), tight lower corners — whose outline closes in along a superellipse as it bulges back
  // from the rear plate (z -3.10) to its broad crowned face at -3.355 (gate tail band 1.135..1.555 kept).
  const doorRing = (cx: number, w: number, h: number, yc: number): SectionPoint[] => {
    const rt = Math.min(w * 0.42, h * 0.48), rb = Math.min(w, h) * 0.14;
    const pts: SectionPoint[] = [];
    const corners: Array<[number, number, number, number]> = [
      [cx + w / 2 - rb, yc - h / 2 + rb, -Math.PI / 2, rb], [cx + w / 2 - rt, yc + h / 2 - rt, 0, rt],
      [cx - w / 2 + rt, yc + h / 2 - rt, Math.PI / 2, rt], [cx - w / 2 + rb, yc - h / 2 + rb, Math.PI, rb],
    ];
    for (const [ox, oy, a0, r] of corners) {
      for (let k = 0; k < 4; k++) {
        const a = a0 + (k / 3) * (Math.PI / 2);
        pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
      }
    }
    return pts;
  };
  for (const s of [-1, 1]) {
    const cx = s * 0.37;
    const depth = 0.255;
    const sections: SolidSection[] = [0.0, 0.07, 0.13, 0.18, 0.215, 0.24, 0.255].map((d) => {
      const k = Math.pow(1 - Math.pow(d / (depth * 1.06), 4), 0.25);
      return { z: -3.10 - d, ring: doorRing(cx, 0.70 * k, 0.62 * k, 1.29 + 0.02 * (1 - k)) };
    }).reverse();
    P.add('hull', sectionSolid(sections));
    P.add('hullDark', box(0.04, 0.58, 0.05), s * 0.735, 1.29, -3.135);             // hinge line
    for (const y of [1.10, 1.48]) P.add('hullDetail', cylY(0.024, 0.024, 0.10, 8), s * 0.735, y, -3.14);
    P.add('hullDetail', KIT.cylX(0.016, 0.16, 8), s * 0.25, 1.20, -3.362);                 // handle across the door
    // door firing port (BMP-1: both doors; BMP-2: left door only)
    if (variant === 'bwp1' || s > 0) {
      P.add('hullDetail', xform(cylZ(0.052, 0.035, 12), 0, 0, 0), s * 0.40, 1.40, -3.365);
      P.add('hullDark', xform(cylZ(0.030, 0.012, 10), 0, 0, 0), s * 0.40, 1.40, -3.384);
    }
  }
  P.add('hullDark', box(0.03, 0.60, 0.05), 0, 1.29, -3.12);                         // centre seam
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.14, 0.07, 0.04), s * 0.92, 1.42, -3.13);                 // taillights on the rear plate
    P.add('hullGlass', box(0.10, 0.04, 0.012), s * 0.92, 1.42, -3.152);
  }
}

/** Rear corner stowage boxes on the fender shelf with their louvred faces (print/photo). */
function addRearCornerBoxes(P: Modern3BuilderPort, outer: number): void {
  for (const s of [-1, 1]) {
    const x0 = 0.98, x1 = Math.min(outer - 0.05, 1.40), w = x1 - x0, xc = s * (x0 + w / 2);
    P.add('hull', KIT.box(w, 0.24, 0.50), xc, 1.38, -2.86);
    P.add('hullDark', KIT.box(w * 0.82, 0.16, 0.012), xc, 1.38, -3.112);
    for (let k = 0; k < 4; k++) P.add('hullDetail', KIT.box(w * 0.78, 0.016, 0.022), xc, 1.32 + k * 0.04, -3.118);
  }
}

function addFiringPort(P: Modern3BuilderPort, s: number, z: number, covered = false, standoff = 0): void {
  const { cylX, xform, box } = KIT;
  const p = sidePoint(z, 1.39);
  const rz = s * p.lean;
  const nx = Math.cos(p.lean), ny = Math.sin(p.lean);
  // ball-mount cover: a round boss on the raked plate (axis on the plate normal, 15 mm buried) and its dark port
  // (a BMP-2M's cassettes cover them)
  if (!covered) P.add('hullDetail', xform(cylX(0.072, 0.050, 14), 0, 0, 0, 0, 0, rz), s * (p.x + (0.010 + standoff) * nx), 1.39 + (0.010 + standoff) * ny, z);
  if (!covered) P.add('hullDark', xform(cylX(0.034, 0.012, 10), 0, 0, 0, 0, 0, rz), s * (p.x + (0.038 + standoff) * nx), 1.39 + (0.038 + standoff) * ny, z);
  // TNPO vision block in the roof-edge chamfer above
  const b = bodyAt(z);
  const ex = (b.top[0] + b.edge[0]) / 2, ey = (b.top[1] + b.edge[1]) / 2;
  P.add('hullDark', box(0.07, 0.07, 0.15), s * ex, ey + 0.012, z + 0.12, 0, 0, s * 0.45);
  P.add('hullGlass', box(0.02, 0.04, 0.11), s * (ex + 0.035), ey + 0.012, z + 0.12, 0, 0, s * 0.45);
}

function addDeck(P: Modern3BuilderPort, variant: BmpHullVariant): void {
  const { box, cylY, torus, periscope } = KIT;
  // Everything on the deck within 0.96 m of the ring axis (0, 0.03) stays out: the turret skirt sweeps there.
  // driver (front LEFT, +x): hatch with three forward periscopes
  P.add('hull', cylY(0.23, 0.24, 0.04, 18), 0.60, DECK_Y + 0.008, 1.46);
  P.add('hullDark', torus(0.225, 0.011, 18), 0.60, DECK_Y + 0.030, 1.46);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', 0.46 + k * 0.14, DECK_Y + 0.025, 1.66, (k - 1) * -0.18);
  if (variant === 'bmp2') {
    // seat behind the driver (the BMP-1 commander's station): plain hatch with a periscope
    P.add('hull', cylY(0.19, 0.20, 0.035, 16), 0.68, DECK_Y + 0.006, 1.00);
    P.add('hullDark', torus(0.185, 0.010, 16), 0.68, DECK_Y + 0.025, 1.00);
    periscope(P, 'hullDetail', 0.96, DECK_Y + 0.026, 1.02, Math.PI / 2);
    // air-intake mushroom on the left roof edge (print: the 1.75 cap at x +1.10..1.14), stem buried in the chamfer
    P.add('hull', cylY(0.05, 0.065, 0.11, 12), 1.125, 1.655, 0.70);
    P.add('hull', cylY(0.075, 0.075, 0.03, 12), 1.125, 1.722, 0.70);
  } else {
    // BMP-1 commander's cupola behind the driver with the OU-3K IR searchlight
    P.add('hull', cylY(0.25, 0.28, 0.08, 18), 0.66, DECK_Y + 0.03, 0.98);
    P.add('hull', cylY(0.21, 0.23, 0.05, 18), 0.66, DECK_Y + 0.095, 0.98);
    P.add('hullDark', torus(0.215, 0.010, 18), 0.66, DECK_Y + 0.12, 0.98);
    P.add('hullDetail', box(0.10, 0.08, 0.10), 0.66, DECK_Y + 0.15, 1.18);
    P.add('hullDetail', KIT.cylZ(0.075, 0.12, 14), 0.90, DECK_Y + 0.17, 1.14);
    P.add('hullGlass', KIT.cylZ(0.060, 0.012, 14), 0.90, DECK_Y + 0.17, 1.205);
    P.add('hullDetail', box(0.06, 0.13, 0.06), 0.90, DECK_Y + 0.065, 1.14);
  }
  // engine deck (front RIGHT, -x): louvred intake panel ahead of the turret sweep
  P.add('hull', box(0.84, 0.035, 0.66), -0.58, DECK_Y + 0.010, 1.33);
  P.add('hullDark', box(0.70, 0.012, 0.50), -0.58, DECK_Y + 0.030, 1.33);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.66, 0.016, 0.03), -0.58, DECK_Y + 0.036, 1.12 + k * 0.105);
  // exhaust louvre on the right flank ahead of the ring
  const ex = sidePoint(1.25, 1.42);
  P.add('hullDark', box(0.03, 0.10, 0.42), -(ex.x + 0.008), 1.42, 1.25, 0, 0, -ex.lean);
  // troop compartment roof hatches
  const hatches = variant === 'bmp2'
    ? [{ z: -2.10, l: 0.95 }]
    : [{ z: -1.62, l: 0.62 }, { z: -2.44, l: 0.62 }];
  for (const s of [-1, 1]) for (const h of hatches) {
    const xc = s * 0.36;
    const w = Math.min(0.56, 2 * (bodyAt(h.z).deck - 0.08));
    P.add('hull', box(w, 0.035, h.l), xc, DECK_Y + 0.008, h.z);
    P.add('hullDark', box(w - 0.06, 0.012, 0.025), xc, DECK_Y + 0.028, h.z + h.l / 2 - 0.05);
    P.add('hullDetail', box(0.05, 0.03, 0.10), s * 0.10, DECK_Y + 0.02, h.z + h.l * 0.25);
    P.add('hullDetail', box(0.05, 0.03, 0.10), s * 0.10, DECK_Y + 0.02, h.z - h.l * 0.25);
    P.add('hullDetail', box(0.14, 0.025, 0.03), xc, DECK_Y + 0.036, h.z - h.l / 2 + 0.10);
  }
  // fuel filler caps and the antenna base on the rear deck
  P.add('hullDetail', cylY(0.065, 0.07, 0.025, 12), 0.0, DECK_Y + 0.008, -2.85);
  P.add('hullDetail', cylY(0.05, 0.055, 0.022, 10), 0.0, DECK_Y + 0.008, -1.30);
}

function addBowFittings(P: Modern3BuilderPort, variant: BmpHullVariant): void {
  const { box } = KIT;
  if (variant === 'bmp2') {
    // BMP-2 (BMP-2M): headlight clusters on the fender fronts, each in the package's protective cage
    for (const s of [-1, 1]) {
      P.add('hullDetail', box(0.26, 0.05, 0.18), s * 1.36, 1.265, 2.62);            // lamp shelf on the bin top
      const lamp = FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.13, r: 0.05,
        shield: true, rake: -0.10, seed: 2 + (s > 0 ? 0 : 3) });
      lamp.position.set(s * 1.36, 1.335, 2.66);
      P.hullG.add(lamp);
      // cage: two posts from the shelf and a top bar ahead of the lamps
      for (const dx of [-0.13, 0.13]) P.add('hullDark', box(0.022, 0.20, 0.022), s * 1.36 + dx, 1.385, 2.74);
      P.add('hullDark', box(0.28, 0.022, 0.022), s * 1.36, 1.484, 2.74);
      P.add('hullDark', box(0.022, 0.022, 0.14), s * 1.36, 1.484, 2.68);
    }
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, seed: 3,
      // stowed straight across the glacis foot behind the folded vane (round 2: the arc across the ribs read stray)
      pts: [[0.92, GLACIS_TOP(2.84) + 0.025, 2.84], [0.0, GLACIS_TOP(2.87) + 0.025, 2.87],
        [-0.92, GLACIS_TOP(2.84) + 0.025, 2.84]],
    });
    P.hullG.add(cable);
    return;
  }
  // BMP-1 / BWP-1: the headlight and IR lamp cluster on the glacis' left front corner (photo 5: the driver's side),
  // a single driving light on the right corner, both on brackets seated in the plate
  const slope = Math.atan(0.2264);
  for (const [x, pods, seed] of [[0.90, 2, 3430], [-0.92, 1, 3431]] as Array<[number, number, number]>) {
    const z = 2.78;
    P.add('hullDetail', KIT.xform(box(0.22, 0.10, 0.16), 0, 0, 0, slope, 0, 0), x, GLACIS_TOP(z) + 0.035, z);
    const lamp = FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods, spacing: 0.12, r: 0.055,
      shield: true, rake: -0.12, seed });
    lamp.position.set(x, GLACIS_TOP(z) + 0.10, z + 0.01);
    P.hullG.add(lamp);
  }
}

/** The owner's BMP-2M modernization package (2026-08-14, PROGRAM-STATE §5.238), rebuilt on the lofted hull:
 * seven cassettes a side on a continuous carrier rail along the raked sides (they cover the firing ports, as on a
 * field-modernized protection fit, and stay on the fender shelf, far above the track return), and two staggered
 * cassette rows seated on the ribbed glacis plate. No hull, fender, wheel or track geometry is removed. */
function addBmp2mHullPackage(P: Modern3BuilderPort): void {
  const { box, cylX, xform } = KIT;
  const sideZ = [1.36, 0.78, 0.20, -0.38, -0.96, -1.54, -2.12];
  for (const s of [-1, 1]) {
    // carrier rail on the shelf, its inner edge buried in the side foot, following the converging foot line
    P.add('hullDetail', sectionSolid([-2.42, -1.42, -0.60, 1.66].map((z) => {
      const f = bodyAt(z).foot;
      const right: SectionPoint[] = [[f - 0.02, 1.235], [f + 0.07, 1.235], [f + 0.07, 1.30], [f - 0.02, 1.325]];
      return { z, ring: s > 0 ? right : right.slice().reverse().map(([x, y]) => [-x, y] as SectionPoint) };
    })));
    sideZ.forEach((zc, k) => {
      const len = k === 0 || k === sideZ.length - 1 ? 0.48 : 0.52;
      const zf = zc + len / 2, zr = zc - len / 2;
      const y1 = Math.min(bodyAt(zf).top[1], bodyAt(zr).top[1]) - 0.012;
      P.add('hull', bmpSidePlate(s, zf, zr, 1.30, y1, -0.01, 0.12));                 // cassette on rail and plate
      P.add('hullDark', bmpSidePlate(s, zf - 0.04, zr + 0.04, y1 - 0.045, y1 - 0.03, 0.105, 0.02)); // lid seam
      for (const z of [zf - 0.07, zr + 0.07]) {
        const b = bmpSidePoint(s, z, 1.36, 0.118);
        P.add('hullDetail', xform(cylX(0.018, 0.02, 6), 0, 0, 0, 0, 0, s * b.lean), b.x, b.y, z); // retaining bolts
      }
    });
    // forward return: the first cassette closes into the glacis shoulder
    P.add('hull', bmpSidePlate(s, 1.70, 1.60, 1.30, 1.50, -0.01, 0.09));
  }
  const slope = Math.atan(0.2264);
  const n: [number, number] = [Math.cos(slope), Math.sin(slope)];                     // plate normal (y, z)
  for (const [z, xs, w] of [
    [2.12, [-0.765, -0.255, 0.255, 0.765], 0.46],
    [2.47, [-0.72, -0.24, 0.24, 0.72], 0.43],
  ] as Array<[number, number[], number]>) {
    for (const x of xs) {
      const off = 0.055 - 0.010;                                                     // half thickness, 10 mm buried
      P.add('hull', xform(box(w, 0.11, 0.30), 0, 0, 0, slope, 0, 0), x, GLACIS_TOP(z) + off * n[0], z + off * n[1]);
      P.add('hullDark', xform(box(w - 0.05, 0.016, 0.02), 0, 0, 0, slope, 0, 0),
        x, GLACIS_TOP(z + 0.15) + (off + 0.05) * n[0], z + 0.14 + (off + 0.05) * n[1]);  // seating seam at the lip
    }
  }
}

function addRunningGear(P: Modern3BuilderPort): void {
  // FRONT drive sprocket + REAR idler, both raised (certified lines; clip 0/0)
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.16, xc: 1.205, dishR: 0.82,
    wheelZs: [1.506, 0.786, 0.066, -0.654, -1.374, -2.094],
    sprocket: { z: 2.256, y: 0.80, r: 0.26 }, idler: { z: -2.44, y: 0.60, r: 0.24 },
    rollers: [[1.086, 1.00], [-0.194, 1.00], [-1.414, 1.00]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.30, topY: 1.06, arms: true, paintedEnds: true,
    contactZF: 1.566, contactZR: -2.094,
  });
}

/** The BMP-1 / BMP-2 hull: lofted body, glacis, prow, fender bins, stern doors, deck and running gear. */
export function buildBmpBoatHull(P: Modern3BuilderPort, variant: BmpHullVariant): void {
  const o = BMP_HULL_OPTIONS[variant];
  addTubAndStern(P);
  addUpperBody(P);
  addGlacis(P);
  addProw(P);
  addFenderBins(P, o.binOuter);
  addRearCornerBoxes(P, o.binOuter);
  addSternDoors(P, variant);
  o.ports[0].forEach((z) => addFiringPort(P, 1, z, o.bmp2m, o.portStandoff));
  o.ports[1].forEach((z) => addFiringPort(P, -1, z, o.bmp2m, o.portStandoff));
  addDeck(P, variant);
  addBowFittings(P, variant);
  if (o.bmp2m) addBmp2mHullPackage(P);
  else {
    // pioneer shovel and a duffel on the left fender shelf, spare links on the right (the BMP-2M's cassettes fill them)
    KIT.shovelTool(P, 1.43, 1.262, 1.10, 0.9);
    KIT.stowage(P, 'hullCloth', P.rng, [[1.30, 1.29, -2.25, 0.20, 0.07, 0.62]]);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.30, pitch: 0.15, seed: 7 });
    links.position.set(-1.31, 1.262, -2.15);
    P.hullG.add(links);
  }
  addRunningGear(P);
  P.decal('hull', 'soot', null, 0.5, [-1.33, 1.45, 1.10], -Math.PI / 2);         // exhaust stain, right flank
}

// ---------------------------------------------------------------------------
// BMP-2 turret: the warped conical two-man turret on the 1.66 ring (gate-registered dome, basket and 2A42 lines kept),
// the roof stations where the registered print carries them (tall sight stack -x, TKN-3 +x), the 9P135M Konkurs post,
// 902V 3+3 on the front cheeks and one R-123 whip. The bolt-on BMP-2M tiles, thermal head and twin radio stations
// of the 2026-08-14 protection package are gone (the stock Soviet BMP-2 the photos show).
// ---------------------------------------------------------------------------
export function buildBmp2Turret(P: Modern3BuilderPort): void {
  const { box, cylY, cylZ, lathe, torus, xform, buildGun } = KIT;
  const scaled = KIT.xform as (g: THREE.BufferGeometry, x?: number, y?: number, z?: number, rx?: number, ry?: number,
    rz?: number, s?: number | readonly [number, number, number]) => THREE.BufferGeometry;
  P.add('turret', scaled(cylY(0.90, 0.915, 0.05, 30), 0, 0, 0, 0, 0, 0, [1, 1, 0.85]), 0, -0.02, 0.02);
  P.add('turret', scaled(lathe([
    [0.93, 0.0], [0.948, 0.06], [0.955, 0.16], [0.948, 0.25], [0.93, 0.35],
    [0.775, 0.385], [0.625, 0.425], [0.455, 0.45], [0.23, 0.485], [0.0, 0.50],
  ], 30), 0, 0, 0, 0, 0, 0, [1.02, 1, 1.031]), 0, 0, 0.01);                        // warped cone (gate-fitted)
  P.add('turret', scaled(cylY(0.56, 0.56, 0.78, 20), 0, 0, 0, 0, 0, 0, [1, 1, 0.9964]), 0, -0.39, 0.113); // basket
  // rear wall bulge: the cast rear of the turret (chamfered, not a box), crown seam on top
  P.add('turret', sectionSolid([
    { z: -0.80, ring: mirrorRing([[0.50, 0.02], [0.50, 0.30], [0.36, 0.40]]) },
    { z: -0.70, ring: mirrorRing([[0.66, 0.02], [0.66, 0.36], [0.52, 0.43]]) },
    { z: -0.50, ring: mirrorRing([[0.66, 0.02], [0.66, 0.38], [0.52, 0.44]]) },
  ]));
  // gun slot mantlet: the narrow vertical boss the 2A42 rides in, coax PKT at +x
  P.add('turret', sectionSolid([
    { z: 0.70, ring: mirrorRing([[0.25, 0.08], [0.25, 0.33], [0.20, 0.37]]) },
    { z: 1.02, ring: mirrorRing([[0.21, 0.10], [0.21, 0.31], [0.17, 0.35]]) },
  ]));
  P.add('turretDark', box(0.10, 0.09, 0.10), 0.20, 0.255, 0.98);
  P.add('turretDark', cylZ(0.024, 0.30, 8), 0.20, 0.255, 1.08);                  // coax PKT muzzle
  // -x station: hatch, sight hood forward of it, the tall periscope head (the registered print's tall stack)
  P.add('turret', cylY(0.235, 0.24, 0.036, 16), -0.42, 0.49, -0.17);
  P.add('turretDark', torus(0.235, 0.011, 16), -0.42, 0.510, -0.17);
  P.addEquipment('turret', box(0.16, 0.10, 0.18), -0.33, 0.46, 0.26);
  P.add('turretGlass', box(0.12, 0.035, 0.02), -0.33, 0.48, 0.355);
  P.add('turret', box(0.29, 0.37, 0.30), -0.415, 0.5975, -0.02);                  // 1PZ-3 housing (seated 20 mm in)
  P.add('turretGlass', box(0.20, 0.07, 0.02), -0.415, 0.70, 0.135);
  P.add('turretDetail', box(0.09, 0.09, 0.05), -0.26, 0.66, -0.125);
  // +x station: cupola tiers, TKN-3 binocular head forward, OU-3GA2 IR spotlight on the shoulder
  P.add('turret', cylY(0.24, 0.285, 0.09, 18), 0.38, 0.40, -0.11);
  P.add('turret', cylY(0.20, 0.20, 0.04, 18), 0.44, 0.4625, -0.11);
  P.add('turret', cylY(0.21, 0.21, 0.024, 18), 0.46, 0.4945, -0.11);
  P.add('turretDark', torus(0.205, 0.010, 18), 0.46, 0.508, -0.11);
  P.add('turret', box(0.06, 0.14, 0.06), 0.64, 0.475, 0.16);
  P.add('turret', box(0.13, 0.085, 0.16), 0.66, 0.585, 0.20);
  P.add('turretGlass', box(0.10, 0.03, 0.02), 0.66, 0.598, 0.27);
  P.add('turret', box(0.16, 0.13, 0.22), 0.58, 0.36, 0.78);
  P.add('turretDark', cylZ(0.065, 0.10, 14), 0.58, 0.40, 0.86);
  P.add('turretGlass', cylZ(0.055, 0.012, 14), 0.58, 0.40, 0.912);
  // shoulder lugs and grab rails
  for (const s of [-1, 1]) {
    P.add('turret', box(0.23, 0.10, 0.30), s * 0.775, 0.32, 0.32);
    P.add('turretDark', box(0.10, 0.06, 0.03), s * 0.775, 0.33, 0.475);
    P.add('turretDetail', box(0.05, 0.03, 0.09), s * 0.99, 0.135, 0.12);
  }
  P.add('turret', box(0.14, 0.11, 0.20), -0.58, 0.355, 0.70);                       // stowage bin
  P.add('turretDark', box(0.12, 0.014, 0.16), -0.58, 0.405, 0.70);
  // 9P135M Konkurs launch post: pedestal and cradle deck on the roof, the 9M113 container on its yoke
  P.add('turretDetail', box(0.39, 0.20, 0.31), -0.085, 0.53, -0.305);
  weaponAssembly(P, () => {
    P.add('turretDetail', box(0.12, 0.14, 0.13), 0.05, 0.50, -0.385);
    P.add('turretDetail', box(0.10, 0.06, 0.09), 0.05, 0.60, -0.315);
    P.add('turretDark', xform(cylZ(0.068, 0.92, 14), 0, 0, 0, -0.02, 0, 0), 0.05, 0.655, -0.12);   // 9M113 container
    P.add('turretDark', xform(cylZ(0.082, 0.06, 14), 0, 0, 0.44, -0.02, 0, 0), 0.05, 0.655, -0.12); // front ring
    P.add('turretDetail', xform(cylZ(0.074, 0.05, 14), 0, 0, -0.46, -0.02, 0, 0), 0.05, 0.655, -0.12); // rear cap
    P.add('turretDetail', box(0.03, 0.10, 0.05), 0.05, 0.60, -0.12);
  });
  // 902V Tucha: 3+3 on the front cheeks, standing out of the cone wall (they sat inside it) and raked forward-up
  for (const s of [-1, 1]) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.042, len: 0.30, pitch: -0.62,
      splay: s * 0.55, spacing: 0.10, seed: 3 + s,
    });
    bank.position.set(s * 0.57, 0.30, 0.80);
    P.turretG.add(bank);
  }
  addBmp2mTurretKit(P);
  // 2A42: cradle, root collar, plan rails, the long thin tube and its conical flash hider
  P.addGunExtra(box(0.18, 0.20, 0.35), 0, -0.02, 0.18);
  P.addGunExtra(box(0.23, 0.15, 0.47), 0, 0, 0.60);
  P.addGunExtra(cylZ(0.016, 2.13, 28), 0.098, 0.0, 1.565);
  P.addGunExtra(cylZ(0.016, 2.13, 28), -0.098, 0.0, 1.565);
  buildGun(P, { len: 0.84, r: 0.036, baseR: 0.088 });
  P.addGunExtra(cylZ(0.055, 1.91, 28), 0, 0, 1.745);
  P.muzzleZ = 2.785;
  P.add('gunDark', cylZ(0.060, 0.155, 10, 0.050), 0, 0, 2.7075);
  P.decal('turret', 'number', '245', 0.24, [0.965, 0.20, 0.05] as Vec3Tuple, Math.PI / 2, 0, 0.20);
  P.decal('turret', 'number', '245', 0.24, [-0.965, 0.20, 0.05] as Vec3Tuple, -Math.PI / 2, 0, -0.20);
  P.topY = 0.85;
}

/** Cone wall radius of the BMP-2 turret at local height y (the lathe profile, before the x/z scales). */
function bmp2ConeRadius(y: number): number {
  const prof: Array<[number, number]> = [[0.93, 0.0], [0.948, 0.06], [0.955, 0.16], [0.948, 0.25], [0.93, 0.35],
    [0.775, 0.385], [0.625, 0.425], [0.455, 0.45], [0.23, 0.485], [0.0, 0.50]];
  for (let i = 1; i < prof.length; i++) {
    if (y <= prof[i][1]) {
      const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
      return lerp(r0, r1, (y - y0) / (y1 - y0));
    }
  }
  return 0;
}

/** A point on the cone wall at azimuth phi (from +z towards +x) and height y, pushed `out` along the radius. */
function bmp2ConePoint(phi: number, y: number, out: number): [number, number] {
  const r = bmp2ConeRadius(y) + out;
  return [Math.sin(phi) * r * 1.02, Math.cos(phi) * r * 1.031 + 0.01];
}

/** The BMP-2M package's turret half (PROGRAM-STATE §5.238): low faceted protection leaves seated on the cone wall
 * (three frontal per cheek, three per side), the two rear equipment cells, four-quadrant laser-warning/EO heads on the
 * shoulders, the independent thermal viewer on its ring and two collar-seated radio whips. Every piece is turret-owned
 * and laps into the casting it rides on. */
function addBmp2mTurretKit(P: Modern3BuilderPort): void {
  const { box, cylY } = KIT;
  const leaf = (phi: number, w: number, h: number, d: number, y: number) => {
    const [x, z] = bmp2ConePoint(phi, y, d / 2 - 0.014);
    P.add('turret', box(w, h, d), x, y, z, 0, phi, 0);
    const [sx, sz] = bmp2ConePoint(phi, y + h / 2, d / 2 - 0.014);
    P.add('turretDark', box(w * 0.78, 0.014, d * 0.6), sx, y + h / 2 + 0.004, sz, 0, phi, 0);  // top seam
  };
  for (const s of [-1, 1]) {
    for (const phi of [0.36, 0.62, 0.88]) leaf(s * phi, 0.22, 0.17, 0.09, 0.15);       // frontal leaves
    for (const phi of [1.30, 1.62, 1.94]) leaf(s * phi, 0.25, 0.21, 0.08, 0.17);       // side leaves, up into the lugs
    // rear equipment cell with its lid and a broad root into the casting
    const [cx, cz] = bmp2ConePoint(s * 2.42, 0.13, 0.08);
    P.add('turret', box(0.34, 0.22, 0.24), cx, 0.13, cz, 0, s * 2.42, 0);
    P.add('turretDark', box(0.30, 0.014, 0.18), cx, 0.245, cz, 0, s * 2.42, 0);
    // laser-warning / EO heads, front and rear quadrant: armoured body on a short pedestal, dark face outward
    for (const [phi, y, out] of [[s * 0.95, 0.43, -0.16], [s * 2.40, 0.45, -0.20]] as Array<[number, number, number]>) {
      const [hx, hz] = bmp2ConePoint(phi, 0.36, out);
      P.add('turret', cylY(0.04, 0.05, 0.10, 10), hx, y - 0.08, hz);
      P.add('turret', box(0.15, 0.12, 0.13), hx, y, hz, -0.10, phi, 0);
      P.add('turretGlass', box(0.10, 0.055, 0.02), hx + Math.sin(phi) * 0.066, y + 0.01, hz + Math.cos(phi) * 0.066,
        -0.10, phi, 0);
    }
    // radio station: shoe lapping the wall, collar, whip
    const [wx, wz] = bmp2ConePoint(s * 1.95, 0.33, 0.078);                            // shoe outside the wall, 12 mm in
    P.add('turret', box(0.16, 0.13, 0.18), wx, 0.315, wz, 0, s * 1.95, 0);          //   and down onto the side leaf
    P.add('turretDark', cylY(0.05, 0.065, 0.09, 12), wx, 0.42, wz);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: s > 0 ? 0.72 : 0.60, r: 0.010, rake: s * 0.03,
      seed: 14 + (s > 0 ? 0 : 1) });
    whip.position.set(wx, 0.46, wz);
    P.turretG.add(whip);
  }
  // independent commander's thermal viewer on its ring, right-rear roof clear of the 9M113 container
  P.add('turret', cylY(0.14, 0.16, 0.08, 14), 0.27, 0.44, -0.60);
  P.add('turret', box(0.19, 0.18, 0.20), 0.27, 0.57, -0.58, 0, -0.08, 0);
  P.add('turretGlass', box(0.13, 0.09, 0.02), 0.262, 0.59, -0.475, 0, -0.08, 0);
}

/** Winding-guarded slab (a mirrored slab never ships inward-facing walls). */
function orientedSlabLocal(
  b0: Vec3Tuple, b1: Vec3Tuple, b2: Vec3Tuple, b3: Vec3Tuple,
  t0: Vec3Tuple, t1: Vec3Tuple, t2: Vec3Tuple, t3: Vec3Tuple,
): THREE.BufferGeometry {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((s, p) => s + p[k], 0) / 8) as Vec3Tuple;
  const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple =>
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3Tuple, b: Vec3Tuple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2], [b3, b0, t0, t3], [t0, t1, t2, t3],
    [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4) as Vec3Tuple;
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3 ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3) : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}
