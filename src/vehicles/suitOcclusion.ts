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
const SUIT_OCCLUSION_RADIUS_M = 0.2;
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
  /** The bake's own time (its slices, the waits between them excluded), ms. Named as a timing (…Ms) so a build's identity
   *  receipts leave it out (tools/deferred-assembly-receipt.mjs TIMING). */
  readonly bakeMs: number;
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

function isPlainMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean };
  return mesh.isMesh === true && !mesh.isInstancedMesh && !mesh.isBatchedMesh && !mesh.isSkinnedMesh;
}

/** The suit's cloth as area-weighted triangle centroids on a hash grid (x, y, z, weight; root frame), per family. */
function suitSamples(suits: readonly THREE.Mesh[], toRoot: THREE.Matrix4, turretGroups: ReadonlySet<THREE.Object3D>): Record<Family, Samples> {
  const cell = SUIT_OCCLUSION_RADIUS_M;
  const out: Record<Family, Samples> = { hull: { grid: new Map(), box: new THREE.Box3() }, turret: { grid: new Map(), box: new THREE.Box3() } };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4(), o = new THREE.Vector3();
  const voxels: Record<Family, Map<number, [number, number, number, number]>> = { hull: new Map(), turret: new Map() };
  for (const mesh of suits) {
    const family = familyOf(mesh, turretGroups);
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    const cover = /_leaves$/.test(mesh.name) ? LEAF_COVER : NET_COVER;
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
      // gathered into a voxel of SUIT_SAMPLE_VOXEL_M (its weighted centroid): far fewer samples under the same kernel
      const vk = cellKey(Math.floor(x / SUIT_SAMPLE_VOXEL_M), Math.floor(y / SUIT_SAMPLE_VOXEL_M), Math.floor(z / SUIT_SAMPLE_VOXEL_M));
      let v = voxels[family].get(vk);
      if (!v) voxels[family].set(vk, v = [0, 0, 0, 0]);
      v[0] += x * w; v[1] += y * w; v[2] += z * w; v[3] += w;
    }
  }
  for (const family of ['hull', 'turret'] as const) {
    const { grid, box } = out[family];
    for (const [sx, sy, sz, w] of voxels[family].values()) {
      const x = sx / w, y = sy / w, z = sz / w;
      const key = cellKey(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell));
      let list = grid.get(key);
      if (!list) grid.set(key, list = []);
      list.push(x, y, z, w);
      box.expandByPoint(o.set(x, y, z));
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
  const R = SUIT_OCCLUSION_RADIUS_M, R2 = R * R, H = SUIT_OCCLUSION_REACH_M;
  // a fully covered surface: its cloth's area over the kernel's footprint (the kernel integrates to pi R^2 / 3)
  const full = NET_COVER * Math.PI * R2 / 3;
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
    let touched = false;
    for (let i = 0; i < position.count; i++) {
      if (--budget <= 0) { budget = VERTICES_PER_STEP; yield* pause(); }
      p.fromBufferAttribute(position, i).applyMatrix4(m);
      if (!near.containsPoint(p)) continue;
      n.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize();
      // the cells the reach can touch: the segment out along the normal, a radius round it
      const ex = p.x + n.x * H, ey = p.y + n.y * H, ez = p.z + n.z * H;
      const x0 = Math.floor((Math.min(p.x, ex) - R) / R), x1 = Math.floor((Math.max(p.x, ex) + R) / R);
      const y0 = Math.floor((Math.min(p.y, ey) - R) / R), y1 = Math.floor((Math.max(p.y, ey) + R) / R);
      const z0 = Math.floor((Math.min(p.z, ez) - R) / R), z1 = Math.floor((Math.max(p.z, ez) + R) / R);
      let acc = 0;
      for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
        const list = grid.get(cellKey(ix, iy, iz));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 4) {
          const vx = list[k] - p.x, vy = list[k + 1] - p.y, vz = list[k + 2] - p.z;
          const along = vx * n.x + vy * n.y + vz * n.z;
          if (along <= 0.002 || along > H) continue;
          const across = vx * vx + vy * vy + vz * vz - along * along;
          if (across >= R2) continue;
          const q = 1 - across / R2;
          // cloth close over the surface shades it more than cloth at the reach's end
          acc += list[k + 3] * q * q * (1 - 0.4 * along / H);
        }
      }
      if (acc <= 0) continue;
      const amount = Math.min(1, acc / full);
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
  return { draws: seeded.size, vertices, bytes, shaded, meanShade: shaded ? sum / shaded : 0, bakeMs: Math.round(ms) };
}
