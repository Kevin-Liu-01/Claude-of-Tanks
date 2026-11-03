// First-party procedural turret, roof and glacis parts for the three C1-family Ariete builders (release 268, round
// r268b): misc.ts buildAriete (c1_ariete_preserie) and italy.ts buildArieteMkSteps (c1_ariete_proto_serie1 and the
// c2_ariete_proto upgrade). Authored from the lane's series C1 and C2 photographs (research/<id>/photos: the front view's
// TURMS box with its two windows under the commander's panoramic head, the top view's two big ringed hatches side by
// side at mid-turret, the glacis' perforated intake grille between the lamp clusters, the lower plate's two clevis tow
// hooks, the driver's periscope block on the glacis' right) and the C1 oracle print's roof layout. Every part is authored
// here as primitives; no source mesh, vertex or texture is used.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT } from './kit.ts';
import type { ArieteParts } from './arieteMkParts.ts';

type V3 = readonly [number, number, number];

/** Closed convex solid through the given corners: outward faces by construction (any corner count, any handedness). */
export function convexBlock(points: readonly V3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Mirror a corner list across x (side -1) for a builder that authors the +x side. */
export function sidePoints(points: readonly V3[], side: number): V3[] {
  return points.map(([x, y, z]) => [x * side, y, z] as const);
}

interface Slots {
  readonly body: string;
  readonly detail: string;
  readonly dark: string;
  readonly glass: string;
}
const HULL_SLOTS: Slots = { body: 'hull', detail: 'hullDetail', dark: 'hullDark', glass: 'hullGlass' };

/** The gunner's TURMS sight housing (series C1 front view: an armoured box at the roof's right front, its face two
 * windows side by side, the larger day window and the square thermal one, framed by the two armoured door leaves swung
 * open to either side, a brow over them). Foot on `yRoof` (sunk 15 mm), face toward +z at `z + d / 2`; `k` scales it. */
export function arieteTurmsSight(P: ArieteParts, x: number, yRoof: number, z: number, k = 1, bodyH = 0.27): void {
  const w = 0.34 * k, h = bodyH * k, d = 0.50 * k, plinth = 0.06 * k, y0 = yRoof - 0.015;
  const zf = z + d / 2;
  P.add('turret', KIT.box(w + 0.06 * k, plinth, d + 0.02 * k), x, y0 + plinth / 2, z);                  // armoured plinth
  // body: the top's front edge chamfered back 6 cm, so the face stands under a raked brow (convex block)
  const yb = y0 + plinth - 0.01, yt = yb + h, c = 0.06 * k, hw = w / 2;
  P.add('turret', convexBlock([
    [x - hw, yb, zf], [x + hw, yb, zf], [x - hw, yb, z - d / 2], [x + hw, yb, z - d / 2],
    [x - hw, yt - c, zf], [x + hw, yt - c, zf], [x - hw, yt, zf - c], [x + hw, yt, zf - c],
    [x - hw, yt, z - d / 2], [x + hw, yt, z - d / 2],
  ]));
  const wy = yb + h * 0.45;
  P.add('turretDark', KIT.box(w * 0.86, h * 0.52, 0.02), x, wy, zf + 0.002);                             // window frame recess
  P.add('turretGlass', KIT.box(w * 0.42, h * 0.36, 0.012), x - w * 0.19, wy, zf + 0.010);                // day window
  P.add('turretGlass', KIT.box(w * 0.26, h * 0.36, 0.012), x + w * 0.24, wy, zf + 0.010);                // thermal window
  P.add('turret', KIT.box(0.018 * k, h * 0.56, 0.022 * k), x + w * 0.05, wy, zf + 0.008);                // mullion
  P.add('turret', KIT.box(w * 0.92, 0.022 * k, 0.05 * k), x, wy + h * 0.33, zf + 0.012);                // brow
  for (const s of [-1, 1]) {
    // door leaf hinged on the face's outer edge, swung 70 degrees open (its inner face toward the window)
    // the leaf lies closed across the face from its hinge (toward -s) and is swung round through 270 degrees to lie back
    // along the housing's side (no well in front of the windows)
    const leafW = w * 0.46, ang = s * 1.5 * Math.PI;
    const hx = x + s * (hw - 0.004), hz = zf + 0.004;
    P.add('turret', KIT.xform(KIT.xform(KIT.box(leafW, h * 0.60, 0.018 * k), -s * leafW / 2, 0, 0), 0, 0, 0, 0, ang, 0), hx, wy, hz);
    P.add('turretDark', KIT.box(0.022 * k, h * 0.62, 0.03 * k), hx, wy, hz - 0.006);                     // hinge barrel
  }
  P.add('turretDark', KIT.box(0.012, 0.008, d * 0.8), x, yt + 0.001, z - c / 2);                           // lid split seam
  P.add('turretDetail', KIT.box(w * 0.5, 0.014, 0.03), x, yt + 0.004, z - d * 0.3);                        // lid grab bar
}

/** The commander's SP-T-694 panoramic periscope (series C1: a squat armoured collar on the roof, a short column and a
 * box head with a forward window under a hood, standing just behind and inboard of the TURMS). Foot on `yRoof`. */
export function arietePanoHead(P: ArieteParts, x: number, yRoof: number, z: number, k = 1, ry = 0): void {
  const seg = P.q ? 16 : 10, y0 = yRoof - 0.012;
  P.add('turret', KIT.cylY(0.135 * k, 0.15 * k, 0.05 * k, seg), x, y0 + 0.025 * k, z);                    // armoured collar
  P.add('turretDetail', KIT.cylY(0.085 * k, 0.095 * k, 0.12 * k, seg), x, y0 + 0.11 * k, z);              // column
  const hy = y0 + 0.235 * k;
  const head = convexBlock([
    [-0.10, -0.07, 0.11], [0.10, -0.07, 0.11], [-0.10, -0.07, -0.12], [0.10, -0.07, -0.12],
    [-0.10, 0.05, 0.11], [0.10, 0.05, 0.11], [-0.10, 0.075, 0.06], [0.10, 0.075, 0.06],
    [-0.10, 0.075, -0.12], [0.10, 0.075, -0.12],
  ].map(([a, b, c]) => [a * k, b * k, c * k] as const));
  P.add('turret', head, x, hy, z, 0, ry, 0);
  const face = (gx: number, gy: number, gz: number): THREE.Vector3 => new THREE.Vector3(gx, gy, gz)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, hy, z));
  const g = face(0, -0.01 * k, 0.114 * k);
  P.add('turretDark', KIT.box(0.16 * k, 0.075 * k, 0.012), g.x, g.y, g.z, 0, ry, 0);
  const gl = face(0, -0.01 * k, 0.12 * k);
  P.add('turretGlass', KIT.box(0.13 * k, 0.05 * k, 0.008), gl.x, gl.y, gl.z, 0, ry, 0);
  const hood = face(0, 0.042 * k, 0.13 * k);
  P.add('turret', KIT.box(0.19 * k, 0.016, 0.05 * k), hood.x, hood.y, hood.z, 0, ry, 0);
}

/** A roof hatch (series C1 top view: a broad raised coaming ring round a flat lid, periscopes set into the ring, the
 * lid's hinge block and grab handle). Centre `x, z`, coaming foot on `yRoof` (sunk 15 mm); `periscopes` vision blocks
 * on the ring's forward arc, `hingeSide` +1/-1 puts the hinge outboard. */
export function arieteHatch(P: ArieteParts, x: number, yRoof: number, z: number,
  o: { r?: number; periscopes?: number; hingeSide?: number; arc?: number; arcCentre?: number } = {}): void {
  const r = o.r ?? 0.27, n = o.periscopes ?? 0, hs = o.hingeSide ?? 1, seg = P.q ? 22 : 12;
  const y0 = yRoof - 0.015, ch = 0.075;
  P.add('turret', KIT.cylY(r + 0.07, r + 0.085, ch, seg), x, y0 + ch / 2, z);                              // coaming ring
  P.add('turretDark', KIT.cylY(r + 0.005, r + 0.005, 0.012, seg), x, y0 + ch + 0.002, z);                 // lid gap
  P.add('turret', KIT.cylY(r - 0.012, r, 0.03, seg), x, y0 + ch + 0.012, z);                               // lid
  P.add('turret', KIT.xform(KIT.sph(r * 0.86, seg, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.10, 1]), x, y0 + ch + 0.026, z);
  // hinge block and its strap across the lid, outboard
  P.add('turretDetail', KIT.box(0.08, 0.05, 0.22), x + hs * (r + 0.03), y0 + ch + 0.02, z);
  P.add('turretDetail', KIT.box(r * 0.9, 0.012, 0.05), x + hs * r * 0.5, y0 + ch + 0.032, z);
  // grab handle across the lid, inboard of the hinge (two posts and a bar)
  for (const dz of [-0.07, 0.07]) P.add('turretDetail', KIT.box(0.014, 0.05, 0.014), x - hs * r * 0.35, y0 + ch + 0.045, z + dz);
  P.add('turretDetail', KIT.box(0.016, 0.014, 0.16), x - hs * r * 0.35, y0 + ch + 0.07, z);
  // periscope heads on an arc of the ring (centred forward unless `arcCentre`, radians from +z toward +x), each facing
  // out along its radius
  const arc = o.arc ?? 2.2, c0 = o.arcCentre ?? 0;
  for (let i = 0; i < n; i++) {
    const a = c0 + (n === 1 ? 0 : -arc / 2 + arc * i / (n - 1));
    const px = x + Math.sin(a) * (r + 0.035), pz = z + Math.cos(a) * (r + 0.035);
    P.add('turret', KIT.box(0.12, 0.06, 0.07), px, y0 + ch + 0.012, pz, 0, a, 0);
    const g = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.037);
    P.add('turretGlass', KIT.box(0.10, 0.032, 0.006), px + g.x, y0 + ch + 0.016, pz + g.z, 0, a, 0);
  }
}

/** Low mushroom ventilator on the roof (series C1 roof: the NBC/fume vent behind the hatches). */
export function arieteVentDome(P: ArieteParts, x: number, yRoof: number, z: number): void {
  const seg = P.q ? 14 : 8, y0 = yRoof - 0.012;
  P.add('turretDetail', KIT.cylY(0.075, 0.085, 0.05, seg), x, y0 + 0.025, z);
  P.add('turretDark', KIT.cylY(0.072, 0.072, 0.02, seg), x, y0 + 0.058, z);
  P.add('turretDetail', KIT.cylY(0.11, 0.11, 0.022, seg), x, y0 + 0.077, z);
  P.add('turretDetail', KIT.xform(KIT.sph(0.11, seg, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.28, 1]), x, y0 + 0.086, z);
}

/** The C1/C2 glacis intake grille (series C1 photographs 1 and 4, C2 photograph 5): one raised framed plate across the
 * upper glacis' front between the lamp clusters, perforated with staggered rows of rounded oblong openings. Laid on the
 * glacis plane through (z, y) = (zRear, yRear) -> (zFront, yFront), `halfW` either side of the centreline; the frame
 * stands `frameH` proud of the plane, the perforated plate 1 cm under its top, the openings dark and flush. */
export function arieteGlacisGrille(P: ArieteParts, o: {
  halfW: number; zRear: number; zFront: number; yRear: number; yFront: number; frameH?: number; rows?: number; cols?: number;
}): void {
  const S = HULL_SLOTS;
  const len = Math.hypot(o.zFront - o.zRear, o.yFront - o.yRear);
  const rx = Math.atan2(o.yRear - o.yFront, o.zFront - o.zRear);                                       // pitch: the plane falls toward +z
  const fh = o.frameH ?? 0.035, bar = 0.035;
  const at = (u: number, up: number): THREE.Vector3 => {                                                // u: 0 rear .. 1 front along the plane
    const p = new THREE.Vector3(0, o.yRear + (o.yFront - o.yRear) * u, o.zRear + (o.zFront - o.zRear) * u);
    return p.add(new THREE.Vector3(0, Math.cos(rx), Math.sin(rx)).multiplyScalar(up));
  };
  // perforated plate (buried 15 mm into the glacis, top 1 cm under the frame's)
  const plate = at(0.5, (fh - 0.025) / 2);
  P.add(S.body, KIT.box(o.halfW * 2, fh - 0.01 + 0.015, len), 0, plate.y, plate.z, rx, 0, 0);
  // frame: two side rails, front and rear bars, two dividers
  for (const xs of [-1, 1]) {
    const m = at(0.5, fh / 2 - 0.008);
    P.add(S.body, KIT.box(bar, fh + 0.016, len + 0.01), xs * (o.halfW - bar / 2 + 0.006), m.y, m.z, rx, 0, 0);
  }
  for (const u of [0.0, 1.0]) {
    const m = at(u, fh / 2 - 0.008);
    P.add(S.body, KIT.box(o.halfW * 2 + 0.012, fh + 0.016, bar), 0, m.y, m.z, rx, 0, 0);
  }
  for (const xs of [-1 / 3, 1 / 3]) {
    const m = at(0.5, fh / 2 - 0.006);
    P.add(S.detail, KIT.box(0.022, fh + 0.008, len - 0.02), xs * o.halfW * 2 * 0.5, m.y, m.z, rx, 0, 0);
  }
  // staggered oblong openings, flush dark on the plate's top
  const rows = o.rows ?? 3, cols = o.cols ?? 14, usable = o.halfW * 2 - 2 * bar - 0.04;
  const pitch = usable / cols;
  for (let r = 0; r < rows; r++) {
    const u = 0.18 + 0.64 * (rows === 1 ? 0.5 : r / (rows - 1));
    const m = at(u, fh - 0.01 + 0.001);
    const shift = r % 2 ? pitch / 2 : 0;
    for (let c = 0; c < cols - (r % 2); c++) {
      const xx = -usable / 2 + pitch * (c + 0.5) + shift;
      if (Math.abs(Math.abs(xx) - o.halfW * 2 / 6) < 0.035) continue;                                 // under a divider
      P.add(S.dark, KIT.box(pitch * 0.62, 0.004, len * 0.16), xx, m.y, m.z, rx, 0, 0);
    }
  }
}

/** The driver's periscope block (series C1 photograph 1: three vision blocks in one low armoured housing on the
 * glacis' right, just ahead of the turret), kept low (`h`) where the main gun passes over it at its depression stops. */
export function arieteDriverPeriscopes(P: ArieteParts, x: number, yDeck: number, z: number, o: { h?: number; rx?: number; w?: number } = {}): void {
  const h = o.h ?? 0.03, rx = o.rx ?? 0, w = o.w ?? 0.46, S = HULL_SLOTS;
  P.add(S.body, KIT.box(w, h + 0.012, 0.15), x, yDeck + (h + 0.012) / 2 - 0.012, z, rx, 0, 0);          // armoured housing
  for (const k of [-1, 0, 1]) {
    P.add(S.dark, KIT.box(0.12, h * 0.7, 0.006), x + k * w * 0.31, yDeck + h * 0.48, z + 0.075, rx, 0, 0);
    P.add(S.glass, KIT.box(0.10, h * 0.5, 0.004), x + k * w * 0.31, yDeck + h * 0.48, z + 0.079, rx, 0, 0);
  }
}

/** The driver's hatch lid (a flat round lid in a low ring with its hinge and handle), flush on the deck. */
export function arieteDriverHatch(P: ArieteParts, x: number, yDeck: number, z: number, r = 0.25, rx = 0): void {
  const seg = P.q ? 18 : 10, S = HULL_SLOTS;
  P.add(S.body, KIT.cylY(r + 0.03, r + 0.04, 0.026, seg), x, yDeck + 0.006, z, rx, 0, 0);
  P.add(S.dark, KIT.cylY(r + 0.004, r + 0.004, 0.006, seg), x, yDeck + 0.020, z, rx, 0, 0);
  P.add(S.body, KIT.cylY(r - 0.01, r, 0.016, seg), x, yDeck + 0.024, z, rx, 0, 0);
  P.add(S.detail, KIT.box(0.12, 0.012, 0.022), x, yDeck + 0.035, z, rx, 0, 0);                         // handle
}

/** A lower-plate clevis tow hook (series C1 photograph 4: two tall clevis brackets on the lower front plate, a hook
 * curling down out of each with its pin and keeper chain). Back on the plate at `z` (normal +z), centre `x, y`. */
export function arieteTowClevis(P: ArieteParts, x: number, y: number, z: number, rx = 0): void {
  const S = HULL_SLOTS, seg = P.q ? 12 : 8;
  const put = (slot: string, g: THREE.BufferGeometry, gx: number, gy: number, gz: number): void => {
    P.add(slot, KIT.xform(KIT.xform(g, gx, gy, gz), 0, 0, 0, rx, 0, 0), x, y, z);
  };
  put(S.body, KIT.box(0.15, 0.20, 0.05), 0, 0, 0.015);                                                    // base plate, 1 cm into the plate
  put(S.body, KIT.box(0.115, 0.17, 0.12), 0, -0.01, 0.07);                                                 // clevis body (one block: no well between cheeks)
  put(S.dark, KIT.cylX(0.018, 0.13, seg), 0, 0.03, 0.10);                                                 // pin ends
  put(S.dark, KIT.box(0.06, 0.012, 0.13), 0, -0.095, 0.07);                                               // hook slot shadow
  put(S.detail, KIT.box(0.05, 0.10, 0.05), 0, -0.10, 0.09);                                               // hook shank
  put(S.detail, KIT.xform(KIT.torus(0.035, 0.016, seg, 6), 0, 0, 0, 0, 0, Math.PI / 2), 0, -0.115, 0.10); // hook curl, upright
}

/** Bolt rows on an armour face: `n` heads evenly from `a` to `b` (both on the face), normal `nrm`. */
export function boltRow(P: ArieteParts, slot: string, a: THREE.Vector3, b: THREE.Vector3, n: number, nrm: THREE.Vector3): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, n === 1 ? 0.5 : i / (n - 1)).addScaledVector(nrm, 0.002);
    P.add(slot, KIT.cylY(0.018, 0.021, 0.012, 6), p.x, p.y, p.z, e.x, e.y, e.z);
  }
}

