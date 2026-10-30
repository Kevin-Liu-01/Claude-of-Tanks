// The Bernardini X1 family (release 266; Main's ruling 2026-10-29 on the Brazil line): one first-party build of the two
// light tanks the Brazilian Army fielded from Bernardini (docs/references/tanks/x1a2_carcara.md), on the BT-90 turret
// family (the French H-90's ring) and VVSS bogies, sprocket forward.
// - x1: the CCL X1 Pioneiro (52 built, 1977-94): an M3/M3A1 Stuart hull lengthened by Biselli on the Stuart's two
//   wide-spread bogies a side and its large trailing idler, the rear deck falling over the idler; the tall BT-90A1 turret
//   (a raked front over a short nose, sloped flanks, the domed commander's cupola its peak) with the 90 mm D-921 and its
//   single-baffle brake in a long mantlet sleeve, two dischargers each side at the turret rear.
// - x1a2: the CCL X1A2 Carcará (24 built, the 6º RCB 1981-94), Brazil's only indigenous tank in service: a new, longer
//   hull on the 18-ton M4 tractor's three VVSS bogies a side, a large toothed sprocket forward and a raised idler; a
//   wedge turret (a pointed nose, cheeks angled in, a long shallow front sloping to the roof, flanks leaning in) with the
//   Engesa EC-90 (the Cockerill Mk 3 under licence) in a long sleeve and its multi-baffle cage brake, three dischargers
//   on each front cheek, the six-tube box on each rear flank, the .50 on the cupola, the pioneer tools on the hull sides.
// Round 2 (blind critics, 2026-10-29): the VVSS bogies built as brackets, volute springs and A-arms with the return
//   roller on each bracket; the sprockets enlarged to the profiles; each mark its own turret; the M2s seated; the roofs
//   clear; the X1's running gear raised (larger wheels and idler) under a shallower side; the X1A2's tools, cage brake,
//   flank boxes and bow registration.
// Round 3: the X1's turret a true wedge (one long front slope from the ring to the roof, undercut flanks, a sloped bustle
//   overhang) behind a pot mantlet, its two-baffle box brake and flat-topped slit cupola; the X1A2's undercut flanks,
//   longer bustle and low periscope cupola; both marks' open spoked sprockets with their teeth proud of the track and
//   spoked idlers; the X1A2's shallower upper hull side over its smaller wheels, its glacis-top lamps, bow mudguards and
//   rear side boxes; the X1's curved rear fenders.
// Datums: the X1's published 5.04 m hull and 6.04 m over the gun, 2.4 m wide, 2.45 m; the X1A2's 6.06 m hull, 2.6 m wide,
// 2.45 m, 19 t (Tanks Encyclopedia, after Bastos' "Brazilian Stuart"); stations from Brian Gaydos' profiles for Tanks
// Encyclopedia, scaled on the hull (the X1A2's turret roof reads 2.5 m against the published 2.45, recorded in its packet;
// the X1A2's bogies spread their wheels 0.77 m and stand 0.64 m apart wheel to wheel, as drawn).
// A +Z hull's right is -X: the commander at -X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type BernardiniX1Mark = 'x1' | 'x1a2';

/** One turret cross-section (turret-local metres): the undercut lower flank leans out from the floor `yb` at half-width
 * `hwb` to the crease `yc` at `hwc`, then the upper flank leans in to the roof edge at `hwt`, `top`. */
interface TurretSection {
  readonly z: number; readonly yb: number; readonly yc: number; readonly top: number; readonly hwb: number; readonly hwc: number;
  readonly hwt: number;
}

interface X1Datums {
  readonly noseZ: number; readonly sternZ: number; readonly bellyY: number; readonly lowerX: number; readonly sponsonX: number;
  readonly sponsonFloorY: number; readonly deckY: number; readonly noseY: number; readonly glacisZ: number; readonly bowZ: number;
  readonly rearTopZ: number; readonly rearY: number; readonly rearBellyZ: number; readonly fenderX: number; readonly fenderY: number;
  readonly sponsonFrontZ: number; readonly sponsonRearZ: number;
  readonly trackXc: number; readonly trackW: number; readonly wheelR: number; readonly wheelY: number;
  readonly wheelZs: readonly number[]; readonly bogieZs: readonly number[];
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  readonly rollerZs: readonly number[]; readonly rollerY: number; readonly rollerR: number;
  readonly ring: { readonly y: number; readonly z: number };
  readonly turret: { readonly front: number; readonly slopeTop: number; readonly rear: number; readonly roof: number;
    readonly sections: readonly TurretSection[] };
  readonly trunnion: { readonly y: number; readonly z: number };
  readonly muzzleHullZ: number;
}

const sec = (z: number, yb: number, yc: number, top: number, hwb: number, hwc: number, hwt: number): TurretSection =>
  Object.freeze({ z, yb, yc, top, hwb, hwc, hwt });

type Polar = [number, number];
const polar = (rho: number, a: number): Polar => [rho * Math.cos(a), rho * Math.sin(a)];
/** A plate in a wheel's plane (axis +X), `depth` thick and centred on `x`: an outline and holes in polar-plotted (u, v). */
function axialPlate(outline: readonly Polar[], holes: readonly (readonly Polar[])[], depth: number, x: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}
const circle = (rho: number, n: number): Polar[] => Array.from({ length: n }, (_, k) => polar(rho, (k / n) * Math.PI * 2));
/** The openings between `count` spokes of half-width `hw` (m), from `ri` to `ro`. */
function spokeHoles(count: number, ri: number, ro: number, hw: number, phase = 0): Polar[][] {
  const holes: Polar[][] = [];
  for (let j = 0; j < count; j++) {
    const a0 = phase + (j / count) * Math.PI * 2, a1 = phase + ((j + 1) / count) * Math.PI * 2, h: Polar[] = [];
    for (let k = 0; k <= 6; k++) h.push(polar(ro, a0 + hw / ro + ((a1 - a0 - 2 * hw / ro) * k) / 6));
    for (let k = 3; k >= 0; k--) h.push(polar(ri, a0 + hw / ri + ((a1 - a0 - 2 * hw / ri) * k) / 3));
    holes.push(h);
  }
  return holes;
}
/** The Stuart-pattern drive sprocket (local +X outboard): two toothed rings riding just proud of the track's edges, the
 * outer one on six spokes with the openings dark behind them, the hub barrel and cap. */
function sprocketStock(r: number, trackW: number): { body: THREE.BufferGeometry; dark: THREE.BufferGeometry } {
  const n = Math.max(10, Math.round((Math.PI * 2 * r) / 0.165)), p = (Math.PI * 2) / n, toothed: Polar[] = [];
  for (let k = 0; k < n; k++) {
    const a = k * p;
    toothed.push(polar(r * 0.90, a - 0.32 * p), polar(r + 0.045, a - 0.13 * p), polar(r + 0.045, a + 0.13 * p),
      polar(r * 0.90, a + 0.32 * p));
  }
  const face = trackW / 2 + 0.012;
  const body = [
    axialPlate(toothed, spokeHoles(6, r * 0.30, r * 0.68, 0.035), 0.022, face),
    axialPlate(toothed, [circle(r * 0.66, 18)], 0.022, -face),
    KIT.cylX(r * 0.27, trackW + 0.03, 14),
    xformX(KIT.cylX(r * 0.15, 0.04, 12), face + 0.01),
  ];
  const dark = [xformX(KIT.cylX(r * 0.70, 0.02, 18), face - 0.06)];
  return { body: mergeGeometries(body), dark: mergeGeometries(dark) };
}
/** A spoked idler (symmetric about its plane): the rim the track wraps, two eight-spoke faces, the hub, the dark web. */
function idlerStock(r: number, trackW: number): { body: THREE.BufferGeometry; dark: THREE.BufferGeometry } {
  const w = trackW * 0.64, face = w / 2 + 0.011;
  const body = [
    axialPlate(circle(r * 0.99, 28), [circle(r * 0.86, 28)], w, 0),
    axialPlate(circle(r * 0.97, 28), spokeHoles(8, r * 0.28, r * 0.80, 0.028, Math.PI / 8), 0.022, face),
    axialPlate(circle(r * 0.97, 28), spokeHoles(8, r * 0.28, r * 0.80, 0.028, Math.PI / 8), 0.022, -face),
    KIT.cylX(r * 0.24, w + 0.10, 14),
  ];
  const dark = [KIT.cylX(r * 0.86, 0.02, 24)];
  return { body: mergeGeometries(body), dark: mergeGeometries(dark) };
}
const xformX = (g: THREE.BufferGeometry, x: number): THREE.BufferGeometry => g.translate(x, 0, 0);
/** Merged into one non-indexed geometry: positions, normals and UVs. */
function mergeGeometries(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const part of parts) {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), t = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(g.getAttribute('normal').getX(i), g.getAttribute('normal').getY(i), g.getAttribute('normal').getZ(i));
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (g !== part) g.dispose();
    part.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

const DATUMS: Readonly<Record<BernardiniX1Mark, X1Datums>> = Object.freeze({
  x1: Object.freeze({
    // the Stuart's stepped bow (Gaydos' X1): a low, nearly flat nose over the sprocket (1.20) for the first 19% of the
    // hull, the steep upper front plate (56 degrees) from it at 1.59 to the deck at 1.31; the rear deck a quarter-round
    // hood from -1.95 to its lip at the stern (1.26), overhanging the idler, the lower hull set back under it
    noseZ: 2.52, sternZ: -2.52, bellyY: 0.40, lowerX: 0.74, sponsonX: 1.12, sponsonFloorY: 1.14, deckY: 1.62, noseY: 1.20,
    glacisZ: 1.31, bowZ: 1.59, rearTopZ: -1.95, rearY: 1.26, rearBellyZ: -2.10, fenderX: 1.24, fenderY: 1.14,
    sponsonFrontZ: 2.30, sponsonRearZ: -1.95,
    // the Stuart's bogies: each pair spread 0.84 m, the two bogies' inner wheels nearly touching (Gaydos' X1 profile)
    trackXc: 0.98, trackW: 0.40, wheelR: 0.28, wheelY: 0.34, wheelZs: [1.47, 0.63, 0.02, -0.82], bogieZs: [1.05, -0.40],
    sprocket: { z: 2.03, y: 0.74, r: 0.36 }, idler: { z: -1.76, y: 0.41, r: 0.36 }, rollerZs: [0.89, -0.56], rollerY: 0.96,
    rollerR: 0.10,
    ring: { y: 1.62, z: 0.08 },
    turret: {
      // Gaydos' X1: the front a point at the mantlet, one long slope from it to the roof, its floor undercut back to the
      // ring; the roof at full height to -1.32, then the rear plate leaning well back (0.34 of the 0.66) to the bustle's
      // rearmost edge, over a floor rising from the ring to it; the flanks leaning in from a V-shaped lower facet (deep
      // fore and aft, shallow amidships)
      front: 1.02, slopeTop: 0.15, rear: -1.62, roof: 0.66,
      sections: Object.freeze([
        sec(-1.62, 0.29, 0.30, 0.31, 0.64, 0.70, 0.56), sec(-1.47, 0.25, 0.30, 0.48, 0.70, 0.80, 0.58),
        sec(-1.32, 0.21, 0.28, 0.64, 0.74, 0.86, 0.60), sec(-1.05, 0.14, 0.22, 0.65, 0.78, 0.90, 0.62),
        sec(-0.80, 0.06, 0.15, 0.655, 0.82, 0.92, 0.62), sec(-0.66, 0.02, 0.10, 0.66, 0.84, 0.92, 0.62),
        sec(-0.20, 0.02, 0.07, 0.66, 0.84, 0.92, 0.64), sec(0.15, 0.02, 0.10, 0.66, 0.84, 0.92, 0.64),
        sec(0.62, 0.02, 0.17, 0.54, 0.80, 0.88, 0.60), sec(0.80, 0.03, 0.21, 0.49, 0.72, 0.82, 0.56),
        sec(1.02, 0.14, 0.27, 0.40, 0.44, 0.54, 0.42),
      ]),
    },
    // the muzzle 1.28 m past the bow, as Gaydos draws it (25.4% of the 5.04 m hull, 55.6 px/m); the D-921 (CN-90 F1) is a
    // 33-calibre tube (Military Periscope, "90-mm CN-90-F1 tank gun"), about 3.0 m with the brake ahead of a breech
    // 0.5 m behind the trunnion: 2.70 m trunnion to muzzle. TE's 6.04 m overall reads the gun 0.28 m shorter.
    trunnion: { y: 0.33, z: 1.02 }, muzzleHullZ: 3.80,
  }),
  x1a2: Object.freeze({
    // the drawing (113 px/m): the deck 1.69 m up, the track's top run 1.09, a 0.60 m band (0.099 of the hull); here
    // the deck 1.68 over the side panel from 1.34 and the dark recess down to the run at 1.12. The rear: the deck flat
    // to the engine box's seam at -2.64, the top falling to the stern's corner (1.44), the rear plate overhanging, its top
    // rearmost
    noseZ: 3.03, sternZ: -3.03, bellyY: 0.42, lowerX: 0.84, sponsonX: 1.25, sponsonFloorY: 1.34, deckY: 1.68, noseY: 1.24,
    glacisZ: 1.67, bowZ: 2.80, rearTopZ: -2.64, rearY: 1.44, rearBellyZ: -2.75, fenderX: 1.30, fenderY: 1.34,
    sponsonFrontZ: 2.40, sponsonRearZ: -2.98,
    // the drawing's wheels: 0.553 m across (0.57 here, within its +-3.5% reading), 0.741 m apart in a bogie, 0.664 m bogie
    // to bogie
    trackXc: 1.09, trackW: 0.42, wheelR: 0.285, wheelY: 0.345, wheelZs: [1.78, 1.04, 0.37, -0.37, -0.995, -1.735],
    bogieZs: [1.41, 0, -1.365],
    sprocket: { z: 2.52, y: 0.74, r: 0.36 }, idler: { z: -2.46, y: 0.62, r: 0.29 }, rollerZs: [1.41, 0, -1.365], rollerY: 1.00,
    rollerR: 0.085,
    ring: { y: 1.68, z: 0.10 },
    turret: {
      front: 1.28, slopeTop: 0.30, rear: -1.86, roof: 0.77,
      // on a visible ring collar (the body's floor at 0.07); undercut flanks (the floor 0.86 out to the crease's 1.00 at
      // 0.22); the wedge nose: one long shallow front rising from the mantlet (1.28, 0.48) to the cupola's front (0.30,
      // the roof), 31% of the turret's length, the cheeks angled in; the bustle overhanging the ring from -0.70 to its
      // back at -1.86 on near-vertical sides, daylight under its floor (0.27)
      sections: Object.freeze([
        sec(-1.86, 0.29, 0.31, 0.72, 0.90, 0.92, 0.78), sec(-1.70, 0.27, 0.29, 0.77, 0.96, 0.98, 0.86),
        sec(-0.86, 0.27, 0.29, 0.77, 0.98, 1.00, 0.86), sec(-0.70, 0.07, 0.22, 0.77, 0.86, 1.00, 0.80),
        sec(0.30, 0.07, 0.22, 0.77, 0.86, 1.00, 0.80), sec(0.70, 0.07, 0.22, 0.652, 0.86, 1.00, 0.84),
        sec(1.00, 0.06, 0.15, 0.565, 0.74, 0.86, 0.62), sec(1.28, 0.05, 0.08, 0.48, 0.56, 0.62, 0.42),
      ]),
    },
    trunnion: { y: 0.43, z: 1.30 }, muzzleHullZ: 3.89,
  }),
});

function* buildX1Steps(P: TankBuilderPort, mark: BernardiniX1Mark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, torus, xform, buildRunningGear, headlight, liftEye } = KIT;
  const slab = orientedSlab;
  const D = DATUMS[mark], a2 = mark === 'x1a2';
  const glacis = Math.atan2(D.deckY - D.noseY, D.bowZ - D.glacisZ);
  const deckY = (z: number): number => {
    // (the X1's low nose flat to 2.30, then rounding down to the nose plate; the X1A2's nose falling from its glacis)
    if (z >= D.bowZ) return a2 ? D.noseY - (z - D.bowZ) * 0.35 : D.noseY - Math.max(0, z - 2.30) * 0.70;
    if (z >= D.glacisZ) return D.noseY + (D.bowZ - z) * (D.deckY - D.noseY) / (D.bowZ - D.glacisZ);
    if (z >= D.rearTopZ) return D.deckY;
    const u = Math.min(1, (D.rearTopZ - z) / (D.rearTopZ - D.sternZ));
    // the X1's rear deck a convex quarter-round down to the stern's lip; the X1A2's falls straight
    return a2 ? D.deckY - u * (D.deckY - D.rearY) : D.rearY + (D.deckY - D.rearY) * Math.sqrt(1 - u * u);
  };
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };
  /** A flat bar of width `w` (in the y-z plane) and thickness `t` (along x) from `a` to `b`, both at x. */
  const flatBar = (slot: string, x: number, a: readonly [number, number], b: readonly [number, number], w: number, t: number): void => {
    const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy) || 1;
    const nz = (-dy / len) * w / 2, ny = (dz / len) * w / 2;
    const c = (p: readonly [number, number], sz: number, sx: number): number[] => [x + sx * t / 2, p[1] + sz * ny, p[0] + sz * nz];
    P.add(slot, slab(c(a, -1, -1), c(b, -1, -1), c(b, -1, 1), c(a, -1, 1), c(a, 1, -1), c(b, 1, -1), c(b, 1, 1), c(a, 1, 1)));
  };

  // ---------------------------------------------------------------- hull --
  const buildX1Hull = (): void => {
    // the lower hull: the rounded transmission cover at the bow (sprocket forward), the belly, the rear plate's slope
    // (the X1's lower rear set back under the overhang's sloping underside; the X1A2's rear plate overhanging, its top
    // rearmost, over a short lower plate)
    const LOWER: readonly (readonly [number, number])[] = a2
      ? [[D.sternZ, D.rearY - 0.04], [D.sternZ + 0.20, D.rearY - 0.46], [D.rearBellyZ, D.bellyY],
        [D.glacisZ, D.bellyY], [D.bowZ - 0.25, D.bellyY], [D.noseZ - 0.10, D.bellyY + 0.25], [D.noseZ, D.noseY - 0.40]]
      : [[D.sternZ, D.rearY - 0.07], [D.sternZ + 0.17, 0.92], [D.rearBellyZ, D.bellyY], [D.glacisZ, D.bellyY],
        [D.bowZ, D.bellyY + 0.02], [2.10, D.bellyY + 0.10], [2.30, D.bellyY + 0.18], [D.noseZ - 0.10, D.bellyY + 0.25],
        [D.noseZ, D.noseY - 0.40]];
    P.add('hull', sectionSolid(LOWER.map(([z, b]) => ({ z, ring: [[-D.lowerX, b], [D.lowerX, b], [D.lowerX, deckY(z)],
      [-D.lowerX, deckY(z)]] as SectionPoint[] }))));
    for (const s of [-1, 1] as const) {
      const ring = (z: number): SectionPoint[] => s > 0
        ? [[D.lowerX - 0.01, D.sponsonFloorY], [D.sponsonX, D.sponsonFloorY], [D.sponsonX, deckY(z) - 0.03],
          [D.sponsonX - 0.04, deckY(z)], [D.lowerX - 0.01, deckY(z)]]
        : [[-D.sponsonX, D.sponsonFloorY], [-(D.lowerX - 0.01), D.sponsonFloorY], [-(D.lowerX - 0.01), deckY(z)],
          [-(D.sponsonX - 0.04), deckY(z)], [-D.sponsonX, deckY(z) - 0.03]];
      const stations = [D.sponsonRearZ, D.rearTopZ, D.glacisZ, D.bowZ, D.sponsonFrontZ]
        .filter((z, i, all) => z >= D.sponsonRearZ && z <= D.sponsonFrontZ && all.indexOf(z) === i).sort((u, v) => u - v);
      P.add('hull', sectionSolid(stations.map((z) => ({ z, ring: ring(z) }))));
      // the fender ledge over the track, the length of the sponson (the X1's standing proud of the track's edge)
      P.add('hullDetail', box(D.fenderX - D.sponsonX + 0.02, 0.025, D.sponsonFrontZ - D.sponsonRearZ - 0.03),
        s * (D.sponsonX + D.fenderX) / 2, D.fenderY - 0.0125, (D.sponsonFrontZ + D.sponsonRearZ) / 2);
      // the dark recess behind the running gear, up to the sponson floor
      const z0 = Math.min(D.wheelZs.at(-1)!, D.idler.z) - D.wheelR, z1 = D.sprocket.z;
      P.add('hullShadow', box(0.02, D.sponsonFloorY - 0.32, z1 - z0), s * (D.lowerX + 0.012), (D.sponsonFloorY + 0.32) / 2,
        (z0 + z1) / 2);
      const xin = s * (D.lowerX - 0.01), xout = s * D.fenderX, t = 0.02;
      if (a2) {
        // the bow mudguard over the sprocket, continuing the sponson's top from its front to the nose
        const z0 = D.sponsonFrontZ, y0 = deckY(z0) - 0.005, z1 = D.noseZ - 0.08, y1 = D.noseY - 0.07;
        P.add('hullDetail', slab([xin, y0 - t, z0], [xout, y0 - t, z0], [xout, y1 - t, z1], [xin, y1 - t, z1],
          [xin, y0, z0], [xout, y0, z0], [xout, y1, z1], [xin, y1, z1]));
      } else {
        // the Stuart's rear hood over each track lane: the deck's quarter-round carried out to the fender's edge, a
        // shell overhanging the idler with its underside in the open; the strut from under it down to the tow point
        const zs = [D.sternZ, -2.42, -2.32, -2.22, -2.12, -2.03, D.rearTopZ];
        const xa = Math.min(xin, xout), xb = Math.max(xin, xout), th = 0.07;
        P.add('hull', sectionSolid(zs.map((z) => ({ z, ring: [[xa, deckY(z) - th], [xb, deckY(z) - th], [xb, deckY(z)],
          [xa, deckY(z)]] as SectionPoint[] }))));
        const sx = s * (D.sponsonX - 0.10);
        bar('hullDark', [sx, deckY(-2.12) - th, -2.12], [sx, 1.00, -2.44], 0.018);
        bar('hullDark', [sx, 1.00, -2.44], [sx, 0.76, -2.38], 0.018);
        P.add('hullDark', torus(0.05, 0.016, 12, 6), sx, 0.72, -2.38, 0, 0, Math.PI / 2);
      }
    }
    P.add('hullDetail', box(D.lowerX * 2, 0.05, 0.06), 0, D.noseY - 0.40, D.noseZ - 0.02);
  };
  buildX1Hull();
  yield 'buildX1Hull';

  // ---------------------------------------------------------------- running gear (VVSS bogies, sprocket forward) --
  const buildX1RunningGear = (): void => {
    buildRunningGear(P, {
      style: 'holes', wheelR: D.wheelR, wheelW: 0.22, wheelY: D.wheelY, xc: D.trackXc, wheelZs: [...D.wheelZs],
      sprocket: { ...D.sprocket }, idler: { ...D.idler }, rollers: D.rollerZs.map((z) => ({ z, y: D.rollerY, r: D.rollerR })),
      rollerR: D.rollerR, trackW: D.trackW, topY: D.rollerY + 0.04, botY: 0.03, contactZF: D.wheelZs[0],
      contactZR: a2 ? D.wheelZs.at(-1) : D.idler.z, paintedEnds: true, coveredTop: false, arms: false, sprocketTeeth: false,
      sprocketStockGeometry: sprocketStock(D.sprocket.r, D.trackW), idlerGeometry: idlerStock(D.idler.r, D.trackW),
    });
    // each VVSS bogie: the bracket casting bolted to the hull, the volute spring standing in it between the wheels, the two
    // A-arms from the bracket down to the wheel hubs (outboard, as the profiles draw them), the return roller on its top
    const r = D.wheelR, top = D.rollerY - D.rollerR - 0.005;
    for (const s of [-1, 1] as const) {
      for (let b = 0; b < D.bogieZs.length; b++) {
        const bz = D.bogieZs[b], zf = D.wheelZs[2 * b], zr = D.wheelZs[2 * b + 1];
        const xi = s * (D.trackXc - 0.10), xo = s * (D.trackXc + 0.04), xm = (xi + xo) / 2;
        // the bracket: narrow between the wheels, widening above them to the roller seat
        const lo = D.wheelY - 0.02, bw = Math.min(0.085, (zf - zr) / 2 - r - 0.02), tw = 0.20;
        P.add('hullRunningGearDetail', slab([xi, lo, bz - bw], [xo, lo, bz - bw], [xo, lo, bz + bw], [xi, lo, bz + bw],
          [xi, top, bz - tw], [xo, top, bz - tw], [xo, top, bz + tw], [xi, top, bz + tw]));
        // its foot on the lower hull side and the roller's saddle
        P.add('hullRunningGearDetail', box(Math.abs(xi) - D.lowerX + 0.02, 0.20, 0.30), s * (D.lowerX + Math.abs(xi)) / 2,
          top - 0.12, bz);
        P.add('hullRunningGearDark', box(0.10, 0.03, 0.12), xm, top - 0.012, D.rollerZs[b]);
        // the volute spring and its seat
        P.add('hullRunningGearDark', cylY(0.068, 0.072, r * 1.05, P.q ? 14 : 10), s * (D.trackXc + 0.06), D.wheelY + 0.04 + r * 0.52, bz);
        for (const k of [0.30, 0.62, 0.94]) {
          P.add('hullRunningGearDetail', cylY(0.078, 0.078, 0.02, P.q ? 14 : 10), s * (D.trackXc + 0.06), D.wheelY + 0.04 + r * 1.05 * k, bz);
        }
        // the A-arms and their bosses: each from its pivot on the bracket to its wheel's hub, outboard of the wheel face
        const xa = s * (D.trackXc + 0.15), pivotY = D.wheelY + r * 1.05;
        for (const [wz, pz] of [[zf, bz + 0.10], [zr, bz - 0.10]] as const) {
          flatBar('hullRunningGearDetail', xa, [pz, pivotY], [wz, D.wheelY], 0.075, 0.045);
          P.add('hullRunningGearDetail', cylX(0.052, 0.07, P.q ? 14 : 10), xa, D.wheelY, wz);
          P.add('hullRunningGearDetail', cylX(0.046, Math.abs(xa - xo) + 0.03, P.q ? 12 : 8), (xa + xo) / 2, pivotY, pz);
        }
        // the cross-tie between the arms' pivots, the bracket's outer face
        flatBar('hullRunningGearDetail', xa, [bz + 0.10, pivotY], [bz - 0.10, pivotY], 0.09, 0.05);
      }
    }
    P.mats.rubber.color.setHex(0x2f312b);
  };
  buildX1RunningGear();
  yield 'buildX1RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildX1HullFittings = (): void => {
    for (const s of [-1, 1] as const) {
      // the headlights in their guards (the X1's on the bow, the X1A2's cluster at the top of the glacis), the lifting
      // eyes, the tail lights on the rear plate
      if (a2) {
        // the twin-lamp cluster in its box on the top of the glacis, the hoop guard over it
        const lz = D.glacisZ + 0.22, ly = deckY(lz), lx = D.sponsonX - 0.30;
        P.add('hullDetail', xform(box(0.30, 0.12, 0.12), 0, 0, 0, glacis, 0, 0), s * lx, ly + 0.05, lz);
        for (const dx of [-0.075, 0.075]) {
          P.add('hullGlass', xform(cylZ(0.042, 0.012, 12), 0, 0, 0, glacis, 0, 0), s * (lx + dx), ly + 0.07, lz + 0.065);
        }
        for (const gx of [lx - 0.18, lx + 0.18]) bar('hullDark', [s * gx, ly + 0.005, lz - 0.05], [s * gx, ly + 0.15, lz + 0.06], 0.012);
        bar('hullDark', [s * (lx - 0.18), ly + 0.15, lz + 0.06], [s * (lx + 0.18), ly + 0.15, lz + 0.06], 0.012);
      } else {
        // the lamp on its post on the low nose, in its guard
        const lz = 1.95, ly = deckY(lz), lx = D.sponsonX - 0.18;
        bar('hullDark', [s * lx, ly, lz - 0.02], [s * lx, ly + 0.10, lz - 0.02], 0.016);
        headlight(P, s * lx, ly + 0.13, lz + 0.02, 0, 0.06);
        for (const gx of [lx - 0.11, lx + 0.10]) bar('hullDark', [s * gx, ly + 0.005, lz - 0.08], [s * gx, ly + 0.20, lz + 0.10], 0.012);
      }
      // (the X1's on its low nose, clear of the gun's sweep)
      const ez = a2 ? D.glacisZ + 0.55 : 2.18, ex = a2 ? D.sponsonX - 0.15 : D.sponsonX - 0.30;
      liftEye(P, 'hullDetail', s * ex, deckY(ez) + 0.012, ez, s * 0.3);
      // (the X1A2's on its overhanging rear plate; the X1's on the hood's lip, its tow eyes on the lower rear)
      const plateZ = (y: number): number => D.sternZ + ((D.rearY - 0.04 - y) / 0.42) * 0.20;
      const [tx, ty, tz, th] = a2 ? [s * (D.lowerX - 0.18), D.rearY - 0.16, plateZ(D.rearY - 0.16) - 0.012, 0.10]
        : [s * (D.sponsonX - 0.12), D.rearY - 0.035, D.sternZ - 0.005, 0.05];
      P.add('hullDark', box(0.14, th, 0.06), tx, ty, tz);
      P.add('hullGlass', box(0.09, th * 0.5, 0.012), tx, ty, tz - 0.035);
      const [ry, rz] = a2 ? [D.rearY - 0.34, plateZ(D.rearY - 0.34) - 0.03] : [0.80, -2.31];
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.45, ry, rz, 0, 0, Math.PI / 2);
    }
    // the pioneer tools on the hull's flanks, each on its clips: the shovel and the crowbar (both marks); the X1A2 also
    // carries the pick and a second bar (Gaydos' X1A2 profile)
    const tools = (s: -1 | 1): void => {
      const x = s * (D.sponsonX + 0.022), clip = (y: number, z: number): void => {
        P.add('hullDark', box(0.045, 0.06, 0.035), s * (D.sponsonX + 0.012), y, z);
      };
      // the shovel: the ash shaft, the D-grip aft, the pointed blade forward
      const sy = a2 ? D.sponsonFloorY + 0.20 : D.sponsonFloorY + (D.deckY - D.sponsonFloorY) * 0.55;
      const sz0 = a2 ? -0.26 : -0.60, sz1 = a2 ? 0.55 : 0.18;
      bar('hullWood', [x, sy, sz0], [x, sy, sz1], 0.017);
      bar('hullDark', [x, sy - 0.05, sz0 - 0.02], [x, sy + 0.05, sz0 - 0.02], 0.012);
      bar('hullDark', [x, sy - 0.05, sz0 - 0.02], [x, sy - 0.03, sz0 + 0.08], 0.010);
      bar('hullDark', [x, sy + 0.05, sz0 - 0.02], [x, sy + 0.03, sz0 + 0.08], 0.010);
      P.add('hullDark', slab([x - 0.008, sy - 0.10, sz1], [x + 0.008, sy - 0.10, sz1], [x + 0.008, sy - 0.10, sz1 + 0.18],
        [x - 0.008, sy - 0.10, sz1 + 0.18], [x - 0.008, sy + 0.10, sz1], [x + 0.008, sy + 0.10, sz1],
        [x + 0.008, sy + 0.02, sz1 + 0.27], [x - 0.008, sy + 0.02, sz1 + 0.27]));
      for (const z of [sz0 + 0.12, sz1 - 0.06]) clip(sy, z);
      // the crowbar, high on the flank
      const by = D.deckY - (a2 ? 0.065 : 0.12), bz0 = a2 ? -1.35 : -1.45, bz1 = a2 ? 0.24 : -0.05;
      bar('hullDark', [x, by, bz0], [x, by, bz1], 0.016);
      for (const z of [bz0 + 0.12, (bz0 + bz1) / 2, bz1 - 0.12]) clip(by, z);
      if (a2) {
        // the pick: its handle low on the flank and the head across it
        const py = D.sponsonFloorY + 0.10, pz0 = -1.34, pz1 = -0.50;
        bar('hullWood', [x, py, pz0], [x, py, pz1], 0.017);
        P.add('hullDark', slab([x - 0.012, py - 0.06, pz1 - 0.03], [x + 0.012, py - 0.06, pz1 - 0.03],
          [x + 0.012, py - 0.06, pz1 + 0.03], [x - 0.012, py - 0.06, pz1 + 0.03], [x - 0.012, py + 0.13, pz1 - 0.01],
          [x + 0.012, py + 0.13, pz1 - 0.01], [x + 0.012, py + 0.13, pz1 + 0.01], [x - 0.012, py + 0.13, pz1 + 0.01]));
        for (const z of [pz0 + 0.10, pz1 - 0.12]) clip(py, z);
      }
    };
    tools(1);
    tools(-1);
    if (a2) {
      // the raised stowage boxes on the rear of each hull side (Gaydos' X1A2 profile)
      for (const s of [-1, 1] as const) {
        P.add('hullDetail', box(0.08, 0.30, 0.62), s * (D.sponsonX + 0.04), D.sponsonFloorY + 0.19, -1.95);
        P.add('hullDark', box(0.012, 0.03, 0.56), s * (D.sponsonX + 0.085), D.sponsonFloorY + 0.30, -1.95);
      }
    }
    if (a2) {
      // the driver's hatch on the glacis, its periscope ahead of it
      const hz = D.glacisZ + 0.40, hx = 0.40;
      P.addCupola('hull', xform(cylY(0.22, 0.23, 0.04, P.q ? 20 : 12), 0, 0, 0, glacis, 0, 0), hx, deckY(hz) + 0.02, hz);
      P.add('hullDetail', xform(box(0.12, 0.06, 0.08), 0, 0, 0, glacis, 0, 0), hx, deckY(hz + 0.32) + 0.03, hz + 0.32);
      P.add('hullGlass', xform(box(0.10, 0.035, 0.008), 0, 0, 0, glacis, 0, 0), hx, deckY(hz + 0.32) + 0.04, hz + 0.365);
      // the transmission access hatch let into the bow plate (the CD-500), and the Army registration on its right
      P.add('hullDetail', xform(box(0.90, 0.012, 0.40), 0, 0, 0, glacis, 0, 0), 0, deckY(D.bowZ - 0.30) + 0.002, D.bowZ - 0.30);
      P.decal('hull', 'stencil', 'EB11-327', 0.28, [-0.46, D.noseY - 0.22, D.noseZ + 0.004], 0);
    } else {
      // the Stuart's two half-round hatches on the deck behind the front plate, their periscopes in the plate's top
      const halfDisc = (r: number, h: number): THREE.BufferGeometry => {
        const pts = Array.from({ length: 13 }, (_, k) => new THREE.Vector2(r * Math.cos((k / 12) * Math.PI), r * Math.sin((k / 12) * Math.PI)));
        const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h, bevelEnabled: false, curveSegments: 1 });
        g.rotateX(-Math.PI / 2);
        return g;
      };
      for (const hx of [0.40, -0.40]) {
        P.addCupola('hull', halfDisc(0.22, 0.04), hx, D.deckY - 0.004, D.glacisZ - 0.07);
        bar('hullDark', [hx - 0.20, D.deckY + 0.02, D.glacisZ - 0.07], [hx + 0.20, D.deckY + 0.02, D.glacisZ - 0.07], 0.012);
        const pz = D.glacisZ + 0.07;
        P.add('hullDetail', xform(box(0.12, 0.06, 0.07), 0, 0, 0, glacis, 0, 0), hx, deckY(pz) + 0.025, pz);
        P.add('hullGlass', xform(box(0.10, 0.035, 0.008), 0, 0, 0, glacis, 0, 0), hx, deckY(pz) + 0.03, pz + 0.035);
      }
    }
    if (a2) {
      // the engine deck's grilles, and the raised engine box aft of them with its seams
      for (const s of [-1, 1] as const) {
        P.add('hullDark', box(0.62, 0.016, 0.80), s * 0.42, D.deckY + 0.008, -1.70);
        for (let k = 0; k < 5; k++) P.addEquipment('hull', box(0.56, 0.012, 0.035), s * 0.42, D.deckY + 0.014, -1.38 - k * 0.16);
        for (const z of [-2.29, D.rearTopZ]) {
          P.add('hullDark', box(0.012, D.deckY - D.sponsonFloorY - 0.04, 0.015), s * (D.sponsonX + 0.004), (D.deckY + D.sponsonFloorY) / 2 - 0.01, z);
        }
      }
      P.add('hullDetail', box(2 * (D.sponsonX - 0.06), 0.035, 0.33), 0, D.deckY + 0.0175, -2.465);
      for (const z of [-2.29, D.rearTopZ + 0.005]) P.add('hullDark', box(2 * (D.sponsonX - 0.06), 0.012, 0.015), 0, D.deckY + 0.036, z);
    } else {
      // the raised engine cover on the deck just behind the turret, louvred, and the rear grilles
      P.add('hull', slab([-0.55, D.deckY - 0.005, -1.62], [0.55, D.deckY - 0.005, -1.62], [0.55, D.deckY - 0.005, -0.98],
        [-0.55, D.deckY - 0.005, -0.98], [-0.50, D.deckY + 0.07, -1.52], [0.50, D.deckY + 0.07, -1.52],
        [0.50, D.deckY + 0.07, -1.10], [-0.50, D.deckY + 0.07, -1.10]));
      for (let k = 0; k < 5; k++) P.addEquipment('hullDark', box(0.88, 0.012, 0.03), 0, D.deckY + 0.076, -1.16 - k * 0.075);
      for (const s of [-1, 1] as const) P.add('hullDark', box(0.50, 0.016, 0.22), s * 0.40, D.deckY + 0.008, -1.80);
    }
  };
  buildX1HullFittings();
  yield 'buildX1HullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, D.ring.y, D.ring.z);
  const T = D.turret, S = T.sections;
  /** The turret's section at z (linear between the authored sections). */
  const sectionAt = (z: number): TurretSection => {
    if (z <= S[0].z) return S[0];
    for (let i = 1; i < S.length; i++) {
      if (z <= S[i].z) {
        const a = S[i - 1], b = S[i], t = (z - a.z) / (b.z - a.z), m = (k: keyof TurretSection): number => a[k] + (b[k] - a[k]) * t;
        return { z, yb: m('yb'), yc: m('yc'), top: m('top'), hwb: m('hwb'), hwc: m('hwc'), hwt: m('hwt') };
      }
    }
    return S[S.length - 1];
  };
  /** The flank's half-width at (z, y). */
  const flankX = (z: number, y: number): number => {
    const c = sectionAt(z);
    if (y <= c.yc) return c.hwb + (c.hwc - c.hwb) * Math.max(0, (y - c.yb) / Math.max(1e-6, c.yc - c.yb));
    return c.hwc + (c.hwt - c.hwc) * Math.min(1, (y - c.yc) / Math.max(1e-6, c.top - c.yc));
  };
  const buildX1Turret = (): void => {
    // the ring collar (the X1A2's standing visibly proud of the deck under its body)
    if (a2) P.add('turret', cylY(0.92, 0.93, 0.075, P.q ? 28 : 18), 0, 0.0325, 0);
    else P.add('turret', cylY(0.82, 0.86, 0.10, P.q ? 26 : 16), 0, -0.04, 0);
    // undercut lower flanks out to the crease, upper flanks leaning in to the roof; the X1's front one slope from the
    // ring to the roof, the X1A2's cheeks angled in to a pointed nose; each bustle overhanging the ring on a sloped floor
    const body = sectionSolid(S.map((c) => ({
      z: c.z,
      ring: [[-c.hwb, c.yb], [c.hwb, c.yb], [c.hwc, c.yc], [c.hwt, c.top], [-c.hwt, c.top], [-c.hwc, c.yc]] as SectionPoint[],
    })));
    body.userData.primaryStockRole = a2 ? 'x1a2-wedge-turret' : 'bt90a1-turret';
    P.add('turret', body);
    for (const s of [-1, 1] as const) {
      const fz = T.slopeTop - (a2 ? 0.25 : 0.02), rz = T.rear + (a2 ? 0.30 : 0.45);
      liftEye(P, 'turretDetail', s * (sectionAt(fz).hwt - 0.10), sectionAt(fz).top + 0.005, fz, s * 0.4);
      liftEye(P, 'turretDetail', s * (sectionAt(rz).hwt - 0.10), sectionAt(rz).top + 0.005, rz, s * 2.7);
    }
  };
  buildX1Turret();
  yield 'buildX1Turret';

  const buildX1TurretFittings = (): void => {
    const roof = T.roof;
    // the commander's cupolas: the X1's domed cupola with its vision slits, near the roof's middle; the X1A2's raised
    // rectangular cupola (right) with three periscope heads, its .50 on a pintle in front and the tall sight rod behind
    const top = (z: number): number => sectionAt(z).top;
    const slope = Math.atan2(top(T.slopeTop) - top(T.front), T.front - T.slopeTop);
    let cupolaTop: number, mgX: number, mgFootY: number, mgZ: number;
    if (a2) {
      const cx = -0.30, cz = -0.16, h = 0.14;
      P.addCupola('turret', box(0.56, h, 0.88), cx, roof + h / 2 - 0.005, cz);
      for (const z of [0.12, -0.16, -0.44]) {
        P.add('turretDetail', box(0.16, 0.09, 0.11), cx, roof + h + 0.04, z);
        P.add('turretGlass', box(0.12, 0.04, 0.008), cx, roof + h + 0.05, z + 0.057);
      }
      // the pintle on the front slope ahead of the cupola
      const pz = 0.44, py = top(pz) - 0.01, post = 0.24;
      P.addEquipment('turretDark', cylY(0.032, 0.042, post, 10), cx, py + post / 2, pz);
      mgX = cx; mgFootY = py + post; mgZ = pz;
      // the sight rod
      P.addEquipment('turretDark', cylY(0.013, 0.016, 0.55, 8), -0.06, roof + 0.275, -0.42);
      P.addEquipment('turretDark', box(0.05, 0.05, 0.07), -0.06, roof + 0.57, -0.42);
      cupolaTop = roof + h + 0.085;
    } else {
      // (a tall cylinder with its vision slots, a low domed cap)
      const cx = -0.12, cz = -0.15, cr = 0.28, wall = 0.22, cap = 0.30, base = top(cz) - 0.01;
      P.addCupola('turret', cylY(cr, cr + 0.012, wall, P.q ? 24 : 14), cx, base + wall / 2, cz);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        P.add('turretGlass', box(0.075, 0.03, 0.012), cx + Math.sin(a) * (cr + 0.003), base + wall * 0.62, cz + Math.cos(a) * (cr + 0.003), 0, a, 0);
      }
      const dome = new THREE.SphereGeometry(cr * 0.99, P.q ? 24 : 14, P.q ? 6 : 4, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, cap, 1);
      P.addCupola('turret', dome, cx, base + wall - 0.004, cz);
      P.add('turretDetail', cylY(0.05, 0.06, 0.04, 10), cx, base + wall + cr * 0.99 * cap + 0.012, cz);
      cupolaTop = base + wall + cr * 0.99 * cap + 0.032;
      // the .50 on the roof aft of the loader's hatch
      mgX = 0.42; mgZ = -0.75; mgFootY = top(mgZ);
    }
    const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.60, elev: 0.03, ring: false,
      shield: false, seed: a2 ? 6651 : 6641, working: true });
    mg.name = a2 ? 'x1a2CommanderM2' : 'x1CommanderM2';
    mg.position.set(mgX, mgFootY, mgZ);
    P.turretG.add(mg);
    // the gunner's periscope on the front slope (left of the X1A2's pintle), the loader's hatch (left), the ventilator
    const gx = a2 ? 0.28 : -0.36, gz = a2 ? 0.50 : 0.32;
    P.addEquipment('turret', xform(box(0.18, 0.12, 0.22), 0, 0, 0, slope, 0, 0), gx, top(gz) + 0.05, gz);
    P.add('turretGlass', xform(box(0.12, 0.05, 0.008), 0, 0, 0, slope, 0, 0), gx, top(gz) + 0.06 - Math.sin(slope) * 0.115,
      gz + 0.115);
    const [hx, hz, hr] = a2 ? [0.36, -0.25, 0.25] : [0.42, -0.30, 0.22];
    P.addCupola('turret', cylY(hr, hr + 0.01, 0.05, P.q ? 20 : 12), hx, top(hz) + 0.015, hz);
    P.add('turretDetail', cylY(hr - 0.03, hr - 0.02, 0.03, P.q ? 20 : 12), hx, top(hz) + 0.055, hz);
    P.addEquipment('turret', cylY(0.12, 0.14, 0.05, 12), 0.10, top(T.rear + 0.55) + 0.015, T.rear + 0.55);
    for (const s of [-1, 1] as const) {
      if (a2) {
        // three dischargers on each front cheek, firing forward and out (Gaydos' profile, the parade photograph)
        for (let k = 0; k < 3; k++) {
          const z = 0.82 - k * 0.13, y = 0.50 + (k % 2) * 0.06, x = flankX(z, y);
          P.addEquipment('turretDark', box(0.05, 0.10, 0.10), s * (x + 0.02), y, z);
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.036, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.45, s * 0.42, 0),
            s * (x + 0.08), y + 0.05, z + 0.06);
        }
        // the six-tube box on each rear flank: a frame standing off the crease, braced to the flank top and bottom, its
        // six tubes upright in front of it
        const z0 = -0.46, z1 = -1.15, y0 = 0.28, y1 = 0.67, xb = sectionAt(-0.8).hwc;
        P.addEquipment('turret', box(0.05, y1 - y0, z0 - z1), s * (xb + 0.025), (y0 + y1) / 2, (z0 + z1) / 2);
        for (const yy of [y0 + 0.015, y1 - 0.015]) {
          const fx = flankX(-0.8, yy) - 0.01;
          P.addEquipment('turret', box(xb + 0.05 - fx, 0.03, z0 - z1), s * (fx + xb + 0.05) / 2, yy, (z0 + z1) / 2);
        }
        for (let k = 0; k < 6; k++) {
          const z = z0 - 0.06 - k * ((z0 - z1 - 0.12) / 5);
          P.addEquipment('turretDark', xform(markSmokeTube(cylZ(0.044, y1 - y0 - 0.06, P.q ? 12 : 8)), 0, 0, 0, -Math.PI / 2, 0, 0),
            s * (xb + 0.095), (y0 + y1) / 2, z);
          P.addEquipment('turretDark', cylY(0.05, 0.05, 0.025, P.q ? 12 : 8), s * (xb + 0.095), y1 - 0.025, z);
          P.addEquipment('turretDark', cylY(0.05, 0.05, 0.025, P.q ? 12 : 8), s * (xb + 0.095), y0 + 0.025, z);
        }
        // the rectangular frame round the tubes' faces
        const xf = s * (xb + 0.152);
        for (const yy of [y0 + 0.012, y1 - 0.012]) P.addEquipment('turret', box(0.03, 0.03, z0 - z1 + 0.03), xf, yy, (z0 + z1) / 2);
        for (const zz of [z0, z1]) P.addEquipment('turret', box(0.03, y1 - y0, 0.03), xf, (y0 + y1) / 2, zz);
      } else {
        // the X1's three dischargers each side on a bracket on the rear flanks, below the rear plate (Gaydos' X1)
        const y = 0.36, fx = flankX(-1.10, y);
        P.addEquipment('turret', box(0.06, 0.08, 0.58), s * (fx + 0.02), y, -1.10);
        for (let k = 0; k < 3; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.035, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.45, 0),
            s * (fx + 0.07), y + 0.06, -0.90 - k * 0.20);
        }
      }
    }
    // the whip, its foot on its base: the X1's at the roof's right rear corner, the X1A2's on a bracket off the turret's
    // upper rear corner
    const whip = xform(xform(cylY(0.012, 0.015, 2.2, 8), 0, 1.10, 0), 0, 0, 0, -0.25, 0, 0);
    if (a2) {
      const wz = T.rear - 0.07, wy = top(T.rear) - 0.03;
      P.addEquipment('turret', box(0.12, 0.06, 0.18), 0.60, wy, T.rear - 0.03);
      P.addEquipment('turret', cylY(0.035, 0.04, 0.06, 10), 0.60, wy + 0.06, wz);
      P.addEquipment('turret', whip, 0.60, wy + 0.09, wz);
    } else {
      const wz = -1.25, wy = top(wz);
      P.addEquipment('turret', cylY(0.035, 0.045, 0.08, 10), -0.50, wy + 0.035, wz);
      P.addEquipment('turret', whip, -0.50, wy + 0.075, wz);
    }
    P.turretG.userData.x1TurretReceipt = { revision: 'x1-266-r5', mark, roofY: roof, front: T.front, rear: T.rear,
      spareLinks: false, flankSmokeBoxes: a2, cupola: a2 ? 'rect-periscope' : 'tall-slit', cupolaTopY: +cupolaTop.toFixed(3),
      ringCollar: a2, smokeTubesPerSide: a2 ? 9 : 3 };
  };
  buildX1TurretFittings();
  yield 'buildX1TurretFittings';

  // ---------------------------------------------------------------- gun --
  const buildX1Gun = (): void => {
    P.gunG.position.set(0, D.trunnion.y, D.trunnion.z);
    const seg = P.q ? 22 : 12;
    // the X1A2's mantlet block on its nose with the coaxial MG above the gun on the left, its thick sleeve over the rear
    // 40% of the barrel; the X1's mantlet housing and short sleeve
    let sleeve0: number;
    const sleeve1 = a2 ? 1.10 : 0.50;
    if (a2) {
      const nose = T.front - D.trunnion.z;
      P.addGunExtra(box(0.58, 0.30, 0.24), 0, 0, nose + 0.08);
      sleeve0 = nose + 0.20;
      P.addGunExtraDark(box(0.07, 0.07, 0.04), 0.17, 0.10, sleeve0 + 0.01);
      P.addGunExtraDark(cylZ(0.018, 0.26, 10), 0.17, 0.10, sleeve0 + 0.13);
    } else {
      // the mantlet housing that is the turret's front point (Gaydos' X1)
      P.addGunExtra(box(0.46, 0.32, 0.26), 0, 0, 0);
      sleeve0 = 0.13;
      P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.17, -0.04, 0.135);
    }
    P.addGunExtra(cylZ(a2 ? 0.10 : 0.13, sleeve1 - sleeve0, seg, a2 ? 0.118 : 0.15), 0, 0, (sleeve0 + sleeve1) / 2);
    if (a2) P.addGunExtra(cylZ(0.072, 0.05, seg, 0.10), 0, 0, sleeve1 + 0.025);
    const len = D.muzzleHullZ - (D.ring.z + D.trunnion.z);
    if (a2) {
      // the Engesa EC-90 (the Cockerill Mk 3): a plain tube and the wide multi-baffle cage brake (five baffles on four
      // longitudinal bars round the bore)
      const r0 = 0.072, r1 = 0.062, brake = 0.32;
      P.add('gun', cylZ(r1, len - brake - sleeve1, seg, r0), 0, 0, (sleeve1 + len - brake) / 2);
      P.add('gunDark', cylZ(0.066, brake, seg), 0, 0, len - brake / 2);
      for (let k = 0; k < 5; k++) P.add('gun', cylZ(0.118, 0.024, seg), 0, 0, len - 0.012 - k * ((brake - 0.024) / 4));
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        P.add('gun', box(0.024, 0.024, brake), Math.cos(a) * 0.104, Math.sin(a) * 0.104, len - brake / 2);
      }
    } else {
      // the 90 mm D-921: a tapering tube and its rounded two-baffle brake (three round plates on straps above and below,
      // the bore dark through both side ports)
      const r0 = 0.075, r1 = 0.058, brake = 0.32;
      P.add('gun', cylZ(r1, len - brake - sleeve1, seg, r0), 0, 0, (sleeve1 + len - brake) / 2);
      P.add('gunDark', cylZ(0.062, brake, seg), 0, 0, len - brake / 2);
      for (const z of [len - 0.025, len - brake / 2, len - brake + 0.025]) P.add('gun', cylZ(0.112, 0.05, seg), 0, 0, z);
      for (const sy of [-1, 1]) P.add('gun', box(0.10, 0.03, brake), 0, sy * 0.095, len - brake / 2);
    }
    muzzleBore(P, { z: len + 0.004, r: 0.046 });
    P.muzzleZ = len;
    P.gunG.userData.x1GunReceipt = { mark, caliberMm: 90, muzzleZ: len };
    P.mats.glass.color.setHex(0x3a463f);
    P.topY = D.ring.y;
  };
  buildX1Gun();
}

export const buildX1Pioneiro = steppedBuilder((P: TankBuilderPort) => buildX1Steps(P, 'x1'));
export const buildX1A2Carcara = steppedBuilder((P: TankBuilderPort) => buildX1Steps(P, 'x1a2'));

/** The datums a fixture holds the builds to (docs/references/tanks/x1a2_carcara.md). */
export const BERNARDINI_X1_DATUMS = DATUMS;
