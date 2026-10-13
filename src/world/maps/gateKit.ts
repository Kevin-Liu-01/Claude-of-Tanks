// src/world/maps/gateKit.ts — every fence family's own gate, in its region's build (the looks lane, 2026-10-13).
//
// The owner, 2026-10-12: "gate structures and other things especially destructible props need brand new looks ...
// (bunker, old buildings etc, look like they missed being remade - fix all this)". One 2 m farm gate of three boards
// (inhabitKit bGate) stood in every wall and fence of 18 maps: in Steinburg's sandstone yard walls, in the ksar's mud
// walls, in a Ukrainian tyn, on the cobbles of a town street.
//
// A gate here is part of its fence: the fence family's material and post pitch, member by member, hung open at a
// believable angle, its broken state the same members off their hinges. Five families, each a destructible kind of its
// own (one pool each; the DESTRUCTIBLE_TYPES gate's numbers, class and contact unchanged):
//   gate        the field gate where a road cuts a plank or rail fence (and a plank yard's gate): the north European
//               five-bar gate (hanging post, heel and head, five bars, the brace, strap hinges and a latch), the
//               American ranch gate of wide boards, the steppe's and the north's pole gate, the delta's bamboo gate;
//   gatepicket  the picket wicket of a picket fence (Hessian Staketenzaun): posts with caps, a ledged-and-braced
//               wicket of pointed pickets beside a fixed panel;
//   gatewattle  the woven fence's gate: the Ukrainian tyn's khvirtka under its little board roof (Prokhorovka), the
//               hurdle gate on its stakes, the coyote fence's juniper-stick gate (Oljato), the palm-rib gate (Siwa);
//   gatestone   the stone yard wall's gate: two dressed piers of the kit's own stone (regionalStone: its print, its
//               tint, its damp foot) with their caps, a boarded or wrought-iron leaf between — the Franconian Hoftor of
//               ledged oak on sandstone piers (Kronach), the Hessian churchyard's iron gate on Buntsandstein, the
//               Andalusian reja on limewashed piers, the Breton granite piers, the Chouf's and Dalmatia's limestone;
//   gateadobe   the mud wall's gate: rendered mud-brick piers, a palm-trunk lintel, a plank door with iron straps and
//               studs (the Dahar's ksour), or a sheet-steel gate on block piers (Wadi Rum).
//
// Frame (every family): the run along local +z, the hanging post's or pier's face at z = 0 and the gap's far side at
// z = width; x across the fence line, y up from the ground. A field gate stands where the road cuts its fence (props.ts
// placeFenceRun: the run's module start); a yard's gate fills its slot from the slot's start (yards.ts).
//
// Surfaces: the timber families ride the structure wood (its neutral hewn-oak grain under the vertex colour: the grain
// along v, the members' length; a member's u window inside one 0.4 m plank of the tile). The stone gate rides the kit's
// regionalStone (its masonry print at the kits' 0.5 repeats a metre, toned per vertex as weather.ts tones a house):
// its timber and iron sample one flat texel of that print (STONE_FLAT_TEXEL) and carry their colour over it. The mud
// gate rides the kit's regionalPlaster as the ksar gate post does (ksarGate.ts).
//
// Pure geometry: no DOM, no materials; no draws from any stream (hash noise): every placement keeps its seat.
import * as THREE from 'three';
import type { ArchitectureStyle, StoneSurfaceKind } from './regional/types.ts';
import { wallWeather } from './regional/weather.ts';

type V3 = [number, number, number];
type Rgb = readonly [number, number, number];

/** The fence families' gate kinds. */
export const GATE_KINDS = ['gate', 'gatepicket', 'gatewattle', 'gatestone', 'gateadobe'] as const;
export type GateKind = typeof GATE_KINDS[number];

/** The gate a fence run of `fenceKind` hangs where a road cuts it (props.ts placeFenceRun). */
export function gateKindForFence(fenceKind: string): GateKind {
  if (fenceKind === 'fencepicket') return 'gatepicket';
  if (fenceKind === 'fencewattle') return 'gatewattle';
  return 'gate';
}

/** The width a family's gate fills: a fence's module (2.4 m) or a wall's (3.0 m). */
export const GATE_WIDTH: Readonly<Record<GateKind, number>> = Object.freeze({
  gate: 2.4, gatepicket: 2.4, gatewattle: 2.4, gatestone: 3.0, gateadobe: 3.0,
});

// ---------------------------------------------------------------------------------------------------------------
// colour (linear) and noise

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLin = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const mul = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const mulc = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** A deterministic stream of its own (the gate's member jitter): never the placement streams. */
function stream(seed: number): () => number {
  let i = 0;
  return () => hash(i++, 0x6a7e, seed);
}

// ---------------------------------------------------------------------------------------------------------------
// the surfaces

/** The structure wood's tile: 0.55 repeats a metre, grain along v, planks 0.4 m across in u (timberGrain.ts). */
const WOOD_UV_PER_M = 0.55;
/** The kits' stone and render prints: 0.5 repeats a metre (regionalSurfaces.ts). */
const STONE_UV_PER_M = 0.5;
/** The structure wood's mean luminance (timberGrain.ts paints 0.55..1): vertex colours are albedo over it. */
const WOOD_PRINT_MEAN = 0.8;

/**
 * One flat texel of each regional stone print (tools: the looks stream's flat-texel.mjs over regionalSurfaces.ts
 * masonry at its default seed, tint 1): the flattest 13 px window inside a block's face, its uv on the GPU (v = 1 - row)
 * and its untinted sRGB value. A gate's timber and iron sample it and carry their own colour over its value.
 */
export const STONE_FLAT_TEXEL: Readonly<Record<string, { uv: readonly [number, number]; srgb: Rgb }>> = Object.freeze({
  'sandstone:dressed': { uv: [0.8682, 0.4092], srgb: [0.941, 0.941, 0.937] },
  sandstone: { uv: [0.2744, 0.7412], srgb: [0.871, 0.965, 1] },
  granite: { uv: [0.1768, 0.2021], srgb: [0.878, 0.922, 0.965] },
  limestone: { uv: [0.5674, 0.8545], srgb: [0.945, 0.937, 0.929] },
  rubble: { uv: [0.708, 0.1904], srgb: [0.878, 0.827, 0.78] },
  brick: { uv: [0.8955, 0.0615], srgb: [0.839, 0.878, 0.918] },
  greywacke: { uv: [0.8525, 0.7764], srgb: [0.855, 0.851, 0.847] },
  fieldstone: { uv: [0.29, 0.9404], srgb: [0.886, 0.859, 0.827] },
  gneiss: { uv: [0.7549, 0.7725], srgb: [0.808, 0.796, 0.78] },
});

/** How one gate's surfaces map: the timber gates (structure wood), the stone gate (kit stone), the mud gate (render). */
interface Surface {
  kind: 'wood' | 'stone' | 'render';
  /** stone: the flat texel's linear albedo (tint x value); render: the render print's mean albedo */
  texel?: Rgb;
  flatUv?: readonly [number, number];
}

// ---------------------------------------------------------------------------------------------------------------
// the mesh writer

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** How a member's faces take their print: a timber's grain along its length, a stone's courses level, a flat texel. */
type UvMode = { kind: 'grain'; u0: number } | { kind: 'masonry' } | { kind: 'flat' };

class Mesh {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly t: number[] = [];
  readonly c: number[] = [];
  readonly surface: Surface;
  constructor(surface: Surface) { this.surface = surface; }
  /** A colour (linear albedo) as the vertex colour over this surface's print. */
  colour(albedo: Rgb, printed: boolean): Rgb {
    const s = this.surface;
    if (s.kind === 'wood') return mul(albedo, 1 / WOOD_PRINT_MEAN);
    if (!printed && s.texel) return [albedo[0] / s.texel[0], albedo[1] / s.texel[1], albedo[2] / s.texel[2]];
    return albedo;
  }
  tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, ua: readonly [number, number], ub: readonly [number, number],
    uc: readonly [number, number], col: Rgb): void {
    for (const [p, n, u] of [[a, na, ua], [b, nb, ub], [c, nc, uc]] as const) {
      this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.t.push(u[0], u[1]); this.c.push(col[0], col[1], col[2]);
    }
  }
  /**
   * A flat quad a b c d wound to face `out` (the normal its own, turned to agree), its uvs by `uv`, its colour by `shade`
   * at each corner (linear albedo before the print's division).
   */
  quad(a: V3, b: V3, c: V3, d: V3, out: V3, uv: (q: V3, n: V3) => [number, number], shade: (q: V3, n: V3) => Rgb, printed: boolean): void {
    let g = norm(cross(sub(b, a), sub(d, a)));
    if (dot(g, out) < 0) { const t = b; b = d; d = t; g = scl(g, -1); }
    for (const q of [a, b, c, a, c, d]) {
      const col = this.colour(shade(q, g), printed), u = uv(q, g);
      this.p.push(q[0], q[1], q[2]); this.n.push(g[0], g[1], g[2]); this.t.push(u[0], u[1]); this.c.push(col[0], col[1], col[2]);
    }
  }
  /** The vertices written since `from`, turned about the vertical line (x0, z0) by `yaw`. */
  turn(from: number, x0: number, z0: number, yaw: number): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = from; i < this.p.length; i += 3) {
      const x = this.p[i] - x0, z = this.p[i + 2] - z0;
      this.p[i] = x0 + x * c + z * s; this.p[i + 2] = z0 - x * s + z * c;
      const nx = this.n[i], nz = this.n[i + 2];
      this.n[i] = nx * c + nz * s; this.n[i + 2] = -nx * s + nz * c;
    }
  }
  /** The vertices written since `from`, laid over: turned about the axis through `pivot` along `axis` by `angle`. */
  tilt(from: number, pivot: V3, axis: V3, angle: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...norm(axis)), angle);
    const v = new THREE.Vector3();
    for (let i = from; i < this.p.length; i += 3) {
      v.set(this.p[i] - pivot[0], this.p[i + 1] - pivot[1], this.p[i + 2] - pivot[2]).applyQuaternion(q);
      this.p[i] = v.x + pivot[0]; this.p[i + 1] = v.y + pivot[1]; this.p[i + 2] = v.z + pivot[2];
      v.set(this.n[i], this.n[i + 1], this.n[i + 2]).applyQuaternion(q);
      this.n[i] = v.x; this.n[i + 1] = v.y; this.n[i + 2] = v.z;
    }
  }
  get mark(): number { return this.p.length; }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/**
 * A member: the box from `a` to `b` (its axis), `w` across (along `side`, perpendicular to the axis) and `h` the third
 * way, with chamfered long arrises (`chamfer` m). Faces the `skip` list names (0 start end, 1 end end) are left out.
 */
function member(m: Mesh, a: V3, b: V3, w: number, h: number, side: V3, col: Rgb, uvMode: UvMode,
  opts: { chamfer?: number; skipEnds?: boolean; shade?: (q: V3, n: V3) => Rgb } = {}): void {
  const axis = norm(sub(b, a)), len = Math.hypot(...sub(b, a));
  let s = norm(sub(side, scl(axis, dot(side, axis))));
  if (!Number.isFinite(s[0]) || Math.hypot(...s) < 0.5) s = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const t = norm(cross(axis, s));
  const ch = Math.min(opts.chamfer ?? 0, w * 0.3, h * 0.3);
  // the section: a rectangle with its corners cut (8 points), or 4
  const hw = w / 2, hh = h / 2;
  const sec: Array<[number, number]> = ch > 0
    ? [[hw, hh - ch], [hw - ch, hh], [-hw + ch, hh], [-hw, hh - ch], [-hw, -hh + ch], [-hw + ch, -hh], [hw - ch, -hh], [hw, -hh + ch]]
    : [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
  const at = (o: V3, k: number): V3 => add(o, add(scl(s, sec[k][0]), scl(t, sec[k][1])));
  const shade = opts.shade ?? (() => col);
  const uvOf = (q: V3, n: V3): [number, number] => {
    if (uvMode.kind === 'flat') return [m.surface.flatUv?.[0] ?? 0.5, m.surface.flatUv?.[1] ?? 0.5];
    const along = dot(sub(q, a), axis);
    if (uvMode.kind === 'grain') {
      // the grain along the member; across, a window inside one plank of the tile (0.4 m: 0.22 of a tile)
      const across = dot(sub(q, a), Math.abs(dot(n, s)) > 0.7 ? t : s);
      const span = Math.max(w, h) * WOOD_UV_PER_M;
      const k = span > 0.16 ? 0.16 / span : 1;
      return [uvMode.u0 + (across * WOOD_UV_PER_M) * k, along * WOOD_UV_PER_M];
    }
    // masonry: courses level, the face's horizontal along u (world-placed so neighbours' joints run on)
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]);
    return ay > 0.6 ? [q[0] * STONE_UV_PER_M, q[2] * STONE_UV_PER_M]
      : ax > 0.5 ? [q[2] * STONE_UV_PER_M, q[1] * STONE_UV_PER_M] : [q[0] * STONE_UV_PER_M, q[1] * STONE_UV_PER_M];
  };
  const printed = uvMode.kind !== 'flat';
  const N = sec.length;
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    const mid = scl(add(add(scl(s, sec[k][0]), scl(t, sec[k][1])), add(scl(s, sec[k2][0]), scl(t, sec[k2][1]))), 0.5);
    m.quad(at(a, k), at(b, k), at(b, k2), at(a, k2), mid, uvOf, shade, printed);
  }
  if (!opts.skipEnds) {
    const cap = (o: V3, out: V3) => {
      const ring = sec.map((_, k) => at(o, k));
      for (let k = 1; k + 1 < N; k++) {
        const q0 = ring[0], q1 = ring[k], q2 = ring[k + 1];
        const g = dot(norm(cross(sub(q1, q0), sub(q2, q0))), out) < 0;
        const [x1, x2] = g ? [q2, q1] : [q1, q2];
        const nn = out;
        for (const q of [q0, x1, x2]) {
          const col = m.colour(shade(q, nn), printed), u = uvOf(q, nn);
          m.p.push(q[0], q[1], q[2]); m.n.push(nn[0], nn[1], nn[2]); m.t.push(u[0], u[1]); m.c.push(col[0], col[1], col[2]);
        }
      }
    };
    cap(a, scl(axis, -1));
    cap(b, axis);
  }
}

/** A round pole from `a` to `b` (radius r0 at a, r1 at b), `seg` sides, grain along it. */
function pole(m: Mesh, a: V3, b: V3, r0: number, r1: number, col: Rgb, u0: number, seg = 6,
  opts: { nodes?: number; nodeCol?: Rgb } = {}): void {
  // (on the stone or the render a pole is timber over the print's flat texel, never the masonry)
  const flat = m.surface.kind !== 'wood', fuv = m.surface.flatUv ?? [0.5, 0.5];
  const axis = norm(sub(b, a)), len = Math.hypot(...sub(b, a));
  const s = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t = norm(cross(axis, s));
  const rings = Math.max(1, opts.nodes ?? 1);
  const pt = (o: V3, r: number, k: number): V3 => {
    const ang = (k / seg) * Math.PI * 2;
    return add(o, add(scl(s, Math.cos(ang) * r), scl(t, Math.sin(ang) * r)));
  };
  const nrm = (k: number): V3 => { const ang = ((k) / seg) * Math.PI * 2; return add(scl(s, Math.cos(ang)), scl(t, Math.sin(ang))); };
  for (let ring = 0; ring < rings; ring++) {
    const f0 = ring / rings, f1 = (ring + 1) / rings;
    const o0 = add(a, scl(axis, len * f0)), o1 = add(a, scl(axis, len * f1));
    const ra = r0 + (r1 - r0) * f0, rb = r0 + (r1 - r0) * f1;
    for (let k = 0; k < seg; k++) {
      const p00 = pt(o0, ra, k), p01 = pt(o0, ra, k + 1), p10 = pt(o1, rb, k), p11 = pt(o1, rb, k + 1);
      const n0 = nrm(k), n1 = nrm(k + 1);
      const u = (kk: number) => u0 + (kk / seg) * 0.12;
      const c = m.colour(col, !flat);
      const uv = (uu: number, vv: number): [number, number] => (flat ? [fuv[0], fuv[1]] : [uu, vv]);
      m.tri(p00, p10, p11, n0, n0, n1, uv(u(k), len * f0 * WOOD_UV_PER_M), uv(u(k), len * f1 * WOOD_UV_PER_M), uv(u(k + 1), len * f1 * WOOD_UV_PER_M), c);
      m.tri(p00, p11, p01, n0, n1, n1, uv(u(k), len * f0 * WOOD_UV_PER_M), uv(u(k + 1), len * f1 * WOOD_UV_PER_M), uv(u(k + 1), len * f0 * WOOD_UV_PER_M), c);
    }
    if (opts.nodes && opts.nodeCol && ring > 0) {
      // a bamboo node: a slim dark collar where the rings meet
      member(m, add(o0, scl(axis, -0.012)), add(o0, scl(axis, 0.012)), ra * 2.25, ra * 2.25, s, opts.nodeCol, flat ? { kind: 'flat' } : { kind: 'grain', u0 });
    }
  }
  // the cut end at the top
  const top = add(a, scl(axis, len)), c = m.colour(mul(col, 0.85), !flat);
  const tu: [number, number] = flat ? [fuv[0], fuv[1]] : [u0, 0];
  for (let k = 0; k < seg; k++) m.tri(top, pt(top, r1, k), pt(top, r1, k + 1), axis, axis, axis, tu, tu, tu, c);
}

// ---------------------------------------------------------------------------------------------------------------
// the styles

/** A field gate's form (gate kind). */
type FieldForm = 'fivebar' | 'ranch' | 'pole' | 'bamboo';
/** A woven fence's gate (gatewattle kind). */
type WattleForm = 'khvirtka' | 'hurdle' | 'coyote' | 'bamboo' | 'palm';
/** A stone wall gate's leaf and cap. */
interface StoneGateStyle { leaf: 'ledged' | 'iron' | 'plank'; cap: 'moulded' | 'pyramid' | 'dome' | 'slab' | 'tiled'; double: boolean;
  leafCol: number; ironCol: number; pierWash?: number; pierH: number }
interface AdobeGateStyle { leaf: 'studded' | 'sheet'; leafCol: number; ironCol: number }

/** One region's gates. */
export interface GateStyle {
  /** the real place the gates are drawn from */
  region: string;
  field: FieldForm;
  timber: number;
  iron: number;
  /** the picket gate's paint */
  picket: number;
  wattle: WattleForm;
  stone: StoneGateStyle;
  adobe: AdobeGateStyle;
  /** the leaf's swing (rad) */
  open: number;
}

const BASE: GateStyle = {
  region: 'north-west European farmland: the five-bar field gate of oak on its hanging post',
  field: 'fivebar', timber: 0x7a6a58, iron: 0x2a2826, picket: 0xdcd8cc, wattle: 'hurdle',
  stone: { leaf: 'ledged', cap: 'pyramid', double: true, leafCol: 0x5e4a38, ironCol: 0x232526, pierH: 1.75 },
  adobe: { leaf: 'studded', leafCol: 0x6a5440, ironCol: 0x2b2826 },
  open: 0.62,
};
const style = (o: Partial<GateStyle> & { region: string }): GateStyle => ({ ...BASE, ...o,
  stone: { ...BASE.stone, ...(o.stone ?? {}) }, adobe: { ...BASE.adobe, ...(o.adobe ?? {}) } });

/** Each architecture kit's gates (by style id); a map with no kit takes its own entry by map id, else BASE. */
export const GATE_STYLES: Readonly<Record<string, GateStyle>> = Object.freeze({
  // Upper Franconia (Kronach): the Hoftor of ledged oak between dressed sandstone piers with moulded caps
  franconian: style({ region: 'Upper Franconia (Kronach): the Hoftor of ledged oak on dressed sandstone piers; the five-bar field gate',
    stone: { leaf: 'ledged', cap: 'moulded', double: true, leafCol: 0x4f3d2e, ironCol: 0x222324, pierH: 1.95 } }),
  // Osthessen: the Staketenzaun's wicket; the churchyard's wrought-iron gate on Buntsandstein piers
  hessian: style({ region: 'Osthessen (Fulda Gap): the Staketen wicket; the churchyard\'s iron gate on Buntsandstein piers',
    picket: 0xc9c2b0, stone: { leaf: 'iron', cap: 'pyramid', double: true, leafCol: 0x2a2b2c, ironCol: 0x262728, pierH: 1.8 } }),
  eifel: style({ region: 'Northern Eifel: the five-bar gate of weathered oak', timber: 0x6e665c }),
  polder: style({ region: 'Zeeland: the Dutch hekwerk, a five-bar gate painted white on its heavy post', timber: 0xcfcbc0 }),
  ruhr: style({ region: 'Ruhr colliery terraces: the garden gate of tarred planks', timber: 0x4a4038 }),
  saar: style({ region: 'Saarland works: the five-bar gate', timber: 0x6a5e52 }),
  savoyard: style({ region: 'Haute-Maurienne: larch gates, silver-grey', timber: 0x7c7268, field: 'pole' }),
  breton: style({ region: 'Finistère: granite gate piers (rounded caps) and a plank gate painted the coast\'s green-grey',
    stone: { leaf: 'plank', cap: 'dome', double: false, leafCol: 0x5d7468, ironCol: 0x2a2826, pierH: 1.6 } }),
  andalusian: style({ region: 'Serranía de Ronda: the iron cancela on limewashed piers under canal tiles',
    stone: { leaf: 'iron', cap: 'tiled', double: true, leafCol: 0x1f2122, ironCol: 0x1f2122, pierWash: 0xece7dc, pierH: 2.0 } }),
  chouf: style({ region: 'The Chouf: limestone piers with slab caps and an iron gate painted green',
    stone: { leaf: 'iron', cap: 'slab', double: true, leafCol: 0x3c5a48, ironCol: 0x3c5a48, pierH: 1.9 } }),
  dalmatian: style({ region: 'Central Dalmatia: a plank gate of grey-weathered pine between limestone piers under a slab',
    stone: { leaf: 'plank', cap: 'slab', double: false, leafCol: 0x7a7468, ironCol: 0x2a2826, pierH: 1.75 } }),
  // Prokhorovka: the tyn of wattle and its khvirtka under a little roof; the steppe's pole gate
  kolkhoz: style({ region: 'Belgorod steppe (Prokhorovka): the tyn and its khvirtka under a little board roof; the zherdyna pole gate',
    field: 'pole', wattle: 'khvirtka', timber: 0x6f6252 }),
  longleaf: style({ region: 'Louisiana 1941: the ranch gate of wide pine boards on cypress posts', field: 'ranch', timber: 0x857560 }),
  navajo: style({ region: 'Oljato: the juniper coyote-fence gate; the ranch gate', field: 'ranch', wattle: 'coyote', timber: 0x8a7a66 }),
  glencanyon: style({ region: 'Page, Arizona: the ranch gate', field: 'ranch', timber: 0x8c7b64 }),
  queenstown: style({ region: 'Queenstown, Tasmania: the post-and-rail farm gate', timber: 0x7a6e60 }),
  bengal: style({ region: 'Jamuna chars: bamboo gates lashed with jute', field: 'bamboo', wattle: 'bamboo', timber: 0xa08c66 }),
  mekong: style({ region: 'Cà Mau: bamboo gates', field: 'bamboo', wattle: 'bamboo', timber: 0x9a8862 }),
  kohima: style({ region: 'Naga Hills: bamboo gates', field: 'bamboo', wattle: 'bamboo', timber: 0x96845e }),
  siwa: style({ region: 'Siwa: the palm-rib (jarid) gate between palm-trunk posts', wattle: 'palm', field: 'pole', timber: 0x8c7b62 }),
  ksar: style({ region: 'The Dahar (Chenini): the ksar yard door of palm boards, iron-strapped and studded, under a palm-trunk lintel',
    wattle: 'palm', field: 'pole', timber: 0x7d6a52, adobe: { leaf: 'studded', leafCol: 0x3f6f8a, ironCol: 0x26292b } }),
  wadirum: style({ region: 'Wadi Rum: a sheet-steel yard gate on rendered block piers', wattle: 'palm', field: 'pole',
    adobe: { leaf: 'sheet', leafCol: 0x4f7a6c, ironCol: 0x2c2a28 } }),
  hostomel: style({ region: 'Kyiv oblast: the pole gate', field: 'pole', timber: 0x6c6254 }),
  sarajevo: style({ region: 'Bosnia: the plank field gate', timber: 0x6e6050 }),
  shanghai: style({ region: 'Jiangnan: the plank gate', timber: 0x5c5044 }),
  kyushu: style({ region: 'Aso: cedar gates, grey', timber: 0x77706a }),
  arctic: style({ region: 'Cape Dyer: a timber gate in the drift fence', timber: 0x6a6258 }),
  // the maps with no kit (by map id)
  steppe: style({ region: 'Virgin Lands sovkhoz: the zherdyna pole gate', field: 'pole', timber: 0x75685a }),
  winter: style({ region: 'Podhale: the pole gate of spruce', field: 'pole', timber: 0x6a5e52 }),
  fjord: style({ region: 'Nordland: the roundpole grind', field: 'pole', timber: 0x7a7066 }),
  autumn: style({ region: 'Lorraine: the five-bar gate of oak', timber: 0x76675a }),
});

/** A map's gates: its kit's, or its own (a map with no kit), or the north-west European default. */
export function gateStyleFor(architectureId: string | null | undefined, mapId: string): GateStyle {
  return (architectureId ? GATE_STYLES[architectureId] : undefined) ?? GATE_STYLES[mapId] ?? BASE;
}

// ---------------------------------------------------------------------------------------------------------------
// the builders

/** What a gate builder needs beyond its style: the surface its kind rides on this map. */
export interface GateBuildContext {
  style: GateStyle;
  /** gatestone: the kit's stone (its print kind and tint) and its weather's damp; gateadobe: the render's mean tone */
  stone?: { kind: StoneSurfaceKind; dressed: boolean; tint: Rgb; damp: number };
  render?: { damp: number };
  seed?: number;
}

const ground = 0;
const Y: V3 = [0, 1, 0], X: V3 = [1, 0, 0], Z: V3 = [0, 0, 1];

/** The colour of a member a shade off its family's (each board its own). */
function jitter(col: Rgb, r: () => number, k = 0.12): Rgb {
  const v = 1 + (r() - 0.5) * k, w = 1 + (r() - 0.5) * k * 0.4;
  return [col[0] * v * w, col[1] * v, col[2] * v / w];
}
/** Weathered timber toward its foot (splash, rot) and greyer toward the top (sun). */
function timberShade(col: Rgb): (q: V3) => Rgb {
  return (q) => {
    const foot = Math.max(0, 1 - q[1] / 0.45);
    return mix(col, mulc(col, [0.62, 0.6, 0.56]), foot * 0.6);
  };
}

/** The strap hinge and its pintle on a stile at height y (iron). */
function strapHinge(m: Mesh, z0: number, y: number, len: number, iron: Rgb, uv: UvMode, x = 0.045): void {
  member(m, [x, y, z0 + 0.02], [x, y, z0 + len], 0.012, 0.045, X, iron, uv);
  member(m, [x, y, z0 + len - 0.002], [x, y, z0 + len + 0.03], 0.014, 0.03, X, iron, uv);
}

/**
 * The north European five-bar field gate, hung on its post at z = 0 and swung open by `open`: heel and head stiles, a
 * deep top rail, four lower bars closer toward the foot (stock-proof), the brace from the heel's foot to the top rail,
 * a short dropper, strap hinges on pintles in the hanging post, the latch on the shutting post.
 */
function fiveBarLeaf(m: Mesh, st: GateStyle, W: number, r: () => number, broken: boolean): void {
  const timber = hexLin(st.timber), iron = hexLin(st.iron);
  const g = (u0: number): UvMode => ({ kind: 'grain', u0 });
  const L = W - 0.3, y0 = 0.14, H = 1.12;
  const start = m.mark;
  const heel = jitter(timber, r), head = jitter(timber, r);
  const sh = timberShade(heel);
  member(m, [0, y0 - 0.02, 0.14], [0, y0 + H + 0.04, 0.14], 0.075, 0.11, Z, heel, g(0.05), { chamfer: 0.012, shade: sh });
  member(m, [0, y0, 0.14 + L], [0, y0 + H - 0.02, 0.14 + L], 0.065, 0.085, Z, head, g(0.27), { chamfer: 0.01, shade: timberShade(head) });
  // the bars: the top rail deep, the lower ones closer toward the foot
  const bars = [0.0, 0.2, 0.37, 0.55, 0.78].map((f) => y0 + 0.05 + f * (H - 0.18));
  bars.push(y0 + H - 0.04);
  bars.forEach((y, i) => {
    const top = i === bars.length - 1;
    member(m, [0, y, 0.14 + 0.04], [0, y, 0.14 + L - 0.035], top ? 0.07 : 0.032, top ? 0.1 : 0.085, X, jitter(timber, r),
      g(0.05 + (i % 4) * 0.22), { chamfer: top ? 0.012 : 0.006, shade: timberShade(timber) });
  });
  // the brace: from the heel's foot to the top rail at two thirds out, on the face (in compression)
  member(m, [0.035, y0 + 0.06, 0.2], [0.035, y0 + H - 0.1, 0.14 + L * 0.62], 0.028, 0.085, X, jitter(timber, r), g(0.49), { chamfer: 0.006 });
  // the dropper: a short upright mid-leaf from the top rail to the second bar
  member(m, [0.035, bars[1] - 0.03, 0.14 + L * 0.5], [0.035, y0 + H - 0.06, 0.14 + L * 0.5], 0.026, 0.075, X, jitter(timber, r), g(0.71));
  strapHinge(m, 0.12, y0 + H - 0.04, 0.55, iron, g(0.9));
  strapHinge(m, 0.12, y0 + 0.09, 0.42, iron, g(0.9));
  // the latch on the head
  member(m, [0.05, y0 + H - 0.2, 0.14 + L - 0.18], [0.05, y0 + H - 0.2, 0.14 + L + 0.05], 0.018, 0.035, X, iron, g(0.9));
  if (broken) {
    // off its hinges: laid down on its face beside the post, a bar snapped and lifted
    m.tilt(start, [0, 0, 0.14], Z, Math.PI / 2 - 0.07);
    m.turn(start, 0, 0, 0.35);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.25 + 0.03);
  } else {
    m.turn(start, 0, 0.0, st.open);
  }
}

/** The ranch gate: wide pine boards on two uprights, a diagonal board, bolts; heavy round posts. */
function ranchLeaf(m: Mesh, st: GateStyle, W: number, r: () => number, broken: boolean): void {
  const timber = hexLin(st.timber), iron = hexLin(st.iron);
  const g = (u0: number): UvMode => ({ kind: 'grain', u0 });
  const L = W - 0.34, y0 = 0.18, H = 1.18, start = m.mark;
  for (const z of [0.18, 0.18 + L * 0.5, 0.18 + L]) {
    member(m, [0.04, y0, z], [0.04, y0 + H, z], 0.14, 0.035, Z, jitter(timber, r), g(0.05 + z * 0.1), { shade: timberShade(timber) });
  }
  for (let k = 0; k < 4; k++) {
    const y = y0 + 0.1 + k * (H - 0.2) / 3;
    member(m, [0, y, 0.12], [0, y, 0.18 + L + 0.06], 0.03, 0.15, X, jitter(timber, r), g(0.03 + k * 0.22), { chamfer: 0.004, shade: timberShade(timber) });
  }
  member(m, [-0.03, y0 + 0.12, 0.2], [-0.03, y0 + H - 0.12, 0.18 + L - 0.06], 0.026, 0.13, X, jitter(timber, r), g(0.6));
  strapHinge(m, 0.08, y0 + H - 0.14, 0.5, iron, g(0.9), 0.025);
  strapHinge(m, 0.08, y0 + 0.14, 0.5, iron, g(0.9), 0.025);
  if (broken) {
    m.tilt(start, [0, 0, 0.12], Z, Math.PI / 2 - 0.05);
    m.turn(start, 0, 0, -0.3);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.25 + 0.03);
  } else m.turn(start, 0, 0, st.open * 0.85);
}

/** The pole gate (zherdyna, the north's grind): rails of round poles pinned through two uprights, a diagonal pole. */
function poleLeaf(m: Mesh, st: GateStyle, W: number, r: () => number, broken: boolean, bamboo = false): void {
  const timber = hexLin(st.timber);
  const L = W - 0.3, y0 = 0.16, H = 1.1, start = m.mark;
  const node = bamboo ? { nodes: 4, nodeCol: mul(timber, 0.7) } : {};
  for (const z of [0.15, 0.15 + L]) pole(m, [0, y0 - 0.06, z], [0, y0 + H + 0.08, z], bamboo ? 0.032 : 0.045, bamboo ? 0.03 : 0.038, jitter(timber, r), 0.1 + z * 0.1, 6, node);
  const n = bamboo ? 5 : 4;
  for (let k = 0; k < n; k++) {
    const y = y0 + 0.08 + k * (H - 0.12) / (n - 1);
    const sag = (r() - 0.5) * 0.04;
    pole(m, [0.05 * (k % 2 ? 1 : -1), y, 0.09], [0.05 * (k % 2 ? 1 : -1), y + sag, 0.15 + L + 0.08], bamboo ? 0.024 : 0.034, bamboo ? 0.022 : 0.026,
      jitter(timber, r), 0.05 + k * 0.2, 6, bamboo ? { nodes: 5, nodeCol: mul(timber, 0.72) } : {});
  }
  pole(m, [-0.06, y0 + 0.05, 0.2], [-0.06, y0 + H - 0.04, 0.15 + L - 0.06], bamboo ? 0.022 : 0.03, bamboo ? 0.02 : 0.026, jitter(timber, r), 0.66);
  if (broken) {
    m.tilt(start, [0, 0, 0.1], Z, Math.PI / 2 - 0.08);
    m.turn(start, 0, 0, 0.4);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.3 + 0.03);
  } else m.turn(start, 0, 0, st.open);
}

/** A gate post: square sawn with a weathered top (or round), set in the ground, its cap. */
function gatePost(m: Mesh, z: number, h: number, w: number, col: Rgb, round: boolean, r: () => number, broken: boolean,
  opts: { cap?: 'pyramid' | 'flat' | 'none'; u0?: number; capCol?: Rgb; bamboo?: boolean } = {}): void {
  const top = broken ? 0.28 + r() * 0.25 : h;
  if (round) {
    pole(m, [0, -0.2, z], [0, top, z], w * 0.55, w * 0.48, col, opts.u0 ?? 0.3, 7, opts.bamboo ? { nodes: 4, nodeCol: mul(col, 0.7) } : {});
  } else {
    member(m, [0, -0.2, z], [0, top, z], w, w, Z, col, { kind: 'grain', u0: opts.u0 ?? 0.3 }, { chamfer: w * 0.08, shade: timberShade(col) });
    if (!broken && opts.cap === 'pyramid') {
      // a pyramid cap: four sloped faces over the post's top
      const c: V3 = [0, h + w * 0.42, z], hw = w * 0.56, cc = opts.capCol ?? mul(col, 0.92);
      const corners: V3[] = [[hw, h, z + hw], [-hw, h, z + hw], [-hw, h, z - hw], [hw, h, z - hw]];
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) % 4], out = norm([ (a[0] + b[0]) / 2, 0.5, (a[2] + b[2]) / 2 - z]);
        const col2 = m.colour(cc, true);
        m.tri(a, b, c, out, out, out, [0.5, 0], [0.6, 0], [0.55, 0.06], col2);
      }
    }
  }
  if (broken) {
    // the snapped head lying beside the stub
    const len = h - top;
    if (len > 0.3) {
      const s = m.mark;
      if (round) pole(m, [0.25, 0.06, z + 0.1], [0.25, 0.06, z + 0.1 + len * 0.9], w * 0.5, w * 0.45, mul(col, 0.95), 0.4, 6);
      else member(m, [0.28, w / 2, z + 0.1], [0.28, w / 2, z + 0.1 + len * 0.9], w, w, Y, mul(col, 0.95), { kind: 'grain', u0: 0.45 });
      m.turn(s, 0.25, z, 0.5 + r() * 0.5);
    }
  }
}

function buildFieldGate(ctx: GateBuildContext, broken: boolean): THREE.BufferGeometry {
  const st = ctx.style, r = stream(0x9a7e + (ctx.seed ?? 0));
  const m = new Mesh({ kind: 'wood' });
  const W = GATE_WIDTH.gate, timber = hexLin(st.timber);
  const post = mix(timber, [0.08, 0.07, 0.06], 0.25);
  if (st.field === 'fivebar') {
    gatePost(m, 0.0, 1.5, 0.19, post, false, r, broken, { cap: 'none', u0: 0.07 });
    gatePost(m, W - 0.04, 1.32, 0.15, post, false, r, broken, { cap: 'none', u0: 0.31 });
    fiveBarLeaf(m, st, W, r, broken);
  } else if (st.field === 'ranch') {
    gatePost(m, 0.0, 1.65, 0.24, post, true, r, broken, { u0: 0.07 });
    gatePost(m, W - 0.04, 1.5, 0.22, post, true, r, broken, { u0: 0.31 });
    ranchLeaf(m, st, W, r, broken);
  } else {
    const bamboo = st.field === 'bamboo';
    gatePost(m, 0.0, 1.45, bamboo ? 0.1 : 0.16, post, true, r, broken, { u0: 0.07, bamboo });
    gatePost(m, W - 0.04, 1.35, bamboo ? 0.09 : 0.14, post, true, r, broken, { u0: 0.31, bamboo });
    poleLeaf(m, st, W, r, broken, bamboo);
  }
  return m.geometry();
}

/** The picket wicket: a post at each end and one between, the wicket of pointed pickets on two ledges with its brace
 *  hung open, the fixed panel of the fence's own pickets beside it, the posts' pyramid caps. */
function buildPicketGate(ctx: GateBuildContext, broken: boolean): THREE.BufferGeometry {
  const st = ctx.style, r = stream(0x91c4 + (ctx.seed ?? 0));
  const m = new Mesh({ kind: 'wood' });
  const W = GATE_WIDTH.gatepicket, paint = hexLin(st.picket), iron = hexLin(st.iron);
  const g = (u0: number): UvMode => ({ kind: 'grain', u0 });
  const mid = 1.12;
  for (const [z, h] of [[0.0, 1.22], [mid, 1.18], [W - 0.03, 1.12]] as const) {
    gatePost(m, z, h, 0.11, mul(paint, 0.94), false, r, broken, { cap: 'pyramid', u0: 0.07 + z * 0.1 });
  }
  /** a panel of pickets from z0 to z1 on ledges, its pickets pointed */
  const panel = (z0: number, z1: number, brace: boolean, offset: number) => {
    const n = Math.max(3, Math.round((z1 - z0) / 0.125));
    for (let k = 0; k < n; k++) {
      const z = z0 + (k + 0.5) * (z1 - z0) / n, h = 0.98 + (r() - 0.5) * 0.03;
      const c = jitter(paint, r, 0.08);
      member(m, [offset + 0.04, 0.1, z], [offset + 0.04, h - 0.06, z], 0.07, 0.022, Z, c, g(0.05 + (k % 3) * 0.12), { shade: timberShade(c) });
      // the pointed head: two sloped faces meeting at a ridge
      const yb = h - 0.06, yt = h + 0.02, x0 = offset + 0.04 - 0.011, x1 = offset + 0.04 + 0.011, za = z - 0.035, zb = z + 0.035;
      const cc = m.colour(c, true);
      for (const [xa, nx] of [[x0, -1], [x1, 1]] as const) {
        m.tri([xa, yb, za], [xa, yb, zb], [xa, yt, z], [nx, 0, 0], [nx, 0, 0], [nx, 0, 0], [0.1, 0], [0.12, 0], [0.11, 0.04], cc);
      }
      for (const [zz, nz] of [[za, -1], [zb, 1]] as const) {
        const nrm = norm([0, 0.45, nz]);
        m.tri([x0, yb, zz], [x1, yb, zz], [x0 + 0.011, yt, z], nrm, nrm, nrm, [0.1, 0], [0.12, 0], [0.11, 0.04], cc);
      }
    }
    for (const y of [0.3, 0.78]) member(m, [offset, y, z0 + 0.02], [offset, y, z1 - 0.02], 0.03, 0.07, X, mul(paint, 0.9), g(0.6));
    if (brace) member(m, [offset - 0.005, 0.34, z0 + 0.08], [offset - 0.005, 0.74, z1 - 0.08], 0.026, 0.065, X, mul(paint, 0.9), g(0.7));
  };
  // the fixed panel, as the fence
  panel(mid + 0.06, W - 0.08, false, 0);
  // the wicket
  const start = m.mark;
  panel(0.08, mid - 0.06, true, 0.02);
  strapHinge(m, 0.06, 0.78, 0.3, iron, g(0.9), -0.005);
  strapHinge(m, 0.06, 0.3, 0.3, iron, g(0.9), -0.005);
  if (broken) {
    m.tilt(start, [0, 0, 0.06], Z, Math.PI / 2 - 0.06);
    m.turn(start, 0, 0, 0.5);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.2 + 0.03);
    // and the fixed panel knocked flat too (a hull through the gate takes the whole module)
  } else m.turn(start, 0, 0, st.open * 1.2);
  if (broken) {
    // the fixed panel's pickets down: tilt everything above the stubs that is not the wicket (written before it)
    for (let i = 0; i < start; i += 3) {
      if (m.p[i + 1] > 0.5 && m.p[i + 2] > mid) { m.p[i] += (m.p[i + 1] - 0.4) * 0.9; m.p[i + 1] = 0.05 + m.p[i + 1] * 0.08; }
    }
  }
  return m.geometry();
}

/** The woven fence's gate. */
function buildWattleGate(ctx: GateBuildContext, broken: boolean): THREE.BufferGeometry {
  const st = ctx.style, r = stream(0x3a71 + (ctx.seed ?? 0));
  const m = new Mesh({ kind: 'wood' });
  const W = GATE_WIDTH.gatewattle, timber = hexLin(st.timber), iron = hexLin(st.iron);
  const g = (u0: number): UvMode => ({ kind: 'grain', u0 });
  const withy = mix(timber, [0.2, 0.17, 0.12], 0.25);
  const form = st.wattle;
  if (form === 'khvirtka') {
    // the khvirtka: two stout posts carrying a little gabled board roof over the wicket, the wicket of riven palings on
    // two rails with its brace, a woven panel of the tyn beside it on stakes
    const post = mix(timber, [0.07, 0.06, 0.05], 0.2), wick = 1.15, h = broken ? 0.5 : 1.95;
    pole(m, [0, -0.2, 0.0], [0, broken ? 0.45 : h, 0.0], 0.095, 0.085, post, 0.07, 7);
    pole(m, [0, -0.2, wick], [0, broken ? 0.55 : h, wick], 0.095, 0.085, post, 0.31, 7);
    if (!broken) {
      // the head beam, the two roof boards and the ridge board
      member(m, [0, h + 0.05, -0.18], [0, h + 0.05, wick + 0.18], 0.13, 0.1, Y, jitter(post, r), g(0.5), { chamfer: 0.01 });
      for (const sx of [-1, 1]) {
        member(m, [sx * 0.21, h + 0.12, -0.3], [sx * 0.21, h + 0.12, wick + 0.3], 0.5, 0.025, [-sx, 1.2, 0], jitter(mul(timber, 0.8), r), g(0.2 + sx * 0.05));
      }
      member(m, [0, h + 0.33, -0.32], [0, h + 0.33, wick + 0.32], 0.05, 0.05, Y, mul(timber, 0.75), g(0.8));
    } else {
      // the roof boards fallen in front
      member(m, [0.6, 0.05, -0.2], [0.75, 0.04, wick + 0.25], 0.48, 0.025, Y, mul(timber, 0.8), g(0.15));
      member(m, [-0.5, 0.06, 0.1], [-0.45, 0.05, wick + 0.4], 0.46, 0.025, Y, mul(timber, 0.78), g(0.35));
      member(m, [0.3, 0.07, 0.2], [0.35, 0.07, wick + 0.1], 0.13, 0.1, Y, post, g(0.5));
    }
    const start = m.mark;
    for (let k = 0; k < 9; k++) {
      const z = 0.1 + (k + 0.5) * (wick - 0.2) / 9, c = jitter(timber, r, 0.18);
      member(m, [0.04, 0.12, z], [0.04, 1.28 + (r() - 0.5) * 0.06, z], 0.085 + r() * 0.02, 0.025, Z, c, g(0.05 + (k % 4) * 0.2), { shade: timberShade(c) });
    }
    for (const y of [0.32, 1.02]) member(m, [0, y, 0.08], [0, y, wick - 0.08], 0.035, 0.07, X, jitter(timber, r), g(0.6));
    member(m, [-0.01, 0.36, 0.14], [-0.01, 0.98, wick - 0.14], 0.03, 0.07, X, jitter(timber, r), g(0.7));
    strapHinge(m, 0.06, 1.0, 0.28, iron, g(0.9), -0.03);
    strapHinge(m, 0.06, 0.34, 0.28, iron, g(0.9), -0.03);
    if (broken) {
      m.tilt(start, [0, 0, 0.06], Z, Math.PI / 2 - 0.05);
      m.turn(start, 0, 0, 0.6);
      for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.22 + 0.03);
    } else m.turn(start, 0, 0, st.open);
    // the woven panel of the tyn from the second post to the end, on its stakes
    wattlePanel(m, wick + 0.06, W - 0.02, withy, timber, r, broken, 1.15);
    return m.geometry();
  }
  // the other forms: stakes at both ends, the leaf
  const bamboo = form === 'bamboo', palm = form === 'palm', coyote = form === 'coyote';
  const post = palm ? mix(timber, [0.25, 0.2, 0.15], 0.3) : mix(timber, [0.08, 0.07, 0.06], 0.2);
  gatePost(m, 0.0, 1.3, bamboo ? 0.09 : palm ? 0.2 : 0.12, post, true, r, broken, { u0: 0.07, bamboo });
  gatePost(m, W - 0.04, 1.25, bamboo ? 0.09 : palm ? 0.2 : 0.12, post, true, r, broken, { u0: 0.31, bamboo });
  const start = m.mark;
  const L = W - 0.22;
  if (form === 'hurdle') {
    // a hurdle: two stiles and the sails between, withies woven over and under
    for (const z of [0.11, 0.11 + L]) pole(m, [0, 0.06, z], [0, 1.12, z], 0.032, 0.028, jitter(timber, r), 0.1, 6);
    const sails = 7;
    for (let k = 0; k < sails; k++) {
      const z = 0.11 + (k + 0.5) * L / sails;
      pole(m, [0, 0.08, z], [0, 1.06, z], 0.016, 0.014, jitter(withy, r), 0.2 + k * 0.05, 5);
    }
    for (let row = 0; row < 9; row++) {
      const y = 0.16 + row * 0.1;
      for (let k = 0; k <= sails; k++) {
        const za = 0.11 + (k === 0 ? 0 : (k - 0.5) * L / sails), zb = 0.11 + Math.min(L, (k + 0.5) * L / sails);
        const x = ((k + row) % 2 ? 1 : -1) * 0.022;
        pole(m, [x, y, za], [-x, y + 0.004, zb], 0.013, 0.013, jitter(withy, r, 0.2), 0.4 + (row % 3) * 0.1, 4);
      }
    }
  } else {
    // sticks, ribs or canes upright on two rails (the coyote gate's juniper of uneven height, the jarid's pale ribs)
    const n = coyote ? 13 : palm ? 18 : 11;
    for (const y of [0.32, 0.92]) {
      if (bamboo) pole(m, [0.03, y, 0.08], [0.03, y, L + 0.14], 0.022, 0.02, jitter(timber, r), 0.6, 6, { nodes: 4, nodeCol: mul(timber, 0.7) });
      else member(m, [0.03, y, 0.08], [0.03, y, L + 0.14], 0.04, 0.06, X, jitter(post, r), g(0.6));
    }
    const rib = palm ? mix(timber, [0.62, 0.55, 0.42], 0.55) : timber;
    for (let k = 0; k < n; k++) {
      const z = 0.12 + (k + 0.5) * (L - 0.04) / n, top = coyote ? 1.05 + r() * 0.35 : palm ? 1.2 + (r() - 0.5) * 0.06 : 1.15;
      const c = jitter(rib, r, coyote ? 0.25 : 0.14);
      if (bamboo) pole(m, [-0.01, 0.1, z], [-0.01, top, z], 0.02, 0.018, c, 0.1 + k * 0.03, 6, { nodes: 3, nodeCol: mul(c, 0.7) });
      else pole(m, [-0.01, 0.08, z + (coyote ? (r() - 0.5) * 0.03 : 0)], [-0.01 + (coyote ? (r() - 0.5) * 0.05 : 0), top, z], palm ? 0.014 : 0.026, palm ? 0.008 : 0.02, c, 0.1 + k * 0.03, 5);
    }
  }
  if (broken) {
    m.tilt(start, [0, 0, 0.08], Z, Math.PI / 2 - 0.06);
    m.turn(start, 0, 0, 0.45);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.22 + 0.03);
  } else m.turn(start, 0, 0, st.open);
  return m.geometry();
}

/** A woven panel (the tyn's): stakes and withies from z0 to z1, `h` high (flattened when broken). */
function wattlePanel(m: Mesh, z0: number, z1: number, withy: Rgb, timber: Rgb, r: () => number, broken: boolean, h: number): void {
  const start = m.mark, n = Math.max(3, Math.round((z1 - z0) / 0.3));
  for (let k = 0; k <= n; k++) {
    const z = z0 + k * (z1 - z0) / n;
    pole(m, [0, -0.1, z], [0, h + 0.05 + (r() - 0.5) * 0.06, z], 0.022, 0.018, jitter(timber, r), 0.1 + k * 0.04, 5);
  }
  for (let row = 0; row < 10; row++) {
    const y = 0.12 + row * (h - 0.14) / 10;
    for (let k = 0; k < n; k++) {
      const za = z0 + k * (z1 - z0) / n, zb = z0 + (k + 1) * (z1 - z0) / n, x = ((k + row) % 2 ? 1 : -1) * 0.02;
      pole(m, [x, y, za], [-x, y + 0.006, zb], 0.014, 0.014, jitter(withy, r, 0.22), 0.4 + (row % 3) * 0.1, 4);
    }
  }
  if (broken) {
    for (let i = start; i < m.mark; i += 3) {
      if (m.p[i + 1] > 0.35) { m.p[i] += (m.p[i + 1] - 0.3) * 0.95; m.p[i + 1] = 0.06 + m.p[i + 1] * 0.06; }
    }
  }
}

/**
 * A dressed stone pier (kit stone): its plinth course, its shaft with chamfered arrises, a string under its cap, the cap
 * of its region; the foot darker with the kit's damp. `z` its centre along the run.
 */
function pier(m: Mesh, z: number, st: StoneGateStyle, ctx: GateBuildContext, r: () => number, broken: boolean, side: -1 | 1): void {
  const S = ctx.stone!, wash = st.pierWash ? hexLin(st.pierWash) : null;
  const base: Rgb = wash ? mulc(wash, [1 / S.tint[0], 1 / S.tint[1], 1 / S.tint[2]]).map((v) => Math.min(1.6, v)) as unknown as Rgb : [1, 1, 1];
  const shade = (q: V3): Rgb => mul(base, wallWeather(q[1], S.damp));
  const w = 0.5, d = 0.56, H = broken ? 0.55 + r() * 0.35 : st.pierH;
  const masonry: UvMode = { kind: 'masonry' };
  // the plinth course, a little proud
  member(m, [0, -0.15, z], [0, 0.32, z], d + 0.08, w + 0.08, Z, base, masonry, { chamfer: 0.03, shade });
  // the shaft
  const top = broken ? H : H - 0.18;
  if (broken) {
    // a ragged top: the shaft to a broken course, a block or two knocked askew
    member(m, [0, 0.3, z], [0, top, z], d, w, Z, base, masonry, { chamfer: 0.02, shade });
    const s = m.mark;
    member(m, [0, top - 0.02, z - 0.06], [0, top + 0.2, z - 0.06], d * 0.6, w * 0.7, Z, base, masonry, { chamfer: 0.02, shade });
    m.tilt(s, [0, top, z], X, 0.25 * side);
  } else member(m, [0, 0.3, z], [0, top, z], d, w, Z, base, masonry, { chamfer: 0.025, shade });
  const capCol = mul(base, 0.97);
  if (!broken) {
    // the string course under the cap
    member(m, [0, top, z], [0, top + 0.08, z], d + 0.07, w + 0.07, Z, capCol, masonry, { chamfer: 0.015 });
    const cy = top + 0.08;
    if (st.cap === 'moulded' || st.cap === 'pyramid') {
      if (st.cap === 'moulded') member(m, [0, cy, z], [0, cy + 0.07, z], d + 0.12, w + 0.12, Z, capCol, masonry, { chamfer: 0.03 });
      const y1 = st.cap === 'moulded' ? cy + 0.07 : cy, hw = (st.cap === 'moulded' ? d + 0.12 : d + 0.07) / 2, hd = (st.cap === 'moulded' ? w + 0.12 : w + 0.07) / 2;
      const apex: V3 = [0, y1 + (st.cap === 'moulded' ? 0.26 : 0.2), z];
      const cs: V3[] = [[hd, y1, z + hw], [-hd, y1, z + hw], [-hd, y1, z - hw], [hd, y1, z - hw]];
      for (let k = 0; k < 4; k++) {
        const a = cs[k], b = cs[(k + 1) % 4];
        const out = norm([(a[0] + b[0]) / 2, 0.55, (a[2] + b[2]) / 2 - z]);
        m.quad(a, b, apex, apex, out, (q) => [q[0] * STONE_UV_PER_M + q[1] * 0.3, q[2] * STONE_UV_PER_M], () => capCol, true);
      }
      if (st.cap === 'moulded') {
        // a ball finial
        pole(m, [0, apex[1] - 0.04, z], [0, apex[1] + 0.12, z], 0.08, 0.06, capCol, 0.5, 8);
      }
    } else if (st.cap === 'dome') {
      for (let k = 0; k < 3; k++) {
        const f = k / 3, f1 = (k + 1) / 3;
        member(m, [0, cy + f * 0.22, z], [0, cy + f1 * 0.22, z], (d + 0.06) * Math.cos(f * 1.2), (w + 0.06) * Math.cos(f * 1.2), Z, capCol, masonry, { chamfer: 0.03 });
      }
    } else if (st.cap === 'slab') {
      member(m, [0, cy, z], [0, cy + 0.1, z], d + 0.16, w + 0.16, Z, capCol, masonry, { chamfer: 0.02 });
    } else if (st.cap === 'tiled') {
      // a little two-way roof of canal tiles: the tile colour on the flat texel
      member(m, [0, cy, z], [0, cy + 0.06, z], d + 0.14, w + 0.14, Z, capCol, masonry, { chamfer: 0.01 });
      const tile = hexLin(0xa65a36);
      for (const sx of [-1, 1] as const) {
        for (let k = 0; k < 4; k++) {
          const zz = z - (d + 0.14) / 2 + (k + 0.5) * (d + 0.14) / 4;
          member(m, [sx * 0.01, cy + 0.07, zz], [sx * 0.34, cy - 0.05, zz], 0.13, 0.045, Z, jitter(tile, r), { kind: 'flat' });
        }
      }
    }
  } else {
    // the cap fallen at the foot
    const s = m.mark;
    member(m, [0.45 * side, 0.05, z + 0.15], [0.45 * side, 0.2, z + 0.15], d + 0.07, w + 0.07, Z, capCol, masonry, { chamfer: 0.02 });
    m.tilt(s, [0.45 * side, 0.05, z + 0.15], Z, 0.35);
    // two blocks off its top
    for (let k = 0; k < 2; k++) {
      const s2 = m.mark;
      const x = (0.5 + r() * 0.5) * side, zz = z + (r() - 0.5) * 0.9;
      member(m, [x, 0.0, zz], [x, 0.22, zz], 0.36, 0.28, Z, base, masonry, { chamfer: 0.03, shade });
      m.tilt(s2, [x, 0, zz], [r() - 0.5, 0, r() - 0.5], 0.4 + r() * 0.5);
    }
  }
}

/** The leaf (or two) between the piers of a stone gate: ledged oak, a plank gate, or wrought iron. */
function stoneLeaf(m: Mesh, ctx: GateBuildContext, z0: number, z1: number, r: () => number, broken: boolean): void {
  const st = ctx.style.stone, leafCol = hexLin(st.leafCol), iron = hexLin(st.ironCol);
  const flat: UvMode = { kind: 'flat' };
  const leaves: Array<[number, number, 1 | -1]> = st.double
    ? [[z0, (z0 + z1) / 2 - 0.01, 1], [(z0 + z1) / 2 + 0.01, z1, -1]] : [[z0, z1, 1]];
  leaves.forEach(([a, b, dir], li) => {
    const start = m.mark, hinge = dir > 0 ? a : b, L = b - a;
    const H = st.leaf === 'iron' ? st.pierH - 0.25 : st.pierH - 0.15, y0 = 0.08;
    if (st.leaf === 'iron') {
      // rails, bars with spear finials, dog bars at the foot, a scroll under the top rail
      for (const y of [y0 + 0.08, y0 + H * 0.82]) member(m, [0, y, a + 0.03], [0, y, b - 0.03], 0.016, 0.045, X, iron, flat);
      member(m, [0, y0, hinge], [0, y0 + H, hinge], 0.035, 0.035, Z, iron, flat);
      const n = Math.round(L / 0.12);
      for (let k = 0; k < n; k++) {
        const z = a + (k + 0.5) * L / n;
        member(m, [0, y0 + 0.04, z], [0, y0 + H, z], 0.016, 0.016, Z, iron, flat);
        // the spear head
        member(m, [0, y0 + H, z], [0, y0 + H + 0.07, z], 0.028, 0.006, Z, iron, flat);
        if (k % 2 === 0) member(m, [0, y0 + 0.04, z + L / n / 2], [0, y0 + 0.3, z + L / n / 2], 0.012, 0.012, Z, iron, flat);
      }
      // the scroll: a ring of short bars under the top rail mid-leaf
      const zc = (a + b) / 2, yc = y0 + H * 0.82 - 0.14;
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8 * Math.PI * 2, t1 = (k + 1) / 8 * Math.PI * 2;
        member(m, [0, yc + Math.sin(t0) * 0.1, zc + Math.cos(t0) * 0.1], [0, yc + Math.sin(t1) * 0.1, zc + Math.cos(t1) * 0.1], 0.012, 0.012, X, iron, flat);
      }
    } else {
      // boards upright, two ledges and a brace on the back, strap hinges and their nails on the face
      const n = Math.max(4, Math.round(L / 0.16));
      for (let k = 0; k < n; k++) {
        const z = a + (k + 0.5) * L / n, c = jitter(leafCol, r, 0.1);
        const top = st.leaf === 'plank' ? y0 + H - 0.06 : y0 + H;
        member(m, [0, y0, z], [0, top, z], L / n - 0.008, 0.035, Z, c, flat, { shade: timberShade(c) });
      }
      for (const y of [y0 + 0.22, y0 + H - 0.24]) member(m, [-0.04, y, a + 0.05], [-0.04, y, b - 0.05], 0.04, 0.13, X, mul(leafCol, 0.9), flat);
      const ya = y0 + 0.28, yb = y0 + H - 0.3;
      member(m, [-0.045, ya, dir > 0 ? a + 0.1 : b - 0.1], [-0.045, yb, dir > 0 ? b - 0.12 : a + 0.12], 0.035, 0.11, X, mul(leafCol, 0.88), flat);
      for (const y of [y0 + 0.22, y0 + H - 0.24]) {
        member(m, [0.022, y, hinge], [0.022, y, hinge + dir * L * 0.62], 0.008, 0.05, X, iron, flat);
      }
      if (st.leaf === 'ledged' && li === 0) member(m, [0.03, y0 + H * 0.5, b - 0.12], [0.03, y0 + H * 0.5, b - 0.02], 0.02, 0.05, X, iron, flat);
    }
    if (broken) {
      // off its pintles, face down across the gateway, an iron leaf bent
      m.tilt(start, [0, 0, hinge], Z, (Math.PI / 2 - 0.05) * (li ? -1 : 1));
      m.turn(start, 0, hinge, (li ? -0.3 : 0.25) + (r() - 0.5) * 0.2);
      for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * (st.leaf === 'iron' ? 0.12 : 0.3) + 0.03);
    } else {
      // the hanging leaf open into the yard, the other near shut
      m.turn(start, 0, hinge, dir * (li === 0 ? ctx.style.open * 1.1 : 0.16));
    }
  });
}

function buildStoneGate(ctx: GateBuildContext, broken: boolean): THREE.BufferGeometry {
  const S = ctx.stone ?? { kind: 'sandstone' as StoneSurfaceKind, dressed: false, tint: [0.6, 0.55, 0.5] as Rgb, damp: 0.7 };
  const ctx2: GateBuildContext = { ...ctx, stone: S };
  const texel = STONE_FLAT_TEXEL[`${S.kind}${S.dressed ? ':dressed' : ''}`] ?? STONE_FLAT_TEXEL[S.kind] ?? STONE_FLAT_TEXEL.sandstone;
  const tex: Rgb = [lin(texel.srgb[0] * S.tint[0]), lin(texel.srgb[1] * S.tint[1]), lin(texel.srgb[2] * S.tint[2])];
  const m = new Mesh({ kind: 'stone', texel: tex, flatUv: texel.uv });
  const r = stream(0x5707 + (ctx.seed ?? 0)), W = GATE_WIDTH.gatestone, pw = 0.28;
  pier(m, pw, ctx.style.stone, ctx2, r, broken, -1);
  pier(m, W - pw, ctx.style.stone, ctx2, r, broken, 1);
  stoneLeaf(m, ctx2, 2 * pw + 0.01, W - 2 * pw - 0.01, r, broken);
  return m.geometry();
}

/**
 * The mud wall's gate: two rendered mud-brick piers battered and crowned round, a palm-trunk lintel across them, the
 * door of palm boards on strap hinges studded with nail heads (the Dahar's yard door, painted), or a sheet-steel gate
 * on its frame (Wadi Rum). On the kit's render (regionalPlaster), as the ksar gate post: the render near white, the
 * timber and iron a dark tone over it.
 */
function buildAdobeGate(ctx: GateBuildContext, broken: boolean): THREE.BufferGeometry {
  const R = ctx.render ?? { damp: 0.3 };
  // (texel 1: the colours below are multipliers of the render print, as ksarGate.ts's TIMBER and OPENING are)
  const m = new Mesh({ kind: 'render', texel: [1, 1, 1], flatUv: [0.5, 0.5] });
  const r = stream(0xad0b + (ctx.seed ?? 0)), W = GATE_WIDTH.gateadobe, st = ctx.style.adobe;
  const render: Rgb = [1.0, 0.97, 0.93];
  const shade = (q: V3): Rgb => mul(render, wallWeather(q[1], R.damp));
  const masonry: UvMode = { kind: 'masonry' }, flat: UvMode = { kind: 'flat' };
  const H = 2.05, pw = 0.3;
  for (const [z, side] of [[pw, -1], [W - pw, 1]] as const) {
    const top = broken ? 0.6 + r() * 0.4 : H;
    // battered: the shaft in three lifts, each a little narrower
    for (let k = 0; k < 3; k++) {
      const y0 = (k / 3) * top - (k === 0 ? 0.15 : 0), y1 = ((k + 1) / 3) * top, f = 1 - k * 0.06;
      member(m, [0, y0, z], [0, y1, z], 0.6 * f, 0.62 * f, Z, render, masonry, { chamfer: 0.05, shade });
    }
    if (!broken) {
      // the crown, rubbed round
      member(m, [0, top, z], [0, top + 0.12, z], 0.5, 0.52, Z, render, masonry, { chamfer: 0.1, shade });
    } else {
      for (let k = 0; k < 3; k++) {
        const s = m.mark, x = (0.4 + r() * 0.5) * side, zz = z + (r() - 0.5) * 0.8;
        member(m, [x, 0, zz], [x, 0.16 + r() * 0.1, zz], 0.4, 0.3, Z, mul(render, 0.95), masonry, { chamfer: 0.06, shade });
        m.tilt(s, [x, 0, zz], [r() - 0.5, 0, r() - 0.5], 0.5);
      }
    }
  }
  const timber: Rgb = [0.42, 0.31, 0.21], leafCol = paintOverRender(st.leafCol), iron: Rgb = [0.075, 0.07, 0.068];
  if (!broken) {
    // the palm-trunk lintel bedded on the piers' crowns
    pole(m, [0, H + 0.2, 0.05], [0, H + 0.2, W - 0.05], 0.12, 0.11, timber, 0.5, 7);
  } else {
    pole(m, [0.5, 0.11, 0.2], [0.9, 0.1, W - 0.3], 0.11, 0.1, timber, 0.5, 7);
  }
  // fix the lintel and the leaves to the flat texel: written as poles (grain uv), re-pointed below
  const leafStart = m.mark;
  const a = 2 * pw + 0.02, b = W - 2 * pw - 0.02, L = b - a, y0 = 0.06, hL = H - 0.1;
  if (st.leaf === 'studded') {
    const n = 6;
    for (let k = 0; k < n; k++) {
      const z = a + (k + 0.5) * L / n, c = jitter(leafCol, r, 0.08);
      member(m, [0, y0, z], [0, hL, z], L / n - 0.008, 0.045, Z, c, flat);
    }
    for (const y of [y0 + 0.25, y0 + (hL - y0) * 0.5, hL - 0.25]) {
      member(m, [0.028, y, a + 0.02], [0.028, y, b - 0.02], 0.01, 0.06, X, iron, flat);
      for (let k = 0; k < 9; k++) member(m, [0.036, y, a + 0.1 + k * (L - 0.2) / 8], [0.05, y, a + 0.1 + k * (L - 0.2) / 8], 0.025, 0.025, X, iron, flat);
    }
  } else {
    // sheet steel on an angle frame, two pressed panels, the bolt
    member(m, [0, y0, a], [0, hL, a], 0.05, 0.05, Z, iron, flat);
    member(m, [0, y0, b], [0, hL, b], 0.05, 0.05, Z, iron, flat);
    for (const y of [y0 + 0.03, (y0 + hL) / 2, hL - 0.03]) member(m, [0, y, a], [0, y, b], 0.05, 0.05, Y, iron, flat);
    for (const [ya, yb] of [[y0 + 0.06, (y0 + hL) / 2 - 0.03], [(y0 + hL) / 2 + 0.03, hL - 0.06]] as const) {
      member(m, [0.004, ya, (a + b) / 2], [0.004, yb, (a + b) / 2], L - 0.08, 0.012, Z, jitter(leafCol, r, 0.06), flat);
    }
  }
  if (broken) {
    m.tilt(leafStart, [0, 0, a], Z, Math.PI / 2 - 0.05);
    m.turn(leafStart, 0, a, 0.3);
    for (let i = leafStart; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.01, m.p[i + 1] * 0.22 + 0.04);
  } else m.turn(leafStart, 0, a, ctx.style.open * 0.9);
  return m.geometry();
}

/** A paint (sRGB hex) as a multiplier of a light render print (its mean about 0.7 linear). */
function paintOverRender(hex: number): Rgb { return mul(hexLin(hex), 1 / 0.7); }

/** A family's gate, intact or broken, for this map's style and surfaces. */
export function buildGate(kind: GateKind, ctx: GateBuildContext, broken = false): THREE.BufferGeometry {
  switch (kind) {
    case 'gate': return buildFieldGate(ctx, broken);
    case 'gatepicket': return buildPicketGate(ctx, broken);
    case 'gatewattle': return buildWattleGate(ctx, broken);
    case 'gatestone': return buildStoneGate(ctx, broken);
    case 'gateadobe': return buildAdobeGate(ctx, broken);
  }
}

/** The surface context a map's stone gate reads from its kit (props.ts). */
export function gateStoneOf(style: ArchitectureStyle | null | undefined): GateBuildContext['stone'] {
  if (!style) return undefined;
  const s = style.surfaces.stone;
  return { kind: s.kind, dressed: !!s.dressed, tint: s.tint, damp: style.weather?.damp ?? 0.8 };
}
