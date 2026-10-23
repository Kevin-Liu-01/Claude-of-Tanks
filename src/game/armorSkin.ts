// The armour skin (243): the outer surface of one frame's collision cells — exactly what a shell can strike first —
// as flat panels, one per plate and plane.
//
// The cells are overlapping and abutting convex slices (combatAnatomy: longitudinal shell slices, cupola and hatch
// structure cells). Drawing every cell face showed their inside: the faces two slices share, a structure cell's walls
// inside the turret, and a hole wherever a larger slice's end face was flagged internal although a ring of it is the
// real step in the armour. Each face here is clipped against every other cell of its frame, so only the union's
// boundary remains; coincident outer faces are kept once.
//
// Pure numbers (no three.js): the scoped armour flashlight builds its overlay from it.

export type SkinPoint = [number, number, number];

interface SkinFace {
  readonly indices: readonly number[];
  readonly normal: readonly number[];
  readonly constant: number;
  readonly plate?: unknown;
}

interface SkinCell {
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly vertices: readonly (readonly number[])[];
  readonly faces: readonly SkinFace[];
}

export interface ArmorSkinPanel {
  /** The plate the panel's faces resolve to (the face traceTank reports there). */
  readonly plate: unknown;
  /** Outward unit normal and plane constant (n·x + c = 0 on the panel). */
  readonly normal: SkinPoint;
  readonly constant: number;
  /** Convex, counter-clockwise (about the normal) pieces covering the panel. */
  readonly pieces: SkinPoint[][];
}

interface Plane { n: SkinPoint; c: number }

/** On-plane tolerance (m): the generator quantizes cells to 0.1 mm, shared faces coincide well inside this. */
const PLANE_EPS_M = 1e-4;
/** Pieces under this area (m²) are clipping slivers, not armour. */
const MIN_PIECE_AREA_M2 = 2e-5;
const COINCIDENT_DOT = 0.9995;

const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function polygonArea(points: readonly SkinPoint[], normal: readonly number[]): number {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    x += a[1] * b[2] - a[2] * b[1];
    y += a[2] * b[0] - a[0] * b[2];
    z += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(x * normal[0] + y * normal[1] + z * normal[2]) / 2;
}

/** Distances under this (m) are on the plane: shared slice faces stay exact under rounding. */
const SNAP_M = 1e-7;
const planeDistance = (plane: Plane, point: readonly number[]): number => {
  const distance = dot(plane.n, point) + plane.c;
  return Math.abs(distance) < SNAP_M ? 0 : distance;
};

/** Sutherland–Hodgman: the part of a convex polygon with side·(n·x + c) <= 0. */
function clipPolygon(points: readonly SkinPoint[], plane: Plane, side: 1 | -1): SkinPoint[] {
  const out: SkinPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = side * planeDistance(plane, a), db = side * planeDistance(plane, b);
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function cellPlanes(cell: SkinCell): Plane[] {
  const planes: Plane[] = [];
  const seen = new Set<string>();
  for (const face of cell.faces) {
    const n = face.normal;
    if (!n || !Number.isFinite(face.constant)) continue;
    const key = `${Math.round(n[0] * 2000)},${Math.round(n[1] * 2000)},${Math.round(n[2] * 2000)},${Math.round(face.constant * 2000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planes.push({ n: [n[0], n[1], n[2]], c: face.constant });
  }
  return planes;
}

function boundsOverlap(min: readonly number[], max: readonly number[], points: readonly SkinPoint[]): boolean {
  for (let axis = 0; axis < 3; axis++) {
    let low = Infinity, high = -Infinity;
    for (const point of points) { low = Math.min(low, point[axis]); high = Math.max(high, point[axis]); }
    if (high < min[axis] - PLANE_EPS_M || low > max[axis] + PLANE_EPS_M) return false;
  }
  return true;
}

/**
 * The pieces of a face polygon outside one other cell. A face lying in that cell's own outer face (same outward
 * normal) is kept by the lower-indexed cell only; a face on a face of opposite normal is the shared inside of the
 * union and goes.
 */
function subtractCell(
  polygon: SkinPoint[],
  normal: readonly number[],
  planes: readonly Plane[],
  keepCoincident: boolean,
  out: SkinPoint[][],
): void {
  // Untouched unless the polygon reaches the cell's interior: one separating plane keeps it whole (and unsplit).
  for (const plane of planes) {
    let outside = true, onPlane = true;
    for (const point of polygon) {
      const distance = dot(plane.n, point) + plane.c;
      if (Math.abs(distance) > PLANE_EPS_M) onPlane = false;
      if (distance < -SNAP_M) outside = false;
    }
    if (onPlane) {
      if (keepCoincident && dot(plane.n, normal) > COINCIDENT_DOT) { out.push(polygon); return; }
      continue;
    }
    if (outside) { out.push(polygon); return; }
  }
  let rest = polygon;
  for (const plane of planes) {
    let onPlane = true;
    for (const point of rest) {
      if (Math.abs(dot(plane.n, point) + plane.c) > PLANE_EPS_M) { onPlane = false; break; }
    }
    if (onPlane) {
      if (dot(plane.n, normal) > COINCIDENT_DOT && keepCoincident) { out.push(rest); return; }
      continue;
    }
    const outside = clipPolygon(rest, plane, -1);
    if (outside.length >= 3 && polygonArea(outside, normal) > MIN_PIECE_AREA_M2) out.push(outside);
    rest = clipPolygon(rest, plane, 1);
    if (rest.length < 3 || polygonArea(rest, normal) <= MIN_PIECE_AREA_M2) return;
  }
  // what remains lies inside the other cell
}

const skins = new WeakMap<readonly SkinCell[], ArmorSkinPanel[]>();

/**
 * The outer skin of one frame's collision cells, as panels (one per plate and plane). Cached per cell list: every
 * vehicle of one spec shares it, and the panels are read-only.
 */
export function armorSkinPanels(cells: readonly SkinCell[] | undefined): ArmorSkinPanel[] {
  if (!cells?.length) return [];
  let skin = skins.get(cells);
  if (!skin) { skin = buildSkin(cells); skins.set(cells, skin); }
  return skin;
}

function buildSkin(list: readonly SkinCell[]): ArmorSkinPanel[] {
  const planes = list.map(cellPlanes);
  const panels = new Map<string, { plate: unknown; normal: SkinPoint; constant: number; pieces: SkinPoint[][] }>();
  const plateKeys = new Map<unknown, number>();
  list.forEach((cell, index) => {
    // Coplanar faces of one cell are one plane to traceTank, which reports the first of them: so does the skin.
    const planePlate = new Map<string, unknown>();
    for (const face of cell.faces) {
      if (!face.normal) continue;
      const planeKey = `${Math.round(face.normal[0] * 1000)},${Math.round(face.normal[1] * 1000)},${Math.round(face.normal[2] * 1000)}|${Math.round(face.constant * 1000)}`;
      if (!planePlate.has(planeKey)) planePlate.set(planeKey, face.plate);
    }
    for (const face of cell.faces) {
      const points = face.indices.map((vertex) => cell.vertices[vertex]).filter(Boolean)
        .map((point) => [point[0], point[1], point[2]] as SkinPoint);
      if (points.length < 3 || !face.normal) continue;
      let pieces: SkinPoint[][] = [points];
      for (let other = 0; other < list.length && pieces.length; other++) {
        if (other === index) continue;
        const next: SkinPoint[][] = [];
        for (const piece of pieces) {
          if (!boundsOverlap(list[other].min, list[other].max, piece)) { next.push(piece); continue; }
          subtractCell(piece, face.normal, planes[other], index < other, next);
        }
        pieces = next;
      }
      if (!pieces.length) continue;
      const n = face.normal;
      const planeKey = `${Math.round(n[0] * 1000)},${Math.round(n[1] * 1000)},${Math.round(n[2] * 1000)}|${Math.round(face.constant * 1000)}`;
      const plate = planePlate.get(planeKey);
      if (!plateKeys.has(plate)) plateKeys.set(plate, plateKeys.size);
      const key = `${plateKeys.get(plate)}|${planeKey}`;
      let panel = panels.get(key);
      if (!panel) {
        panel = { plate, normal: [n[0], n[1], n[2]], constant: face.constant, pieces: [] };
        panels.set(key, panel);
      }
      panel.pieces.push(...pieces);
    }
  });
  return [...panels.values()];
}

const sub = (a: readonly number[], b: readonly number[]): SkinPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: readonly number[], b: readonly number[]): SkinPoint =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function insidePiece(point: readonly number[], piece: readonly SkinPoint[], normal: readonly number[]): boolean {
  for (let i = 0; i < piece.length; i++) {
    const a = piece[i], b = piece[(i + 1) % piece.length];
    if (dot(cross(sub(b, a), sub(point, a)), normal) < -1e-7) return false;
  }
  return true;
}

/** A panel with its bounds, for point queries. */
export interface SkinPanelIndex { readonly panel: ArmorSkinPanel; readonly min: SkinPoint; readonly max: SkinPoint }

export function indexSkinPanels(panels: readonly ArmorSkinPanel[]): SkinPanelIndex[] {
  return panels.map((panel) => {
    const min: SkinPoint = [Infinity, Infinity, Infinity], max: SkinPoint = [-Infinity, -Infinity, -Infinity];
    for (const piece of panel.pieces) for (const point of piece) {
      for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
    }
    return { panel, min, max };
  });
}

/** True when a point lies (within `margin`) in a panel's plane and bounds. */
export function onSkinPanel(entry: SkinPanelIndex, point: readonly number[], margin: number): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (point[axis] < entry.min[axis] - margin || point[axis] > entry.max[axis] + margin) return false;
  }
  return Math.abs(dot(entry.panel.normal, point) + entry.panel.constant) <= margin;
}

const PROBE_M = 0.015;
const NEIGHBOUR_M = 0.012;

/**
 * Whether the edge a–b of a piece of panel `panelIndex` is on the skin's outline: a plate border or a crease of at
 * least the soft-crease angle. `inward` is any point of the piece on the edge's inner side. An edge between two pieces
 * of one panel (a clipping cut), or between panels of one plate meeting at a shallower angle, is not.
 */
export function skinBorderTest(
  index: readonly SkinPanelIndex[],
  softCreaseCos: number,
): (panelIndex: number, a: readonly number[], b: readonly number[], inward: readonly number[]) => boolean {
  return (panelIndex, a, b, inward) => {
    const own = index[panelIndex].panel;
    const m: SkinPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    let out = cross(sub(b, a), own.normal);
    if (dot(out, sub(m, inward)) < 0) out = [-out[0], -out[1], -out[2]];
    const size = Math.hypot(out[0], out[1], out[2]) || 1;
    const probe: SkinPoint = [m[0] + out[0] / size * PROBE_M, m[1] + out[1] / size * PROBE_M, m[2] + out[2] / size * PROBE_M];
    if (own.pieces.some((piece) => insidePiece(probe, piece, own.normal))) return false;
    for (let other = 0; other < index.length; other++) {
      if (other === panelIndex) continue;
      const entry = index[other], panel = entry.panel;
      if (panel.plate !== own.plate || dot(panel.normal, own.normal) < softCreaseCos) continue;
      if (!onSkinPanel(entry, m, NEIGHBOUR_M)) continue;
      const distance = dot(panel.normal, probe) + panel.constant;
      const projected: SkinPoint = [probe[0] - panel.normal[0] * distance, probe[1] - panel.normal[1] * distance,
        probe[2] - panel.normal[2] * distance];
      if (panel.pieces.some((piece) => insidePiece(projected, piece, panel.normal))) return false;
    }
    return true;
  };
}

/** The skin's outline as line segments (x0,y0,z0, x1,y1,z1, ...) per panel, in panel order. */
export function skinOutlineSegments(panels: readonly ArmorSkinPanel[], softCreaseCos: number): number[][] {
  const index = indexSkinPanels(panels);
  const isBorder = skinBorderTest(index, softCreaseCos);
  return panels.map((panel, panelIndex) => {
    const segments: number[] = [];
    for (const piece of panel.pieces) {
      const center = [0, 0, 0];
      for (const point of piece) for (let axis = 0; axis < 3; axis++) center[axis] += point[axis] / piece.length;
      for (let i = 0; i < piece.length; i++) {
        const a = piece[i], b = piece[(i + 1) % piece.length];
        if (isBorder(panelIndex, a, b, center)) segments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    return segments;
  });
}
