// src/world/maps/jettyKit.ts — the jetties in their members, one form per coast (Lane C, #16 r2, 2026-10-14).
//
// The census graded site:jetty 0: square piles in pairs under five slabs of deck, the same on every coast. A jetty is
// built, and each coast builds its own:
//   estacade  the Breton timber estacade (coastal, the default): square piles in bents of two, a cap across each bent's
//             heads, X-braces on its faces, three stringers along, gapped boards across, the outer pair of piles
//             carried up through the deck as mooring posts, a ladder down the outer end, the weed and barnacle band
//             on every pile that stands in the sea;
//   stage     the alpine lake stage (alpine, winter, whiteout): round log piles under log bearers, wales along both
//             edges, joists between, planks laid along the stage with their joints staggered over the bearers;
//   brygge    the Nordland pier (fjord): stone-filled log cribs, their courses notched over each other, under every
//             other station and the outer end, log pile bents between, log stringers, boards across;
//   riva      the Dalmatian riva (saltwind): a solid pier of ashlar in courses on both faces and the end, coping
//             along its edges, paving between, cast-iron bollards at its head, the weed line along its faces;
//   stilts    the Ca Mau pole landing (mangrove, delta): thin poles with a lean, lashed bearers and runners, a deck of
//             rough boards of uneven width, a handrail on the side away from the moored boat, sway braces along it.
// Every form keeps the old kit's frame, so the plans, the moored hulls and the receipts that key on it stand: stations
// every 1.9 m, two supports a station at ±0.65 m (a 'jetty-pile' receipt each, 10 cm into the ground under it), the deck
// top at the caller's y + 0.865 over ±0.75 m and from 2.5 cm behind the shore end to 2.5 cm past the outer end. Each
// bucket the jetty touches takes ONE merged geometry (no draw: the buckets merge into the map's meshes). The caller's
// stream burns exactly the old kit's draws (legacyJettyDraws) and the jetty draws from its own stream keyed on its seat,
// so nothing placed after it moves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, jitterUV } from '../propGeometry.ts';

type Rng = () => number;
type BG = THREE.BufferGeometry;
/** A point in the jetty's own frame: t metres along it from the shore end, y up (world), s across it. */
type Local = [number, number, number];

export type JettyForm = 'estacade' | 'stage' | 'brygge' | 'riva' | 'stilts';

/** The jetty form of a map's coast (by the map's Reference). */
export function jettyFormForMap(mapId: string): JettyForm {
  switch (mapId) {
    case 'fjord': return 'brygge';
    case 'saltwind': return 'riva';
    case 'mangrove': case 'delta': return 'stilts';
    case 'alpine': case 'winter': case 'whiteout': return 'stage';
    default: return 'estacade';
  }
}

export const JETTY_STATION_M = 1.9;
export const JETTY_SUPPORT_S_M = 0.65;
export const JETTY_HALF_WIDTH_M = 0.75;
/** The deck top over the caller's y (the old kit's deck centre 0.82 and half its 0.09 planks). */
export const JETTY_DECK_TOP_OVER_Y = 0.865;
const OVERHANG = 0.025;

/** The draws the old two-row jetty took from the caller's stream for `len` metres: a turn and a UV jitter (4) for each
 *  of its 2(n+1) piles, a UV jitter for each of its n deck slabs. */
export function legacyJettyDraws(len: number): number {
  const n = Math.round(len / JETTY_STATION_M);
  return 10 * (n + 1) + 4 * n;
}

export interface JettyGround {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
}
export interface JettyPileReceipt { kind: string; x: number; y: number; z: number; baseClearance?: number; supportMin?: number; supportMax?: number }
export interface JettyBuckets { wood: BG[]; stone: BG[]; baked?: BG[] }

export interface JettySupport { k: number; side: 1 | -1; x: number; z: number; ground: number; base: number }
export interface JettyFrame {
  form: JettyForm;
  spans: number;
  /** The outer station's distance from the shore end (m). */
  end: number;
  deckTop: number;
  /** The two supports of every station, in station order (the receipts' points). */
  supports: JettySupport[];
  /** The one geometry each bucket took. */
  pieces: { wood?: BG; stone?: BG; baked?: BG };
  /** The deck's own geometry in the jetty's frame before the merge: its pieces (for the receipts). */
  deck: { minT: number; maxT: number; minS: number; maxS: number; top: number; under: number };
}

function hashStream(x: number, z: number, salt: number): Rng {
  let a = (Math.imul(Math.round(x * 100) | 0, 0x9e3779b1) ^ Math.imul(Math.round(z * 100) | 0, 0x85ebca6b) ^ salt) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

function rgb(hex: number): [number, number, number] {
  _c.setHex(hex); // sRGB in, the working (linear) space out
  return [_c.r, _c.g, _c.b];
}
/** One tone per piece with a deterministic per-vertex grain (the baked bucket's vertex colours). */
function paint(geometry: BG, tone: readonly [number, number, number], grain: number, salt: number): BG {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let h = Math.imul((i * 7919 + salt) ^ 0x9e3779b9, 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    const shade = 1 - grain * 0.5 + grain * (((h ^ (h >>> 16)) >>> 0) / 4294967296);
    colors[i * 3] = tone[0] * shade; colors[i * 3 + 1] = tone[1] * shade; colors[i * 3 + 2] = tone[2] * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const WEED = rgb(0x39412c), BARNACLE = rgb(0x9b978b), IRON = rgb(0x262728), RUST = rgb(0x4e3324), LASHING = rgb(0x8d7b58),
  WEED_STONE = rgb(0x3d4733);

/** A member a -> b in the frame: a box section w x d (w horizontal and square to its run, d in the vertical plane). */
function memberBox(a: Local, b: Local, w: number, d: number): BG {
  const dt = b[0] - a[0], dy = b[1] - a[1], ds = b[2] - a[2];
  const len = Math.hypot(dt, dy, ds);
  const g = box(w, d, len, 1.2);
  g.rotateX(-Math.atan2(dy, Math.hypot(dt, ds)));
  g.rotateY(Math.atan2(dt, ds));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
/** A round member a -> b (a log, a pole), radius r0 at a and r1 at b; `open` a sleeve without its end discs. */
function roundMember(a: Local, b: Local, r0: number, r1: number, sides: number, open = false): BG {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, open);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * (r0 + r1) * 1.2, uv.getY(i) * len * 1.2);
  _q.setFromUnitVectors(UP, _dir.multiplyScalar(1 / len));
  g.applyQuaternion(_q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
/** An upright square post at (t, s) from y0 to y1, turned by `turn` about its axis. */
function post(t: number, s: number, y0: number, y1: number, w: number, turn: number): BG {
  const g = box(w, y1 - y0, w, 1.2);
  g.rotateY(turn);
  g.translate(t, (y0 + y1) / 2, s);
  return g;
}
/** A box from its frame extents. */
function slab(t0: number, t1: number, y0: number, y1: number, s0: number, s1: number, uv = 1.2): BG {
  const g = box(t1 - t0, y1 - y0, s1 - s0, uv);
  g.translate((t0 + t1) / 2, (y0 + y1) / 2, (s0 + s1) / 2);
  return g;
}

class Build {
  readonly wood: BG[] = [];
  readonly stone: BG[] = [];
  readonly paint: BG[] = [];
  readonly supports: JettySupport[] = [];
  readonly n: number;
  readonly end: number;
  readonly deckTop: number;
  readonly dx: number;
  readonly dz: number;
  readonly rng: Rng;
  readonly x0: number;
  readonly z0: number;
  readonly y: number;
  readonly ground: JettyGround | undefined;
  readonly receipts: JettyPileReceipt[] | null | undefined;
  deck = { minT: Infinity, maxT: -Infinity, minS: Infinity, maxS: -Infinity, top: -Infinity, under: Infinity };
  constructor(rng: Rng, x0: number, z0: number, ang: number, y: number, len: number,
    ground: JettyGround | undefined, receipts: JettyPileReceipt[] | null | undefined) {
    this.rng = rng; this.x0 = x0; this.z0 = z0; this.y = y; this.ground = ground; this.receipts = receipts;
    this.n = Math.round(len / JETTY_STATION_M);
    this.end = this.n * JETTY_STATION_M;
    this.deckTop = y + JETTY_DECK_TOP_OVER_Y;
    this.dx = Math.cos(ang); this.dz = Math.sin(ang);
  }
  /** World x, z of a frame point. */
  world(t: number, s: number): [number, number] {
    return [this.x0 + this.dx * t - this.dz * s, this.z0 + this.dz * t + this.dx * s];
  }
  /** The ground under a frame point (the caller's y where there is no field). */
  groundAt(t: number, s: number): number {
    if (!this.ground) return this.y;
    const [x, z] = this.world(t, s);
    return this.ground.getHeightAt(x, z);
  }
  /** The water surface over a frame point, or null on dry ground (a frozen lake reads dry: no tide on ice). */
  surfaceAt(t: number, s: number): number | null {
    const g = this.ground;
    if (!g?.getWaterMaskAt || !g.getWaterDepthAt) return null;
    const [x, z] = this.world(t, s);
    if (g.getWaterMaskAt(x, z) !== 1) return null;
    return g.getHeightAt(x, z) + g.getWaterDepthAt(x, z);
  }
  /** Station k's support on `side`: its point, the ground under it, its base 10 cm into it, and its receipt. */
  support(k: number, side: 1 | -1): JettySupport {
    const t = k * JETTY_STATION_M, s = side * JETTY_SUPPORT_S_M;
    const [x, z] = this.world(t, s);
    const field = this.ground?.getHeightAt(x, z);
    const ground = field ?? this.y;
    const base = field === undefined ? this.y - 0.05 : field - 0.10;
    const sup: JettySupport = { k, side, x, z, ground, base };
    this.supports.push(sup);
    if (field !== undefined) this.receipts?.push({ kind: 'jetty-pile', x, y: base, z, baseClearance: -0.10, supportMin: field, supportMax: field });
    return sup;
  }
  timber(g: BG): void { this.wood.push(jitterUV(g, this.rng)); }
  masonry(g: BG): void { this.stone.push(jitterUV(g, this.rng)); }
  painted(g: BG, tone: readonly [number, number, number], grain = 0.16): void {
    this.paint.push(paint(g, tone, grain, (this.paint.length * 131 + 7) | 0));
  }
  /** The weed and barnacle band on a member standing in the water at (t, s): weed from 0.7 m under the surface (or the
   *  bed) to just under it, the barnacles over the surface's reach; `w` the member's width, `round` a pole's sides. */
  tideBand(t: number, s: number, base: number, w: number, round = 0): void {
    const surf = this.surfaceAt(t, s);
    if (surf === null || surf < base + 0.12) return;
    const lo = Math.max(base + 0.02, surf - 0.7), mid = surf - 0.04, hi = surf + 0.16;
    const band = (y0: number, y1: number, grow: number) => round
      ? roundMember([t, y0, s], [t, y1, s], w / 2 + grow, w / 2 + grow, round, true)
      : post(t, s, y0, y1, w + grow * 2, 0);
    if (mid > lo + 0.05) this.painted(band(lo, mid, 0.018), WEED, 0.3);
    this.painted(band(mid, hi, 0.011), BARNACLE, 0.35);
  }
  /** Boards laid across the deck, a gap between them, the deck's whole extent. */
  boardsAcross(pitch: number, gap: number, thick: number, widthJitter = 0): void {
    const t0 = -OVERHANG, t1 = this.end + OVERHANG, L = t1 - t0;
    const count = Math.max(4, Math.round(L / pitch));
    // the widths: even, or rough boards of uneven width (the cuts jittered, the ends kept)
    const cuts = [t0];
    for (let b = 1; b < count; b++) cuts.push(t0 + (b + (this.rng() - 0.5) * widthJitter) * (L / count));
    cuts.push(t1);
    for (let b = 0; b < count; b++) {
      const a = cuts[b] + (b === 0 ? 0 : gap / 2), c = cuts[b + 1] - (b === count - 1 ? 0 : gap / 2);
      this.timber(slab(a, c, this.deckTop - thick, this.deckTop, -JETTY_HALF_WIDTH_M, JETTY_HALF_WIDTH_M));
    }
    this.noteDeck(t0, t1, this.deckTop - thick);
  }
  noteDeck(t0: number, t1: number, under: number): void {
    const d = this.deck;
    d.minT = Math.min(d.minT, t0); d.maxT = Math.max(d.maxT, t1);
    d.minS = -JETTY_HALF_WIDTH_M; d.maxS = JETTY_HALF_WIDTH_M; d.top = this.deckTop; d.under = Math.min(d.under, under);
  }
  /** A ladder down the outer end, outside its cap: two rails from the bed (or under the surface) to a grab over the
   *  deck, rungs every 28 cm. */
  ladder(standOff: number, wide = 0.24): void {
    const t = this.end + standOff;
    const foot = Math.min(this.groundAt(t, 0), this.deckTop - 0.6) - 0.1;
    for (const s of [-wide, wide]) this.timber(slab(t - 0.03, t + 0.03, foot, this.deckTop + 0.45, s - 0.04, s + 0.04));
    for (let r = 0; r < 10; r++) {
      const ry = this.deckTop - 0.22 - r * 0.28;
      if (ry < foot + 0.18) break;
      this.timber(slab(t - 0.02, t + 0.02, ry - 0.02, ry + 0.02, -wide - 0.04, wide + 0.04));
    }
  }
}

// ------------------------------------------------------------------------------------------------- the five forms
function estacade(b: Build): void {
  const boardUnder = b.deckTop - 0.06, stringerUnder = boardUnder - 0.18, capUnder = stringerUnder - 0.18;
  for (let k = 0; k <= b.n; k++) {
    const t = k * JETTY_STATION_M;
    const sups = [b.support(k, -1), b.support(k, 1)];
    for (const sp of sups) {
      // the outer pair carried through the deck as the head's mooring posts
      const top = k === b.n ? b.deckTop + 0.55 : capUnder;
      b.timber(post(t, sp.side * JETTY_SUPPORT_S_M, sp.base, top, 0.24, (b.rng() - 0.5) * 0.12));
      b.tideBand(t, sp.side * JETTY_SUPPORT_S_M, sp.base, 0.24);
    }
    b.timber(memberBox([t, capUnder + 0.09, -0.83], [t, capUnder + 0.09, 0.83], 0.26, 0.18));
    // the X on the bent's two faces, from under the cap to a hand over the higher bed
    const low = Math.max(sups[0].ground, sups[1].ground) + 0.15, high = capUnder - 0.06;
    if (high - low > 0.6) {
      for (const f of [-1, 1]) {
        const tf = t + f * 0.17;
        b.timber(memberBox([tf, high, -f * JETTY_SUPPORT_S_M], [tf, low, f * JETTY_SUPPORT_S_M], 0.08, 0.16));
      }
    }
  }
  for (const s of [-JETTY_SUPPORT_S_M, 0, JETTY_SUPPORT_S_M]) {
    b.timber(slab(-OVERHANG, b.end + OVERHANG, stringerUnder, boardUnder, s - 0.07, s + 0.07));
  }
  b.boardsAcross(0.22, 0.02, 0.06);
  b.ladder(0.17);
}

function stage(b: Build): void {
  const plankUnder = b.deckTop - 0.06, bearerUnder = plankUnder - 0.18, mid = (plankUnder + bearerUnder) / 2;
  for (let k = 0; k <= b.n; k++) {
    const t = k * JETTY_STATION_M;
    const sups = [b.support(k, -1), b.support(k, 1)];
    for (const sp of sups) {
      const s = sp.side * JETTY_SUPPORT_S_M;
      const top = k === b.n ? b.deckTop + 0.45 : bearerUnder;
      b.timber(roundMember([t, sp.base, s], [t, top, s], 0.12, 0.105, 8));
    }
    // the bearer: a log squared on its top and bottom (a box with its corners cut reads as one at this size)
    b.timber(memberBox([t, mid, -0.86], [t, mid, 0.86], 0.2, 0.18));
    const low = Math.max(sups[0].ground, sups[1].ground) + 0.15, high = bearerUnder - 0.05;
    if (high - low > 0.6) {
      b.timber(roundMember([t + 0.15, high, -JETTY_SUPPORT_S_M], [t + 0.15, low, JETTY_SUPPORT_S_M], 0.05, 0.05, 6));
      b.timber(roundMember([t - 0.15, high, JETTY_SUPPORT_S_M], [t - 0.15, low, -JETTY_SUPPORT_S_M], 0.05, 0.05, 6));
    }
    if (k < b.n) b.timber(memberBox([t + JETTY_STATION_M / 2, mid, -0.75], [t + JETTY_STATION_M / 2, mid, 0.75], 0.12, 0.18));
  }
  // the wales along both edges, bolted to the bearers' ends
  for (const s of [-0.8, 0.8]) b.timber(slab(-OVERHANG, b.end + OVERHANG, bearerUnder, plankUnder, s - 0.05, s + 0.05));
  // planks along the stage, seven across, each spanning two bays with the joints staggered line to line
  const lines = 7, w = (JETTY_HALF_WIDTH_M * 2) / lines;
  for (let i = 0; i < lines; i++) {
    const s0 = -JETTY_HALF_WIDTH_M + i * w + (i === 0 ? 0 : 0.008), s1 = -JETTY_HALF_WIDTH_M + (i + 1) * w - (i === lines - 1 ? 0 : 0.008);
    const cuts = [-OVERHANG];
    for (let k = 1; k < b.n; k++) if ((k + i) % 2 === 0) cuts.push(k * JETTY_STATION_M);
    cuts.push(b.end + OVERHANG);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const a = cuts[c] + (c === 0 ? 0 : 0.004), e = cuts[c + 1] - (c + 1 === cuts.length - 1 ? 0 : 0.004);
      b.timber(slab(a, e, plankUnder, b.deckTop, s0, s1));
    }
  }
  b.noteDeck(-OVERHANG, b.end + OVERHANG, plankUnder);
  b.ladder(0.16);
}

function brygge(b: Build): void {
  const boardUnder = b.deckTop - 0.06, logUnder = boardUnder - 0.2;
  const R = 0.1;
  for (let k = 0; k <= b.n; k++) {
    const t = k * JETTY_STATION_M;
    const sups = [b.support(k, -1), b.support(k, 1)];
    if (k % 2 === 0 || k === b.n) {
      // a crib: two logs a course, the courses crossing, notched half over each other, from its deepest corner; the
      // shore crib and the head crib drawn in under the deck's ends (the station's supports still stand on them)
      const ht = 0.55, hs = 0.66;
      const tc = k === 0 ? t + ht - 0.02 : k === b.n ? t - ht + 0.02 : t;
      let floor = Math.min(sups[0].base, sups[1].base);
      for (const [ct, cs] of [[-ht, -hs], [-ht, hs], [ht, -hs], [ht, hs], [0, 0]]) floor = Math.min(floor, b.groundAt(tc + ct, cs) - 0.10);
      floor -= 0.02; // the bottom course's taper and its round under a support beside its axis
      const span = logUnder - floor - 2 * R;
      const count = Math.max(2, Math.round(span / 0.17) + 1), pitch = span / (count - 1);
      for (let c = 0; c < count; c++) {
        const cy = floor + R + c * pitch;
        if (c % 2 === 0) for (const s of [-hs, hs]) b.timber(roundMember([tc - ht - 0.1, cy, s], [tc + ht + 0.1, cy, s], R, R * 0.94, 8));
        else for (const tt of [-ht, ht]) b.timber(roundMember([tc + tt, cy, -hs - 0.12], [tc + tt, cy, hs + 0.12], R, R * 0.94, 8));
      }
      // the stone it is filled with, showing between the courses
      b.masonry(slab(tc - ht + 0.06, tc + ht - 0.06, floor, logUnder - 0.04, -hs + 0.06, hs - 0.06, 0.8));
      if (k === b.n) for (const s of [-0.5, 0.5]) {
        b.timber(roundMember([tc + 0.3, logUnder - 0.3, s], [tc + 0.3, b.deckTop + 0.5, s], 0.11, 0.1, 8));
      }
    } else {
      for (const sp of sups) {
        const s = sp.side * JETTY_SUPPORT_S_M;
        b.timber(roundMember([t, sp.base, s], [t, logUnder - 2 * R, s], 0.12, 0.11, 8));
        b.tideBand(t, s, sp.base, 0.23, 8);
      }
      b.timber(roundMember([t, logUnder - R, -0.85], [t, logUnder - R, 0.85], R, R, 8));
    }
  }
  for (const s of [-0.6, 0, 0.6]) b.timber(roundMember([-OVERHANG, logUnder + R, s], [b.end + OVERHANG, logUnder + R, s], R, R * 0.92, 8));
  b.boardsAcross(0.24, 0.02, 0.06);
  b.ladder(0.2);
}

function riva(b: Build): void {
  const coping = 0.14, bodyTop = b.deckTop - coping, course = 0.3, depth = 0.42;
  const t0 = -OVERHANG, t1 = b.end + OVERHANG;
  // the supports' receipts (the masonry stands on the same points), and each bay's foot under its lowest bed
  const bays: { a: number; c: number; foot: number }[] = [];
  for (let k = 0; k <= b.n; k++) {
    const sups = [b.support(k, -1), b.support(k, 1)];
    const t = k * JETTY_STATION_M;
    const a = Math.max(t0, t - JETTY_STATION_M / 2), c = Math.min(t1, t + JETTY_STATION_M / 2);
    let foot = Math.min(sups[0].base, sups[1].base);
    for (const tt of [a, c]) for (const s of [-JETTY_HALF_WIDTH_M, 0, JETTY_HALF_WIDTH_M]) foot = Math.min(foot, b.groundAt(tt, s) - 0.10);
    bays.push({ a, c, foot });
  }
  // a face of ashlar: courses counted down from under the coping (their joints level the length of the pier) to the
  // pier's lowest foot, the bottom course taking up the remainder; a block wholly under the bed it stands over is not
  // laid; the joints break course to course
  const footAt = (u0: number, u1: number) => {
    let f = Infinity;
    for (const bay of bays) if (bay.c > u0 + 1e-6 && bay.a < u1 - 1e-6) f = Math.min(f, bay.foot);
    return f;
  };
  const face = (a: number, c: number, feet: (u0: number, u1: number) => number, place: (u0: number, u1: number, y0: number, y1: number) => BG, phase: number) => {
    const lowest = feet(a, c);
    for (let r = 0; ; r++) {
      const y1 = bodyTop - r * course;
      if (y1 <= lowest + 1e-6) break;
      const y0 = y1 - course <= lowest + 0.12 ? lowest : y1 - course;
      let u = a;
      const shift = ((r + phase) % 2) * 0.32;
      while (u < c - 1e-6) {
        const len = (u === a ? 0.38 + shift : 0.62 + b.rng() * 0.22);
        const u1 = Math.min(c, u + len);
        if (y1 > feet(u, u1) + 1e-6) {
          b.masonry(place(u + (u === a ? 0 : 0.006), u1 - (u1 >= c - 1e-6 ? 0 : 0.006), y0 + (y0 === lowest ? 0 : 0.006), y1 - 0.006));
        }
        u = u1;
      }
      if (y0 === lowest) break;
    }
  };
  for (const side of [-1, 1]) {
    face(t0, t1, footAt, (u0, u1, y0, y1) => slab(u0, u1, y0, y1,
      side < 0 ? -JETTY_HALF_WIDTH_M : JETTY_HALF_WIDTH_M - depth, side < 0 ? -JETTY_HALF_WIDTH_M + depth : JETTY_HALF_WIDTH_M, 0.8), side < 0 ? 0 : 1);
  }
  bays.forEach((bay, i) => {
    for (const side of [-1, 1]) {
      // the weed line along the face at the water
      const surf = b.surfaceAt((bay.a + bay.c) / 2, side * JETTY_HALF_WIDTH_M);
      if (surf !== null && surf > bay.foot + 0.15) {
        const s = side * (JETTY_HALF_WIDTH_M + 0.006);
        b.painted(slab(bay.a, bay.c, Math.max(bay.foot, surf - 0.45), surf + 0.1, s - 0.006, s + 0.006), WEED_STONE, 0.4);
      }
    }
    // the hearting between the faces (the head's end face closes the last bay)
    const c = i === bays.length - 1 ? t1 - depth : bay.c;
    b.masonry(slab(bay.a, c, bay.foot, bodyTop - 0.02, -JETTY_HALF_WIDTH_M + depth, JETTY_HALF_WIDTH_M - depth, 0.8));
  });
  // the head: the end face across the pier, from its last bay's foot
  const head = bays[bays.length - 1];
  face(-JETTY_HALF_WIDTH_M + depth, JETTY_HALF_WIDTH_M - depth, () => head.foot, (u0, u1, y0, y1) => slab(t1 - depth, t1, y0, y1, u0, u1, 0.8), 1);
  // the coping along both edges and across the head, the paving between
  for (const side of [-1, 1]) {
    let u = t0;
    while (u < t1 - 0.46 - 1e-6) {
      let u1 = u + 0.9 + b.rng() * 0.25;
      if (u1 > t1 - 0.46 - 0.3) u1 = t1 - 0.46;
      b.masonry(slab(u + (u === t0 ? 0 : 0.005), u1 - 0.005, bodyTop, b.deckTop,
        side < 0 ? -JETTY_HALF_WIDTH_M : JETTY_HALF_WIDTH_M - 0.4, side < 0 ? -JETTY_HALF_WIDTH_M + 0.4 : JETTY_HALF_WIDTH_M, 0.8));
      u = u1;
    }
  }
  b.masonry(slab(t1 - 0.46, t1, bodyTop, b.deckTop, -JETTY_HALF_WIDTH_M, JETTY_HALF_WIDTH_M, 0.8));
  for (let u = t0; u < t1 - 0.46 - 1e-6;) {
    let u1 = u + 0.55 + b.rng() * 0.2;
    if (u1 > t1 - 0.46 - 0.2) u1 = t1 - 0.46;
    for (const [s0, s1] of [[-0.35, 0], [0, 0.35]]) {
      b.masonry(slab(u + 0.005, u1 - 0.005, bodyTop + 0.02, b.deckTop - 0.004, s0 + (s0 < 0 ? 0 : 0.005), s1 - (s1 > 0 ? 0 : 0.005), 0.8));
    }
    u = u1;
  }
  b.noteDeck(t0, t1, bodyTop);
  // the cast-iron bollards at the head (ironBollard)
  for (const s of [-0.48, 0.48]) b.paint.push(ironBollard(t1 - 0.3, b.deckTop, s));
}

function stilts(b: Build, railSide: 1 | -1): void {
  const deckUnder = b.deckTop - 0.045, runnerC = deckUnder - 0.05, bearerC = runnerC - 0.05 - 0.055, poleTop = bearerC - 0.055;
  const lean = () => (b.rng() - 0.5) * 0.06;
  const poles: { t: number; s: number; base: number; ground: number }[] = [];
  for (let k = 0; k <= b.n; k++) {
    const t = k * JETTY_STATION_M;
    const sups = [b.support(k, -1), b.support(k, 1)];
    for (const sp of sups) {
      const s = sp.side * JETTY_SUPPORT_S_M;
      // the rail side's pole carries on up as the handrail's post
      const top = sp.side === railSide ? b.deckTop + 0.95 : poleTop;
      b.timber(roundMember([t + lean(), sp.base, s + lean()], [t, top, s], 0.07, 0.055, 6));
      b.tideBand(t, s, sp.base, 0.13, 6);
      poles.push({ t, s, base: sp.base, ground: sp.ground });
      // the lashing where the bearer meets the pole
      b.painted(roundMember([t, bearerC - 0.07, s], [t, bearerC + 0.07, s], 0.078, 0.078, 6, true), LASHING, 0.3);
    }
    b.timber(roundMember([t, bearerC, -0.86], [t, bearerC, 0.86], 0.055, 0.05, 6));
  }
  for (const s of [-0.5, 0, 0.5]) b.timber(roundMember([-OVERHANG, runnerC, s], [b.end + OVERHANG, runnerC, s], 0.05, 0.045, 6));
  // sway braces along both sides, a pole from low on one station to high on the next
  for (let k = 0; k < b.n; k++) {
    for (const side of [-1, 1]) {
      const p = poles[k * 2 + (side < 0 ? 0 : 1)], q = poles[(k + 1) * 2 + (side < 0 ? 0 : 1)];
      const low = Math.max(p.ground, q.ground) + 0.15, high = poleTop - 0.08;
      if (high - low < 0.5) continue;
      const s = side * (JETTY_SUPPORT_S_M + 0.07);
      b.timber(roundMember(k % 2 ? [p.t, high, s] : [p.t, low, s], k % 2 ? [q.t, low, s] : [q.t, high, s], 0.04, 0.04, 5));
    }
  }
  b.boardsAcross(0.18, 0.025, 0.045, 0.4);
  // the handrail: a pole lashed along the posts' heads
  const rs = railSide * JETTY_SUPPORT_S_M;
  b.timber(roundMember([0.2, b.deckTop + 0.9, rs], [b.end, b.deckTop + 0.9, rs], 0.035, 0.032, 6));
}

/**
 * A jetty of `form` from (x0, z0) along `ang` for `len` m, its deck top at y + 0.865, merged into one geometry a bucket
 * (`stone` for a riva and a crib's fill, `baked` for the tide bands, the lashings and the iron; `wood` for the rest; a
 * kit without a baked bucket keeps the colours off). With a support field each station's two supports stand 10 cm into
 * the ground under them (a receipt each, as the old kit's); without one, from 5 cm under y. `railSide`: the stilts'
 * handrail side (away from the moored boat).
 */
export function buildJetty(buckets: JettyBuckets, form: JettyForm, x0: number, z0: number, ang: number, y: number, len: number,
  support?: JettyGround, receipts?: JettyPileReceipt[] | null, railSide: 1 | -1 = 1): JettyFrame {
  const b = new Build(hashStream(x0, z0, 0x1e77 + form.length), x0, z0, ang, y, len, support, receipts);
  if (form === 'stage') stage(b);
  else if (form === 'brygge') brygge(b);
  else if (form === 'riva') riva(b);
  else if (form === 'stilts') stilts(b, railSide);
  else estacade(b);
  // the frame to the world: t along (cos, sin), s across (-sin, cos); a rotation, so no winding flips
  const m = frameMatrix(x0, z0, ang);
  const pieces: JettyFrame['pieces'] = {};
  const emit = (list: BG[], into: BG[] | undefined, key: 'wood' | 'stone' | 'baked') => {
    if (!list.length || !into) return;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) throw new Error(`jettyKit: the ${form} jetty's ${key} pieces do not merge`);
    merged.applyMatrix4(m);
    merged.userData.jetty = form; // (the strand's audits tell a jetty's painted piece from the wrack)
    into.push(merged);
    pieces[key] = merged;
  };
  emit(b.wood, buckets.wood, 'wood');
  emit(b.stone, buckets.stone, 'stone');
  if (buckets.baked) emit(b.paint, buckets.baked, 'baked');
  else for (const g of b.paint) g.dispose();
  return { form, spans: b.n, end: b.end, deckTop: b.deckTop, supports: b.supports, pieces, deck: b.deck };
}

/** The frame-to-world matrix of a jetty seated at (x0, z0) along `ang`. */
function frameMatrix(x0: number, z0: number, ang: number): THREE.Matrix4 {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dz, 0, dx)).setPosition(x0, 0, z0);
}

/**
 * The riva's landward stair in place of a gangway plank: stone steps from the sand at `run` m behind the shore end up
 * to the deck top, 1.2 m wide, each a block from its own riser to the pier's face (the first from 10 cm under the
 * lowest sand under the flight). One merged geometry into `stone`; no draws.
 */
export function buildRivaSteps(stone: BG[], x0: number, z0: number, ang: number, ground: JettyGround, groundY: number, top: number, run: number): BG {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const steps = Math.max(2, Math.ceil((top - groundY) / 0.17));
  const rise = (top - groundY) / steps, tread = (run - OVERHANG) / steps;
  let foot = groundY - 0.1;
  for (let f = 0; f <= 4; f++) for (const s of [-0.6, 0.6]) {
    const t = -run + (f / 4) * (run - OVERHANG);
    foot = Math.min(foot, ground.getHeightAt(x0 + dx * t - dz * s, z0 + dz * t + dx * s) - 0.1);
  }
  const parts: BG[] = [];
  for (let i = 0; i < steps; i++) {
    const y0 = i === 0 ? foot : groundY + i * rise, y1 = groundY + (i + 1) * rise;
    parts.push(slab(-run + i * tread, -OVERHANG, y0, y1, -0.6, 0.6, 0.8));
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  merged.applyMatrix4(frameMatrix(x0, z0, ang));
  merged.userData.jetty = 'riva-stair';
  stone.push(merged);
  return merged;
}

/** A cast-iron mooring bollard standing on (x, y, z): foot plate, barrel, the rust ring the lines wear, the cap. Vertex
 *  coloured for the baked bucket. */
export function ironBollard(x: number, y: number, z: number): BG {
  const parts = [
    paint(roundMember([0, y - 0.01, 0], [0, y + 0.04, 0], 0.17, 0.16, 10), IRON, 0.2, 11),
    paint(roundMember([0, y + 0.04, 0], [0, y + 0.42, 0], 0.1, 0.085, 10), IRON, 0.25, 12),
    paint(roundMember([0, y + 0.3, 0], [0, y + 0.36, 0], 0.092, 0.092, 10), RUST, 0.3, 13),
    paint(roundMember([0, y + 0.42, 0], [0, y + 0.48, 0], 0.14, 0.13, 10), IRON, 0.2, 14),
  ];
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  merged.translate(x, 0, z);
  merged.userData.jetty = 'bollard';
  return merged;
}
