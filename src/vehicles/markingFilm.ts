// Vehicle markings painted on the armour itself (2026-10-23, lane 243; the owner: "insignias and marks on tanks are
// still glitching, for example if u drag them around the tank gallery").
//
// A marking was one flat 1 × 1 quad held surfaceLiftM (6 mm) off the point its seat was solved at. On a flat plate that
// is a film; on the rounded and stepped armour about half the fleet's seats stand on, the quad's corners stood up to
// 2 cm off the metal, or sank into it, and an orbit slid the paint across the plate and cut it where it sank. The
// marking now takes the shape of the armour under its seat: the armour's triangles facing the seat, inside its
// footprint and a few centimetres either side of its plane, clipped to the footprint (DecalGeometry's projection,
// written for the seat frame), each held MARKING_FILM_LIFT_M off its own face. Only the front-most armour under each
// part of the footprint takes paint, so nothing is printed on a plate hidden behind another. The seat itself (position,
// orientation, size) is unchanged: the visibility receipts and the generated seat records read the same marking.
import * as THREE from 'three';

/** How far the paint film stands off its face, along the face's own normal. */
export const MARKING_FILM_LIFT_M = 0.001;
/** The armour a seat paints: behind its plane (the seat stands surfaceLiftM proud of its solved surface) and in front.
 * Armour further in front still hides the paint behind it. */
const FILM_REACH_BEHIND_M = 0.05;
const FILM_REACH_FRONT_M = 0.03;
const FILM_OCCLUDER_REACH_M = 1.0;
/** A face turned more than about 70 degrees from the marking's normal takes no paint (it would smear across it). */
const FILM_MIN_FACING = 0.34;
/** A painted face this far behind another under the same point is hidden armour and takes none. */
const FILM_HIDDEN_BEHIND_M = 0.003;
/** The footprint is cut into FILM_CELLS² cells, so the hidden-armour test reads each part of it on its own. */
const FILM_CELLS = 8;

interface FilmVertex { u: number; v: number; w: number; nu: number; nv: number; nw: number }
interface FilmTriangle { a: FilmVertex; b: FilmVertex; c: FilmVertex }
/** A part of one face inside one footprint cell; `paint` false: armour that only hides what is behind it. */
interface FilmPiece { cell: number; triangle: FilmTriangle; paint: boolean }

const ownerInverse = new THREE.Matrix4();
const toOwner = new THREE.Matrix4();
const normalToOwner = new THREE.Matrix3();
const point = new THREE.Vector3();
const normal = new THREE.Vector3();
const tangent = new THREE.Vector3();
const bitangent = new THREE.Vector3();
const axis = new THREE.Vector3();

function lerpVertex(a: FilmVertex, b: FilmVertex, t: number): FilmVertex {
  return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, w: a.w + (b.w - a.w) * t,
    nu: a.nu + (b.nu - a.nu) * t, nv: a.nv + (b.nv - a.nv) * t, nw: a.nw + (b.nw - a.nw) * t };
}

/** Sutherland-Hodgman against one plane of the footprint box: keep `sign * (vertex[key] - limit) <= 0`. */
function clip(polygon: FilmVertex[], key: 'u' | 'v' | 'w', limit: number, sign: number): FilmVertex[] {
  const out: FilmVertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i], next = polygon[(i + 1) % polygon.length];
    const dc = sign * (current[key] - limit), dn = sign * (next[key] - limit);
    if (dc <= 0) out.push(current);
    if ((dc < 0 && dn > 0) || (dc > 0 && dn < 0)) out.push(lerpVertex(current, next, dc / (dc - dn)));
  }
  return out;
}

/** Barycentric depth (w) of a triangle at (u, v), or null outside it. */
function depthAt(triangle: FilmTriangle, u: number, v: number): number | null {
  const { a, b, c } = triangle;
  const d = (b.v - c.v) * (a.u - c.u) + (c.u - b.u) * (a.v - c.v);
  if (Math.abs(d) < 1e-12) return null;
  const l1 = ((b.v - c.v) * (u - c.u) + (c.u - b.u) * (v - c.v)) / d;
  const l2 = ((c.v - a.v) * (u - c.u) + (a.u - c.u) * (v - c.v)) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return null;
  return l1 * a.w + l2 * b.w + l3 * c.w;
}

/**
 * The marking film for a seat in `owner`'s frame, as geometry in the marking mesh's own frame (the unit quad's: the
 * footprint is [-0.5, 0.5]², the mesh scaled by `size`), or null where no armour under the seat faces it.
 */
export function markingFilmGeometry(
  surfaces: readonly THREE.Mesh[], owner: THREE.Object3D,
  position: THREE.Vector3, quaternion: THREE.Quaternion, size: number,
): THREE.BufferGeometry | null {
  if (!(size > 0)) return null;
  owner.updateWorldMatrix(true, true);
  ownerInverse.copy(owner.matrixWorld).invert();
  tangent.set(1, 0, 0).applyQuaternion(quaternion);
  bitangent.set(0, 1, 0).applyQuaternion(quaternion);
  axis.set(0, 0, 1).applyQuaternion(quaternion);
  const wMin = -FILM_REACH_BEHIND_M / size, wMax = FILM_REACH_FRONT_M / size, wOccluder = FILM_OCCLUDER_REACH_M / size;
  const pieces: FilmPiece[] = [];
  surfaces.forEach((mesh) => {
    const geometry = mesh.geometry;
    const positions = geometry?.getAttribute('position');
    if (!positions) return;
    const normals = geometry.getAttribute('normal');
    const index = geometry.index;
    const count = index ? index.count : positions.count;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const side = materials[0]?.side ?? THREE.FrontSide;
    toOwner.multiplyMatrices(ownerInverse, mesh.matrixWorld);
    normalToOwner.getNormalMatrix(toOwner);
    // a mirrored mesh draws its front faces the other way round
    const mirrored = toOwner.determinant() < 0 ? -1 : 1;
    const local = (vertex: number, faceNormal: THREE.Vector3): FilmVertex => {
      point.fromBufferAttribute(positions, vertex).applyMatrix4(toOwner).sub(position);
      if (normals) normal.fromBufferAttribute(normals, vertex).applyMatrix3(normalToOwner).normalize();
      else normal.copy(faceNormal);
      if (normal.dot(faceNormal) < 0) normal.negate();
      return { u: point.dot(tangent) / size, v: point.dot(bitangent) / size, w: point.dot(axis) / size,
        nu: normal.dot(tangent), nv: normal.dot(bitangent), nw: normal.dot(axis) };
    };
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3();
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(positions, ia).applyMatrix4(toOwner);
      b.fromBufferAttribute(positions, ib).applyMatrix4(toOwner);
      c.fromBufferAttribute(positions, ic).applyMatrix4(toOwner);
      // quick reject on the footprint before the face's normal
      const au = (a.x - position.x) * tangent.x + (a.y - position.y) * tangent.y + (a.z - position.z) * tangent.z;
      const bu = (b.x - position.x) * tangent.x + (b.y - position.y) * tangent.y + (b.z - position.z) * tangent.z;
      const cu = (c.x - position.x) * tangent.x + (c.y - position.y) * tangent.y + (c.z - position.z) * tangent.z;
      const half = size / 2;
      if ((au > half && bu > half && cu > half) || (au < -half && bu < -half && cu < -half)) continue;
      const av = (a.x - position.x) * bitangent.x + (a.y - position.y) * bitangent.y + (a.z - position.z) * bitangent.z;
      const bv = (b.x - position.x) * bitangent.x + (b.y - position.y) * bitangent.y + (b.z - position.z) * bitangent.z;
      const cv = (c.x - position.x) * bitangent.x + (c.y - position.y) * bitangent.y + (c.z - position.z) * bitangent.z;
      if ((av > half && bv > half && cv > half) || (av < -half && bv < -half && cv < -half)) continue;
      face.subVectors(b, a).cross(point.subVectors(c, a));
      const length = face.length();
      if (length < 1e-12) continue;
      face.multiplyScalar(mirrored / length);
      // the face the material shows: its winding's for front-sided paint, its back's for back-sided, whichever
      // looks at the seat for double-sided
      let shown = side === THREE.BackSide ? -1 : 1;
      if (side === THREE.DoubleSide && face.dot(axis) < 0) shown = -1;
      face.multiplyScalar(shown);
      // a face turned away from the seat neither takes paint nor hides it (its own front face does)
      const facing = face.dot(axis);
      if (facing <= 0) continue;
      let polygon = [local(ia, face), local(ib, face), local(ic, face)];
      // keep the film's winding facing out of the armour it is painted on
      if (shown * mirrored < 0) polygon = [polygon[0], polygon[2], polygon[1]];
      for (const [key, limit, sign] of [['u', .5, 1], ['u', -.5, -1], ['v', .5, 1], ['v', -.5, -1],
        ['w', wOccluder, 1], ['w', wMin, -1]] as const) {
        polygon = clip(polygon, key, limit, sign);
        if (polygon.length < 3) break;
      }
      if (polygon.length < 3) continue;
      const paintable = facing >= FILM_MIN_FACING;
      // the part within reach takes paint; the part beyond it only hides
      for (const [part, paint] of [[clip(polygon, 'w', wMax, 1), paintable], [clip(polygon, 'w', wMax, -1), false]] as const) {
        if (part.length < 3) continue;
        // one piece per footprint cell
        for (let column = 0; column < FILM_CELLS; column++) {
          const u0 = column / FILM_CELLS - .5, u1 = u0 + 1 / FILM_CELLS;
          const strip = clip(clip(part, 'u', u1, 1), 'u', u0, -1);
          if (strip.length < 3) continue;
          for (let row = 0; row < FILM_CELLS; row++) {
            const v0 = row / FILM_CELLS - .5, v1 = v0 + 1 / FILM_CELLS;
            const cell = clip(clip(strip, 'v', v1, 1), 'v', v0, -1);
            for (let i = 1; i + 1 < cell.length; i++) {
              pieces.push({ cell: column * FILM_CELLS + row, triangle: { a: cell[0], b: cell[i], c: cell[i + 1] }, paint });
            }
          }
        }
      }
    }
  });
  // Only the front-most armour under each part of the footprint takes paint: a piece goes when another piece of its
  // cell stands FILM_HIDDEN_BEHIND_M in front of all of it (its corners and its middle), so no visible paint is lost.
  const hidden = FILM_HIDDEN_BEHIND_M / size;
  const byCell = new Map<number, FilmTriangle[]>();
  for (const { cell, triangle } of pieces) {
    const list = byCell.get(cell);
    if (list) list.push(triangle);
    else byCell.set(cell, [triangle]);
  }
  const cellOf = (u: number, v: number): number => {
    const column = Math.min(FILM_CELLS - 1, Math.max(0, Math.floor((u + .5) * FILM_CELLS)));
    const row = Math.min(FILM_CELLS - 1, Math.max(0, Math.floor((v + .5) * FILM_CELLS)));
    return column * FILM_CELLS + row;
  };
  const covered = (triangle: FilmTriangle, u: number, v: number, w: number): boolean =>
    (byCell.get(cellOf(u, v)) ?? []).some((other) => {
      if (other === triangle) return false;
      const front = depthAt(other, u, v);
      return front !== null && front > w + hidden;
    });
  const shown = pieces.filter(({ triangle, paint }) => {
    if (!paint) return false;
    const { a, b, c } = triangle;
    // a sliver the clipping left (under a square millimetre at the seat's size) carries no paint
    if (Math.abs((b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v)) * size * size < 2e-6) return false;
    const u = (a.u + b.u + c.u) / 3, v = (a.v + b.v + c.v) / 3, w = (a.w + b.w + c.w) / 3;
    // corners pulled a hair toward the middle so they read their own cell
    const inset = (vertex: FilmVertex): [number, number, number] =>
      [vertex.u + (u - vertex.u) * 1e-3, vertex.v + (v - vertex.v) * 1e-3, vertex.w + (w - vertex.w) * 1e-3];
    return !([[u, v, w], inset(a), inset(b), inset(c)] as Array<[number, number, number]>)
      .every(([pu, pv, pw]) => covered(triangle, pu, pv, pw));
  });
  if (!shown.length) return null;
  const lift = MARKING_FILM_LIFT_M / size;
  const positions = new Float32Array(shown.length * 9);
  const normals = new Float32Array(shown.length * 9);
  const uvs = new Float32Array(shown.length * 6);
  shown.forEach(({ triangle }, t) => {
    [triangle.a, triangle.b, triangle.c].forEach((vertex, k) => {
      const length = Math.hypot(vertex.nu, vertex.nv, vertex.nw) || 1;
      const nu = vertex.nu / length, nv = vertex.nv / length, nw = vertex.nw / length;
      positions.set([vertex.u + nu * lift, vertex.v + nv * lift, vertex.w + nw * lift], (t * 3 + k) * 3);
      normals.set([nu, nv, nw], (t * 3 + k) * 3);
      // the texture projects straight along the seat's normal, as it did on the flat quad
      uvs.set([vertex.u + .5, vertex.v + .5], (t * 3 + k) * 2);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
