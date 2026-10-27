/**
 * armorPanelPlates.ts — panel plates (262 phase 2, behind a flag, default off): a shell that strikes a frame's
 * collision cells takes the plate and the normal of the armour panel it strikes (armorPanels.ts: the skin cut into
 * zones with straight borders and grown into flat panels), not of the one hull triangle it meets.
 *
 * Owner, 2026-10-27: "make the hitboxes/highlighting a lot better on tanks". The cells stay the volume a shell
 * enters (where and when it hits is unchanged); what it meets there changes:
 *   - the plate (thickness, ERA link, kind) is the panel's zone: the authored plate the region of the skin belongs to,
 *     with straight borders, instead of the plate nearest each hull triangle (a zigzag across a glacis);
 *   - the impact angle is taken from the panel's normal (its facets' area-weighted mean), so the facets a few degrees
 *     apart that a slice's hull leaves across one plate no longer give neighbouring points different angles.
 * The scoped flashlight samples the same panels, so with the flag on, the colour of a panel is what a shot there gets.
 *
 * Pure numbers, deterministic (the panels are built in a fixed order; Math.sqrt only), Node-runnable, no DOM or
 * WebGL. A lookup is built once per cell list (every vehicle of one spec shares it); resolving a point allocates
 * nothing.
 */
import { armorPanelSet } from './armorPanels.ts';
import { setPanelPlateResolver, type ArmorCollisionCell, type PanelPlateHit } from './armor.ts';

type PanelCells = Parameters<typeof armorPanelSet>[0];
type PanelPlates = Parameters<typeof armorPanelSet>[1];

let enabled = false;
/** With panel normals (the default when on): the impact angle from the panel's plane, else from the cell face's. */
let panelNormals = true;

/**
 * Panel plates on or off for every trace in this realm (default off; the owner decides the flip): installs the
 * resolver in sim/armor.ts. Returns the previous setting. Every authority (the match server, a browser host, a solo
 * page) must agree: it is one constant until the flip, never a player setting.
 */
export function setArmorPanelPlates(on: boolean, { normals = true }: { normals?: boolean } = {}): boolean {
  const previous = enabled;
  enabled = !!on;
  panelNormals = normals;
  setPanelPlateResolver(enabled ? resolvePanelPlate : null, sealSliceSeams);
  return previous;
}

/** A cap this near (m) a boundary its cell shares with the next slice is that boundary's cap. */
const SEAM_REACH_M = 0.25;
/** A face within 45° of the hull's axis (|n·z|), every corner near a shared boundary, is a slice's end cap there. */
const CAP_Z = 0.7071067811865476;

const sealed = new WeakMap<object, readonly ArmorCollisionCell[]>();

/**
 * A frame's slices with their seams sealed (262): the generator hulls each longitudinal slice on its own, and where
 * the vehicle's surface does not reach a slice boundary across the whole section, the hull's end cap there tilts
 * back from it — the next slice's cap tilts the other way, and a wedge up to ~9 cm wide runs through the armour
 * between them (a shell along it meets no plate; tools/armor-panel-plates-report.mjs counts them). Every end-cap face
 * of a slice (within 45° of the axis, every corner within SEAM_REACH_M of a boundary it shares with another slice)
 * becomes the boundary's plane: the cell grows into the wedge (never past its own bound), and the two caps then
 * coincide, the inside of the armour.
 * Hull ends, structure cells and lateral bands are left as they are. Cached per cell list; the cells are copies.
 */
export function sealSliceSeams(cells: readonly ArmorCollisionCell[]): readonly ArmorCollisionCell[] {
  const hit = sealed.get(cells);
  if (hit) return hit;
  const key = (z: number): number => Math.round(z * 1e4);
  const starts = new Set<number>(), ends = new Set<number>();
  const slices = (cell: ArmorCollisionCell): boolean => {
    const extra = cell as ArmorCollisionCell & { structureKind?: unknown; lateralBand?: unknown };
    return !extra.structureKind && !extra.lateralBand;
  };
  for (const cell of cells) if (slices(cell)) { starts.add(key(cell.min[2])); ends.add(key(cell.max[2])); }
  let changed = false;
  const out = cells.map((cell) => {
    if (!slices(cell)) return cell;
    // a boundary is shared when another slice starts where this one ends (or ends where it starts)
    const front = starts.has(key(cell.max[2])) ? cell.max[2] : null;
    const back = ends.has(key(cell.min[2])) ? cell.min[2] : null;
    if (front === null && back === null) return cell;
    let touched = false;
    const faces = cell.faces.map((face) => {
      const n = face.normal;
      const bound = n[2] >= CAP_Z ? front : n[2] <= -CAP_Z ? back : null;
      if (bound === null) return face;
      // every corner of the face stands within reach of the boundary
      for (const index of face.indices) if (Math.abs(cell.vertices[index][2] - bound) > SEAM_REACH_M) return face;
      touched = true;
      const sign = n[2] > 0 ? 1 : -1;
      return { ...face, normal: [0, 0, sign] as const, constant: -sign * bound, internal: true };
    });
    if (!touched) return cell;
    changed = true;
    return { ...cell, faces };
  });
  const result = changed ? out : cells;
  sealed.set(cells, result);
  return result;
}

/** How far (m) off a facet's plane, and outside its outline, a cell's entry point may lie and still be on it. */
const ON_PLANE_M = 0.03;
const ON_EDGE_M = 0.01;
const GRID_M = 0.5;

interface PanelPlateLookup {
  resolve(x: number, y: number, z: number, out: PanelPlateHit): boolean;
}

function buildLookup(cells: PanelCells, plates: PanelPlates): PanelPlateLookup | null {
  const set = armorPanelSet(cells, plates);
  if (!set) return null;
  const facets = set.facets;
  const count = facets.length;
  // facet planes (n, c: n·x + c = 0), their panels, and their outlines' inward edge planes, flat
  const planes = new Float64Array(count * 4);
  const panel = new Int32Array(count);
  const edgeStart = new Int32Array(count + 1);
  let edges = 0;
  for (const facet of facets) edges += facet.points.length;
  const edgePlanes = new Float64Array(edges * 4);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let cursor = 0;
  facets.forEach((facet, index) => {
    const n = facet.normal, p0 = facet.points[0];
    planes[index * 4] = n[0]; planes[index * 4 + 1] = n[1]; planes[index * 4 + 2] = n[2];
    planes[index * 4 + 3] = -(n[0] * p0[0] + n[1] * p0[1] + n[2] * p0[2]);
    panel[index] = set.facetPanel[index];
    edgeStart[index] = cursor;
    for (let k = 0; k < facet.points.length; k++) {
      const a = facet.points[k], b = facet.points[(k + 1) % facet.points.length];
      // outward in the facet's plane: (b - a) × n (the outline winds counter-clockwise about n)
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
      let sx = ey * n[2] - ez * n[1], sy = ez * n[0] - ex * n[2], sz = ex * n[1] - ey * n[0];
      const size = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      sx /= size; sy /= size; sz /= size;
      edgePlanes[cursor * 4] = sx; edgePlanes[cursor * 4 + 1] = sy; edgePlanes[cursor * 4 + 2] = sz;
      edgePlanes[cursor * 4 + 3] = -(sx * a[0] + sy * a[1] + sz * a[2]);
      cursor++;
      for (let axis = 0; axis < 3; axis++) {
        if (a[axis] < min[axis]) min[axis] = a[axis];
        if (a[axis] > max[axis]) max[axis] = a[axis];
      }
    }
  });
  edgeStart[count] = cursor;
  const normals = new Float64Array(set.panels.length * 3);
  const panelPlates = set.panels.map((entry, index) => {
    normals[index * 3] = entry.normal[0]; normals[index * 3 + 1] = entry.normal[1]; normals[index * 3 + 2] = entry.normal[2];
    return entry.plate;
  });
  // a uniform grid over the frame: each cell lists the facets whose bounds (grown by the plane tolerance) reach it
  const origin = min.map((value) => value - ON_PLANE_M);
  const dims = [0, 1, 2].map((axis) => Math.max(1, Math.ceil((max[axis] + ON_PLANE_M - origin[axis]) / GRID_M)));
  const buckets: number[][] = Array.from({ length: dims[0] * dims[1] * dims[2] }, () => []);
  facets.forEach((facet, index) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const point of facet.points) for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis], point[axis]); hi[axis] = Math.max(hi[axis], point[axis]);
    }
    const from = lo.map((value, axis) => Math.max(0, Math.floor((value - ON_PLANE_M - origin[axis]) / GRID_M)));
    const to = hi.map((value, axis) => Math.min(dims[axis] - 1, Math.floor((value + ON_PLANE_M - origin[axis]) / GRID_M)));
    for (let x = from[0]; x <= to[0]; x++) for (let y = from[1]; y <= to[1]; y++) for (let z = from[2]; z <= to[2]; z++) {
      buckets[(x * dims[1] + y) * dims[2] + z].push(index);
    }
  });
  const bucketStart = new Int32Array(buckets.length + 1);
  let total = 0;
  buckets.forEach((list, index) => { bucketStart[index] = total; total += list.length; });
  bucketStart[buckets.length] = total;
  const bucketFacets = new Int32Array(total);
  buckets.forEach((list, index) => bucketFacets.set(list, bucketStart[index]));

  return {
    resolve(x, y, z, out) {
      const gx = Math.floor((x - origin[0]) / GRID_M), gy = Math.floor((y - origin[1]) / GRID_M), gz = Math.floor((z - origin[2]) / GRID_M);
      if (gx < 0 || gy < 0 || gz < 0 || gx >= dims[0] || gy >= dims[1] || gz >= dims[2]) return false;
      const bucket = (gx * dims[1] + gy) * dims[2] + gz;
      let best = -1, bestDistance = ON_PLANE_M;
      for (let k = bucketStart[bucket]; k < bucketStart[bucket + 1]; k++) {
        const facet = bucketFacets[k];
        const distance = Math.abs(planes[facet * 4] * x + planes[facet * 4 + 1] * y + planes[facet * 4 + 2] * z + planes[facet * 4 + 3]);
        if (distance > bestDistance) continue;
        let inside = true;
        for (let e = edgeStart[facet]; e < edgeStart[facet + 1]; e++) {
          if (edgePlanes[e * 4] * x + edgePlanes[e * 4 + 1] * y + edgePlanes[e * 4 + 2] * z + edgePlanes[e * 4 + 3] > ON_EDGE_M) { inside = false; break; }
        }
        if (!inside) continue;
        best = facet;
        bestDistance = distance;
      }
      if (best < 0) return false;
      const id = panel[best];
      out.plate = panelPlates[id];
      // without panel normals the caller keeps the cell face's (NaN: none given)
      if (panelNormals) { out.nx = normals[id * 3]; out.ny = normals[id * 3 + 1]; out.nz = normals[id * 3 + 2]; }
      else { out.nx = NaN; out.ny = NaN; out.nz = NaN; }
      return true;
    },
  };
}

const lookups = new WeakMap<object, PanelPlateLookup | null>();

/** Points resolved to a panel and points on none (the caller kept the cell face's plate): read by the gate report. */
export const panelPlateCounters = { resolved: 0, missed: 0 };

/**
 * The panel a frame-local point of a frame's skin lies on: writes its plate and normal into `out` and returns true,
 * or false when the point is on no panel (the caller keeps the cell face's). Built once per cell list.
 */
export function resolvePanelPlate(
  cells: PanelCells,
  plates: PanelPlates,
  x: number,
  y: number,
  z: number,
  out: PanelPlateHit,
): boolean {
  if (!cells?.length) return false;
  let lookup = lookups.get(cells);
  if (lookup === undefined) { lookup = buildLookup(cells, plates); lookups.set(cells, lookup); }
  const hit = lookup ? lookup.resolve(x, y, z, out) : false;
  if (hit) panelPlateCounters.resolved++; else panelPlateCounters.missed++;
  return hit;
}
