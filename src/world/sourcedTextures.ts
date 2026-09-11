// src/world/sourcedTextures.ts — sourced CC0 PBR texture hookup (ambientCG /
// Poly Haven sets committed under public/textures/, see docs/ATTRIBUTION.md).
//
// Deep-hunt integration 2026-07: the terrain splat layers and the village
// building materials can be fed from downloaded PBR sets instead of the
// procedural canvas painters. Any image that fails to load simply leaves the
// procedural texture in place. Swaps keep the existing THREE.CanvasTexture
// object, so materials/uniform bindings and source-readiness ownership stay
// unchanged. Immutable building data may share a Source, never a UV owner.
//
// Contract notes:
// - terrain splat albedo packs ROUGHNESS IN ALPHA (terrain.js splat shader);
//   composeAlbedo honors that via opts.roughInAlpha.
// - terrain still multiplies AO into albedo because its splat shader owns the
//   material response; building props receive a separate packed AO/roughness
//   surface map (R=AO, G=roughness) for MeshStandardMaterial.

import * as THREE from 'three';
// MOBILE r1: central tier texture scale — the sourced photo-set composites
// below were the largest world textures left on the mobile tier (7-10 live
// 1024² albedo+normal canvases ≈ 40-70 MB). Desktop sizes are unchanged.
import { texSize } from '../engine/quality.ts';
import type { SourcedTextureResult } from './sourcedTextureReceipt.ts';
import { composeAlbedoPixels, composeSurfacePixels, type SourcedComposeOptions } from './sourcedTextureComposer.ts';
import { canComposeSourcedTextureInWorker, tryComposeSourcedTexture } from './sourcedTextureCompositionClient.ts';
import { replaceSourcedBuildingDataImage } from './sourcedBuildingDataSource.ts';

interface SourceTextureSet {
  color: string;
  normal: string;
  rough: string;
  ao: string;
}

type LayerKey = 'G' | 'D' | 'R' | 'M';
type BuildingBucket = 'plaster' | 'roof' | 'wood' | 'stone';
type Tint = readonly [number, number, number];

type ComposeOptions = SourcedComposeOptions;

interface TerrainPlanOptions extends ComposeOptions {
  set: keyof typeof SETS;
}

type TerrainPlanEntry = keyof typeof SETS | TerrainPlanOptions | null;
type TerrainPlan = Partial<Record<LayerKey, TerrainPlanEntry>>;

interface TextureLayer {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  surface?: THREE.Texture;
}

interface CompositeCacheEntry {
  setKey: keyof typeof SETS;
  roughMul: number;
  size: number;
  canvas: HTMLCanvasElement;
  surface: HTMLCanvasElement | null;
}

interface NormalCacheEntry {
  size: number;
  canvas: HTMLCanvasElement;
}

type BuildingTint = Tint | Pick<ComposeOptions, 'tint' | 'desat' | 'lift'>;

function isTint(value: BuildingTint): value is Tint {
  return Array.isArray(value);
}

const TT = '/textures/terrain';
const TB = '/textures/buildings';

// ambientCG 1K JPG naming
const acg = (dir: string, base: string): SourceTextureSet => ({
  color: `${dir}/${base}_1K-JPG_Color.jpg`,
  normal: `${dir}/${base}_1K-JPG_NormalGL.jpg`,
  rough: `${dir}/${base}_1K-JPG_Roughness.jpg`,
  ao: `${dir}/${base}_1K-JPG_AmbientOcclusion.jpg`,
});
// Poly Haven 1K JPG naming
const ph = (dir: string, base: string): SourceTextureSet => ({
  color: `${dir}/${base}_diff_1k.jpg`,
  normal: `${dir}/${base}_nor_gl_1k.jpg`,
  rough: `${dir}/${base}_rough_1k.jpg`,
  ao: `${dir}/${base}_ao_1k.jpg`,
});

const SETS = {
  grass: acg(TT, 'Grass004'),
  dryGrass: ph(TT, 'withered_grass'),
  dirt: acg(TT, 'Ground071'),
  sand: acg(TT, 'Ground093C'),
  snow: acg(TT, 'Snow010A'),
  rock: acg(TT, 'Rock058'),
  rockWarm: acg(TT, 'Rock063'),
  cobble: acg(TT, 'PavingStones046'),
  plaster: acg(TB, 'Plaster007'),
  roof: acg(TB, 'RoofingTiles012A'),
  wood: acg(TB, 'Planks023A'),
  brick: acg(TB, 'Bricks097'),
} satisfies Record<string, SourceTextureSet>;

// Per-map terrain layer plan (null = keep procedural layer). M (mud/marsh)
// stays procedural everywhere: its puddle/ice gloss response is authored into
// the procedural roughness field and drives uMarshGloss.
// Entries may be a set key or { set, tint, roughMul, desat, lift }: tint multiplies the
// albedo (Ground071 ships saturated orange — desaturated toward earth brown
// so dirt roads stop glowing against the graded grass), roughMul raises the
// packed roughness floor so sourced sets never reintroduce specular sheen.
const TERRAIN_PLAN = {
  verdant: {
    G: { set: 'grass', roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.82, 0.80, 0.76], roughMul: 1.3 },
    R: 'rock', M: null,
  },
  desert: {
    // G was 'dryGrass' (withered_grass photo set): its dense dark straw
    // mottle covered ~80% of the map and read as baked film-grain speckle
    // across every establishing shot. Sand-on-sand instead — the light base
    // is the open desert floor, the darker/warmer D variant shows through on
    // worn patches, and the ripple normals carry the surface character.
    // r7: sand albedo -7% — pairs with the desert.js sun drop (4.9 -> 4.15,
    // lighting r4) to pull the blown-out center valley off the tonemap
    // shoulder without going muddy
    // terrain_environment r3: another -8% — NOTE the desert.js grassTone cap
    // only reaches the procedural fallback; THIS tint is the real albedo of
    // the sourced Ground093C sand that renders. Pairs with the desert.js sun
    // 3.55 -> 3.30 + fog cut so the establishing midfield keeps texture.
    G: { set: 'sand', tint: [0.88, 0.845, 0.78], roughMul: 1.2 },
    D: { set: 'sand', tint: [0.74, 0.675, 0.58], roughMul: 1.25 },
    // r7: R stays PROCEDURAL (terrain.js makeSandstoneLayer). Rock063's wavy
    // metamorphic veining — magnified by the warm tint — was the swirly
    // "wet-sand" smear on every mesa/canyon wall; the procedural layer is
    // authored as true horizontal sedimentary strata instead.
    R: null, M: null,
  },
  winter: {
    G: { set: 'snow', roughMul: 1.15 },
    D: { set: 'dirt', tint: [0.74, 0.73, 0.72], roughMul: 1.3 },
    // snow-dusted rock: raw Rock058 is near-black here and punched dark
    // holes into the snowfield wherever a lake bank / cut slope got steep
    R: { set: 'rock', tint: [1.52, 1.55, 1.62], roughMul: 1.1 }, M: null,
  },
  urban: {
    G: { set: 'grass', tint: [0.92, 0.92, 0.88], roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.78, 0.77, 0.75], roughMul: 1.3 },
    // r6: warm the raw PavingStones046 sett (it ships cool grey and read as
    // canal water under the blue sky fill) and raise the roughness floor so
    // no residual sheen survives on the carriageway
    R: { set: 'cobble', tint: [1.0, 0.94, 0.84], roughMul: 1.45 }, M: null,
  },
  // maps r1 (ADDITIVE — new battlefields only; M stays procedural everywhere,
  // it carries the authored water/ice gloss response):
  coastal: {
    // maritime meadow: grass pulled toward wind-cured dune sward
    G: { set: 'grass', tint: [1.04, 0.99, 0.84], roughMul: 1.25 },
    // D doubles as the BEACH layer (the uSea shore apron + shoals sample it):
    // pale dry strand sand
    D: { set: 'sand', tint: [0.92, 0.87, 0.76], roughMul: 1.25 },
    R: { set: 'rock', tint: [1.06, 1.05, 1.02], roughMul: 1.15 }, M: null,
  },
  autumn: {
    // fall meadow: green grass multiplied toward olive-gold hay
    G: { set: 'grass', tint: [1.22, 1.04, 0.68], roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.84, 0.78, 0.70], roughMul: 1.3 },
    R: { set: 'rock', tint: [1.02, 1.0, 0.94], roughMul: 1.15 }, M: null,
  },
  steppe: {
    // the golden grassland IS the withered-grass set (its straw mottle reads
    // as cured feather-grass here; on desert sand it read as film grain).
    // r2: tint pulled DOWN toward olive-gold — at 1.06/0.98/0.80 the pale
    // straw set + warm sun rendered as orange desert sand, not grassland
    G: { set: 'dryGrass', tint: [0.80, 0.82, 0.58], roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.84, 0.78, 0.62], roughMul: 1.3 },
    // r3: Rock058 ships cool grey — sun-warm it so fold-crest rock reads as
    // dry earth/stone, not blue slag
    R: { set: 'rock', tint: [1.26, 1.12, 0.90], roughMul: 1.15 }, M: null,
  },
  railyard: {
    // brownfield: trodden grey-green verge grass, ash/cinder dirt, and the
    // R layer doubles as CONCRETE hardstand + road paving (uRoadTex)
    G: { set: 'grass', tint: [0.80, 0.78, 0.66], roughMul: 1.3 }, // r3: duller — read as mowed lawn
    D: { set: 'dirt', tint: [0.66, 0.64, 0.60], roughMul: 1.35 },
    R: { set: 'cobble', tint: [0.88, 0.88, 0.86], roughMul: 1.5 }, M: null,
  },
  // Map-quality expansion. Unknown ids intentionally fall back to Verdant,
  // so every new biome must route its sourced layers explicitly; otherwise
  // the async photo-set swap erases the authored procedural palette.
  frontier: {
    G: { set: 'grass', tint: [0.96, 0.94, 0.76], roughMul: 1.28 },
    D: { set: 'dirt', tint: [0.80, 0.75, 0.64], roughMul: 1.3 },
    R: { set: 'rock', tint: [1.02, 1.0, 0.92], roughMul: 1.15 }, M: null,
  },
  fjord: {
    G: { set: 'grass', tint: [0.76, 0.86, 0.80], roughMul: 1.28 },
    D: { set: 'dirt', tint: [0.68, 0.70, 0.68], roughMul: 1.35 },
    R: { set: 'rock', tint: [1.12, 1.17, 1.22], roughMul: 1.15 }, M: null,
  },
  delta: {
    G: { set: 'grass', tint: [0.68, 0.94, 0.60], roughMul: 1.22 },
    D: { set: 'dirt', tint: [0.67, 0.59, 0.43], roughMul: 1.28 },
    R: { set: 'rock', tint: [0.88, 0.94, 0.78], roughMul: 1.18 }, M: null,
  },
  badlands: {
    G: { set: 'sand', tint: [0.90, 0.68, 0.52], roughMul: 1.24 },
    D: { set: 'sand', tint: [0.70, 0.46, 0.36], roughMul: 1.28 },
    R: null, M: null,
  },
  monsoon: {
    G: { set: 'grass', tint: [0.57, 0.82, 0.58], roughMul: 1.22 },
    D: { set: 'dirt', tint: [0.59, 0.55, 0.44], roughMul: 1.3 },
    // Exposed washed-out banks need granular earth rather than Rock058's
    // directional veins, which comb into long streaks on these cut slopes.
    R: { set: 'dirt', tint: [0.62, 0.63, 0.54], desat: 0.65, roughMul: 1.3 }, M: null,
  },
  alpine: {
    G: { set: 'snow', roughMul: 1.15 },
    D: { set: 'dirt', tint: [0.70, 0.70, 0.71], roughMul: 1.32 },
    R: { set: 'rock', tint: [1.48, 1.53, 1.62], roughMul: 1.1 }, M: null,
  },
  caldera: {
    // Charcoal ash still needs a diffuse floor: near-black sourced cavities
    // multiplied by the old tints erased entire shadowed shelves after grade.
    G: { set: 'dirt', tint: [0.50, 0.47, 0.42], lift: 0.04, roughMul: 1.34 },
    D: { set: 'dirt', tint: [0.40, 0.38, 0.37], lift: 0.04, roughMul: 1.4 },
    R: { set: 'rock', tint: [0.52, 0.50, 0.49], lift: 0.04, roughMul: 1.2 }, M: null,
  },
  foundry: {
    G: { set: 'grass', tint: [0.66, 0.65, 0.56], roughMul: 1.32 },
    D: { set: 'dirt', tint: [0.52, 0.51, 0.48], roughMul: 1.38 },
    R: { set: 'cobble', tint: [0.76, 0.77, 0.76], roughMul: 1.52 }, M: null,
  },
} satisfies Record<string, TerrainPlan>;

export type TerrainPaletteId = keyof typeof TERRAIN_PLAN;

interface SourcedTerrainSettings {
  mudRough?: number;
  sourcedPalette?: TerrainPaletteId;
}

/** Explicit palette inheritance survives the asynchronous photo-texture swap. */
export function resolveSourcedTerrainPalette(
  mapId: string,
  settings: Pick<SourcedTerrainSettings, 'sourcedPalette'> = {},
): TerrainPaletteId {
  if (settings.sourcedPalette) return settings.sourcedPalette;
  return Object.hasOwn(TERRAIN_PLAN, mapId) ? mapId as TerrainPaletteId : 'verdant';
}

const _imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  if (!_imgCache.has(url)) {
    _imgCache.set(url, new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(`sourced texture missing: ${url}`));
      im.src = url;
    }));
  }
  return _imgCache.get(url)!;
}

// Readback-heavy AO and roughness decoding shares one opted-in scratch
// surface. Creating two fresh default contexts for every layer triggered the
// browser's Canvas2D readback slow-path and repeated allocations during map
// switches.
let _readbackCanvas: HTMLCanvasElement | null = null;
let _readbackCtx: CanvasRenderingContext2D | null = null;
let _readbackSize = 0;
function canvasContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Canvas2D is unavailable for sourced texture composition');
  return context;
}

function readScaledPixels(
  image: CanvasImageSource | null | undefined,
  size: number,
): Uint8ClampedArray | null {
  if (!image) return null;
  if (!_readbackCanvas) {
    _readbackCanvas = document.createElement('canvas');
    _readbackCtx = canvasContext(_readbackCanvas, { willReadFrequently: true });
  }
  if (_readbackSize !== size) {
    _readbackCanvas.width = size;
    _readbackCanvas.height = size;
    _readbackSize = size;
  }
  if (!_readbackCtx) throw new Error('Canvas2D readback context was not initialized');
  _readbackCtx.drawImage(image, 0, 0, size, size);
  return _readbackCtx.getImageData(0, 0, size, size).data;
}

function touchLru<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

// A recent battlefield's expensive color/AO/roughness composites survive a
// rematch without retaining the fork's 16 full-size canvases. Normals are
// cheaper but still reused for the four most recent source sets.
const _compositeCache = new Map<string, CompositeCacheEntry>();
const _normalCache = new Map<string, NormalCacheEntry>();
const COMPOSITE_CACHE_MAX = 8;
const NORMAL_CACHE_MAX = 4;

function compositeKey(setKey: string, opts: ComposeOptions = {}): string {
  const {
    roughInAlpha = false,
    separateSurface = false,
    roughMul = 1,
    tint = null,
    desat = 0,
    lift = 0,
  } = opts;
  return `${setKey}|${roughInAlpha ? 1 : 0}|${separateSurface ? 1 : 0}|${roughMul}|${tint ? tint.join(',') : '-'}|${desat}|${lift}`;
}

/**
 * Compose color * AO with roughness packed into alpha (terrain contract) or
 * alpha=255 (props). Returns a canvas sized to the color map (max 1024).
 */
export function composeAlbedo(
  color: HTMLImageElement,
  ao: HTMLImageElement | null,
  rough: HTMLImageElement | null,
  opts: ComposeOptions = {},
): HTMLCanvasElement {
  const s = Math.min(color.width, texSize(1024)); // MOBILE r1: tier-scaled compose
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = canvasContext(c, { willReadFrequently: true });
  ctx.drawImage(color, 0, 0, s, s);
  const px = ctx.getImageData(0, 0, s, s);
  const aod = readScaledPixels(ao, s);
  // Only the terrain splat shader consumes roughness through albedo alpha.
  // Building materials receive it through composeSurface(), so decoding it
  // here as well would repeat a full 1K readback for no output change.
  const rgd = opts.roughInAlpha ? readScaledPixels(rough, s) : null;
  composeAlbedoPixels(px.data, aod, rgd, opts);
  ctx.putImageData(px, 0, 0);
  return c;
}

/** Pack AO (red) and roughness (green) into one linear building surface map. */
export function composeSurface(
  ao: HTMLImageElement | null,
  rough: HTMLImageElement | null,
  size: number,
  roughMul = 1,
): HTMLCanvasElement {
  const aod = readScaledPixels(ao, size);
  const rgd = readScaledPixels(rough, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = canvasContext(c);
  const px = ctx.createImageData(size, size);
  composeSurfacePixels(px.data, aod, rgd, roughMul);
  ctx.putImageData(px, 0, 0);
  return c;
}

// Pigment variants share immutable AO/roughness pixels. Reuse only surfaces
// still owned by the bounded composite LRU; there is no second retention cache.
function findCachedSurface(
  setKey: keyof typeof SETS,
  size: number,
  roughMul: number,
): HTMLCanvasElement | null {
  for (const entry of _compositeCache.values()) {
    if (entry.surface && entry.setKey === setKey && entry.size === size
        && entry.roughMul === roughMul) return entry.surface;
  }
  return null;
}

function cachedSurface(
  setKey: keyof typeof SETS,
  ao: HTMLImageElement | null,
  rough: HTMLImageElement | null,
  size: number,
  roughMul: number,
): HTMLCanvasElement {
  return findCachedSurface(setKey, size, roughMul) ?? composeSurface(ao, rough, size, roughMul);
}

function normalCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const s = Math.min(img.width, texSize(1024)); // MOBILE r1: tier-scaled compose
  const c = document.createElement('canvas');
  c.width = c.height = s;
  canvasContext(c).drawImage(img, 0, 0, s, s);
  return c;
}

/** Swap a CanvasTexture's backing image in place (bindings stay valid). */
function swapTexture(tex: THREE.Texture, canvas: HTMLCanvasElement): void {
  // dispose FIRST (r3): once the texture has rendered a frame, the GL side
  // holds immutable storage at the procedural canvas size (512) — assigning
  // the 1024 sourced compose without disposing makes the sub-image upload
  // overflow (GL_INVALID_VALUE: glCopySubTextureCHROMIUM) and the swap
  // silently no-ops. This is why every map entered AFTER first render kept
  // procedural layers (desert's maroon rockTone walls) while the startup map
  // won the race and showed the sourced sets. dispose() re-allocates at the
  // new size on next use; material uniform bindings keep the same object.
  tex.dispose();
  tex.image = canvas;
  tex.needsUpdate = true;
}

interface LoadedTextureSet {
  color: HTMLImageElement | null;
  normal: HTMLImageElement | null;
  rough: HTMLImageElement | null;
  ao: HTMLImageElement | null;
  failures: string[];
}

async function loadSetImages(setKey: keyof typeof SETS): Promise<LoadedTextureSet> {
  const set = SETS[setKey];
  const failures: string[] = [];
  const source = (url: string): Promise<HTMLImageElement | null> => loadImage(url).catch((error) => {
    failures.push(error instanceof Error ? error.message : String(error));
    return null;
  });
  const [color, normal, rough, ao] = await Promise.all([
    source(set.color), source(set.normal),
    set.rough ? source(set.rough) : null,
    set.ao ? source(set.ao) : null,
  ]);
  return { color, normal, rough, ao, failures };
}

function composeSet(
  setKey: keyof typeof SETS,
  images: LoadedTextureSet,
  opts: ComposeOptions,
): { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; surface: HTMLCanvasElement | null } | null {
  const { color, normal, rough, ao } = images;
  if (!color || !normal) return null;
  const size = Math.min(color.width, texSize(1024));
  const separateSurface = !!opts.separateSurface;
  const cacheOpts = { ...opts, separateSurface };
  const key = compositeKey(setKey, cacheOpts);
  let composite = _compositeCache.get(key);
  if (!composite || composite.size !== size) {
    const roughMul = opts.roughMul ?? 1;
    composite = {
      setKey, roughMul, size,
      canvas: composeAlbedo(color, separateSurface ? null : ao, rough, opts),
      surface: separateSurface ? cachedSurface(setKey, ao, rough, size, roughMul) : null,
    };
  }
  touchLru(_compositeCache, key, composite, COMPOSITE_CACHE_MAX);
  let normalEntry = _normalCache.get(setKey);
  if (!normalEntry || normalEntry.size !== size) {
    normalEntry = { size, canvas: normalCanvas(normal) };
  }
  touchLru(_normalCache, setKey, normalEntry, NORMAL_CACHE_MAX);
  return { albedo: composite.canvas, normal: normalEntry.canvas, surface: composite.surface };
}

/** Async production builds opt in. Authoring and cache-hit composition retain
 * their synchronous path; cancellation is explicit, never inferred from a
 * Texture.dispose() event (which also represents temporary GPU suspension). */
export interface SourcedTextureApplicationOptions {
  worker?: boolean;
  signal?: AbortSignal;
}

export function adoptPixels(pixels: Uint8ClampedArray<ArrayBuffer>, size: number, albedo: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvasContext(canvas, albedo ? { willReadFrequently: true } : undefined);
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
  return canvas;
}

async function composeSetAsync(
  setKey: keyof typeof SETS,
  images: LoadedTextureSet,
  opts: ComposeOptions,
  signal?: AbortSignal,
): Promise<ReturnType<typeof composeSet>> {
  const { color, normal, ao, rough } = images;
  if (signal?.aborted || !color || !normal) return null;
  const size = Math.min(color.width, texSize(1024));
  const tint: Tint | null = opts.tint ? [opts.tint[0], opts.tint[1], opts.tint[2]] : null;
  const snapshot = { ...opts, tint };
  const key = compositeKey(setKey, snapshot);
  if (_compositeCache.get(key)?.size === size || !canComposeSourcedTextureInWorker()) {
    return composeSet(setKey, images, snapshot);
  }
  const roughMul = snapshot.roughMul ?? 1;
  const surface = snapshot.separateSurface ? findCachedSurface(setKey, size, roughMul) : null;
  try {
    const result = await tryComposeSourcedTexture({
      key: setKey, size, options: snapshot, includeSurface: !!snapshot.separateSurface && !surface,
      images: { color, ao, rough },
    }, signal);
    if (signal?.aborted) return null;
    // A synchronous consumer or a joined async consumer may have filled this
    // cache during the await. Never allocate a second canvas for that result.
    // Tier changes also must not publish an obsolete-size composition.
    if (_compositeCache.get(key)?.size === size || size !== Math.min(color.width, texSize(1024))) {
      return composeSet(setKey, images, snapshot);
    }
    if (result) {
      const canvas = adoptPixels(result.albedo, size, true);
      const surfaceCanvas = surface ?? (result.surface ? adoptPixels(result.surface, size, false) : null);
      touchLru(_compositeCache, key, {
        setKey, roughMul, size, canvas, surface: surfaceCanvas,
      }, COMPOSITE_CACHE_MAX);
    }
  } catch {
    // Unsupported/denied workers, bitmap conversion, protocol failures, and
    // adoption failures preserve the original composer, not a reduced asset.
  }
  if (signal?.aborted) return null;
  return composeSet(setKey, images, snapshot);
}

async function applySet(
  setKey: keyof typeof SETS,
  layer: TextureLayer,
  opts: ComposeOptions,
  application: SourcedTextureApplicationOptions = {},
  replaceData: typeof swapTexture = swapTexture,
): Promise<Pick<SourcedTextureResult, 'applied' | 'failures'>> {
  if (application.signal?.aborted) return { applied: false, failures: ['Source composition canceled'] };
  const images = await loadSetImages(setKey);
  if (application.signal?.aborted) return { applied: false, failures: [...images.failures, 'Source composition canceled'] };
  const options = { ...opts, separateSurface: !!layer.surface };
  const composed = application.worker
    ? await composeSetAsync(setKey, images, options, application.signal)
    : composeSet(setKey, images, options);
  if (application.signal?.aborted) return { applied: false, failures: [...images.failures, 'Source composition canceled'] };
  if (!composed) return { applied: false, failures: images.failures };
  swapTexture(layer.albedo, composed.albedo);
  if (layer.surface && composed.surface) replaceData(layer.surface, composed.surface);
  replaceData(layer.normal, composed.normal);
  return { applied: true, failures: images.failures };
}

async function sourceJob(
  target: string, set: keyof typeof SETS, layer: TextureLayer, opts: ComposeOptions,
  application: SourcedTextureApplicationOptions = {},
  replaceData: typeof swapTexture = swapTexture,
): Promise<SourcedTextureResult> {
  try {
    const result = await applySet(set, layer, opts, application, replaceData);
    if (result.failures.length) console.warn(`[sourcedTextures] ${target}: ${result.failures.join('; ')}`);
    return { target, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[sourcedTextures] ${target}: ${message}`);
    return { target, applied: false, failures: [message] };
  }
}

/**
 * Terrain hookup — called by createSplatMaterial after the procedural layers
 * exist. Swaps each layer's textures in place when loaded and exposes one
 * settlement promise so presentation snapshots cannot race the async swap.
 * @param {string} mapId map id ('verdant'|'desert'|'winter'|'urban')
 * @param {object} layers { G, D, R, M } of { albedo, normal } CanvasTextures
 * @param {object} S splat cfg (explicit sourced palette and M roughness multiplier)
 * Resolves with success/failure receipts after every requested layer settles.
 */
export function applySourcedTerrain(
  mapId: string,
  layers: Partial<Record<LayerKey, TextureLayer>>,
  S: SourcedTerrainSettings = {},
  application: SourcedTextureApplicationOptions = {},
): Promise<SourcedTextureResult[]> {
  const plan: TerrainPlan = TERRAIN_PLAN[resolveSourcedTerrainPalette(mapId, S)];
  const jobs: Array<Promise<SourcedTextureResult>> = [];
  for (const key of ['G', 'D', 'R', 'M'] as const) {
    const planEntry = plan[key];
    const layer = layers[key];
    if (!planEntry || !layer) continue;
    const entry: TerrainPlanOptions = typeof planEntry === 'string'
      ? { set: planEntry }
      : planEntry;
    const roughMul = (key === 'M' ? (S.mudRough ?? 1) : 1) * (entry.roughMul ?? 1);
    jobs.push(sourceJob(`terrain ${mapId}/${key}`, entry.set, layer, {
      roughInAlpha: true, roughMul, tint: entry.tint || null,
      desat: entry.desat ?? 0, lift: entry.lift ?? 0,
    }, application));
  }
  return Promise.all(jobs);
}

export interface TerrainSourcePreparation {
  /** Image IO only: callers never need to await this to start building. */
  ready: Promise<void>;
  /** Async terrain alone requests an already-loaded layer at its checkpoint. */
  prepareLayer?(key: LayerKey): Promise<void>;
  tryCreateLayer(key: LayerKey, anisotropy: number): TextureLayer | null;
  apply(layers: Partial<Record<LayerKey, TextureLayer>>): Promise<SourcedTextureResult[]>;
  /** Final build/world cancellation, never temporary GPU suspension. */
  cancel(): void;
}

interface PreparedTerrainEntry {
  set: keyof typeof SETS;
  opts: ComposeOptions;
  images: LoadedTextureSet | null;
  composed: ReturnType<typeof composeSet>;
  created: WeakSet<TextureLayer>;
}

function sourcedCanvasTexture(
  canvas: HTMLCanvasElement, anisotropy: number, srgb: boolean,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Async map builds overlap source downloads with height/horizon preparation.
 * Source IO alone never composes. Async consumers opt into per-layer worker
 * checkpoints, only for already-settled images; pending IO retains the original
 * procedural painter and source-readiness swap. Prepared output is CPU canvas
 * data, not a speculative Texture owner. Authoring remains synchronous.
 */
export function prepareSourcedTerrain(
  mapId: string, settings: SourcedTerrainSettings = {},
  { worker = false }: Pick<SourcedTextureApplicationOptions, 'worker'> = {},
): TerrainSourcePreparation {
  const plan: TerrainPlan = TERRAIN_PLAN[resolveSourcedTerrainPalette(mapId, settings)];
  const entries = new Map<LayerKey, PreparedTerrainEntry>();
  const jobs: Promise<void>[] = [];
  const abort = new AbortController();
  const application = { worker, signal: abort.signal };
  for (const key of ['G', 'D', 'R', 'M'] as const) {
    const value = plan[key];
    if (!value) continue;
    const entry = typeof value === 'string' ? { set: value } : value;
    const prepared: PreparedTerrainEntry = {
      set: entry.set,
      opts: {
        roughInAlpha: true,
        roughMul: (entry.roughMul ?? 1) * (key === 'M' ? settings.mudRough ?? 1 : 1),
        tint: entry.tint || null, desat: entry.desat ?? 0, lift: entry.lift ?? 0,
      },
      images: null, composed: null, created: new WeakSet(),
    };
    entries.set(key, prepared);
    jobs.push(loadSetImages(entry.set).then((images) => { prepared.images = images; }, () => {
      // The legacy source job reports construction/Canvas failures if used.
      // Merely prefetching must neither reject nor replace the fallback.
    }));
  }
  return {
    ready: Promise.all(jobs).then(() => {}),
    ...(worker ? { async prepareLayer(key: LayerKey): Promise<void> {
      const entry = entries.get(key);
      if (!entry?.images || abort.signal.aborted) return;
      try {
        const composed = await composeSetAsync(entry.set, entry.images, entry.opts, abort.signal);
        if (!abort.signal.aborted) entry.composed = composed;
      } catch {
        // The same source job below owns reporting and the exact fallback.
      }
    } } : {}),
    tryCreateLayer(key, anisotropy) {
      const entry = entries.get(key);
      if (!entry?.images || abort.signal.aborted) return null;
      // A failed source composition must retain the same fallback policy as
      // sourceJob, not turn an optional image into a map-loading failure.
      let composed: ReturnType<typeof composeSet>;
      try { composed = worker ? entry.composed : composeSet(entry.set, entry.images, entry.opts); }
      catch { return null; }
      if (!composed) return null;
      // A tier switch after the awaited checkpoint cannot publish old-size
      // output or reintroduce a synchronous cache miss in this constructor.
      if (worker && composed.albedo.width !== Math.min(entry.images.color!.width, texSize(1024))) return null;
      const layer = {
        albedo: sourcedCanvasTexture(composed.albedo, anisotropy, true),
        normal: sourcedCanvasTexture(composed.normal, anisotropy, false),
      };
      entry.created.add(layer);
      return layer;
    },
    apply(layers) {
      const pending: Partial<Record<LayerKey, TextureLayer>> = {};
      const direct: SourcedTextureResult[] = [];
      for (const key of ['G', 'D', 'R', 'M'] as const) {
        const layer = layers[key];
        const entry = entries.get(key);
        if (!abort.signal.aborted && layer && entry?.images && entry.created.has(layer)) {
          const target = `terrain ${mapId}/${key}`;
          const failures = entry.images.failures;
          if (failures.length) console.warn(`[sourcedTextures] ${target}: ${failures.join('; ')}`);
          direct.push({ target, applied: true, failures });
        } else if (layer) pending[key] = layer;
      }
      return applySourcedTerrain(mapId, pending, settings, application).then((late) =>
        [...direct, ...late].sort((a, b) =>
          'GDRM'.indexOf(a.target.slice(-1)) - 'GDRM'.indexOf(b.target.slice(-1))));
    },
    cancel() {
      abort.abort();
      for (const entry of entries.values()) entry.composed = null;
    },
  };
}

/**
 * Village building hookup — called by props.ts after the procedural building
 * textures exist. Same in-place swap contract as the terrain path.
 * @param {object} sets { plaster?, roof?, wood?, stone? } of { albedo, normal }
 * @param {string} mapId map id (urban swaps the stone bucket to brick)
 */
// Per-map albedo tints for the sourced building sets (multiplies RGB after
// AO) — the raw CC0 sets ignore cfg.props.tones, so urban kept terracotta
// roofs and desert adobe stayed white without these.
const FOUNDRY_BUILDING_TINTS = {
  plaster: { tint: [0.82, 0.71, 0.59], desat: 0.20 },
  roof: { tint: [0.62, 0.55, 0.52], desat: 0.44, lift: 0.018 },
  wood: { tint: [0.64, 0.54, 0.43], desat: 0.18 },
  stone: { tint: [0.94, 0.76, 0.62], desat: 0.18 },
} satisfies Partial<Record<BuildingBucket, BuildingTint>>;
const BUILDING_TINTS = {
  urban:  { plaster: { tint: [0.94, 0.86, 0.74], desat: 0.16 } }, // Steinburg lime render
  ruinspires: {
    plaster: { tint: [0.72, 0.62, 0.52], desat: 0.22 },
    wood: { tint: [0.62, 0.54, 0.44], desat: 0.24 },
  },
  blackglass: {
    plaster: { tint: [0.67, 0.59, 0.50], desat: 0.24 },
    roof: { tint: [0.56, 0.50, 0.47], desat: 0.36 },
    wood: { tint: [0.57, 0.50, 0.42], desat: 0.24 },
    stone: { tint: [0.72, 0.58, 0.47], desat: 0.16 },
  },
  skybridge: {
    plaster: { tint: [0.91, 0.75, 0.59], desat: 0.12 },
    roof: { tint: [0.72, 0.58, 0.50], desat: 0.22 },
    wood: [0.73, 0.61, 0.46], stone: [0.94, 0.73, 0.54],
  },
  desert: { plaster: [1.08, 0.92, 0.70], wood: [1.05, 0.95, 0.80] }, // sand-plaster adobe
  // r5 terrain_environment: winter roofs were still SATURATED ORANGE under a
  // deep-snow sky (critique) — the multiply tint cannot desaturate terracotta.
  // Cooled + 62% desaturated + lifted frost; the props.ts up-face snow-cap
  // shader lays the actual white load on the slopes.
  winter: { roof: { tint: [0.96, 1.02, 1.14], desat: 0.62, lift: 0.10 } },
  // maps r1 (ADDITIVE):
  coastal: { plaster: [1.04, 1.02, 0.96], wood: { tint: [0.82, 0.83, 0.84], desat: 0.30 } }, // whitewash + salt-silvered timber
  autumn:  { plaster: [1.02, 0.97, 0.88], wood: [0.94, 0.86, 0.74] },   // warm farm render + aged oak
  orchard: {
    plaster: [1.02, 0.97, 0.88], wood: [0.94, 0.86, 0.74],
    // Existing tile photograph, not an added sampler: restrained charcoal
    // roofing separates the cultivated valley from the red-roof farm maps.
    roof: { tint: [0.48, 0.53, 0.57], desat: 0.90, lift: 0.015 },
  },
  steppe:  { plaster: [1.06, 1.0, 0.86], wood: [1.0, 0.92, 0.78] },     // sun-baked khutor lime wash
  railyard: {
    plaster: { tint: [0.84, 0.83, 0.80], desat: 0.25 },                 // soot-dulled render
    // r3: both lifted — under the overcast fill the first-cut tints rendered
    // the halls as near-black chocolate slabs
    roof: { tint: [0.88, 0.90, 0.94], desat: 0.60, lift: 0.05 },        // weathered sheet grey
    wood: { tint: [0.78, 0.76, 0.72], desat: 0.20 },
    stone: { tint: [1.10, 0.98, 0.88], desat: 0.10 },                   // smoke-stained brick
  },
  frontier: { plaster: [1.0, 0.96, 0.86], wood: [0.92, 0.84, 0.70] },
  fjord: {
    plaster: [1.03, 1.04, 1.02],
    roof: { tint: [0.77, 0.84, 0.91], desat: 0.48, lift: 0.02 },
    wood: { tint: [0.72, 0.76, 0.78], desat: 0.38 },
  },
  delta: { plaster: [1.04, 0.96, 0.78], wood: [0.80, 0.70, 0.53] },
  badlands: { plaster: [1.08, 0.79, 0.58], wood: [0.83, 0.69, 0.52] },
  monsoon: { plaster: [0.78, 0.81, 0.72], wood: [0.67, 0.66, 0.54] },
  alpine: { roof: { tint: [0.94, 1.01, 1.14], desat: 0.68, lift: 0.11 } },
  caldera: {
    plaster: { tint: [0.65, 0.53, 0.42], desat: 0.26 },
    roof: { tint: [0.52, 0.43, 0.40], desat: 0.42 },
    wood: [0.57, 0.47, 0.36], stone: [0.71, 0.55, 0.42],
  },
  foundry: FOUNDRY_BUILDING_TINTS,
  // Ironworks opts into one masonry experiment; Copper Mesa still inherits
  // the exact foundry family above. Only the existing brick pigment changes.
  ironworks: {
    ...FOUNDRY_BUILDING_TINTS,
    stone: { tint: [0.80, 0.75, 0.70], desat: 0.34 },
  },
} satisfies Record<string, Partial<Record<BuildingBucket, BuildingTint>>>;

export type BuildingPaletteId = keyof typeof BUILDING_TINTS;

interface SourcedBuildingSettings {
  sourcedPalette?: BuildingPaletteId;
}

export function resolveSourcedBuildingPalette(
  mapId: string,
  settings: SourcedBuildingSettings = {},
): string {
  return settings.sourcedPalette ?? mapId;
}

export function sourcedBuildingTintPolicy(
  mapId: string,
  bucket: BuildingBucket,
): BuildingTint | null {
  if (!Object.hasOwn(BUILDING_TINTS, mapId)) return null;
  const palette: Partial<Record<BuildingBucket, BuildingTint>> = BUILDING_TINTS[mapId as BuildingPaletteId];
  return palette[bucket] ?? null;
}

export function applySourcedBuildings(
  sets: Partial<Record<BuildingBucket, TextureLayer>>,
  mapId: string,
  settings: SourcedBuildingSettings = {},
  application: SourcedTextureApplicationOptions = {},
): Promise<SourcedTextureResult[]> {
  // Inherit color policy only. The actual map keeps its existing sourced
  // buckets, texture dimensions, and procedural-roof exceptions.
  const paletteId = resolveSourcedBuildingPalette(mapId, settings);
  const plan: Partial<Record<BuildingBucket, keyof typeof SETS>> = {
    plaster: 'plaster', roof: 'roof', wood: 'wood',
  };
  // maps r1: the rail yard's industrial halls are brick like the town's
  if ((mapId === 'urban' || mapId === 'railyard' || mapId === 'foundry' || mapId === 'caldera'
      || mapId === 'ruinspires' || mapId === 'blackglass' || mapId === 'skybridge')
      && sets.stone) plan.stone = 'brick';
  // Steinburg and Ruinspires keep the PROCEDURAL roof sheet: their tone hooks
  // bake deliberately restrained roof families that a single sourced tint
  // cannot reproduce. This also prevents the raw orange tile set from
  // overriding Ruinspires' smoke-darkened roof policy.
  if (mapId === 'urban' || mapId === 'ruinspires') delete plan.roof;
  const jobs: Array<Promise<SourcedTextureResult>> = [];
  for (const [bucket, setKey] of Object.entries(plan)) {
    const bucketKey = bucket as BuildingBucket;
    const layer = sets[bucketKey];
    if (!layer || !setKey) continue;
    const tint = sourcedBuildingTintPolicy(paletteId, bucketKey);
    const opts: ComposeOptions = tint === null
      ? { tint: null }
      : isTint(tint) ? { tint } : tint;
    jobs.push(sourceJob(`building ${mapId}/${bucket}`, setKey, layer,
      { roughInAlpha: false, ...opts }, application, replaceSourcedBuildingDataImage));
  }
  return Promise.all(jobs);
}
