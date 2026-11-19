// Hitbox fit census (owner 2026-11-18: "some hitboxes of tanks seem to be incorrect, because i can see hitmarks that are
// floating in air ... some tanks like abrams x just have a floating hit box"): every surface a round can strike must lie
// on geometry the player sees.
//
// A tank's hit surfaces are what sim/armor.ts traces: the exterior faces of its collision cells (hulled from the drawn
// shell), the plates it traces directly (every non-main plate, and a frame's main plates when it has no cells), its
// external weapon housings and its track prisms. Each is sampled over its area (about 49 points a face, its centre
// first) in the authority's own frames (hull: the root; turret: the root plus armor.turretPivot at rest; gun-follow:
// the turret plus armor.gunPivot at rest), and each sample's distance to the nearest visible triangle of the default
// high-quality build is measured (capped at REACH_M).
//
// A primitive FLOATS when its centre lies more than FLOAT_TOL_M off the drawn mesh, or more than FLOAT_AREA_SHARE of
// its area does: a round meeting it stops in the air and its hit mark (fx/impactDecals.ts clampToSkin) finds no skin
// under it. A convex cell's face bridging a recess of the drawn shell lies off the mesh by the recess's depth by
// construction; it is reported (bridgeM) and gated only beyond CELL_BRIDGE_TOL_M.
//
// Reads only. Runs in Node on one core, one tank at a time, on the build tools/gen-combat-anatomy.mjs measures
// (geometryReceipt: no rendering materials, no canvases). The fleet modules load on first use, so the anatomy generator
// can import this after it enables its measurement mode.
import * as THREE from 'three';
/** A plate or housing whose centre (or FLOAT_AREA_SHARE of whose area) lies further than this off the drawn mesh floats. */
export const FLOAT_TOL_M = 0.08;
export const FLOAT_AREA_SHARE = 0.5;
/** A convex cell face may bridge a recess of the drawn shell; beyond this depth it floats too. */
export const CELL_BRIDGE_TOL_M = 0.3;
/** Distances are measured out to this; further reads as REACH_M. */
export const REACH_M = 0.6;
const GRID_M = 0.1;
const SAMPLES_PER_FACE = 49;

const visibleChain = (object) => { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; };
/** Only a LOD's first level draws near; its coarse levels would hide a float. */
function nearLevel(object) {
  for (let o = object; o?.parent; o = o.parent) {
    if (o.parent.isLOD && o.parent.levels?.length && o !== o.parent.levels[0].object) return false;
  }
  return true;
}
const HIDDEN_NAME = /procShadow|Shadow$|decal|muzzleBore|^vehicleMarking/i;

const isRunningGear = (mesh) => {
  for (let o = mesh; o; o = o.parent) if (o.userData?.runningGear || /^gear/.test(o.name)) return true;
  return false;
};

/**
 * Every visible triangle of the built tank, in the tank root's frame (Float64Array, 9 numbers a triangle); `.gear` flags
 * the running gear's (wheels, sprockets, idlers, tracks: they turn or move, so no layer is fitted to them).
 */
export function visibleTriangles(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = [], gear = [], v = new THREE.Vector3(), local = new THREE.Matrix4(), instance = new THREE.Matrix4(), combined = new THREE.Matrix4();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !visibleChain(mesh) || !nearLevel(mesh) || mesh.userData?.shadowOnly || HIDDEN_NAME.test(mesh.name)) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || material.colorWrite === false || material.visible === false) return;
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    const index = mesh.geometry.index, count = index ? index.count : position.count;
    local.multiplyMatrices(inverse, mesh.matrixWorld);
    const instances = mesh.isInstancedMesh ? mesh.count : 1;
    const moving = isRunningGear(mesh) ? 1 : 0;
    for (let k = 0; k < instances; k++) {
      for (let i = 0; i < count; i += 3) gear.push(moving);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(k, instance); combined.multiplyMatrices(local, instance); } else combined.copy(local);
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(combined);
        out.push(v.x, v.y, v.z);
      }
    }
  });
  const T = Float64Array.from(out);
  T.gear = Uint8Array.from(gear);
  return T;
}

/** The triangles of T for which keep(offset) holds (offsets are T's, 9 apart). */
export function selectTriangles(T, keep) {
  const out = [];
  for (let o = 0; o < T.length; o += 9) if (keep(o)) for (let i = 0; i < 9; i++) out.push(T[o + i]);
  return Float64Array.from(out);
}

/**
 * A uniform grid over T's triangles: `nearest(x, y, z, reach)` gives the nearest triangle within reach ({ d, o, point }, o
 * its offset in T) and `crossings(p, dir, len)` the distances along the segment p + t dir (t in 0..len, dir a unit vector)
 * at which it crosses a triangle, sorted (coincident faces each count).
 */
export function triangleIndex(T) {
  const grid = new Map(), cell = (x) => Math.floor(x / GRID_M);
  const key = (i, j, k) => (i + 4096) * 67108864 + (j + 4096) * 8192 + (k + 4096);
  for (let o = 0; o < T.length; o += 9) {
    const lo = [0, 1, 2].map((a) => cell(Math.min(T[o + a], T[o + 3 + a], T[o + 6 + a])));
    const hi = [0, 1, 2].map((a) => cell(Math.max(T[o + a], T[o + 3 + a], T[o + 6 + a])));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const kk = key(i, j, k);
      let list = grid.get(kk);
      if (!list) grid.set(kk, list = []);
      list.push(o);
    }
  }
  const tri = new THREE.Triangle(), closest = new THREE.Vector3(), probe = new THREE.Vector3(), seen = new Set();
  return {
    nearest(x, y, z, reach) {
      let best = null;
      seen.clear();
      const ci = cell(x), cj = cell(y), ck = cell(z);
      for (let r = 0; r * GRID_M <= reach + GRID_M; r++) {
        if (best && best.d <= (r - 1) * GRID_M) break;
        for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
          for (const o of grid.get(key(i, j, k)) || []) {
            if (seen.has(o)) continue;
            seen.add(o);
            tri.a.set(T[o], T[o + 1], T[o + 2]); tri.b.set(T[o + 3], T[o + 4], T[o + 5]); tri.c.set(T[o + 6], T[o + 7], T[o + 8]);
            const d = tri.closestPointToPoint(probe.set(x, y, z), closest).distanceTo(probe);
            if (d < reach && (!best || d < best.d)) best = { d, o, point: [closest.x, closest.y, closest.z] };
          }
        }
      }
      return best;
    },
    crossings(p, dir, len) {
      const ts = [];
      seen.clear();
      for (let s = 0; s <= len + GRID_M / 2; s += GRID_M / 2) {
        const t = Math.min(s, len);
        for (const o of grid.get(key(cell(p[0] + dir[0] * t), cell(p[1] + dir[1] * t), cell(p[2] + dir[2] * t))) || []) {
          if (seen.has(o)) continue;
          seen.add(o);
          const e1 = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]], e2 = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]];
          const h = cross(dir, e2), det = dot(e1, h);
          if (Math.abs(det) < 1e-12) continue;
          const sv = [p[0] - T[o], p[1] - T[o + 1], p[2] - T[o + 2]], u = dot(sv, h) / det;
          if (u < 0 || u > 1) continue;
          const q = cross(sv, e1), v = dot(dir, q) / det;
          if (v < 0 || u + v > 1) continue;
          const hit = dot(e2, q) / det;
          if (hit >= 0 && hit <= len) ts.push(hit);
        }
      }
      return ts.sort((a, b) => a - b);
    },
  };
}

/** Nearest-triangle distance over a uniform grid; with `out`, the nearest point is written there. */
export function surfaceDistance(T, reach = REACH_M) {
  const grid = new Map(), cell = (x) => Math.floor(x / GRID_M);
  const key = (i, j, k) => (i + 4096) * 67108864 + (j + 4096) * 8192 + (k + 4096);
  for (let o = 0; o < T.length; o += 9) {
    const x0 = cell(Math.min(T[o], T[o + 3], T[o + 6])), x1 = cell(Math.max(T[o], T[o + 3], T[o + 6]));
    const y0 = cell(Math.min(T[o + 1], T[o + 4], T[o + 7])), y1 = cell(Math.max(T[o + 1], T[o + 4], T[o + 7]));
    const z0 = cell(Math.min(T[o + 2], T[o + 5], T[o + 8])), z1 = cell(Math.max(T[o + 2], T[o + 5], T[o + 8]));
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) {
      const kk = key(i, j, k);
      let list = grid.get(kk);
      if (!list) grid.set(kk, list = []);
      list.push(o);
    }
  }
  const tri = new THREE.Triangle(), closest = new THREE.Vector3(), probe = new THREE.Vector3();
  const seen = new Set();
  return (x, y, z, out = null) => {
    let best = reach;
    seen.clear();
    // grow the search shell by shell, stopping once the best hit is nearer than the next shell
    for (let r = 0; r * GRID_M <= reach + GRID_M; r++) {
      if (r > 0 && best <= (r - 1) * GRID_M) break;
      const ci = cell(x), cj = cell(y), ck = cell(z);
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
        const list = grid.get(key(i, j, k));
        if (!list) continue;
        for (const o of list) {
          if (seen.has(o)) continue;
          seen.add(o);
          tri.a.set(T[o], T[o + 1], T[o + 2]); tri.b.set(T[o + 3], T[o + 4], T[o + 5]); tri.c.set(T[o + 6], T[o + 7], T[o + 8]);
          const d = tri.closestPointToPoint(probe.set(x, y, z), closest).distanceTo(probe);
          if (d < best) { best = d; if (out) { out[0] = closest.x; out[1] = closest.y; out[2] = closest.z; } }
        }
      }
    }
    return best;
  };
}

/** Area-weighted sample points of a planar polygon (fan), its area centroid first; each with its area share. */
export function polygonSamples(verts, perFace = SAMPLES_PER_FACE) {
  const tris = [];
  let area = 0;
  const c = [0, 0, 0];
  for (let i = 1; i + 1 < verts.length; i++) {
    const A = verts[0], B = verts[i], C = verts[i + 1];
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const a = Math.hypot(...cr) / 2;
    tris.push({ A, B, C, a });
    area += a;
    for (let d = 0; d < 3; d++) c[d] += a * (A[d] + B[d] + C[d]) / 3;
  }
  if (!(area > 1e-9)) {
    const mean = [0, 1, 2].map((d) => verts.reduce((s, v) => s + v[d], 0) / verts.length);
    return { area: 0, points: [mean], weights: [1] };
  }
  const points = [c.map((v) => v / area)], weights = [0];
  for (const { A, B, C, a } of tris) {
    // a triangular lattice of about perFace * share points over this triangle
    const n = Math.max(1, Math.round(Math.sqrt(perFace * a / area)));
    const pts = [];
    for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
      for (const [u, w] of [[(i + 1 / 3) / n, (j + 1 / 3) / n], ...(i + j + 1 < n ? [[(i + 2 / 3) / n, (j + 2 / 3) / n]] : [])]) {
        pts.push([0, 1, 2].map((d) => A[d] + (B[d] - A[d]) * u + (C[d] - A[d]) * w));
      }
    }
    for (const p of pts) { points.push(p); weights.push(a / area / pts.length); }
  }
  return { area, points, weights };
}

/** The hit primitives sim/armor.ts traces, as planar polygons in the authority's frames at rest. */
export function hitPrimitives(armor) {
  const turretPivot = armor.turretPivot || [0, 0, 0], gunPivot = armor.gunPivot || [0, 0, 0];
  const frameOffset = (frame) => frame === 'hull' ? [0, 0, 0]
    : frame === 'turret' ? turretPivot
      : [turretPivot[0], turretPivot[1], turretPivot[2]];
  const place = (verts, frame) => { const o = frameOffset(frame); return verts.map((v) => [v[0] + o[0], v[1] + o[1], v[2] + o[2]]); };
  const out = [];
  const cells = armor.collisionShells || {};
  const hasTrackShape = (link) => !!link && (armor.trackShapes || []).some((track) => track.module === link);
  for (const [frame, plates] of [['hull', armor.hullPlates], ['turret', armor.turretPlates]]) {
    const replaceMain = !!cells[frame]?.length;
    for (const plate of plates || []) {
      const kind = plate.kind || 'main';
      if (replaceMain && kind === 'main') continue;
      if (kind === 'external' && hasTrackShape(plate.moduleLink)) continue;
      if (!Array.isArray(plate.verts) || plate.verts.length < 3) continue;
      // a gun-follow plate is authored in turret coordinates at rest (sim/armor.ts frame 2 at gunPitch 0)
      out.push({ type: 'plate', frame: plate.gunFollow ? 'gun' : frame, name: plate.name, kind, verts: place(plate.verts, frame) });
    }
  }
  for (const frame of ['hull', 'turret']) {
    (cells[frame] || []).forEach((cell, c) => cell.faces.forEach((face, f) => {
      if (face.internal) return;
      out.push({ type: 'cell', frame, name: `${frame}Cell${c}.${f}:${face.plate?.name ?? '?'}`, kind: face.plate?.kind || 'main',
        verts: place(face.indices.map((i) => cell.vertices[i]), frame) });
    }));
  }
  (armor.externalWeapons || []).forEach((part, w) => part.plates.forEach((plate, p) => {
    const frame = part.gunFollow ? 'gun' : part.turretLocal ? 'turret' : 'hull';
    out.push({ type: 'weapon', frame, name: `weapon${w}.${p}:${plate.name}`, kind: plate.kind || 'external', verts: place(plate.verts, frame === 'gun' ? 'turret' : frame) });
  }));
  return out;
}

/** Sample distances of one placed polygon: its centre's gap and the share of its area further than tol off the mesh. */
function polygonFit(verts, distance, tol, samples) {
  const { area, points, weights } = polygonSamples(verts, samples);
  const d = points.map((p) => distance(p[0], p[1], p[2]));
  let offShare = 0;
  for (let i = 1; i < d.length; i++) if (d[i] > tol) offShare += weights[i];
  return { area, points, weights, d, centreM: d[0], offShare, floating: d[0] > tol || offShare > FLOAT_AREA_SHARE };
}

const round3 = (value) => Math.round(value * 1000) / 1000;
/** A plate's vertex mean in its own frame: how the finalizer finds the plate a receipt names. */
export function plateKey(verts) {
  return [0, 1, 2].map((axis) => round3(verts.reduce((sum, v) => sum + v[axis], 0) / verts.length));
}

/** A layer lies on its part where the drawn build (never the running gear) is within this (m) of it. */
export const SUPPORT_TOL_M = 0.03;
/** The share of a layer that must lie on its part for the layer to be cropped to that part (else fitted or dropped). */
export const CROP_MIN_SHARE = 0.25;
/** A fitted layer may move at most this far (m) along its normal onto its drawn part. */
export const FIT_REACH_M = 0.35;
/** The share of a layer's area that must find its drawn part within FIT_REACH_M for it to be fitted, not dropped. */
export const FIT_COVER_SHARE = 0.5;
/** The fitted plane's weighted RMS residual (m) above which the part under it is not one sheet: dropped. */
export const FIT_RESIDUAL_M = 0.05;
/** A layer's part is a sheet: from its face, inward along the layer's normal, its back face lies within this (m)... */
const SHEET_MAX_M = 0.6;
/** ...and drawn stock stands behind that back face within this (m): a skirt over its wheels, a wedge, a Trophy box or an
 * ERA brick on its turret, a cage over its deck. The structural shell is solid (its far side metres in) and never one. */
const SHEET_BACKING_M = 0.8;
/** A part's face must turn with the layer: |cos| of the angle between their normals at least this. */
const FIT_FACING_MIN = 0.7;
/** How many times a layer whose part is not one sheet is split in four to fit it face by face. */
const FIT_SPLIT_DEPTH = 2;
/** The share of a layer's hits on faces turning with it that must be on such a part for the layer to be fitted, and the
 * share of the layer those part hits must cover (the fitted layer is then cropped to them). */
const SHEET_SHARE = 0.3;
const FIT_MIN_SHARE = 0.1;
/** The fitting grid's step (m); a large layer is sampled on at most about FIT_GRID_MAX points, a small one on at least
 * about FIT_GRID_MIN (a 15 cm ERA face is not judged on a dozen points). */
const FIT_GRID_M = 0.04;
const FIT_GRID_MAX = 1600;
const FIT_GRID_MIN = 100;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function polygonNormal(verts) {
  let n = [0, 0, 0];
  for (let i = 1; i + 1 < verts.length; i++) {
    const c = cross(sub(verts[i], verts[0]), sub(verts[i + 1], verts[0]));
    n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]];
  }
  return unit(n);
}

/** Point-in-shell test over the main collision cells (root frame): each cell a convex solid of outward face planes. */
function shellTest(armor) {
  const solids = [];
  for (const [frame, cells] of Object.entries(armor.collisionShells || {})) {
    const o = frame === 'turret' ? (armor.turretPivot || [0, 0, 0]) : [0, 0, 0];
    for (const cell of cells || []) {
      const vertices = (cell.vertices || []).map((v) => [v[0] + o[0], v[1] + o[1], v[2] + o[2]]);
      if (vertices.length < 4) continue;
      const centre = [0, 1, 2].map((axis) => vertices.reduce((sum, v) => sum + v[axis], 0) / vertices.length);
      const planes = [];
      for (const face of cell.faces || []) {
        const pts = face.indices.map((i) => vertices[i]);
        let n = polygonNormal(pts);
        if (dot(n, sub(centre, pts[0])) > 0) n = n.map((v) => -v);
        planes.push([n, dot(n, pts[0])]);
      }
      if (planes.length >= 4) solids.push(planes);
    }
  }
  return (p, grow) => solids.some((planes) => planes.every(([n, d]) => dot(n, p) - d <= grow));
}

/** A layer's own plane frame: origin, normal, in-plane axes, and its outline in (u, v). */
function layerFrame(verts, away = null) {
  let n = polygonNormal(verts);
  // facing out of the vehicle whatever the outline's winding (`away`: from the vehicle's centre to the layer)
  if (away && dot(n, away) < 0) n = [-n[0], -n[1], -n[2]];
  const u = unit(sub(verts[1], verts[0])), v = cross(n, u);
  const o = verts[0];
  return { o, n, u, v, outline: verts.map((p) => [dot(sub(p, o), u), dot(sub(p, o), v)]) };
}
const fromUv = (f, [x, y], t = 0) => [0, 1, 2].map((k) => f.o[k] + f.u[k] * x + f.v[k] * y + f.n[k] * t);
function insideOutline(outline, x, y) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** A regular grid over the outline, in (u, v). */
function layerGrid(f) {
  const us = f.outline.map((p) => p[0]), vs = f.outline.map((p) => p[1]);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const box = (u1 - u0) * (v1 - v0);
  const step = Math.max(Math.min(FIT_GRID_M, Math.sqrt(box / FIT_GRID_MIN)), Math.sqrt(box / FIT_GRID_MAX), 1e-3);
  const points = [];
  for (let x = u0 + step / 2; x < u1; x += step) for (let y = v0 + step / 2; y < v1; y += step) {
    if (insideOutline(f.outline, x, y)) points.push([x, y]);
  }
  return { points, step };
}
/** Clip a convex-or-not outline to an axis rectangle in (u, v) (Sutherland-Hodgman, one edge at a time). */
function clipToRect(outline, [u0, u1, v0, v1]) {
  let poly = outline;
  for (const [axis, bound, keepAbove] of [[0, u0, true], [0, u1, false], [1, v0, true], [1, v1, false]]) {
    const inside = (p) => keepAbove ? p[axis] >= bound - 1e-12 : p[axis] <= bound + 1e-12;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    poly = out;
    if (poly.length < 3) return null;
  }
  return poly;
}

/**
 * Crop a layer to its part: the part of the layer within SUPPORT_TOL_M of drawn stock, as the rectangle (in the layer's
 * own axes) that spans it, cut from the outline. Null when under `minShare` of the layer lies on anything (CROP_MIN_SHARE
 * for a layer as authored; a layer already fitted onto its part needs only FIT_MIN_SHARE).
 */
function cropLayer(verts, support, minShare = CROP_MIN_SHARE) {
  const f = layerFrame(verts);
  const { points, step } = layerGrid(f);
  if (points.length < 4) return null;
  const on = points.filter((p) => { const q = fromUv(f, p); return support(q[0], q[1], q[2]) <= SUPPORT_TOL_M; });
  if (on.length < minShare * points.length) return null;
  // a side the supported grid reaches keeps the outline's own edge; elsewhere the cut falls half a step past the last
  // supported row
  const edge = (axis, pick, sign) => {
    const reach = pick(...on.map((p) => p[axis]));
    return reach === pick(...points.map((p) => p[axis])) ? sign * Infinity : reach + sign * step / 2;
  };
  const rect = [edge(0, Math.min, -1), edge(0, Math.max, 1), edge(1, Math.min, -1), edge(1, Math.max, 1)];
  const clipped = clipToRect(f.outline, rect);
  return clipped ? clipped.map((p) => fromUv(f, p)) : null;
}

/** The unit normal of triangle o of T. */
function triangleNormal(T, o) {
  return unit(cross([T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]], [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]]));
}

/**
 * Whether the drawn surface at `q` (triangle o) is a layer's part for a layer facing `n`: its face turns with the layer,
 * and it is a sheet with drawn stock behind it (SHEET_MAX_M, SHEET_BACKING_M), whichever bucket it was merged into. The
 * structural shell is a solid whose far side lies metres in, so a layer is never fitted onto the hull or turret itself.
 */
function isLayerPart(index, backing, T, q, o, n) {
  if (Math.abs(dot(triangleNormal(T, o), n)) < FIT_FACING_MIN) return false;
  const start = [q[0] + n[0] * 0.01, q[1] + n[1] * 0.01, q[2] + n[2] * 0.01], inward = [-n[0], -n[1], -n[2]];
  const ts = backing.crossings(start, inward, 0.02 + SHEET_MAX_M + SHEET_BACKING_M).filter((t) => t > 0.0125);
  // ts[0]: the sheet's back face (its front face lies at t ~ 0.01); ts[1]: the stock behind it
  return ts.length >= 2 && ts[0] <= 0.02 + SHEET_MAX_M && ts[1] - ts[0] <= SHEET_BACKING_M;
}

/**
 * Fit a layer standing off its part onto it: each grid point's nearest drawn surface (never the running gear) within
 * FIT_REACH_M that is a layer's part (isLayerPart) gives its offset along the layer's normal; a plane through those
 * offsets (affine in the layer's axes) moves every vertex along the normal, and the moved layer is cropped to its part.
 * Null when the part is not there (under FIT_MIN_SHARE of the layer finds one, or under SHEET_SHARE of the faces turning
 * with it are a layer's part), or the part is not one sheet (FIT_RESIDUAL_M).
 */
function fitLayer(verts, index, backing, T, support, centre, onBuild, depth = 0) {
  const mean = [0, 1, 2].map((axis) => verts.reduce((sum, v) => sum + v[axis], 0) / verts.length);
  const f = layerFrame(verts, sub(mean, centre));
  const { points } = layerGrid(f);
  const rows = [];
  let hits = 0, sheets = 0;
  for (const p of points) {
    const at = fromUv(f, p);
    const near = index.nearest(at[0], at[1], at[2], FIT_REACH_M);
    if (!near) continue;
    const d = sub(near.point, at), along = dot(d, f.n);
    // the nearest stock must lie across the layer's face, not off its edge
    if (Math.hypot(...sub(d, f.n.map((c) => c * along))) > Math.max(0.05, Math.abs(along))) continue;
    // only a drawn face turning with the layer can be its part (an edge of a fender or a deck is not judged)
    if (Math.abs(dot(triangleNormal(T, near.o), f.n)) < FIT_FACING_MIN) continue;
    hits++;
    if (!isLayerPart(index, backing, T, near.point, near.o, f.n)) continue;
    sheets++;
    rows.push([p[0], p[1], along]);
  }
  if (rows.length < Math.max(3, FIT_MIN_SHARE * points.length) || sheets < SHEET_SHARE * hits) return null;
  // a plane through the offsets, robust: a slope only along an axis the part's hits span at least half the layer (a
  // narrow drawn band must not tilt a tall layer), the rows beyond 2.5 median deviations dropped, then fitted again
  const us = f.outline.map((p) => p[0]), vs = f.outline.map((p) => p[1]);
  const spanOf = (values) => Math.max(...values) - Math.min(...values);
  const free = [true, spanOf(rows.map((r) => r[0])) >= 0.5 * spanOf(us), spanOf(rows.map((r) => r[1])) >= 0.5 * spanOf(vs)];
  const solve = (set) => {
    const k = free.map((on, i) => (on ? i : -1)).filter((i) => i >= 0), g = (x, y) => [1, x, y];
    const M = k.map(() => k.map(() => 0)), r = k.map(() => 0);
    for (const [x, y, t] of set) {
      const row = g(x, y);
      k.forEach((i, a) => { r[a] += row[i] * t; k.forEach((j, b) => { M[a][b] += row[i] * row[j]; }); });
    }
    // Gauss-Jordan on at most 3 unknowns
    for (let c = 0; c < k.length; c++) {
      let pivot = c;
      for (let rr = c + 1; rr < k.length; rr++) if (Math.abs(M[rr][c]) > Math.abs(M[pivot][c])) pivot = rr;
      [M[c], M[pivot]] = [M[pivot], M[c]]; [r[c], r[pivot]] = [r[pivot], r[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let rr = 0; rr < k.length; rr++) {
        if (rr === c) continue;
        const factor = M[rr][c] / M[c][c];
        for (let cc = c; cc < k.length; cc++) M[rr][cc] -= factor * M[c][cc];
        r[rr] -= factor * r[c];
      }
    }
    const coef = [0, 0, 0];
    k.forEach((i, a) => { coef[i] = r[a] / M[a][a]; });
    return coef;
  };
  let coef = solve(rows);
  if (!coef) return null;
  let plane = (x, y) => coef[0] + coef[1] * x + coef[2] * y;
  const deviations = rows.map(([x, y, t]) => Math.abs(t - plane(x, y))).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];
  const kept = rows.filter(([x, y, t]) => Math.abs(t - plane(x, y)) <= Math.max(0.01, 2.5 * mad));
  if (kept.length < Math.max(3, FIT_MIN_SHARE * points.length)) return null;
  coef = solve(kept);
  if (!coef) return null;
  plane = (x, y) => coef[0] + coef[1] * x + coef[2] * y;
  let sse = 0;
  for (const [x, y, t] of kept) sse += (t - plane(x, y)) ** 2;
  if (process.env.COT_FIT_DEBUG) console.error(`[fit] residual ${Math.sqrt(sse / kept.length).toFixed(3)} coef ${coef.map((c) => c.toFixed(3))} kept ${kept.length}/${rows.length}`);
  const moved = f.outline.map((p) => fromUv(f, p, plane(p[0], p[1])));
  const one = Math.sqrt(sse / kept.length) <= FIT_RESIDUAL_M && !moved.some((p, i) => Math.hypot(...sub(p, verts[i])) > FIT_REACH_M)
    ? cropLayer(moved, support, FIT_MIN_SHARE) : null;
  if (one && onBuild(one)) return [one];
  // a folded part (a wedge's faces, a stepped ERA array) is not one sheet: fit each quarter of the layer on its own, to
  // FIT_SPLIT_DEPTH, keeping the quarters that land on their part
  if (depth >= FIT_SPLIT_DEPTH) return null;
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, pieces = [];
  for (const rect of [[u0, um, v0, vm], [um, u1, v0, vm], [u0, um, vm, v1], [um, u1, vm, v1]]) {
    const quarter = clipToRect(f.outline, rect);
    if (!quarter) continue;
    pieces.push(...(fitLayer(quarter.map((p) => fromUv(f, p)), index, backing, T, support, centre, onBuild, depth + 1) || []));
  }
  return pieces.length ? pieces : null;
}

/**
 * The fit-or-drop receipts of one measured anatomy row (tools/gen-combat-anatomy.mjs): every non-main plate the armour
 * traces directly (spaced, external and ERA layers, authored against a donor's or the vehicle's own parts) is measured
 * against the drawn build's visible triangles (`visibleTriangles`, the root frame). A layer within FLOAT_TOL_M of the
 * build stays as authored. A floating layer whose part is drawn near it (a skirt, cage, wedge or screen standing up to
 * FIT_REACH_M off) is FITTED onto that part along its normal; one whose part is not drawn (a donor's bustle rack or rubber
 * skirt the vehicle lacks) is DROPPED. A layer is fitted only to a layer's part (isLayerPart: a sheet facing with it and
 * backed by drawn stock), even one merged into the hull or turret mesh: never to the structural shell (a missing skirt
 * would land on the hull side and double its armour) nor to the running gear. The finalizer applies each receipt
 * (combatAnatomy.ts applyPlateFits).
 * `armor` is the anatomy as the finalizer leaves it before the fits: finalized against this row in measurement mode, with
 * the row's ERA cassette faces laid on (no fits applied).
 */
export function plateFitReceipts(armor, T) {
  const distance = surfaceDistance(T);
  const hasTrackShape = (link) => !!link && (armor.trackShapes || []).some((track) => track.module === link);
  let support = null, stock = null, stockT = null, backing = null, inShell = null, centre = null;
  const out = [];
  for (const [owner, plates] of [['hull', armor.hullPlates], ['turret', armor.turretPlates]]) {
    const offset = owner === 'turret' ? (armor.turretPivot || [0, 0, 0]) : [0, 0, 0];
    for (const plate of plates || []) {
      const kind = plate.kind || 'main';
      if (kind === 'main') continue; // a frame's main plates are its shell (its cells, hulled from the drawn shell)
      if (kind === 'external' && hasTrackShape(plate.moduleLink)) continue;
      if (!Array.isArray(plate.verts) || plate.verts.length < 3) continue;
      const placed = plate.verts.map((p) => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]);
      const fit = polygonFit(placed, distance, FLOAT_TOL_M);
      if (!fit.floating) continue;
      if (!support) {
        // what a layer may lie on, and be fitted to where that is a layer's part: the drawn build without its running gear
        stockT = selectTriangles(T, (o) => !T.gear?.[o / 9]);
        support = surfaceDistance(stockT, SUPPORT_TOL_M * 4);
        stock = triangleIndex(stockT);
        // what stands behind a layer's part may be the running gear (a skirt over its wheels)
        backing = triangleIndex(T);
        inShell = shellTest(armor);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < stockT.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], stockT[i + a]); hi[a] = Math.max(hi[a], stockT[i + a]); }
        centre = lo.map((v, a) => (v + hi[a]) / 2);
      }
      const receipt = { owner, name: plate.name, kind, at: plateKey(plate.verts), gapM: round3(fit.centreM),
        offShare: Math.round(fit.offShare * 100) / 100 };
      const cropped = cropLayer(placed, support);
      const onBuild = (piece) => !polygonFit(piece, distance, FLOAT_TOL_M).floating;
      const pieces = cropped && onBuild(cropped) ? [cropped]
        : (fitLayer(placed, stock, backing, stockT, support, centre, onBuild) || []).filter(onBuild);
      const action = !pieces.length ? 'drop' : pieces[0] === cropped ? 'crop' : 'fit';
      // why a layer is dropped: buried in the main shell (a round meets the cells first: no change in play), nothing drawn
      // near it (the model lacks the part), or a drawn part it could not be fitted to
      const why = action !== 'drop' ? null : (() => {
        const { points } = polygonSamples(placed);
        const buried = points.filter((p) => inShell(p, -0.01)).length / points.length;
        return buried >= 0.5 ? 'inShell' : fit.d.slice(1).every((d) => d > 0.06) ? 'notDrawn' : 'unfitted';
      })();
      out.push(action === 'drop' ? { ...receipt, action, why }
        : { ...receipt, action, pieces: pieces.map((piece) => piece.map((p) => [round3(p[0] - offset[0]), round3(p[1] - offset[1]), round3(p[2] - offset[2])])) });
    }
  }
  return out;
}

/** Judge one tank. */
export async function hitboxFitCensus(id, options = {}) {
  const [{ createTank }, { getSpec }] = await Promise.all([import('../src/vehicles/tankFactory.ts'), import('../src/vehicles/specs.ts')]);
  const spec = getSpec(id);
  if (!spec?.armor) throw new Error(`${id}: no armour model`);
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const T = visibleTriangles(tank.root);
    const distance = surfaceDistance(T);
    const turret = tank.root.getObjectByName('rig_turret');
    let armor = spec.armor, fits = null;
    // --apply-fits: what the next anatomy regen gives, without it: the receipts the generator would write (its own
    // measure, on this build) applied to a copy of the finalized armour (combatAnatomy.ts applyPlateFits)
    if (options.applyFits) {
      const { applyPlateFits } = await import('../src/vehicles/combatAnatomy.ts');
      fits = plateFitReceipts(armor, T);
      // each receipt with the layer's area before and after (m², the protection the READY reports)
      const plates = [...(armor.hullPlates || []).map((p) => ['hull', p]), ...(armor.turretPlates || []).map((p) => ['turret', p])];
      fits = fits.map((fit) => {
        const plate = plates.find(([owner, p]) => owner === fit.owner && p.name === fit.name && plateKey(p.verts).join() === fit.at.join())?.[1];
        return { ...fit, areaM2: round3(plate ? polygonSamples(plate.verts).area : 0),
          areaAfterM2: round3((fit.pieces || []).reduce((sum, piece) => sum + polygonSamples(piece).area, 0)),
          // how far the fit moved it: its new vertices' largest distance off the authored plane
          moveM: plate && fit.pieces && fit.action === 'fit' ? (() => {
            const n = polygonNormal(plate.verts);
            return round3(Math.max(...fit.pieces.flat().map((v) => Math.abs(dot(sub(v, plate.verts[0]), n)))));
          })() : 0 };
      });
      armor = { ...armor, hullPlates: [...(armor.hullPlates || [])], turretPlates: [...(armor.turretPlates || [])] };
      applyPlateFits(armor, fits);
    }
    const pivot = armor.turretPivot;
    const pivotGapM = turret && pivot ? +Math.hypot(turret.position.x - pivot[0], turret.position.y - pivot[1], turret.position.z - pivot[2]).toFixed(3) : null;
    const rows = [];
    for (const primitive of hitPrimitives(armor)) {
      const { area, points, weights } = polygonSamples(primitive.verts, options.samples);
      const d = points.map((p) => distance(p[0], p[1], p[2]));
      let off = 0;
      for (let i = 1; i < d.length; i++) if (d[i] > FLOAT_TOL_M) off += weights[i];
      const centreM = d[0], maxM = Math.max(...d), minM = Math.min(...d);
      const tol = primitive.type === 'cell' ? CELL_BRIDGE_TOL_M : FLOAT_TOL_M;
      const offShare = primitive.type === 'cell' ? (() => { let s = 0; for (let i = 1; i < d.length; i++) if (d[i] > tol) s += weights[i]; return s; })() : off;
      const floating = centreM > tol || offShare > FLOAT_AREA_SHARE;
      rows.push({ ...primitive, verts: undefined, areaM2: +area.toFixed(4), centreM: +centreM.toFixed(3), minM: +minM.toFixed(3),
        maxM: +maxM.toFixed(3), offShare: +offShare.toFixed(2), floating,
        centre: points[0].map((v) => +v.toFixed(3)) });
    }
    rows.sort((a, b) => Number(b.floating) - Number(a.floating) || b.centreM - a.centreM);
    const floating = rows.filter((row) => row.floating);
    return { id, triangles: T.length / 9, primitives: rows.length, pivotGapM, floating: floating.length, ...(fits ? { fits } : {}),
      worstM: rows.length ? Math.max(...rows.map((r) => r.centreM)) : 0, rows: options.all ? rows : floating.concat(rows.filter((r) => !r.floating).slice(0, 3)) };
  } finally {
    tank.dispose?.();
  }
}
