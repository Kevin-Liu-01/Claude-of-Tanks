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
export function buildVehicleContactShadows<R extends ContactRecord>(records: readonly R[], field: ContactField, anisotropy: number,
  footprint: (kind: string) => { hw: number; hl: number } | null, standing: (record: R) => boolean = () => true): THREE.Mesh | null {
  const nx = 5, nz = 7;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let patches = 0;
  for (const r of records) {
    const own = footprint(r.kind);
    if (!own || !standing(r)) continue;
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

/** A sled's runner tracks in its placed frame (cartKit.ts fittedRunners). */
interface RunnerTrackLayout { readonly xs: readonly number[]; readonly z0: number; readonly z1: number; readonly width: number }

/** The pressed track's profile: a soft blue-grey groove across, the far end fading out behind the sled. */
function runnerTrackTexture(anisotropy: number): THREE.Texture {
  const w = 32, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = Math.abs((x + 0.5) / w - 0.5) * 2, v = (y + 0.5) / h;
      // the groove: dense in the middle, soft to its edges; v = 0 the far end behind (gone), v = 1 under the runner
      const across = Math.max(0, 1 - u * u * (3 - 2 * u)) ** 1.4;
      const along = Math.min(1, v / 0.55) ** 1.5;
      const a = across * along * 0.62;
      const k = (y * w + x) * 4;
      image.data[k] = 74; image.data[k + 1] = 88; image.data[k + 2] = 108; image.data[k + 3] = Math.round(a * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Round 3 (wave 234: sleds on "pristine snow with no runner track, sinkage or drift"): the track each placed sled's
 * runners pressed into the snow, from far behind it to just ahead of its runners, conformed to the ground (a strip of
 * 0.3 m segments on the height field), one transparent mesh for the map like the contact patches. `runners` is a kind's
 * layout in the placed frame (null: no runners). Desktop tiers; no collision, no stream draws.
 */
export function buildRunnerTracks<R extends ContactRecord>(records: readonly R[], field: ContactField, anisotropy: number,
  runners: (kind: string) => RunnerTrackLayout | null, standing: (record: R) => boolean = () => true): THREE.Mesh | null {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let tracks = 0;
  for (const r of records) {
    const lay = runners(r.kind);
    if (!lay || !standing(r)) continue;
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const len = (lay.z1 - lay.z0) * r.sc, n = Math.max(2, Math.ceil(len / 0.3)), half = lay.width * r.sc;
    for (const x of lay.xs) {
      const base = pos.length / 3;
      for (let k = 0; k <= n; k++) {
        const t = k / n, lz = (lay.z0 + (lay.z1 - lay.z0) * t) * r.sc;
        for (const side of [-1, 1]) {
          const lx = x * r.sc + side * half;
          const px = r.x + lx * c + lz * s, pz = r.z - lx * s + lz * c;
          pos.push(px, field.getHeightAt(px, pz) + 0.03, pz);
          uv.push(side < 0 ? 0 : 1, t);
        }
      }
      for (let k = 0; k < n; k++) {
        const a = base + k * 2, b = a + 1, d = a + 2, e = a + 3;
        idx.push(a, d, b, b, d, e);
      }
      tracks++;
    }
  }
  if (!tracks) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    map: runnerTrackTexture(anisotropy), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'props-runner-tracks';
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.terrainDecal = true;
  mesh.userData.groundContactDecal = true;
  mesh.userData.terrainDecalKind = 'runner-track';
  mesh.userData.decalParts = tracks;
  return mesh;
}
