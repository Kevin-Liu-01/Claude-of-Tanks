// (265, the balance lane's FAIRNESS-265 §3: the M1A2's gun face) A forward turret face only partly over a mantlet or
// gun-notch plate reads, at each point, the plate it lies over. combatAnatomy.ts gave every calibrated face one plate by
// its centre (gunFacePlate, else nearestPlate). A longitudinal slice's convex cell can lay one triangle across a
// cheek and the gun: the M1A2's cell 7 front runs x -1.52..0.22 with 53% of its area in front of the mantlet, but its
// centre lay 9 mm outside the mantlet's x range, so every hit there read the 850 mm cheek where the SEPv2's identical
// plates read the 350 mm mantlet. The face's centre read stays its `plate` (the receipts' and the census's per-face read);
// its split cuts its plane's facet (sim/convexCellFacets.ts, the surface a round can meet) at the gun plates' windows (the plate's x range, its height +-0.1 m and 0.35 m
// of its depth, as gunFacePlate) into convex pieces, each with its plate: a piece inside a window reads the nearest
// such plate, a piece off them its own face's plate (the nearest other plate where that was the gun's). The
// authority's trace (sim/armor.ts), the armour panels and the overlays all read the piece a point lies in, so what is
// drawn is what a round meets. Node-runnable; the per-hit read allocates nothing.
// Copyright © 2026 Kevin B. Liu.

type Vec3 = readonly number[];

/** One piece of a split face: its plate and its outline projected on the face's plane (u, v pairs, counter-clockwise). */
interface GunFacePiece<P> {
  readonly plate: P;
  readonly uv: readonly number[];
  /** the outline in the face's frame and winding (outward), for the overlays */
  readonly points: readonly Vec3[];
}

/** A face's pieces and the two axes its outline is projected on (the normal's largest component is dropped). */
export interface GunFaceSplit<P> {
  readonly axisU: 0 | 1 | 2;
  readonly axisV: 0 | 1 | 2;
  readonly pieces: readonly GunFacePiece<P>[];
}

/** A gun plate's window: its padded box (lo, hi) and its own bounds (min, max), which a nearer plate wins by. */
export interface GunFaceWindow<P> {
  readonly plate: P;
  readonly lo: Vec3;
  readonly hi: Vec3;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Pieces under this area (m²) are slivers of a vertex or edge on a window's boundary, not a share of the face. */
const PIECE_MIN_AREA_M2 = 1e-5;

function polygonArea(points: readonly Vec3[]): number {
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[0], b = points[i], c = points[i + 1];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    x += uy * vz - uz * vy; y += uz * vx - ux * vz; z += ux * vy - uy * vx;
  }
  return Math.hypot(x, y, z) / 2;
}

/** The part of a convex polygon on one side of an axis plane (keepAbove: coordinate >= value). */
function clipAxis(points: readonly Vec3[], axis: number, value: number, keepAbove: boolean): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const inA = keepAbove ? a[axis] >= value : a[axis] <= value;
    const inB = keepAbove ? b[axis] >= value : b[axis] <= value;
    if (inA) out.push(a);
    if (inA !== inB) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

const centroid = (points: readonly Vec3[]): number[] => {
  const c = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) c[k] += p[k] / points.length;
  return c;
};

function boundsGapSquared(point: Vec3, min: Vec3, max: Vec3): number {
  let squared = 0;
  for (let axis = 0; axis < 3; axis++) {
    const gap = point[axis] < min[axis] ? min[axis] - point[axis] : point[axis] > max[axis] ? point[axis] - max[axis] : 0;
    squared += gap * gap;
  }
  return squared;
}

/** A convex outline on the plane being split (a cell's facet) and what a point of it reads off the gun windows. */
interface GunFacePart<P> {
  readonly points: readonly Vec3[];
  readonly offGun: (point: Vec3) => P;
}

interface Region<P> { points: Vec3[]; windows: GunFaceWindow<P>[]; offGun: (point: Vec3) => P }

/**
 * The split of a plane's outlines against the gun windows, or null when no part of them lies inside a window or one
 * plate holds all of them. Each window cuts the regions it meets into the part inside it and the convex parts off each
 * of its six faces; a region inside several windows reads the one whose plate is nearest its centroid, as gunFacePlate
 * does a face centre, and a region off them reads its outline's `offGun` at its centroid.
 */
export function splitGunFace<P>(
  parts: readonly GunFacePart<P>[],
  normal: Vec3,
  windows: readonly GunFaceWindow<P>[],
): GunFaceSplit<P> | null {
  let regions: Region<P>[] = parts.map((part) => ({ points: part.points.slice(), windows: [], offGun: part.offGun }));
  for (const window of windows) {
    const next: Region<P>[] = [];
    for (const region of regions) {
      let rest: Vec3[] = region.points;
      for (let axis = 0; axis < 3 && rest.length >= 3; axis++) {
        for (const above of [false, true]) {
          if (rest.length < 3) break;
          const value = above ? window.hi[axis] : window.lo[axis];
          const off = clipAxis(rest, axis, value, above);
          if (off.length >= 3 && polygonArea(off) >= PIECE_MIN_AREA_M2) next.push({ ...region, points: off });
          rest = clipAxis(rest, axis, value, !above);
        }
      }
      if (rest.length >= 3 && polygonArea(rest) >= PIECE_MIN_AREA_M2) next.push({ ...region, points: rest, windows: [...region.windows, window] });
    }
    regions = next;
  }
  if (!regions.some((region) => region.windows.length)) return null;
  const read = (region: Region<P>): P => {
    if (!region.windows.length) return region.offGun(centroid(region.points));
    const c = centroid(region.points);
    let best = region.windows[0], bestGap = Infinity;
    for (const window of region.windows) {
      const gap = boundsGapSquared(c, window.min, window.max);
      if (gap < bestGap) { bestGap = gap; best = window; }
    }
    return best.plate;
  };
  const plates = regions.map(read);
  if (plates.every((plate) => plate === plates[0])) return null;
  const n = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
  const drop = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
  const axisU = (drop === 0 ? 1 : 0) as 0 | 1 | 2;
  const axisV = (drop === 2 ? 1 : 2) as 0 | 1 | 2;
  const pieces = regions.map((region, index): GunFacePiece<P> => {
    const uv: number[] = [];
    for (const p of region.points) uv.push(p[axisU], p[axisV]);
    let twice = 0;
    for (let i = 0; i < uv.length; i += 2) {
      const j = (i + 2) % uv.length;
      twice += uv[i] * uv[j + 1] - uv[j] * uv[i + 1];
    }
    if (twice < 0) {
      const flipped: number[] = [];
      for (let i = uv.length - 2; i >= 0; i -= 2) flipped.push(uv[i], uv[i + 1]);
      return { plate: plates[index], uv: flipped, points: region.points };
    }
    return { plate: plates[index], uv, points: region.points };
  });
  return { axisU, axisV, pieces };
}

/**
 * The plate a point on a split face lies over: the piece containing it, or (a point on a seam, by rounding) the piece it
 * lies least outside. Allocation-free: the authority calls it in the trace.
 */
export function gunFaceSplitPlate<P>(split: GunFaceSplit<P>, x: number, y: number, z: number): P {
  const u = split.axisU === 0 ? x : split.axisU === 1 ? y : z;
  const v = split.axisV === 0 ? x : split.axisV === 1 ? y : z;
  let best = split.pieces[0].plate, bestMargin = -Infinity;
  for (const piece of split.pieces) {
    const uv = piece.uv;
    let margin = Infinity;
    for (let i = 0; i < uv.length; i += 2) {
      const j = (i + 2) % uv.length;
      const eu = uv[j] - uv[i], ev = uv[j + 1] - uv[i + 1];
      const length = Math.hypot(eu, ev);
      if (!(length > 0)) continue;
      const side = (eu * (v - uv[i + 1]) - ev * (u - uv[i])) / length;
      if (side < margin) margin = side;
    }
    if (margin >= 0) return piece.plate;
    if (margin > bestMargin) { bestMargin = margin; best = piece.plate; }
  }
  return best;
}
