// The map-borders lane (2026-10-03, gauntlet wave 0: "the border reads as an enclosing clay wall rather than land
// continuing"; the bar is World of Tanks' red-line shots, where terrain, fields and villages carry on past the
// boundary): farmsteads and hamlets in the land past the edge. Sites are searched on the ring's own seated surface
// (flat yards, off the woods, the sea, a railway's right of way and the exit roads' carriageways), gather along the
// exit roads as hamlets and stand alone among the fields elsewhere; each is a house, a barn, a shed and on the
// steppe and the polders a silo, squared to the field system, in the region's materials. One merged, vertex-coloured
// mesh: a single draw (and one far-cascade shadow draw), a few thousand triangles, built once with the ring.
import * as THREE from 'three';
import { SHADOW_CASTER_LAST_CASCADE, setShadowCasterCascades } from '../engine/renderLayers.ts';

export type FarmsteadStyle = 'temperate' | 'steppe' | 'polder' | 'winter' | 'arid' | 'nordic' | 'tropical' | 'alpine';

export interface BorderFarmsteadOptions {
  seed: number;
  style: FarmsteadStyle;
  /** The farmsteads round the square (a hamlet's farms included); 0 builds nothing. */
  count: number;
  /** The rendered ground at (x, z) past the edge (the ring's seated surface); NaN where there is none. */
  groundAt(x: number, z: number): number;
  /** 0..1 woods: no yard in a wood. */
  woodsAt(x: number, z: number): number;
  /** 0..1: ground a building keeps off — the sea, a railway's right of way. */
  blockedAt(x: number, z: number): number;
  /** Metres to the nearest exit road past the edge (Infinity where none): the farms gather along them. */
  roadDistanceAt?(x: number, z: number): number;
  /** The field system's orientation (rad): the buildings square up to the fields. */
  fieldAngle: number;
  /** The band past the square's edge the yards stand in (m). */
  nearM?: number;
  farM?: number;
}

export interface FarmsteadSite { x: number; z: number; yaw: number; road: boolean }

const HALF = 512;

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A point on the square of half-size `h`, `s` metres along its perimeter (anticlockwise from the north-west corner). */
function squarePoint(h: number, s: number): [number, number] {
  const side = 2 * h, p = ((s % (4 * side)) + 4 * side) % (4 * side);
  if (p < side) return [-h + p, h];
  if (p < 2 * side) return [h, h - (p - side)];
  if (p < 3 * side) return [h - (p - 2 * side), -h];
  return [-h, -h + (p - 3 * side)];
}

/**
 * The yards: a deterministic search of the band past the edge, scored for a flat yard (the relief over its 56 m
 * footprint), the exit roads (a hamlet of up to three farms within ~140 m of one) and the near distance (what the
 * square sees), then a greedy pick 230 m apart (75 m inside a hamlet), at most a third of them on any one side.
 */
export function selectFarmsteadSites(options: BorderFarmsteadOptions): FarmsteadSite[] {
  if (options.count <= 0) return [];
  const rng = mulberry32((options.seed ^ 0xFA53D) >>> 0);
  const near = options.nearM ?? 170, far = options.farM ?? 900;
  const cos = Math.cos(options.fieldAngle), sin = Math.sin(options.fieldAngle);
  type Candidate = FarmsteadSite & { score: number; side: number };
  const candidates: Candidate[] = [];
  for (let d = near; d <= far; d += 55) {
    const h = HALF + d, perimeter = 8 * h;
    for (let s = rng() * 90; s < perimeter; s += 90) {
      const [x, z] = squarePoint(h + (rng() - 0.5) * 30, s + (rng() - 0.5) * 50);
      const g = options.groundAt(x, z);
      if (!Number.isFinite(g)) continue;
      let lo = g, hi = g, woods = options.woodsAt(x, z), blocked = options.blockedAt(x, z);
      for (const [du, dv] of [[28, 28], [28, -28], [-28, 28], [-28, -28], [0, 34], [34, 0], [0, -34], [-34, 0]]) {
        const px = x + du * cos - dv * sin, pz = z + du * sin + dv * cos;
        const gh = options.groundAt(px, pz);
        if (!Number.isFinite(gh)) { hi = Infinity; break; }
        lo = Math.min(lo, gh); hi = Math.max(hi, gh);
        woods = Math.max(woods, options.woodsAt(px, pz));
        blocked = Math.max(blocked, options.blockedAt(px, pz));
      }
      const relief = hi - lo;
      if (!(relief < 6) || woods > 0.2 || blocked > 0.02) continue;
      const road = options.roadDistanceAt?.(x, z) ?? Infinity;
      if (road < 22) continue; // not on the carriageway
      const roadBonus = road < 150 ? 1 - road / 150 : 0;
      const out = Math.max(Math.abs(x), Math.abs(z)) - HALF;
      const score = (1 - relief / 6) * 0.5 + roadBonus * 0.9 + (1 - 0.5 * smoothstep(600, 900, out)) * 0.4 + rng() * 0.35;
      const side = Math.abs(x) > Math.abs(z) ? (x > 0 ? 1 : 3) : (z > 0 ? 0 : 2);
      // square to the fields, or to the road the farm stands on (a quarter turn either way, a few degrees of settling)
      const yaw = options.fieldAngle + (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.1;
      candidates.push({ x, z, yaw, road: roadBonus > 0, score, side });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const picked: Candidate[] = [];
  const perSide = [0, 0, 0, 0], sideCap = Math.max(2, Math.ceil(options.count / 3));
  for (const c of candidates) {
    if (picked.length >= options.count) break;
    if (perSide[c.side] >= sideCap) continue;
    let ok = true, hamlet = 0;
    for (const p of picked) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (c.road && p.road && d < 150) { hamlet++; if (d < 75) { ok = false; break; } continue; }
      if (d < 230) { ok = false; break; }
    }
    if (!ok || hamlet > 2) continue;
    picked.push(c); perSide[c.side]++;
  }
  return picked.map(({ x, z, yaw, road }) => ({ x, z, yaw, road }));
}

type RGB = readonly [number, number, number];
interface Palette { walls: RGB[]; roofs: RGB[]; barnWalls: RGB[]; barnRoofs: RGB[]; flat?: boolean; silo?: number; storeys: [number, number] }
const PALETTES: Readonly<Record<FarmsteadStyle, Palette>> = {
  temperate: {
    walls: [[0.80, 0.76, 0.67], [0.78, 0.67, 0.50], [0.56, 0.34, 0.26], [0.86, 0.85, 0.81]],
    roofs: [[0.55, 0.26, 0.18], [0.43, 0.25, 0.19], [0.27, 0.28, 0.31]],
    barnWalls: [[0.37, 0.30, 0.23], [0.46, 0.20, 0.15], [0.62, 0.55, 0.45]],
    barnRoofs: [[0.48, 0.48, 0.46], [0.47, 0.31, 0.23], [0.30, 0.30, 0.32]], silo: 0.1, storeys: [1, 2],
  },
  steppe: {
    walls: [[0.88, 0.87, 0.82], [0.74, 0.80, 0.84], [0.84, 0.80, 0.68]],
    roofs: [[0.58, 0.58, 0.55], [0.50, 0.35, 0.25], [0.34, 0.43, 0.34]],
    barnWalls: [[0.62, 0.42, 0.32], [0.70, 0.68, 0.62]], barnRoofs: [[0.56, 0.56, 0.53], [0.46, 0.33, 0.25]],
    silo: 0.45, storeys: [1, 1],
  },
  polder: {
    walls: [[0.50, 0.28, 0.22], [0.38, 0.23, 0.19], [0.84, 0.82, 0.76]],
    roofs: [[0.20, 0.20, 0.22], [0.48, 0.40, 0.28], [0.42, 0.22, 0.16]],
    barnWalls: [[0.16, 0.15, 0.14], [0.36, 0.22, 0.18]], barnRoofs: [[0.22, 0.22, 0.24], [0.46, 0.38, 0.27]],
    silo: 0.35, storeys: [1, 2],
  },
  winter: {
    walls: [[0.62, 0.50, 0.38], [0.80, 0.76, 0.67], [0.46, 0.26, 0.20]],
    roofs: [[0.90, 0.91, 0.93]], barnWalls: [[0.34, 0.27, 0.21], [0.44, 0.22, 0.17]], barnRoofs: [[0.88, 0.89, 0.92]],
    silo: 0.1, storeys: [1, 2],
  },
  arid: {
    walls: [[0.74, 0.62, 0.47], [0.66, 0.60, 0.52], [0.80, 0.72, 0.58]], roofs: [[0.62, 0.53, 0.41]],
    barnWalls: [[0.70, 0.60, 0.46]], barnRoofs: [[0.55, 0.50, 0.44]], flat: true, storeys: [1, 1],
  },
  nordic: {
    walls: [[0.52, 0.16, 0.12], [0.86, 0.85, 0.80], [0.78, 0.64, 0.36]],
    roofs: [[0.18, 0.19, 0.20], [0.32, 0.36, 0.24]], barnWalls: [[0.50, 0.15, 0.12]], barnRoofs: [[0.20, 0.21, 0.22]],
    storeys: [1, 2],
  },
  tropical: {
    walls: [[0.48, 0.37, 0.26], [0.70, 0.66, 0.56], [0.58, 0.64, 0.58]],
    roofs: [[0.50, 0.33, 0.24], [0.56, 0.56, 0.54], [0.40, 0.42, 0.44]],
    barnWalls: [[0.44, 0.34, 0.24]], barnRoofs: [[0.50, 0.36, 0.26]], storeys: [1, 1],
  },
  alpine: {
    walls: [[0.42, 0.30, 0.21], [0.82, 0.80, 0.74]], roofs: [[0.30, 0.30, 0.32], [0.40, 0.31, 0.24]],
    barnWalls: [[0.36, 0.26, 0.18]], barnRoofs: [[0.32, 0.32, 0.33]], storeys: [2, 2],
  },
};
const WINDOW: RGB = [0.08, 0.085, 0.09];
const DOOR: RGB = [0.26, 0.19, 0.13];
const STONE: RGB = [0.52, 0.50, 0.47];

/** Triangle soup with flat normals and vertex colours (linear). */
class Soup {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  private lin(c: RGB, shade: number): [number, number, number] {
    return [Math.pow(c[0], 2.2) * shade, Math.pow(c[1], 2.2) * shade, Math.pow(c[2], 2.2) * shade];
  }
  tri(a: number[], b: number[], c: number[], color: RGB, shade = 1): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const col = this.lin(color, shade);
    for (const p of [a, b, c]) { this.positions.push(p[0], p[1], p[2]); this.normals.push(nx, ny, nz); this.colors.push(col[0], col[1], col[2]); }
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: RGB, shade = 1): void {
    this.tri(a, b, c, color, shade); this.tri(a, c, d, color, shade);
  }
}

/** A building's frame: centre, yaw, and its local (u along the ridge, v across, y up) → world. */
interface Frame { x: number; z: number; cos: number; sin: number }
const at = (f: Frame, u: number, v: number, y: number): number[] => [f.x + u * f.cos - v * f.sin, y, f.z + u * f.sin + v * f.cos];

/** Walls of an L x W box from y0 to y1 (outward faces), windows and a door on the long sides. */
function addWalls(s: Soup, f: Frame, L: number, W: number, y0: number, y1: number, wall: RGB, rng: () => number, storeys: number, barn: boolean): void {
  const hl = L / 2, hw = W / 2;
  const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
    s.quad(at(f, u0, v0, y0), at(f, u1, v1, y0), at(f, u1, v1, y1), at(f, u0, v0, y1), wall, 0.97 + rng() * 0.06);
  }
  // openings, 4 cm proud of the wall: a row of windows per storey on each long side, the door (or a barn's gate)
  const groundY = y0 + Math.max(0.35, (y1 - y0) - (barn ? 6.5 : storeys * 2.8 + 0.3));
  for (const side of [-1, 1]) {
    const v = side * (hw + 0.04);
    const n = Math.max(1, Math.floor((L - 2) / 3.4));
    for (let storey = 0; storey < (barn ? 1 : storeys); storey++) {
      const wy = groundY + 1.0 + storey * 2.8;
      for (let k = 0; k < n; k++) {
        const u = -hl + (k + 0.5) * (L / n);
        if (!barn && storey === 0 && side === 1 && k === Math.floor(n / 2)) {
          // the door
          const a = at(f, u - 0.6, v, groundY), b = at(f, u + 0.6, v, groundY), c = at(f, u + 0.6, v, groundY + 2.1), d = at(f, u - 0.6, v, groundY + 2.1);
          if (side > 0) s.quad(a, b, c, d, DOOR); else s.quad(b, a, d, c, DOOR);
          continue;
        }
        if (barn && k % 2 === 1) continue;
        const ww = barn ? 0.9 : 1.0, wh = barn ? 0.7 : 1.25, wy0 = barn ? y1 - 1.6 : wy;
        const a = at(f, u - ww / 2, v, wy0), b = at(f, u + ww / 2, v, wy0), c = at(f, u + ww / 2, v, wy0 + wh), d = at(f, u - ww / 2, v, wy0 + wh);
        if (side > 0) s.quad(a, b, c, d, WINDOW); else s.quad(b, a, d, c, WINDOW);
      }
    }
    if (barn) {
      // the gate on each long side
      const gw = Math.min(4.2, L * 0.25), gh = Math.min(4.6, (y1 - groundY) * 0.8);
      const a = at(f, -gw / 2, v, groundY), b = at(f, gw / 2, v, groundY), c = at(f, gw / 2, v, groundY + gh), d = at(f, -gw / 2, v, groundY + gh);
      if (side > 0) s.quad(a, b, c, d, DOOR, 0.8); else s.quad(b, a, d, c, DOOR, 0.8);
    }
  }
  // a stone plinth where the ground falls away under the wall
  if (groundY - y0 > 0.6) {
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
      const o = 0.03, nu0 = u0 * (1 + o / hl), nv0 = v0 * (1 + o / hw), nu1 = u1 * (1 + o / hl), nv1 = v1 * (1 + o / hw);
      s.quad(at(f, nu0, nv0, y0), at(f, nu1, nv1, y0), at(f, nu1, nv1, groundY), at(f, nu0, nv0, groundY), STONE);
    }
  }
}

/** A gable roof over L x W at eave height y1: two slopes with their overhangs and the two gable ends. */
function addGableRoof(s: Soup, f: Frame, L: number, W: number, y1: number, pitch: number, wall: RGB, roof: RGB, rng: () => number): number {
  const hl = L / 2, hw = W / 2, rise = hw * Math.tan(pitch), ridge = y1 + rise;
  const oe = 0.55, og = 0.35, drop = oe * Math.tan(pitch);
  const shade = 0.95 + rng() * 0.1;
  for (const side of [-1, 1]) {
    const a = at(f, -hl - og, side * (hw + oe), y1 - drop), b = at(f, hl + og, side * (hw + oe), y1 - drop);
    const c = at(f, hl + og, 0, ridge), d = at(f, -hl - og, 0, ridge);
    if (side < 0) s.quad(a, b, c, d, roof, shade); else s.quad(b, a, d, c, roof, shade);
  }
  for (const end of [-1, 1]) {
    const a = at(f, end * hl, -hw, y1), b = at(f, end * hl, hw, y1), c = at(f, end * hl, 0, ridge);
    if (end > 0) s.tri(a, b, c, wall); else s.tri(b, a, c, wall);
  }
  return ridge;
}

/** A flat roof with a low parapet (the arid compounds). */
function addFlatRoof(s: Soup, f: Frame, L: number, W: number, y1: number, roof: RGB): void {
  const hl = L / 2, hw = W / 2;
  s.quad(at(f, -hl, -hw, y1), at(f, -hl, hw, y1), at(f, hl, hw, y1), at(f, hl, -hw, y1), roof);
  const p = 0.5;
  const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
    s.quad(at(f, u0, v0, y1), at(f, u1, v1, y1), at(f, u1, v1, y1 + p), at(f, u0, v0, y1 + p), roof, 0.92);
  }
}

function addBox(s: Soup, f: Frame, u: number, v: number, a: number, b: number, y0: number, y1: number, color: RGB): void {
  const corners = [[u - a, v - b], [u + a, v - b], [u + a, v + b], [u - a, v + b]];
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
    s.quad(at(f, u0, v0, y0), at(f, u1, v1, y0), at(f, u1, v1, y1), at(f, u0, v0, y1), color);
  }
  s.quad(at(f, u - a, v - b, y1), at(f, u - a, v + b, y1), at(f, u + a, v + b, y1), at(f, u + a, v - b, y1), color);
}

function addSilo(s: Soup, x: number, z: number, y0: number, r: number, h: number, color: RGB, cap: RGB): void {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
    s.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y0 + h, p0[1]], [p1[0], y0 + h, p1[1]], color, 0.96 + (i % 2) * 0.06);
    s.tri([p1[0], y0 + h, p1[1]], [p0[0], y0 + h, p0[1]], [x, y0 + h + r * 0.7, z], cap);
  }
}

/** The lowest and highest ground under a building's footprint (its corners and centre). */
function footprint(groundAt: (x: number, z: number) => number, f: Frame, L: number, W: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const [u, v] of [[0, 0], [-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]]) {
    const p = at(f, u, v, 0), g = groundAt(p[0], p[2]);
    if (Number.isFinite(g)) { lo = Math.min(lo, g); hi = Math.max(hi, g); }
  }
  return [lo, hi];
}

function pick<T>(list: readonly T[], rng: () => number): T { return list[Math.floor(rng() * list.length) % list.length]; }

/** The farmsteads' merged mesh, or null when there are none. The caller joins its material to the shadow cascades. */
export function buildBorderFarmsteads(options: BorderFarmsteadOptions): THREE.Mesh | null {
  const sites = selectFarmsteadSites(options);
  if (sites.length === 0) return null;
  const pal = PALETTES[options.style] ?? PALETTES.temperate;
  const s = new Soup();
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const rng = mulberry32(((options.seed ^ 0x5EED) + i * 7919) >>> 0);
    const cos = Math.cos(site.yaw), sin = Math.sin(site.yaw);
    const local = (u: number, v: number, turn: boolean): Frame => ({
      x: site.x + u * cos - v * sin, z: site.z + u * sin + v * cos,
      cos: turn ? -sin : cos, sin: turn ? cos : sin,
    });
    const wall = pick(pal.walls, rng), roof = pick(pal.roofs, rng);
    const storeys = pal.storeys[0] + Math.floor(rng() * (pal.storeys[1] - pal.storeys[0] + 1));
    // the house
    {
      const L = 9.5 + rng() * 3.5, W = 7.2 + rng() * 1.4, f = local(-9 + rng() * 2, -6 + rng() * 2, false);
      const [lo, hi] = footprint(options.groundAt, f, L, W);
      if (Number.isFinite(lo)) {
        const y0 = lo - 0.4, eave = hi + 0.3 + storeys * 2.8 + 0.2;
        addWalls(s, f, L, W, y0, eave, wall, rng, storeys, false);
        if (pal.flat) addFlatRoof(s, f, L, W, eave, roof);
        else {
          const ridge = addGableRoof(s, f, L, W, eave, (options.style === 'alpine' ? 26 : options.style === 'nordic' ? 40 : 42) * Math.PI / 180, wall, roof, rng);
          addBox(s, f, L * 0.28, 0, 0.35, 0.35, ridge - 1.0, ridge + 1.1, STONE);
        }
      }
    }
    // the barn (some farms turn it a quarter to close the yard)
    {
      const turn = rng() < 0.4;
      const L = 16 + rng() * 9, W = 9.5 + rng() * 3, f = local(9 + rng() * 3, 8 + rng() * 2, turn);
      const [lo, hi] = footprint(options.groundAt, f, L, W);
      if (Number.isFinite(lo)) {
        const y0 = lo - 0.4, eave = hi + 0.3 + 4.6 + rng() * 2;
        const bw = pick(pal.barnWalls, rng), br = pick(pal.barnRoofs, rng);
        addWalls(s, f, L, W, y0, eave, bw, rng, 1, true);
        if (pal.flat) addFlatRoof(s, f, L, W, eave, br);
        else addGableRoof(s, f, L, W, eave, (options.style === 'alpine' ? 24 : 33) * Math.PI / 180, bw, br, rng);
      }
    }
    // a shed
    if (rng() < 0.8) {
      const L = 6.5 + rng() * 3, W = 4.4 + rng() * 1.2, f = local(-11 + rng() * 3, 12 + rng() * 3, rng() < 0.5);
      const [lo, hi] = footprint(options.groundAt, f, L, W);
      if (Number.isFinite(lo)) {
        const y0 = lo - 0.3, eave = hi + 0.3 + 2.6;
        const bw = pick(pal.barnWalls, rng), br = pick(pal.barnRoofs, rng);
        addWalls(s, f, L, W, y0, eave, bw, rng, 1, true);
        if (pal.flat) addFlatRoof(s, f, L, W, eave, br); else addGableRoof(s, f, L, W, eave, 0.42, bw, br, rng);
      }
    }
    // a silo on the steppe and the polders
    if (pal.silo && rng() < pal.silo) {
      const p = at(local(22 + rng() * 4, -4 + rng() * 6, false), 0, 0, 0);
      const g = options.groundAt(p[0], p[2]);
      if (Number.isFinite(g)) addSilo(s, p[0], p[2], g - 0.3, 2.4 + rng() * 0.6, 9 + rng() * 4, [0.72, 0.72, 0.70], [0.55, 0.55, 0.54]);
    }
  }
  if (s.positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(s.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'border-farmsteads';
  mesh.userData.borderFarmsteads = { sites: sites.length, triangles: s.positions.length / 9 };
  mesh.userData.aoExclude = true;
  mesh.castShadow = true;
  setShadowCasterCascades(mesh, SHADOW_CASTER_LAST_CASCADE);
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The ring's seated surface as a height sampler: the rows of each column (radius increasing outward), interpolated
 * across the two nearest columns. NaN inside the first row or past the last.
 */
export function ringSurfaceSampler(columns: number, positions: ArrayLike<number>, heights: ArrayLike<number>): (x: number, z: number) => number {
  const rows = heights.length / columns;
  const radii = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i++) radii[i] = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
  const along = (k: number, r: number): number => {
    if (r < radii[k] || r > radii[(rows - 1) * columns + k]) return Number.NaN;
    let lo = 0, hi = rows - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (radii[mid * columns + k] <= r) lo = mid; else hi = mid; }
    const r0 = radii[lo * columns + k], r1 = radii[hi * columns + k];
    const t = r1 > r0 ? (r - r0) / (r1 - r0) : 0;
    return heights[lo * columns + k] * (1 - t) + heights[hi * columns + k] * t;
  };
  return (x: number, z: number): number => {
    let a = Math.atan2(z, x); if (a < 0) a += Math.PI * 2;
    const f = (a / (Math.PI * 2)) * columns, k0 = Math.floor(f) % columns, k1 = (k0 + 1) % columns, t = f - Math.floor(f);
    const r = Math.hypot(x, z);
    return along(k0, r) * (1 - t) + along(k1, r) * t;
  };
}
