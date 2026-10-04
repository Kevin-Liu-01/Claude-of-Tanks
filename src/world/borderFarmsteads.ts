// The map-borders lane (2026-10-03, gauntlet wave 0: "the border reads as an enclosing clay wall rather than land
// continuing"; the bar is World of Tanks' red-line shots, where terrain, fields and villages carry on past the
// boundary): farmsteads and hamlets in the land past the edge. Sites are searched on the ring's own seated surface
// (flat yards, off the woods, the sea, a railway's right of way and the exit roads' carriageways), gather along the
// exit roads as hamlets and stand alone among the fields elsewhere; each is a house, a barn, a shed and on the
// steppe and the polders a silo, squared to the field system, in the region's materials. One merged, vertex-coloured
// mesh: a single draw (and one far-cascade shadow draw), a few thousand triangles, built once with the ring.
import * as THREE from 'three';
import { SHADOW_CASTER_LAST_CASCADE, setShadowCasterCascades } from '../engine/renderLayers.ts';
import { buildRegionalParts, resolveRegionalArchitecture, type ArchitectureStyle } from './maps/regional/index.ts';
import { hashSeed, streamFrom } from './maps/regional/geometry.ts';

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
  /** Sites already chosen (selectFarmsteadSites with these options): the ring forest read them for the shelter trees. */
  sites?: readonly FarmsteadSite[];
  /** The roads that leave the square, as their exit lines past the edge (terrain.ts roadExits): villages string along a
   * few of them. */
  roadLines?: readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[];
  /** The region's building kit (maps/regional): the yards and churches are its buildings rather than the generic farm
   * set (resolveBorderArchitecture). */
  architecture?: BorderArchitecture | null;
}

/** A regional building kit as the border's hamlets use it: the kit, and what its builders read about the map. */
export interface BorderArchitecture { style: ArchitectureStyle; mapId: string; snowCap: boolean }

/** The kit for a map with none in its square, where its region has one: Ironworks (the Völklingen ironworks on the
 * Saar) builds its hamlets as the coalfield's workers' cottage pairs. */
const BORDER_ARCHITECTURE_FALLBACK: Readonly<Record<string, string>> = { foundry: 'ruhr' };
/** The kit of a map's hamlets past the edge: its square's own (`props.architecture`), else its region's; null keeps the
 * generic farm set. */
export function resolveBorderArchitecture(mapId: string, authored: string | null | undefined, snowCap: boolean): BorderArchitecture | null {
  const id = authored ?? BORDER_ARCHITECTURE_FALLBACK[mapId] ?? null;
  const style = resolveRegionalArchitecture(id);
  return style ? { style, mapId, snowCap } : null;
}

export interface FarmsteadSite {
  x: number; z: number; yaw: number; road: boolean;
  /** The side its shelter trees stand on (rad): the farm's windbreak arc. */
  shelter: number;
  /** A yard of a village strung along an exit road (selectVillageSites). */
  village?: boolean;
  /** The village's church, carried by one of its yards: its centre and the nave's heading (along the road). */
  church?: { x: number; z: number; yaw: number };
}

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
  const { sites: village, villages } = selectVillageSites(options);
  // the farms besides the villages: the map's count, one fewer for each village (at least two)
  const farmBudget = Math.max(2, options.count - villages);
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
      candidates.push({ x, z, yaw, road: roadBonus > 0, score, side, shelter: rng() * Math.PI * 2 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const picked: Candidate[] = [];
  const perSide = [0, 0, 0, 0], sideCap = Math.max(2, Math.ceil(options.count / 3));
  for (const c of candidates) {
    if (picked.length >= farmBudget) break;
    if (perSide[c.side] >= sideCap) continue;
    let ok = true, hamlet = 0;
    for (const v of village) if (Math.hypot(v.x - c.x, v.z - c.z) < 140) { ok = false; break; }
    if (!ok) continue;
    for (const p of picked) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (c.road && p.road && d < 150) { hamlet++; if (d < 75) { ok = false; break; } continue; }
      if (d < 230) { ok = false; break; }
    }
    if (!ok || hamlet > 2) continue;
    picked.push(c); perSide[c.side]++;
  }
  return village.concat(picked.map(({ x, z, yaw, road, shelter }) => ({ x, z, yaw, road, shelter })));
}

/**
 * The map-borders lane (wave 3, 2026-10-03, gauntlet wave 9: "no ... villages"): a village strung along a road that
 * leaves the square — three to five yards facing the road ~28 m off it on alternate sides, ~55 m apart along it, from the
 * first flat stretch VILLAGE_START_M out — so a road leaving the square runs on between roofs and gardens, with its
 * church across the road from one of its yards. One village a side, on the first of that side's roads that has room;
 * the farms elsewhere keep their own search (one fewer for each village). (Gauntlet wave 30, Frosthollow's north: the roads now end at
 * the foot of the ranges, ~300-450 m out on a mountain map, so a village searched from 260 m found no room on them and
 * the hamlet and church spire left the view; a village starts at 110 m, within the reach of every road.)
 */
const VILLAGE_START_M = 110, VILLAGE_END_SPARE_M = 25;
function selectVillageSites(options: BorderFarmsteadOptions): { sites: FarmsteadSite[]; villages: number } {
  const lines = options.roadLines ?? [];
  if (!lines.length || options.count < 4) return { sites: [], villages: 0 };
  const rng = mulberry32((options.seed ^ 0x7111A6E) >>> 0);
  const sites: FarmsteadSite[] = [];
  const sides = new Set<number>();
  const pointAt = (line: { xs: ArrayLike<number>; zs: ArrayLike<number> }, s: number): [number, number, number, number] | null => {
    // the point `s` metres along the line, and its heading
    let acc = 0;
    for (let i = 0; i + 1 < line.xs.length; i++) {
      const ax = line.xs[i], az = line.zs[i], bx = line.xs[i + 1], bz = line.zs[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (acc + len >= s && len > 1e-6) { const t = (s - acc) / len; return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / len, (bz - az) / len]; }
      acc += len;
    }
    return null;
  };
  const flatAt = (x: number, z: number, half: number): boolean => {
    const g = options.groundAt(x, z);
    if (!Number.isFinite(g)) return false;
    let lo = g, hi = g;
    for (const [du, dv] of [[half, half], [half, -half], [-half, half], [-half, -half]]) {
      const gh = options.groundAt(x + du, z + dv);
      if (!Number.isFinite(gh)) return false;
      lo = Math.min(lo, gh); hi = Math.max(hi, gh);
    }
    return hi - lo < 5 && options.woodsAt(x, z) < 0.3 && options.blockedAt(x, z) < 0.02 && (options.roadDistanceAt?.(x, z) ?? Infinity) >= 16;
  };
  for (const line of lines) {
    if (sites.length >= 20 || sides.size >= 4) break;
    const ex = line.xs[0], ez = line.zs[0];
    const side = Math.abs(ex) > Math.abs(ez) ? (ex > 0 ? 1 : 3) : (ez > 0 ? 0 : 2);
    if (sides.has(side)) continue;
    const spacing = 52 + rng() * 8, reach = Math.min(560, line.length - VILLAGE_END_SPARE_M);
    const homes = Math.min(3 + Math.floor(rng() * 3), Math.floor((reach - VILLAGE_START_M) / spacing) + 1);
    if (homes < 3) continue;
    for (let start = VILLAGE_START_M; start + (homes - 1) * spacing <= reach; start += 30) {
      const placed: FarmsteadSite[] = [];
      for (let k = 0; k < homes; k++) {
        const at = pointAt(line, start + k * spacing);
        if (!at) break;
        const [px, pz, hx, hz] = at, sideSign = k % 2 === 0 ? 1 : -1, off = 26 + rng() * 6;
        const x = px - hz * off * sideSign, z = pz + hx * off * sideSign;
        if (!flatAt(x, z, 16)) continue;
        // the house fronts the road: its yaw turns the yard's long side along the road
        const yaw = Math.atan2(hz, hx) + (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2) + (rng() - 0.5) * 0.08;
        placed.push({ x, z, yaw, road: true, village: true, shelter: Math.atan2(hx * sideSign, -hz * sideSign) + (rng() - 0.5) }); // the trees behind the house
      }
      if (placed.length < 3) continue;
      // the church: across the road from a yard (between the two beside it on the other side), its nave along the road
      // and its tower at the end that faces the square — the first flat place from the second yard on
      church: for (let k = 1; k < homes; k++) {
        const at = pointAt(line, start + k * spacing);
        if (!at) break;
        const [px, pz, hx, hz] = at, sideSign = k % 2 === 0 ? -1 : 1;
        for (const off of [30, 38]) {
          const x = px - hz * off * sideSign, z = pz + hx * off * sideSign;
          if (!flatAt(x, z, 18)) continue;
          placed[0].church = { x, z, yaw: Math.atan2(hz, hx) };
          break church;
        }
      }
      sites.push(...placed); sides.add(side);
      break;
    }
  }
  return { sites, villages: sides.size };
}

/**
 * The farms' shelter trees as a woods weight (0..1) the ring forest stands by: an arc of trees 26–58 m round each yard
 * on its shelter side (a windbreak and an orchard corner, never over the buildings), so a farm reads as a farm among
 * its trees and not boxes on a lawn.
 */
export function farmsteadTreesAt(sites: readonly FarmsteadSite[], x: number, z: number): number {
  let w = 0;
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i], dx = x - site.x, dz = z - site.z;
    if (dx > 60 || dx < -60 || dz > 60 || dz < -60) continue;
    const d = Math.hypot(dx, dz);
    const ring = smoothstep(24, 32, d) * (1 - smoothstep(44, 58, d));
    if (ring <= 0) continue;
    // (a village's yards keep a narrower, thinner arc behind the house: their arcs, 55 m apart along the road, closed
    // round a village as one wood and hid its houses from the square)
    const arc = site.village ? smoothstep(0.25, 0.7, Math.cos(Math.atan2(dz, dx) - site.shelter))
      : smoothstep(-0.35, 0.25, Math.cos(Math.atan2(dz, dx) - site.shelter));
    w = Math.max(w, ring * arc * (site.village ? 0.6 : 0.95));
  }
  return w;
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
/** The buildings' albedo scale over their authored colours (after the 0.8 value cap). */
const BUILDING_ALBEDO = 0.9;
const WINDOW: RGB = [0.08, 0.085, 0.09];
const DOOR: RGB = [0.26, 0.19, 0.13];
const STONE: RGB = [0.52, 0.50, 0.47];

/** Triangle soup with flat normals and vertex colours (linear). */
class Soup {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  // (gauntlet wave 1: a white wall in full sun read as "a glowing white sprite" — the authored colours are sRGB at
  // full value; the buildings sit at 0.8 of it, so plaster stays under the bloom threshold beside the lit meadow)
  private lin(c: RGB, shade: number): [number, number, number] {
    const k = BUILDING_ALBEDO * shade;
    return [Math.pow(c[0] * 0.8, 2.2) * k, Math.pow(c[1] * 0.8, 2.2) * k, Math.pow(c[2] * 0.8, 2.2) * k];
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

/**
 * The map-borders lane (2026-10-03, gauntlet wave 30, Ironworks' edge-e-up: "the new hamlets read as American red barns"):
 * on a map with a regional building kit the hamlets past the edge are the kit's own buildings — the same farmhouses,
 * barns, cottage pairs and churches as the square's, the region's construction in its colours — at the kit's mobile
 * detail, one merged vertex-coloured mesh with the generic yards. The kits' textured buckets are carried as their
 * mean albedo (sRGB), the roof and the stone in the kit's own tints; each part's vertex colour (the building's tint and
 * weathering, weather.ts) multiplies it.
 */
const KIT_ALBEDO: Readonly<Record<string, RGB>> = {
  plaster: [0.86, 0.83, 0.76], plaster2: [0.80, 0.70, 0.52], plaster3: [0.88, 0.86, 0.82],
  wood: [0.30, 0.22, 0.15], structureWood: [0.30, 0.22, 0.15], structureCanvas: [0.62, 0.58, 0.50],
  dark: [0.10, 0.11, 0.12], glass: [0.16, 0.19, 0.22], straw: [0.70, 0.60, 0.38], structureMetal: [0.40, 0.41, 0.42],
};
/** Decor a hamlet past the edge does without (sub-pixel there): gutters and metalwork, curtains, panes, sills and plinth
 * dressing. Its windows (the dark openings) stay, and within KIT_DETAIL_M of the edge its timber framing and brick bands. */
const KIT_DECOR_DROPPED = new Set(['structureMetal', 'curtain', 'glass', 'regionalStone', 'stone']);
const KIT_DETAIL_M = 170;
/** The plots the kit builders read (their base builders' footprints, m): [across, along, height]. */
const KIT_PLOTS: Readonly<Record<string, readonly [number, number, number]>> = {
  farmhouse: [11, 8.5, 7], cottage: [9, 7.5, 6.5], rowhouse: [12, 8, 9], adobe: [10, 8, 5],
  barn: [18, 10, 8], granary: [8, 6, 6], woodshed: [7, 4.5, 3.5], church: [24, 11, 22], chapel: [10, 7, 9],
};
/** A kit's buildings for a yard: its house, barn and shed, and its church (first of each list the kit has). */
function kitRoles(style: ArchitectureStyle): { house: string | null; barn: string | null; shed: string | null; church: string | null; pair: boolean } {
  const first = (ids: readonly string[]): string | null => ids.find((id) => !!style.builders[id]) ?? null;
  // a workers' colony (the coalfield kits): its cottage pairs in a row, no barn
  const pair = !style.builders.farmhouse && !style.builders.cottage && !!style.builders.rowhouse;
  const house = first(['farmhouse', 'cottage', 'adobe', 'rowhouse']);
  const barn = pair ? null : first(['barn', 'granary']);
  const shed = barn && barn !== 'granary' ? first(['woodshed', 'granary']) : null;
  return { house, barn, shed, church: first(['church', 'chapel']), pair };
}

/** Emit one kit building centred on (x, z), its local x along `yaw`, seated on the lowest ground under it. */
function addKitBuilding(s: Soup, options: BorderFarmsteadOptions, arch: BorderArchitecture, structureId: string,
  x: number, z: number, yaw: number, detailed: boolean): boolean {
  const [w, d, h] = KIT_PLOTS[structureId] ?? [10, 8, 7];
  const key = `${arch.style.id}:border:${structureId}`;
  let parts;
  try {
    parts = buildRegionalParts(arch.style, {
      structureId, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
      wallBucket: 'plaster', rng: streamFrom(hashSeed(key, options.seed, x, z, yaw)),
      variant: streamFrom(hashSeed(`${key}:variant`, options.seed, x, z, yaw)), mapId: arch.mapId, snowCap: arch.snowCap, tier: 'mobile',
    }, streamFrom(hashSeed(`${key}:weather`, options.seed, x, z, yaw)));
  } catch {
    return false;
  }
  const kept: { bucket: string; geometry: THREE.BufferGeometry }[] = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [bucket, list] of Object.entries(parts)) {
    for (const geometry of list) {
      const decor = !!geometry.userData.noCollision;
      const base = bucket.replace(/^regional(.)/, (_, c: string) => c.toLowerCase());
      if (decor && (KIT_DECOR_DROPPED.has(bucket) || KIT_DECOR_DROPPED.has(base) || (!detailed && base !== 'dark'))) { geometry.dispose(); continue; }
      kept.push({ bucket: base, geometry });
      if (decor) continue;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x); minZ = Math.min(minZ, box.min.z); maxZ = Math.max(maxZ, box.max.z);
    }
  }
  if (!kept.length || !Number.isFinite(minX)) { for (const k of kept) k.geometry.dispose(); return false; }
  const cos = Math.cos(yaw), sin = Math.sin(yaw), cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  // the lowest ground under the building's corners and centre (its plinth goes down into a slope)
  let lo = Infinity;
  for (const [u, v] of [[0, 0], [minX - cx, minZ - cz], [maxX - cx, minZ - cz], [maxX - cx, maxZ - cz], [minX - cx, maxZ - cz]]) {
    const g = options.groundAt(x + u * cos - v * sin, z + u * sin + v * cos);
    if (Number.isFinite(g)) lo = Math.min(lo, g);
  }
  if (!Number.isFinite(lo)) { for (const k of kept) k.geometry.dispose(); return false; }
  const y0 = lo - 0.05, roof = arch.style.surfaces.roof.tint, stone = arch.style.surfaces.stone.tint;
  for (const { bucket, geometry } of kept) {
    const albedo: RGB = bucket === 'roof' ? roof : bucket === 'stone' ? stone : KIT_ALBEDO[bucket] ?? KIT_ALBEDO.plaster;
    const lin = [0, 1, 2].map((k) => Math.pow(albedo[k] * 0.8, 2.2) * BUILDING_ALBEDO);
    const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal'), col = geometry.getAttribute('color');
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t++) {
      const i = index ? index.getX(t) : t;
      const lx = pos.getX(i) - cx, lz = pos.getZ(i) - cz;
      s.positions.push(x + lx * cos - lz * sin, y0 + pos.getY(i), z + lx * sin + lz * cos);
      const nx = nor ? nor.getX(i) : 0, ny = nor ? nor.getY(i) : 1, nz = nor ? nor.getZ(i) : 0;
      s.normals.push(nx * cos - nz * sin, ny, nx * sin + nz * cos);
      s.colors.push(lin[0] * (col ? col.getX(i) : 1), lin[1] * (col ? col.getY(i) : 1), lin[2] * (col ? col.getZ(i) : 1));
    }
    geometry.dispose();
  }
  return true;
}

/** A church at `frame` (its centre; the nave's ridge along `yaw`): a nave with its tower at the near end and a spire —
 * in the region's stone and roof where a kit without a church of its own builds the hamlets (the coalfield's brick). */
function addChurch(s: Soup, options: BorderFarmsteadOptions, frame: { x: number; z: number; yaw: number }, pal: Palette,
  kit?: { wall: RGB; roof: RGB }): void {
  const rng = mulberry32(((options.seed ^ 0xC4C4) + Math.round(frame.x * 7 + frame.z * 13)) >>> 0);
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  const cx = frame.x, cz = frame.z;
  const nave: Frame = { x: cx, z: cz, cos, sin };
  const L = 17 + rng() * 5, W = 8.5 + rng() * 1.5;
  const [lo, hi] = footprint(options.groundAt, nave, L + 6, W);
  if (!Number.isFinite(lo)) return;
  const wall: RGB = kit?.wall ?? (options.style === 'polder' ? [0.52, 0.30, 0.24] : options.style === 'nordic' ? [0.88, 0.87, 0.82] : [0.80, 0.77, 0.70]);
  const roof: RGB = kit?.roof ?? (options.style === 'winter' ? [0.90, 0.91, 0.93] : options.style === 'polder' ? [0.22, 0.22, 0.24] : pick(pal.roofs, rng));
  const y0 = lo - 0.4, eave = hi + 0.3 + 7.5;
  addWalls(s, nave, L, W, y0, eave, wall, rng, 1, true);
  addGableRoof(s, nave, L, W, eave, 48 * Math.PI / 180, wall, roof, rng);
  // the tower at the nave's west end, its spire
  const t = 2.8, tower: Frame = { x: cx - (L / 2 + t) * cos, z: cz - (L / 2 + t) * sin, cos, sin };
  const top = hi + 0.3 + 20 + rng() * 6;
  addBox(s, tower, 0, 0, t, t, y0, top, wall);
  const spire = top + 7 + rng() * 4, apex = at(tower, 0, 0, spire);
  const corners = [at(tower, -t, -t, top), at(tower, t, -t, top), at(tower, t, t, top), at(tower, -t, t, top)];
  for (let i = 0; i < 4; i++) s.tri(corners[i], corners[(i + 1) % 4], apex, roof, 0.9 + (i % 2) * 0.1);
  // the belfry openings, one dark slot a face
  for (const [u, v, du, dv] of [[t + 0.04, 0, 0, 1], [-t - 0.04, 0, 0, -1], [0, t + 0.04, -1, 0], [0, -t - 0.04, 1, 0]]) {
    const a = at(tower, u - du * 0.6, v - dv * 0.6, top - 3.2), b = at(tower, u + du * 0.6, v + dv * 0.6, top - 3.2);
    const c = at(tower, u + du * 0.6, v + dv * 0.6, top - 1.2), d = at(tower, u - du * 0.6, v - dv * 0.6, top - 1.2);
    s.quad(a, b, c, d, WINDOW);
  }
}

/** The farmsteads' merged mesh, or null when there are none. The caller joins its material to the shadow cascades. */
export function buildBorderFarmsteads(options: BorderFarmsteadOptions): THREE.Mesh | null {
  const sites = options.sites ?? selectFarmsteadSites(options);
  if (sites.length === 0) return null;
  const pal = PALETTES[options.style] ?? PALETTES.temperate;
  const s = new Soup();
  const arch = options.architecture ?? null;
  const kit = arch ? kitRoles(arch.style) : null;
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
    if (kit && arch && kit.house) {
      // the region's yard: its house (a coalfield colony's cottage pairs in a short row), its barn and its shed — the
      // generic yard's places, each building centred on its own; past KIT_DETAIL_M only the walls, roofs and windows
      const detailed = Math.max(Math.abs(site.x), Math.abs(site.z)) - HALF < KIT_DETAIL_M;
      const yawOf = (f: Frame): number => Math.atan2(f.sin, f.cos);
      const house = local(-9 + rng() * 2, -6 + rng() * 2, false);
      addKitBuilding(s, options, arch, kit.house, house.x, house.z, yawOf(house), detailed);
      if (kit.pair && site.village) {
        // (a village's row: a second pair beside the first)
        const next = local(8 + rng() * 2, -6 + rng() * 2, false);
        addKitBuilding(s, options, arch, kit.house, next.x, next.z, yawOf(next), detailed);
      }
      if (kit.barn) {
        const barn = local(10 + rng() * 2, 9 + rng() * 2, rng() < 0.4);
        addKitBuilding(s, options, arch, kit.barn, barn.x, barn.z, yawOf(barn), detailed);
      }
      if (kit.shed && rng() < 0.8) {
        const shed = local(-12 + rng() * 2, 13 + rng() * 2, rng() < 0.5);
        addKitBuilding(s, options, arch, kit.shed, shed.x, shed.z, yawOf(shed), detailed);
      }
      continue;
    }
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
  // a village's church; else the hamlet's — 40 m off the first road farm with another within 150 m, on the road side
  const churchStyles: readonly FarmsteadStyle[] = ['temperate', 'polder', 'winter', 'alpine', 'nordic'];
  if (churchStyles.includes(options.style)) {
    const villageChurches = sites.filter((site) => site.church);
    const hamlet = villageChurches.length ? undefined
      : sites.find((a) => a.road && sites.some((b) => b !== a && b.road && Math.hypot(a.x - b.x, a.z - b.z) < 150));
    const frames = villageChurches.map((site) => site.church!);
    if (hamlet) frames.push({ x: hamlet.x - 40 * Math.sin(hamlet.yaw), z: hamlet.z + 40 * Math.cos(hamlet.yaw), yaw: hamlet.yaw });
    // (the kit's church when it has one, its nave along the frame's heading; else the generic one)
    for (const frame of frames) {
      if (kit?.church && arch && addKitBuilding(s, options, arch, kit.church, frame.x, frame.z, frame.yaw, true)) continue;
      addChurch(s, options, frame, pal, arch ? { wall: arch.style.surfaces.stone.tint, roof: arch.style.surfaces.roof.tint } : undefined);
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
