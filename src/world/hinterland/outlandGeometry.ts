// src/world/hinterland/outlandGeometry.ts — the outland's buildings, verticals and trees as geometry, built in the
// worker (HZ.11, the horizons stream, 2026-10-13; B-architecture §4.5). Pure (no THREE): arrays for the wire, which the
// page wraps as buffers (buildings.ts) — the page's main thread never builds a roof.
//
// The plan's buildings (each its kind in the region's kit palette: Zeeland's brick farmhouses under dark glazed tile,
// the long tarred schuur barns under their hipped roofs, white-rendered cottages; the kolkhoz's white-washed rows; the
// Savoyard stone houses), its verticals (a church with its tower, spire and nave, a tower mill with its sails, a
// lighthouse, the pylons of a line, an onion dome, an elevator, a water tower, a fort), the far settlements' houses (the
// plan counts them; they are laid out here along their street and lanes), and the plan's trees (rows, avenues, the
// farms' shelter groups: a Lombardy column, a broad crown, a pollard's knob, a cone, their foliage the season's).
// World-space triangles; each building stands on the drawn land: its base the lowest corner of its footprint on the
// pyramid, its walls carried a metre and a half down.
import type { HinterlandPlan, HinterlandTree } from './outland.ts';
import { samplePyramid, type HinterlandPyramid } from './pyramid.ts';

/** One draw's triangles (non-indexed): positions, normals (snorm8) and linear colours (unorm8, square-root encoded). */
export interface HinterlandShapeArrays { position: Float32Array; normal: Int8Array; color: Uint8Array }

export interface HinterlandOutlandGeometry {
  buildings: HinterlandShapeArrays | null;
  nearTrees: HinterlandShapeArrays | null;
  farTrees: HinterlandShapeArrays | null;
  /** The near trees' indices into the plan's trees (the impostors' set, trees.ts). */
  nearIndex: Uint32Array;
  stats: { buildingTris: number; roadTris: number; nearTreeTris: number; farTreeTris: number; nearTrees: number; farTrees: number; woodsTrees: number; ms: number };
}

type V3 = [number, number, number];

/** The trees nearer than this (m from the centre) are the ones the battlefield's impostors may draw instead (trees.ts):
 * from any eye on the battlefield they stay under 2.5 km, where nothing is compressed. */
export const HINTERLAND_NEAR_TREE_M = 1750;

const srgb = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lin = (rgb: readonly number[]): V3 => [srgb(rgb[0]), srgb(rgb[1]), srgb(rgb[2])];
const hashXZ = (x: number, z: number, k = 0): number => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

interface KitStyle { wall: number[]; roof: number[]; wallH: number; roofH: number; hip?: boolean; roofAlt?: number[] }

/** The kits' palettes (sRGB) and proportions, by building kind (the CPU preview's, hinterland-plan.mjs). */
const KIT_PALETTES: Readonly<Record<string, Readonly<Record<string, KitStyle>>>> = {
  // Zeeland: red-brown brick farmhouses under dark glazed tiles, the long schuur barns black-tarred under a hipped thatch
  // or dark tile, white-rendered cottages here and there
  polder: {
    farmhouse: { wall: [142, 78, 58], roof: [58, 52, 50], wallH: 6, roofH: 6, roofAlt: [128, 64, 44] },
    barn: { wall: [48, 44, 40], roof: [92, 78, 58], wallH: 4.5, roofH: 9, hip: true, roofAlt: [56, 52, 50] },
    granary: { wall: [52, 46, 42], roof: [88, 74, 56], wallH: 4.5, roofH: 7, hip: true },
    cottage: { wall: [150, 86, 64], roof: [154, 74, 46], wallH: 5, roofH: 5, roofAlt: [62, 56, 54] },
    tavern: { wall: [214, 206, 192], roof: [62, 56, 54], wallH: 6.5, roofH: 5.5 },
    woodshed: { wall: [60, 54, 48], roof: [70, 64, 58], wallH: 3.5, roofH: 3 },
    depot: { wall: [120, 84, 66], roof: [74, 70, 66], wallH: 6, roofH: 2.5 },
    default: { wall: [150, 88, 66], roof: [66, 58, 54], wallH: 5.5, roofH: 5.5 },
  },
  // the steppe's kolkhoz: white-washed walls, pale iron or thatched roofs, low
  kolkhoz: {
    default: { wall: [222, 218, 206], roof: [168, 150, 104], wallH: 3.2, roofH: 4, hip: true, roofAlt: [120, 128, 120] },
    barn: { wall: [120, 104, 84], roof: [150, 136, 96], wallH: 4, roofH: 5 },
    granary: { wall: [176, 168, 150], roof: [128, 120, 100], wallH: 5, roofH: 4 },
    depot: { wall: [168, 160, 146], roof: [96, 92, 88], wallH: 6, roofH: 2 },
  },
  // Savoy: rubble stone under big low roofs of slate or lauze
  savoyard: {
    default: { wall: [130, 124, 116], roof: [86, 84, 82], wallH: 6, roofH: 4 },
    barn: { wall: [112, 92, 72], roof: [80, 78, 76], wallH: 5, roofH: 4.5 },
  },
};
const DEFAULT_STYLE: KitStyle = { wall: [196, 184, 166], roof: [128, 66, 52], wallH: 6, roofH: 4.5 };

function styleFor(kit: string | null, kind: string): KitStyle {
  const palette = (kit && KIT_PALETTES[kit]) || null;
  return (palette && (palette[kind] ?? palette.default)) ?? DEFAULT_STYLE;
}

/** Flat-shaded (or smooth, by a normal function) triangles in world space with a colour each. */
class Shapes {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  /** One triangle wound outward from `inside` (a point inside its convex solid). */
  tri(a: V3, b: V3, c: V3, inside: V3, color: V3, smooth?: (p: V3) => V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - inside[0], my = (a[1] + b[1] + c[1]) / 3 - inside[1], mz = (a[2] + b[2] + c[2]) / 3 - inside[2];
    if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      if (smooth) { const n = smooth(p); this.nor.push(n[0], n[1], n[2]); } else this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, inside: V3, color: V3): void {
    this.tri(a, b, c, inside, color); this.tri(a, c, d, inside, color);
  }
  get triangles(): number { return this.pos.length / 9; }
  /** Packed for the wire: positions as floats, normals as signed bytes, linear colours as bytes (both normalised). */
  arrays(): HinterlandShapeArrays | null {
    if (!this.pos.length) return null;
    const normal = new Int8Array(this.nor.length), color = new Uint8Array(this.col.length);
    for (let i = 0; i < this.nor.length; i++) normal[i] = Math.round(Math.max(-1, Math.min(1, this.nor[i])) * 127);
    // (a linear byte, rounded up from the darkest values: a dark tar or slate keeps its tone)
    for (let i = 0; i < this.col.length; i++) color[i] = Math.round(Math.sqrt(Math.max(0, Math.min(1, this.col[i]))) * 255);
    return { position: new Float32Array(this.pos), normal, color };
  }
}

/** A local frame: u right, v up, w forward (the plan's yaw: forward is (sin yaw, cos yaw) in world XZ). */
type Frame = (u: number, v: number, w: number) => V3;
function frame(x: number, y: number, z: number, yaw: number): Frame {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (u, v, w) => [x + u * c + w * s, y + v, z - u * s + w * c];
}

/** A box's four walls and its top (no floor). */
function box(S: Shapes, f: Frame, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number, color: V3, top: V3 | null = color): void {
  const inside = f((u0 + u1) / 2, (v0 + v1) / 2, (w0 + w1) / 2);
  const p = (u: number, v: number, w: number): V3 => f(u, v, w);
  S.quad(p(u0, v0, w0), p(u1, v0, w0), p(u1, v1, w0), p(u0, v1, w0), inside, color);
  S.quad(p(u0, v0, w1), p(u1, v0, w1), p(u1, v1, w1), p(u0, v1, w1), inside, color);
  S.quad(p(u0, v0, w0), p(u0, v0, w1), p(u0, v1, w1), p(u0, v1, w0), inside, color);
  S.quad(p(u1, v0, w0), p(u1, v0, w1), p(u1, v1, w1), p(u1, v1, w0), inside, color);
  if (top) S.quad(p(u0, v1, w0), p(u1, v1, w0), p(u1, v1, w1), p(u0, v1, w1), inside, top);
}

/** A pitched roof over a half-length hu (its ridge along u) and a half-span hw from the eaves at v0: a gable (its end
 * triangles in the wall's colour) or a hip (its ends sloped back to a shorter ridge). */
function roof(S: Shapes, f: Frame, hu: number, hw: number, v0: number, rise: number, roofColor: V3, wallColor: V3, hip: boolean): void {
  const oh = 0.45, eu = hu + (hip ? oh : oh * 0.6), ew = hw + oh, ve = v0 - oh * rise / Math.max(1, hw);
  const ru = hip ? Math.max(0.2, hu - hw * 0.85) : eu;
  const inside = f(0, v0 + rise * 0.3, 0);
  const top = v0 + rise;
  S.quad(f(-eu, ve, -ew), f(eu, ve, -ew), f(ru, top, 0), f(-ru, top, 0), inside, roofColor);
  S.quad(f(-eu, ve, ew), f(eu, ve, ew), f(ru, top, 0), f(-ru, top, 0), inside, roofColor);
  if (hip) {
    S.tri(f(eu, ve, -ew), f(eu, ve, ew), f(ru, top, 0), inside, roofColor);
    S.tri(f(-eu, ve, -ew), f(-eu, ve, ew), f(-ru, top, 0), inside, roofColor);
  } else {
    S.tri(f(hu, v0, -hw), f(hu, v0, hw), f(hu, top, 0), inside, wallColor);
    S.tri(f(-hu, v0, -hw), f(-hu, v0, hw), f(-hu, top, 0), inside, wallColor);
  }
}

/** A tapered n-gon from radius r0 at v0 to r1 at v1 (a cone when r1 is 0), its top capped. */
function prism(S: Shapes, f: Frame, n: number, r0: number, r1: number, v0: number, v1: number, color: V3, phase = Math.PI / n): void {
  const inside = f(0, (v0 + v1) / 2, 0);
  for (let i = 0; i < n; i++) {
    const a0 = phase + (i / n) * Math.PI * 2, a1 = phase + ((i + 1) / n) * Math.PI * 2;
    const b0 = f(Math.cos(a0) * r0, v0, Math.sin(a0) * r0), b1 = f(Math.cos(a1) * r0, v0, Math.sin(a1) * r0);
    if (r1 <= 0.01) { S.tri(b0, b1, f(0, v1, 0), f(0, v0 + (v1 - v0) * 0.25, 0), color); continue; }
    const t0 = f(Math.cos(a0) * r1, v1, Math.sin(a0) * r1), t1 = f(Math.cos(a1) * r1, v1, Math.sin(a1) * r1);
    S.quad(b0, b1, t1, t0, inside, color);
    S.tri(t0, t1, f(0, v1, 0), f(0, v1 - 0.5, 0), color);
  }
}

/** A thin beam from a to b (in a frame), its section square of side t. */
function beam(S: Shapes, f: Frame, a: V3, b: V3, t: number, color: V3): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
  // two axes across the beam
  let px = -dz, py = 0, pz = dx;
  if (Math.hypot(px, pz) < 1e-6) { px = 1; pz = 0; }
  const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
  const qx = (dy * pz - dz * py) / l, qy = (dz * px - dx * pz) / l, qz = (dx * py - dy * px) / l;
  const h = t / 2;
  const corner = (p: V3, su: number, sv: number): V3 => f(p[0] + (px * su + qx * sv) * h, p[1] + (py * su + qy * sv) * h, p[2] + (pz * su + qz * sv) * h);
  const inside = f((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const s = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = s[i], [u1, v1] = s[(i + 1) % 4];
    S.quad(corner(a, u0, v0), corner(a, u1, v1), corner(b, u1, v1), corner(b, u0, v0), inside, color);
  }
}

/** A building of a kind on its footprint (its ridge along its longer side). */
function addBuilding(S: Shapes, f: Frame, width: number, depth: number, style: KitStyle, tone: number, alt: boolean, kind: string): void {
  const long = width >= depth;
  const hu = (long ? width : depth) / 2, hw = (long ? depth : width) / 2;
  // (the frame turned a quarter when the footprint's long side runs along w)
  const g: Frame = long ? f : (u, v, w) => f(w, v, -u);
  const wall = lin(style.wall.map((c) => c * tone)), roofC = lin((alt && style.roofAlt ? style.roofAlt : style.roof).map((c) => c * (0.92 + 0.16 * (tone - 0.9) / 0.2)));
  const wallH = style.wallH * (0.9 + 0.2 * (tone - 0.9) / 0.2);
  box(S, g, -hu, hu, -1.5, wallH, -hw, hw, wall, null);
  const rise = kind === 'depot' ? Math.min(style.roofH, hw * 0.35) : style.roofH * Math.min(1.25, hw / 4.5);
  roof(S, g, hu, hw, wallH, rise, roofC, wall, !!style.hip);
  // a farmhouse's or a cottage's chimney on its ridge
  if ((kind === 'farmhouse' || kind === 'cottage' || kind === 'tavern') && hu > 3) box(S, g, hu * 0.45, hu * 0.45 + 0.8, wallH + rise * 0.6, wallH + rise + 1.2, -0.4, 0.4, lin([96, 60, 48]));
}

const BRICK = lin([150, 104, 84]), SLATE = lin([60, 62, 70]), WHITE = lin([222, 216, 206]), STONE = lin([128, 122, 112]);
const STEEL = lin([118, 116, 112]), CONCRETE = lin([180, 174, 160]), DARK = lin([46, 44, 42]), TAR = lin([58, 50, 44]);

/** A vertical: its form by kind at its height (heightM) and half-width (halfM). */
function addVertical(S: Shapes, f: Frame, kind: string, H: number, half: number, kit: string | null): void {
  switch (kind) {
    case 'churchTower': case 'spire': case 'campanile': {
      const s = half;
      const body = kind === 'campanile' ? 0.8 : 0.62;
      const wall = kit === 'savoyard' ? STONE : BRICK;
      box(S, f, -s, s, -1.5, H * body, -s, s, wall, null);
      // the belfry stage, a step in
      box(S, f, -s * 0.86, s * 0.86, H * body, H * (body + 0.08), -s * 0.86, s * 0.86, wall, null);
      if (kind === 'campanile') prism(S, f, 4, s * 1.2, 0, H * (body + 0.08), H, lin([150, 80, 60]), Math.PI / 4);
      else prism(S, f, 8, s * 0.95, 0, H * (body + 0.08), H, SLATE);
      // the church behind its tower: its nave under a steep roof (not for a lone spire)
      if (kind === 'churchTower' && H < 70) {
        const nl = s * 3.4, nw = s * 1.5;
        const g: Frame = (u, v, w) => f(u, v, w - s - nl);
        box(S, g, -nw, nw, -1.5, H * 0.3, -nl, nl, wall, null);
        roof(S, (u, v, w) => g(w, v, -u), nl, nw, H * 0.3, nw * 1.25, SLATE, wall, false);
      }
      return;
    }
    case 'onionDome': {
      box(S, f, -half, half, -1.5, H * 0.55, -half, half, WHITE, null);
      roof(S, f, half, half, H * 0.55, half * 0.5, lin([90, 110, 96]), WHITE, true);
      prism(S, f, 8, half * 0.5, half * 0.5, H * 0.55, H * 0.68, WHITE);
      const dome = lin([70, 120, 80]);
      prism(S, f, 8, half * 0.52, half * 0.72, H * 0.68, H * 0.76, dome);
      prism(S, f, 8, half * 0.72, half * 0.4, H * 0.76, H * 0.86, dome);
      prism(S, f, 8, half * 0.4, 0, H * 0.86, H * 0.95, dome);
      beam(S, f, [0, H * 0.94, 0], [0, H, 0], 0.4, lin([190, 160, 90]));
      return;
    }
    case 'minaret': case 'lighthouse': case 'chimney': case 'kilnChimney': case 'lookoutTower': {
      const light = kind === 'lighthouse';
      const color = light ? WHITE : kind === 'minaret' ? lin([214, 204, 182]) : BRICK;
      const top = light || kind === 'minaret' ? 0.84 : 1;
      prism(S, f, 8, half, half * (kind === 'chimney' || kind === 'kilnChimney' ? 0.6 : 0.72), -1.5, H * top, color);
      if (light) {
        prism(S, f, 8, half * 0.88, half * 0.85, H * 0.5, H * 0.6, lin([168, 52, 44]));
        prism(S, f, 8, half * 0.6, half * 0.6, H * top, H * 0.94, DARK);
        prism(S, f, 8, half * 0.72, 0, H * 0.94, H, lin([168, 52, 44]));
      } else if (kind === 'minaret') {
        prism(S, f, 8, half * 1.2, half * 1.2, H * 0.7, H * 0.73, color);
        prism(S, f, 8, half * 0.7, 0, H * top, H, lin([90, 120, 110]));
      }
      return;
    }
    case 'windmill': case 'postMill': {
      // a Zeeland tower mill: its tarred or brick body tapering to the cap, the four sails across its face
      const post = kind === 'postMill';
      const capV = H * (post ? 0.62 : 0.76);
      if (post) { prism(S, f, 4, half * 0.9, half * 0.6, -1.5, H * 0.3, TAR); box(S, f, -half * 0.8, half * 0.8, H * 0.3, capV, -half, half, lin([120, 100, 80])); }
      else prism(S, f, 8, half, half * 0.6, -1.5, capV, TAR);
      prism(S, f, 8, half * 0.66, half * 0.25, capV, capV + H * 0.1, lin([70, 64, 58]));
      const hub: V3 = [0, capV + H * 0.04, half * 0.75];
      const blade = H * 0.58, sail = lin([112, 100, 86]);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const tip: V3 = [Math.cos(a) * blade, hub[1] + Math.sin(a) * blade, hub[2] + 0.4];
        beam(S, f, hub, tip, 0.5, DARK);
        // the sail's lattice, as a board along the stock's outer two thirds
        const mid: V3 = [Math.cos(a) * blade * 0.25, hub[1] + Math.sin(a) * blade * 0.25, hub[2] + 0.4];
        const n: V3 = [-Math.sin(a) * 1.1, Math.cos(a) * 1.1, 0];
        // (both faces: the board is seen from the mill's front and from behind it)
        const corners = [f(mid[0], mid[1], mid[2]), f(tip[0], tip[1], tip[2]), f(tip[0] + n[0] * 2, tip[1] + n[1] * 2, tip[2]), f(mid[0] + n[0] * 2, mid[1] + n[1] * 2, mid[2])] as const;
        for (const side of [-1, 1]) {
          const inside: V3 = f((mid[0] + tip[0]) / 2 + n[0], (mid[1] + tip[1]) / 2 + n[1], hub[2] + 0.4 + side);
          S.quad(corners[0], corners[1], corners[2], corners[3], inside, sail);
        }
      }
      return;
    }
    case 'pylonLine': case 'mast': case 'headframe': {
      const b = kind === 'mast' ? 1.2 : half * 1.15, t = kind === 'mast' ? 0.3 : half * 0.25, w = kind === 'mast' ? 0.35 : 0.55;
      const legs: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (const [su, sw] of legs) beam(S, f, [su * b, -1, sw * b], [su * t, H * 0.92, sw * t], w, STEEL);
      if (kind === 'pylonLine') {
        // the crossarms across the line (the line runs along w) and the earth-wire peak
        const at = (v: number): number => b + (t - b) * (v / (H * 0.92));
        beam(S, f, [-at(H * 0.66) - 6.5, H * 0.66, 0], [at(H * 0.66) + 6.5, H * 0.66, 0], 0.6, STEEL);
        beam(S, f, [-at(H * 0.8) - 4.5, H * 0.8, 0], [at(H * 0.8) + 4.5, H * 0.8, 0], 0.55, STEEL);
        beam(S, f, [0, H * 0.9, 0], [0, H, 0], 0.4, STEEL);
        // two braces a third of the way up (a lattice tower reads as a frame, not four sticks)
        const v = H * 0.33, a = at(v);
        beam(S, f, [-a, v, a], [a, v, a], 0.4, STEEL); beam(S, f, [-a, v, -a], [a, v, -a], 0.4, STEEL);
      } else if (kind === 'headframe') box(S, f, -2, 2, H * 0.86, H, -2, 2, STEEL);
      return;
    }
    case 'waterTower': {
      prism(S, f, 8, half * 0.56, half * 0.5, -1.5, H * 0.68, BRICK);
      prism(S, f, 8, half, half, H * 0.68, H * 0.86, lin([142, 82, 62]));
      prism(S, f, 8, half * 1.02, 0, H * 0.86, H, lin([70, 60, 56]));
      return;
    }
    case 'elevator': {
      box(S, f, -half * 0.7, half * 0.7, -1.5, H, -half * 0.5, half * 0.5, CONCRETE);
      for (const u of [-half * 1.5, -half * 0.5, half * 0.5]) prism(S, (a, v, w) => f(a + u - half * 0.2, v, w + half), 10, half * 0.48, half * 0.48, -1.5, H * 0.72, CONCRETE);
      box(S, f, -half * 0.5, half * 0.5, H, H * 1.08, -half * 0.4, half * 0.4, CONCRETE);
      return;
    }
    case 'castle': {
      // a fort: its curtain wall about a court and a keep
      const r = half, wallH = H * 0.4;
      box(S, f, -r, r, -1.5, wallH, -r, -r + 2.5, STONE); box(S, f, -r, r, -1.5, wallH, r - 2.5, r, STONE);
      box(S, f, -r, -r + 2.5, -1.5, wallH, -r, r, STONE); box(S, f, r - 2.5, r, -1.5, wallH, -r, r, STONE);
      box(S, f, -r * 0.35, r * 0.35, -1.5, H, -r * 0.35, r * 0.35, STONE);
      return;
    }
    default:
      box(S, f, -half, half, -1.5, H, -half, half, STONE);
  }
}

/** A tree's crown profile by form: (height fraction, radius fraction) from its base to its top. */
const CROWN_PROFILES: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  columnar: [[0.08, 0.15], [0.2, 0.85], [0.5, 1], [0.82, 0.68], [1, 0]],
  broad: [[0.3, 0.2], [0.42, 0.82], [0.62, 1], [0.84, 0.82], [0.97, 0.3], [1, 0]],
  pollard: [[0.36, 0.2], [0.46, 0.86], [0.7, 1], [0.94, 0.55], [1, 0]],
  conifer: [[0.1, 0.3], [0.14, 1], [0.5, 0.62], [0.78, 0.32], [1, 0]],
};
const TRUNK = lin([58, 50, 42]);

/** A tree: its trunk and its crown, smooth-shaded about the crown's centre. */
function addTree(S: Shapes, x: number, y: number, z: number, heightM: number, crownM: number, form: string, color: V3, sides: number): void {
  const profile = CROWN_PROFILES[form] ?? CROWN_PROFILES.broad;
  const phase = hashXZ(x, z, 1) * Math.PI * 2;
  const f = frame(x, y, z, phase);
  const base = profile[0][0] * heightM;
  prism(S, f, 3, Math.max(0.22, crownM * 0.07), Math.max(0.15, crownM * 0.05), -1, base + 0.4 * (heightM - base) * 0.3, TRUNK);
  const cy = y + heightM * 0.62, ry = heightM * 0.55, rr = Math.max(1, crownM);
  const smooth = (p: V3): V3 => {
    const nx = (p[0] - x) / rr, ny = (p[1] - cy) / ry * 0.8 + 0.25, nz = (p[2] - z) / rr;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const inside: V3 = [x, y + heightM * 0.6, z];
  // (a lean and a lopsided crown: no two trees the same solid of revolution)
  const lean = (hashXZ(x, z, 2) - 0.5) * 0.12, skew = 0.85 + 0.3 * hashXZ(x, z, 3);
  const ring = (k: number, i: number): V3 => {
    const [hv, rv] = profile[k];
    const a = (i / sides) * Math.PI * 2;
    const r = rv * crownM * (i % 2 ? skew : 1);
    return f(Math.cos(a) * r + lean * hv * heightM, hv * heightM, Math.sin(a) * r);
  };
  for (let k = 0; k + 1 < profile.length; k++) {
    for (let i = 0; i < sides; i++) {
      const a0 = ring(k, i), a1 = ring(k, (i + 1) % sides), b0 = ring(k + 1, i), b1 = ring(k + 1, (i + 1) % sides);
      S.tri(a0, a1, b1, inside, color, smooth);
      if (profile[k + 1][1] > 0) S.tri(a0, b1, b0, inside, color, smooth);
    }
  }
  // the crown's underside, closed to its lowest ring
  const under: V3 = f(0, profile[0][0] * heightM - 0.2, 0);
  for (let i = 0; i < sides; i++) S.tri(ring(0, i), ring(0, (i + 1) % sides), under, inside, color, smooth);
}

/** A tree's crown colour (linear): the species' green turning to the season's twigs and late leaves. */
function treeColor(species: string, form: string, tone: number, leaf: number): V3 {
  const green = form === 'conifer' ? [40, 58, 36] : species === 'poplar' ? [70, 92, 46] : species === 'willow' ? [92, 104, 70] : species === 'birch' ? [84, 110, 52] : [62, 82, 40];
  // a turning crown's olive-brown, then the bare crown's grey-brown twigs
  const turned = [112, 92, 52], bare = species === 'birch' ? [120, 112, 104] : species === 'willow' ? [118, 100, 70] : [86, 74, 66];
  const t = Math.max(0, Math.min(1, leaf));
  const mixC = t > 0.5 ? green.map((g, i) => turned[i] + (g - turned[i]) * (t - 0.5) * 2) : turned.map((c, i) => bare[i] + (c - bare[i]) * t * 2);
  const v = 0.86 + 0.28 * tone;
  return lin(mixC.map((c) => Math.min(255, c * v)));
}

/** The roads' surfaces (linear): Zeeland's clinker and tarmac, a farm track's gravel and earth, a line's ballast. */
const ROAD_COLOR: Readonly<Record<string, V3>> = {
  road: lin([78, 76, 72]), dikeRoad: lin([88, 84, 78]), track: lin([118, 104, 84]), rail: lin([66, 60, 54]),
};

/**
 * A road's ribbon over the drawn land: resampled every 6 m near the battlefield and coarser with distance (1 % of it),
 * lifted a little over the land (more with distance, where the land's patches are coarser than its samples), its
 * normal up. Nothing inside the battlefield's square (its own roads run there).
 */
function addRoad(S: Shapes, xs: readonly number[], zs: readonly number[], widthM: number, color: V3, ground: (x: number, z: number) => number): void {
  const half = Math.max(1.5, widthM / 2);
  const up = (): V3 => [0, 1, 0];
  let px = NaN, pz = NaN, pl: V3 | null = null, pr: V3 | null = null;
  const emit = (x: number, z: number, dx: number, dz: number): void => {
    const d = Math.hypot(x, z);
    if (Math.max(Math.abs(x), Math.abs(z)) < 516) { pl = pr = null; return; }
    const l = Math.hypot(dx, dz) || 1, nx = -dz / l * half, nz = dx / l * half;
    const lift = 0.25 + d * 0.00035;
    const L: V3 = [x + nx, ground(x + nx, z + nz) + lift, z + nz], R: V3 = [x - nx, ground(x - nx, z - nz) + lift, z - nz];
    if (pl && pr) {
      const inside: V3 = [(x + px) / 2, -1e6, (z + pz) / 2];
      S.tri(pl, pr, R, inside, color, up); S.tri(pl, R, L, inside, color, up);
    }
    pl = L; pr = R; px = x; pz = z;
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const ax = xs[i], az = zs[i], bx = xs[i + 1], bz = zs[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    let t = 0;
    while (t < len) {
      const x = ax + (bx - ax) * (t / len), z = az + (bz - az) * (t / len);
      emit(x, z, bx - ax, bz - az);
      t += Math.max(6, Math.hypot(x, z) * 0.01);
    }
  }
  if (xs.length >= 2) { const n = xs.length - 1; emit(xs[n], zs[n], xs[n] - xs[n - 1], zs[n] - zs[n - 1]); }
}

/** Build the outland's geometry over the drawn land (the worker's side). */
export function buildHinterlandOutlandGeometry(
  plan: Pick<HinterlandPlan, 'buildings' | 'settlements' | 'verticals' | 'trees'> & Partial<Pick<HinterlandPlan, 'roads'>>,
  pyramid: HinterlandPyramid, kit: string | null,
  /** The trees with their ground (the worker's list: the plan's, then the woods' own); absent, the plan's on the land. */
  trees: readonly (HinterlandTree & { y?: number; woods?: boolean })[] = plan.trees,
): HinterlandOutlandGeometry {
  const t0 = performance.now();
  const ground = (x: number, z: number): number => samplePyramid(pyramid, x, z);
  const footBase = (f: Frame, hu: number, hw: number): number => {
    let lo = Infinity;
    for (const [u, w] of [[-hu, -hw], [hu, -hw], [hu, hw], [-hu, hw], [0, 0]]) { const p = f(u, 0, w); lo = Math.min(lo, ground(p[0], p[2])); }
    return lo;
  };
  // ---- the buildings: the plan's, then the far settlements' clusters, then the verticals
  const S = new Shapes();
  const drawn = new Set<number>();
  for (const b of plan.buildings) {
    drawn.add(b.settlement);
    const y = footBase(frame(b.x, 0, b.z, b.yaw), b.width / 2, b.depth / 2);
    addBuilding(S, frame(b.x, y, b.z, b.yaw), b.width, b.depth, styleFor(kit, b.kind), 0.9 + 0.2 * hashXZ(b.x, b.z), hashXZ(b.x, b.z, 5) < 0.4, b.kind);
  }
  // a far settlement the plan counts but does not lay out: its houses about its core along its street and a cross lane
  for (const s of plan.settlements) {
    if (drawn.has(s.id) || s.buildings <= 0) continue;
    const n = Math.min(40, s.buildings);
    for (let k = 0; k < n; k++) {
      const h1 = hashXZ(s.x, s.z, k * 3 + 11), h2 = hashXZ(s.x, s.z, k * 3 + 12), h3 = hashXZ(s.x, s.z, k * 3 + 13);
      const lane = k % 3 === 2;
      const along = (h1 - 0.5) * 2 * s.radiusM * (lane ? 0.5 : 0.9);
      const across = (h2 < 0.5 ? -1 : 1) * (10 + 8 * h3);
      const street = frame(s.x, 0, s.z, s.yaw + (lane ? Math.PI / 2 : 0));
      const p = street(across, 0, along);
      const kind = k % 5 === 4 ? 'barn' : k % 7 === 3 ? 'farmhouse' : 'cottage';
      const width = kind === 'barn' ? 22 + 10 * h3 : 9 + 5 * h3, depth = kind === 'barn' ? 12 + 4 * h1 : 7 + 3 * h1;
      const yaw = s.yaw + (lane ? Math.PI / 2 : 0) + (h3 - 0.5) * 0.2;
      const y = footBase(frame(p[0], 0, p[2], yaw), width / 2, depth / 2);
      addBuilding(S, frame(p[0], y, p[2], yaw), width, depth, styleFor(kit, kind), 0.9 + 0.2 * h2, h1 < 0.4, kind);
    }
  }
  for (const v of plan.verticals) {
    const y = footBase(frame(v.x, 0, v.z, v.yaw), v.halfM, v.halfM);
    addVertical(S, frame(v.x, y, v.z, v.yaw), v.kind, v.heightM, v.halfM, kit);
  }
  // ---- the roads: ribbons draped on the drawn land (the atlas alone smudges a 6 m road over two 8 m texels)
  let roadTris = S.triangles;
  for (const road of plan.roads ?? []) addRoad(S, road.xs, road.zs, road.widthM, ROAD_COLOR[road.kind] ?? ROAD_COLOR.road, ground);
  roadTris = S.triangles - roadTris;
  // ---- the trees: near (the impostors may draw them instead) and far
  const near = new Shapes(), far = new Shapes();
  const nearIndex: number[] = [];
  let woodsTrees = 0;
  trees.forEach((t, i) => {
    const isNear = Math.hypot(t.x, t.z) < HINTERLAND_NEAR_TREE_M;
    if (isNear) nearIndex.push(i);
    // (the woods' own trees are the impostors' alone: as geometry they would cost a quarter of a million triangles,
    // and without an atlas the canopy stands for them)
    if (t.woods) { woodsTrees++; return; }
    // (a tree stands a little into the drawn land: the earth's drop from an eye in the square reaches 0.4 m)
    const y = (t.y !== undefined && Number.isFinite(t.y) ? t.y : ground(t.x, t.z)) - 0.3;
    addTree(isNear ? near : far, t.x, y, t.z, t.heightM, t.crownM, t.form, treeColor(t.species, t.form, t.tone, t.leaf), isNear ? 6 : 5);
  });
  return {
    buildings: S.arrays(), nearTrees: near.arrays(), farTrees: far.arrays(), nearIndex: new Uint32Array(nearIndex),
    stats: { buildingTris: S.triangles, roadTris, nearTreeTris: near.triangles, farTreeTris: far.triangles, nearTrees: nearIndex.length, farTrees: trees.length - nearIndex.length, woodsTrees, ms: performance.now() - t0 },
  };
}
