/**
 * textureUploadStaging.ts — (2026-10-26, the room-stalls lane) a scene's texture uploads spread across frames before
 * its first draw.
 *
 * three uploads a texture the first time a draw binds it (WebGLTextures.setTexture2D inside renderBufferDirect), so a
 * warm render that meets a battlefield's textures for the first time uploads all of them in one task: the 257 rooms
 * census found the room entry's longest task, 1.5 s, was 713 ms of texSubImage2D in the opening warm's one render, and
 * after the battlefield drew a cohort at a time a single cohort still held 1033 ms of it. This stage hands each texture
 * the draws will bind to renderer.initTexture, one at a time, under a frame budget, so the draws that follow meet
 * resident textures and no task holds more than the largest single upload.
 *
 * The textures a draw binds are its material's own maps and, once its program is compiled, the uniforms three keeps
 * for it (renderer.properties: the material's uniforms after its onBeforeCompile, where a kit's terrain, water and
 * foliage samplers live) and a ShaderMaterial's own uniforms. Render-target, depth and framebuffer textures are the
 * renderer's attachments, never uploaded: they are left out. A texture shared by many materials is staged once, and
 * one whose upload throws is left to its first draw, as before.
 */
import type { Material, Object3D, Texture, WebGLRenderer } from 'three';
import { createGpuCatchUpGate, type GpuCatchUpGate } from './gpuCatchUp.ts';

/** What the stage needs of the renderer: initTexture, and the per-material state three keeps once a program compiled. */
export type TextureStagingRenderer = Pick<WebGLRenderer, 'initTexture'> & { properties?: { get(object: object): unknown } };

type CompiledMaterialState = { uniforms?: Record<string, { value?: unknown } | undefined> } | undefined;

/**
 * (2026-10-26, the room A/B) an upload behind a GPU process that has fallen behind waits for it in the upload call: the
 * base build's first large texture took 1.3-1.7 s in most seats (a 512² particle atlas, a 2048×1024 smoke bitmap). With
 * a context, a texture of `minBytes` or more waits, a frame at a time and at most `maxWaitFrames`, until the GPU has
 * done everything issued before it (gpuCatchUp.ts: a fresh gate's first call marks the queue, its next ones answer once
 * the GPU passed the mark).
 */
export interface UploadCatchUp {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  waitFrame: () => Promise<unknown>;
  /** the gate maker (tests); gpuCatchUp.ts createGpuCatchUpGate */
  createGate?: (gl: WebGLRenderingContext | WebGL2RenderingContext) => GpuCatchUpGate;
  minBytes?: number;
  maxWaitFrames?: number;
}

/** The bytes a texture's upload carries (its level 0, four bytes a texel where the source is an image). */
export function textureUploadBytes(texture: Texture): number {
  const image = texture.image as { data?: { byteLength?: number }; width?: number; height?: number } | null | undefined;
  if (!image) return 0;
  if (image.data && typeof image.data.byteLength === 'number') return image.data.byteLength;
  return (image.width ?? 0) * (image.height ?? 0) * 4;
}

/** Wait, a frame at a time and at most `maxWaitFrames`, until the GPU has done everything issued so far. */
export async function waitForGpuCatchUp({ gl, waitFrame, maxWaitFrames = 30, createGate = createGpuCatchUpGate }: UploadCatchUp): Promise<number> {
  const gate = createGate(gl);
  let frames = 0;
  try {
    // (the first call only places the mark; a context without fences answers caught up at once)
    while (frames < maxWaitFrames && !gate.caughtUp()) { await waitFrame(); frames += 1; }
  } finally { gate.dispose(); }
  return frames;
}

export interface TextureStagingResult {
  /** distinct textures the scene's draws bind */
  textures: number;
  /** wall time of the whole stage and of its longest single upload (ms) */
  totalMs: number;
  maxMs: number;
  /** frames spent waiting for the GPU before the large uploads (a gated stage) */
  catchUpFrames?: number;
}

type MaybeTexture = Texture & { isRenderTargetTexture?: boolean; isDepthTexture?: boolean; isFramebufferTexture?: boolean };

function stageable(value: unknown): value is Texture {
  const texture = value as MaybeTexture | null;
  return !!texture && typeof texture === 'object' && texture.isTexture === true
    && !texture.isRenderTargetTexture && !texture.isDepthTexture && !texture.isFramebufferTexture;
}

function collectValue(value: unknown, into: Set<Texture>): void {
  if (stageable(value)) { into.add(value); return; }
  if (Array.isArray(value)) for (const item of value) if (stageable(item)) into.add(item);
}

function collectUniforms(uniforms: Record<string, { value?: unknown } | undefined> | null | undefined, into: Set<Texture>): void {
  if (!uniforms || typeof uniforms !== 'object') return;
  for (const uniform of Object.values(uniforms)) if (uniform && typeof uniform === 'object') collectValue(uniform.value, into);
}

/** Every texture the draws under `roots` bind, as far as the materials and the compiled programs' uniforms name them. */
export function collectDrawnTextures(renderer: TextureStagingRenderer, roots: readonly (Object3D | null | undefined)[],
  into: Set<Texture> = new Set()): Set<Texture> {
  const seen = new Set<Material>();
  const visit = (material: Material): void => {
    if (seen.has(material)) return;
    seen.add(material);
    for (const value of Object.values(material)) collectValue(value, into);
    collectUniforms((material as Material & { uniforms?: Record<string, { value?: unknown }> }).uniforms, into);
    collectUniforms((renderer.properties?.get(material) as CompiledMaterialState)?.uniforms, into);
  };
  for (const root of roots) {
    root?.traverse((object) => {
      const material = (object as Object3D & { material?: Material | Material[] }).material;
      if (Array.isArray(material)) material.forEach(visit);
      else if (material) visit(material);
    });
  }
  return into;
}

/**
 * Upload every texture the draws under `roots` bind, one at a time, yielding to `yieldForBudget` after each (a frame
 * budget yielder: it gives a frame back once the slice's budget is spent).
 */
export async function stageTextureUploads(renderer: TextureStagingRenderer, roots: readonly (Object3D | null | undefined)[],
  yieldForBudget: () => Promise<unknown>,
  options: { now?: () => number; signal?: AbortSignal; catchUp?: UploadCatchUp | null } = {}): Promise<TextureStagingResult> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const textures = collectDrawnTextures(renderer, roots);
  const catchUp = options.catchUp ?? null, minBytes = catchUp?.minBytes ?? 1 << 20;
  let maxMs = 0, catchUpFrames = 0;
  for (const texture of textures) {
    options.signal?.throwIfAborted();
    if (catchUp && textureUploadBytes(texture) >= minBytes) catchUpFrames += await waitForGpuCatchUp(catchUp);
    options.signal?.throwIfAborted();
    const at = now();
    try { renderer.initTexture(texture); } catch { /* the first draw remains the fallback */ }
    maxMs = Math.max(maxMs, now() - at);
    await yieldForBudget();
  }
  return { textures: textures.size, totalMs: Math.round(now() - startedAt), maxMs: Math.round(maxMs),
    ...(catchUp ? { catchUpFrames } : {}) };
}
