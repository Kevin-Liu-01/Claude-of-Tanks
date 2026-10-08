/**
 * Static shadow-caster cache per cascade (2026-10-02, the frame-budget lane, plan item P20).
 *
 * Every cascade the scheduler renders used to redraw every caster: the terrain, the forests, the prop buckets
 * and the structures as well as the tanks. The world's casters do not move: map.ts freezes the world root's
 * matrices after the build (`userData.matrixTraversalFrozen`), and everything that does change in it goes
 * through instance buffers, visibility, geometry swaps or caster masks. So each cascade keeps a copy of its
 * static depth — the world root's casters alone, rendered from the cascade's snapped light pose — and a frame
 * that keeps the pose and the content only copies that depth into the live map and draws the DYNAMIC casters
 * on top: every scene child that is not a frozen world root (the hulls, wrecks, effects, the cloud gobos, the
 * front beyond the edge, objectives), plus any world caster this module saw changing on consecutive frames
 * (a moored hull's bob, a toppling pole, a falling tree, loose clutter), which stays dynamic until it has been
 * still for a second.
 *
 * Correctness does not rest on knowing those systems: every frame `lighting.update()` hashes the static
 * content (per caster: visibility, layers, cast flag, geometry and draw range, materials and versions, the
 * world matrix, instance count and every instanced attribute's version, the router's static and dynamic
 * cascade masks — what three's shadow traversal reads), and any difference re-renders every cascade's static
 * layer. A cascade re-renders its layer when its snapped light pose (position, target, box, near/far, map size)
 * differs from the one its copy was rendered with — so the sun and the cascade snaps are covered by the pose —
 * or when its map was reallocated. The copy is a depth blit (`renderer.copyTextureToTexture` of the two depth
 * textures); the dynamic pass renders into the live map with `renderer.clear` suppressed.
 *
 * Only a cascade whose snapped pose has held for STATIC_SHADOW_SETTLE_FRAMES frames goes through the cache. A camera
 * on the move re-snaps nearly every cascade every frame (the 2026-10-02 flicker runs, driving and turning: 315 of
 * 315 cascade renders were re-renders, none a reuse), and a re-render costs the ordinary render plus the copy and a
 * second pass, so a moving cascade renders the ordinary way and the cache takes over once it holds still: a parked
 * or aiming hull, the overview, a held sniper view.
 *
 * The cache is armed per frame by `lighting.update()` (`beginFrame`) and each cascade is consumed once: a second
 * render in the same frame, the deployment warm, the covered shadow prime, a forced lighting update (every cascade
 * redrawn, so the copies are stale: a shot-mode page forces every frame) and every path that does not run the
 * lighting update renders the ordinary way. Off: the phones (memory), `__SHADOW_DEBUG.noStaticCache`, no
 * frozen world root in the scene, a failed blit (fails open for the session).
 */
import * as THREE from 'three';
import { shadowCasterCascadesOf, shadowCasterDynamicMaskOf } from './renderLayers.ts';

type ShadowRender = (lights: THREE.Object3D[], scene: THREE.Scene, camera: THREE.Camera) => void;

/** Frames a promoted world caster must hold still before it rejoins the static layer. */
export const STATIC_SHADOW_DEMOTE_FRAMES = 60;
/** Consecutive changed frames that make a world caster dynamic (one change is a single re-render). */
export const STATIC_SHADOW_PROMOTE_FRAMES = 2;
/** Frames a cascade's snapped pose must hold before the cache renders it (a moving cascade renders the ordinary way). */
export const STATIC_SHADOW_SETTLE_FRAMES = 2;
const POSE_FIELDS = 13;

// ------------------------------------------------------------------------------------------------- pure parts

/** The snapped light pose a cascade's static copy belongs to: position, target, box, near/far, map size. */
export function writeCascadePose(light: {
  position: { x: number; y: number; z: number };
  target: { position: { x: number; y: number; z: number } };
  shadow: { camera: { left: number; right: number; top: number; bottom: number; near: number; far: number }; mapSize: { x: number } };
}, out: Float64Array): Float64Array {
  const c = light.shadow.camera;
  out[0] = light.position.x; out[1] = light.position.y; out[2] = light.position.z;
  out[3] = light.target.position.x; out[4] = light.target.position.y; out[5] = light.target.position.z;
  out[6] = c.left; out[7] = c.right; out[8] = c.top; out[9] = c.bottom; out[10] = c.near; out[11] = c.far;
  out[12] = light.shadow.mapSize.x;
  return out;
}

export function samePose(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < POSE_FIELDS; i++) if (a[i] !== b[i]) return false;
  return true;
}

type CascadePlan = 'full' | 'rebuild' | 'reuse';

/**
 * One cascade's decision. `full`: render the ordinary way (cache off for this render; also while the cascade's pose
 * is still moving). `rebuild`: render the static layer, copy it, then the dynamic pass. `reuse`: the copy and the
 * dynamic pass.
 */
export function planCascade(input: {
  armed: boolean; hasTarget: boolean; settled: boolean; slotValid: boolean; poseSame: boolean; contentSame: boolean; forced: boolean;
}): CascadePlan {
  if (!input.armed || !input.hasTarget || !input.settled) return 'full';
  if (input.forced || !input.slotValid || !input.poseSame || !input.contentSame) return 'rebuild';
  return 'reuse';
}

/**
 * Promotion bookkeeping of one world caster across frames (pure): a caster that changed on PROMOTE consecutive frames
 * becomes dynamic; a dynamic caster still for DEMOTE frames becomes static again.
 */
interface CasterMotionRecord {
  sig: number; changedRun: number; stillRun: number; dynamic: boolean;
  /** The caster's part signatures at its last change (casterSignatureParts): what changed, named for the frame record. */
  parts?: Uint32Array;
}
export function stepCasterMotion(record: CasterMotionRecord, sig: number): 'none' | 'changed' | 'promote' | 'demote' {
  const changed = sig !== record.sig;
  record.sig = sig;
  if (changed) {
    record.changedRun++;
    record.stillRun = 0;
    if (!record.dynamic && record.changedRun >= STATIC_SHADOW_PROMOTE_FRAMES) { record.dynamic = true; return 'promote'; }
    return record.dynamic ? 'none' : 'changed';
  }
  record.changedRun = 0;
  record.stillRun++;
  if (record.dynamic && record.stillRun >= STATIC_SHADOW_DEMOTE_FRAMES) { record.dynamic = false; return 'demote'; }
  return 'none';
}

// ------------------------------------------------------------------------------------------------- hashing

const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);
const mix = (h: number, v: number): number => Math.imul(h ^ (v | 0), 16777619) >>> 0;
const mixFloat = (h: number, v: number): number => { f32[0] = v; return mix(h, i32[0]); };

type CasterLike = THREE.Object3D & {
  isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isInstancedMesh?: boolean; isBatchedMesh?: boolean;
  geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[];
  customDepthMaterial?: THREE.Material; count?: number; instanceMatrix?: THREE.BufferAttribute;
};

function mixMaterial(h: number, m: THREE.Material | undefined): number {
  if (!m) return mix(h, 0);
  h = mix(h, (m as THREE.Material & { readonly id: number }).id);
  h = mix(h, m.version);
  return mix(h, m.visible ? 1 : 2);
}

/** What changed in a caster, by its part signatures (casterSignatureParts' order). */
const PART_KINDS = ['flags', 'geometry', 'material', 'matrix', 'instances'] as const;
const PARTS = PART_KINDS.length;
const scratchParts = new Uint32Array(PARTS);

/**
 * What three's shadow traversal reads from one caster, in five part signatures: its flags (identity, layers, the cast
 * and culling flags, the router's cascade masks), its geometry (identity, draw range, the index and the position and
 * instanced streams' versions), its materials (identity, version, visibility), its world matrix and its instances.
 */
export function casterSignatureParts(object: CasterLike, out: Uint32Array): Uint32Array {
  let h = 2166136261;
  h = mix(h, object.id);
  h = mix(h, object.layers.mask);
  h = mix(h, object.castShadow ? 1 : 2);
  h = mix(h, object.frustumCulled ? 1 : 2);
  const staticMask = shadowCasterCascadesOf(object);
  if (staticMask !== null) h = mix(h, staticMask);
  const dynamicMask = shadowCasterDynamicMaskOf(object);
  if (dynamicMask !== null) h = mix(h, dynamicMask);
  out[0] = h;
  h = 2166136261;
  const g = object.geometry;
  if (g) {
    h = mix(h, g.id);
    h = mix(h, g.drawRange.start);
    h = mix(h, Number.isFinite(g.drawRange.count) ? g.drawRange.count : -1);
    if (g.index) h = mix(h, g.index.version);
    const attributes = g.attributes as Record<string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute>;
    for (const key in attributes) {
      const attribute = attributes[key] as THREE.BufferAttribute & { isInstancedBufferAttribute?: boolean };
      // positions (an in-place rewrite) and every instanced stream (fades, flex, offsets) reach the depth pass
      if (key === 'position' || attribute.isInstancedBufferAttribute) h = mix(h, attribute.version ?? 0);
    }
  }
  out[1] = h;
  h = 2166136261;
  const m = object.material;
  if (Array.isArray(m)) for (let i = 0; i < m.length; i++) h = mixMaterial(h, m[i]);
  else h = mixMaterial(h, m);
  if (object.customDepthMaterial) h = mixMaterial(h, object.customDepthMaterial);
  out[2] = h;
  h = 2166136261;
  const e = object.matrixWorld.elements;
  for (let i = 0; i < 16; i++) h = mixFloat(h, e[i]);
  out[3] = h;
  h = 2166136261;
  if (object.isInstancedMesh) {
    h = mix(h, object.count ?? 0);
    h = mix(h, object.instanceMatrix?.version ?? 0);
  }
  out[4] = h;
  return out;
}

/** What three's shadow traversal reads from one caster, as one 32-bit signature (its parts, combined). */
export function casterSignature(object: CasterLike): number {
  casterSignatureParts(object, scratchParts);
  let h = 2166136261;
  for (let i = 0; i < PARTS; i++) h = mix(h, scratchParts[i]);
  return h;
}

/** The first part that differs between two part signatures: what changed in a caster. */
function changedPart(before: Uint32Array, after: Uint32Array): string {
  for (let i = 0; i < PARTS; i++) if (before[i] !== after[i]) return PART_KINDS[i];
  return 'flags';
}

const isCaster = (o: CasterLike): boolean => !!(o.isMesh || o.isLine || o.isPoints);
const isProxy = (o: THREE.Object3D): boolean => o.userData?.cotCasterProxy === true;

/** Scene children whose subtrees are the static world (map.ts freezes the world root after its build). */
export function isStaticShadowRoot(object: THREE.Object3D): boolean {
  return object.userData?.matrixTraversalFrozen === true;
}

// ------------------------------------------------------------------------------------------------- runtime

interface CascadeSlot {
  target: THREE.WebGLRenderTarget | null;
  pose: Float64Array;
  /** The static copy exists for `pose` and `contentStamp`. */
  valid: boolean;
  contentStamp: number;
  /** The cascade's pose at the last lighting update, and the updates it has held since. */
  lastPose: Float64Array;
  steady: number;
  /** Armed for one render this frame. */
  armed: boolean;
}

interface ShadowStaticCacheTelemetry {
  enabled: boolean;
  frames: number;
  rebuilds: number[];
  reuses: number[];
  copies: number;
  /** Ordinary renders of an armed cascade whose pose had not held STATIC_SHADOW_SETTLE_FRAMES yet. */
  unsettled: number;
  /** Forced lighting updates: every cascade rendered the ordinary way, the copies left for one re-render after. */
  forcedFrames: number;
  fullRenders: number;
  contentChanges: number;
  promoted: number;
  promotions: number;
  demotions: number;
  staticCasters: number;
  hashMs: number;
  lastRebuildReason: string;
  /** Cascade re-renders by reason, and content changes by what changed (the frame records, summed). */
  reasons: Record<string, number>;
  contentKinds: Record<string, number>;
  failed: string | null;
  targetBytes: number;
}

/**
 * One lighting update's record (live, rewritten every frame, never allocated): what each cascade did, as bit masks over
 * the cascades, and why. Read it before the next update (the cost probes read it at the top of lighting.update()).
 */
interface ShadowStaticCacheFrame {
  /** The lighting update it belongs to. */
  frame: number;
  /** A forced frame (every cascade rendered the ordinary way; the copies are stale). */
  forced: boolean;
  /** The cascades the cache re-rendered (the static layer, the copy, the dynamic pass). */
  rebuildMask: number;
  /** The cascades that reused their static copy (the copy and the dynamic pass). */
  reuseMask: number;
  /** The cascades rendered the ordinary way while armed (no live map yet, or a pose still moving). */
  fullMask: number;
  /** Of those, the cascades whose snapped pose had not held STATIC_SHADOW_SETTLE_FRAMES yet. */
  unsettledMask: number;
  /** The cascades whose snapped pose moved at this update, the first field that moved (writeCascadePose order) and by how much. */
  moveMask: number;
  moveField: number;
  moveDelta: number;
  /** The first rebuild's reason: 'cold', 'pose', 'content', 'forced', 'disabled' or an invalidation's ('force', 'dispose'). */
  reason: string;
  /** For a pose rebuild, the first field that differs from the copy's pose, and by how much. */
  poseField: number;
  poseDelta: number;
  /** The static content changed at this update: what ('initial', 'insert', 'flags', 'geometry', 'material', 'matrix',
   * 'instances', 'demote', 'structure') and the first changed caster's name. */
  content: string;
  changed: string;
}

export interface ShadowStaticCache {
  /** lighting.update(): hash the static content and arm this frame's cascades. */
  beginFrame(input: { scene: THREE.Scene; lights: readonly THREE.DirectionalLight[]; forced: boolean; enabled: boolean }): void;
  /** The shadow router: render one cascade through the cache; false = render it the ordinary way. */
  renderCascade(renderer: CacheRenderer, render: ShadowRender, single: THREE.Object3D[], light: THREE.Object3D,
    cascadeIndex: number, scene: THREE.Scene, camera: THREE.Camera): boolean;
  /** Withdraw this frame's arming (a lighting update that renders no shadows). */
  disarm(): void;
  /** Drop every static copy (a new world, a forced refresh); the targets stay allocated. */
  invalidate(reason: string): void;
  /** Release the copies' GPU targets (context restore, disposal); they are re-created on demand. */
  dispose(): void;
  telemetry(): ShadowStaticCacheTelemetry;
  /** This frame's record (live; see ShadowStaticCacheFrame). */
  readonly frameRecord: ShadowStaticCacheFrame;
}

/** The renderer surface the cache uses (the router hands the live WebGLRenderer; receipts a recording stub). */
interface CacheRenderer {
  clear: (color?: boolean, depth?: boolean, stencil?: boolean) => void;
  copyTextureToTexture(src: THREE.Texture, dst: THREE.Texture): void;
  initRenderTarget?: (target: THREE.WebGLRenderTarget) => void;
}

const noClear = (): void => {};

export function createShadowStaticCache(): ShadowStaticCache {
  const slots: CascadeSlot[] = [];
  const scratchPose = new Float64Array(POSE_FIELDS);
  const motion = new WeakMap<THREE.Object3D, CasterMotionRecord>();
  const promoted = new Set<THREE.Object3D>();
  const promotedArray: THREE.Object3D[] = [];
  let promotedArrayDirty = true;
  const promotedList = (): THREE.Object3D[] => {
    if (promotedArrayDirty) { promotedArray.length = 0; for (const o of promoted) promotedArray.push(o); promotedArrayDirty = false; }
    return promotedArray;
  };
  let contentHash = 0;
  let contentStamp = 0;
  let frame = 0;
  let failed: string | null = null;
  // the partition for this frame: hidden in the static pass / hidden (or muted) in the dynamic pass
  const staticRoots: THREE.Object3D[] = [];
  const dynamicTop: THREE.Object3D[] = [];
  let cover: THREE.Object3D[] = [];
  let coverCasters: THREE.Object3D[] = [];
  let coverDirty = true;
  const stack: THREE.Object3D[] = [];
  const hidden: THREE.Object3D[] = [];
  const muted: THREE.Object3D[] = [];
  const stats: ShadowStaticCacheTelemetry = {
    enabled: false, frames: 0, rebuilds: [], reuses: [], copies: 0, unsettled: 0, forcedFrames: 0, fullRenders: 0, contentChanges: 0,
    promoted: 0, promotions: 0, demotions: 0, staticCasters: 0, hashMs: 0, lastRebuildReason: '', reasons: {}, contentKinds: {},
    failed: null, targetBytes: 0,
  };
  let rebuildReason = 'cold';
  const record: ShadowStaticCacheFrame = {
    frame: 0, forced: false, rebuildMask: 0, reuseMask: 0, fullMask: 0, unsettledMask: 0, moveMask: 0, moveField: -1, moveDelta: 0,
    reason: '', poseField: -1, poseDelta: 0, content: '', changed: '',
  };
  let hashedOnce = false;
  /** The first content change of this frame: what changed and in which caster. */
  const noteContent = (kind: string, object: THREE.Object3D | null): void => {
    if (record.content) return;
    record.content = kind;
    record.changed = object ? object.name || object.type : '';
  };

  function slotFor(index: number): CascadeSlot {
    let slot = slots[index];
    if (!slot) {
      slot = { target: null, pose: new Float64Array(POSE_FIELDS), valid: false, contentStamp: -1,
        lastPose: new Float64Array(POSE_FIELDS).fill(Number.NaN), steady: 0, armed: false };
      slots[index] = slot;
    }
    return slot;
  }

  function releaseTarget(slot: CascadeSlot): void {
    slot.target?.dispose();
    slot.target = null;
    slot.valid = false;
  }

  /** A depth target the live map's depth can be blitted to and from: same size, same 24-bit depth format. */
  function ensureTarget(renderer: CacheRenderer, slot: CascadeSlot, live: THREE.RenderTarget): THREE.WebGLRenderTarget {
    const { width, height } = live;
    if (slot.target && slot.target.width === width && slot.target.height === height) return slot.target;
    releaseTarget(slot);
    const depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    depthTexture.name = 'shadowStaticCache.depth';
    // the colour attachment is never written or read (the copy is depth only): one byte per texel
    const target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthTexture,
    });
    target.texture.name = 'shadowStaticCache.colour';
    renderer.initRenderTarget?.(target);
    slot.target = target;
    return target;
  }

  function hideAll(list: readonly THREE.Object3D[]): void {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
  }
  function muteAll(list: readonly THREE.Object3D[]): void {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.castShadow) continue;
      o.castShadow = false;
      muted.push(o);
    }
  }
  function restore(): void {
    for (let i = hidden.length - 1; i >= 0; i--) hidden[i].visible = true;
    hidden.length = 0;
    for (let i = muted.length - 1; i >= 0; i--) muted[i].castShadow = true;
    muted.length = 0;
  }

  /** The maximal static subtrees left once the promoted casters' paths are removed (the dynamic pass hides them). */
  function rebuildCover(): void {
    const marked = new Set<THREE.Object3D>();
    const roots = new Set(staticRoots);
    for (const object of promoted) {
      for (let n: THREE.Object3D | null = object; n && !marked.has(n); n = n.parent) {
        marked.add(n);
        if (roots.has(n)) break;
      }
    }
    const nextCover: THREE.Object3D[] = [];
    const nextCasters: THREE.Object3D[] = [];
    const walk: THREE.Object3D[] = [];
    for (const root of staticRoots) {
      if (!marked.has(root)) { nextCover.push(root); continue; }
      walk.push(root);
      while (walk.length) {
        const node = walk.pop()!;
        if (isCaster(node as CasterLike)) nextCasters.push(node);
        for (const child of node.children) {
          if (promoted.has(child)) continue;
          if (marked.has(child)) walk.push(child);
          else nextCover.push(child);
        }
      }
    }
    cover = nextCover;
    coverCasters = nextCasters;
    coverDirty = false;
    promotedArrayDirty = true;
  }

  const underStaticRoot = (object: THREE.Object3D): boolean => {
    for (let n: THREE.Object3D | null = object.parent; n; n = n.parent) if (staticRoots.includes(n)) return true;
    return false;
  };

  /** Hash the static world (every caster's signature, in traversal order) and run the promotion bookkeeping. */
  function hashStaticContent(): number {
    // the promoted casters first: back to the static layer once still (hashed below this same frame), out of the
    // set once gone from the world
    for (const object of promoted) {
      if (!underStaticRoot(object)) { promoted.delete(object); coverDirty = true; continue; }
      const record = motion.get(object)!;
      if (stepCasterMotion(record, casterSignature(object as CasterLike)) === 'demote') {
        promoted.delete(object); coverDirty = true; stats.demotions++;
        noteContent('demote', object);
      }
    }
    let h = 2166136261;
    let casters = 0;
    stack.length = 0;
    for (let i = staticRoots.length - 1; i >= 0; i--) stack.push(staticRoots[i]);
    while (stack.length) {
      const o = stack.pop()! as CasterLike;
      if (promoted.has(o)) continue;
      if (!o.visible) { h = mix(mix(h, o.id), 0x7fff); continue; }
      if (isProxy(o)) continue; // derived from its owner and the cascade's frustum
      if (isCaster(o) && o.castShadow) {
        const sig = casterSignature(o);
        let motionRecord = motion.get(o);
        if (!motionRecord) {
          motionRecord = { sig, changedRun: 0, stillRun: 0, dynamic: false, parts: Uint32Array.from(scratchParts) };
          motion.set(o, motionRecord);
          if (hashedOnce) noteContent('insert', o);
        } else {
          const step = stepCasterMotion(motionRecord, sig);
          if (step === 'changed' || step === 'promote') {
            if (motionRecord.parts) { noteContent(changedPart(motionRecord.parts, scratchParts), o); motionRecord.parts.set(scratchParts); }
            else { noteContent('flags', o); motionRecord.parts = Uint32Array.from(scratchParts); }
          }
          if (step === 'promote') {
            // moving on consecutive frames: dynamic from this frame on (its subtree draws with the dynamic layer)
            promoted.add(o);
            coverDirty = true;
            stats.promotions++;
            continue;
          }
        }
        h = mix(mix(h, o.id), sig);
        casters++;
      } else h = mix(h, o.id);
      const children = o.children;
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
    stats.staticCasters = casters;
    hashedOnce = true;
    return h;
  }

  function beginFrame({ scene, lights, forced, enabled }: { scene: THREE.Scene; lights: readonly THREE.DirectionalLight[]; forced: boolean; enabled: boolean }): void {
    frame++;
    record.frame = frame; record.forced = false;
    record.rebuildMask = 0; record.reuseMask = 0; record.fullMask = 0; record.unsettledMask = 0;
    record.moveMask = 0; record.moveField = -1; record.moveDelta = 0;
    record.reason = ''; record.poseField = -1; record.poseDelta = 0; record.content = ''; record.changed = '';
    const on = enabled && !failed;
    stats.enabled = on;
    for (let i = 0; i < lights.length; i++) {
      // how long each cascade's snapped pose has held (the poses are final when the lighting update calls this)
      const slot = slotFor(i);
      slot.armed = false;
      writeCascadePose(lights[i], scratchPose);
      if (samePose(scratchPose, slot.lastPose)) slot.steady++;
      else {
        if (!Number.isNaN(slot.lastPose[0])) {
          record.moveMask |= 1 << i;
          if (record.moveField < 0) {
            for (let k = 0; k < POSE_FIELDS; k++) {
              if (scratchPose[k] !== slot.lastPose[k]) { record.moveField = k; record.moveDelta = Math.abs(scratchPose[k] - slot.lastPose[k]); break; }
            }
          }
        }
        slot.lastPose.set(scratchPose);
        slot.steady = 0;
      }
    }
    if (!on) {
      if (contentStamp >= 0) { contentStamp++; rebuildReason = 'disabled'; }
      record.reason = 'disabled';
      return;
    }
    if (forced) {
      // a forced frame re-renders every cascade the ordinary way (2026-10-08, the perf lane): its copies are stale, and
      // re-rendering them through the cache (the static pass, the copy, the dynamic pass) pays the copy and a second pass
      // for a layer the next forced frame throws away — a shot-mode page forces every frame (mainFrameRuntime
      // renderShotFrame: lighting.update(true)), and there the cache cost 4.4 ms of GPU a frame over the plain render
      // (the map-vehicles lane's hold 12, Railyard and Alpine). The cache takes the cascades back once the frames are no
      // longer forced, with one re-render.
      contentStamp++;
      rebuildReason = 'forced';
      stats.forcedFrames++;
      record.forced = true;
      record.reason = 'forced';
      return;
    }
    staticRoots.length = 0;
    dynamicTop.length = 0;
    for (const child of scene.children) {
      if (isStaticShadowRoot(child)) staticRoots.push(child);
      else if (!(child as THREE.Light).isLight) dynamicTop.push(child);
    }
    if (!staticRoots.length) return;
    const started = performance.now();
    const previousPromoted = promoted.size;
    const firstHash = !hashedOnce;
    const h = hashStaticContent();
    if (coverDirty || promoted.size !== previousPromoted) rebuildCover();
    stats.hashMs = +(performance.now() - started).toFixed(3);
    stats.promoted = promoted.size;
    if (h !== contentHash) {
      contentHash = h;
      contentStamp++;
      stats.contentChanges++;
      rebuildReason = 'content';
      // a change no caster step named: the first hash ('initial'), else a visibility flip, a removal, a node moved
      if (!record.content) record.content = firstHash ? 'initial' : 'structure';
      stats.contentKinds[record.content] = (stats.contentKinds[record.content] || 0) + 1;
    } else {
      record.content = '';
      record.changed = '';
    }
    stats.frames++;
    for (let i = 0; i < lights.length; i++) slotFor(i).armed = true;
  }

  function copyDepth(renderer: CacheRenderer, from: THREE.RenderTarget, to: THREE.RenderTarget): boolean {
    try {
      renderer.copyTextureToTexture(from.depthTexture as THREE.Texture, to.depthTexture as THREE.Texture);
      stats.copies++;
      return true;
    } catch (error) {
      failed = String((error as Error)?.message || error);
      stats.failed = failed;
      return false;
    }
  }

  function renderCascade(
    renderer: CacheRenderer, render: ShadowRender, single: THREE.Object3D[], lightObject: THREE.Object3D,
    cascadeIndex: number, scene: THREE.Scene, camera: THREE.Camera,
  ): boolean {
    if (cascadeIndex < 0 || failed) return false;
    const slot = slots[cascadeIndex];
    if (!slot || !slot.armed) return false;
    const light = lightObject as THREE.DirectionalLight;
    const shadow = light.shadow;
    if (!shadow || (!shadow.autoUpdate && !shadow.needsUpdate)) return false;
    const live = shadow.map;
    slot.armed = false;
    if (!live || !(live.depthTexture as THREE.DepthTexture | null)?.isDepthTexture) {
      // three allocates the live map in this render: the copy starts on the next frame
      slot.valid = false;
      stats.fullRenders++;
      record.fullMask |= 1 << cascadeIndex;
      return false;
    }
    const target = ensureTarget(renderer, slot, live);
    writeCascadePose(light, scratchPose);
    const settled = slot.steady >= STATIC_SHADOW_SETTLE_FRAMES;
    const plan = planCascade({
      armed: true, hasTarget: !!target, settled, slotValid: slot.valid, poseSame: samePose(scratchPose, slot.pose),
      contentSame: slot.contentStamp === contentStamp, forced: false,
    });
    if (plan === 'full') {
      stats.fullRenders++;
      record.fullMask |= 1 << cascadeIndex;
      if (!settled) { stats.unsettled++; record.unsettledMask |= 1 << cascadeIndex; }
      return false;
    }
    if (plan === 'rebuild') {
      const reason = !slot.valid ? 'cold' : !samePose(scratchPose, slot.pose) ? 'pose' : rebuildReason;
      record.rebuildMask |= 1 << cascadeIndex;
      if (!record.reason) record.reason = reason;
      if (reason === 'pose' && record.poseField < 0) {
        for (let k = 0; k < POSE_FIELDS; k++) {
          if (scratchPose[k] !== slot.pose[k]) { record.poseField = k; record.poseDelta = Math.abs(scratchPose[k] - slot.pose[k]); break; }
        }
      }
      stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
      // the static layer: every dynamic caster hidden; three clears and renders the live map
      hideAll(dynamicTop);
      hideAll(promotedList());
      try { render(single, scene, camera); } finally { restore(); }
      if (!copyDepth(renderer, live, target)) {
        // fail open for the session: this frame renders the whole caster set the ordinary way
        slot.valid = false;
        shadow.needsUpdate = true;
        render(single, scene, camera);
        return true;
      }
      slot.pose.set(scratchPose);
      slot.contentStamp = contentStamp;
      slot.valid = true;
      stats.rebuilds[cascadeIndex] = (stats.rebuilds[cascadeIndex] || 0) + 1;
      stats.lastRebuildReason = reason;
      shadow.needsUpdate = true; // three clears it after every render; the dynamic pass renders the same light
    } else {
      if (!copyDepth(renderer, target, live)) { slot.valid = false; return false; }
      stats.reuses[cascadeIndex] = (stats.reuses[cascadeIndex] || 0) + 1;
      record.reuseMask |= 1 << cascadeIndex;
    }
    // the dynamic layer on top of the static depth: the static subtrees hidden, the live map not cleared
    if (coverDirty) rebuildCover();
    hideAll(cover);
    muteAll(coverCasters);
    const clear = renderer.clear;
    renderer.clear = noClear;
    try { render(single, scene, camera); } finally {
      renderer.clear = clear;
      restore();
    }
    return true;
  }

  function disarm(): void {
    for (const slot of slots) if (slot) slot.armed = false;
  }

  function invalidate(reason: string): void {
    contentStamp++;
    rebuildReason = reason;
    for (const slot of slots) if (slot) slot.valid = false;
  }

  function dispose(): void {
    for (const slot of slots) if (slot) releaseTarget(slot);
    invalidate('dispose');
  }

  function telemetry(): ShadowStaticCacheTelemetry {
    let bytes = 0;
    for (const slot of slots) if (slot?.target) bytes += slot.target.width * slot.target.height * 5;
    stats.targetBytes = bytes;
    return { ...stats, rebuilds: [...stats.rebuilds], reuses: [...stats.reuses], reasons: { ...stats.reasons }, contentKinds: { ...stats.contentKinds } };
  }

  return { beginFrame, renderCascade, disarm, invalidate, dispose, telemetry, frameRecord: record };
}
