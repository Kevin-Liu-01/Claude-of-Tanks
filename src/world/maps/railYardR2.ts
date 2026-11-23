// src/world/maps/railYardR2.ts — the rail yard's gantry crane and maintenance shed (the looks lane's r2 sweep, sub-stream
// b-west, 2026-10-16): moved out of railKit.ts (Lane B, parked) to be rebuilt to the r2 standard here. railKit.ts keeps
// them in RAIL_BUILDERS and re-exports them.
import * as THREE from 'three';
import { box, jitterUV, pitchRoofPlane } from '../propGeometry.ts';
import type { GeometryBuckets, StructureDimensions } from './exteriorDetailKit.ts';

/** A part new to the builder's stream: it takes no draws from the shared stream (props.ts jitterBuildingUvs). */
function dressing<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}

type P3 = readonly [number, number, number];

/** A box new to the stream (dressing), centred at (x, y, z). */
function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, uv = 1.0): THREE.BufferGeometry {
  const g = box(w, h, d, uv);
  g.translate(x, y, z);
  return dressing(g);
}

// ------------------------------------------------------------------------------------------------ r2 sections

type Sec = ReadonlyArray<readonly [number, number]>;

/**
 * A straight bar of section `sec` from a to b (the r2 standard: steel and timber as their real sections, not boxes):
 * the section's u runs across the bar square to `up`, its v toward `up`; any simple polygon (an I, an angle, a rail's
 * head and foot), either winding. UVs run round the perimeter (u) and along the bar (v) at `uv` a metre. Non-indexed,
 * flat-shaded, both ends capped (the caps triangulated, so a re-entrant section closes).
 */
function bar(sec: Sec, a: P3, b: P3, up: P3 = [0, 1, 0], uv = 1.0): THREE.BufferGeometry {
  const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = Math.max(1e-3, t.length());
  t.divideScalar(len);
  const u0 = new THREE.Vector3(...up);
  if (Math.abs(u0.dot(t)) > 0.995) u0.set(Math.abs(t.z) < 0.9 ? 0 : 1, 0, Math.abs(t.z) < 0.9 ? 1 : 0);
  const vAx = u0.addScaledVector(t, -u0.dot(t)).normalize();
  const uAx = new THREE.Vector3().crossVectors(vAx, t);
  let ring = sec.map(([x, y]) => [x, y] as [number, number]);
  let area = 0;
  for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length]; area += p[0] * q[1] - q[0] * p[1]; }
  if (area < 0) ring = ring.reverse();
  const n = ring.length;
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [];
  const at = (x: number, y: number, l: number): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]).addScaledVector(uAx, x).addScaledVector(vAx, y).addScaledVector(t, l);
  const put = (p: THREE.Vector3, nn: THREE.Vector3, u: number, v: number): void => { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uvs.push(u, v); };
  let run = 0;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = ring[k], [x1, y1] = ring[(k + 1) % n];
    const el = Math.hypot(x1 - x0, y1 - y0);
    if (el < 1e-6) continue;
    const nn = new THREE.Vector3().addScaledVector(uAx, (y1 - y0) / el).addScaledVector(vAx, -(x1 - x0) / el);
    const p0a = at(x0, y0, 0), p1a = at(x1, y1, 0), p1b = at(x1, y1, len), p0b = at(x0, y0, len);
    const ua = run * uv, ub = (run + el) * uv, vb = len * uv;
    put(p0a, nn, ua, 0); put(p1a, nn, ub, 0); put(p1b, nn, ub, vb);
    put(p0a, nn, ua, 0); put(p1b, nn, ub, vb); put(p0b, nn, ua, vb);
    run += el;
  }
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const back = t.clone().negate();
  for (const [i0, i1, i2] of tris) {
    // ShapeUtils keeps a counter-clockwise contour's winding: the far cap faces +t, the near one -t (reversed)
    const far = [i0, i1, i2], near = [i0, i2, i1];
    for (const k of far) put(at(ring[k][0], ring[k][1], len), t, ring[k][0] * uv, ring[k][1] * uv);
    for (const k of near) put(at(ring[k][0], ring[k][1], 0), back, ring[k][0] * uv, ring[k][1] * uv);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** A rolled I or H section, `w` across its flanges (u), `h` deep (v), flanges `tf`, web `tw`. */
function iSec(w: number, h: number, tf: number, tw: number): Sec {
  const a = w / 2, b = h / 2, c = tw / 2;
  return [[-a, -b], [a, -b], [a, -b + tf], [c, -b + tf], [c, b - tf], [a, b - tf], [a, b], [-a, b], [-a, b - tf], [-c, b - tf], [-c, -b + tf], [-a, -b + tf]];
}
/** An equal angle, legs `l` along -u... from its heel at the section's origin corner, thickness `t` (centred on its box). */
function angleSec(l: number, t: number): Sec {
  const o = l / 2;
  return [[-o, -o], [o, -o], [o, -o + t], [-o + t, -o + t], [-o + t, o], [-o, o]];
}
/** A rectangle `w` x `h` with its four arrises chamfered `c` (a dressed sill, a cast block, a cab's corner). */
function chamferSec(w: number, h: number, c: number): Sec {
  const a = w / 2, b = h / 2;
  return [[a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b], [a, -b + c]];
}
/** A flat-bottom rail on its foot (y 0 at the foot's underside): 14 cm foot, 3 cm web, 7 cm head, 12 cm tall. */
const RAIL_SEC: Sec = [[-0.07, 0], [0.07, 0], [0.07, 0.015], [0.015, 0.03], [0.015, 0.085], [0.035, 0.092], [0.035, 0.12], [-0.035, 0.12], [-0.035, 0.092], [-0.015, 0.085], [-0.015, 0.03], [-0.07, 0.015]];

/** A round bar or pipe of radius r from a to b (`seg` sides, capped). */
function rod(a: P3, b: P3, r: number, seg = 6): THREE.BufferGeometry {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = Math.max(1e-3, d.length());
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/**
 * Rail-served gantry crane: two braced leg towers, a deep bridge girder spanning them, trolley + hook block and a cabin —
 * the yard's skyline landmark (~12.5 m). (The looks lane's r2 sweep, 2026-10-16, sub-stream b-west; the sweep: 99 % of its
 * surface plain boxes, the walkway's handrail standing 2.5 cm over its deck in the air.) Built as a crane is: the legs
 * rolled H columns braced with angles in the A-frames, the crossheads and the bridge a plated box girder with its flange
 * lips and web stiffeners, the runway sills chamfered concrete under flat-bottom rails, the end carriages I beams on
 * their wheels; the trolley's frame on four wheels with its hoist drum; the cab's lower panels and its glazed band
 * between corner posts under the roof; the walkway's chequer deck a pressed channel on brackets off the girder's web, its
 * pipe stanchions standing on it (they stood 2.5 cm over it) and its two pipe rails; the ladder's angle stiles and round
 * rungs. The stream's parts are the same parts in the same order (each takes its draws as the box it replaces did);
 * every part new to the stream is dressing.
 */
export function makeGantry(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const span = 15 + rng() * 2, legH = 9.5 + rng() * 1.2, girderH = 1.35;
  const mk = (geometry: THREE.BufferGeometry): void => { buckets.dark.push(geometry); };
  const top = legH + girderH;
  for (const s of [-1, 1]) { // A-frame leg towers
    const lx = s * span / 2;
    // the legs: rolled H columns, flanges across the A-frame
    for (const dz of [-1.7, 1.7]) mk(bar(iSec(0.42, 0.42, 0.035, 0.025), [lx, 0, dz], [lx, legH, dz], [1, 0, 0]));
    // the cross braces: an X of angles between the legs, heel to heel
    for (const dir of [-1, 1]) mk(bar(angleSec(0.16, 0.016), [lx, legH * 0.175, -dir * 1.7], [lx, legH * 0.725, dir * 1.7], [1, 0, 0]));
    // the runway sill: chamfered concrete under the rail
    const foot = bar([[-0.7, -0.03], [0.7, -0.03], [0.7, 0.4], [0.62, 0.47], [-0.62, 0.47], [-0.7, 0.4]], [lx, 0, -2.3], [lx, 0, 2.3], [0, 1, 0], 0.8);
    buckets.stone.push(jitterUV(foot, rng));
    // the crosshead: a plated box girder joining both legs' heads under the bridge
    mk(bar(iSec(0.62, 0.42, 0.03, 0.46), [lx, legH + 0.14, -2.0], [lx, legH + 0.14, 2.0], [0, 1, 0]));
  }
  // the bridge: a plated box girder, its flanges' lips past its webs, overhanging one side; the runway beam under it
  mk(bar(iSec(1.5, girderH, 0.05, 1.34), [-span / 2 - 1.45, legH + girderH / 2, 0], [span / 2 + 3.05, legH + girderH / 2, 0], [0, 1, 0], 0.7));
  mk(bar(iSec(0.2, 0.14, 0.025, 0.025), [-span / 2 - 1.45, legH - 0.07, 0], [span / 2 + 3.05, legH - 0.07, 0], [0, 1, 0]));
  // trolley + cable + hook block
  const tx = (rng() - 0.5) * span * 0.6;
  // the trolley's frame (on four wheels on the girder's top)
  // (dome-detail-275) 2.2 m long under its hoist house, raised onto the crane rails along the girder's top (12 cm)
  const rh = top + 0.12;
  mk(bar(chamferSec(1.9, 0.6, 0.08), [tx - 1.1, rh + 0.4, 0], [tx + 1.1, rh + 0.4, 0], [0, 1, 0]));
  const drop = 2.2 + rng() * 2.6;
  mk(rod([tx, legH - drop, 0], [tx, legH, 0], 0.025));
  // the hook block: a cast block, its corners dressed
  mk(bar(chamferSec(0.55, 0.75, 0.1), [tx, legH - drop - 0.35, -0.2], [tx, legH - drop - 0.35, 0.2], [0, 1, 0]));
  // operator cabin under the girder: its lower panels (the glazed band, the posts and the back panel are dressing)
  const cx = -span / 2 + 1.4, cy0 = legH - 1.65, cy1 = legH - 0.16, sill = cy0 + 0.75;
  mk(bar(chamferSec(1.6, 1.6, 0.1), [cx, cy0, 1.3], [cx, sill, 1.3], [0, 0, 1]));
  // Twin hangers physically seat the operator cabin under the girder.
  for (const x of [-span / 2 + 0.95, -span / 2 + 1.85]) mk(bar(iSec(0.12, 0.12, 0.012, 0.01), [x, cy1, 0.62], [x, legH + 0.35, 0.62], [0, 0, 1]));
  // the front light (the stream's pane: it takes its draws as the old one did), set in from the posts' faces
  if (buckets.glass) buckets.glass.push(box(1.36, cy1 - sill - 0.08, 0.02).translate(cx, (sill + cy1) / 2, 2.07));
  // (props census #3, lane B 2026-10-14; the judges: "no lattice, no sill beams, bogies or rails, no walkway, ladder or
  // handrails") the crane's members and access, new to the stream
  for (const s of [-1, 1]) {
    const lx = s * span / 2;
    for (const t of [0.33, 0.66]) mk(dressing(bar(angleSec(0.14, 0.014), [lx, legH * t, -1.7 + 0.2], [lx, legH * t, 1.7 - 0.2], [1, 0, 0])));
    // the end carriage: an I beam over the bogies' wheels, the legs' feet on it
    mk(dressing(bar(iSec(0.5, 0.55, 0.04, 0.03), [lx, 1.2 - 0.275, -2.15], [lx, 1.2 - 0.275, 2.15], [1, 0, 0])));
    for (const dz of [-1.7, 1.7]) {
      const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(lx, 0.47 + 0.12 + 0.3, dz);
      mk(dressing(wheel));
      // the wheel's axle box and the bogie's cheeks
      for (const sx of [-1, 1]) mk(dressing(bar(chamferSec(0.36, 0.3, 0.04), [lx + sx * 0.09, 0.89, dz], [lx + sx * 0.15, 0.89, dz], [0, 1, 0])));
    }
    mk(dressing(bar(RAIL_SEC, [lx, 0.47, -2.3], [lx, 0.47, 2.3], [0, 1, 0])));
    // the legs' base plates on the end carriage and their gussets
    for (const dz of [-1.7, 1.7]) mk(dressing(bar(chamferSec(0.6, 0.6, 0.05), [lx, 1.2, dz], [lx, 1.23, dz], [0, 0, 1])));
  }
  // the girder's web stiffeners (flat plates welded to the webs), the walkway's brackets off them
  const wx0 = -span / 2 - 0.2, wx1 = span / 2 + 2.8, wz0 = 0.74, wz1 = 1.5;
  for (let x = -span / 2 + 0.6; x < span / 2 + 2.9; x += 1.4) {
    for (const sz of [-1, 1]) mk(boxAt(0.012, girderH - 0.1, 0.08, x, legH + girderH / 2, sz * 0.71));
    mk(dressing(bar(angleSec(0.07, 0.01), [x, top - 0.7, 0.68], [x, top - 0.1, wz1 - 0.04], [1, 0, 0])));
  }
  // the walkway: a pressed chequer deck (its edges turned down) along the girder's side, the toe plate, pipe stanchions
  // standing on the deck and the two pipe rails
  const deck = (wz1 - wz0) / 2, zc = (wz0 + wz1) / 2;
  mk(dressing(bar([[-deck, -0.08], [-deck + 0.025, -0.08], [-deck + 0.025, -0.025], [deck - 0.025, -0.025], [deck - 0.025, -0.08], [deck, -0.08], [deck, 0], [-deck, 0]],
    [wx0, top - 0.025, zc], [wx1, top - 0.025, zc], [0, 1, 0])));
  mk(boxAt(wx1 - wx0, 0.1, 0.025, (wx0 + wx1) / 2, top + 0.025, wz1 - 0.0125));
  for (let x = wx0 + 0.05; x <= wx1; x += 1.5) mk(dressing(rod([x, top - 0.025, wz1 - 0.035], [x, top + 1.0, wz1 - 0.035], 0.022)));
  for (const h of [0.5, 1.0]) mk(dressing(rod([wx0, top + h, wz1 - 0.035], [wx1, top + h, wz1 - 0.035], 0.026)));
  // the ladder up the leg to the walkway: angle stiles, round rungs
  const lz = -1.7, lxl = -span / 2 - 0.235;
  for (const sz of [-1, 1]) mk(dressing(bar(angleSec(0.065, 0.013), [lxl, 0.47, lz + sz * 0.21], [lxl, legH + 0.2, lz + sz * 0.21], [1, 0, 0])));
  for (let y = 0.77; y < legH + 0.15; y += 0.3) mk(dressing(rod([lxl, y, lz - 0.21], [lxl, y, lz + 0.21], 0.014, 5)));
  // the cab: its glazed band's corner posts, the side lights, the back panel and the sill rail; the roof
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    mk(dressing(bar(chamferSec(0.08, 0.08, 0.015), [cx + sx * 0.76, sill, 1.3 + sz * 0.76], [cx + sx * 0.76, cy1, 1.3 + sz * 0.76], [0, 0, 1])));
  }
  if (buckets.glass) for (const sx of [-1, 1]) buckets.glass.push(boxAt(0.02, cy1 - sill - 0.08, 1.36, cx + sx * 0.77, (sill + cy1) / 2, 1.3));
  mk(dressing(bar(chamferSec(1.52, cy1 - sill, 0.02), [cx, (sill + cy1) / 2, 0.5], [cx, (sill + cy1) / 2, 0.56], [0, 1, 0])));
  mk(dressing(bar(chamferSec(1.7, 0.06, 0.02), [cx, sill + 0.03, 0.46], [cx, sill + 0.03, 2.14], [0, 1, 0])));
  mk(dressing(bar(chamferSec(1.9, 0.08, 0.025), [cx, legH - 0.12, 0.35], [cx, legH - 0.12, 2.25], [0, 1, 0])));
  // the trolley's wheels on the girder's top, its hoist drum, the second fall of rope and the hook block's sheave cheeks
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10);
    w.rotateX(Math.PI / 2);
    w.translate(tx + sx * 0.85, rh + 0.12, sz * 0.62);
    mk(dressing(w));
  }
  mk(dressing(rod([tx - 0.62, rh + 0.85, -0.6], [tx - 0.62, rh + 0.85, 0.6], 0.2, 12)));
  mk(dressing(rod([tx + 0.3, legH - drop, 0], [tx + 0.3, legH, 0], 0.025)));
  for (const sx of [-1, 1]) mk(dressing(bar(chamferSec(0.42, 0.5, 0.05), [tx + sx * 0.3 - 0.03, legH - drop - 0.2, 0], [tx + sx * 0.3 + 0.03, legH - drop - 0.2, 0], [0, 1, 0])));
  const crook = new THREE.TorusGeometry(0.18, 0.05, 6, 10, Math.PI * 1.4);
  crook.rotateZ(Math.PI * 0.8);
  // (its eye up in the block's cheeks: the integrity gate found it 9 cm clear of them)
  crook.translate(tx, legH - drop - 0.84, 0);
  mk(dressing(crook));
  gantryDetail(buckets, mk, { span, legH, girderH, top, rh, tx, drop });
  return { w: span + 5, d: 5.4, h: legH + girderH + 0.8 };
}

/** (dome-detail-275) A part painted one colour (a vertex colour, no draws), new to the stream. */
function painted(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex), n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return dressing(geo);
}

/** (dome-detail-275) A square bar `s` across from a to b (a cage hoop's flat, a strap). */
function flat(a: P3, b: P3, s: number, up: P3 = [0, 1, 0]): THREE.BufferGeometry {
  return dressing(bar([[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]], a, b, up));
}

// the Ironworks' paint (dome-detail-275): the hoist house's oxide red as the works' lattices wear it, its roof's
// weathered grey, the capacity board's cream and its black, the hazard yellow
const OXIDE = 0x6e2f22, OXIDE_ROOF = 0x4a4643, CREAM = 0xd8ceb0, BLACK = 0x1b1a18, HAZARD = 0xc9a227;

/**
 * (dome-detail-275, the Ironworks' gantry: its approved sheets' lattice, landings and paint) What makeGantry's frame
 * lacked, every part new to the stream: the portal's knee braces from the legs up to the bridge's underside (none
 * through the cab), gusset plates at the legs' heads under the crossheads and an X of angles in each leg tower's head
 * panel; the crane rails along the girder's top under the trolley's wheels; the trolley's hoist house in oxide red
 * (a gabled sheet house, its roof, door, side light and louvres) behind its drum; the capacity board on the girder's
 * open face; the hook block's hazard plates; the end carriages' buffers; the cable reel on the far leg tower with its
 * cable down to the ground; the ladder's safety cage. `mk` the steel (dark) bucket.
 */
function gantryDetail(buckets: GeometryBuckets, mk: (g: THREE.BufferGeometry) => void,
  g: { span: number; legH: number; girderH: number; top: number; rh: number; tx: number; drop: number }): void {
  const { span, legH, girderH, top, rh, tx, drop } = g;
  const paint = (geo: THREE.BufferGeometry, hex: number): void => {
    const into = buckets.structureMetal;
    if (into) into.push(painted(geo, hex)); else mk(dressing(geo));
  };
  for (const s of [-1, 1]) {
    const lx = s * span / 2;
    for (const dz of [-1.7, 1.7]) {
      // the knee brace: a rolled I from the leg at four fifths of its height to the bridge's underside, 2.4 m in
      // (none on the cab's side of the near leg: the cab hangs there)
      if (!(s < 0 && dz > 0)) mk(dressing(bar(iSec(0.2, 0.2, 0.018, 0.012), [lx, legH * 0.8, dz], [lx - s * 2.4, legH + 0.04, Math.sign(dz) * 0.62], [0, 1, 0])));
      // the gusset under the crosshead at the leg's head (a plate across the A-frame)
      const zz = Math.sign(dz);
      mk(dressing(bar([[-dz, legH - 0.95], [-dz, legH - 0.02], [-(dz - zz * 0.95), legH - 0.02]], [lx - 0.015, 0, 0], [lx + 0.015, 0, 0], [0, 1, 0])));
    }
    // the head panel's X of angles, from the legs at the X's head up to the crosshead
    for (const dir of [-1, 1]) mk(dressing(bar(angleSec(0.12, 0.014), [lx, legH * 0.725, -dir * 1.6], [lx, legH - 0.1, dir * 1.6], [1, 0, 0])));
    // the end carriage's buffers at both ends, their heads in hazard yellow
    for (const sz of [-1, 1]) {
      mk(dressing(rod([lx, 0.925, sz * 2.15], [lx, 0.925, sz * 2.27], 0.09, 8)));
      paint(rod([lx, 0.925, sz * 2.27], [lx, 0.925, sz * 2.31], 0.16, 10), HAZARD);
    }
  }
  // the crane rails along the girder's top, under the trolley's wheels
  for (const sz of [-1, 1]) mk(dressing(bar(RAIL_SEC, [-span / 2 - 1.3, top, sz * 0.62], [span / 2 + 2.9, top, sz * 0.62], [0, 1, 0])));
  // the trolley's hoist house on its frame's far half: a gabled sheet house in oxide red, its roof's verges and eaves
  // past it, the door at its end, a light on its open side, louvres on the walkway's
  const h0 = rh + 0.7, hx0 = tx - 0.3, hx1 = tx + 1.05;
  paint(bar([[-0.85, 0], [0.85, 0], [0.85, 1.25], [0, 1.6], [-0.85, 1.25]], [hx0, h0, 0], [hx1, h0, 0], [0, 1, 0], 0.6), OXIDE);
  paint(bar([[-1.0, 1.17], [0, 1.6], [1.0, 1.17], [1.0, 1.25], [0, 1.68], [-1.0, 1.25]], [hx0 - 0.12, h0, 0], [hx1 + 0.12, h0, 0], [0, 1, 0], 0.6), OXIDE_ROOF);
  mk(boxAt(0.03, 1.05, 0.7, hx1 + 0.015, h0 + 0.55, 0.3));
  if (buckets.glass) buckets.glass.push(dressing(box(0.6, 0.42, 0.02).translate((hx0 + hx1) / 2, h0 + 0.85, -0.86)));
  for (let k = 0; k < 3; k++) paint(boxAt(0.7, 0.05, 0.05, (hx0 + hx1) / 2, h0 + 0.55 + k * 0.16, 0.86), OXIDE_ROOF);
  // the capacity board on the girder's open face (the walkway's side carries the brackets): cream, its figures black
  const by = legH + girderH / 2, bz = -0.76, bx = (span / 2 + 3.05 - span / 2 - 1.45) / 2;
  paint(boxAt(3.0, 0.8, 0.02, bx, by, bz), CREAM);
  // (u from the board's centre as read from its side, -x; y from its centre)
  const stroke = (u0: number, y0: number, u1: number, y1: number): void => paint(boxAt(Math.max(0.09, u1 - u0), Math.max(0.09, y1 - y0), 0.012, bx - (u0 + u1) / 2, by + (y0 + y1) / 2, bz - 0.014), BLACK);
  // "25 t": a 2, a 5 and a t in strokes
  const digit = (u: number, segs: string): void => {
    const w = 0.28, h = 0.26;
    if (segs.includes('a')) stroke(u - w / 2, h, u + w / 2, h);
    if (segs.includes('d')) stroke(u - w / 2, -h, u + w / 2, -h);
    if (segs.includes('g')) stroke(u - w / 2, 0, u + w / 2, 0);
    if (segs.includes('b')) stroke(u + w / 2, 0, u + w / 2, h);
    if (segs.includes('c')) stroke(u + w / 2, -h, u + w / 2, 0);
    if (segs.includes('e')) stroke(u - w / 2, -h, u - w / 2, 0);
    if (segs.includes('f')) stroke(u - w / 2, 0, u - w / 2, h);
  };
  digit(-0.75, 'abged');
  digit(-0.3, 'afgcd');
  stroke(0.45, -0.26, 0.45, 0.26);
  stroke(0.3, 0.1, 0.62, 0.1);
  // the hook block's hazard plates on both faces, two black chevrons on each
  const hy = legH - drop - 0.35;
  for (const sz of [-1, 1]) {
    paint(boxAt(0.5, 0.62, 0.012, tx, hy, sz * 0.206), HAZARD);
    for (const k of [-1, 1]) {
      const st = box(0.07, 0.42, 0.012);
      st.rotateZ(Math.PI / 4).translate(tx + k * 0.12, hy, sz * 0.214);
      paint(st, BLACK);
    }
  }
  // the cable reel on the far leg tower: a girt between its legs, the axle out to the drum and its flanges, the cable
  // from the drum's foot down into its trough on the ground
  const lx = span / 2, ry = 2.4;
  mk(dressing(bar(angleSec(0.12, 0.014), [lx, ry, -1.5], [lx, ry, 1.5], [1, 0, 0])));
  mk(dressing(rod([lx, ry, 0], [lx + 0.78, ry, 0], 0.06, 8)));
  paint(rod([lx + 0.38, ry, 0], [lx + 0.66, ry, 0], 0.55, 16), OXIDE);
  for (const x of [lx + 0.36, lx + 0.66]) paint(rod([x - 0.02, ry, 0], [x + 0.02, ry, 0], 0.72, 16), OXIDE_ROOF);
  mk(dressing(rod([lx + 0.52, ry - 0.55, 0.0], [lx + 0.9, 0.12, 0.0], 0.035, 6)));
  buckets.stone.push(dressing(bar(chamferSec(0.5, 0.24, 0.03), [lx + 0.9, 0.12, -0.6], [lx + 0.9, 0.12, 0.6], [0, 1, 0], 0.8)));
  // the ladder's safety cage from 2.4 m up to its head: flat hoops off its stiles every 0.9 m and three straps
  const lz = -1.7, lxl = -span / 2 - 0.235, c0 = 2.4, c1 = legH + 0.1;
  for (let y = c0; y <= c1 + 1e-6; y += Math.max(0.6, (c1 - c0) / Math.round((c1 - c0) / 0.9))) {
    mk(flat([lxl, y, lz - 0.21], [lxl - 0.68, y, lz - 0.34], 0.035));
    mk(flat([lxl - 0.68, y, lz - 0.36], [lxl - 0.68, y, lz + 0.36], 0.035));
    mk(flat([lxl, y, lz + 0.21], [lxl - 0.68, y, lz + 0.34], 0.035));
  }
  for (const z of [lz - 0.3, lz, lz + 0.3]) mk(flat([lxl - 0.68, c0, z], [lxl - 0.68, c1, z], 0.03, [1, 0, 0]));
}

// ------------------------------------------------------------------------------------------------ the halls' r2 parts

/**
 * A hall's plinth (the brick halls' r2 parts: the warehouse and the factory, the Ironworks court's donors; the looks lane's
 * r2 sweep, 2026-10-16): a w x d course from y0 up `h`, its top's long arrises splayed 8 cm as a weathered plinth course is
 * (the water thrown off its top), its band y0..y0 + h exactly the box's (the court's support census). One stream part
 * with UVs (it takes the box's draws), centred on the origin in x and z.
 */
export function hallPlinth(w: number, h: number, d: number, y0: number, uv = 0.5): THREE.BufferGeometry {
  const a = w / 2, y1 = y0 + h, s = Math.min(0.08, h * 0.3, a * 0.3);
  return bar([[-a, y0], [a, y0], [a, y1 - s], [a - s, y1], [-a + s, y1], [-a, y1 - s]], [0, 0, -d / 2], [0, 0, d / 2], [0, 1, 0], uv);
}

/**
 * A roof slab `len` (down the slope, x) by `thick` by `depth` (along the ridge, z), its four long arrises eased (a
 * symmetric section: the pitch receipt regresses its vertices), centred on the origin as the box was: one stream part
 * with UVs at `uv` a metre, for the caller to pitch (pitchRoofPlane) and seat.
 */
export function hallSlab(len: number, thick: number, depth: number, uv = 0.35): THREE.BufferGeometry {
  return bar(chamferSec(len, thick, Math.min(0.04, thick * 0.3)), [0, 0, -depth / 2], [0, 0, depth / 2], [0, 1, 0], uv);
}

/** A timber from a to b, its section w (across, square to `up`) x h (toward `up`), its four arrises chamfered c. */
function timber(a: P3, b: P3, w: number, h: number, c = 0.015, up: P3 = [0, 1, 0]): THREE.BufferGeometry {
  return bar(chamferSec(w, h, Math.min(c, 0.3 * Math.min(w, h))), a, b, up, 1.0);
}

/**
 * Open-sided loading shed: platform, posts, mono-pitch roof, crate stacks. (The looks lane's r2 sweep, 2026-10-16,
 * sub-stream b-west; the sweep: 99 % of its surface plain boxes, the owner's "slab on six sticks".) The platform a
 * concrete deck with its arrises bullnosed and a timber rubbing strip along its loading edge, its steps at the ends; the
 * posts dressed timber with chamfered arrises on their steel base plates; the roof a sheet deck on its frame with fascia boards
 * at both eaves and barge boards on the verges; the frame's eave beams, rafters, purlins and knee braces dressed
 * timber; the crates' arrises eased. The stream's parts are the same parts in the same order and take the same
 * draws; the platform keeps its band (the Ironworks court's support census); every part new to the stream is dressing.
 */
export function makeShed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 9 + rng() * 2, d = 6.4, ph = 3.4 + rng() * 0.4;
  const roofAngle = 0.09;
  const roofCenterY = 0.55 + ph + 0.06;
  const roofBottomOffset = 0.07;
  // the platform: its top's arrises bullnosed (8 cm), its band -0.005..0.545 as the box's was (the court's support role)
  const plat = bar([[-d / 2, -0.005], [d / 2, -0.005], [d / 2, 0.465], [d / 2 - 0.03, 0.525], [d / 2 - 0.08, 0.545], [-d / 2 + 0.08, 0.545], [-d / 2 + 0.03, 0.525], [-d / 2, 0.465]],
    [-w / 2, 0, 0], [w / 2, 0, 0], [0, 1, 0], 0.6);
  buckets.stone.push(jitterUV(plat, rng));
  for (const [sx, sz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) {
    const z = sz * (d / 2 - 0.5);
    // Follow the actual mono-pitch underside. Equal-height posts left the
    // uphill row visibly short and drove the downhill row through the roof.
    const roofUndersideY = roofCenterY + Math.tan(roofAngle) * z - roofBottomOffset;
    const postH = roofUndersideY - 0.55;
    // a dressed post, its arrises chamfered
    const post = timber([sx * (w / 2 - 0.5), 0.55, z], [sx * (w / 2 - 0.5), 0.55 + postH, z], 0.22, 0.22, 0.03, [0, 0, 1]);
    buckets.wood.push(jitterUV(post, rng));
  }
  // the roof's sheet deck (a symmetric section: its pitch receipt regresses its vertices)
  const roof = bar(chamferSec(w + 0.8, 0.12, 0.035), [0, 0, -(d + 0.8) / 2], [0, 0, (d + 0.8) / 2], [0, 1, 0], 0.35);
  pitchRoofPlane(roof, 'z', -1, roofAngle, 'skillion');
  roof.translate(0, roofCenterY, 0);
  buckets.roof.push(jitterUV(roof, rng));
  // (props census #4/#13, lane B 2026-10-15; the Ironworks court's donor: "a slab on six sticks") the frame under the
  // roof: an eave beam along each row of posts, rafters down the slope over the posts and purlins across them, knee
  // braces from the end posts, the posts' base plates; the sheet's ribs down the slope, the gutter along the low eave
  // and its downpipe; all new to the stream, none on the platform's band (the court's support)
  const under = (z: number): number => roofCenterY + Math.tan(roofAngle) * z - roofBottomOffset;
  const frame = buckets.wood, steel = buckets.dark;
  const xs = [-(w / 2 - 0.5), 0, w / 2 - 0.5];
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2 - 0.5), y = under(z);
    frame.push(dressing(timber([-(w / 2 - 0.3), y - 0.11, z], [w / 2 - 0.3, y - 0.11, z], 0.18, 0.22, 0.02)));
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.5);
      frame.push(dressing(timber([x, y - 0.95, z], [x - sx * 0.8, y - 0.2, z], 0.09, 0.09, 0.012, [0, 0, 1])));
      frame.push(dressing(timber([x, y - 0.95, z], [x, y - 0.2, z - sz * 0.75], 0.09, 0.09, 0.012, [1, 0, 0])));
    }
    for (const x of xs) steel.push(boxAt(0.36, 0.05, 0.36, x, 0.575, z));
  }
  const za = -(d / 2 - 0.2), zb = d / 2 - 0.2;
  for (const x of xs) frame.push(dressing(timber([x, under(za) - 0.07, za], [x, under(zb) - 0.07, zb], 0.14, 0.12, 0.015)));
  for (const z of [-d / 6, d / 6]) frame.push(dressing(timber([-(w / 2 - 0.3), under(z) - 0.05, z], [w / 2 - 0.3, under(z) - 0.05, z], 0.08, 0.1, 0.012)));
  const top = (z: number): number => roofCenterY + Math.tan(roofAngle) * z + 0.06;
  // (structureConnectivity: the ribs lie in the sheet's plane through the shared orientation helper, as the sheet does)
  for (let x = -(w / 2 + 0.1); x <= w / 2 + 0.1; x += 0.6) {
    const rib = pitchRoofPlane(box(0.05, 0.04, (d + 0.7) / Math.cos(roofAngle), 1.0), 'z', -1, roofAngle, 'skillion');
    buckets.roof.push(dressing(rib.translate(x, top(0), 0)));
  }
  // the fascia boards along both eaves and the barge boards on the verges, in the deck's plane, against its edges
  const e = (d + 0.8) / 2, ec = e * Math.cos(roofAngle), es = e * Math.sin(roofAngle);
  for (const sz of [-1, 1]) {
    const ze = sz * (ec + 0.0125), ye = roofCenterY + sz * es - 0.03;
    frame.push(dressing(bar([[-0.0125, -0.1], [0.0125, -0.1], [0.0125, 0.1], [-0.0125, 0.1]], [-(w / 2 + 0.425), ye, ze], [w / 2 + 0.425, ye, ze])));
  }
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.4125);
    frame.push(dressing(bar([[-0.0125, -0.1], [0.0125, -0.1], [0.0125, 0.1], [-0.0125, 0.1]], [x, roofCenterY - es - 0.03, -ec], [x, roofCenterY + es - 0.03, ec])));
  }
  const low = -(d / 2 + 0.45), gy = top(low) - 0.12;
  steel.push(dressing(new THREE.CylinderGeometry(0.07, 0.07, w + 0.8, 7, 1).rotateZ(Math.PI / 2).translate(0, gy, low)));
  steel.push(dressing(new THREE.CylinderGeometry(0.05, 0.05, gy - 0.55, 6, 1).translate(w / 2 + 0.3, (gy + 0.55) / 2, low)));
  // the platform's loading edge: a timber rubbing strip along each long face; its steps at the ends (dressing)
  for (const sz of [-1, 1]) frame.push(dressing(timber([-w / 2 + 0.1, 0.3, sz * (d / 2 + 0.04)], [w / 2 - 0.1, 0.3, sz * (d / 2 + 0.04)], 0.08, 0.2, 0.012)));
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
    const y1 = 0.18 * (k + 1), x0 = sx * (w / 2 + 0.33 - k * 0.3);
    buckets.stone.push(dressing(bar(chamferSec(0.3, y1 + 0.005, 0.02), [x0, (y1 - 0.005) / 2, -0.8], [x0, (y1 - 0.005) / 2, 0.8], [0, 1, 0], 0.6)));
  }
  // the crates: boarded boxes with their arrises eased
  for (let k = 0, n = 3 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.55 + rng() * 0.5;
    const crate = bar(chamferSec(cs, cs, 0.03), [0, 0, -cs / 2], [0, 0, cs / 2], [0, 1, 0]);
    const yaw = rng() * Math.PI * 0.5, cx = (rng() - 0.5) * (w - 2.2), cz = (rng() - 0.5) * (d - 2.2);
    crate.rotateY(yaw);
    crate.translate(cx, 0.55 + cs / 2, cz);
    buckets.wood.push(jitterUV(crate, rng));
  }
  return { w: w + 0.8, d: d + 0.8, h: ph + 1.0 };
}
