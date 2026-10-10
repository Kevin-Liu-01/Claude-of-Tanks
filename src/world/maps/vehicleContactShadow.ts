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

/**
 * The pressed track's profile: a soft trough across (densest at its middle, its edges eased), dark under the runner and
 * fading out far behind, its depth varying along the run (the snow's own unevenness). It only darkens (black under its
 * alpha, as the contact patches do), so the snow's own light carries it by day and by night.
 */
function runnerTrackTexture(anisotropy: number): THREE.Texture {
  const w = 32, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = Math.abs((x + 0.5) / w - 0.5) * 2, v = (y + 0.5) / h;
      const across = Math.max(0, 1 - u * u) ** 1.1;
      // v = 0 the far end behind (gone), v = 1 under the runner; the depth wanders along the run
      // (round 5, wave 278: "two faint grey streaks… neither indent nor compact the snow") a deeper shade, the groove's
      // floor in its own shadow
      const fade = Math.min(1, v / 0.45) ** 1.2;
      const vary = 0.74 + 0.16 * Math.sin(v * 37.1 + 1.3) + 0.1 * Math.sin(v * 91.7);
      const a = across * fade * vary * 0.72;
      const k = (y * w + x) * 4;
      image.data[k] = 0; image.data[k + 1] = 0; image.data[k + 2] = 0; image.data[k + 3] = Math.round(Math.max(0, a) * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Round 5 (wave 278: the LRV with "no wheel tracks"): a wire-mesh wheel's print in the regolith — the titanium chevrons'
 * Vs pressed across a darker band, repeating every `v` unit (the uv's v runs in chevron pitches here). Alpha only.
 */
function chevronTrackTexture(anisotropy: number): THREE.Texture {
  const w = 32, h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h;
      const across = Math.max(0, 1 - (Math.abs(u) * 2) ** 4);
      // the chevron: a V across the band, its arms 2 px wide
      const vee = (v + Math.abs(u) * 0.7) % 1, bar = vee < 0.22 ? 1 : 0;
      const a = across * (0.42 + 0.33 * bar);
      const k = (y * w + x) * 4;
      image.data[k] = 0; image.data[k + 1] = 0; image.data[k + 2] = 0; image.data[k + 3] = Math.round(a * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Round 5 (wave 278: the horn sled with "no runner tracks or trampling behind it"): the puller's tread between the
 * runners — boot prints alternating left and right every v unit (the uv's v runs in strides here), each a shadowed
 * oval, over a faint compaction. Alpha only.
 */
function trampleTexture(anisotropy: number): THREE.Texture {
  const w = 32, h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h;
      const across = Math.max(0, 1 - (Math.abs(u) * 2) ** 2);
      // two prints a stride: the left at v 0.25, the right at v 0.75, each an oval 0.2 across, 0.3 long
      let print = 0;
      for (const [pu, pv] of [[-0.18, 0.25], [0.18, 0.75]]) {
        const d = Math.hypot((u - pu) / 0.11, (v - pv) / 0.17);
        print = Math.max(print, Math.max(0, 1 - d * d));
      }
      const a = across * 0.12 + print * 0.45;
      const k = (y * w + x) * 4;
      image.data[k] = 0; image.data[k + 1] = 0; image.data[k + 2] = 0; image.data[k + 3] = Math.round(Math.min(1, a) * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** A track strip's look: its texture, the mesh's name, and the uv's v in repeats of `pitch` metres (none: 0..1). */
export interface TrackStyle { readonly texture: 'runner' | 'chevron' | 'trample'; readonly name: string; readonly pitch?: number }

/**
 * Round 3 (wave 234: sleds on "pristine snow with no runner track, sinkage or drift"), round 4 (wave 260: "two
 * ruler-straight hairlines that do not start at the runners"): the troughs each placed sled's runners pressed into the
 * snow, from under its runners back along the way it came — the path bending away gently behind it (a sled is hauled
 * round, not along a ruler: each record's bend from its place), a hand wide, conformed to the ground (0.3 m segments on
 * the height field), one transparent mesh for the map like the contact patches. `runners` is a kind's layout in the
 * placed frame (null: no runners). Desktop tiers; no collision, no stream draws.
 */
export function buildRunnerTracks<R extends ContactRecord>(records: readonly R[], field: ContactField, anisotropy: number,
  runners: (kind: string) => RunnerTrackLayout | null, standing: (record: R) => boolean = () => true,
  style: TrackStyle = { texture: 'runner', name: 'props-runner-tracks' }): THREE.Mesh | null {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let tracks = 0;
  for (const r of records) {
    const lay = runners(r.kind);
    if (!lay || !standing(r)) continue;
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const len = (lay.z1 - lay.z0) * r.sc, n = Math.max(2, Math.ceil(len / 0.3)), half = lay.width * r.sc;
    // the bend: from straight under the sled to `bend` metres aside at the far end, its side and size from the place
    const h = Math.sin(r.x * 12.9898 + r.z * 78.233) * 43758.5453, frac = h - Math.floor(h);
    const bend = (frac < 0.5 ? -1 : 1) * (0.5 + 1.1 * Math.abs(frac - 0.5) * 2) * r.sc;
    for (const x of lay.xs) {
      const base = pos.length / 3;
      for (let k = 0; k <= n; k++) {
        const t = k / n, lz = (lay.z0 + (lay.z1 - lay.z0) * t) * r.sc;
        const behind = 1 - t, off = bend * behind * behind;
        // the path's direction at t (its slope across), so each trough keeps its width round the bend
        const slope = (-2 * bend * behind) / Math.max(0.5, len), cn = 1 / Math.hypot(1, slope);
        for (const side of [-1, 1]) {
          const lx = x * r.sc + off + side * half * cn, lzs = lz - side * half * slope * cn;
          const px = r.x + lx * c + lzs * s, pz = r.z - lx * s + lzs * c;
          pos.push(px, field.getHeightAt(px, pz) + 0.025, pz);
          uv.push(side < 0 ? 0 : 1, style.pitch ? (lz - lay.z0 * r.sc) / style.pitch : t);
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
  const map = style.texture === 'chevron' ? chevronTrackTexture(anisotropy) : style.texture === 'trample' ? trampleTexture(anisotropy)
    : runnerTrackTexture(anisotropy);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = style.name;
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.terrainDecal = true;
  mesh.userData.groundContactDecal = true;
  mesh.userData.terrainDecalKind = style.texture === 'runner' ? 'runner-track' : style.texture === 'chevron' ? 'wheel-track' : 'trample';
  mesh.userData.decalParts = tracks;
  return mesh;
}

/** The ground-cover holes over hauled-out boats' mud (map.ts withGroundCoverHoles): discs along each patch. */
export function boatMudHoles(records: readonly BoatMudRecord[], field: ContactField & { getWaterMaskAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number }): Array<{ x: number; z: number; r: number }> {
  const holes: Array<{ x: number; z: number; r: number }> = [];
  for (const r of records) {
    // round 5: the apron's grass is gone too, every metre of it down to the water
    const way = waterward(r, field);
    if (way) for (let t = 1; t <= way.dist + 0.5; t += 1) holes.push({ x: r.x + way.dx * t, z: r.z + way.dz * t, r: 1.1 });
    const ax = Math.cos(r.yaw), az = -Math.sin(r.yaw);
    const hA = field.getHeightAt(r.x + ax * r.halfLength, r.z + az * r.halfLength);
    const hB = field.getHeightAt(r.x - ax * r.halfLength, r.z - az * r.halfLength);
    const shift = 0.7 * (hA < hB ? 1 : -1), radius = r.halfWidth + 0.45, reach = r.halfLength + 0.8 - radius;
    for (let k = -2; k <= 2; k++) {
      const along = shift + (k / 2) * Math.max(0, reach);
      holes.push({ x: r.x + ax * along, z: r.z + az * along, r: radius });
    }
  }
  return holes;
}

/**
 * Round 5 (wave 278: the Mangrove sampan "on a flat brown decal strip on a mown lawn beside the house, with no tidal mud,
 * water or wet line"): the way down to the water from a hauled-out hull — the first wet ground (water mask over a half,
 * or a few centimetres of water) on rings out to 14 m, the nearest bearing on the nearest ring — so its mud runs on
 * down the bank to the waterline as the drag of its hauling (null: no water in reach).
 */
function waterward(r: BoatMudRecord, field: { getWaterMaskAt?(x: number, z: number): number; getWaterDepthAt?(x: number, z: number): number })
  : { dx: number; dz: number; dist: number } | null {
  if (!field.getWaterMaskAt && !field.getWaterDepthAt) return null;
  const wet = (x: number, z: number) => (field.getWaterMaskAt?.(x, z) ?? 0) > 0.5 || (field.getWaterDepthAt?.(x, z) ?? 0) > 0.05;
  for (let ring = 2; ring <= 14; ring += 0.5) {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      if (wet(r.x + dx * ring, r.z + dz * ring)) return { dx, dz, dist: ring };
    }
  }
  return null;
}

/** A hauled-out boat's plan (mapKits.ts beachedBoat's receipt: its length on (cos yaw, -sin yaw)). */
interface BoatMudRecord { readonly x: number; readonly z: number; readonly yaw: number; readonly halfLength: number; readonly halfWidth: number }

/** The landing's mud: brown silt, wetter and darker toward the middle, its edge broken (alpha soft, ragged). */
function boatMudTexture(anisotropy: number): THREE.Texture {
  const w = 64, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = Math.abs((x + 0.5) / w - 0.5) * 2, v = Math.abs((y + 0.5) / h - 0.5) * 2;
      // a rounded rectangle whose edge wanders (two octaves of ripple round it), denser and wetter inside
      const a0 = Math.atan2((y + 0.5) / h - 0.5, (x + 0.5) / w - 0.5);
      const edge = 0.08 * Math.sin(a0 * 7 + 1.3) + 0.05 * Math.sin(a0 * 17 + 0.4);
      const dx = Math.max(0, u - 0.45) / 0.55, dy = Math.max(0, v - 0.62) / 0.38;
      const d = Math.min(1, Math.max(0, Math.hypot(dx, dy) + edge));
      const a = Math.min(1, (1 - d * d * (3 - 2 * d)) * 1.15) * 0.96;
      // (wave 260: "no keel groove") the keel's drag mark down the patch's middle, the length of it: darker, wetter
      const groove = Math.max(0, 1 - (u / 0.07) ** 2) * Math.min(1, (1 - v) / 0.08);
      const wet = (1 - 0.3 * Math.max(0, 1 - Math.hypot(u, v * 0.8))) * (1 - 0.4 * groove);
      const k = (y * w + x) * 4;
      image.data[k] = Math.round(74 * wet); image.data[k + 1] = Math.round(57 * wet); image.data[k + 2] = Math.round(40 * wet);
      image.data[k + 3] = Math.round(a * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Round 3 (wave 234: the Mangrove boat "on clean lawn"): the mud a landing's hauled-out boat lies in, a patch past its
 * hull all round and further toward the water it was dragged from, conformed to the ground (a 7 x 9 grid), one
 * lit transparent mesh for the map (wet: a low roughness); the caller sets up its shadows. Null when none.
 */
export function buildBoatMud(records: readonly BoatMudRecord[], field: ContactField & { getWaterMaskAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number },
  anisotropy: number): THREE.Mesh | null {
  const nx = 7, nz = 9;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const r of records) {
    const ax = Math.cos(r.yaw), az = -Math.sin(r.yaw), bx = -az, bz = ax;
    // the drag toward the water: the patch runs on past the end whose ground lies lower
    const hA = field.getHeightAt(r.x + ax * r.halfLength, r.z + az * r.halfLength);
    const hB = field.getHeightAt(r.x - ax * r.halfLength, r.z - az * r.halfLength);
    const down = hA < hB ? 1 : -1, shift = 0.7 * down;
    const hl = r.halfLength + 1.1, hw = r.halfWidth + 0.75;
    const base = pos.length / 3;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const u = ix / (nx - 1), v = iz / (nz - 1);
      const along = (v - 0.5) * 2 * hl + shift, across = (u - 0.5) * 2 * hw;
      const px = r.x + ax * along + bx * across, pz = r.z + az * along + bz * across;
      pos.push(px, field.getHeightAt(px, pz) + 0.025, pz);
      uv.push(u, v);
    }
    // wound to face up whichever way the axes turn
    const up = ax * bz - az * bx > 0;
    for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = base + iz * nx + ix, b = a + 1, d = a + nx, e = d + 1;
      if (up) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
    }
    // round 5: the drag down the bank, from under the hull to a metre into the water, its keel groove down the middle
    const way = waterward(r, field);
    if (way) {
      const len = way.dist + 1, steps = Math.max(5, Math.ceil(len / 0.8)), half = Math.max(1.1, r.halfWidth + 0.55);
      const wx = -way.dz, wz = way.dx, base2 = pos.length / 3;
      for (let iz = 0; iz <= steps; iz++) for (let ix = 0; ix < nx; ix++) {
        const u = ix / (nx - 1), v = iz / steps;
        const along = -0.5 + v * len, across = (u - 0.5) * 2 * half * (1 - 0.25 * v);
        const px = r.x + way.dx * along + wx * across, pz = r.z + way.dz * along + wz * across;
        pos.push(px, field.getHeightAt(px, pz) + 0.025, pz);
        uv.push(u, 0.5 + v * 0.5);
      }
      const up2 = way.dx * wz - way.dz * wx > 0;
      for (let iz = 0; iz < steps; iz++) for (let ix = 0; ix < nx - 1; ix++) {
        const a = base2 + iz * nx + ix, b = a + 1, d = a + nx, e = d + 1;
        if (up2) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
      }
    }
  }
  if (!idx.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    // (hold 11: at 0.42 the sky's reflection turned the brown silt a pale blue-grey film)
    map: boatMudTexture(anisotropy), transparent: true, depthWrite: false, roughness: 0.78, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'props-boat-mud';
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.userData.terrainDecal = true;
  mesh.userData.terrainDecalKind = 'boat-mud';
  mesh.userData.decalParts = records.length;
  return mesh;
}

/** A moored hull at the water's surface (props.ts detachAnimatedDressing): its plan and the surface it floats in. */
interface HullWaterRecord { readonly x: number; readonly z: number; readonly yaw: number; readonly halfLength: number; readonly halfWidth: number; readonly surfaceY: number }

/**
 * The ring round a hull at the water line, across (u) its run out from the hull: a white foam lip where the skin meets
 * the water, the hull's dark contact in the water under its lee, two faint ripple rings further out (alpha soft).
 */
function hullWaterRingTexture(anisotropy: number): THREE.Texture {
  const w = 128, h = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx?.createImageData && ctx.putImageData) {
    const image = ctx.createImageData(w, h);
    const bump = (u: number, at: number, width: number) => Math.max(0, 1 - ((u - at) / width) ** 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const foam = bump(u, 0.04, 0.07) * 0.8;
      const dark = bump(u, 0.22, 0.2) * 0.34;
      const ripple = bump(u, 0.52, 0.035) * 0.16 + bump(u, 0.76, 0.03) * 0.1;
      const light = Math.max(foam, ripple);
      const k = (y * w + x) * 4;
      // foam and ripples white, the contact dark: where both reach, the stronger wins
      const white = light >= dark;
      const v = white ? 235 : 8;
      image.data[k] = v; image.data[k + 1] = white ? 240 : 14; image.data[k + 2] = white ? 238 : 16;
      image.data[k + 3] = Math.round(Math.min(1, white ? light : dark) * 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Round 4 (wave 260: the Nordhavn boats "hover… no waterline, ripple or foam where hull meets sea"): a ring on the
 * water's surface round each moored hull — the foam lip at its skin, the dark of its contact, two ripples — one mesh
 * for the map, drawn after the water (renderOrder 3; the water sheet draws at 2), never written to depth. The ring's
 * inner edge follows the hull's waterline plan (an ellipse a little inside the hull's half length and beam, so the lip
 * meets the planking), its outer edge 0.75 m beyond. Null when the map moors no hull.
 */
export function buildHullWaterRings(records: readonly HullWaterRecord[], anisotropy: number): THREE.Mesh | null {
  if (!records.length) return null;
  const segs = 40;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const r of records) {
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const a0 = r.halfLength * 0.9, b0 = r.halfWidth * 0.86, out = 0.75;
    const base = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      // a pointed waterline: the ends pinched (|cos|^0.6 along, the sides full)
      const ex = Math.sign(ct) * Math.abs(ct) ** 0.85, ez = st;
      for (const [ring, along] of [[0, 0], [1, out]] as const) {
        const lx = ex * (a0 + along), lz = ez * (b0 + along);
        // the hull's length lies on its local x (mooredHull: (cos yaw, -sin yaw))
        const px = r.x + lx * c + lz * s, pz = r.z - lx * s + lz * c;
        pos.push(px, r.surfaceY + 0.012, pz);
        uv.push(ring, k / segs);
      }
    }
    for (let k = 0; k < segs; k++) {
      const i0 = base + k * 2, i1 = i0 + 1, j0 = i0 + 2, j1 = i0 + 3;
      idx.push(i0, j0, i1, i1, j0, j1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    map: hullWaterRingTexture(anisotropy), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'props-hull-water-rings';
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.decalParts = records.length;
  return mesh;
}

/**
 * The mud a hauled-out hull pushed up as it was dragged and settled (round 4, wave 260: "no sink, push-up"): a low
 * lumpy rim round each boat's bottom plan (an ellipse a little inside its length and beam), tucked under the planking
 * on its inner edge, cresting 4-9 cm a hand's width out, running down into the patch 0.4 m out; wet silt in vertex
 * colours on one opaque lit mesh for the map (the caller sets up its shadows). Null when no boat is hauled out.
 */
export function buildBoatMudRims(records: readonly BoatMudRecord[], field: ContactField): THREE.Mesh | null {
  if (!records.length) return null;
  const segs = 36, rows: ReadonlyArray<readonly [number, number]> = [[-0.05, -0.04], [0.12, 0.07], [0.42, -0.015]];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const rec of records) {
    const ax = Math.cos(rec.yaw), az = -Math.sin(rec.yaw), bx = -az, bz = ax;
    const a = rec.halfLength * 0.8, b = rec.halfWidth * 0.75;
    const salt = Math.sin(rec.x * 12.9898 + rec.z * 78.233) * 43758.5453;
    const base = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const lump = 0.6 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5 + salt)) * (0.5 + 0.5 * Math.cos(t * 3 - salt * 0.7));
      rows.forEach(([out, height], r) => {
        // the ellipse's outward normal carries the row's offset
        const nx = ct / a, nz = st / b, nl = Math.hypot(nx, nz) || 1;
        const lx = a * ct + (nx / nl) * out, lz = b * st + (nz / nl) * out;
        const px = rec.x + ax * lx + bx * lz, pz = rec.z + az * lx + bz * lz;
        pos.push(px, field.getHeightAt(px, pz) + (r === 1 ? height * lump : height), pz);
        const wet = r === 0 ? 0.75 : r === 1 ? 1 : 0.88;
        col.push(0.062 * wet, 0.047 * wet, 0.032 * wet);
      });
    }
    for (let k = 0; k < segs; k++) {
      for (let r = 0; r < rows.length - 1; r++) {
        const i0 = base + k * rows.length + r, i1 = i0 + 1, j0 = i0 + rows.length, j1 = j0 + 1;
        idx.push(i0, j0, i1, i1, j0, j1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  // wound to face up whichever way the plan turns
  const n = geometry.attributes.normal;
  let up = 0;
  for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) {
    const ix = geometry.index!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; }
    geometry.computeVertexNormals();
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'props-boat-mud-rims';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
