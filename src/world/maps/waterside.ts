// src/world/maps/waterside.ts — the strand's driftwood and the moorings' buoys in their members (Lane C, #16 r2,
// 2026-10-14).
//
// The census graded site:driftwood and site:buoy 0: a log was a box, a buoy a sphere in the plaster. Here a log is a
// sea-worn stem — round, tapering to its top, a little bent, its branch stubs worn short, bleached silver-grey — and
// each coast throws up its own: Nordhavn's spruce stems often keep their root plate (the fjord's slides), Saltmere's
// strand mixes pine and oak stems with a ship's squared baulk, tarred dark. A buoy is a mooring float of its coast's
// paint — Breton white with a red band, Nordland orange — turned on a lathe, its lifting eye on top and its chain down
// to the bed. Both are vertex-coloured for the props' baked bucket (the boats' paint: no draw). Neither draws a value
// the old pieces did not: the kits pass the draws the old box's and sphere's UV jitter took (four), and those choose
// the form.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type BG = THREE.BufferGeometry;
type Rgb = readonly [number, number, number];

const _c = new THREE.Color();
function rgb(hex: number): [number, number, number] {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
}
function hash(i: number, salt: number): number {
  let h = Math.imul((i * 7919 + salt) ^ 0x9e3779b9, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Vertex colours by a tone function of the vertex (its position) with a per-vertex grain. */
function paintBy(g: BG, tone: (x: number, y: number, z: number) => Rgb, grain: number, salt: number): BG {
  const p = g.attributes.position, colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = tone(p.getX(i), p.getY(i), p.getZ(i)), shade = 1 - grain * 0.5 + grain * hash(i, salt);
    colors[i * 3] = c[0] * shade; colors[i * 3 + 1] = c[1] * shade; colors[i * 3 + 2] = c[2] * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function merged(parts: BG[]): BG {
  const g = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!g) throw new Error('waterside: pieces do not merge');
  return g;
}

// ------------------------------------------------------------------------------------------------------ driftwood
export type DriftCoast = 'breton' | 'nordland';
export function driftCoastForMap(mapId: string): DriftCoast { return mapId === 'fjord' ? 'nordland' : 'breton'; }

const BLEACHED = rgb(0xa29c90), BLEACHED_DARK = rgb(0x6d675d), HEART = rgb(0x7a6a55), TAR = rgb(0x2b2621), TAR_WORN = rgb(0x4a4037);

/**
 * A driftwood stem along +X (its butt at -X), centred on the origin, `length` long with a butt radius `radius`, from
 * four unit draws `v` (the old log's UV jitter): the form, the bend, the stubs' seed, the tone. The stem's lowest point
 * lies at y = SEAT_Y (the kit seats the axis 9 cm over the sand, so the stem lies 2 cm into it; a root plate reaches
 * deeper). A Nordland stem keeps its root plate two times in three; one Breton piece in four is a squared baulk.
 */
export const DRIFT_SEAT_Y = -0.11;
export function buildDriftLog(coast: DriftCoast, length: number, radius: number, v: readonly number[]): BG {
  const [vForm, vBend, vStub, vTone] = v;
  if (coast === 'breton' && vForm < 0.25) {
    // a ship's baulk: squared, its arrises worn round, tarred and worn back to the wood along its top
    const side = radius * 1.7;
    const g = new THREE.BoxGeometry(length, side, side * (0.8 + vBend * 0.3), 6, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), t = x / length + 0.5;
      p.setY(i, p.getY(i) * (0.92 + 0.08 * Math.sin(t * 9 + vStub * 6)));
    }
    g.computeVertexNormals();
    paintBy(g, (_x, y) => (y > side * 0.3 ? TAR_WORN : TAR), 0.25, (vTone * 1e6) | 0);
    g.computeBoundingBox();
    g.translate(0, DRIFT_SEAT_Y - g.boundingBox!.min.y, 0);
    return g;
  }
  const parts: BG[] = [];
  const segs = 5, sides = 7;
  const trunk = new THREE.CylinderGeometry(radius * (0.45 + vTone * 0.15), radius, length, sides, segs, false);
  trunk.rotateZ(-Math.PI / 2); // its axis along +X, the butt at -X
  const bendY = (vBend - 0.5) * 0.18, bendZ = (vStub - 0.5) * 0.3;
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / length + 0.5, arc = 4 * t * (1 - t);
    // a bow along the stem, the sea's wear flattening the underside it lay on
    p.setY(i, p.getY(i) * (p.getY(i) < 0 ? 0.85 : 1) + bendY * arc * length * 0.12);
    p.setZ(i, p.getZ(i) + bendZ * arc * length * 0.1);
  }
  trunk.computeVertexNormals();
  let trunkMin = Infinity;
  for (let i = 0; i < p.count; i++) trunkMin = Math.min(trunkMin, p.getY(i));
  parts.push(trunk);
  // the branch stubs, worn short, standing up and out (never down into the sand)
  const stubs = 2 + ((vStub * 3) | 0);
  for (let k = 0; k < stubs; k++) {
    const t = 0.25 + 0.6 * hash(k, (vStub * 1e6) | 0), a = (hash(k + 7, (vBend * 1e6) | 0) - 0.5) * 2.2;
    const r = radius * (1 - 0.5 * t) * 0.45, len = radius * (1.2 + 1.6 * hash(k + 3, 17));
    const stub = new THREE.CylinderGeometry(r * 0.55, r, len, 5, 1, false);
    stub.translate(0, len / 2, 0);
    stub.rotateZ(-0.5); // raked toward the top
    stub.rotateX(a);
    stub.translate((t - 0.5) * length, bendY * 4 * t * (1 - t) * length * 0.12, bendZ * 4 * t * (1 - t) * length * 0.1);
    parts.push(stub);
  }
  if (coast === 'nordland' && vForm < 0.67) {
    // the root plate: a flattened, ragged disc across the butt with its spurs, half in the sand
    const plateR = radius * (3.2 + vForm * 2.4);
    const plate = new THREE.CylinderGeometry(radius * 1.3, plateR, radius * 1.4, 10, 1, false);
    const q = plate.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const ang = Math.atan2(q.getZ(i), q.getX(i)), rr = Math.hypot(q.getX(i), q.getZ(i));
      const rag = 0.8 + 0.35 * hash(Math.round((ang + Math.PI) * 10), (vForm * 1e6) | 0);
      if (rr > radius * 1.5) { q.setX(i, q.getX(i) * rag); q.setZ(i, q.getZ(i) * rag); }
    }
    plate.computeVertexNormals();
    plate.rotateZ(Math.PI / 2); // its broad face toward -X, the butt
    plate.translate(-length / 2 - radius * 0.5, 0, 0);
    parts.push(plate);
  }
  const g = merged(parts);
  const salt = (vTone * 1e6) | 0;
  // bleached silver-grey, darker toward the sand and in the root plate's earth, the heartwood showing at the broken top
  paintBy(g, (x, y) => (x > length / 2 - radius * 0.2 ? HEART : y < -radius * 0.4 || x < -length / 2 - radius * 0.2 ? BLEACHED_DARK : BLEACHED), 0.3, salt);
  g.translate(0, DRIFT_SEAT_Y - trunkMin, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------------------- buoys
const BUOY_WHITE = rgb(0xd9d6cf), BUOY_RED = rgb(0xa3221c), BUOY_ORANGE = rgb(0xd0581d), BUOY_GREY = rgb(0x6e6c68),
  CHAIN = rgb(0x3a2e27), WEED = rgb(0x3b4430);

/**
 * A mooring buoy of radius `r` floating at `surface` over (x, z), its chain to the bed `bedY` towards `chainDir` (rad),
 * from four unit draws `v` (the old sphere's UV jitter): the scheme, the chain's run, the float's list, its fill. In
 * world coordinates, vertex-coloured.
 */
export function buildMooringBuoy(coast: DriftCoast, r: number, v: readonly number[], x: number, surface: number, bedY: number, z: number): BG {
  const [vScheme, vRun, vList, vFill] = v;
  const parts: BG[] = [];
  // the float: a squat pear turned on a lathe, riding with 40 % of it under the surface, the weed on its bottom
  const profile = [[0.0001, -0.62], [0.45, -0.55], [0.86, -0.32], [1, -0.05], [1, 0.18], [0.82, 0.45], [0.42, 0.62], [0.0001, 0.66]]
    .map(([a, b]) => new THREE.Vector2(a * r, b * r));
  const body = new THREE.LatheGeometry(profile, 12);
  const red = coast === 'nordland' ? (vScheme < 0.6 ? BUOY_ORANGE : BUOY_RED) : BUOY_RED;
  const banded = coast === 'breton' && vScheme < 0.7;
  parts.push(paintBy(body, (_x, y) => (y < -0.2 * r ? WEED : banded ? (y > 0.05 * r && y < 0.32 * r ? red : BUOY_WHITE) : red), 0.12, 31));
  // the lifting eye on its boss
  const boss = new THREE.CylinderGeometry(r * 0.16, r * 0.2, r * 0.14, 8, 1, false);
  boss.translate(0, r * 0.7, 0);
  parts.push(paintBy(boss, () => BUOY_GREY, 0.2, 32));
  const eye = new THREE.TorusGeometry(r * 0.16, r * 0.035, 4, 10);
  eye.translate(0, r * 0.92, 0);
  parts.push(paintBy(eye, () => BUOY_GREY, 0.2, 33));
  // the chain: links of alternating lie from the float's bottom eye towards the bed, sagging into the water
  const run = 1.2 + vRun * 2.2, drop = Math.max(0.3, surface - 0.35 * r - bedY);
  const dirX = Math.cos(vRun * Math.PI * 2), dirZ = Math.sin(vRun * Math.PI * 2);
  const links = Math.min(22, Math.ceil(Math.hypot(run, drop) / 0.11));
  const start = new THREE.Vector3(0, -0.6 * r, 0);
  for (let k = 0; k < links; k++) {
    const t0 = k / links, t1 = (k + 1) / links;
    // a catenary-ish fall: steep under the float, flattening toward the bed
    const pt = (t: number) => new THREE.Vector3(dirX * run * t * t, start.y - drop * (1 - (1 - t) * (1 - t)), dirZ * run * t * t);
    const a = pt(t0), b = pt(t1), d = b.clone().sub(a), len = d.length();
    const link = new THREE.BoxGeometry(0.035, len * 1.15, k % 2 ? 0.012 : 0.05);
    link.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    link.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(paintBy(link, () => CHAIN, 0.3, 40 + k));
  }
  const g = merged(parts);
  g.rotateX((vList - 0.5) * 0.12);
  g.rotateZ((vFill - 0.5) * 0.12);
  g.translate(x, surface + (0.18 - vFill * 0.06) * r, z);
  g.userData.buoy = true;
  return g;
}
