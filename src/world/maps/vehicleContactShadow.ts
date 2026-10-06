// src/world/maps/vehicleContactShadow.ts — the ground's darkening under the parked vehicles (the map-vehicles lane,
// 2026-10-05). A car standing on a road takes the sky from the ground beneath it and round its tyres; the sun shadow
// moves with the sun and leaves the patch under the body lit from the side. Each placed vehicle gets one soft
// rounded-rectangle patch, conformed to the ground (a 5 x 7 grid on the height field), drawn as one transparent mesh
// for the whole map that only darkens (black under a soft alpha), like the props' own ground-contact layer. No
// collision, no stream draws, desktop tiers only.

import * as THREE from 'three';
import { markShadowOnly, setShadowCasterProfile } from '../../engine/renderLayers.ts';
import { vehicleContactPatch } from './civilianVehicleKit.ts';

const SHADOW_CASTER_MATERIAL = new THREE.MeshBasicMaterial({ name: 'VehicleShadowCaster', colorWrite: false, depthWrite: false });

/**
 * A vehicle pool's shadow caster: an instanced mesh of the role's coarse build on the pool's OWN instance matrices
 * (one shared attribute, so a crushed slot's zero scale, a restore and every later write move it too), drawn in the
 * shadow passes only (the shadow-only layer), with the pool's caster profile. The pool itself stops casting.
 */
export function vehicleShadowCaster(pool: THREE.InstancedMesh, geometry: THREE.BufferGeometry, heightM: number): THREE.InstancedMesh {
  const caster = new THREE.InstancedMesh(geometry, SHADOW_CASTER_MATERIAL, pool.count);
  caster.instanceMatrix = pool.instanceMatrix;
  caster.count = pool.count;
  caster.frustumCulled = pool.frustumCulled;
  caster.computeBoundingSphere();
  caster.castShadow = true;
  caster.receiveShadow = false;
  caster.matrixAutoUpdate = false;
  caster.name = `${pool.name}-shadow`;
  setShadowCasterProfile(caster, { heightM, instanced: true });
  markShadowOnly(caster);
  pool.castShadow = false;
  return caster;
}

interface ContactRecord {
  kind: string;
  x: number;
  z: number;
  yaw: number;
  sc: number;
}

interface ContactField {
  getHeightAt(x: number, z: number): number;
}

function contactTexture(anisotropy: number): THREE.Texture {
  const w = 64, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // a rounded rectangle: distance outside an inner box, soft to the edge; densest under the axles' line
      const u = Math.abs((x + 0.5) / w - 0.5) * 2, v = Math.abs((y + 0.5) / h - 0.5) * 2;
      const dx = Math.max(0, u - 0.55) / 0.45, dy = Math.max(0, v - 0.72) / 0.28;
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = (1 - d * d * (3 - 2 * d)) * (0.62 + 0.12 * (1 - u));
      const k = (y * w + x) * 4;
      image.data[k] = 0; image.data[k + 1] = 0; image.data[k + 2] = 0; image.data[k + 3] = Math.round(a * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** One mesh of contact patches under every vehicle record (null when the map places none); `footprint` is a vehicle
 * kind's footprint on this map (null: not a vehicle). */
export function buildVehicleContactShadows(records: readonly ContactRecord[], field: ContactField, anisotropy: number,
  footprint: (kind: string) => { hw: number; hl: number } | null): THREE.Mesh | null {
  const nx = 5, nz = 7;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let patches = 0;
  for (const r of records) {
    const own = footprint(r.kind);
    if (!own) continue;
    const fp = vehicleContactPatch(own.hw, own.hl);
    const hw = fp.hw * r.sc, hl = fp.hl * r.sc, c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const base = pos.length / 3;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const u = ix / (nx - 1), v = iz / (nz - 1);
      const lx = (u - 0.5) * 2 * hw, lz = (v - 0.5) * 2 * hl;
      const px = r.x + lx * c + lz * s, pz = r.z - lx * s + lz * c;
      pos.push(px, field.getHeightAt(px, pz) + 0.035, pz);
      uv.push(u, v);
    }
    for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = base + iz * nx + ix, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    patches++;
  }
  if (!patches) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, map: contactTexture(anisotropy), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'props-vehicle-contact';
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.terrainDecal = true;
  mesh.userData.groundContactDecal = true;
  mesh.userData.terrainDecalKind = 'vehicle-contact';
  mesh.userData.decalParts = patches;
  return mesh;
}
