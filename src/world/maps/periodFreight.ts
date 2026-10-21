// src/world/maps/periodFreight.ts — (the map-revival lane, 2026-10-09; gauntlet waves 319/320 on Ironworks: "modern ISO
// shipping containers sit in a March 1945 ironworks") the freight a container row's seat holds on a battlefield set
// before the ISO box. Sea-Land's first transatlantic box service reached Rotterdam and Bremen in May 1966, and ISO 668
// fixed the box in 1968, so a map whose setting year (periodClutterKit.ts MAP_SETTING_YEAR, the one shared table) comes
// before 1966 stacks its yard's goods the way its period did: under railway tarpaulins lashed down over timber bearers,
// in wooden crates, as rolled steel billets on dunnage at a works, as sawn timber in stickered stacks.
//
// The row keeps the container row's seats and spends exactly its shared draws (railKit.ts makeContainerRow: the count,
// each seat's livery, yaw, offset and 24 paint draws, the stack roll and the stacked box's four draws and paint, the
// gap), and every seat emits one hidden core per box the row would have stood there (the body's four UV-jitter draws:
// uvJitter 'consume'), so every later placement keeps its seat. Everything else is new to the stream (uvJitter 'none')
// and draws from the seat's own fork. The core is the stack's movement solid (structureCollision.ts takes the baked
// bucket as a wall; the timber and canvas dressing only stops rounds), so a tank meets the stack where it stands.
import * as THREE from 'three';
import { box, gablePrism } from '../propGeometry.ts';
import { MAP_SETTING_YEAR } from './periodClutterKit.ts';
import type { GeometryBuckets } from './exteriorDetailKit.ts';

type Rng = () => number;

/** The year the ISO box came into a European yard (Sea-Land, Rotterdam and Bremen, May 1966). */
export const ISO_CONTAINER_INTRODUCED = 1966;

/**
 * True on a battlefield whose setting year comes before the ISO box: its container rows draw period freight. (Cinder
 * Junction, 1962, is one of the owner's protected maps; both critics of gauntlet wave 333 named the lettered ISO boxes in
 * its goods yard as modern, and the owner approved its period freight on 2026-10-09.)
 */
export function precedesIsoContainer(mapId: string | null | undefined): boolean {
  if (!mapId) return false;
  const year = MAP_SETTING_YEAR[mapId];
  return year !== undefined && year < ISO_CONTAINER_INTRODUCED;
}

type FreightForm = 'tarp' | 'crates' | 'billets' | 'lumber';

/**
 * Each pre-container battlefield's yard goods: Ironworks' works yard (the Völklingen works, March 1945) half rolled
 * steel waiting on its dunnage, the rest under the Reichsbahn's tarred sheets and in crates; Cinder Junction (1962) the
 * goods shed's crates and sheeted wagonloads with a timber stack; the Virgin Lands' depot (1958) sheeted stacks and the
 * sawn timber the new state farms were built from.
 */
export const FREIGHT_MIX: Readonly<Record<string, readonly (readonly [FreightForm, number])[]>> = Object.freeze({
  foundry: [['billets', 0.4], ['tarp', 0.38], ['crates', 0.22]],
  railyard: [['tarp', 0.45], ['crates', 0.35], ['lumber', 0.2]],
  steppe: [['tarp', 0.4], ['lumber', 0.35], ['crates', 0.25]],
});
const DEFAULT_MIX: readonly (readonly [FreightForm, number])[] = [['tarp', 0.55], ['crates', 0.45]];

/**
 * True where the rail kit's container row (railKit.ts makeContainerRow) draws period freight: a pre-container
 * battlefield with its own mix. (2026-10-10, the freight landing's gate: Titan Gorge and Skybridge, both 1965, have
 * container-row lots their regional kits rebuild — a trailer, a house — over the rail kit's base row, whose bounds the
 * kit fills; freight stacks there moved the kits' records. Without a mix of its own a map keeps the base row its kit
 * replaces, as before.)
 */
export function drawsPeriodFreight(mapId: string | null | undefined): boolean {
  return precedesIsoContainer(mapId) && Object.prototype.hasOwnProperty.call(FREIGHT_MIX, mapId as string);
}

/** The seat's form from the map's mix and one draw of the seat's own stream. */
export function freightForm(mapId: string, u: number): FreightForm {
  const mix = FREIGHT_MIX[mapId] ?? DEFAULT_MIX;
  let acc = 0;
  for (const [form, share] of mix) { acc += share; if (u < acc) return form; }
  return mix[mix.length - 1][0];
}

/** The seat's footprint (the ISO twenty-foot box it stands in for): across the row, along the row's depth. */
const SEAT_W = 2.44, SEAT_L = 6.1;
/** Timber bearers under every stack: their height. */
const BEARER_H = 0.14;

/** Tarred railway sheets and faded canvas (sRGB). The works and the junction: the railways' black and grey sheets. */
const TARP_TONES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  rail: [0x2f2e2b, 0x3a3936, 0x45443e, 0x4d5047, 0x5b5a4c],
  canvas: [0x6b6548, 0x7a6f52, 0x5e6149, 0x8a7d5c, 0x4f5242],
});
const ROPE = 0x6e5f45, CORE = 0x26221d;
/** Rolled steel in the open: mill scale blue-black on the sides, the tops gone to rust (sRGB, over the metal print). */
const BILLET_RUST = [0x7a5038, 0x6e4a36, 0x845a3e, 0x66463a], BILLET_SCALE = [0x4e4440, 0x5a4a40, 0x463e3a, 0x60503f];
/** Weathered timber (multiplies the structure wood's oak print): grey bearers, crate boards pale to dark, fresh deal. */
const TIMBER_GREY = 0x8d8578, CRATE_TONES = [0x8f826e, 0x7f7464, 0x9b8b72, 0x857560, 0x70685c, 0xa08c6e], DEAL = 0xc9b38a;

const _c = new THREE.Color();
function paint(geo: THREE.BufferGeometry, rng: Rng, hex: number, jitter = 0.06): THREE.BufferGeometry {
  _c.set(hex);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    col[i * 3] = Math.min(1, _c.r * v); col[i * 3 + 1] = Math.min(1, _c.g * v); col[i * 3 + 2] = Math.min(1, _c.b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
/** A part new to the stream (props.ts jitterBuildingUvs leaves it alone). */
function fresh<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}
function pick<T>(list: readonly T[], u: number): T {
  return list[Math.min(list.length - 1, (u * list.length) | 0)];
}

// ------------------------------------------------------------------------------------------------- the dressing
// (the r2 sweep, 2026-10-16: the rows graded box share 0.92-0.97, the crates' upper courses and the sheets' lashings
// floating) The stacks' solids — every part above, its size, its paint and its draws — are the movement and shot solids
// structureCollision.ts derives, so they stay exactly as they were. What is new is dressing (userData.noCollision: the
// derivation skips it) that takes no draw from the seat's stream: the crates' corner posts between their battens, the
// billets' sheared ends, the deal's sawn ends, the dunnage under every upper course, the sheet folded over onto its top
// and the hitch at each lashing's foot. A corner post, an end, a fold shares its corners with the solids it dresses, so
// the merged bucket draws them as one piece of joinery.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
/** Triangles in one geometry: flat normals, a planar uv at the stack's print density, one colour (no draw). */
class Dressing {
  private pos: number[] = [];
  /** a triangle wound to face `out` */
  tri(a: readonly number[], b: readonly number[], c: readonly number[], out: readonly number[]): void {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    if (_n.x * out[0] + _n.y * out[1] + _n.z * out[2] >= 0) this.pos.push(...a, ...b, ...c);
    else this.pos.push(...a, ...c, ...b);
  }
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], out: readonly number[]): void {
    this.tri(a, b, c, out); this.tri(a, c, d, out);
  }
  /** an axis-aligned block's five faces that show (no underside) */
  quadBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1);
    const c = (i: number, j: number, k: number) => [i ? hx : lx, j ? y1 : y0, k ? z1 : z0];
    this.quad(c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1), [0, 1, 0]);
    this.quad(c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0), [0, 0, -1]);
    this.quad(c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1), [0, 0, 1]);
    this.quad(c(0, 0, 0), c(0, 0, 1), c(0, 1, 1), c(0, 1, 0), [-1, 0, 0]);
    this.quad(c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0), [1, 0, 0]);
  }
  get empty(): boolean { return this.pos.length === 0; }
  /** the dressing as a part: new to the stream and to the collision */
  geometry(hex: number, k = 1): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    const n = this.pos.length / 3, uv = new Float32Array(n * 2), col = new Float32Array(n * 3), nor = g.attributes.normal;
    _c.set(hex);
    for (let i = 0; i < n; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      uv[i * 2] = (ax >= ay && ax >= az ? z : x) * 0.55; uv[i * 2 + 1] = (ay > ax && ay > az ? z : y) * 0.55;
      col[i * 3] = Math.min(1, _c.r * k); col[i * 3 + 1] = Math.min(1, _c.g * k); col[i * 3 + 2] = Math.min(1, _c.b * k);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.uvJitter = 'none';
    g.userData.noCollision = true;
    return g;
  }
}

/**
 * A bar's two ends crowned `crown` out from their faces (a billet's sheared end, a deal board's sawn end): each end face's
 * four corners to a point on its axis, the bar (`sx` x `sy` x `sz`, centred at `c`, its length along z) unchanged.
 */
function crownEnds(d: Dressing, c: readonly number[], sx: number, sy: number, sz: number, crown: number): void {
  const hx = sx / 2, hy = sy / 2;
  for (const e of [-1, 1]) {
    const z = c[2] + e * sz / 2, tip = [c[0], c[1], z + e * crown];
    const q = [[c[0] - hx, c[1] - hy, z], [c[0] + hx, c[1] - hy, z], [c[0] + hx, c[1] + hy, z], [c[0] - hx, c[1] + hy, z]];
    for (let k = 0; k < 4; k++) d.tri(q[k], q[(k + 1) % 4], tip, [0, 0, e]);
  }
}

/**
 * A crate's four corner posts between its battens (the case's corner strips, 7 cm a leg, as proud as its battens), in its
 * own frame (its foot at y = 0, its corners at ±hx, ±hz; the battens' bands [0.02, 0.10] and [hh - 0.10, hh - 0.02]):
 * each post's outer corner on the battens' corners, and at one corner its foot run down to the case's own corner.
 */
function cornerPosts(d: Dressing, hx: number, hz: number, hh: number): void {
  const t = 0.01, a = Math.min(0.07, hx * 0.4, hz * 0.4);
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const P = [[sx * hx, sz * (hz - a)], [sx * (hx + t), sz * (hz - a)], [sx * (hx + t), sz * (hz + t)], [sx * (hx - a), sz * (hz + t)],
      [sx * (hx - a), sz * hz], [sx * hx, sz * hz]];
    const at = (k: number, y: number) => [P[k][0], y, P[k][1]];
    const outs = [[0, 0, -sz], [sx, 0, 0], [0, 0, sz], [-sx, 0, 0]];
    // (its two outer faces; the legs' 1 cm ends only at its foot)
    const piece = (y0: number, y1: number, from = 1, to = 3) => {
      for (let k = from; k < to; k++) d.quad(at(k, y0), at(k + 1, y0), at(k + 1, y1), at(k, y1), outs[k]);
    };
    piece(0.1, hh - 0.1);
    if (sx === 1 && sz === 1) {
      // its foot under the lower batten, its sole on the case's corner
      piece(0, 0.02, 0, 4);
      d.quad(at(0, 0), at(1, 0), at(2, 0), at(5, 0), [0, -1, 0]);
      d.quad(at(5, 0), at(2, 0), at(3, 0), at(4, 0), [0, -1, 0]);
    }
  }
}

/** Turn a frame's dressing points about y and move them (as the stack's parts are posed). */
function posed(g: THREE.BufferGeometry, yaw: number, x: number, y: number, z: number): THREE.BufferGeometry {
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

/** One stack's parts by bucket, in the seat's local frame (x across, z along, y up from the ground). */
interface StackParts { baked: THREE.BufferGeometry[]; structureWood: THREE.BufferGeometry[]; structureMetal: THREE.BufferGeometry[] }

/**
 * The hidden movement cores: the stack's solid inset inside every visible part, from the ground (the bearers' level reads
 * as the shadow under the stack, as the container's floor did). The base core takes the box's four UV draws ('consume')
 * and is the court support's foot (foundryServiceSupport.ts 'freight'); a stacked seat's second core, for the stacked
 * box's four draws, stands wholly inside the first.
 */
function cores(parts: StackParts, local: Rng, w: number, h: number, l: number, upper: boolean): void {
  const g = paint(box(w, h, l, 0.5), local, CORE, 0.04);
  g.translate(0, h / 2, 0);
  g.userData.uvJitter = 'consume';
  g.userData.structureSupport = { part: 'freight-core' };
  parts.baked.push(g);
  if (!upper) return;
  const inner = paint(box(w * 0.8, h * 0.8, l * 0.8, 0.5), local, CORE, 0.04);
  inner.translate(0, h / 2, 0);
  inner.userData.uvJitter = 'consume';
  parts.baked.push(inner);
}

/** Bearers across the seat under a stack of the given length: weathered squared timbers. */
function bearers(parts: StackParts, local: Rng, w: number, l: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const z = -l / 2 + 0.35 + (l - 0.7) * (count === 1 ? 0.5 : i / (count - 1)) + (local() - 0.5) * 0.12;
    const len = w + 0.16 + local() * 0.1;
    const g = paint(box(len, BEARER_H, 0.16, 0.55), local, TIMBER_GREY, 0.08);
    const yaw = (local() - 0.5) * 0.06, dx = (local() - 0.5) * 0.06;
    g.rotateY(yaw);
    g.translate(dx, BEARER_H / 2, z);
    parts.structureWood.push(fresh(g));
    // its sawn ends, a hair proud (in its own pose: turned and moved as the bearer was)
    const ends = new Dressing(), c = Math.cos(yaw), sn = Math.sin(yaw);
    const pose = (p: readonly number[]) => [p[0] * c + p[2] * sn + dx, p[1] + BEARER_H / 2, -p[0] * sn + p[2] * c + z];
    for (const e of [-1, 1]) {
      const x = e * len / 2, q = [[x, -BEARER_H / 2, -0.08], [x, -BEARER_H / 2, 0.08], [x, BEARER_H / 2, 0.08], [x, BEARER_H / 2, -0.08]].map(pose);
      const tip = pose([x + e * 0.008, 0, 0]), out = [e * c, 0, -e * sn];
      for (let k = 0; k < 4; k++) ends.tri(q[k], q[(k + 1) % 4], tip, out);
    }
    parts.structureWood.push(ends.geometry(0x7a7266));
  }
}

/** A box part's distinct corners (to the millimetre). */
function boxCorners(g: THREE.BufferGeometry): number[][] {
  const p = g.attributes.position, seen = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1000)},${Math.round(p.getY(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
    if (!seen.has(key)) seen.set(key, [p.getX(i), p.getY(i), p.getZ(i)]);
  }
  return [...seen.values()];
}
/** The four corners of a box's end: the four greatest along `key`, ordered by `order` (ascending). */
function endOf(list: number[][], key: (p: number[]) => number, order: (p: number[]) => number): number[][] {
  return [...list].sort((a, b) => key(b) - key(a)).slice(0, 4).sort((a, b) => order(a) - order(b));
}

/**
 * A sheeted stack: crates or sacks under a tarred sheet drawn over a ridge spar, the sheet's skirt flaring to the
 * bearers, lashed across the top and down both sides to the bearers' ends, its corners folded.
 */
function tarpStack(parts: StackParts, local: Rng, mapId: string, upper: boolean): void {
  const w = SEAT_W - 0.08 - local() * 0.12, l = SEAT_L - 0.25 - local() * 0.5;
  const h = 1.75 + local() * 0.45 + (upper ? 0.6 + local() * 0.35 : 0);
  const ridge = 0.16 + local() * 0.16;
  const tones = mapId === 'steppe' ? TARP_TONES.canvas : TARP_TONES.rail;
  const tone = pick(tones, local());
  bearers(parts, local, w, l, 3);
  cores(parts, local, 0.92 * (w + 0.06) - 0.08, BEARER_H + h - 0.06, 0.92 * (l + 0.06) - 0.08, upper);
  // the sheet: a square frustum (wider at the skirt), scaled to the stack's plan
  const body = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.94, Math.SQRT1_2, h + BEARER_H - 0.04, 4, 4, true);
  body.rotateY(Math.PI / 4);
  body.scale(w + 0.06, 1, l + 0.06);
  body.translate(0, (h + BEARER_H - 0.04) / 2 + 0.04, 0);
  // the sheet is slack between the lashings and pulled in over the load's courses: each inner ring drawn in by its own
  // amount, a corner here and there lower or prouder (the load under it is not a box); the skirt ring stays at the bearers
  const pos = body.attributes.position as THREE.BufferAttribute;
  const sheetTop = h + BEARER_H, ringPull = [0, 0.97 + local() * 0.02, 0.975 + local() * 0.02, 0.965 + local() * 0.025, 1];
  // (one jitter per ring and corner: the seam's two copies of a corner move together, so the sheet never opens)
  const jitter = Array.from({ length: 20 }, () => [1 + (local() - 0.5) * 0.02, (local() - 0.5) * 0.06]);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ring = Math.round((1 - (y - 0.04) / (sheetTop - 0.04)) * 4);
    if (ring <= 0 || ring >= 4) continue;
    const [kj, yj] = jitter[ring * 4 + (pos.getX(i) > 0 ? 1 : 0) + (pos.getZ(i) > 0 ? 2 : 0)];
    const k = ringPull[ring] * kj;
    pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * (1 - (1 - k) * 0.35));
    pos.setY(i, y + yj);
  }
  body.computeVertexNormals();
  parts.baked.push(fresh(paint(body, local, tone, 0.09)));
  // the top: a shallow ridge over the spar, closing the frustum's top
  const top = gablePrism(w * 0.94 + 0.06, ridge, l * 0.94 + 0.06, 0.4);
  top.translate(0, h + BEARER_H, 0);
  parts.baked.push(fresh(paint(top, local, tone, 0.07)));
  // the sheet folded over onto the top: its top ring's corners to the top's foot (closing the crack between the two)
  const fold = new Dressing(), ring = corners(body, h + BEARER_H), foot = corners(top, h + BEARER_H);
  if (ring.length === 4 && foot.length === 4) {
    for (let k = 0; k < 4; k++) {
      const j = (k + 1) % 4, mid = [(ring[k][0] + ring[j][0]) / 2, 0, (ring[k][2] + ring[j][2]) / 2];
      fold.quad(ring[k], ring[j], foot[j], foot[k], [mid[0], 4, mid[2]]);
    }
    parts.baked.push(fold.geometry(pick(tones, 0.5), 0.92));
  }
  // the lashings: over the ridge (two slanted pieces) and down each side to the bearer end
  const lashes = 3 + (local() < 0.5 ? 1 : 0), rope = new Dressing(), overs: THREE.BufferGeometry[] = [];
  const halfTop = (w * 0.94 + 0.06) / 2, slope = Math.atan2(ridge, halfTop), run = Math.hypot(halfTop, ridge);
  for (let i = 0; i < lashes; i++) {
    const z = -l / 2 + 0.6 + (l - 1.2) * (i / (lashes - 1)) + (local() - 0.5) * 0.2;
    for (const s of [-1, 1]) {
      const over = paint(box(run, 0.03, 0.04, 0.5), local, ROPE, 0.08);
      over.rotateZ(-s * slope);
      over.translate(s * halfTop / 2, h + BEARER_H + ridge / 2 + 0.018, z);
      parts.baked.push(fresh(over));
      overs.push(over);
      const down = paint(box(0.03, h - 0.02, 0.04, 0.5), local, ROPE, 0.08);
      down.rotateZ(s * 0.025);
      down.translate(s * ((w + 0.06) / 2 + 0.012), BEARER_H + (h - 0.02) / 2, z);
      parts.baked.push(fresh(down));
      // the rope turned over the eave from the top's run into its fall, and at its foot through an eyelet in the sheet's
      // hem: the turn and the hitch share the runs' end corners, one rope
      const run0 = boxCorners(overs[overs.length - 1]), fall = boxCorners(down);
      const outward = (p: number[]) => s * p[0];
      const eave = endOf(run0, outward, (p) => p[2] * 1000 + p[1]);         // [z-, lo], [z-, hi], [z+, lo], [z+, hi]
      const head = endOf(fall, (p) => p[1], (p) => p[2] * 1000 + outward(p)); // [z-, in], [z-, out], [z+, in], [z+, out]
      // (a's and b's corners in the same order round the rope, [z-, low], [z-, high], [z+, low], [z+, high]: its faces
      // the z- side, the high side, the z+ side, the low side)
      const ring = (a: number[][], b: number[][], high: number[], low: number[]) => {
        const o = [0, 1, 3, 2], outs = [[0, 0, -1], high, [0, 0, 1], low];
        for (let k = 0; k < 4; k++) rope.quad(a[o[k]], a[o[(k + 1) % 4]], b[o[(k + 1) % 4]], b[o[k]], outs[k]);
      };
      ring(eave, head, [s, 1, 0], [-s, -1, 0]);
      const foot = endOf(fall, (p) => -p[1], (p) => p[2] * 1000 + outward(p));
      const eye = foot.map((p) => [p[0] - s * 0.045, p[1] - 0.03, p[2]]);
      ring(foot, eye, [s, -1, 0], [-s, 1, 0]);
    }
  }
  if (!rope.empty) parts.baked.push(rope.geometry(ROPE, 0.9));
}

/** The distinct corners of a part's positions at height `y` (to the millimetre), in order round the y axis. */
function corners(g: THREE.BufferGeometry, y: number): number[][] {
  const p = g.attributes.position, seen = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getY(i) - y) > 1e-4) continue;
    const key = `${Math.round(p.getX(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
    if (!seen.has(key)) seen.set(key, [p.getX(i), p.getY(i), p.getZ(i)]);
  }
  return [...seen.values()].sort((a, b) => Math.atan2(a[2], a[0]) - Math.atan2(b[2], b[0]));
}

/** A crate stack: a full course of wooden cases on the bearers, the next course full only on a stacked seat. */
function crateStack(parts: StackParts, local: Rng, upper: boolean): void {
  const cols = 2, rows = 4 + (local() < 0.5 ? 1 : 0);
  const cw = (SEAT_W - 0.1) / cols, cl = (SEAT_L - 0.3) / rows;
  const courseH = [0.85 + local() * 0.25, 0.8 + local() * 0.25, 0.7 + local() * 0.2];
  const courses = upper ? 3 : 2;
  bearers(parts, local, SEAT_W - 0.1, SEAT_L - 0.3, 3);
  let y = BEARER_H;
  const fullCourses = upper ? 2 : 1;
  cores(parts, local, SEAT_W - 0.44, BEARER_H + courseH[0] + (upper ? courseH[1] : 0) - 0.06, SEAT_L - 0.6, upper);
  for (let c = 0; c < courses; c++) {
    const full = c < fullCourses, ch = courseH[c];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (!full && local() < 0.45) continue;
      const tone = pick(CRATE_TONES, local());
      const ww = cw - 0.05 - local() * 0.06, ll = cl - 0.05 - local() * 0.08, hh = ch - (full ? 0.02 : local() * 0.2);
      const x = -SEAT_W / 2 + 0.05 + cw * (i + 0.5) + (local() - 0.5) * 0.04;
      const z = -SEAT_L / 2 + 0.15 + cl * (j + 0.5) + (local() - 0.5) * 0.05;
      const yaw = full ? (local() - 0.5) * 0.03 : (local() - 0.5) * 0.12;
      const crate = paint(box(ww, hh, ll, 0.55), local, tone, 0.07);
      crate.rotateY(yaw);
      crate.translate(x, y + hh / 2, z);
      parts.structureWood.push(fresh(crate));
      // the case's battens: a darker band round its top and its foot, proud by a centimetre
      for (const by of [0.06, hh - 0.06]) {
        const batten = paint(box(ww + 0.02, 0.08, ll + 0.02, 0.55), local, 0x6f5d44, 0.06);
        batten.rotateY(yaw);
        batten.translate(x, y + by, z);
        parts.structureWood.push(fresh(batten));
      }
      // its corner posts; above the bottom course, the two dunnage skids it stands on (the course under it stands 2 cm
      // short of this one's foot)
      const posts = new Dressing();
      cornerPosts(posts, ww / 2, ll / 2, hh);
      if (c > 0) for (const sx of [-1, 1]) posts.quadBox(sx * ww * 0.28 - 0.04, sx * ww * 0.28 + 0.04, -0.02, 0, -ll / 2 + 0.06, ll / 2 - 0.06);
      parts.structureWood.push(posed(posts.geometry(0x6f5d44, 0.95), yaw, x, y, z));
    }
    y += ch;
  }
}

/**
 * Rolled steel waiting at a works: square billets laid in courses along the seat, timber spacers across between the
 * courses, mill scale gone to rust on the tops.
 */
function billetStack(parts: StackParts, local: Rng, upper: boolean): void {
  const bars = 5, side = 0.26 + local() * 0.06, gap = 0.12;
  const l = SEAT_L - 0.6 - local() * 0.4, courses = (upper ? 6 : 4) + (local() < 0.4 ? 1 : 0);
  const span = bars * side + (bars - 1) * gap, spacer = 0.1;
  bearers(parts, local, span + 0.2, l, 3);
  const pitch = side + spacer, sheared = new Dressing();
  cores(parts, local, span - 0.14, BEARER_H + courses * pitch - spacer - 0.06, l - 0.5, upper);
  for (let c = 0; c < courses; c++) {
    const y = BEARER_H + c * pitch;
    const shift = (local() - 0.5) * 0.06;
    for (let b = 0; b < bars; b++) {
      const bl = l - local() * 0.25;
      const bar = paint(box(side, side, bl, 0.55), local, pick(c === courses - 1 ? BILLET_RUST : BILLET_SCALE, local()), 0.14);
      const at = [-span / 2 + side / 2 + b * (side + gap) + shift, y + side / 2, (local() - 0.5) * 0.12];
      bar.translate(at[0], at[1], at[2]);
      parts.structureMetal.push(fresh(bar));
      // its sheared ends, crowned by the shear
      crownEnds(sheared, at, side, side, bl, 0.016);
    }
    if (c === courses - 1) break;
    for (const z of [-l * 0.38, 0, l * 0.38]) {
      const sp = paint(box(span + 0.1, spacer, 0.1, 0.55), local, TIMBER_GREY, 0.08);
      sp.translate(shift, y + side + spacer / 2, z + (local() - 0.5) * 0.1);
      parts.structureWood.push(fresh(sp));
    }
  }
  parts.structureMetal.push(sheared.geometry(0x6a625c));
}

/** Sawn timber in a stickered stack: courses of deal with stickers across between them, the top course short. */
function lumberStack(parts: StackParts, local: Rng, upper: boolean): void {
  const w = SEAT_W - 0.2 - local() * 0.15, l = SEAT_L - 0.4 - local() * 0.3;
  const courses = (upper ? 9 : 6) + (local() < 0.5 ? 1 : 0), courseH = 0.2 + local() * 0.04, sticker = 0.045;
  bearers(parts, local, w, l, 3);
  const pitch = courseH + sticker, sawn = new Dressing();
  cores(parts, local, w - 0.1, BEARER_H + (courses - 1) * pitch - sticker - 0.03, l - 0.5, upper);
  for (let c = 0; c < courses; c++) {
    const y = BEARER_H + c * pitch;
    // a course is a row of boards edge to edge: four planks across, their ends ragged
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const pw = w / planks - 0.015, pl = l - (c === courses - 1 ? local() * 1.2 : local() * 0.25);
      const board = paint(box(pw, courseH, pl, 0.55), local, DEAL, 0.1);
      const at = [-w / 2 + (p + 0.5) * (w / planks), y + courseH / 2, (local() - 0.5) * 0.18];
      board.translate(at[0], at[1], at[2]);
      parts.structureWood.push(fresh(board));
      // its sawn ends, the end grain a shade darker and a hair proud
      crownEnds(sawn, at, pw, courseH, pl, 0.008);
    }
    if (c === courses - 1) break;
    for (const z of [-l * 0.42, -l * 0.14, l * 0.14, l * 0.42]) {
      const st = paint(box(w + 0.04, sticker, 0.05, 0.55), local, TIMBER_GREY, 0.06);
      st.translate(0, y + courseH + sticker / 2, z);
      parts.structureWood.push(fresh(st));
    }
  }
  parts.structureWood.push(sawn.geometry(0xa8915f));
}

/**
 * One seat of a period freight row, placed where the container stood (x across the row, z its depth offset, its yaw).
 * `upper` is the row's stack roll: the seat that would have stacked a second box stacks higher and emits a second core.
 */
export function pushPeriodFreight(
  buckets: GeometryBuckets, local: Rng, mapId: string, x: number, z: number, yaw: number, upper: boolean,
): void {
  const parts: StackParts = { baked: [], structureWood: [], structureMetal: [] };
  const form = freightForm(mapId, local());
  if (form === 'tarp') tarpStack(parts, local, mapId, upper);
  else if (form === 'crates') crateStack(parts, local, upper);
  else if (form === 'billets') billetStack(parts, local, upper);
  else lumberStack(parts, local, upper);
  for (const key of ['baked', 'structureWood', 'structureMetal'] as const) {
    const target = buckets[key] ?? buckets.baked ?? buckets.dark;
    for (const g of parts[key]) {
      g.rotateY(yaw);
      g.translate(x, 0, z);
      target.push(g);
    }
  }
}
