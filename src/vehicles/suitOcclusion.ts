// src/vehicles/suitOcclusion.ts — the shade a camouflage suit casts on the vehicle under it, baked per vertex.
//
// (264; the ghillie render lane's blind critic r3: "no shadow under any laid net or drape: the hull showing through the
// mesh is lit exactly like bare hull, so the nets look like a print"; Main's ruling: an occlusion term in the hull
// material under a suit, no geometry standoff.) A suit's net lies a centimetre or two off the armour: at the cascades'
// texel sizes its cast shadow lands inside the bias, so the hull seen through the mesh, and between a drape's strips,
// took the full light. The suit's own cloth and garnish say how much of the sky and sun a point of armour still sees:
// each vertex under it reads the cloth over it within a small reach along its normal (SUIT_OCCLUSION_REACH_M), weighed
// by a soft kernel across it (SUIT_OCCLUSION_RADIUS_M, which is also the shade's falloff past the net's edge).
//
// The amount is a Uint8 normalized vertex attribute (materials.ts VEHICLE_SUIT_OCCLUSION_ATTRIBUTE), read by every vehicle program
// (materials.ts vehicleAmbientFloorHook darkens the received light by it after every readability floor) with a default
// of 0 on every vehicle material (a draw without it reads unoccluded). A suited build seeds the attribute on every draw
// of a vehicle material, zeros where no suit reaches, so the static and far-LOD merges keep one vertex layout per owner
// and material (the armour paint's apZone rule), and writes values under the suit; a vehicle without a suit carries
// none. A geometry drawn by more than one mesh keeps zeros (one bake cannot serve two places). The bake reads only the
// built geometry, so it is deterministic and runs where the build runs (the Gallery, the Garage, battle, receipts).
import * as THREE from 'three';
import { isVehicleMaterialRegistered, VEHICLE_SUIT_OCCLUSION_ATTRIBUTE as SUIT_OCCLUSION_ATTRIBUTE } from './materials.ts';
/** How far over a surface (along its normal) the suit still shades it, and the kernel's reach across it. */
const SUIT_OCCLUSION_REACH_M = 0.35;
// (264 round 3; the critic r4: "the shade cuts off hard at the drape bottoms", "cover panels darkened evenly up to hard
// rectangular borders") A net or drape stands off the hull and casts a broad, soft shade: its kernel reaches 28 cm
// across, and cloth a little behind a face's plane (the hem over a skirt's lower lip, the face turned down under it)
// still shades it at a share (SUIT_BEHIND_*), so the shade runs on past a hem and a seam instead of stopping at the hull's
// next vertex. A fitted cover lies on the plate: its shade is its own cloth's, a few centimetres round it
// (SUIT_COVER_RADIUS_M), never a whole panel's.
const SUIT_OCCLUSION_RADIUS_M = 0.28;
const SUIT_COVER_RADIUS_M = 0.08;
const SUIT_BEHIND_M = 0.06;
const SUIT_BEHIND_SHARE = 0.45;
// (r6; the critic r5: "the bare sponson strip under the turret is darkened about 35% with no net over it", "the bare
// turret-front plate is darkened evenly across the whole plate"; Main: "shade only on cloth-covered faces") The kernel
// above sets how deep the shade is; a vertex takes it only where cloth lies over the vertex itself: the cloth within
// SUIT_GATE_RADIUS_M across its normal and SUIT_GATE_REACH_M along it, its share of that footprint ramping the shade in
// between SUIT_GATE_FROM and SUIT_GATE_TO (so the shade ends softly inside the hem, never on the plate beyond it).
const SUIT_GATE_RADIUS_M = 0.09;
const SUIT_GATE_REACH_M = 0.2;
const SUIT_GATE_FROM = 0.2;
const SUIT_GATE_TO = 0.7;
/** A suit mesh (ghillieSuit.ts addMerged / the garnish: `<id>_ghillie_<owner>_net|leaves`). */
const SUIT_MESH = /_ghillie_(?:hull|turret|gun)_(?:net|leaves)$/;
/** The share of a cloth triangle's area that is cloth (the net's cut texture covers about this much of it). */
const NET_COVER = 0.72;
const LEAF_COVER = 0.6;
const VERTICES_PER_STEP = 16000;
/** The cloth's samples gathered per voxel this size (a quarter of the kernel's reach across). */
const SUIT_SAMPLE_VOXEL_M = 0.05;

export interface SuitOcclusionStats {
  /** Draws seeded with the attribute, vertices they hold, and the attribute's bytes. */
  readonly draws: number;
  readonly vertices: number;
  readonly bytes: number;
  /** Vertices the suit shades at all, and their mean amount. */
  readonly shaded: number;
  readonly meanShade: number;
  /** The bake's own time (its slices, the waits between them excluded), ms. */
  readonly ms: number;
}

type Family = 'hull' | 'turret';
interface Samples { readonly grid: Map<number, number[]>; readonly box: THREE.Box3 }
/** A grid cell's key (cells of SUIT_OCCLUSION_RADIUS_M, within +-100 m of the root on each axis). */
const cellKey = (ix: number, iy: number, iz: number): number => ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);

/** The articulation family a node rides: the turret's (turret, gun, recoil) or the hull's. */
function familyOf(object: THREE.Object3D, turretGroups: ReadonlySet<THREE.Object3D>): Family {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (turretGroups.has(node)) return 'turret';
  return 'hull';
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function isPlainMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean };
  return mesh.isMesh === true && !mesh.isInstancedMesh && !mesh.isBatchedMesh && !mesh.isSkinnedMesh;
}

/** A net's cut map as the bake reads it: straight-alpha texels (alphaCutTexture.ts), its uv transform and cut. */
interface DrawnMap { readonly data: ArrayLike<number>; readonly w: number; readonly h: number; readonly flipY: boolean;
  readonly uv: THREE.Matrix3; readonly cut: number }
/** The map a suit mesh's material cuts its cloth with, where its texels can be read (none in Node: no DOM, no texture). */
function drawnMapOf(mesh: THREE.Mesh): DrawnMap | null {
  const material = mesh.material as THREE.MeshStandardMaterial;
  const map = Array.isArray(material) ? null : material?.map;
  const image = map?.image as { data?: ArrayLike<number>; width?: number; height?: number } | undefined;
  if (!map || !image?.data || !image.width || !image.height || !(material.alphaTest > 0)) return null;
  map.updateMatrix();
  return { data: image.data, w: image.width, h: image.height, flipY: map.flipY, uv: map.matrix.clone(), cut: material.alphaTest * 255 };
}
/** Barycentric points a net triangle's drawn share is read at (its centroid, and a ring between it and each corner). */
const DRAWN_POINTS: ReadonlyArray<readonly [number, number, number]> = [[1 / 3, 1 / 3, 1 / 3],
  [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]];

/** The suit's cloth as area-weighted triangle centroids on a hash grid (x, y, z, weight; root frame), per family. */
function suitSamples(suits: readonly THREE.Mesh[], toRoot: THREE.Matrix4, turretGroups: ReadonlySet<THREE.Object3D>): Record<Family, Samples> {
  const cell = SUIT_OCCLUSION_RADIUS_M;
  const out: Record<Family, Samples> = { hull: { grid: new Map(), box: new THREE.Box3() }, turret: { grid: new Map(), box: new THREE.Box3() } };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4(), o = new THREE.Vector3();
  // each voxel: its cloth's centroid (x, y, z summed by weight), the cloth's weight, and the drawn share's (below)
  const voxels: Record<Family, Map<number, [number, number, number, number, number]>> = { hull: new Map(), turret: new Map() };
  const coverVoxels: Record<Family, Map<number, [number, number, number, number, number]>> = { hull: new Map(), turret: new Map() };
  const ta = new THREE.Vector2(), tb = new THREE.Vector2(), tc = new THREE.Vector2(), tp = new THREE.Vector2();
  for (const mesh of suits) {
    const family = familyOf(mesh, turretGroups);
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    const cover = /_leaves$/.test(mesh.name) ? LEAF_COVER : NET_COVER;
    // a fitted cover's own cloth (ghillieSuit.ts marks it): its tight kernel
    const tight = mesh.userData.fittedCover === true;
    const store = tight ? coverVoxels[family] : voxels[family];
    // (r6; the critic r5: "front-hull cells read as dark tiles in a regular grid") a net's shade is its garnish's: the
    // share of each triangle its map draws (the bunches and strips over the open cord), where the map can be read; the
    // gate (whether cloth lies over a vertex at all) still takes the whole triangle
    const drawn = /_net$/.test(mesh.name) && !tight ? drawnMapOf(mesh) : null;
    const uvs = drawn ? mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined : null;
    m.multiplyMatrices(toRoot, mesh.matrixWorld);
    for (let t = 0; t + 2 < count; t += 3) {
      const i0 = index ? index.getX(t) : t, i1 = index ? index.getX(t + 1) : t + 1, i2 = index ? index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(m);
      b.fromBufferAttribute(position, i1).applyMatrix4(m);
      c.fromBufferAttribute(position, i2).applyMatrix4(m);
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (!(area > 0)) continue;
      const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3, w = area * cover;
      let share = cover;
      if (drawn && uvs) {
        ta.fromBufferAttribute(uvs, i0).applyMatrix3(drawn.uv);
        tb.fromBufferAttribute(uvs, i1).applyMatrix3(drawn.uv);
        tc.fromBufferAttribute(uvs, i2).applyMatrix3(drawn.uv);
        let hits = 0;
        for (const [ka, kb, kc] of DRAWN_POINTS) {
          tp.set(ta.x * ka + tb.x * kb + tc.x * kc, ta.y * ka + tb.y * kb + tc.y * kc);
          const u = tp.x - Math.floor(tp.x), v = tp.y - Math.floor(tp.y);
          const px = Math.min(drawn.w - 1, Math.floor(u * drawn.w)), py = Math.min(drawn.h - 1, Math.floor((drawn.flipY ? 1 - v : v) * drawn.h));
          if (drawn.data[(py * drawn.w + px) * 4 + 3] >= drawn.cut) hits++;
        }
        share = hits / DRAWN_POINTS.length;
      }
      // gathered into a voxel of SUIT_SAMPLE_VOXEL_M (its weighted centroid): far fewer samples under the same kernel
      const vk = cellKey(Math.floor(x / SUIT_SAMPLE_VOXEL_M), Math.floor(y / SUIT_SAMPLE_VOXEL_M), Math.floor(z / SUIT_SAMPLE_VOXEL_M));
      let v = store.get(vk);
      if (!v) store.set(vk, v = [0, 0, 0, 0, 0]);
      v[0] += x * w; v[1] += y * w; v[2] += z * w; v[3] += w; v[4] += area * share;
    }
  }
  // each sample: x, y, z, its drawn weight over its kernel's footprint (the kernel integrates to pi R^2 / 3), its R^2,
  // and its cloth's weight over the gate's footprint (a cover's own kernel when that is tighter)
  for (const family of ['hull', 'turret'] as const) {
    const { grid, box } = out[family];
    for (const [store, r] of [[voxels[family], SUIT_OCCLUSION_RADIUS_M], [coverVoxels[family], SUIT_COVER_RADIUS_M]] as const) {
      for (const [sx, sy, sz, w, d] of store.values()) {
        const x = sx / w, y = sy / w, z = sz / w;
        const key = cellKey(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell));
        let list = grid.get(key);
        if (!list) grid.set(key, list = []);
        const g = Math.min(r, SUIT_GATE_RADIUS_M);
        list.push(x, y, z, d / (Math.PI * r * r / 3), r * r, w / (Math.PI * g * g / 3), g * g);
        box.expandByPoint(o.set(x, y, z));
      }
    }
  }
  return out;
}

/**
 * Seed and bake the suit's shade on a built vehicle (`root` in its own frame; `turretGroups` the turret, gun and recoil
 * groups, whose suit turns with them and shades only them). Returns null and touches nothing on a vehicle without a
 * suit. A step a slice of vertices (the build's own stepping).
 */
export function* bakeSuitOcclusionSteps(root: THREE.Object3D, turretGroups: readonly (THREE.Object3D | null | undefined)[]):
  Generator<void, SuitOcclusionStats | null, void> {
  const suits: THREE.Mesh[] = [];
  root.traverse((object) => { if (isPlainMesh(object) && SUIT_MESH.test(object.name)) suits.push(object); });
  if (!suits.length) return null;
  let ms = 0, slice = performance.now();
  const pause = function* (): Generator<void, void, void> { ms += performance.now() - slice; yield; slice = performance.now(); };
  root.updateMatrixWorld(true);
  const turrets = new Set(turretGroups.filter((group): group is THREE.Object3D => !!group));
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // every draw of a vehicle material: seeded (one layout per owner and material), counted by geometry
  const draws: THREE.Mesh[] = [], users = new Map<THREE.BufferGeometry, number>();
  root.traverse((object) => {
    if (!isPlainMesh(object) || Array.isArray(object.material) || !object.material) return;
    if (!isVehicleMaterialRegistered(object.material)) return;
    const position = object.geometry?.getAttribute('position');
    if (!position) return;
    draws.push(object);
    users.set(object.geometry, (users.get(object.geometry) ?? 0) + 1);
  });
  let vertices = 0, bytes = 0, shaded = 0, sum = 0;
  const seeded = new Set<THREE.BufferGeometry>();
  for (const mesh of draws) {
    const geometry = mesh.geometry;
    if (seeded.has(geometry) || geometry.getAttribute(SUIT_OCCLUSION_ATTRIBUTE)) continue;
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute(SUIT_OCCLUSION_ATTRIBUTE, new THREE.BufferAttribute(new Uint8Array(count), 1, true));
    seeded.add(geometry);
    vertices += count;
    bytes += count;
  }
  yield* pause();
  const samples = suitSamples(suits, toRoot, turrets);
  const R = SUIT_OCCLUSION_RADIUS_M, H = SUIT_OCCLUSION_REACH_M;
  // a fully covered surface: the net's cloth over the whole footprint (each sample's weight is already per footprint)
  const full = NET_COVER;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  let budget = VERTICES_PER_STEP;
  for (const mesh of draws) {
    const geometry = mesh.geometry;
    // a suit's own draws, and a geometry drawn twice, keep zeros
    if (SUIT_MESH.test(mesh.name) || (users.get(geometry) ?? 0) > 1) continue;
    const { grid, box } = samples[familyOf(mesh, turrets)];
    if (!grid.size) continue;
    // the samples' reach: their bounds grown by the kernel and the reach (a vertex outside it is never shaded)
    const near = box.clone().expandByScalar(R + H);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!normal) continue;
    const shade = geometry.getAttribute(SUIT_OCCLUSION_ATTRIBUTE) as THREE.BufferAttribute;
    const out = shade.array as Uint8Array;
    m.multiplyMatrices(toRoot, mesh.matrixWorld);
    nm.getNormalMatrix(m);
    // each vertex's shade and the share of its footprint the cloth covers; the cover a vertex takes is the least of
    // every triangle it belongs to (below)
    const amounts = new Float32Array(position.count), gates = new Float32Array(position.count);
    let any = false;
    for (let i = 0; i < position.count; i++) {
      if (--budget <= 0) { budget = VERTICES_PER_STEP; yield* pause(); }
      p.fromBufferAttribute(position, i).applyMatrix4(m);
      if (!near.containsPoint(p)) continue;
      n.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize();
      // the cells the reach can touch: the segment out along the normal (from a little behind), a radius round it
      const ex = p.x + n.x * H, ey = p.y + n.y * H, ez = p.z + n.z * H;
      const x0 = Math.floor((Math.min(p.x, ex) - R) / R), x1 = Math.floor((Math.max(p.x, ex) + R) / R);
      const y0 = Math.floor((Math.min(p.y, ey) - R) / R), y1 = Math.floor((Math.max(p.y, ey) + R) / R);
      const z0 = Math.floor((Math.min(p.z, ez) - R) / R), z1 = Math.floor((Math.max(p.z, ez) + R) / R);
      let acc = 0, gate = 0;
      for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
        const list = grid.get(cellKey(ix, iy, iz));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 7) {
          const vx = list[k] - p.x, vy = list[k + 1] - p.y, vz = list[k + 2] - p.z;
          const along = vx * n.x + vy * n.y + vz * n.z;
          if (along <= -SUIT_BEHIND_M || along > H) continue;
          const r2 = list[k + 4];
          const across = vx * vx + vy * vy + vz * vz - Math.max(0, along) * Math.max(0, along);
          if (across >= r2) continue;
          // the cloth over the vertex itself (a centimetre behind its plane at most: a net laid on the plate's edge)
          const g2 = list[k + 6];
          if (across < g2 && along > -0.01 && along <= SUIT_GATE_REACH_M) gate += list[k + 5] * (1 - across / g2) ** 2;
          const q = 1 - across / r2;
          // cloth close over the surface shades it more than cloth at the reach's end; cloth just behind its plane, a share
          acc += list[k + 3] * q * q * (along > 0.002 ? 1 - 0.4 * along / H : SUIT_BEHIND_SHARE * (1 + along / SUIT_BEHIND_M));
        }
      }
      if (acc <= 0 || gate <= 0) continue;
      amounts[i] = Math.min(1, acc / full);
      gates[i] = gate / full;
      any = true;
    }
    if (!any) continue;
    // (r7; the critic r6: "shade on the bare sponson ledge, which no suit covers", one 2.75 m triangle whose two far
    // corners lay under the deck net and the drape's roll) a triangle is under the cloth only as far as its least
    // covered corner, and a vertex takes the least of its triangles: a coarse panel the cloth reaches at a corner or two
    // takes no shade across its bare span
    const index = geometry.index;
    const tris = index ? index.count : position.count;
    const least = new Float32Array(position.count).fill(Infinity);
    for (let t = 0; t + 2 < tris; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
      const g = Math.min(gates[a], gates[b], gates[c]);
      if (g < least[a]) least[a] = g;
      if (g < least[b]) least[b] = g;
      if (g < least[c]) least[c] = g;
    }
    let touched = false;
    for (let i = 0; i < position.count; i++) {
      if (!amounts[i]) continue;
      const amount = amounts[i] * smoothstep(SUIT_GATE_FROM, SUIT_GATE_TO, Number.isFinite(least[i]) ? least[i] : gates[i]);
      const byte = Math.round(amount * 255);
      if (!byte) continue;
      out[i] = byte;
      shaded++;
      sum += amount;
      touched = true;
    }
    if (touched) shade.needsUpdate = true;
  }
  ms += performance.now() - slice;
  return { draws: seeded.size, vertices, bytes, shaded, meanShade: shaded ? sum / shaded : 0, ms: Math.round(ms) };
}
