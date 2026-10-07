/**
 * combat/mediaPool.ts — ring-buffered instanced pools of media puffs (combat-fx lane, 2026-10-05).
 *
 * The same contract as the battle pools (particles.ts Pool): a fixed capacity claimed round-robin, the CPU writes a
 * puff's attributes once at emit, dirty spans upload as at most two contiguous ranges per attribute at the frame's
 * flush (ranges ACCUMULATE across several fx steps between renders, as the Studio's stepped timeline needs), and a
 * shared clock uniform ages everything on the GPU. No per-frame allocation.
 */
import * as THREE from 'three';
import { MEDIA_LAYOUT } from './mediaShader.ts';

/** The inscribed radius of the media card (tile units): the sheets' content stays inside it. */
export const MEDIA_CARD_RADIUS = 0.41;

/** One puff's emit record. Recipes keep ONE of these and mutate it per emit (no allocation). */
export interface MediaPuff {
  px: number; py: number; pz: number;
  /** seconds relative to now (negative backdates, positive delays the birth) */
  birthOffset: number;
  vx: number; vy: number; vz: number;
  life: number;
  size0: number; size1: number; rot: number; rotVel: number;
  r0: number; g0: number; b0: number; alpha: number;
  r1: number; g1: number; b1: number; erode: number;
  drag: number; rise: number; windK: number; grav: number;
  growExp: number; flatten: number; fadeIn: number; fadeOut: number;
  seed: number; warp: number; stretch: number; scatter: number;
  heat: number; cool: number; burn: number; emissive: number;
}

export function makeMediaPuff(): MediaPuff {
  return {
    px: 0, py: 0, pz: 0, birthOffset: 0, vx: 0, vy: 0, vz: 0, life: 1,
    size0: 1, size1: 2, rot: 0, rotVel: 0,
    r0: 0.1, g0: 0.1, b0: 0.1, alpha: 1, r1: 0.1, g1: 0.1, b1: 0.1, erode: 0,
    drag: 1, rise: 0, windK: 1, grav: 0,
    growExp: 2, flatten: 1, fadeIn: 0.05, fadeOut: 0.5,
    seed: 0, warp: 0.12, stretch: 0, scatter: 0,
    heat: 0, cool: 1, burn: 1, emissive: 1,
  };
}

type AttrName = keyof typeof MEDIA_LAYOUT;
const ATTR_NAMES = Object.keys(MEDIA_LAYOUT) as AttrName[];

export class MediaPool {
  readonly capacity: number;
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly attrs: Record<AttrName, THREE.InstancedBufferAttribute>;
  private readonly arrays: Record<AttrName, Float32Array>;
  private cursor = 0;
  private highWater = 0;
  private dirtyStart = -1;
  private dirtyEnd = -1;
  private dirtyStart2 = -1;
  private dirtyEnd2 = -1;
  /** latest birth + life written (clock seconds): the late pass must run until then */
  liveUntil = -Infinity;

  constructor(name: string, capacity: number, material: THREE.ShaderMaterial) {
    this.capacity = capacity;
    // An octagon, not a quad: the sheets' lobe clusters never reach past a 0.37 radius of their tile (mediaAtlas.ts;
    // combatFx.selftest.mjs holds it under 0.4) and the warp fades out before the rim, so everything outside a 0.41
    // inscribed radius was always transparent — about half of every puff's fill for nothing.
    const geo = new THREE.InstancedBufferGeometry();
    const pos: number[] = [], uvs: number[] = [];
    const R = MEDIA_CARD_RADIUS / Math.cos(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      pos.push(x, y, 0);
      uvs.push(x + 0.5, y + 0.5);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7]);
    geo.instanceCount = 0;
    const attrs = {} as Record<AttrName, THREE.InstancedBufferAttribute>;
    const arrays = {} as Record<AttrName, Float32Array>;
    for (const key of ATTR_NAMES) {
      const array = new Float32Array(capacity * 4);
      const attr = new THREE.InstancedBufferAttribute(array, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(key, attr);
      attrs[key] = attr;
      arrays[key] = array;
    }
    this.attrs = attrs;
    this.arrays = arrays;
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  private dirty(i: number): void {
    if (this.dirtyStart < 0) { this.dirtyStart = i; this.dirtyEnd = i + 1; return; }
    if (i === this.dirtyEnd) { this.dirtyEnd = i + 1; return; }
    if (i + 1 === this.dirtyStart) { this.dirtyStart = i; return; }
    if (i < this.dirtyStart) {
      if (this.dirtyStart2 < 0) { this.dirtyStart2 = i; this.dirtyEnd2 = i + 1; }
      else { this.dirtyStart2 = Math.min(this.dirtyStart2, i); this.dirtyEnd2 = Math.max(this.dirtyEnd2, i + 1); }
      return;
    }
    this.dirtyEnd = Math.max(this.dirtyEnd, i + 1);
  }

  emit(o: MediaPuff, now: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (i + 1 > this.highWater) { this.highWater = i + 1; this.geometry.instanceCount = this.highWater; }
    const birth = now + o.birthOffset;
    const j = i * 4;
    const A = this.arrays;
    let a = A.aPB; a[j] = o.px; a[j + 1] = o.py; a[j + 2] = o.pz; a[j + 3] = birth;
    a = A.aVL; a[j] = o.vx; a[j + 1] = o.vy; a[j + 2] = o.vz; a[j + 3] = o.life;
    a = A.aSR; a[j] = o.size0; a[j + 1] = o.size1; a[j + 2] = o.rot; a[j + 3] = o.rotVel;
    a = A.aC0; a[j] = o.r0; a[j + 1] = o.g0; a[j + 2] = o.b0; a[j + 3] = o.alpha;
    a = A.aC1; a[j] = o.r1; a[j + 1] = o.g1; a[j + 2] = o.b1; a[j + 3] = o.erode;
    a = A.aDY; a[j] = o.drag; a[j + 1] = o.rise; a[j + 2] = o.windK; a[j + 3] = o.grav;
    a = A.aSH; a[j] = o.growExp; a[j + 1] = o.flatten; a[j + 2] = o.fadeIn; a[j + 3] = o.fadeOut;
    a = A.aMS; a[j] = o.seed; a[j + 1] = o.warp; a[j + 2] = o.stretch; a[j + 3] = o.scatter;
    a = A.aHT; a[j] = o.heat; a[j + 1] = o.cool; a[j + 2] = o.burn; a[j + 3] = o.emissive;
    if (birth + o.life > this.liveUntil) this.liveUntil = birth + o.life;
    this.dirty(i);
  }

  /** Commit this step's writes as one or two contiguous ranges per attribute (accumulating, never clearing). */
  flush(): void {
    if (this.dirtyStart < 0) return;
    for (const key of ATTR_NAMES) {
      const attr = this.attrs[key];
      attr.addUpdateRange(this.dirtyStart * 4, (this.dirtyEnd - this.dirtyStart) * 4);
      if (this.dirtyStart2 >= 0) attr.addUpdateRange(this.dirtyStart2 * 4, (this.dirtyEnd2 - this.dirtyStart2) * 4);
      attr.needsUpdate = true;
    }
    this.dirtyStart = this.dirtyEnd = this.dirtyStart2 = this.dirtyEnd2 = -1;
  }

  /** Age-preserving clock rebase: every live birth stamp moves with the clock. */
  shiftTime(delta: number): void {
    const pb = this.arrays.aPB, vl = this.arrays.aVL;
    for (let i = 0; i < this.highWater; i++) {
      if (vl[i * 4 + 3] <= 0) continue;
      pb[i * 4 + 3] += delta;
    }
    const attr = this.attrs.aPB;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, this.highWater * 4);
    attr.needsUpdate = true;
    if (Number.isFinite(this.liveUntil)) this.liveUntil += delta;
  }

  /** Kill every puff and reset the ring. */
  reset(): void {
    const vl = this.arrays.aVL;
    for (let i = 0; i < this.capacity; i++) vl[i * 4 + 3] = 0;
    const attr = this.attrs.aVL;
    attr.clearUpdateRanges();
    attr.needsUpdate = true;
    this.dirtyStart = this.dirtyEnd = this.dirtyStart2 = this.dirtyEnd2 = -1;
    this.cursor = 0;
    this.highWater = 0;
    this.geometry.instanceCount = 0;
    this.liveUntil = -Infinity;
  }

  /** Live-instance read for receipts: the attribute rows of instance i (copies into `out`). */
  read(i: number, out: Record<AttrName, number[]>): void {
    for (const key of ATTR_NAMES) {
      const a = this.arrays[key];
      out[key] = [a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]];
    }
  }

  get count(): number { return this.highWater; }
  get nextSlot(): number { return this.cursor; }
}
