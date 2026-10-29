// The PL-01's two gun fits and the turret-face housing they pitch in (owner 2026-10-27: "make the pl-01's gun and gun
// assembly properly match with turret and gun housing on it to make it properly look good. can do two varieties for the
// 105 and normal versions"). First-party: Kevin B. Liu (NOTICE.md).
//
// Sources. The 120 follows the OBRUM / BAE Systems mock-up shown at MSPO, Kielce, 2 September 2013 (Commons "Czołg
// lekki PL-01" 01 and 02): a long tapered faceted shroud that grows out of the turret face and covers most of the gun,
// its front end raked down onto a short bare tube, then a long slotted muzzle brake, the coaxial gun hidden in the
// shroud's cheek. The concept descends from the CV90120-T, whose RUAG CTG 120/L50 carries a bore evacuator and a
// pepperpot brake. The 105 follows the same family's 105 mm fits (CV90105 with the Cockerill XC-8 105HP turret,
// Eurosatory 2014): a compact angular gun shield on the trunnion, then a long slim tube in a sleeve with a bore
// evacuator part-way out and a short brake. Both fits share the one trunnion (armor.gunPivot): the turret sets it.
//
// Both rear ends are arcs about the trunnion axis (MANTLET_ARC_M). The fixed housing in front of the turret nose is a
// faceted drum just inside that arc (DRUM_R_M), with side cheeks beside the slot that reach past it (CHEEK_R_M) and a
// flat brow at roof height. Pitching turns the moving rear about its own arc, so at every pitch it neither cuts the
// housing nor opens a window through the joint (pl01GunHousing.selftest.mjs measures both). The old nose cap and the
// 227 cradle tube are retired with the overlap they covered.
import * as THREE from 'three';

type V3 = readonly [number, number, number];
type V2 = readonly [number, number];

export interface PL01GunPort {
  readonly q?: boolean;
  readonly spec: { readonly id: string; readonly armor: { readonly gunPivot: readonly [number, number, number] } };
  muzzleZ?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

/** The moving rear's arc about the trunnion axis (gun-local radius): 3.8 mm outside the drum, so the gun line crosses the
 * joint in under 4 mm (gun-junction-census) and the rear's chords still clear the drum by 3 mm. */
export const PL01_MANTLET_ARC_M = 0.5038;
/** The fixed housing's drum, just inside the moving arc (24 facets: within 0.15 mm of round). */
export const PL01_DRUM_R_M = 0.50;
/** The fixed cheeks' front edge, past the moving arc: the joint is closed from the side. */
export const PL01_CHEEK_R_M = 0.58;
/** The fixed housing's half-width (both fits). */
const HOUSING_HALF_W = 0.33;
/** The angle (degrees, about the trunnion) of the housing's lower edge. */
const HOUSING_LOW_DEG = -24;
const DEG = Math.PI / 180;

interface Fit {
  /** The moving rear's half-width: the slot between the cheeks is 6 mm wider. */
  readonly rootHalfW: number;
  /** Octagon stations [z, bottomHalfW, bottomY, sideHalfW, lowerY, upperY, topHalfW, topY]; the first lies on the arc. Its
   * top (0.172 over the trunnion, 19 deg up the arc) reaches the brow at full elevation, so no slit opens above it. */
  readonly stations: readonly (readonly number[])[];
}

const FIT_120: Fit = {
  rootHalfW: 0.28,
  stations: [
    [0, 0.17, -0.20, 0.28, -0.10, 0.08, 0.19, 0.172],
    [0.78, 0.165, -0.15, 0.275, -0.085, 0.075, 0.185, 0.163],
    [1.70, 0.15, -0.125, 0.245, -0.075, 0.068, 0.165, 0.148],
    [2.70, 0.125, -0.115, 0.21, -0.068, 0.062, 0.14, 0.135],
    [3.38, 0.11, -0.12, 0.185, -0.062, 0.058, 0.12, 0.126],
    [3.56, 0.085, -0.112, 0.148, -0.05, 0.045, 0.095, 0.110],
  ],
};

const FIT_105: Fit = {
  rootHalfW: 0.20,
  stations: [
    [0, 0.14, -0.19, 0.20, -0.09, 0.07, 0.145, 0.172],
    [0.70, 0.14, -0.185, 0.20, -0.088, 0.065, 0.14, 0.16],
    [0.92, 0.115, -0.16, 0.17, -0.075, 0.05, 0.115, 0.13],
  ],
};

/** One station's right-hand chain, bottom to top: the octagon's corners with each chamfer halved and the flank split at
 * the root's own heights (half way to the gun line, on it, half way above), so the root's chords stay within 0.7 mm of
 * the arc. Every station takes the same split fractions, so the rings correspond point for point. */
function chain(s: readonly number[], root: readonly number[]): V2[] {
  const [, bw, yb, sw, yl, yu, tw, yt] = s;
  const rl = root[4], ru = root[5], f = (y: number): number => (y - rl) / (ru - rl);
  return [[bw, yb], [(bw + sw) / 2, (yb + yl) / 2], [sw, yl],
    ...[rl / 2, 0, ru / 2].map((y): V2 => [sw, yl + f(y) * (yu - yl)]),
    [sw, yu], [(sw + tw) / 2, (yu + yt) / 2], [tw, yt]];
}

/** The ring counter-clockwise seen from +Z: up the right-hand chain, down its mirror; z per point from `zAt(y)`. */
function ring(right: readonly V2[], zAt: (y: number) => number): V3[] {
  const left = right.map(([x, y]): V2 => [-x, y]).reverse();
  return [...right, ...left].map(([x, y]) => [x, y, zAt(y)]);
}

/** A triangle `a b c` turned to face `out`. */
function pushFacing(positions: number[], a: V3, b: V3, c: V3, out: V3): void {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) positions.push(...a, ...b, ...c);
  else positions.push(...a, ...c, ...b);
}

function geometryFrom(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** A closed faceted loft through convex rings of one count; each end is fanned from its centroid, or the rear left open
 * for the caller (`openRear`). */
function ringLoft(rings: readonly (readonly V3[])[], positions: number[] = [], openRear = false): THREE.BufferGeometry {
  const centre = (ring: readonly V3[]): V3 => [0, 1, 2].map((k) => ring.reduce((t, p) => t + p[k], 0) / ring.length) as unknown as V3;
  for (let s = 0; s < rings.length - 1; s++) {
    const rear = rings[s], front = rings[s + 1], mid = centre([...rear, ...front]);
    for (let i = 0; i < rear.length; i++) {
      const j = (i + 1) % rear.length, a = rear[i], b = rear[j], c = front[j], d = front[i];
      const face = centre([a, b, c, d]), out: V3 = [face[0] - mid[0], face[1] - mid[1], face[2] - mid[2]];
      pushFacing(positions, a, b, c, out);
      pushFacing(positions, a, c, d, out);
    }
  }
  for (const [ring, sign] of (openRear ? [[rings[rings.length - 1], 1]] : [[rings[0], -1], [rings[rings.length - 1], 1]]) as [readonly V3[], number][]) {
    const c = centre(ring);
    for (let i = 0; i < ring.length; i++) pushFacing(positions, c, ring[i], ring[(i + 1) % ring.length], [0, 0, sign]);
  }
  return geometryFrom(positions);
}

/** The (z, y) profile extruded across x0..x1; the profile may be concave. */
function xPrism(profile: readonly V2[], x0: number, x1: number): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const p = area > 0 ? profile : [...profile].reverse();   // counter-clockwise in (z, y)
  const positions: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const [za, ya] = p[i], [zb, yb] = p[(i + 1) % p.length];
    const out: V3 = [0, -(zb - za), yb - ya];   // the right of a counter-clockwise edge, as (x, y, z)
    const a: V3 = [x0, ya, za], b: V3 = [x0, yb, zb], c: V3 = [x1, yb, zb], d: V3 = [x1, ya, za];
    pushFacing(positions, a, b, c, out);
    pushFacing(positions, a, c, d, out);
  }
  const caps = THREE.ShapeUtils.triangulateShape(p.map(([z, y]) => new THREE.Vector2(z, y)), []);
  for (const [i, j, k] of caps) {
    for (const [x, sign] of [[x0, -1], [x1, 1]] as const) {
      pushFacing(positions, [x, p[i][1], p[i][0]], [x, p[j][1], p[j][0]], [x, p[k][1], p[k][0]], [sign, 0, 0]);
    }
  }
  return geometryFrom(positions);
}

/** A faceted prism along +Z centred on z: `n` sides, a flat facing +X when `flatSide`, radii to its vertices. */
function ngonZ(rFront: number, rRear: number, length: number, n: number, flatSide = true): THREE.BufferGeometry {
  // CylinderGeometry's vertex at theta sits at (r sin theta, -r cos theta) once its axis is turned onto +Z
  const g = new THREE.CylinderGeometry(rFront, rRear, length, n, 1, false, flatSide ? Math.PI / n : 0).rotateX(Math.PI / 2);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

const arcPoint = (r: number, deg: number, zc: number, yc: number): V2 => [zc + r * Math.cos(deg * DEG), yc + r * Math.sin(deg * DEG)];

/**
 * The fixed housing on the turret nose, in turret-local metres: the drum block across the whole housing width and the
 * two cheeks beside the slot the moving rear swings in. `roofY` is the turret roof plane; the brow sits on it.
 */
function addTurretFaceHousing(P: PL01GunPort, fit: Fit, roofY: number): Record<string, number | number[]> {
  const [, yc, zc] = P.spec.armor.gunPivot;
  const browY = roofY + 0.0008;   // a hair over the roof plate it abuts, never coplanar
  const topDeg = Math.asin((browY - yc) / PL01_DRUM_R_M) / DEG;
  const facets = 6, drumFacets = 24, drum: V2[] = [];
  for (let k = 0; k <= drumFacets; k++) drum.push(arcPoint(PL01_DRUM_R_M, HOUSING_LOW_DEG + (topDeg - HOUSING_LOW_DEG) * k / drumFacets, zc, yc));
  // the block reaches back to the roof station's front edge (turret z 1.34) under a flat brow
  const backZ = 1.34, lowY = drum[0][1];
  P.add('turret', xPrism([[backZ, lowY], ...drum, [backZ, browY]], -HOUSING_HALF_W, HOUSING_HALF_W));
  // the cheeks: the band from just inside the drum to CHEEK_R_M, cut by the brow plane, outside the slot
  const slot = fit.rootHalfW + 0.006;
  const cheekTopDeg = Math.asin((browY - yc) / PL01_CHEEK_R_M) / DEG;
  const inner = PL01_DRUM_R_M - 0.02, innerTopDeg = Math.asin((browY - yc) / inner) / DEG;
  const outerArc: V2[] = [], innerArc: V2[] = [];
  for (let k = 0; k <= facets; k++) outerArc.push(arcPoint(PL01_CHEEK_R_M, HOUSING_LOW_DEG + (cheekTopDeg - HOUSING_LOW_DEG) * k / facets, zc, yc));
  for (let k = facets; k >= 0; k--) innerArc.push(arcPoint(inner, HOUSING_LOW_DEG + (innerTopDeg - HOUSING_LOW_DEG) * k / facets, zc, yc));
  const cheek: V2[] = [...outerArc, ...innerArc];
  for (const s of [-1, 1]) P.add('turret', xPrism(cheek, s > 0 ? slot : -HOUSING_HALF_W, s > 0 ? HOUSING_HALF_W : -slot));
  return { drumR: PL01_DRUM_R_M, cheekR: PL01_CHEEK_R_M, halfWidth: HOUSING_HALF_W, slotHalfWidth: Number(slot.toFixed(4)),
    lowDeg: HOUSING_LOW_DEG, topDeg: Number(topDeg.toFixed(3)), browY: Number(browY.toFixed(5)) };
}

/** The moving rear and body: octagon stations, the first laid on the arc about the trunnion. The rear face is closed in
 * level strips between the ring's own heights, each a flat trapezoid on a chord of the arc: a fan from the ring's
 * centroid would sink its middle 2 cm toward the drum. */
function movingHousing(fit: Fit): THREE.BufferGeometry {
  const R = PL01_MANTLET_ARC_M, onArc = (y: number): number => Math.sqrt(R * R - y * y), root = fit.stations[0];
  const rings = fit.stations.map((s, i) => ring(chain(s, root), i === 0 ? onArc : () => s[0]));
  const positions: number[] = [];
  const levels = chain(root, root);
  for (let k = 0; k < levels.length - 1; k++) {
    const [w0, y0] = levels[k], [w1, y1] = levels[k + 1];
    const a: V3 = [-w0, y0, onArc(y0)], b: V3 = [w0, y0, onArc(y0)], c: V3 = [w1, y1, onArc(y1)], d: V3 = [-w1, y1, onArc(y1)];
    pushFacing(positions, a, b, c, [0, 0, -1]);
    pushFacing(positions, a, c, d, [0, 0, -1]);
  }
  return ringLoft(rings, positions, true);
}

function addGun120(P: PL01GunPort): void {
  const seg = P.q ? 24 : 12;
  P.addGunExtra(movingHousing(FIT_120));
  // the coaxial gun's blister on the right cheek, its port forward (the mock-up hides it in the shroud)
  const blister: V3[][] = [
    [[0.25, -0.07, 0.86], [0.315, -0.06, 0.88], [0.315, 0.025, 0.88], [0.25, 0.035, 0.86]],
    [[0.25, -0.07, 1.24], [0.31, -0.06, 1.22], [0.31, 0.02, 1.22], [0.25, 0.03, 1.24]],
  ];
  P.addGunExtra(ringLoft(blister));
  P.addGunExtraDark(new THREE.CylinderGeometry(0.016, 0.016, 0.10, 10).rotateX(Math.PI / 2), 0.285, -0.02, 1.26);
  // four raked slits on each side face, as on the mock-up's shroud
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = 1.02 + i * 0.075, side = 0.275 - (z - 0.78) * (0.275 - 0.245) / (1.70 - 0.78);
    P.addGunExtraDark(new THREE.BoxGeometry(0.006, 0.095, 0.022), s * (side + 0.002), 0.0, z, 0.55, 0, 0);
  }
  // the bare tube from inside the shroud's beak, then the slotted brake (CTG 120 / mock-up)
  P.add('gun', new THREE.CylinderGeometry(0.098, 0.098, 0.42, seg).rotateX(Math.PI / 2), 0, 0, 3.71);
  P.add('gun', ngonZ(0.114, 0.104, 0.04, 12), 0, 0, 3.94);
  P.add('gun', ngonZ(0.114, 0.114, 0.70, 12), 0, 0, 4.31);
  P.add('gun', ngonZ(0.118, 0.118, 0.05, 12), 0, 0, 4.685);
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    P.add('gunDark', new THREE.BoxGeometry(0.008, 0.05, 0.05), s * 0.1125, 0, 4.03 + i * 0.088);
  }
  P.muzzleZ = 4.71;
}

function addGun105(P: PL01GunPort): void {
  P.addGunExtra(movingHousing(FIT_105));
  // the shield's collar onto the sleeve, and the coaxial port and sight window in the shield face
  P.addGunExtra(ngonZ(0.12, 0.13, 0.14, 8), 0, 0, 0.99);
  P.addGunExtraDark(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 10).rotateX(Math.PI / 2), 0.145, 0.02, 0.965);
  P.addGunExtraDark(new THREE.BoxGeometry(0.07, 0.045, 0.012), -0.135, 0.045, 0.921);
  // the sleeve in faceted courses with clamp bands, the bore evacuator, a bare muzzle length and the ported brake
  const sleeve = (z0: number, z1: number, r: number): void => P.add('gun', ngonZ(r, r, z1 - z0, 8), 0, 0, (z0 + z1) / 2);
  const band = (z: number): void => P.add('gunDark', ngonZ(0.101, 0.101, 0.026, 8), 0, 0, z);
  sleeve(0.95, 1.965, 0.096); band(1.50); band(1.965);
  sleeve(1.965, 2.46, 0.096);
  P.add('gun', ngonZ(0.128, 0.10, 0.05, 12), 0, 0, 2.485);
  P.add('gun', ngonZ(0.128, 0.128, 0.40, 12), 0, 0, 2.71);
  P.add('gun', ngonZ(0.10, 0.128, 0.05, 12), 0, 0, 2.935);
  sleeve(2.96, 3.575, 0.094); band(3.575);
  sleeve(3.575, 4.10, 0.092);
  P.add('gun', new THREE.CylinderGeometry(0.086, 0.086, 0.31, P.q ? 24 : 12).rotateX(Math.PI / 2), 0, 0, 4.255);
  P.add('gun', ngonZ(0.102, 0.102, 0.30, 12), 0, 0, 4.56);
  P.add('gun', ngonZ(0.102, 0.09, 0.02, 12), 0, 0, 4.40);
  // three rows of four ports round each side of the brake
  for (const s of [-1, 1]) for (const row of [-1, 0, 1]) for (let i = 0; i < 4; i++) {
    const a = row * 30 * DEG, r = 0.0985 + 0.003;
    const port = new THREE.CylinderGeometry(0.013, 0.013, 0.006, 10).rotateZ(Math.PI / 2).rotateZ(s * a);
    P.add('gunDark', port, s * r * Math.cos(a), r * Math.sin(a), 4.465 + i * 0.062);
  }
  P.muzzleZ = 4.71;
}

/**
 * The PL-01's gun fit on its turret: the fixed housing (turret-owned), the pitching shroud or shield (gunMount) and the
 * recoiling tube (gun). `roofY` is the turret roof plane in turret-local metres. Returns the housing receipt.
 */
export function addPL01GunAssembly(P: PL01GunPort, is105: boolean, roofY: number): Record<string, unknown> {
  const fit = is105 ? FIT_105 : FIT_120;
  const housing = addTurretFaceHousing(P, fit, roofY);
  if (is105) addGun105(P); else addGun120(P);
  return {
    revision: is105 ? 'cv90105-shield-r1' : 'mspo2013-shroud-r1',
    mantletArcM: PL01_MANTLET_ARC_M, ...housing,
    rootHalfWidth: fit.rootHalfW, stationDepths: fit.stations.map((s) => s[0]),
    muzzleZ: 4.71,
  };
}
