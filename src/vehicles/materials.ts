// src/vehicles/materials.ts — HD procedural camo + surface materials for tankFactory.
// Vehicles-internal (ARCHITECTURE §3.3.3). All albedo canvases are sRGB; every lit
// material passes through engineCtx.setupShadowMaterial.
// 2048px albedo with panel lines / weld seams / bolt rows / chips / rust streaks,
// plus a 1024px detail heightfield that generates matching normal + roughness maps.
// Expensive canvases are cached per spec id (shared between instances, refcounted).
// No top-level side effects — canvases are created inside createTankMaterials.

import * as THREE from 'three';
import { stockCamoPatternIdFor,
  AUTO_CAMO_BIOMES,
  CUSTOM_CAMO_ID,
  autoCamoBiomeId,
  autoCamoPatternIdFor,
  camoSuitsTheatre,
  customCamoPatternId,
  defaultCamoPatternId,
  hasSignatureCamo,
  isBuiltInCamoId,
  networkCamoId,
  normalizeCustomCamo,
  parseCustomCamoPatternId,
  sharedCamoPreset,
  signatureCamoPatternId,
} from './camoPolicy.ts';
import type { AutoCamoPatternId, AutoCamoVehicle, CamoPatternId, CustomCamo } from './camoPolicy.ts';
import { ALBEDO_SIZE, MAP_SIZE, createMaterialPainter } from './materialPainter.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';
import { catalogCamoArtId, fleetCamoArtId } from './catalogCamoPainter.ts';
import type { MaterialBasePaintRequest, MaterialVisual, PlateFeatures } from './materialPainter.ts';
import {
  canPaintMaterialBaseInWorker, tryPaintMaterialBase,
} from './materialPainterWorkerClient.ts';
import type { MaterialPainterResult } from './materialPainterWorkerClient.ts';
export {
  CLAUDE_CODE_MARK, CLAUDE_SPARK_MARK, fillHeightNormalRows, applyPatchRoughnessPixels,
} from './materialPainter.ts';
import { bindVehicleReadabilityUniform } from './vehicleReadability.ts';
import { VEHICLE_ALPHA_TAG } from '../engine/vehicleOcclusion.ts';

export {
  CAMO_CATALOG_PATTERN_IDS, CAMO_PATTERN_IDS, CAMO_PATTERN_LABEL, CUSTOM_CAMO_ID,
} from './camoPolicy.ts';
import { tagVehicleMaterial } from './appearanceAudit.ts';
import { liftSrgbToWheelFloor } from './wheelPaintFloor.ts';
import { drawNationalInsignia, drawTacticalNumber, vehicleMarkingRecord } from './vehicleMarkings.ts';
import type { VehicleMarkingRecord } from './vehicleMarkings.ts';
import { isPostwarVehicleEra } from './taxonomy.ts';
// MOBILE r1: central texture-resolution lever (quality.ts). Every canvas bake
// below allocates through texSize(): desktop tiers get the authored size
// unchanged; the mobile tier halves it and clamps to the device texture cap.
// The painters are all canvas.width-relative, so this is a pure resolution
// change — identical feature plan, quarter the pixels at scale 0.5.
import { texSize } from '../engine/quality.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

type Rng = () => number;
type Rgb = [number, number, number];
type MaterialTextureQuality = 'low' | 'ai' | 'preview' | 'high';
type MaterialPatternId = CamoPatternId | 'urban' | typeof CUSTOM_CAMO_ID | string;
type BakeYield = () => Promise<void> | void;

export interface SharedTextureLease {
  release(): void;
}

export interface MaterialTankSpec {
  id: string;
  nation?: string;
  era?: string;
  visual: MaterialVisual;
}

function requireMaterialTankSpec(value: RuntimeValue): MaterialTankSpec {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Vehicle material spec must be an object');
  }
  const spec = value as Partial<MaterialTankSpec>;
  if (typeof spec.id !== 'string'
      || spec.visual === null
      || typeof spec.visual !== 'object'
      || typeof spec.visual.base !== 'string') {
    throw new TypeError('Vehicle material spec requires an id and visual base color');
  }
  return spec as MaterialTankSpec;
}

type PaintableKind = 'wheels' | 'wheelsDark' | 'detail' | 'canvas';
interface PaintableRecord { m: THREE.MeshStandardMaterial; kind: PaintableKind }

interface SharedTextureEntry {
  refs: number;
  cacheKey: string;
  fixedPattern: boolean;
  spec: MaterialTankSpec;
  seed: number;
  feats: PlateFeatures | null;
  patternId: MaterialPatternId;
  paintable: Set<PaintableRecord>;
  quality: MaterialTextureQuality;
  camoCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  roughCanvas: HTMLCanvasElement;
  trackCanvas: HTMLCanvasElement;
  camoTex?: THREE.CanvasTexture;
  normalTex?: THREE.CanvasTexture;
  roughTex?: THREE.CanvasTexture;
  burntTex?: THREE.CanvasTexture | null;
  emberTex?: THREE.CanvasTexture | null;
  kitCanvas?: HTMLCanvasElement;
  kitTex?: THREE.CanvasTexture | null;
}

interface SharedTextureIdentity {
  key: string;
  patternId: MaterialPatternId;
  fixed: boolean;
}

interface CanvasTextureOptions {
  srgb?: boolean;
  aniso?: number;
  repeat?: boolean;
}

interface CamoApplyOptions {
  priorityIds?: readonly string[];
  onlySpecIds?: readonly string[];
}

interface ShadowEngineContext {
  anisotropy?: number;
  setupShadowMaterial?: <T extends THREE.Material>(
    material: T,
    extraHook?: typeof vehicleAmbientFloorHook,
  ) => T;
  releaseShadowMaterial?: (material: THREE.Material) => boolean;
}

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];

type BurnUniforms = ReturnType<typeof makeBurnUniforms>;

function canvas2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('2D canvas context is unavailable');
  return context;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Instantiation allocates no canvases; the existing DOM factory remains lazy.
const materialPainter = createMaterialPainter(makeCanvas);
const { mulberry32, hexToRgb, mix, scale3, paintCamo, paintRoughness, paintPatchRoughness, exposureTrim } = materialPainter;

// One track texture: 4 link rows per repeat, chevron/waffle grousers.
function paintTrack(rng: Rng): HTMLCanvasElement {
  const S = texSize(512); // shared/repeating track tile keeps the world-scale budget
  const c = makeCanvas(S, S);
  const ctx = canvas2d(c);
  // r3 (critic: Tiger "track links are bright sparkly silver-gray instead of
  // dark manganese steel", T-90M idler "navy-blue sparkle"): the old cool
  // blue-grey ramp read as polished silver under the field sun. Warm dark
  // manganese-iron ramp with an earth cast; wear highlights cut below.
  ctx.fillStyle = '#332f2a';
  ctx.fillRect(0, 0, S, S);
  const rows = 4, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    // link body shading
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0, '#494439');
    g.addColorStop(0.45, '#3a362e');
    g.addColorStop(0.5, '#211f1a');
    g.addColorStop(0.55, '#3c382f');
    g.addColorStop(1, '#302d26');
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 4, S, rh - 8);
    // pin gap + end-connector bumps
    ctx.fillStyle = '#0d0c0a';
    ctx.fillRect(0, y, S, 6);
    ctx.fillStyle = '#403c33';
    for (let x = 0; x < S; x += S / 8) ctx.fillRect(x + 4, y, S / 16, 5);
    // chevron grouser
    ctx.strokeStyle = '#524d40';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.72);
    ctx.lineTo(S * 0.5, y + rh * 0.3);
    ctx.lineTo(S * 0.92, y + rh * 0.72);
    ctx.stroke();
    ctx.strokeStyle = '#211f19';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(S * 0.08, y + rh * 0.78);
    ctx.lineTo(S * 0.5, y + rh * 0.36);
    ctx.lineTo(S * 0.92, y + rh * 0.78);
    ctx.stroke();
    // guide horn shadow (center)
    ctx.fillStyle = '#0f0e0b';
    ctx.fillRect(S * 0.46, y + rh * 0.15, S * 0.08, rh * 0.5);
    // wear highlights on contact ridge — dull burnished steel, not silver
    // sparkle (r3: alpha halved, count trimmed, warm dust tint)
    ctx.fillStyle = 'rgba(148,138,118,0.26)';
    for (let i = 0; i < 20; i++) ctx.fillRect(rng() * S, y + rh * (0.28 + rng() * 0.1), 5 + rng() * 14, 3);
    // mud/rust — heavier, the run should read dragged through earth
    ctx.fillStyle = 'rgba(92,70,44,0.32)';
    for (let i = 0; i < 52; i++) {
      ctx.beginPath(); ctx.arc(rng() * S, y + rng() * rh, 2 + rng() * 8, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

function redrawWhenMarkingFontReady(draw: () => void): void {
  if (document.fonts && !document.fonts.check("bold 16px 'ABC Monument Grotesk'")) {
    document.fonts.load("bold 16px 'ABC Monument Grotesk'").then(faces => { if (faces.length) draw(); }).catch(() => {});
  }
}

function paintDesignationDecal(
  ctx: CanvasRenderingContext2D,
  marking: VehicleMarkingRecord,
): void {
  const draw = (): void => {
    ctx.clearRect(0, 0, 256, 256);
    drawTacticalNumber(ctx, marking, { x: 2, y: 34, width: 252, height: 188 });
  };
  draw();
  redrawWhenMarkingFontReady(draw);
}

function paintStarDecal(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(238,238,230,0.92)';
  ctx.beginPath();
  for (let index = 0; index < 10; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 110 : 44;
    const x = 128 + Math.cos(angle) * radius;
    const y = 128 + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function paintCrossDecal(ctx: CanvasRenderingContext2D): void {
  const white = 'rgba(201,197,186,0.94)';
  const black = 'rgba(30,30,28,0.92)';
  const spanStart = 38;
  const spanEnd = 218;
  const bandStart = 97;
  const bandEnd = 159;
  const border = 15;
  ctx.fillStyle = white;
  ctx.fillRect(spanStart, bandStart, spanEnd - spanStart, bandEnd - bandStart);
  ctx.fillRect(bandStart, spanStart, bandEnd - bandStart, spanEnd - spanStart);
  ctx.fillStyle = black;
  ctx.fillRect(
    spanStart + border,
    bandStart + border,
    spanEnd - spanStart - 2 * border,
    bandEnd - bandStart - 2 * border,
  );
  ctx.fillRect(
    bandStart + border,
    spanStart + border,
    bandEnd - bandStart - 2 * border,
    spanEnd - spanStart - 2 * border,
  );
  ctx.globalCompositeOperation = 'destination-out';
  for (let index = 0; index < 20; index++) {
    const x = spanStart + ((index * 73) % 97) / 97 * (spanEnd - spanStart);
    const y = spanStart + ((index * 41) % 89) / 89 * (spanEnd - spanStart);
    ctx.globalAlpha = 0.3 + ((index * 29) % 45) / 100;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + ((index * 17) % 26) / 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function paintSootDecal(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createRadialGradient(128, 108, 8, 128, 116, 118);
  gradient.addColorStop(0, 'rgba(22,20,17,0.72)');
  gradient.addColorStop(0.55, 'rgba(26,23,19,0.36)');
  gradient.addColorStop(1, 'rgba(26,23,19,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 12; index++) {
    const x = 34 + index * 17 + ((index * 37) % 9);
    const length = 60 + ((index * 53) % 78);
    const streak = ctx.createLinearGradient(0, 110, 0, 110 + length);
    streak.addColorStop(0, 'rgba(20,18,15,0.5)');
    streak.addColorStop(1, 'rgba(20,18,15,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(x, 110, 4 + (index % 3) * 3, length);
  }
}

function paintGreyCrossDecal(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(40,40,40,0.9)';
  ctx.lineWidth = 20;
  ctx.strokeRect(48, 108, 160, 40);
  ctx.strokeRect(108, 48, 40, 160);
}

function paintTextDecal(ctx: CanvasRenderingContext2D, text: string): void {
  const length = Math.max(1, text.length);
  const draw = (): void => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.font = `bold ${Math.min(120, Math.floor(380 / length))}px 'ABC Monument Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.strokeText(text, 128, 128);
    ctx.fillStyle = 'rgba(174,172,162,0.92)';
    ctx.fillText(text, 128, 128);
  };
  draw();
  redrawWhenMarkingFontReady(draw);
}

// Transparent marking decal canvases.
function paintDecal(
  kind: string,
  text: string | null | undefined,
  marking: VehicleMarkingRecord,
): HTMLCanvasElement {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas2d(canvas);
  ctx.clearRect(0, 0, 256, 256);
  if (kind === 'insignia') drawNationalInsignia(ctx, marking.insignia, 128, 128, 210);
  else if (kind === 'designation') paintDesignationDecal(ctx, marking);
  else if (kind === 'star') paintStarDecal(ctx);
  else if (kind === 'cross') paintCrossDecal(ctx);
  else if (kind === 'soot') paintSootDecal(ctx);
  else if (kind === 'crossgrey') paintGreyCrossDecal(ctx);
  else paintTextDecal(ctx, text ?? '');
  return canvas;
}

function canvasTex(canvas: HTMLCanvasElement, { srgb = true, aniso = 4, repeat = false }: CanvasTextureOptions = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

interface SootTextureEntry { texture: THREE.CanvasTexture; refs: number; }
interface SootTextureLease extends SharedTextureLease { texture: THREE.CanvasTexture; }

// The fixed soot painter has no vehicle/seed/text inputs. Share only its
// immutable texture; per-visual materials still own their own burn uniforms.
// Entries exist only while leased, never before a visual requests this decal.
const SOOT_TEXTURES = new WeakMap<ShadowEngineContext, Map<number, SootTextureEntry>>();
function acquireSootTexture(
  engineCtx: ShadowEngineContext,
  aniso: number,
  create: () => THREE.CanvasTexture,
): SootTextureLease {
  const entries = SOOT_TEXTURES.get(engineCtx) ?? new Map<number, SootTextureEntry>();
  let entry = entries.get(aniso);
  if (!entry) {
    entry = { texture: create(), refs: 0 };
    entries.set(aniso, entry);
    SOOT_TEXTURES.set(engineCtx, entries);
  }
  const owned = entry;
  owned.refs++;
  let held = true;
  return {
    texture: owned.texture,
    release() {
      if (!held) return;
      held = false;
      if (--owned.refs > 0) return;
      entries.delete(aniso);
      if (entries.size === 0) SOOT_TEXTURES.delete(engineCtx);
      owned.texture.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Per-spec texture cache: painting 2048px canvases + the Sobel pass is the
// expensive part, and every instance of a tank type can share the results.
// Refcounted so dispose() only frees GPU memory when the last user is gone.
// ---------------------------------------------------------------------------

// r8 exposure trim for the SHARED procedural albedo (not the GLB pattern
// tiles — composeGlbShare applies its own 0.84 multiply): full-brightness
// procedural paint rendered a milky pastel next to the trimmed Abrams GLB
// under the garage spots — the core of the roster-cohesion critique.
const TEX_CACHE = new Map<string, SharedTextureEntry>();
// Pending owners protect an existing entry while an in-place bake yields and
// the last visual may release it. Completed leases use ordinary entry refs.
const TEXTURE_LEASE_PENDING = new Map<string, number>();

interface EntryPaintState {
  revision: number;
  active: number;
  idle: Promise<void> | null;
  resolveIdle: (() => void) | null;
}

// A pattern can change A -> B -> A while a worker is in flight. Pattern IDs
// alone cannot identify that newer paint owner, especially between chunked
// albedo and roughness writes. Weak ownership does not retain evicted entries.
const ENTRY_PAINT_STATE = new WeakMap<SharedTextureEntry, EntryPaintState>();

function entryPaintState(entry: SharedTextureEntry): EntryPaintState {
  let state = ENTRY_PAINT_STATE.get(entry);
  if (!state) {
    state = { revision: 0, active: 0, idle: null, resolveIdle: null };
    ENTRY_PAINT_STATE.set(entry, state);
  }
  return state;
}

function beginEntryRepaint(entry: SharedTextureEntry): EntryPaintState {
  const state = entryPaintState(entry);
  state.revision++;
  if (state.active++ === 0) {
    state.idle = new Promise<void>((resolve) => { state.resolveIdle = resolve; });
  }
  return state;
}

function endEntryRepaint(state: EntryPaintState): void {
  if (--state.active !== 0) return;
  state.resolveIdle?.();
  state.idle = null;
  state.resolveIdle = null;
}

function pendingEntryRepaint(key: string): Promise<void> | null {
  const entry = TEX_CACHE.get(key);
  return entry ? ENTRY_PAINT_STATE.get(entry)?.idle ?? null : null;
}

function sharedTextureIdentity(spec: AutoCamoVehicle, selection: string | null = null): SharedTextureIdentity {
  if (selection == null) return { key: spec.id, patternId: resolveCamoPattern(spec), fixed: false };
  const patternId = resolveMultiplayerCamoPattern(spec, selection);
  return { key: `${spec.id}::${patternId}`, patternId, fixed: true };
}

/** The spec a cached entry was painted for (AUTO needs its nation and era to rebuild that entry's key). */
function cachedMaterialSpec(specId: string): MaterialTankSpec | null {
  for (const entry of TEX_CACHE.values()) if (entry.spec.id === specId) return entry.spec;
  return null;
}

// PERF (performance_budget r3): per-spec bake quality tiers. The generated
// set (2048² albedo + 2x 1024² data maps ≈ 35 MB with mips) is hero-grade
// texel density for a vehicle the camera orbits at 4-6 m — the final garage
// pedestal upgrade. Player previews use the next tier during battle entry;
// AI roster vehicles are viewed at
// 20-500 m where even a 512²/256² set exceeds their normal projected size, yet a
// full battle held 5-7 hero sets (scene texture estimate 666-685 MB vs the
// FROZEN 512 MB gate) and each boot-path bake burned 250-350 ms of 2048²
// canvas painting. The painters are all canvas.width-relative, so lower
// tiers retain the identical feature plan; if the player later selects a
// cached spec, bakeSharedCanvases repaints the SAME canvases in place at full
// size — live materials update through texture.needsUpdate, exactly like
// the camo repaint path below.
const QUALITY_SIZES: Readonly<Record<MaterialTextureQuality, { albedo: number; map: number }>> = {
  high: { albedo: ALBEDO_SIZE, map: MAP_SIZE },
  // Garage previews and authored close-up contracts retain the former AI
  // tier. Ordinary battle bots rarely exceed ~150 screen pixels, so their
  // backing maps use the lower tier below; 1024/512 there oversampled the
  // projection while making every roster build a visible long task.
  preview: { albedo: ALBEDO_SIZE / 2, map: MAP_SIZE / 2 },
  ai: { albedo: ALBEDO_SIZE / 4, map: MAP_SIZE / 4 },
  // World dressing bakes a live tank only long enough to collapse its posed
  // geometry into vertex-coloured static wreck meshes; none of these maps
  // ever render. wrecks.ts has requested `low` since its introduction, but
  // the missing tier silently fell through to hero 2048/1024. Keep the
  // painter contract with a tiny transient set; wrecks.ts discards every
  // texture after collapsing the posed model to vertex-coloured geometry.
  low: { albedo: 256, map: 128 },
};

export function normalizeMaterialTextureQuality<Value>(quality: Value): MaterialTextureQuality {
  return typeof quality === 'string' && Object.prototype.hasOwnProperty.call(QUALITY_SIZES, quality)
    ? quality as MaterialTextureQuality
    : 'high';
}

export function materialTextureDimensions<Value>(quality: Value): { albedo: number; map: number } {
  const sizes = QUALITY_SIZES[normalizeMaterialTextureQuality(quality)];
  return { albedo: sizes.albedo, map: sizes.map };
}

function bakeSharedCanvases(entry: SharedTextureEntry, quality: MaterialTextureQuality): void {
  const g = bakeSharedCanvasesSteps(entry, quality);
  let r = g.next();
  while (!r.done) r = g.next();
}

// perf-r4b (play-session 'Painting vehicles' rows): the one-call family bake
// was a 0.3-4.7 s painter atom behind the loading bar. The generator yields
// between painter stages so the pre-battle prebake path can breathe; the sync
// wrapper above drains it whole — every existing caller (acquire, hero
// upgrade) is byte-identical, same rng draw order.
function sharedMaterialPaintRequest(
  entry: Pick<SharedTextureEntry, 'spec' | 'seed' | 'patternId'>,
  quality: MaterialTextureQuality,
): MaterialBasePaintRequest {
  // Tier scale is applied at the one place every shared vehicle bake sizes
  // itself; burnt/ember/camo repaints all derive from these canvases.
  const szq = QUALITY_SIZES[normalizeMaterialTextureQuality(quality)];
  // Preserve extra texels only for the selected/close vehicle. Distant AI is
  // already authored at its own compact tier and remains on the stricter
  // world scale so a 14-tank entry does not multiply paint time or residency.
  const textureClass = quality === 'high' || quality === 'preview'
    ? 'vehicle' : 'world';
  const sz = {
    albedo: texSize(szq.albedo, textureClass),
    map: texSize(szq.map, textureClass),
  };
  const { spec, seed } = entry;
  // Welded-composite hulls draw no rivet/bolt rows.
  const vis = { ...resolveCamoVisual(spec, entry.patternId), modernWelds: isPostwarVehicleEra(spec.era) };
  return {
    visual: vis, seed, dimensions: sz,
    plateLines: vis.plateLines !== false && spec.visual.plateLines !== false,
    // Round 35: the first bake paints the pattern from the same hull-independent stream every later repaint uses,
    // so a shared preset lays out identically on every hull from the very first frame it is shown.
    camoStreamSeed: camoPatternStreamSeed(vis, camoPatternIdHash(entry.patternId)),
  };
}

function* bakeSharedCanvasesSteps(
  entry: SharedTextureEntry,
  quality: MaterialTextureQuality,
): Generator<void, void, void> {
  const request = sharedMaterialPaintRequest(entry, quality);
  yield* materialPainter.bakeBaseSteps(entry, request);
  // camo_spotting r4: per-patch paint response rides the pattern (see
  // paintPatchRoughness) — repainted with the albedo on pattern switches.
  paintPatchRoughness(entry.roughCanvas, entry.camoCanvas, request.visual);
  entry.quality = quality;
}

function acquireSharedTextures(
  spec: MaterialTankSpec,
  aniso: number,
  quality: MaterialTextureQuality = 'high',
  selection: string | null = null,
): SharedTextureEntry {
  const identity = sharedTextureIdentity(spec, selection);
  const { key } = identity;
  let entry = TEX_CACHE.get(key);
  if (!entry) {
    const { patternId } = identity;
    const seed = 0x5eed ^ (key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
    entry = {
      refs: 0,
      // CAMO PATTERN SECTION: kept so applyCamoPatterns() can repaint the
      // shared albedo in place (all live instances update through the texture).
      // paintable: per-instance solid-color materials (road-wheel dishes,
      // fittings) that must follow the scheme on repaint (r1: lime-green
      // wheels under winter whitewash).
      cacheKey: key, fixedPattern: identity.fixed, spec, seed, feats: null,
      patternId, paintable: new Set<PaintableRecord>(),
      quality,
      camoCanvas: makeCanvas(4, 4),
      normalCanvas: makeCanvas(4, 4),
      roughCanvas: makeCanvas(4, 4),
      trackCanvas: paintTrack(mulberry32(seed + 17)),
    };
    bakeSharedCanvases(entry, quality);
    entry.camoTex = canvasTex(entry.camoCanvas, { aniso, repeat: true });
    entry.normalTex = canvasTex(entry.normalCanvas, { srgb: false, aniso, repeat: true });
    entry.roughTex = canvasTex(entry.roughCanvas, { srgb: false, aniso, repeat: true });
    TEX_CACHE.set(key, entry);
  } else if (isMaterialTextureQualityUpgrade(entry.quality, quality)) {
    // In-place quality promotion when a closer presentation reuses an entry.
    upgradeEntry(entry, quality);
  }
  entry.refs++;
  return entry;
}

// camo r8 REPAINT BUG (audit finding: "tiger1 never repaints — hull kept the
// factory bake through every picker click while its wheels re-tinted"): the
// ai->high upgrade RESIZES the backing canvases (1024->2048 albedo,
// 512->1024 maps). The WebGL2 texture was allocated with IMMUTABLE storage
// (texStorage2D) at the old dimensions, so every post-resize needsUpdate
// re-upload fails silently (GL error, GPU keeps the stale bake) — the
// upgrade itself AND every later repaintEntry appeared to do nothing on any
// spec that had been AI-baked first (pedestal LRU heroes, staged bots).
// dispose() drops the GL object so the next bind re-allocates at the new
// size; the THREE.Texture object identity is untouched, so every live
// material keeps working.
const QUALITY_RANK: Readonly<Record<MaterialTextureQuality, number>> = { low: -1, ai: 0, preview: 1, high: 2 };
export function isMaterialTextureQualityUpgrade<Current, Requested>(current: Current, requested: Requested): boolean {
  return QUALITY_RANK[normalizeMaterialTextureQuality(requested)]
    > QUALITY_RANK[normalizeMaterialTextureQuality(current)];
}

// A garage Battle-intent warm can overlap the real transition by a few
// milliseconds (especially touchstart -> click). Keep one painter per shared
// texture identity so both callers join the same canvas work instead of
// racing duplicate 512/1024 px bakes on the main thread. A later higher-tier
// request re-enters after the first job settles and performs only the required
// in-place promotion.
const PREBAKE_PENDING = new Map<string, Promise<void>>();
function upgradeEntry(entry: SharedTextureEntry, quality: MaterialTextureQuality = 'high'): void {
  bakeSharedCanvases(entry, quality);
  finalizeEntryResize(entry);
}

/** Post-resize texture ritual shared by synchronous acquisition and chunked
 * prebake promotion (see the camo r8 immutable-storage note above). */
function finalizeEntryResize(entry: SharedTextureEntry): void {
  entry.camoTex?.dispose();
  entry.normalTex?.dispose();
  entry.roughTex?.dispose();
  if (entry.camoTex) entry.camoTex.needsUpdate = true;
  if (entry.normalTex) entry.normalTex.needsUpdate = true;
  if (entry.roughTex) entry.roughTex.needsUpdate = true;
  // burnt/ember derive from the albedo — rebuild lazily at next wreck
  if (entry.burntTex) { entry.burntTex.dispose(); entry.burntTex = null; }
  if (entry.emberTex) { entry.emberTex.dispose(); entry.emberTex = null; }
}

interface WorkerPaintDraft {
  camoCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  roughCanvas: HTMLCanvasElement;
  pixels: { albedo: ImageData; normal: ImageData; roughness: ImageData };
}

function releaseWorkerPaintCanvases(canvases: readonly HTMLCanvasElement[]): void {
  for (const canvas of canvases) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Keep the native Window-side downsampling: OffscreenCanvas's downsample can
 * differ by one byte, changing the subsequent discrete roughness classification.
 * Complete all of that work on private canvases before touching a live texture. */
function prepareWorkerPaintDraft(
  result: MaterialPainterResult,
  visual: MaterialVisual,
  readPatchedPixels: boolean,
): WorkerPaintDraft {
  const { albedo, map } = result.dimensions;
  const pixels = {
    albedo: new ImageData(result.albedo, albedo, albedo),
    normal: new ImageData(result.normal, map, map),
    roughness: new ImageData(result.roughness, map, map),
  };
  const owned: HTMLCanvasElement[] = [];
  const createOwned = (size: number): HTMLCanvasElement => {
    const canvas = makeCanvas(size, size);
    owned.push(canvas);
    return canvas;
  };
  try {
    const draft = {
      camoCanvas: createOwned(albedo), normalCanvas: createOwned(map),
      roughCanvas: createOwned(map), pixels,
    };
    canvas2d(draft.camoCanvas).putImageData(pixels.albedo, 0, 0);
    canvas2d(draft.normalCanvas).putImageData(pixels.normal, 0, 0);
    const rough = canvas2d(draft.roughCanvas);
    rough.putImageData(pixels.roughness, 0, 0);
    paintPatchRoughness(draft.roughCanvas, draft.camoCanvas, visual);
    // New entries adopt these private canvases directly. Only an in-place
    // promotion needs a CPU copy of the corrected roughness for its old canvas.
    if (readPatchedPixels) pixels.roughness = rough.getImageData(0, 0, map, map);
    return draft;
  } catch (error) {
    releaseWorkerPaintCanvases(owned);
    throw error;
  }
}

function commitWorkerPaintPromotion(
  entry: SharedTextureEntry,
  draft: WorkerPaintDraft,
  result: MaterialPainterResult,
  quality: MaterialTextureQuality,
): void {
  const pairs = [
    [entry.camoCanvas, draft.pixels.albedo],
    [entry.normalCanvas, draft.pixels.normal],
    [entry.roughCanvas, draft.pixels.roughness],
  ] as const;
  // No yield during installation. Materials keep the same THREE.Texture and
  // canvas identities; the immutable GPU storage is renewed only after all maps.
  for (const [canvas, pixels] of pairs) {
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas2d(canvas).putImageData(pixels, 0, 0);
  }
  entry.feats = result.features;
  entry.quality = quality;
  finalizeEntryResize(entry);
}

interface WorkerPaintSnapshot {
  initial: SharedTextureEntry | undefined;
  source: Pick<SharedTextureEntry, 'spec' | 'seed' | 'patternId'>;
  revision: number;
  fingerprint: string;
  selectionFingerprint: string | null;
}

function workerPaintSnapshotCurrent(
  identity: SharedTextureIdentity,
  quality: MaterialTextureQuality,
  snapshot: WorkerPaintSnapshot,
): boolean {
  const current = TEX_CACHE.get(identity.key);
  const { initial, source, revision, fingerprint, selectionFingerprint } = snapshot;
  if (current !== initial) return false;
  if (current && (entryPaintState(current).active
      || entryPaintState(current).revision !== revision)) return false;
  if (JSON.stringify(sharedMaterialPaintRequest(source, quality)) !== fingerprint
      || (!identity.fixed && mutablePaintFingerprint(source, quality) !== selectionFingerprint)) return false;
  return !current || (current.patternId === source.patternId
    && current.spec === source.spec && current.seed === source.seed);
}

async function tryPrebakeSharedTexturesInWorker(
  spec: MaterialTankSpec,
  identity: SharedTextureIdentity,
  quality: MaterialTextureQuality,
  aniso: number,
  tick: BakeYield | null,
): Promise<boolean> {
  const { key, patternId } = identity;
  const initial = TEX_CACHE.get(key);
  if (initial && entryPaintState(initial).active) return false;
  if (initial && !isMaterialTextureQualityUpgrade(initial.quality, quality)) return true;
  const seed = initial?.seed
    ?? (0x5eed ^ key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
  // Snapshot scalars rather than aliasing the live entry. Preserve the mutable
  // specId key/seed and its current pattern; the repaint owner uses a separate
  // pattern-keyed RNG stream and must not be folded into this base bake.
  const source = { spec: initial?.spec ?? spec, seed, patternId: initial?.patternId ?? patternId };
  const request = sharedMaterialPaintRequest(source, quality);
  const snapshot: WorkerPaintSnapshot = {
    initial, source, fingerprint: JSON.stringify(request),
    revision: initial ? entryPaintState(initial).revision : 0,
    selectionFingerprint: identity.fixed ? null : mutablePaintFingerprint(source, quality),
  };
  const result = await tryPaintMaterialBase({ ...request, identity: key });
  // A lease's drainTick records owner cancellation while allowing joined owners
  // to finish. A legacy caller's rejection exits before any live-map mutation.
  if (tick) await tick();
  if (!result) return false;
  if (!workerPaintSnapshotCurrent(identity, quality, snapshot)) return false;
  const current = TEX_CACHE.get(key);
  if (current && !isMaterialTextureQualityUpgrade(current.quality, quality)) return true;
  let draft: WorkerPaintDraft;
  try { draft = prepareWorkerPaintDraft(result, request.visual, current !== undefined); }
  catch { return false; } // Unsupported Canvas/ImageData stays on the original painter.
  let adopted = false;
  let unpublished: SharedTextureEntry | null = null;
  try {
    if (current) {
      commitWorkerPaintPromotion(current, draft, result, quality);
      return true;
    }
    const entry: SharedTextureEntry = {
      refs: 0, cacheKey: key, fixedPattern: identity.fixed, spec: source.spec,
      seed, patternId: source.patternId, feats: result.features,
      quality, paintable: new Set<PaintableRecord>(),
      camoCanvas: draft.camoCanvas, normalCanvas: draft.normalCanvas,
      roughCanvas: draft.roughCanvas, trackCanvas: paintTrack(mulberry32(seed + 17)),
    };
    unpublished = entry;
    entry.camoTex = canvasTex(entry.camoCanvas, { aniso, repeat: true });
    entry.normalTex = canvasTex(entry.normalCanvas, { srgb: false, aniso, repeat: true });
    entry.roughTex = canvasTex(entry.roughCanvas, { srgb: false, aniso, repeat: true });
    TEX_CACHE.set(key, entry);
    adopted = true;
    return true;
  } finally {
    if (!adopted) {
      unpublished?.camoTex?.dispose();
      unpublished?.normalTex?.dispose();
      unpublished?.roughTex?.dispose();
      if (unpublished) releaseWorkerPaintCanvases([unpublished.trackCanvas]);
      releaseWorkerPaintCanvases([draft.camoCanvas, draft.normalCanvas, draft.roughCanvas]);
    }
  }
}

function mutablePaintFingerprint(
  source: Pick<SharedTextureEntry, 'spec' | 'seed' | 'patternId'>,
  quality: MaterialTextureQuality,
): string {
  return JSON.stringify(sharedMaterialPaintRequest({
    ...source, patternId: resolveCamoPattern(source.spec),
  }, quality));
}

/**
 * perf-r4b: bake (or upgrade) a spec's shared texture entry BEFORE the visual
 * build acquires it, yielding between painter stages — the pre-battle
 * 'Painting vehicles' loop awaits this per roster tank so a 2048² family bake
 * stops being a 0.3-4.7 s atomic task under the loading bar. The subsequent
 * acquireSharedTextures call is then a pure cache hit. Refcounts unchanged
 * (a prebaked-but-never-acquired entry behaves exactly like a released one).
 * @param {object} spec TankSpec
 * @param {number} aniso engineCtx.anisotropy
 * @param {string} quality 'ai' | 'preview' | 'high' — must match what the build will ask
 * @param {?function(): (Promise<void>|void)} tick awaited between stages
 */
export function prebakeSharedTextures(
  specValue: RuntimeValue,
  aniso: number,
  requestedQuality: string = 'ai',
  tick: BakeYield | null = null,
  selection: string | null = null,
): Promise<void> {
  const spec = requireMaterialTankSpec(specValue);
  const quality = normalizeMaterialTextureQuality(requestedQuality);
  const identity = sharedTextureIdentity(spec, selection);
  const { key } = identity;
  const active = PREBAKE_PENDING.get(key);
  if (active) {
    return active.then(() => prebakeSharedTextures(
      spec, aniso, quality, tick, selection,
    ));
  }
  const pending = (async () => {
    // Ordinary solo warming uses the mutable specId cache, not a fixed lease.
    // Both paths retain their exact key/seed. Unsupported browsers still start
    // synchronously; PREBAKE_PENDING remains the sole coalescing/cache owner.
    if (canPaintMaterialBaseInWorker()
        && await tryPrebakeSharedTexturesInWorker(spec, identity, quality, aniso, tick)) return;
    // A rejected/stale worker must not fall straight into a legacy promotion
    // over a half-painted live entry. Repaint never joins PREBAKE_PENDING, so
    // this idle join cannot cycle back into our own task. Re-read after each
    // completion in case a newer sweep or cache owner took over meanwhile.
    let repaint = pendingEntryRepaint(key);
    while (repaint) {
      await repaint;
      if (tick) await tick();
      repaint = pendingEntryRepaint(key);
    }
    const run = async (g: Generator<void, void, void>): Promise<void> => {
      let r = g.next();
      while (!r.done) {
        if (tick) await tick();
        r = g.next();
      }
    };
    let entry = TEX_CACHE.get(key);
    if (entry) {
      // mirror acquire's only upgrade case; anything else is already adequate
      if (isMaterialTextureQualityUpgrade(entry.quality, quality)) {
        await run(bakeSharedCanvasesSteps(entry, quality));
        finalizeEntryResize(entry);
      }
      return;
    }
    const { patternId } = identity.fixed ? identity : sharedTextureIdentity(spec);
    const seed = 0x5eed ^ (key.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) | 0, 7));
    entry = {
      refs: 0,
      cacheKey: key, fixedPattern: identity.fixed, spec, seed, feats: null,
      patternId, paintable: new Set<PaintableRecord>(),
      quality,
      camoCanvas: makeCanvas(4, 4),
      normalCanvas: makeCanvas(4, 4),
      roughCanvas: makeCanvas(4, 4),
      trackCanvas: paintTrack(mulberry32(seed + 17)),
    };
    await run(bakeSharedCanvasesSteps(entry, quality));
    // A synchronous createTank() can acquire this key while the chunked
    // pre-bake is between painter stages (battlefield wreck construction and
    // roster preparation intentionally overlap). Never overwrite that live,
    // ref-counted cache entry with our detached draft. Upgrade the acquired
    // entry in place if needed; otherwise let the draft canvases be collected.
    const acquiredDuringBake = TEX_CACHE.get(key);
    if (acquiredDuringBake) {
      if (isMaterialTextureQualityUpgrade(acquiredDuringBake.quality, quality)) {
        await run(bakeSharedCanvasesSteps(acquiredDuringBake, quality));
        finalizeEntryResize(acquiredDuringBake);
      }
      return;
    }
    entry.camoTex = canvasTex(entry.camoCanvas, { aniso, repeat: true });
    entry.normalTex = canvasTex(entry.normalCanvas, { srgb: false, aniso, repeat: true });
    entry.roughTex = canvasTex(entry.roughCanvas, { srgb: false, aniso, repeat: true });
    TEX_CACHE.set(key, entry);
  })();
  const tracked = pending.finally(() => {
    if (PREBAKE_PENDING.get(key) === tracked) PREBAKE_PENDING.delete(key);
  });
  PREBAKE_PENDING.set(key, tracked);
  return tracked;
}

/**
 * Own an exact match texture identity before its visuals exist. Selection must
 * already be concrete: mutable Garage defaults and map-relative AUTO are not
 * lease identities. The caller cancels between completed tasks, then releases
 * after visual acquisition or drains/releases every successful lease on exit.
 * This owner's tick failures reject only after its painter finishes: aborting
 * halfway through an existing entry's promotion would leave live maps incomplete.
 * Joining a rejected legacy prebake still propagates that operation's failure.
 */
export async function acquireSharedTextureLease(
  specValue: RuntimeValue,
  aniso: number,
  quality: MaterialTextureQuality,
  selection: string,
  tick: BakeYield | null = null,
): Promise<SharedTextureLease> {
  const spec = requireMaterialTankSpec(specValue);
  if ((selection !== 'urban' && !isBuiltInCamoId(selection)) || selection === 'auto') {
    throw new TypeError('Shared texture leases require a concrete built-in camouflage');
  }
  const { key } = sharedTextureIdentity(spec, selection);
  TEXTURE_LEASE_PENDING.set(key, (TEXTURE_LEASE_PENDING.get(key) || 0) + 1);
  const outcome: { failure?: { error: RuntimeValue } } = {};
  const drainTick = tick ? async (): Promise<void> => {
    try { await tick(); }
    catch (error) { outcome.failure ??= { error }; }
  } : null;
  try {
    await prebakeSharedTextures(spec, aniso, quality, drainTick, selection);
    if (outcome.failure) throw outcome.failure.error;
    const entry = TEX_CACHE.get(key);
    if (!entry) throw new Error(`vehicle material lease ${key} has no texture entry`);
    entry.refs++;
    let released = false;
    return { release() {
      if (released) return;
      released = true;
      if (TEX_CACHE.get(key) === entry) releaseSharedTextures(entry);
    } };
  } finally {
    const remaining = (TEXTURE_LEASE_PENDING.get(key) || 1) - 1;
    if (remaining) TEXTURE_LEASE_PENDING.set(key, remaining);
    else {
      TEXTURE_LEASE_PENDING.delete(key);
      const entry = TEX_CACHE.get(key);
      if (entry && entry.refs <= 0) disposeSharedTextureEntry(entry);
    }
  }
}

/**
 * PERF (perf-budget handoff): pre-upload every cached spec's burnt/ember maps
 * so the first kill of a battle doesn't pay a texture-upload stall inside a
 * combat frame (probe measured a 125 ms frame at first blood). Call once at
 * boot after all tanks are built; ~100 MB of uploads amortized off-battle.
 * @param {THREE.WebGLRenderer} renderer
 */
export function warmWreckTextures(renderer: THREE.WebGLRenderer): void {
  for (const entry of TEX_CACHE.values()) {
    if (entry.burntTex) renderer.initTexture(entry.burntTex);
    if (entry.emberTex) renderer.initTexture(entry.emberTex);
  }
}

function disposeSharedTextureEntry(entry: SharedTextureEntry): void {
  entry.camoTex?.dispose();
  entry.normalTex?.dispose();
  entry.roughTex?.dispose();
  entry.burntTex?.dispose();
  entry.emberTex?.dispose();
  entry.kitTex?.dispose();
  TEX_CACHE.delete(entry.cacheKey);
}

function releaseSharedTextures(shared: SharedTextureEntry | null | undefined): void {
  const entry = shared && TEX_CACHE.get(shared.cacheKey);
  if (!entry) return;
  if (--entry.refs <= 0 && !TEXTURE_LEASE_PENDING.has(entry.cacheKey)) disposeSharedTextureEntry(entry);
}

/**
 * Drop a texture-only speculative bake when it is no longer adjacent to the
 * garage selection. Live visuals own positive refs and are never affected.
 */
export function discardPrebakedSharedTextures(specId: string): boolean {
  const entry = TEX_CACHE.get(specId);
  if (!entry || entry.refs > 0 || TEXTURE_LEASE_PENDING.has(entry.cacheKey)) return false;
  disposeSharedTextureEntry(entry);
  return true;
}

/**
 * Charred variant of the shared camo albedo + a patchy ember emissive map,
 * built lazily and cached with the per-spec textures. The wreck keeps faint
 * camo/panel variation under heavy char with noise blotches and rising soot
 * streaks — never a flat clay color swap.
 * @param {object} entry TEX_CACHE entry @param {number} aniso
 */
function ensureBurntTextures(entry: SharedTextureEntry, aniso: number): void {
  const g = burntBakeSteps(entry, aniso);
  let r = g.next();
  while (!r.done) r = g.next();
}

/**
 * perf-r5: chunked burnt/ember prebake for one spec — the char bake is a
 * 150-900 ms painter atom that otherwise lands on the warm dance (or, for
 * drain-deadline stragglers, inside the COUNTDOWN). The warm pipeline
 * yield*s this per fielded family so each stage gets its own slice; the
 * kill-time ensureBurntTextures path then always hits the cache.
 * @param {string} specId @param {number} aniso
 */
export function* prebakeBurntSteps(
  specId: string,
  aniso: number,
  selection: string | null = null,
): Generator<void, void, void> {
  // No cached entry for the spec means nothing to char; otherwise its spec rebuilds the (AUTO-resolved) key.
  const spec = cachedMaterialSpec(specId);
  const entry = spec ? TEX_CACHE.get(sharedTextureIdentity(spec, selection).key) : undefined;
  if (!entry || entry.burntTex) return;
  yield* burntBakeSteps(entry, aniso);
}

function* burntBakeSteps(entry: SharedTextureEntry, aniso: number): Generator<void, void, void> {
  if (entry.burntTex) return;
  const S = texSize(1024); // transient wreck treatment keeps the world-scale budget
  const cv = makeCanvas(S, S);
  const ctx = canvas2d(cv);
  ctx.drawImage(entry.camoCanvas, 0, 0, S, S);
  // char the paint toward scorched near-black, camo faintly readable under it
  // char levels lifted (multiply #5a5049 + 0.42 near-black overlay -> #7d7268
  // + 0.28): the old stack pushed the wreck albedo to ~0.06 and the hull read
  // as a light-swallowing pure-black silhouette within 2 s of the kill (r6).
  // The wreck must stay CHARRED but keep readable camo/panel structure and
  // catch sun/fire rim light.
  // effects_combat r5 (critic critical: "wreck albedo so dark it reads as a
  // black hole against sunlit grass — zero deck detail, no charred browns/
  // ash grays"): char stack lifted again (#6e645c*0.34 -> #877c70*0.22).
  // The wreck must read as charred UMBER/ASH steel in sunlight — the
  // turret/hull silhouettes have to separate tonally or the kill reads as
  // a turretless cutout.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#877c70';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(28,25,21,0.22)';
  ctx.fillRect(0, 0, S, S);
  // r1 anti-terracotta: kill most of the CAMO HUE under the char — a tan/
  // desert scheme multiplied by the warm char stack rendered the whole
  // sunlit deck as uniform terracotta ("painted clay", destroy_2_5s/4s).
  // Burnt paint is carbon: desaturate hard toward soot grey, keeping the
  // value pattern; the rust/bare-metal accents below re-add local color.
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = 'rgba(128,128,128,0.72)';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  yield; // char stack composited
  const rng = mulberry32((entry.seed ^ 0xb0217) >>> 0);
  // sooty blotches: char-black pockets and ash-grey burn-through patches
  for (let i = 0; i < 80; i++) {
    const x = rng() * S, y = rng() * S, r = (0.03 + rng() * 0.12) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (rng() < 0.62) g.addColorStop(0, `rgba(12,10,9,${0.26 + rng() * 0.3})`);
    else g.addColorStop(0, `rgba(104,96,84,${0.08 + rng() * 0.15})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  yield; // soot blotches done
  // rising soot streaks (heat streaking up plates from hatches/seams)
  for (let i = 0; i < 52; i++) {
    const x = rng() * S;
    const y0 = rng() * S * 0.75;
    const len = (0.10 + rng() * 0.30) * S;
    const w = (0.005 + rng() * 0.020) * S;
    const g = ctx.createLinearGradient(x, y0 + len, x, y0);
    g.addColorStop(0, `rgba(8,7,6,${0.18 + rng() * 0.30})`);
    g.addColorStop(1, 'rgba(8,7,6,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y0, w, len);
  }
  // r1 scorched-steel variation (critique: wrecks read as featureless black
  // slabs): heat-rust bloom patches where the paint burned through, plus
  // short bright bare-metal scrape highlights along plate edges — the char
  // keeps readable material structure from every angle.
  // effects_combat r6 (critic minor: "wreck road wheels show salmon/pink
  // rims"): the warm rust blobs — multiplied by the burnt material's 1.5
  // color lift and lit by the warm sun/blast light — tone-mapped to salmon
  // on curved rims. Red channel dropped ~40% toward grey-brown scorch.
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = (0.02 + rng() * 0.07) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(84,58,38,${0.14 + rng() * 0.14})`);
    g.addColorStop(0.6, `rgba(66,48,32,${0.07 + rng() * 0.08})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * S, y = rng() * S;
    const len = (0.015 + rng() * 0.05) * S;
    const horiz = rng() < 0.5;
    ctx.fillStyle = `rgba(148,142,130,${0.10 + rng() * 0.16})`;
    if (horiz) ctx.fillRect(x, y, len, 1 + rng() * 2);
    else ctx.fillRect(x, y, 1 + rng() * 2, len);
  }
  yield; // streaks/rust/scrapes painted
  entry.burntTex = canvasTex(cv, { aniso, repeat: true });
  yield; // burnt albedo uploaded-ready; ember canvas next
  // ember emissive mask: mostly black with a few soft hot pockets — the glow
  // reads as embers smoldering in seams, never a uniform lava dip
  const E = 256;
  const ec = makeCanvas(E, E);
  const ectx = canvas2d(ec);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, E, E);
  // 11 pockets (was 6) at varied radii/heat so the smolder reads as scattered
  // embers in seams — more variation kills the r6 "featureless black" hull
  // r5: pockets shrunk (14-54 px -> 8-28 px) and dimmed — under the wreck's
  // world-space triplanar sampling the old radii blew up into 0.5-1 m soft
  // red "spotlight" blobs at close range; embers must read as seams/pockets.
  for (let i = 0; i < 13; i++) {
    const x = rng() * E, y = rng() * E, r = 8 + rng() * 20;
    const g = ectx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,${118 + Math.floor(rng() * 60)},48,${0.26 + rng() * 0.32})`);
    g.addColorStop(0.5, 'rgba(140,36,8,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ectx.fillStyle = g;
    ectx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  entry.emberTex = canvasTex(ec, { aniso: 2, repeat: true });
}

// ===========================================================================
// CAMO PATTERN SECTION — per-tank paintable camo schemes (garage picker).
//
// Selection is persisted per tank id in localStorage ('cot.camo.<specId>'):
//   'factory' — the authored historical spec.visual (default)
//   'summer'  — 3-color NATO/olive summer
//   'desert'  — desert tan wash
//   'winter'  — whitewash over the factory paint
//   'digital' — nation-flavored digital/flecktarn
//   'auto'    — resolves per active battlefield biome (set via setCamoBiome)
//
// Patterns repaint the SHARED per-spec albedo canvas in place, so the garage
// pedestal, battle tanks, and any sourced-GLB overlay all update live without
// rebuilding geometry. A pattern grants the small concealment bonus (see
// src/sim/spotting.ts CAMO_PAINT_BONUS) only when it MATCHES the active
// battlefield biome — hasCamoPaint() below; AUTO always matches.
// ===========================================================================

// camo r8: the picker grew from 6 to 16 patterns. ORDER CONTRACT: the first
// six ids stay exactly as shipped — tools (spotting-check) click by index and
// players' persisted picks key by id. New ids append after 'digital', grouped
// by season family (green field / desert / winter / urban / style-only).
// camo r2 (expansion round): 16 -> 29. Same append-only contract — the r8
// block keeps its exact order, the r2 block appends after 'dazzle' grouped
// the same way (green field / desert / winter / urban / autumn / style-only).
const CAMO_LS_PREFIX = 'cot.camo.';
const CUSTOM_CAMO_LS_PREFIX = 'cot.camoCustom.v1.';
// 'urban' is an INTERNAL pattern id (gray digital) reachable only through
// AUTO biome resolution — a green flecktarn in a gray rubble city defeated
// the point of biome matching (r1). Direct picker selection keeps the
// nation-flavored green 'digital'.
// camo r8: the map roster grew to eight — every mapId resolves AUTO to the
// scheme that matches its dominant field: Amberford (autumn) wears the new
// autumn blotch, Saltmere Bay's green headlands stay summer (a parade of
// grey-blue AUTO bots on grass would defeat biome matching — naval is the
// deliberate coastal pick, see PATTERN_SEASON), hay-gold Tarkhan Steppe
// reads tan (desert family), Cinder Junction is industrial grey (urban).
// Unknown mapIds still fall back to verdant inside setCamoBiome.
// camo r2 (expansion round): each biome now carries a POOL of matching
// schemes and AUTO resolves to a per-spec deterministic pick (hash of
// specId+biome, see resolveCamoPattern) — an AUTO battle roster wears varied
// but always biome-appropriate paint instead of one parade scheme (the r5
// bot-biome-camo intent, extended). Element 0 stays the r8 canonical scheme.
// EVERY pool member must belong on its biome field — the coastal pool stays
// green-family for exactly the r8 reason above.
// Tank-accessories round 3 (2026-10-07): the pools and the AUTO decision live in
// camoPolicy.ts (AUTO_CAMO_BIOMES, NATIONAL_AUTO_CAMO, autoCamoPatternIdFor): AUTO
// paints the vehicle's national scheme for the biome's environment and keeps the
// shared pool for nations without one. activeBiome is always an AUTO_CAMO_BIOMES key.
let activeBiome: string = 'verdant';

/** Persisted camo choice, or the first-party presentation default when unset. */
export function getCamoSelection(specId: string): MaterialPatternId {
  try {
    const v = localStorage.getItem(CAMO_LS_PREFIX + specId);
    if (v == null) return defaultCamoPatternId(specId);
    // The first Signature rollout persisted one tank-relative id. Migrate it
    // on read to the named reusable preset so returning players see the new
    // catalog selection without losing the colorway they chose.
    if (v === 'signature') return signatureCamoPatternId(specId) || 'factory';
    if (isBuiltInCamoId(v)) return v;
    if (v === CUSTOM_CAMO_ID && localStorage.getItem(CUSTOM_CAMO_LS_PREFIX + specId)) {
      return CUSTOM_CAMO_ID;
    }
    return 'factory';
  } catch (e) { return defaultCamoPatternId(specId); }
}

/** Persist a camo pattern selection for a tank. */
export function setCamoSelection(specId: string, patternId: string): void {
  if (!isBuiltInCamoId(patternId)) return;
  try { localStorage.setItem(CAMO_LS_PREFIX + specId, patternId); } catch (e) { /* private mode */ }
}

/** Device-local custom painter settings for one vehicle. */
export function getCustomCamoSelection(specId: string): CustomCamo {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_CAMO_LS_PREFIX + specId) || 'null');
    return normalizeCustomCamo(value);
  } catch (_) { return normalizeCustomCamo(); }
}

/** Save and activate a custom pattern. It is intentionally never match-safe. */
export function setCustomCamoSelection<Value>(specId: string, value: Value): CustomCamo {
  const next = normalizeCustomCamo(value);
  try {
    localStorage.setItem(CUSTOM_CAMO_LS_PREFIX + specId, JSON.stringify(next));
    localStorage.setItem(CAMO_LS_PREFIX + specId, CUSTOM_CAMO_ID);
  } catch (_) { /* private mode */ }
  return next;
}

/** Public lobby/ranked selection; custom local paint degrades to Factory. */
export function getMultiplayerCamoSelection(specId: string): CamoPatternId {
  return networkCamoId(getCamoSelection(specId));
}

// BOT BIOME CAMO (camo_spotting r5): runtime per-spec pattern overrides.
// AI roster tanks kept factory green on snow/dunes while the player's AUTO
// paint matched the biome — fields of parade-green bots flagged the maps as
// artificial (critic minor). state.ts setupBattle rolls a per-battle chance
// per NON-PLAYER participant and points its spec here (usually at 'auto',
// which tracks the active biome); the garage picker and localStorage are
// untouched, so the player's own selections never see these. The player's
// spec is never overridden — setupBattle only rolls for bots, and a spec id
// appears at most once per battle (entities are keyed by spec id).
const CAMO_OVERRIDE = new Map<string, MaterialPatternId>(); // specId -> patternId ('auto' allowed)
export function setCamoOverride(specId: string, patternId: string | null): void {
  if (patternId == null) { CAMO_OVERRIDE.delete(specId); return; }
  if (isBuiltInCamoId(patternId) || patternId === 'urban') {
    CAMO_OVERRIDE.set(specId, patternId);
  }
}
export function clearCamoOverrides() { CAMO_OVERRIDE.clear(); battleCamoSeed = null; }

// Fleet lane (2026-10-08; the coordinator after wave 258): the battle's seed for its bots' AUTO draws, so one nation's
// roster fans out over its real schemes from battle to battle. Only overridden (bot) specs read it; the player's own
// AUTO keeps the per-(vehicle, map) draw the garage previews. Set by setupBattle and the loading coordinator from the
// battle ordinal they share, so the pre-paint and the battle agree.
let battleCamoSeed: number | null = null;
export function setCamoBattleSeed(seed: number | null): void {
  battleCamoSeed = seed === null || !Number.isFinite(seed) ? null : Math.trunc(seed);
}

/** Whether a bot may keep its own paint on `mapId` (fleet lane 2026-10-08): the spec's saved or stock selection must
 * suit the battlefield's theatre (camoPolicy.ts camoSuitsTheatre); a local custom paint never does. */
export function camoSelectionSuitsTheatre(spec: AutoCamoVehicle, mapId: string): boolean {
  const selection = getCamoSelection(spec.id);
  if (selection === 'auto') return true;
  if (selection === CUSTOM_CAMO_ID) return false;
  const pattern = selection === 'factory' ? stockCamoPatternIdFor(spec.id, spec.nation ?? undefined, spec.era) : selection;
  return !!pattern && camoSuitsTheatre(pattern, spec.nation, mapId);
}

/** Point 'auto' selections at a battlefield biome (call before a battle). */
export function setCamoBiome(mapId: string): void {
  activeBiome = autoCamoBiomeId(mapId);
}

/** The tank's effective selection: a battle override first, else the saved pick. */
function effectiveCamoSelection(specId: string): MaterialPatternId {
  return CAMO_OVERRIDE.get(specId) || getCamoSelection(specId);
}

/** Concrete pattern id for a tank right now ('auto' resolved per biome). */
function resolveCamoPattern(spec: AutoCamoVehicle): MaterialPatternId {
  const sel = effectiveCamoSelection(spec.id);
  if (sel === CUSTOM_CAMO_ID) return customCamoPatternId(getCustomCamoSelection(spec.id));
  if (sel !== 'auto') return sel;
  // The vehicle's national scheme for this biome, or a deterministic draw from
  // the shared biome pool (camoPolicy.ts autoCamoPatternIdFor): the same tank
  // always resolves the same scheme on the same map, so the garage AUTO
  // preview, the battle paint and the repaint cache agree. A bot's override
  // re-draws with the battle seed (fleet lane 2026-10-08).
  return autoCamoPatternIdFor(spec, activeBiome, CAMO_OVERRIDE.has(spec.id) ? battleCamoSeed : null);
}

/** Resolve trusted match material input without local storage. The internal
 * urban painter is a concrete AUTO result, not an addition to the wire allowlist.
 * AUTO reads the vehicle's nation and era from the registry spec every peer
 * shares; a bare id (no nation) keeps the shared biome pool. */
export function resolveMultiplayerCamoPattern<Value>(
  vehicle: string | AutoCamoVehicle,
  selection: Value,
  mapId: string = activeBiome,
): AutoCamoPatternId {
  const safe = selection === 'urban' ? 'urban' : networkCamoId(selection);
  if (safe !== 'auto') return safe;
  return autoCamoPatternIdFor(typeof vehicle === 'string' ? { id: vehicle } : vehicle, mapId);
}

// camo r8: season tags per pattern (WoT model — the paint bonus needs the
// camo SEASON to match the map biome, not the exact auto pattern). For the
// original six this is behavior-identical to the old `pat ===
// BIOME_PATTERN[activeBiome]` check (summer<->verdant, desert<->desert,
// winter<->winter, internal urban<->urban; digital never matched and still
// never does). New schemes join the family their palette belongs to, so a
// hand-picked MERDC earns the bonus on grass exactly like 'summer' does,
// desert-family paints earn on the hay-gold steppe, urban paints in the
// railyard, and 'naval' has its niche on the coastal map. Style-only schemes
// (digital, dazzle, splinter, ambushdot — dun/grey paints with no clear
// biome) never qualify, like 'digital' always behaved.
const PATTERN_SEASON: Readonly<Record<string, readonly string[]>> = {
  summer: ['verdant', 'coastal'], merdc: ['verdant', 'coastal'], tropic: ['verdant'],
  desert: ['desert', 'steppe'], pinkdesert: ['desert', 'steppe'],
  winter: ['winter'], washworn: ['winter'],
  urban: ['urban', 'railyard'], urbanblock: ['urban', 'railyard'],
  autumn: ['autumn'], naval: ['coastal'],
  // camo r2 expansion — each new scheme joins its palette's family (the r8
  // rule). hexfield/midnight are style-only (no clear biome) and never
  // qualify, exactly like digital/dazzle/splinter/ambushdot.
  flecktarn: ['verdant'], amoeba: ['verdant'], dpm: ['verdant', 'coastal'],
  tigerstripe: ['verdant'], m90: ['verdant'],
  chocchip: ['desert', 'steppe'], digitaldesert: ['desert', 'steppe'],
  merdcwinter: ['winter'], winterbands: ['winter'],
  berlin: ['urban', 'railyard'], oakleaf: ['autumn'],
};

/**
 * True when the tank's resolved pattern MATCHES the active battlefield biome
 * (spotting camo paint bonus — state.ts getCamoBonus consumes this).
 * camo_spotting r3: WoT grants the paint bonus only when the camo season
 * matches the map type — that is what makes AUTO strategically meaningful.
 * AUTO always qualifies: it is the biome's own choice for this vehicle — the
 * nation's scheme for the biome's environment or a member of the biome's
 * shared pool (round 3, 2026-10-07; before the national schemes it was always
 * a pool member, so the verdict is unchanged). The second clause below grants
 * hand-picked pool members on their own biome even where the biome is not in
 * the pattern's season list.
 * A mismatched manual pick (winter paint on the desert map) still repaints
 * the tank but earns no concealment bonus. Factory preserves any seasonal
 * benefit the vehicle's stock recipe already had.
 */
export function hasCamoPaint(specId: string): boolean {
  const selection = effectiveCamoSelection(specId);
  if (selection === 'auto') return true;
  if (selection === CUSTOM_CAMO_ID) return false; // a local custom paint never matches a season or a pool
  const pat = selection === 'factory' ? stockCamoPatternIdFor(specId) || selection : selection;
  if (pat === 'factory') return false;
  // second clause: pool membership (camo r2 — the biome rows are pools).
  const pool: readonly string[] = AUTO_CAMO_BIOMES[activeBiome]?.pool || [];
  return (PATTERN_SEASON[pat] || []).includes(activeBiome)
    || pool.includes(pat);
}

function applySharedCamoVisual(
  authored: MaterialVisual,
  patternId: MaterialPatternId,
): MaterialVisual | null {
  const preset = sharedCamoPreset(patternId);
  if (!preset) return null;
  const recipe = preset.visual;
  // Reset every pattern-morphology knob as well as the visible palette. A
  // reusable preset must look the same on an Abrams and a T-90 instead of
  // accidentally inheriting either builder's authored patch density.
  return {
    ...authored,
    scheme: recipe.scheme,
    base: recipe.base,
    weather: recipe.weather,
    patches: [...recipe.patches],
    camoScale: recipe.camoScale,
    patchK: recipe.patchK,
    digitalCellK: recipe.digitalCellK,
    solidWeatheringIntensity: recipe.solidWeatheringIntensity,
    bandAngle: undefined,
    blackK: undefined,
    rainK: undefined,
    catalogPattern: fleetCamoArtId(recipe.scheme),
  };
}

/** Round 32: the noise stream a camo pattern paints with — keyed by the visible recipe and the pattern id, never the
 * hull, so a shared preset lays out identically on every vehicle and re-bakes are byte-comparable. */
export function camoPatternIdHash(patternId: string): number {
  let h = 0;
  for (const ch of patternId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

export function camoPatternStreamSeed(visual: MaterialVisual, patternHash: number): number {
  const recipe = `${visual.scheme || 'solid'}|${visual.base}|${visual.weather}|${(visual.patches || []).join(',')}|${visual.camoScale ?? ''}`;
  let h = 0x2c1b3c6d ^ (visual.patternSeedId ? camoPatternIdHash(visual.patternSeedId) : patternHash | 0);
  for (const ch of recipe) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

function factoryVisual(spec: MaterialTankSpec, authored: MaterialVisual): MaterialVisual {
  const patternId = stockCamoPatternIdFor(spec.id, spec.nation, spec.era);
  return patternId ? { ...patternVisual(spec, patternId), patternSeedId: patternId }
    : { ...authored, catalogPattern: fleetCamoArtId(authored.scheme) };
}

const NEUTRAL_PATTERN_MORPHOLOGY: Readonly<Pick<MaterialVisual,
  'camoScale' | 'patchK' | 'digitalCellK' | 'solidWeatheringIntensity' | 'bandAngle' | 'blackK' | 'rainK'>> = Object.freeze({
  camoScale: undefined, patchK: undefined, digitalCellK: undefined, solidWeatheringIntensity: undefined,
  bandAngle: undefined, blackK: undefined, rainK: undefined,
});

function patternVisual(spec: MaterialTankSpec, patternId: MaterialPatternId): MaterialVisual {
  const v = spec.visual || { base: '#5a6b46', weather: '#6f7d55', scheme: 'solid', patches: [] };
  const custom = parseCustomCamoPatternId(patternId);
  if (custom) {
    const base = hexToRgb(custom.base);
    const weather = scale3(base, 1.10).map((channel) => Math.min(255, channel));
    const scheme = custom.style === 'blotch' ? 'nato' : custom.style;
    return {
      ...v,
      scheme,
      base: custom.base,
      weather: `#${weather.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`,
      patches: [custom.colorA, custom.colorB],
      // Higher repeat means smaller, more frequent shapes on the hull.
      camoScale: 0.72 - (custom.repeat / 100) * 0.47,
      patternRepeat: custom.repeat,
      drawStrokes: custom.strokes,
      drawRepeatX: custom.repeatX,
      drawRepeatY: custom.repeatY,
      drawRotation: custom.rotation,
      drawMirror: custom.mirror,
    };
  }
  const shared = applySharedCamoVisual(v, patternId);
  if (shared) return shared;
  if (patternId === 'signature') {
    if (!hasSignatureCamo(spec.id)) return factoryVisual(spec, v);
    const signatureId = signatureCamoPatternId(spec.id);
    return signatureId ? applySharedCamoVisual(v, signatureId) || v : v;
  }
  if (patternId === 'factory') {
    return factoryVisual(spec, v);
  }
  let o: Partial<MaterialVisual> | null = null;
  const selectCorePattern = (): void => {
    if (patternId === 'summer') {
    // brown dropped toward NATO chocolate — '#54402e' flared orange under
    // the warm garage key (r7); r8 pulls it further off red ('#4c3a2a' still
    // leaned warm on the WW2 Dunkelgelb hulls next to Hinterhalt references)
    // r1: black patch albedo floor lifted #26291f -> #2e2e2e — the old tone
    // clipped to unlit pure black under any key (critic: "NATO black patches
    // clip to pure black with zero material response").
    // camo_spotting r3: red-brown desaturated/cooled another step ('#46392b'
    // sat 0.39 drifted pinkish/salmon on WWII turrets under the warm garage
    // key — t34_85 summer turret critique); '#423a30' keeps the earth-brown
    // read at sat ~0.27 without the red flare.
    // camo_spotting r4 (critic: T-34-85 'summer' "reads as faded/winterized
    // MERDC rather than a Soviet summer scheme where 4BO green should
    // dominate"): USSR/Russia vehicles get a 4BO-dominant summer — green
    // field base with a darker green shadow tone and one muted earth accent
    // (the NATO black chip is a Western signature). Other nations keep the
    // NATO 3-color, pulled a half-step deeper with the m1a2 factory greens.
    // camo_spotting r6 (critic: m1a2 summer "reads monotone olive at mid
    // distance, black component underweighted"): black '#2e2e2e'->'#292929'
    // and brown '#423a30'->'#3e352a' — one value step down each so both
    // pattern tones separate from the green base at 50-150 m. Still well off
    // the '#26291f' floor that clipped to unlit pure black (r1); the m1a2's
    // Keep the Tiger's already-good summer patch geometry unchanged.
    if (spec.nation === 'USSR' || spec.nation === 'Russia') {
      o = { scheme: 'nato', base: '#4a5638', weather: '#556042', patches: ['#333d2a', '#4a3f2e'] };
    } else {
      o = { scheme: 'nato', base: '#49543e', weather: '#545f47', patches: ['#292929', '#3e352a'] };
    }
  } else if (patternId === 'desert') {
    // 3-tone hard-edged desert geometry (scheme 'desert' in paintCamo):
    // patches = [dark shadow tan, mid earth, pale sand highlight].
    // Widened lightness split (r6: the old tones mipped to a uniform tan
    // wash at garage distance — the geometry has to survive at 12 m).
    // r9: highlight pulled down '#e4d3a8' -> '#d3bf92' — under the warm
    // garage key the old chip blew out toward pure white on tiger1/strv103/
    // m1a2 and the scheme read as high-contrast "chocolate chip" dazzle
    // (coverage is also trimmed ~25% in the desert painter above).
    // camo_spotting r6 (critic: m1a2 desert "near-white cream blobs against
    // mid-brown ... read as dazzle/giraffe patches rather than a low-contrast
    // military desert scheme"): the AUTHORED ladder is now the ON-TEXTURE
    // ladder — the painter's darkHC 0.74x push and paleHC white lift are
    // retired (they widened the delta the palette had just been tuned to).
    // pale '#d3bf92'->'#cbb489' (sand, not cream) and dark '#6b5136'->
    // '#7a5f43' land an even ~26-step luma ladder (100/126/151/182): the
    // pale-vs-dark delta drops ~39% to Sinai-scheme territory while all four
    // tones still separate at garage distance.
    o = { scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#7a5f43', '#947c52', '#cbb489'] };
  } else if (patternId === 'winter') {
    // r8: base dropped off near-white — '#c4c8bf' blew out to a featureless
    // white mass under the garage key (r7 winter critique); a worn grey-green
    // whitewash keeps panel definition and stays inside matte-paint range.
    // r10 (critic: winter still blew out to unlit near-white on the M1A2):
    // base clamped into the ~0.62 dirty-whitewash band — real winter wash is
    // chalky grey over dark paint, never near-white; the painter adds worn
    // base bleed + ochre grime (see the winter scheme in paintCamo).
    // camo_spotting r5 (critic MAJOR: the wash was authored WARM — '#9ba18f'
    // is a green-yellow grey that the warm garage key pushed to cream/tan,
    // and the AUTO T-90M read ivory against the cool blue snow): base and
    // weather cooled ~15-20 units toward neutral/blue-grey at the SAME luma
    // (#9ba18f -> #99a1a2, B +19 / R −2), so under a warm key the wash lands
    // on neutral chalk-white and on the winter field it sits inside the
    // snow's cool cast. The painter's stroke/grime tones cool with it.
    o = { scheme: 'winter', base: '#99a1a2', weather: '#7b8384', patches: [v.base || '#4b5320'] };
  } else if (patternId === 'urban') {
    // biome-resolved only (camoPolicy.ts AUTO_CAMO_BIOMES): urban gray 3-tone.
    // History: r7 found pure concrete gray alien on the green approach
    // fields, r4 pulled it toward moss — and the r5 critic showed the moss
    // hybrid GRADES OUT TO OLIVE under the town map's warm/green grade (a
    // player T-90M turret crop read near-identical to 'summer', defeating
    // the biome-specific scheme). The palette is now TRUE NEUTRAL GRAY:
    // green-channel bias killed (|G−B| <= 3 on every tone vs 12-21 before)
    // and the luminance ladder widened (dark 56 / base 95 / light 133) so
    // the scheme still separates from summer after the map grade pushes it
    // warm. The opening-meadow mismatch is accepted — an urban scheme's job
    // is the town core, and AUTO's +3.5% is a sim bonus, not a promise the
    // paint works on grass.
    o = { scheme: 'nato', base: '#5d605e', weather: '#6a6d6a', patches: ['#36383a', '#838685'] };
  } else if (patternId === 'digital') {
    const nation = spec.nation;
    if (nation === 'Germany') {
      // r9: brown pulled toward RAL 8031 — '#6b5136' flared orange under the
      // warm garage key (giraffe-dot critique rode partly on the color).
      o = { scheme: 'fleck', base: '#57604a', weather: '#616a53', patches: ['#39492f', '#584a39', '#2b2d26'] };
    } else if (nation === 'USSR' || nation === 'Russia') {
      // three tones (dark, muted khaki, mid-green) so the digital field reads
      // as camouflage rather than sparse tan stickers on flat green (r6).
      // r7: khaki + sage pulled darker — the old #8a7f5a/#55624a pair rendered
      // as minty pastel confetti under the garage key light.
      // r8 legibility: the r7 ladder collapsed at pedestal distance — '#485541'
      // was near-identical to the '#3f5138' base and the khaki too muted, so
      // the T-90M read as flat green with rust speckle. Tones re-spread
      // (near-black / light khaki / light-mid green) + digitalCellK doubles
      // the cell lattice so 2-3 distinct blocks read per hull panel at 12 m.
      o = { scheme: 'digital', base: '#3f5138', weather: '#47593f',
        patches: ['#262a20', '#7d7355', '#54683f'], digitalCellK: 2.2 };
    } else {
      o = { scheme: 'digital', base: '#4a5442', weather: '#525c49', patches: ['#333d30', '#79806a', '#23261f'] };
    }
    }
  };
  selectCorePattern();

  const selectFieldPattern = (): void => {
    if (patternId === 'merdc') {
    // MERDC US 4-color (Summer Verdant table): forest-green field + light
    // green second dominant, sand + black accents. Light green kept muted
    // ('#5f6a4c' family — the calibrated factory-patch value from the m1a2
    // work) so the warm garage key can't push it minty; sand sits a step
    // under the desert mid so it reads accent, never highlight bloom.
    o = { scheme: 'merdc', base: '#44513a', weather: '#4e5b41',
      patches: ['#5f6a4c', '#8f8259', '#2b2e28'] };
  } else if (patternId === 'tropic') {
    // Deep jungle blotch: two greens darker than every 'summer' tone plus a
    // rotted-earth accent — the darkest green family in the picker so it
    // separates from summer/merdc at a glance.
    o = { scheme: 'blotch', base: '#3d4a33', weather: '#46543a',
      patches: ['#262f1e', '#535f3c', '#3a3126'] };
  } else if (patternId === 'autumn') {
    // Autumn foliage blotch (pre-staged for the autumn map): faded tan-olive
    // field with rust + olive-brown masses — the only warm-green/orange
    // ladder in the set. Rust kept at '#6e4527' (well under the '#7a4a35'
    // Rotbraun that flared orange in r7) so the warm key reads leaf-brown.
    o = { scheme: 'blotch', base: '#6f6242', weather: '#7c6f4b',
      patches: ['#6e4527', '#4c482e', '#33291d'] };
  } else if (patternId === 'urbanblock') {
    // Selectable urban geometry (Berlin-brigade blocks) — distinct from the
    // AUTO-only 'urban' nato-grey: TRUE NEUTRAL greys (|G-B|<=3, the r5
    // urban lesson — green bias grades to olive under the town map's warm
    // grade) on an architectural rectangle field.
    o = { scheme: 'blocks', base: '#6e716f', weather: '#787b79',
      patches: ['#494c4b', '#8b8d8b', '#303233'] };
  } else if (patternId === 'washworn') {
    // Field whitewash, heavily worn — the campaign-weary sibling of
    // 'winter' (which reads as a maintained wash). Base a step dirtier than
    // winter's '#99a1a2' at the same cool cast (the r5 warm-drift lesson);
    // patches[0] carries the factory paint that shows through, same
    // contract as 'winter'.
    o = { scheme: 'washworn', base: '#8f9694', weather: '#767d7c',
      patches: [v.base || '#4b5320'] };
  } else if (patternId === 'pinkdesert') {
    // British desert pink (Caunter-family): stone-pink base under parallel
    // slate blue-grey + dark earth diagonals. Pink kept at sat ~0.25 so the
    // warm key lands on dusty stone, not salmon (the r3 salmon lesson).
    o = { scheme: 'caunter', base: '#b09989', weather: '#bba496',
      patches: ['#727a79', '#5d574c'] };
  } else if (patternId === 'splinter') {
    // WWII German Splittertarn: green + red-brown hard wedges over tan.
    // Tones ride the calibrated Hinterhalt family (olivgruen '#4c5a3c'
    // cousin, Rotbraun kept chocolate-dark per the tiger1 r8 lesson).
    o = { scheme: 'splinter', base: '#9c8a5f', weather: '#a89468',
      patches: ['#49573a', '#54372a'] };
  } else if (patternId === 'ambushdot') {
    // Hinterhalt-Tarnung as a PICKER choice (the ambush painter was
    // factory-only on panther_g/tiger1 until now): Dunkelgelb field, RAL
    // 6003/8017 patches — the calibrated panther_g values verbatim.
    o = { scheme: 'ambush', base: '#a08b5e', weather: '#8f7c52',
      patches: ['#5d6334', '#553826'] };
  } else if (patternId === 'naval') {
    // Coastal/naval grey-blue: the 'stripes' sprayed-band painter pinned
    // HORIZONTAL (bandAngle 0.06 ~ sea-line waves) in two blue-greys over
    // mid grey-blue. The only cool-blue family in the picker.
    o = { scheme: 'stripes', base: '#5d666d', weather: '#67707a',
      patches: ['#39434d', '#7d868e'], bandAngle: 0.06 };
  } else if (patternId === 'dazzle') {
    // Angular high-contrast dazzle: near-black / pale grey / slate wedges.
    // Pale chip '#b4bac0' (~luma 183) stays under the 198 composite ceiling
    // and inside the matte band after the 0.86 exposure trim.
    o = { scheme: 'dazzle', base: '#667077', weather: '#5d666d',
      patches: ['#2b2e32', '#b4bac0', '#46525f'] };
    }
  };
  if (!o) selectFieldPattern();

  const selectTacticalPattern = (): void => {
    if (patternId === 'flecktarn') {
    // camo r2: universal German spot-cluster dapple (the 'fleck' painter was
    // Germany-only through 'digital' until now). Tones sit half a step off
    // the German digital palette — RAL-B-variant field green a touch darker
    // — so a German tank owning both still reads two distinct paints.
    // Brown obeys the RAL 8031 warm-key lesson (sat ~0.25, never orange).
    o = { scheme: 'fleck', base: '#525a45', weather: '#5c644e',
      patches: ['#36452c', '#594b3b', '#2a2d25'] };
  } else if (patternId === 'amoeba') {
    // camo r2: Soviet WW2 kumovka — huge rounded black-green amoebas + a
    // sparse ochre accent over 4BO (the calibrated USSR-summer green family,
    // so the base coat sits exactly where Soviet factory paint already
    // renders well under the garage key).
    o = { scheme: 'amoeba', base: '#4a5638', weather: '#535f41',
      patches: ['#2e3325', '#655a35'] };
  } else if (patternId === 'dpm') {
    // camo r2: UK brush-stroke DPM — green/brown/black strokes over khaki.
    // Brown '#4f3d2c' keeps sat ~0.28 (the r3 salmon lesson); black rides
    // the '#2e2e2e'-family floor so it never clips unlit (r1 lesson).
    o = { scheme: 'brush', base: '#7d7350', weather: '#877d59',
      patches: ['#4c5738', '#4f3d2c', '#2c2e28'] };
  } else if (patternId === 'tigerstripe') {
    // camo r2: SEA gunship tiger stripe — near-black claws + pale khaki
    // interstripes over mid olive. Dark stripe '#272b22' stays a step above
    // the pure-black clip floor; pale '#6c7050' is the calibrated muted
    // khaki family (never minty under the warm key).
    o = { scheme: 'tigerstripe', base: '#4d5340', weather: '#575d47',
      patches: ['#272b22', '#6c7050', '#3b4530'] };
  } else if (patternId === 'm90') {
    // camo r2: Nordic M90-family splinter — the interlocking hard-wedge
    // painter with rainK 0 (no Regenstreifen) and LARGER fields (patchK),
    // in cool Nordic greens: light-green wedges + deep green + cold
    // black-grey over the mid field. The K2/Strv hard-edge crowd.
    o = { scheme: 'splinter', base: '#47523c', weather: '#505b44',
      patches: ['#2b3728', '#26292b', '#5d6852'], rainK: 0, patchK: 1.3 };
  } else if (patternId === 'chocchip') {
    // camo r2: US 6-color desert. Base/bands stay in the calibrated desert
    // tan family; the cookie pale '#c3c7c6' (~luma 197) holds under the 198
    // composite ceiling and lands matte after the 0.86 exposure trim; chips
    // ride the '#2e2e2e'-family black floor, slightly warm.
    o = { scheme: 'chip6', base: '#b39c72', weather: '#c1ab80',
      patches: ['#8a6f4e', '#c7b68c', '#c3c7c6', '#33342f'] };
  } else if (patternId === 'digitaldesert') {
    // camo r2: tan digital (MARPAT-desert counterpart of the green
    // 'digital'). Three-stop tan ladder ~26 luma steps apart (the desert r6
    // even-ladder rule) so the pixel field survives mipping at 12 m without
    // reading as dazzle; same two-scale painter as 'digital'.
    o = { scheme: 'digital', base: '#a8905f', weather: '#b59d6d',
      patches: ['#c6b487', '#7a6041', '#57503f'], digitalCellK: 1.5 };
  } else if (patternId === 'merdcwinter') {
    // camo r2: MERDC Winter Verdant — the 'merdc' two-dominant painter with
    // whitewash carrying the base half and forest green the patch half,
    // sand + black accents. Wash tones sit in winter's cooled neutral band
    // (the r5 warm-drift lesson): '#939a9b' is a step dirtier than winter's
    // '#99a1a2' at the same cool cast.
    o = { scheme: 'merdc', base: '#939a9b', weather: '#7d8486',
      patches: ['#46523e', '#8b7f5c', '#2c2f2a'] };
  } else if (patternId === 'winterbands') {
    // camo r2: field-expedient whitewash BANDS sprayed over the factory
    // green — the streak variant between 'winter' (full maintained wash)
    // and 'washworn' (scrubbed-off wash): broad cool-white sprayed bands
    // with the green showing between. Wash tones cool/neutral (r5 lesson);
    // base is the calibrated NATO-green family so the exposed paint reads
    // like the fleet's own.
    o = { scheme: 'stripes', base: '#43503a', weather: '#4b5842',
      patches: ['#a8adad', '#909698'] };
  } else if (patternId === 'berlin') {
    // camo r2: Berlin Brigade urban blocks — the architectural rectangle
    // painter in the TRUE-COOL ladder: white / blue-grey / mid grey over
    // light grey. The white '#c0c4c7' (~luma 195) holds under the 198
    // ceiling; the blue-grey may bias B>G (the r5 urban lesson only bans
    // GREEN bias, which grades to olive under the town map's warm grade).
    o = { scheme: 'blocks', base: '#9aa0a3', weather: '#8b9195',
      patches: ['#c0c4c7', '#5f6a74', '#7f868c'] };
  } else if (patternId === 'oakleaf') {
    // camo r2: autumn oak-leaf dapple — the 'fleck' cluster painter in the
    // autumn warm ladder (rust kept at the '#6e4527'-family sat that read
    // leaf-brown, not orange, in r7). Distinct from 'autumn' (big soft
    // blotch masses) by texture: leaf-scale dapple clusters.
    o = { scheme: 'fleck', base: '#6b5f40', weather: '#776a49',
      patches: ['#6e4a2b', '#4d4a2e', '#3a2f20'] };
  } else if (patternId === 'hexfield') {
    // camo r2: modern experimental hex mesh (Barracuda-net language) in the
    // muted green-grey family. Style-only — no biome bonus, like digital.
    o = { scheme: 'hexfield', base: '#4b5443', weather: '#535c4a',
      patches: ['#333c30', '#5f6852'] };
  } else if (patternId === 'midnight') {
    // camo r2: night-ops graphite — the 'nato' elongated-patch painter at
    // LOW contrast in near-black greys. Every tone sits at or above the
    // '#26...' floor that still models light (the summer-black lesson);
    // style-only, no biome bonus.
    o = { scheme: 'nato', base: '#33373a', weather: '#3a3e41',
      patches: ['#26292c', '#41464a'] };
    }
  };
  if (!o) selectTacticalPattern();

  const selectSpecialPattern = (): void => {
    if (patternId === 'claude') {
    // camo r3/r5 (owner asks): the HOUSE SCHEME — the Claude Code creature
    // itself, sprinkle to hero scale, in terracotta + slate on weathered
    // ivory (r5 dropped the disruptive field masses: they read as dots).
    // Ivory held at dirty-whitewash luma (the winter near-white blowout
    // lesson), terracotta desaturated a step so the warm garage key can't
    // flare it orange (the summer-brown lesson). Style-only — no biome
    // bonus, like dazzle/midnight.
    o = { scheme: 'claude', base: '#d3ccbc', weather: '#c2b9a7',
      patches: ['#b25a3d', '#3d3b37'] };
  } else if (patternId === 'spark') {
    // camo r4 (owner ask): the Claude spark at hero scale on warm ivory with
    // soft clay washes. Terracotta held a step below the app icon's #d97757
    // so the warm garage key can't flare it orange (the summer-brown
    // lesson). Style-only, no biome bonus.
    o = { scheme: 'spark', base: '#d8cbb5', weather: '#c6b8a0',
      patches: ['#b4593a', '#3a3733'] };
  } else if (patternId === 'openai') {
    o = { scheme: 'openai', base: '#b9bcb6', weather: '#aaafa8',
      patches: ['#000000', '#737d77'], camoScale: 0.5 };
  } else if (patternId === 'xai') {
    // Saved xai selections retain their ID; the owner now requests X's mark.
    o = { scheme: 'xai', base: '#2b2e34', weather: '#363b42',
      patches: ['#ffffff', '#83909f'], camoScale: 0.5 };
  } else if (patternId === 'gemini') {
    o = { scheme: 'gemini', base: '#293348', weather: '#35415a',
      patches: ['#9168c0', '#5684d1', '#1ba1e3'], camoScale: 0.5 };
  } else if (patternId === 'gt') {
    o = { scheme: 'gt', base: '#262626', weather: '#333333',
      patches: ['#ffffff', '#888888'], camoScale: 0.5 };
  } else if (patternId === 'mono') {
    o = { scheme: 'mono', base: '#303236', weather: '#3c3f43',
      patches: ['#dddcd5', '#899296'] };
  } else if (patternId === 'carbon') {
    o = { scheme: 'carbon', base: '#282a2e', weather: '#2f3136',
      patches: ['#f0f0ee', '#8a94a3'] };
  } else if (patternId === 'prism') {
    o = { scheme: 'prism', base: '#2a3358', weather: '#303a62',
      patches: ['#4f8cf0', '#a56ff0', '#ee82b0', '#eef0ff'] };
  } else if (patternId === 'ducky') {
    // camo r6 fun set: bath-toy gold on pond gray-blue, slate accents. All
    // ten r6 palettes respect the established ladders — light bases under
    // the ~198 whitewash ceiling, dark bases at or above the '#26' floor.
    o = { scheme: 'ducky', base: '#8798a3', weather: '#7b8c97',
      patches: ['#d9b13f', '#2e3338'] };
  } else if (patternId === 'suits') {
    o = { scheme: 'suits', base: '#d6cdbd', weather: '#c5bba9',
      patches: ['#9e3a3a', '#2b2b2e'] };
  } else if (patternId === 'flames') {
    o = { scheme: 'flames', base: '#292a2e', weather: '#303136',
      patches: ['#a83226', '#d97b35', '#e0b23f'] };
  } else if (patternId === 'leopardprint') {
    o = { scheme: 'leopardprint', base: '#c2a878', weather: '#b39a6c',
      patches: ['#8a5f38', '#2e2a26'] };
  } else if (patternId === 'bolt') {
    o = { scheme: 'bolt', base: '#4a4f57', weather: '#42474e',
      patches: ['#d9b13f', '#26292d'] };
  } else if (patternId === 'stars') {
    o = { scheme: 'stars', base: '#3a4254', weather: '#333b4c',
      patches: ['#e2d7ba', '#d9b13f'] };
  } else if (patternId === 'daisy') {
    o = { scheme: 'daisy', base: '#5a6b46', weather: '#52623f',
      patches: ['#e6ded0', '#c96a3a'] };
  } else if (patternId === 'circuit') {
    o = { scheme: 'circuit', base: '#2b4536', weather: '#263d30',
      patches: ['#c9a53f', '#86b096'] };
  } else if (patternId === 'racing') {
    o = { scheme: 'racing', base: '#c9c7bd', weather: '#b9b7ab',
      patches: ['#a83430', '#26282c'] };
  } else if (patternId === 'paintball') {
    o = { scheme: 'paintball', base: '#b9b9b2', weather: '#a9a9a2',
      patches: ['#3f7fbf', '#c9503f', '#58a05a', '#d9b13f'] };
    }
  };
  if (!o) selectSpecialPattern();

  const selectHistoricalPattern = (): void => {
    if (patternId === 'normandy44') {
    // camo r7 loadout set: US olive drab with the white invasion star.
    o = { scheme: 'star', base: '#57603f', weather: '#4e5738',
      patches: ['#ded8c8'] };
  } else if (patternId === 'berlin45') {
    // Soviet 4BO with the white air-recognition band + tactical number.
    o = { scheme: 'idband', base: '#4a5138', weather: '#525a3e',
      patches: ['#e0dccb'] };
  } else if (patternId === 'ardennes44') {
    // camo r8: dedicated brush-applied whitewash — directional strokes with
    // the olive drab dragging through in streaks (no soft blobs). patches =
    // [show-through OD, grime].
    o = { scheme: 'brushwash', base: '#9aa09c', weather: '#878d89',
      patches: ['#4c5539', '#6e6f64'] };
  } else if (patternId === 'pacific45') {
    // camo r8: late-war USMC — forest green under hard-edged black wave
    // bands, white hull number, coral-dust stipple. patches = [black band,
    // coral dust, stencil white].
    o = { scheme: 'usmc', base: '#46543d', weather: '#3e4b36',
      patches: ['#282e26', '#c2ab84', '#e3ded1'] };
  } else if (patternId === 'jungleops') {
    // camo r8: ERDL leaf language — interlocking HARD-EDGED organic islands
    // in four tones with black branch squiggles between. patches = [dark
    // green, brown, black].
    o = { scheme: 'erdl', base: '#5d6b44', weather: '#556240',
      patches: ['#3a4931', '#5a4632', '#262a24'] };
  } else if (patternId === 'rasputitsa') {
    // camo r8: mud SEASON, not mud blobs — washed 4BO under directional
    // spatter clusters, dragged smears and crusted dry patches. patches =
    // [wet mud, dry mud, dark spatter].
    o = { scheme: 'mudwash', base: '#575843', weather: '#4e4f3c',
      patches: ['#4a3b2a', '#6b5a42', '#332a20'] };
    }
  };
  if (!o) selectHistoricalPattern();
  const selected = o as Partial<MaterialVisual> | null;
  // Round 35 (owner 2026-09-21): a built-in pattern's morphology belongs to the pattern, never to the hull it is
  // worn on — the same reset the shared presets get in applySharedCamoVisual. Hull-relative COLOUR (winter
  // whitewash over the authored coat) still follows the hull; patch density, cell pitch and band knobs do not.
  if (!selected) return v;
  const resolved = { ...v, ...NEUTRAL_PATTERN_MORPHOLOGY, ...selected };
  const catalogPattern = catalogCamoArtId(patternId);
  if (catalogPattern) resolved.catalogPattern = catalogPattern;
  return resolved;
}

/** Resolved visual (spec.visual with the active pattern applied). */
export function resolveCamoVisual(
  spec: MaterialTankSpec,
  patternId: MaterialPatternId = resolveCamoPattern(spec),
): MaterialVisual {
  return patternVisual(spec, patternId);
}

// Scheme-painted running gear + fittings: real crews paint wheels and hull
// hardware in the vehicle scheme, so these solid colors derive from the
// ACTIVE pattern base, not the authored factory palette.
const cssRGB = (c: Rgb): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
// camo_spotting r2: winter running-gear whitewash is clamped ~15% darker than
// the hull wash — crews slop thinner coats on wheels and they shed to grime
// fast; at full hull luma the T-34-85's solid wheel discs rendered as
// near-white plastic toy rims under the warm garage key while the Tiger's
// tire-ringed wheels got away with it (r1 winter-consistency critique).
// camo_spotting r3: running gear follows the PATTERN FIELD, not the base
// coat alone. On patch-dominant schemes (digital/fleck cover most of the
// tile) base-only tinting left the T-34-85's wheel dishes reading as
// untouched factory 4BO right under a fully digital fender line ("mismatched
// kit seam" critique). The tint now blends the base toward the mean patch
// tone — heavily for digital/fleck, lightly for banded schemes — so wheels
// land inside the scheme's rendered tonal family. Winter keeps base (its
// patches[0] is the show-through UNDER color, not a top coat); solid has no
// patches.
const wheelToneOf = (v: MaterialVisual): Rgb => {
  const base = hexToRgb(v.base);
  const pats = (v.patches || []).map(hexToRgb);
  // camo r8: 'washworn' shares winter's contract — patches[0] is the
  // show-through UNDER color, not a top coat, so gear follows the wash base.
  if (!pats.length || v.scheme === 'winter' || v.scheme === 'washworn'
    || v.scheme === 'solid') return base;
  let mr = 0, mg = 0, mb = 0;
  for (const p of pats) { mr += p[0]; mg += p[1]; mb += p[2]; }
  const mean = scale3([mr, mg, mb], 1 / pats.length);
  const k = (v.scheme === 'digital' || v.scheme === 'fleck') ? 0.6 : 0.3;
  return mix(base, mean, k);
};
/**
 * Round 4 (2026-10-07; wave 215 on the M60A1, then in the US desert service coat: "the running gear reads as
 * brass-coloured, star-spoked toy rims"): a sand coat darkened into its gear tone turns bronze (the desert service
 * coat's #b09466 lands at #806d4d, HSL saturation 0.25 at lightness 0.40). Painted gear in a warm tone (hue 15-60
 * degrees: sand, khaki, brown) keeps at most this HSL saturation: dusty paint, not polished brass. Hue and HSL lightness
 * are kept; the olive and green coats sit under it and are unchanged (9 of the 118 catalog coats move, all sand or
 * khaki-brown).
 */
const WHEEL_WARM_MAX_SATURATION = 0.16;
const capWarmWheelSaturation = (c: Rgb): Rgb => {
  const max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]), d = (max - min) / 255;
  if (d <= 0) return c;
  const l = (max + min) / 510, s = d / (1 - Math.abs(2 * l - 1));
  let h = max === c[0] ? ((c[1] - c[2]) / (max - min)) % 6 : max === c[1] ? (c[2] - c[0]) / (max - min) + 2
    : (c[0] - c[1]) / (max - min) + 4;
  h = h * 60 < 0 ? h * 60 + 360 : h * 60;
  if (h < 15 || h > 60 || s <= WHEEL_WARM_MAX_SATURATION) return c;
  const mid = (max + min) / 2, k = WHEEL_WARM_MAX_SATURATION / s;
  return [mid + (c[0] - mid) * k, mid + (c[1] - mid) * k, mid + (c[2] - mid) * k];
};
const wheelRgbOf = (v: MaterialVisual): Rgb => {
  // r3: dust-mix cut 0.22 -> 0.12 and darkened — painted gear leaned BEIGE
  // under a warm key (the T-90M idler "beige rim" read); wheels now stay in
  // the scheme's tonal family with only a hint of dust.
  // camo_spotting r5: winter gear mixes toward cold slush-grey instead of
  // warm road dust — whitewashed wheels rode the same tan drift as the hull.
  const wash = v.scheme === 'winter' || v.scheme === 'washworn'; // camo r8
  const dust: Rgb = wash ? [102, 107, 110] : [118, 110, 86];
  const c = scale3(mix(scale3(wheelToneOf(v), 0.92), dust, 0.12), 0.84);
  // 2026-09-14 owner: dark schemes pushed the dish paint down to the tire's value and the wheels
  // read as one flat grey disc. The paint keeps the scheme's family but never drops below the
  // fleet wheel-paint floor (see wheelPaintFloor.ts).
  return liftSrgbToWheelFloor(capWarmWheelSaturation(wash ? scale3(c, 0.85) : c));
};
// Recessed interleaved-row wheels bake their own occlusion: same scheme paint
// dropped toward shadow so the Schachtellaufwerk rows separate (r5). Kept at
// 0.66 — the old 0.5 rendered near-black in the wheel bay and the recessed
// rows read as GAPS between sparse floating wheels (r6 Tiger closeup).
const wheelDarkRgbOf = (v: MaterialVisual): Rgb => scale3(wheelRgbOf(v), 0.66);
const detailRgbOf = (v: MaterialVisual): Rgb => scale3(mix([65, 70, 58], wheelToneOf(v), 0.5), 0.9);
const canvasRgbOf = (v: MaterialVisual): Rgb => scale3(detailRgbOf(v), 0.68);

function repaintEntry(entry: SharedTextureEntry, patternId: MaterialPatternId): void {
  const { feats, camoTex, roughTex } = entry;
  if (!feats || !camoTex || !roughTex) {
    throw new Error(`vehicle material cache entry ${entry.cacheKey} is incomplete`);
  }
  const vis = { ...patternVisual(entry.spec, patternId), modernWelds: isPostwarVehicleEra(entry.spec.era) };
  // pattern-specific rng stream; the shared `feats` plan keeps panel lines,
  // welds and bolts aligned with the (unchanged) normal map.
  const ph = camoPatternIdHash(patternId);
  entryPaintState(entry).revision++;
  // Round 32 (owner 2026-09-21: "when i switch tanks the camo seeding literally changes, which is wasteful"): the
  // pattern stream is keyed by the pattern alone, so one camo lays out identically on every hull.
  paintCamo(entry.camoCanvas, vis, mulberry32(camoPatternStreamSeed(vis, ph)), feats, entry.seed);
  exposureTrim(entry.camoCanvas);
  camoTex.needsUpdate = true;
  // camo_spotting r4: the roughness map follows the repaint so each pattern's
  // per-patch paint response lands with it (albedo-only repaints read as
  // printed vinyl — critic r4). Same `feats` plan keeps chips/lines aligned
  // with the normal map; the stochastic dust layer redraws from a
  // pattern-keyed stream, which is invisible at paint scale.
  paintRoughness(entry.roughCanvas, mulberry32(entry.seed ^ ph ^ 0x9e37), feats);
  paintPatchRoughness(entry.roughCanvas, entry.camoCanvas, vis);
  roughTex.needsUpdate = true;
  entry.patternId = patternId;
  retintEntryFittings(entry, vis);
  // camo r4: memoize the finished bake — the next visit to this
  // (spec, pattern) pair restores in a couple of blits instead of repainting.
  snapshotBake(entry, patternId);
}

/** RUNNING-GEAR FINISH (owner 2026-09-22, runningGearFinish.ts): the scheme wheel paint records the hex it was
 * tinted to, so the release audit (wheelQuality.ts) can tell a paint that still carries its scheme tone from one a
 * profile retinted or cloned toward an arbitrary hex — the clone copies the stamp with the userData, the retint
 * leaves the colour and the stamp disagreeing. The non-rendering material set (tankFactoryCore.ts) stamps too. */
export function stampSchemeFinish(material: THREE.MeshStandardMaterial): void {
  material.userData = { ...(material.userData || {}), schemeFinishHex: material.color.getHex() };
}

// Wheels, sprockets, fittings and the solid kit canvas follow every repaint
// and memoized restore through this one tint gate.
function retintEntryFittings(entry: SharedTextureEntry, vis: MaterialVisual): void {
  for (const rec of entry.paintable) {
    const c = rec.kind === 'wheels' ? wheelRgbOf(vis)
      : rec.kind === 'wheelsDark' ? wheelDarkRgbOf(vis)
        : rec.kind === 'canvas' ? canvasRgbOf(vis) : detailRgbOf(vis);
    rec.m.color.set(cssRGB(c));
    if (rec.kind === 'wheels' || rec.kind === 'wheelsDark') stampSchemeFinish(rec.m);
  }
  if (entry.kitCanvas && entry.kitTex) {
    paintKitCanvas(entry.kitCanvas, vis);
    entry.kitTex.needsUpdate = true;
  }
}

// ---- camo r4: instant pattern switching (owner ask 2026-08-07) ------------
// "switching between camos should be instant". A picker click used to run the
// full painter chain — paintCamo on a 2048^2 hero albedo + exposureTrim +
// both roughness passes — measured 0.3-1.4 s of main-thread canvas work per
// switch. Repaints are now MEMOIZED: every finished bake is snapshotted to
// compressed blobs (the webp encode runs off the main thread and toBlob
// captures at-call, so a later repaint can't tear the snapshot) and the
// picker restores a cached pattern with two drawImage blits + GPU re-upload.
// Blobs, not live canvases: a spec's 30-pattern roster held as RGBA canvases
// would be ~0.5 GB at hero size; as webp it sits near ~15 MB.
interface CachedBake {
  camo: Blob;
  rough: Blob;
  w: number;
}

const BAKE_CACHE = new Map<string, CachedBake>(); // `${specId}|${patternId}` -> {camo,rough:Blob,w}
const BAKE_CACHE_MAX = 64;    // ~2 specs' full pattern rosters
const bakeKey = (specId: string, pid: MaterialPatternId): string => `${specId}|${pid}`;
function bakeStore(key: string, camo: Blob | null, rough: Blob | null, w: number): void {
  if (!camo || !rough || BAKE_CACHE.has(key)) return;
  while (BAKE_CACHE.size >= BAKE_CACHE_MAX) {
    const oldest = BAKE_CACHE.keys().next().value;
    if (oldest === undefined) break;
    BAKE_CACHE.delete(oldest); // insertion-order LRU
  }
  BAKE_CACHE.set(key, { camo, rough, w });
}
function canvasToBlob(canvas: HTMLCanvasElement, cb: (blob: Blob | null) => void): void {
  // lossy webp at q0.92 is invisible under the weathering/grain stack and
  // ~8x smaller than png; a null blob (no webp encoder) falls back to png.
  try {
    canvas.toBlob((b) => {
      if (b) cb(b);
      else canvas.toBlob((p) => cb(p || null), 'image/png');
    }, 'image/webp', 0.92);
  } catch (_) { cb(null); }
}
function snapshotBake(entry: SharedTextureEntry, patternId: MaterialPatternId): void {
  const key = bakeKey(entry.spec.id, patternId);
  if (BAKE_CACHE.has(key)) return;
  const w = entry.camoCanvas.width;
  let camo: Blob | null = null;
  let rough: Blob | null = null;
  let n = 0;
  const done = () => { if (++n === 2) bakeStore(key, camo, rough, w); };
  canvasToBlob(entry.camoCanvas, (b) => { camo = b; done(); });
  canvasToBlob(entry.roughCanvas, (b) => { rough = b; done(); });
}
/**
 * Restore a memoized bake onto the entry's live canvases. Resolves true on a
 * cache hit (canvases, fittings and patternId updated — or a newer selection
 * superseded this one mid-decode and owns the entry now), false when this
 * (spec, pattern) pair was never baked at the current canvas size (caller
 * falls back to repaintEntry).
 */
async function restoreBake(entry: SharedTextureEntry, patternId: MaterialPatternId): Promise<boolean> {
  const key = bakeKey(entry.spec.id, patternId);
  const bake = BAKE_CACHE.get(key);
  if (!bake) return false;
  if (bake.w !== entry.camoCanvas.width) { // baked at another quality tier
    BAKE_CACHE.delete(key);
    return false;
  }
  BAKE_CACHE.delete(key); BAKE_CACHE.set(key, bake); // LRU touch
  let cb: ImageBitmap;
  let rb: ImageBitmap;
  try {
    [cb, rb] = await Promise.all([
      createImageBitmap(bake.camo), createImageBitmap(bake.rough)]);
  } catch (_) {
    BAKE_CACHE.delete(key); // undecodable — bake fresh on the fallback path
    return false;
  }
  if (resolveCamoPattern(entry.spec) !== patternId
    || entry.patternId === patternId) {
    // superseded (or already landed) while the bitmaps decoded — the newer
    // selection's own restore/repaint owns the entry, don't fight it.
    cb.close(); rb.close();
    return true;
  }
  const blit = (canvas: HTMLCanvasElement, bmp: ImageBitmap): void => {
    const c2 = canvas2d(canvas);
    c2.save();
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.globalAlpha = 1;
    c2.globalCompositeOperation = 'source-over';
    c2.filter = 'none';
    c2.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    c2.restore();
  };
  entryPaintState(entry).revision++;
  blit(entry.camoCanvas, cb); cb.close();
  blit(entry.roughCanvas, rb); rb.close();
  if (entry.camoTex) entry.camoTex.needsUpdate = true;
  if (entry.roughTex) entry.roughTex.needsUpdate = true;
  entry.patternId = patternId;
  retintEntryFittings(entry, patternVisual(entry.spec, patternId));
  return true;
}

/**
 * Repaint every cached tank albedo whose resolved pattern changed (after a
 * selection change or a biome switch). Cheap when nothing changed.
 * @param {?string} onlySpecId limit to one tank
 */
export function applyCamoPatterns(onlySpecId: string | null = null): void {
  for (const entry of TEX_CACHE.values()) {
    if (entry.fixedPattern || (onlySpecId && entry.spec.id !== onlySpecId)) continue;
    const pid = resolveCamoPattern(entry.spec);
    if (entry.patternId !== pid) repaintEntry(entry, pid);
  }
}


// perf-r2f (journey probe): the no-arg sweep above repaints EVERY stale cache
// entry in one task — a biome flip with a warm 7-tank cache is ~0.3-1.4 s of
// canvas painting PER ENTRY, which froze the garage on a map pick and pinned
// the battle loading bar for many seconds on a rematch. This variant yields a
// real painted frame between entries and re-resolves each pattern AT PAINT
// TIME, so overlapping drains (rapid map-card scrubbing) converge on the last
// selection instead of painting stale patterns. A newer drain cancels the
// remainder of an older one outright (the newer pass owns every stale entry).
let _camoSweepGen = 0;

function camoSweepKeys(opts: CamoApplyOptions | null): string[] {
  const priorityIds = opts?.priorityIds || [];
  const onlyIds = opts?.onlySpecIds?.length ? new Set(opts.onlySpecIds) : null;
  return [...TEX_CACHE.keys()]
    .filter((key) => {
      const specId = TEX_CACHE.get(key)?.spec.id;
      return !onlyIds || (specId !== undefined && onlyIds.has(specId));
    })
    .sort((a, b) => {
      const aId = TEX_CACHE.get(a)?.spec.id;
      const bId = TEX_CACHE.get(b)?.spec.id;
      const aRank = !aId || priorityIds.indexOf(aId) < 0 ? 1 : 0;
      const bRank = !bId || priorityIds.indexOf(bId) < 0 ? 1 : 0;
      return aRank - bRank;
    });
}

interface StaleCamoEntry {
  entry: SharedTextureEntry;
  patternId: MaterialPatternId;
}

function staleCamoEntry(key: string): StaleCamoEntry | null {
  const entry = TEX_CACHE.get(key);
  if (!entry || entry.fixedPattern) return null;
  const patternId = resolveCamoPattern(entry.spec);
  return entry.patternId === patternId ? null : { entry, patternId };
}

async function yieldCamoSweep(delayMs: number, generation: number): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return generation === _camoSweepGen;
}

async function repaintCamoEntryChunked(
  entry: SharedTextureEntry,
  patternId: MaterialPatternId,
  generation: number,
): Promise<boolean> {
  const visual = {
    ...patternVisual(entry.spec, patternId),
    modernWelds: isPostwarVehicleEra(entry.spec.era),
  };
  const patternHash = camoPatternIdHash(patternId);
  const { feats, camoTex, roughTex } = entry;
  if (!feats || !camoTex || !roughTex) {
    throw new Error(`vehicle material cache entry ${entry.cacheKey} is incomplete`);
  }

  const paintState = beginEntryRepaint(entry);
  try {
    paintCamo(entry.camoCanvas, visual, mulberry32(camoPatternStreamSeed(visual, patternHash)), feats, entry.seed);
    if (!await yieldCamoSweep(16, generation)) return false;
    exposureTrim(entry.camoCanvas);
    camoTex.needsUpdate = true;
    if (!await yieldCamoSweep(16, generation)) return false;
    paintRoughness(entry.roughCanvas, mulberry32(entry.seed ^ patternHash ^ 0x9e37), feats);
    if (!await yieldCamoSweep(16, generation)) return false;
    paintPatchRoughness(entry.roughCanvas, entry.camoCanvas, visual);
    roughTex.needsUpdate = true;
    entry.patternId = patternId;
    retintEntryFittings(entry, visual);
    snapshotBake(entry, patternId);
    return true;
  } finally {
    endEntryRepaint(paintState);
  }
}

/**
 * Chunked equivalent of applyCamoPatterns(): one repaint per macrotask.
 * @param {{priorityIds?: string[],onlySpecIds?: string[]}} [opts] specs to
 *   repaint first, optionally restricting the sweep to currently relevant
 *   vehicles (pedestal hero or the fielded battle roster)
 * @returns {Promise<void>} resolves when every stale entry is repainted (or
 *   a newer sweep took over the remainder)
 */
export async function applyCamoPatternsChunked(opts: CamoApplyOptions | null = null): Promise<void> {
  const gen = ++_camoSweepGen;
  for (const key of camoSweepKeys(opts)) {
    if (gen !== _camoSweepGen) return; // superseded — the newer drain finishes
    if (!staleCamoEntry(key)) continue; // immutable and current entries need no work
    // yield BEFORE painting: the triggering click/frame paints first, and the
    // loading bar gets a frame between consecutive entry repaints.
    await new Promise((r) => setTimeout(r, 32));
    if (gen !== _camoSweepGen) return;
    const current = staleCamoEntry(key);
    if (!current) continue;
    // camo r4: memoized bakes short-circuit the painter chain — a biome
    // flip back onto patterns this session has already worn costs blits,
    // not repaints. The restore re-checks resolution after its decode
    // awaits, so a drain that got superseded mid-entry stays correct.
    if (await restoreBake(current.entry, current.patternId)) continue;
    if (gen !== _camoSweepGen) return;
    const pending = staleCamoEntry(key);
    if (!pending) continue;

    // A repaint used to be one 0.3-2.1 s task: albedo painter, exposure
    // scan, both roughness passes, fittings, and snapshot all ran without
    // returning to the browser. Preserve the exact painter/RNG output but
    // split the independent passes into paintable tasks. A superseding
    // sweep aborts between passes; its fresh albedo pass then owns the
    // same canvases from that point onward.
    if (!await repaintCamoEntryChunked(pending.entry, pending.patternId, gen)) return;
  }
}


/**
 * Shared per-spec roughness map for external consumers (community GLB camo
 * hulls take it so big untextured CAD plates get micro roughness variation
 * instead of one waxy constant — r7 "waxy single-color scan" critique).
 * @param {object} spec TankSpec
 * @returns {THREE.Texture}
 */
export function getSharedRoughnessTexture(spec: MaterialTankSpec): THREE.Texture {
  const entry = TEX_CACHE.get(spec.id) || acquireSharedTextures(spec, 4);
  if (!entry.roughTex) throw new Error(`vehicle material cache entry ${entry.cacheKey} has no roughness texture`);
  return entry.roughTex;
}

// tank_models r7: solid scheme-tone paint for bolt-on kit (ARAT ERA tiles,
// stowage boxes) — monotone like real CARC'd add-on armor, in the ACTIVE
// pattern's tonal family, with a hint of mottle so plates don't read as one
// dead constant. Canvas-backed so pattern switches repaint every live clone.
function paintKitCanvas(canvas: HTMLCanvasElement, vis: MaterialVisual): void {
  const ctx = canvas2d(canvas);
  const S = canvas.width;
  const base = wheelRgbOf(vis);
  ctx.fillStyle = cssRGB(base);
  ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(0x6b17);
  for (let i = 0; i < 6; i++) {
    const x = rng() * S, y = rng() * S, r = S * (0.2 + rng() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cssRGB(scale3(base, rng() < 0.5 ? 0.93 : 1.07)));
    g.addColorStop(1, cssRGB(base));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * Shared per-spec solid kit-paint texture (see paintKitCanvas). Lives on the
 * TEX_CACHE entry so repaintEntry restyles it with every pattern switch.
 * @param {object} spec TankSpec
 * @returns {THREE.Texture}
 */
export function getKitPaintTexture(spec: MaterialTankSpec): THREE.Texture {
  const entry = TEX_CACHE.get(spec.id) || acquireSharedTextures(spec, 4);
  if (!entry.kitTex) {
    entry.kitCanvas = makeCanvas(64, 64);
    paintKitCanvas(entry.kitCanvas, patternVisual(spec, entry.patternId));
    entry.kitTex = canvasTex(entry.kitCanvas, { aniso: 2, repeat: true });
  }
  return entry.kitTex;
}


// ======================= END CAMO PATTERN SECTION ==========================

// WoT-style vehicle readability floor (gameplay_feel r2: driving through tree
// shadow crushed the player hull to a featureless black silhouette — camo and
// detail invisible). Floor the indirect-diffuse term at a small fraction of
// the albedo so vehicles stay readable in full CSM/canopy shade; the max()
// only engages when the ambient stack (hemi + IBL) drops below the floor, so
// sunlit response and the key:fill ratio are untouched. Vehicles ONLY — the
// world keeps its deep shadows for contrast.
// 0.35 ≈ 2× the hemi+IBL ambient response: a clear lift out of black-crush
// while staying far under the ~4.5-intensity sunlit response (0.16 sat AT the
// ambient level and was invisible after ACES).
const VEHICLE_AMBIENT_FLOOR = 0.35;
// gameplay_feel r2 (critic MAJOR): the flat floor above was NOT enough — in
// live third-person drive captures the whole hull sat on the shadow side of
// the sun with dark-olive albedo (~0.08 luma), so 0.35×albedo ≈ 0.03 linear
// still crushed to a featureless black silhouette against sunlit grass.
// WoT keeps the player vehicle readable from EVERY bearing. Fix: a
// camera-anchored wrap fill — the indirect-diffuse floor scales with how much
// the surface faces the CAMERA (headlamp-style hemisphere fill), so whatever
// side the chase camera orbits to is lifted into readability while
// silhouette edges and camera-averted faces keep their shading. Applied to
// all vehicles (enemies must stay readable too — WoT does the same); the
// terrain/props keep their deep shadows for contrast. Sunlit response
// (~4.5×albedo direct) still dominates ~3:1, so lit-vs-shade hull form
// survives — verified no washout in tank_closeup_modern/garage/player_view.
// lighting_post r4: 1.45 → 0.55. At 1.45 the camera-facing floor EQUALED the
// full sun response (sun 4.5/π ≈ 1.43×albedo at N·L=1) — "the camera fill has
// erased directional modeling" (critic major). 0.55 ≈ 0.38× sun keeps the
// readability lift while N·L form shading reads again from every bearing.
// NOTE: the tank_models r10 high-albedo rolloff and the gameplay_feel r4
// shadow-band floor below are calibrated against THIS value ("~4x under the
// lit response") — do not raise it back.
const VEHICLE_VIEW_FILL = 0.55; // fill at full camera-facing (linear, ×albedo)
const VEHICLE_VIEW_WRAP = 0.40; // fraction kept at grazing angles (wrap term)
// Owner 2026-10-02 ("shadows on tanks make them look a lil flat"): both floors above set a shaded plate's light by
// how squarely it faced the LENS alone, so every lens-facing plate in shade came out one tone, and a deck, fender
// top or turret roof seen at a grazing angle took LESS fill than the flank below it: sky light upside down. The
// form fill aims the floors by the plate's WORLD orientation as well: VEHICLE_FORM_BASE everywhere, + VEHICLE_FORM_SKY
// as the plate turns to the sky (smoothstep over world normal y), + VEHICLE_FORM_SUN for a vertical face turned to the
// sun's bearing (the bright ground and sky on that side), and keeps VEHICLE_FORM_LENS of the old lens-facing term so
// the side a chase camera sees still lifts. Roofs and glacis read brightest in shade, flanks next, soffits and the
// undersides of overhangs dark; the aerial pass adds the hull's cavity occlusion on top (engine/vehicleOcclusion.ts).
const VEHICLE_FORM_BASE = 0.22;
const VEHICLE_FORM_SKY = 0.6;
const VEHICLE_FORM_SUN = 0.2;
const VEHICLE_FORM_LENS = 0.28;
// Ground occlusion: a hull's lower plates, running gear and track run see its own shadow on the ground and its own
// bulk instead of open sky, so their indirect light falls to VEHICLE_GROUND_DARK at the ground and recovers by
// VEHICLE_GROUND_H1 metres up the vehicle's own axis. Every vehicle material reads one reference (VEHICLE_GROUND);
// each vehicle mesh points it at its own root just before it draws and releases it after (tankFactoryCore.ts
// installVehicleGroundReference), so decorations, profile parts, clones and instanced gear all share it. Anything
// drawn without a root (thumbnail stubs, tooling) sees the far-below idle ground: nothing changes there.
// The deep-shade floor's paint reference: the last mip of a painted map is the tile's mean paint (a 2048 tile has
// eleven levels; textureLod clamps to the last one).
const VEHICLE_PAINT_MEAN_LOD = 16;
const VEHICLE_GROUND_DARK = 0.66;
const VEHICLE_GROUND_H0 = 0.12;
const VEHICLE_GROUND_H1 = 1.75;
const VEHICLE_GROUND_IDLE_Y = -1e5;
/**
 * Field wear (2026-10-07, tank-accessories lane round 3; the blind critics' lowest criterion everywhere,
 * materials_weathering 2.0-2.2: "spotless toy-like tri-tone blotches, no dust or mud", "the hull, road wheels and tracks
 * are factory-clean ... no mud on the running gear or dust on the lower hull", "smoke dischargers show no soot or scorch
 * behind or around the tubes"). The camouflage albedo is one world-scale 2 m tile with no height in it, so the wear is a
 * shader term on the materials that opt in (`COT_FIELD_WEAR`, set in createTankMaterials). Height comes from the
 * per-draw ground reference (the vehicle root: origin at the ground contact, +Y up); the pattern that breaks the wear up
 * comes from each mesh's own vertex positions, so it rides a turning turret, a rolling wheel and a running track link
 * instead of swimming over them. Strength is the reference's w: 1 in battle, VEHICLE_FIELD_WEAR_GARAGE on the Garage
 * showroom build (staticPreview), 0 for anything drawn without a vehicle root (tooling, stubs: unchanged). No new
 * texture, sampler or geometry.
 * Round 4 (2026-10-07; blind wave 240 scored the round-3 wear on and off exactly flat: "each view appears twice ...
 * differ only in the mud-flap colour", "a pale uniform haze over the upper surfaces or a flat dark band over the running
 * gear that stops at the skirt line"). The round-3 dust blended at most half-way to a pale grey, its deck film was one
 * even haze, and its mud was as dark as the running gear it covered. Now, per mode:
 * - 1 painted bodywork (hull, barrel, fitting paint, gunmetal, markings) and 4 cloth and wood: ochre-brown dust thrown
 *   up off the tracks, a heavy coat up to about the skirts' mid-height under a ragged, streaky top edge, a thin film
 *   above it and only a light film on the decks and turret, so the upper camouflage stays crisp; dried mud caked over
 *   the lowest band; clusters of wet mud spatter above the tracks; exhaust soot on the rear plate's upper band and the
 *   last stretch of the engine deck; dark, slightly glossy oil and fuel pools on the engine deck; sun-faded darker paint
 *   on the plates that face the sky. Mode 1 alone adds sharp chips of dark, slightly metallic bare steel where boots and
 *   tools rub (the plate edges at deck height, more sparsely the decks and roof) and grime packed into the plate seams,
 *   welds and bolts of its normal map.
 * - 2 running gear (wheel paint, tyres, track links, spare track, flaps): a light dusty coat over the dark steel and
 *   rubber, caked dried mud and wet clods thickening toward the ground.
 * - 3 the scrolling track band: a pattern-free dusty coat, caked on the ground run.
 * - Soot at the muzzle (the last stretch of the barrel) and around each smoke-discharger bank (setVehicleSootSources).
 * The stern, deck and bow come from the vehicle's own plates (setVehicleWearFrame); a vehicle without that frame skips
 * the exhaust, oil and climbing wear. Every octave fades to its mean once a cycle spans fewer than a few pixels, so the
 * wear never sparkles at range.
 */
export const VEHICLE_FIELD_WEAR_GARAGE = 0.45;
/**
 * Soot sources a root can publish (setVehicleSootSources): its muzzle and its smoke-discharger banks, the largest first.
 * Round 4 (2026-10-07): 4 -> 5 so the muzzle's carbon takes a slot of its own beside up to four banks.
 */
const VEHICLE_SOOT_SLOTS = 5;
export interface VehicleSootSource {
  /** The object whose frame `mouth` and `axis` are in; read through its matrixWorld at draw time. */
  owner: THREE.Object3D;
  /** The bank's mouth centre and outward axis (unit) in the owner's frame. */
  mouth: THREE.Vector3;
  axis: THREE.Vector3;
  /** Lateral reach of the soot around the axis and how far it runs back along it, metres; strength 0..1. */
  radius: number;
  length: number;
  strength: number;
}
/**
 * The hull frame the exhaust soot, the engine-deck oil and the climbing wear read (round 4, 2026-10-07), in the vehicle
 * root's own frame (origin at the ground contact, +Y up, +Z forward), metres: the rear plate's and the bow's station
 * along +Z, the engine deck's height and the hull's half width.
 */
export interface VehicleWearFrame {
  sternZ: number;
  bowZ: number;
  deckY: number;
  halfWidth: number;
}
interface VehicleWearState {
  sources: VehicleSootSource[];
  world: THREE.Vector4[];
  frame: number;
  hull: VehicleWearFrame | null;
}
/** The ground reference every vehicle material's ground occlusion reads; set per draw by the drawn mesh. */
const VEHICLE_GROUND = Object.freeze({
  uVehGround: { value: new THREE.Vector4(0, VEHICLE_GROUND_IDLE_Y, 0, 0) },
  uVehUp: { value: new THREE.Vector3(0, 1, 0) },
  // per soot source: (world mouth, lateral reach), (world axis, run back along it); reach 0 = unused
  uVehSoot: { value: Array.from({ length: VEHICLE_SOOT_SLOTS * 2 }, () => new THREE.Vector4()) },
  // round 4 hull frame in the world: (forward axis, the stern's station along it), (deck height, bow station, half
  // width, 0); a deck height of 0 = no frame
  uVehFwd: { value: new THREE.Vector4(0, 0, 1, 0) },
  uVehHull: { value: new THREE.Vector4() },
});
let vehicleSootLive = false;
let vehicleHullLive = false;
const sootMouth = new THREE.Vector3();
const sootAxis = new THREE.Vector3();
// Held beside the root, never in its userData: three's Object3D.copy deep-copies userData through JSON (tank thumbnail
// masks clone the root), and a source's owner is a live Object3D.
const VEHICLE_WEAR = new WeakMap<THREE.Object3D, VehicleWearState>();
function vehicleWearState(root: THREE.Object3D): VehicleWearState {
  let state = VEHICLE_WEAR.get(root);
  if (!state) {
    state = { sources: [], world: [], frame: NaN, hull: null };
    VEHICLE_WEAR.set(root, state);
  }
  return state;
}
/** Publish a vehicle's soot sources (tankFactoryCore.ts collects the muzzle and the discharger banks at build end). */
export function setVehicleSootSources(root: THREE.Object3D, sources: readonly VehicleSootSource[]): void {
  const state = vehicleWearState(root);
  state.sources = sources.slice(0, VEHICLE_SOOT_SLOTS);
  state.world = state.sources.flatMap(() => [new THREE.Vector4(), new THREE.Vector4()]);
  state.frame = NaN;
}
/** The soot sources a vehicle root published (diagnostics and receipts). */
export function vehicleSootSources(root: THREE.Object3D): readonly VehicleSootSource[] {
  return VEHICLE_WEAR.get(root)?.sources ?? [];
}
/** Publish a vehicle's hull frame (tankFactoryCore.ts measures it from the hull's own plates at build end). */
export function setVehicleWearFrame(root: THREE.Object3D, frame: VehicleWearFrame | null): void {
  vehicleWearState(root).hull = frame && frame.deckY > 0.05 ? { ...frame } : null;
}
/** The hull frame a vehicle root published (diagnostics and receipts). */
export function vehicleWearFrame(root: THREE.Object3D): VehicleWearFrame | null {
  return VEHICLE_WEAR.get(root)?.hull ?? null;
}
function writeVehicleSoot(state: VehicleWearState | undefined, frame: number): void {
  const out = VEHICLE_GROUND.uVehSoot.value;
  if (!state?.sources.length) {
    if (vehicleSootLive) for (const slot of out) slot.set(0, 0, 0, 0);
    vehicleSootLive = false;
    return;
  }
  // the sources move with their owners (a turret's banks traverse with it): placed once per rendered frame, reused by
  // every draw and shadow pass of that frame (frame < 0: no frame counter, place every time)
  if (frame < 0 || state.frame !== frame) {
    for (let index = 0; index < state.sources.length; index++) {
      const source = state.sources[index];
      sootMouth.copy(source.mouth).applyMatrix4(source.owner.matrixWorld);
      sootAxis.copy(source.axis).transformDirection(source.owner.matrixWorld);
      state.world[index * 2].set(sootMouth.x, sootMouth.y, sootMouth.z, source.radius);
      state.world[index * 2 + 1].set(sootAxis.x * source.strength, sootAxis.y * source.strength,
        sootAxis.z * source.strength, source.length);
    }
    state.frame = frame;
  }
  for (let index = 0; index < out.length; index++) {
    if (index < state.world.length) out[index].copy(state.world[index]);
    else out[index].set(0, 0, 0, 0);
  }
  vehicleSootLive = true;
}
function writeVehicleHull(hull: VehicleWearFrame | null | undefined, e: ArrayLike<number>, upScale: number): void {
  if (!hull) {
    if (vehicleHullLive) VEHICLE_GROUND.uVehHull.value.set(0, 0, 0, 0);
    vehicleHullLive = false;
    return;
  }
  // the frame is in the root's own metres; a scaled root (a showroom pedestal) carries it into the world's
  const forwardScale = Math.hypot(e[8], e[9], e[10]) || 1;
  VEHICLE_GROUND.uVehFwd.value.set(e[8] / forwardScale, e[9] / forwardScale, e[10] / forwardScale, hull.sternZ * forwardScale);
  VEHICLE_GROUND.uVehHull.value.set(hull.deckY * upScale, hull.bowZ * forwardScale,
    hull.halfWidth * (Math.hypot(e[0], e[1], e[2]) || 1), 0);
  vehicleHullLive = true;
}
/** Point the ground occlusion at a vehicle root (its origin is the ground contact; its +Y the hull's up axis). */
export function setVehicleGroundFromRoot(root: THREE.Object3D, frame = -1): void {
  const e = root.matrixWorld.elements;
  const wear = root.userData.fieldWear;
  VEHICLE_GROUND.uVehGround.value.set(e[12], e[13], e[14], typeof wear === 'number' ? wear : 1);
  const n = Math.hypot(e[4], e[5], e[6]) || 1;
  VEHICLE_GROUND.uVehUp.value.set(e[4] / n, e[5] / n, e[6] / n);
  const state = VEHICLE_WEAR.get(root);
  writeVehicleSoot(state, frame);
  writeVehicleHull(state?.hull, e, n);
}
/** Release it: anything drawn without a vehicle root sees a far-below ground (no darkening) and no field wear. */
export function resetVehicleGround(): void {
  VEHICLE_GROUND.uVehGround.value.set(0, VEHICLE_GROUND_IDLE_Y, 0, 0);
  VEHICLE_GROUND.uVehUp.value.set(0, 1, 0);
}

// Field-wear shader pieces (see VEHICLE_FIELD_WEAR_GARAGE). Linear-space targets: dry road dust an ochre khaki between
// a dark earth and a pale tan (the paint's own pattern shows through the thinner coats), caked mud a mid umber, wet
// mud a dark umber, soot and oil near-black, bare steel a dark grey. The running gear is darker than any dust, so dust
// lightens it; the round-3 mud darkened it into one flat band.
const FIELD_WEAR_VERTEX_HEADER = '#ifdef COT_FIELD_WEAR\nvarying vec3 vCotWearPos;\n#endif\n';
const FIELD_WEAR_HEADER = `#ifdef COT_FIELD_WEAR
uniform vec4 uVehSoot[ ${VEHICLE_SOOT_SLOTS * 2} ];
uniform vec4 uVehFwd;
uniform vec4 uVehHull;
varying vec3 vCotWearPos;
const mat3 cotWearTurn = mat3( 0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64 );
float cotWearHash( vec3 p ) {
	p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
	p *= 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float cotWearNoise( vec3 x ) {
	vec3 i = floor( x );
	vec3 f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( cotWearHash( i ), cotWearHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
			mix( cotWearHash( i + vec3( 0.0, 1.0, 0.0 ) ), cotWearHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( cotWearHash( i + vec3( 0.0, 0.0, 1.0 ) ), cotWearHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
			mix( cotWearHash( i + vec3( 0.0, 1.0, 1.0 ) ), cotWearHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}
// one band-limited octave: it settles to its mean as a cycle shrinks under about five pixels (cycles: the octave's
// frequency times the metres one pixel covers), so the wear never sparkles at range
float cotWearOctave( vec3 p, float cycles ) {
	return mix( cotWearNoise( p ), 0.5, smoothstep( 0.18, 0.4, cycles ) );
}
#endif
`;
const FIELD_WEAR_FRAGMENT = `
	#ifdef COT_FIELD_WEAR
	if ( uVehGround.w > 0.0 ) {
		// tank-accessories round 4 field wear (2026-10-07): height from the vehicle's ground reference, the stern and deck
		// from its hull frame, the pattern from the mesh's own frame (derivatives here, in uniform control flow)
		float wearW = uVehGround.w;
		vec3 wearWorld = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
		vec3 wearRel = wearWorld - uVehGround.xyz;
		float wearH = dot( wearRel, uVehUp );
		vec3 wearN = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
		float wearSky = smoothstep( 0.35, 0.85, dot( wearN, uVehUp ) );
		float wearPx = max( length( dFdx( vCotWearPos ) ), length( dFdy( vCotWearPos ) ) );
		float wearDust = 0.0;
		float wearCake = 0.0;
		float wearMud = 0.0;
		float wearChip = 0.0;
		float wearOil = 0.0;
		float wearExhaust = 0.0;
		float wearSeam = 0.0;
		float wearSun = 0.0;
		float wearStreak = 0.5;
		float wearTone = 0.5;
		float wearCover = 0.85;
		float wearShade = 1.0;
		#if COT_FIELD_WEAR == 3
		// the scrolling track band: no fixed pattern (it would stand still while the band runs), a dusty coat caked low
		wearDust = 0.55;
		wearCake = 0.6 * ( 1.0 - smoothstep( 0.1, 0.55, wearH ) );
		wearCover = 0.6;
		wearShade = 0.72;
		#elif COT_FIELD_WEAR == 2
		// running gear: a dusty coat over the dark steel and rubber, caked dried mud and wet clods toward the ground
		float wearG1 = cotWearOctave( vCotWearPos * 3.0, 3.0 * wearPx );
		float wearG2 = cotWearOctave( vCotWearPos * 9.0 + vec3( 4.3, 1.7, 8.9 ), 9.0 * wearPx );
		float wearGearLow = 1.0 - smoothstep( 0.15, 1.0, wearH );
		wearDust = 0.35 + 0.3 * wearG1 + 0.3 * wearGearLow;
		wearCake = smoothstep( 0.5, 0.72, wearG2 * 0.6 + wearG1 * 0.2 + wearGearLow * 0.35 );
		float wearClodEdge = 0.02 + 14.0 * wearPx;
		wearMud = smoothstep( 0.7 - wearClodEdge, 0.7 + wearClodEdge, wearG2 * 0.75 + wearGearLow * 0.25 + wearW * 0.04 )
			* ( 1.0 - smoothstep( 0.18, 0.4, 9.0 * wearPx ) );
		wearStreak = wearG2;
		wearTone = wearG1;
		wearCover = 0.62;
		wearShade = 0.8;
		#else
		// bodywork (1) and cloth and wood (4)
		float wearB1 = cotWearOctave( vCotWearPos * vec3( 2.3, 0.9, 2.3 ), 2.3 * wearPx );
		float wearB2 = cotWearOctave( vCotWearPos * vec3( 7.0, 1.3, 7.0 ) + vec3( 3.1, 7.7, 1.3 ), 7.0 * wearPx );
		float wearB3 = cotWearOctave( cotWearTurn * vCotWearPos * 10.0 + vec3( 9.2, 2.6, 5.4 ), 10.0 * wearPx );
		float wearFine = 1.0 - smoothstep( 0.18, 0.4, 10.0 * wearPx );
		// dust thrown up off the tracks: a heavy coat under a ragged, streaky top edge that wanders about 0.3 m, a graded
		// film above it up the hull, and patches settled on the plates that face the sky, thinner up the turret
		float wearEdge = ( wearB1 - 0.5 ) * 0.55 + ( wearB2 - 0.5 ) * 0.65;
		wearDust = max( ( 1.0 - smoothstep( 0.84, 0.98, wearH + wearEdge ) ) * ( 0.78 + 0.22 * wearB2 ),
			( 1.0 - smoothstep( 0.95, 1.6, wearH + wearEdge * 0.5 ) ) * ( 0.12 + 0.14 * wearB2 ) );
		wearDust = max( wearDust, wearSky * ( 0.03 + 0.09 * wearB2 + 0.06 * wearB1 ) * ( 1.0 - 0.5 * smoothstep( 1.7, 2.5, wearH ) ) );
		// dried mud caked over the lowest band
		wearCake = ( 1.0 - smoothstep( 0.36, 0.7, wearH + wearEdge * 0.6 ) ) * ( 0.55 + 0.45 * wearB2 );
		// wet mud flung up off the tracks: clusters of drops, thick low on the skirts, glacis and rear plate
		float wearSpatZone = 1.0 - smoothstep( 0.35, 1.45, wearH + ( wearB1 - 0.5 ) * 0.5 );
		float wearSpatEdge = 0.02 + 15.0 * wearPx;
		wearMud = smoothstep( 0.76 - wearSpatEdge, 0.76 + wearSpatEdge,
			wearB3 * 0.65 + wearB1 * 0.25 + wearSpatZone * 0.22 + wearW * 0.04 ) * wearSpatZone * wearFine;
		// the hull frame: exhaust soot on the rear plate's upper band and the last stretch of the engine deck, oil and
		// fuel pools on the engine deck where the dust is thin
		float wearFramed = step( 0.05, uVehHull.x );
		float wearStern = dot( wearRel, uVehFwd.xyz ) - uVehFwd.w;
		float wearDeckH = wearH - uVehHull.x;
		float wearFacing = dot( wearN, uVehFwd.xyz );
		wearExhaust = wearFramed * max(
			smoothstep( 0.3, 0.7, - wearFacing ) * ( 1.0 - smoothstep( 0.12, 0.45, wearStern ) )
				* smoothstep( - 0.75, - 0.25, wearDeckH ) * ( 1.0 - smoothstep( 0.02, 0.3, wearDeckH ) ) * ( 0.3 + 0.85 * wearB2 ),
			wearSky * ( 1.0 - smoothstep( 0.1, 0.95, wearStern ) ) * ( 1.0 - smoothstep( 0.12, 0.4, abs( wearDeckH ) ) )
				* ( 0.15 + 0.75 * wearB1 ) );
		float wearEngine = wearFramed * wearSky * ( 1.0 - smoothstep( 0.36, 0.5, wearStern / max( uVehHull.y - uVehFwd.w, 2.0 ) ) )
			* ( 1.0 - smoothstep( 0.12, 0.32, abs( wearDeckH ) ) );
		wearOil = wearEngine * smoothstep( 0.645, 0.685, ( 1.0 - wearB1 ) * 0.7 + wearB2 * 0.3 + wearW * 0.03 );
		// sun-faded paint where the plates face the sky, in patches
		wearSun = wearSky * ( 0.6 + 0.4 * wearB1 );
		#if COT_FIELD_WEAR == 1
		// bare steel where boots and tools rub: the plate edges at deck height crews climb over, more sparsely the deck and
		// roof plates they walk (less on the engine deck); sharp-edged, a few centimetres across, darker than the paint (a
		// light chip read as "flour dust" speckle in the r8-r10 painter rounds)
		float wearTread = clamp( wearSky * 0.5 * ( 1.0 - 0.7 * wearEngine ) + wearFramed * smoothstep( 0.3, 0.7, abs( wearFacing ) )
			* ( 1.0 - smoothstep( 0.04, 0.16, abs( wearDeckH + 0.06 ) ) ), 0.0, 1.0 );
		float wearChipEdge = 0.015 + 12.0 * wearPx;
		wearChip = ( 1.0 - smoothstep( 0.18 - wearChipEdge, 0.18 + wearChipEdge,
			wearB3 + ( 1.0 - wearTread ) * 0.12 - wearW * 0.04 ) ) * wearFine;
		#ifdef USE_NORMALMAP_TANGENTSPACE
		// grime packed into the seams, welds and bolts the plate's normal map carves (it fades with the map's mips)
		wearSeam = smoothstep( 0.18, 0.6, length( mapN.xy ) );
		#endif
		#endif
		wearStreak = wearB2;
		wearTone = wearB1 * 0.55 + wearB2 * 0.45;
		#endif
		float wearSoot = 0.0;
		for ( int i = 0; i < ${VEHICLE_SOOT_SLOTS}; i ++ ) {
			vec4 sootAt = uVehSoot[ i * 2 ];
			vec4 sootRun = uVehSoot[ i * 2 + 1 ];
			if ( sootAt.w <= 0.0 ) continue;
			float sootStrength = length( sootRun.xyz );
			vec3 sootAxis = sootRun.xyz / max( sootStrength, 1e-4 );
			vec3 sootRel = wearWorld - sootAt.xyz;
			float sootAlong = dot( sootRel, sootAxis );
			float sootBack = clamp( - sootAlong / max( sootRun.w, 1e-3 ), 0.0, 1.0 );
			float sootReach = sootAt.w * ( 1.0 + 0.5 * sootBack );
			float sootSide = length( sootRel - sootAxis * sootAlong );
			wearSoot = max( wearSoot, sootStrength * ( 1.0 - smoothstep( 0.3 * sootReach, sootReach, sootSide ) )
				* smoothstep( - sootRun.w * 1.25, - sootRun.w * 0.5, sootAlong ) * ( 1.0 - smoothstep( 0.04, 0.22, sootAlong ) ) );
		}
		wearSoot = clamp( wearSoot * ( 0.7 + 0.3 * wearStreak ) * ( 0.35 + 0.65 * wearW ), 0.0, 1.0 );
		vec3 wearPaint = diffuseColor.rgb;
		float wearLuma = dot( wearPaint, vec3( 0.2126, 0.7152, 0.0722 ) );
		wearPaint = mix( wearPaint, wearLuma * vec3( 1.08, 1.0, 0.84 ), wearSun * 0.08 * wearW * ( 1.0 - smoothstep( 0.08, 0.25, wearLuma ) ) );
		wearPaint *= 1.0 - wearSeam * 0.5 * wearW;
		wearPaint = mix( wearPaint, vec3( 0.02, 0.017, 0.013 ), wearOil * 0.8 );
		wearPaint = mix( wearPaint, vec3( 0.017, 0.016, 0.015 ), clamp( wearExhaust, 0.0, 1.0 ) * ( 0.45 + 0.4 * wearW ) );
		float wearDustCover = clamp( wearDust * wearW, 0.0, 1.0 ) * wearCover;
		wearPaint = mix( wearPaint, mix( vec3( 0.19, 0.135, 0.075 ), vec3( 0.3, 0.22, 0.12 ), wearTone ) * wearShade, wearDustCover );
		float wearCakeCover = clamp( wearCake * wearW, 0.0, 1.0 ) * 0.8;
		wearPaint = mix( wearPaint, vec3( 0.125, 0.09, 0.056 ), wearCakeCover );
		wearPaint = mix( wearPaint, vec3( 0.05, 0.034, 0.02 ), wearMud * 0.9 );
		wearPaint = mix( wearPaint, vec3( 0.065, 0.064, 0.062 ), wearChip );
		wearPaint = mix( wearPaint, vec3( 0.012, 0.011, 0.01 ), wearSoot * 0.85 );
		diffuseColor.rgb = wearPaint;
		// dust, mud and soot are matte; oil is slick; bare steel a little metallic
		roughnessFactor = mix( roughnessFactor, 1.0, max( max( wearDustCover, wearCakeCover ), max( wearMud, wearSoot ) ) * 0.85 );
		#if COT_FIELD_WEAR == 1
		roughnessFactor = mix( roughnessFactor, 0.34, wearOil );
		roughnessFactor = mix( roughnessFactor, 0.45, wearChip );
		metalnessFactor = mix( metalnessFactor, 0.45, wearChip );
		#endif
	}
	#endif`;

/**
 * Shader hook: clamp `reflectedLight.indirectDiffuse` to an albedo-scaled,
 * view-dependent floor. Chain via `setupShadowMaterial(mat,
 * vehicleAmbientFloorHook)` for CSM materials, or assign directly as
 * `onBeforeCompile` in renderer stubs used by thumbnails and headless tools.
 * @param {object} shader onBeforeCompile shader arg
 */
export function vehicleAmbientFloorHook(shader: MaterialShader): void {
  bindVehicleReadabilityUniform(shader.uniforms);
  shader.uniforms.uVehGround = VEHICLE_GROUND.uVehGround;
  shader.uniforms.uVehUp = VEHICLE_GROUND.uVehUp;
  shader.uniforms.uVehSoot = VEHICLE_GROUND.uVehSoot;
  // round 4 (2026-10-07): the hull frame the exhaust soot, engine-deck oil and climbing wear read
  shader.uniforms.uVehFwd = VEHICLE_GROUND.uVehFwd;
  shader.uniforms.uVehHull = VEHICLE_GROUND.uVehHull;
  shader.fragmentShader =`uniform float uVehicleReadabilityScale;\nuniform vec4 uVehGround;\nuniform vec3 uVehUp;\n${FIELD_WEAR_HEADER}${shader.fragmentShader}`;
  // 2026-10-07 field wear (VEHICLE_FIELD_WEAR_GARAGE): the wear pattern follows each mesh's own vertex frame, and the
  // paint takes the dust, mud and soot before any light reads it (after the normal, before lights_physical_fragment)
  shader.vertexShader = `${FIELD_WEAR_VERTEX_HEADER}${shader.vertexShader}`.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n#ifdef COT_FIELD_WEAR\n\tvCotWearPos = transformed;\n#endif',
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>${FIELD_WEAR_FRAGMENT}`,
  );
  // Owner 2026-10-02 ("shadows on tanks make them look a lil flat"): vehicle pixels add VEHICLE_ALPHA_TAG to the lit
  // materials' 2 + sun visibility in the scene target's alpha, so the aerial pass can give vehicles alone their
  // cavity occlusion (engine/vehicleOcclusion.ts). Same guard as the lighting.ts write it extends.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
#if defined( COT_SUN_VIS_CAPTURED ) && defined( OPAQUE ) && defined( USE_CSM )
	gl_FragColor.a += ${VEHICLE_ALPHA_TAG.toFixed(1)};
#endif`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
	#ifdef COT_WHEEL_PAINT_READABILITY
	{
		// Painted wheel bowls need their received-light differences: flooring
		// every face to the same output erased the modeled hub/web recess.
		// Add a bounded, paint-scaled bounce instead, using the lighting BEFORE
		// that bounce to detect shade. The shared wheel-paint albedo floor and
		// camouflage repainting remain independent of this lighting response.
		float wheelLuma = max( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
		vec3 wheelReceived = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
		float wheelIrrad = dot( wheelReceived, vec3( 0.2126, 0.7152, 0.0722 ) ) / wheelLuma;
		float wheelShade = 1.0 - smoothstep( 0.10, 0.65, wheelIrrad );
		float wheelFacing = saturate( dot( normal, geometryViewDir ) );
		float wheelBounce = 0.20 * ( 0.40 + 0.60 * wheelFacing ) * wheelShade;
		reflectedLight.indirectDiffuse += material.diffuseColor * wheelBounce * uVehicleReadabilityScale;
	}
	#else
	{
		float vehFacing = saturate( dot( normal, geometryViewDir ) );
		// owner 2026-10-02 form fill: aim the readability floors by the plate's world orientation (sky above, the sun's
		// bearing) as well as by the lens, so roofs and glacis lift most, flanks less and soffits least
		vec3 vehWN = inverseTransformDirection( normal, viewMatrix );
		float vehForm = ${VEHICLE_FORM_BASE.toFixed(3)} + ${VEHICLE_FORM_SKY.toFixed(3)} * smoothstep( -0.7, 0.85, vehWN.y );
		#if defined( USE_CSM ) && defined( CSM_CASCADES )
		{
			float vehSunH = length( uCotBounceSun.xz );
			float vehNH = length( vehWN.xz );
			if ( vehSunH > 1e-3 && vehNH > 1e-3 ) {
				vehForm += ${VEHICLE_FORM_SUN.toFixed(3)} * saturate( dot( vehWN.xz / vehNH, uCotBounceSun.xz / vehSunH ) ) * vehNH;
			}
		}
		#endif
		float vehAim = mix( saturate( vehForm ), vehFacing, ${VEHICLE_FORM_LENS.toFixed(3)} );
		float vehFill = max( ${VEHICLE_AMBIENT_FLOOR.toFixed(3)},
			${VEHICLE_VIEW_FILL.toFixed(3)} * ( ${VEHICLE_VIEW_WRAP.toFixed(3)} + ${(1 - VEHICLE_VIEW_WRAP).toFixed(3)} * vehAim ) );
		// tank_models r10: high-albedo rolloff — on light paints (winter wash,
		// light greys) a flat albedo-scaled floor pushes the whole hull toward
		// clip and flattens form ("unlit near-white clay"). Cap the fill so the
		// resulting indirect floor never exceeds ~0.30 linear luminance.
		float vehLuma = max( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
		vehFill = min( vehFill, 0.30 / vehLuma );
		// tank_models r5 (frosted/clay GLB major): the fill is a SHADE
		// readability device, but it ran unconditionally — under the garage
		// spots / field sun it stacked a 0.35-0.55×albedo ambient on top of the
		// full direct response, washing every sourced-GLB tank toward flat
		// pastel clay (light-grey Panzer III, frosted IS-3/Wei He, sandblasted
		// Abrams decks, blown q_heavy turret) and erasing camo pattern contrast
		// at pedestal range. Gate it by RECEIVED direct light, normalized by
		// albedo so dark paint gates the same as light paint: fully lit
		// surfaces keep only 12% of the fill, shaded surfaces (the calibrated
		// gameplay_feel case) keep 100%. The deep-shade floors below are
		// untouched.
		float vehIrrad = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / vehLuma;
		vehFill *= mix( 1.0, 0.12, smoothstep( 0.10, 0.55, vehIrrad ) );
		vehFill *= uVehicleReadabilityScale;
		reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, material.diffuseColor * vehFill );
		// >>> gameplay_feel r4: shadow-band luminance floor. The albedo-scaled
		// fill above still crushes to near-black when a dark-olive skin
		// (~0.05-0.09 linear albedo) sits sun-opposed inside a terrain/cloud
		// shadow band (r4 drive critique: the hull reads as an unreadable
		// black blob in drive_aim/drive_turn/drive_stop). Clamp the OUTGOING
		// diffuse luminance to a small normal-modulated floor applied along
		// the albedo hue: plates at different angles keep different floors so
		// hull attitude and plate separation survive full shade, and the
		// lighting_post r4 directional-modeling fix is untouched — the floor
		// sits ~4x under the lit response and only engages in deep shade.
		vec3 vehDiff = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
		float vehOutL = dot( vehDiff, vec3( 0.2126, 0.7152, 0.0722 ) );
		// >>> gameplay_feel r5: adaptive deep-canopy lift. At the 0.115 floor a
		// hull parked/driving in DENSE forest shade (direct term ~0) still read
		// as a light-swallowing black silhouette against sunlit foliage at the
		// 13 m chase distance (r5 drive critique, drive_a_uphill/drive_c_rough).
		// Blend the floor toward 0.21 as the received direct light collapses —
		// a camera-anchored hemispheric bounce, WoT-style: sunlit and dappled
		// response (direct luminance > ~0.10) is completely untouched, so the
		// lighting_post r4 directional-modeling calibration holds in the open.
		float vehDirL = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
		// tank_models r5 (clay-lift root cause): the shade estimate compared
		// REFLECTED luminance to an absolute 0.02-0.10 window, so dark paint
		// (0.05-0.08 albedo: Panzergrau, 4BO green) tested as "deep shade" even
		// in full sun/garage light, and the absolute 0.115-0.21 output floor
		// then clamped the whole hull to flat light-grey clay, erasing texture
		// contrast (light-grey Panzer III, frosted IS-3 / Wei He, washed GLB
		// decks). Normalize by albedo (-> incident-irradiance estimate, same
		// for dark and light paints) and fade the WHOLE floor out when lit —
		// the deep-shade/canopy behavior gameplay_feel calibrated (direct ~ 0)
		// keeps its 0.21 lift exactly; lit surfaces keep their real shading.
		float vehShade = 1.0 - smoothstep( 0.10, 0.45, vehDirL / vehLuma );
		// tank_models r1 (critic: "flat pale-green clay" GLB hulls, "bone-white
		// chalk" T-90A gear, blue-tinted pastel track links). The r5 shade test
		// only looked at DIRECT light, so every ordinary self-shadowed face of
		// a sunlit/garage-lit tank counted as "deep canopy" and got floored to
		// 0.13-0.21 with a 75%-desaturated tint — dark green washed to pale
		// sage, near-black running gear to chalk. Deep shade means direct AND
		// ambient are both low: fade the floor out as the ambient stack
		// (hemi + IBL, already accumulated in indirectDiffuse) approaches a
		// healthy irradiance, so the canopy case (dim ambient ~0.15-0.30 of
		// albedo) keeps its lift and shadow sides under open sky keep their
		// real shading.
		float vehIndL = dot( reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
		vehShade *= 1.0 - smoothstep( 0.35, 0.75, vehIndL / vehLuma );
		// gameplay_feel r1: shadow-side rim term — grazing plates in DEEP shade
		// keep readable form (0.084 -> ~0.18 luma at vehShade=1) while the lit
		// response and the tank_models r5 clay calibration stay untouched
		// (at vehShade=0 the factor is identical).
		float vehRim = pow( 1.0 - vehFacing, 2.0 );
		float vehFloorL = mix( 0.02, 0.21, vehShade )
			* ( 0.40 + 0.60 * vehAim + 0.45 * vehRim * vehShade );
		// very dark hardware (rubber, track steel, oily fittings) must stay
		// dark even in deep shade — scale the floor down below ~0.09 albedo
		// luma so gear never lifts to chalk while dark-olive PAINT (the
		// calibrated gameplay_feel case, ~0.05-0.09) keeps most of its lift.
		vehFloorL *= mix( 0.30, 1.0, smoothstep( 0.025, 0.09, vehLuma ) );
		vehFloorL *= uVehicleReadabilityScale;
		// <<< gameplay_feel r5
		// owner 2026-10-02 ("the camo and colours on the tank look so weird and not crisp"): the floor lifts the light a
		// plate RECEIVES, not its output. It used to bring every texel to one luminance along its hue, so in deep shade the
		// dark, base and pale tones of a camouflage converged into one muddy tone (desert 0.11 / 0.27 / 0.41 linear luma all
		// to ~0.21). Now vehFloorL is where the paint's MEAN tone lands (the map's last mip is the tile's mean paint) and
		// each texel lands in proportion to its own paint against it: the pattern keeps its light/dark contrast, solid
		// coats (no map) land exactly where they did, dark hardware stays dark.
		float vehRefL = vehLuma;
		#ifdef USE_MAP
		vehRefL = max( dot( textureLod( map, vMapUv, ${VEHICLE_PAINT_MEAN_LOD.toFixed(1)} ).rgb * diffuse, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
		#endif
		float vehTargetL = vehFloorL * vehLuma / vehRefL;
		if ( vehOutL < vehTargetL ) {
			reflectedLight.indirectDiffuse += material.diffuseColor * ( ( vehTargetL - vehOutL ) / vehLuma );
		}
		// <<< gameplay_feel r4
	}
	#endif
	{
		// owner 2026-10-02 ground occlusion (VEHICLE_GROUND_*): indirect light falls toward the ground along the vehicle's axis
		vec3 vehWorldPos = cameraPosition + ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz;
		float vehHeight = dot( vehWorldPos - uVehGround.xyz, uVehUp );
		reflectedLight.indirectDiffuse *= mix( ${VEHICLE_GROUND_DARK.toFixed(3)}, 1.0,
			smoothstep( ${VEHICLE_GROUND_H0.toFixed(3)}, ${VEHICLE_GROUND_H1.toFixed(3)}, vehHeight ) );
	}`,
  );
}

// Renderer stubs expose setupShadowMaterial but ignore its hook argument.
// Probe each context once so every material takes the correct registration
// path without duplicating capability checks at material creation sites.
const SHADOW_CONTEXT_SUPPORT = new WeakMap<object, boolean>();
function supportsShadowHook(engineCtx: ShadowEngineContext | null | undefined): boolean {
  if (!engineCtx || typeof engineCtx.setupShadowMaterial !== 'function') return false;
  const cached = SHADOW_CONTEXT_SUPPORT.get(engineCtx);
  if (cached !== undefined) return cached;

  const probe = new THREE.MeshStandardMaterial();
  let supported = false;
  try {
    engineCtx.setupShadowMaterial(probe);
    supported = !!probe.defines?.USE_CSM;
  } catch {
    // A tooling stub that rejects real materials uses the direct hook path.
  }
  engineCtx.releaseShadowMaterial?.(probe);
  probe.dispose();
  SHADOW_CONTEXT_SUPPORT.set(engineCtx, supported);
  return supported;
}

/**
 * The registration each vehicle material was built with (createTankMaterials' `setup`): the cascade setup with the
 * readability hook through the engine context, or the hook alone in a renderer stub, and the shared program key.
 * 2026-10-04 (the vehicle-look lane): Material.clone() keeps none of it — three's MeshStandardMaterial.copy resets
 * `defines` to { STANDARD } (USE_CSM, CSM_CASCADES and CSM_FADE go) and Material.copy never copies onBeforeCompile or
 * customProgramCacheKey — so a cloned vehicle material (the track shoes, the thrown track, a profile's band finish, an
 * isolated gear role) fell back to three's plain directional loop: all four cascade suns at full intensity, each
 * unshadowed outside its own cascade (about four times the sun on a lit face), with neither the sun state nor the
 * vehicle tag the aerial pass reads (lighting.ts, vehicleOcclusion.ts). cloneVehicleMaterial joins a clone to exactly
 * the registration its source has; the clone is disposed and released like any vehicle material.
 */
const VEHICLE_MATERIAL_SETUP = new WeakMap<THREE.Material, <T extends THREE.Material>(material: T) => T>();

/**
 * The vehicle's own shader switches, which three's copy drops with the rest of the defines and a clone keeps (the wheel
 * paint's floor). The cascade's defines (USE_CSM, CSM_*, COT_CLOUD_SHADE) belong to the registration and come back
 * with it.
 */
const VEHICLE_SHADER_SWITCHES = ['COT_WHEEL_PAINT_READABILITY', 'COT_FIELD_WEAR'] as const;

/**
 * Clone a vehicle material into its source's cascade registration, readability hook, program key and switches.
 * `configure` runs on the clone before it is registered (2026-10-05, tank-accessories lane): an alpha-tested clone
 * (an equipment leaf or net card) sets its map and alphaTest there, so the cascade setup builds the map's
 * coverage-preserving mip chain exactly as it does for a foliage material.
 */
export function cloneVehicleMaterial<T extends THREE.Material>(source: T, configure?: (clone: T) => void): T {
  const clone = source.clone() as T;
  const sourceDefines = (source as { defines?: Record<string, unknown> }).defines;
  for (const key of VEHICLE_SHADER_SWITCHES) {
    if (!sourceDefines || !(key in sourceDefines)) continue;
    const target = clone as { defines?: Record<string, unknown> };
    target.defines = { ...target.defines, [key]: sourceDefines[key] };
  }
  configure?.(clone);
  const setup = VEHICLE_MATERIAL_SETUP.get(source);
  if (setup) return setup(clone);
  // a material from outside createTankMaterials (a stub's, a receipt's): it keeps its hooks, which a plain clone drops
  clone.onBeforeCompile = source.onBeforeCompile;
  clone.customProgramCacheKey = source.customProgramCacheKey;
  return clone;
}

/**
 * Build the full material set for one tank.
 * @param {object} spec TankSpec (reads spec.visual palette hints)
 * @param {object} engineCtx EngineCtx (§2.8) — setupShadowMaterial + anisotropy
 * @param {number} camoSeed deterministic seed (stowage jitter etc.; textures are per-spec)
 * @returns {object} { hull, wheels, rubber, detail, dark, glass, barrel, canvasCloth,
 *   wood, trackL, trackR, trackTexL, trackTexR, trackLinkM, decal(kind), burnt, dispose() }
 */
export function createTankMaterials(
  spec: MaterialTankSpec,
  engineCtx: ShadowEngineContext | null | undefined,
  _camoSeed: number,
  quality: string = 'high',
  camoPattern: string | null = null,
) {
  const shadowSetup = engineCtx?.setupShadowMaterial;
  const shadowHookSupported = supportsShadowHook(engineCtx);
  const setup = <T extends THREE.Material>(material: T): T => {
    if (shadowHookSupported && shadowSetup) shadowSetup(material, vehicleAmbientFloorHook);
    else material.onBeforeCompile = vehicleAmbientFloorHook;
    material.customProgramCacheKey = () => 'veh-ambient-floor-v5';
    VEHICLE_MATERIAL_SETUP.set(material, setup); // cloneVehicleMaterial re-registers its clones the same way
    return material;
  };
  const aniso = engineCtx?.anisotropy || 8;

  const disposables: Array<THREE.Material | THREE.Texture> = [];
  const track = <T extends THREE.Material | THREE.Texture>(resource: T): T => {
    disposables.push(resource);
    return resource;
  };

  // PERF r3: static wreck, battle AI, player, and garage-preview tiers are
  // resolution-bounded in QUALITY_SIZES; authored inspection callers retain
  // the full tier. Keep `low` explicit here: falling through to `high` made
  // every transient world-wreck collapse bake 2048/1024 canvases that were
  // immediately discarded.
  const shared = acquireSharedTextures(
    spec,
    aniso,
    normalizeMaterialTextureQuality(quality),
    camoPattern,
  );
  const { camoTex, normalTex, roughTex } = shared;
  if (!camoTex || !normalTex || !roughTex) {
    throw new Error(`vehicle material cache entry ${shared.cacheKey} is incomplete`);
  }

  // Matte military paint over rolled steel: normal map carries panel lines /
  // welds / bolts / casting; a whisper of clearcoat lets sky light streak
  // across big plates; vertex colors carry the baked dust/AO gradient.
  // r8: envMapIntensity 0.55 across the painted set — full-strength IBL
  // washed the procedural fleet a milky pastel next to the Abrams GLB
  // (whose composite runs at 0.6), the core of the "CAD clay" cohesion
  // critique. Clearcoat trimmed with it.
  // lighting_post r3 (round 3, major #1b): hulls rendered ~2 stops darker
  // than terrain under the new denser shadows — roughness 0.95 -> 0.78
  // (CARC paint sheen under strong keys) and envMapIntensity 0.55 -> 0.75 so
  // the IBL share follows the ambient stack. (The companion camo-palette
  // luminance raise is deferred to the materials owner — the camo_spotting
  // r3 palette rework landed this same round and must not be double-tuned.)
  // camo_spotting r4 (critic: T-34-85 summer "dominated by pale cream on the
  // entire upper hull", factory/summer greens "light and minty"): measured by
  // live A/B on the garage pedestal — with roughness 1 / env 0 / clearcoat 0
  // the same "cream" glacis renders as fully saturated patterned paint, so
  // the wash was never in the palette: the 0.12 clearcoat + 0.75 IBL + GGX
  // (roughnessMap dips to ~0.23 effective) laid a white specular film over
  // every up-facing plate under the warm key. Matte field paint: clearcoat
  // down to a trace, base roughness up a step, env trimmed toward the r8
  // level. Shade readability no longer needs the extra IBL — the
  // gameplay_feel r4/r5 view-fill + shadow floors in vehicleAmbientFloorHook
  // now guarantee it (they postdate the lighting_post r3 env raise).
  const hull = track(setup(new THREE.MeshPhysicalMaterial({
    map: camoTex, roughnessMap: roughTex, roughness: 0.88, metalness: 0.05,
    normalMap: normalTex, normalScale: new THREE.Vector2(1.3, 1.3),
    // lighting_post r4: sheen without white-deck — NO clearcoatRoughnessMap
    // (map dips spike the lobe and blow flat rear fenders to mirror-white).
    clearcoat: 0.05, clearcoatRoughness: 0.65,
    specularIntensity: 0.55,               // r4: grazing F90 film off up-tilted plates
    vertexColors: true, envMapIntensity: 0.5,
  })));

  // CAMO PATTERN SECTION: wheel dishes and fittings are scheme-painted — the
  // colors derive from the ACTIVE pattern (not the factory palette) and the
  // materials register on the shared entry so pattern switches re-tint them
  // live (r1: lime-green road wheels under winter whitewash).
  const patVis = patternVisual(spec, shared.patternId);
  // tank_models r1 (critic: Tiger wheels "blue-black glossy plastic"): the
  // 0.8-roughness base under the multiplying roughnessMap dipped effective
  // GGX to ~0.3 pockets, and envMapIntensity 0.55 mirrored the blue PMREM sky
  // off every dish in the wheel-bay shade. Painted road wheels are dusty
  // matte — roughness up, env cut to the trackLink level.
  const wheels = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(wheelRgbOf(patVis))),
    roughness: 0.92, metalness: 0.08, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 0.25,
  })));
  wheels.defines = { ...wheels.defines, COT_WHEEL_PAINT_READABILITY: 1 };
  stampSchemeFinish(wheels);
  // Recessed rows of an interleaved (Schachtellaufwerk) wheel stack: same
  // scheme paint pushed into shadow so the layers separate visually (r5).
  const wheelsRecessed = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(wheelDarkRgbOf(patVis))),
    roughness: 0.94, metalness: 0.06, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 0.2,
  })));
  wheelsRecessed.defines = { ...wheelsRecessed.defines, COT_WHEEL_PAINT_READABILITY: 1 };
  stampSchemeFinish(wheelsRecessed);
  // camo_spotting r3: lifted off near-black so lighting models tire rings
  // instead of silhouetting them (Tiger bullseye critique).
  const rubber = track(setup(new THREE.MeshStandardMaterial({
    color: 0x292a28, roughness: 0.96, metalness: 0.0,
  })));
  // Accessories must never read as raw #000 blockout: scheme-tinted fittings
  // and gunmetal hardware, both with roughness variation.
  // r9 (camo white-deck major): the old 0.66-roughness/0.28-metalness combo
  // turned every LARGE flat fitting into a sky mirror at grazing angles — the
  // T-34-85 engine access plate and the T-90M deck-grille louvers rendered
  // bare WHITE under the garage key in every pattern (Fresnel -> 1 at grazing
  // + roughnessMap dipping effective GGX to ~0.3), so the scheme tint that
  // repaintEntry applies was invisible. Fittings are brush-painted over steel:
  // matte, same response family as the wheels (0.8/0.1), env trimmed.
  // (Measured: at 0.85/0.10 the grazing Fresnel sheen STILL washed the plate
  // — the hull only survives the same key because it runs roughness 1.0 with
  // a dark map. Fittings paint matches the hull's fully-matte response.)
  const detail = track(setup(new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssRGB(detailRgbOf(patVis))),
    roughness: 1.0, metalness: 0.04, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 0.25,
  })));
  // Wheel-bay / sponson-underside ambient occlusion: near-black matte panels
  // that give running gear a shadowed pocket to read against (r5 hard gate).
  const shadow = track(setup(new THREE.MeshStandardMaterial({
    color: 0x0b0c0a, roughness: 0.98, metalness: 0.0,
  })));
  const paintableRecs: PaintableRecord[] = [
    { m: wheels, kind: 'wheels' },
    { m: wheelsRecessed, kind: 'wheelsDark' },
    { m: detail, kind: 'detail' },
  ];
  // Gun-metal (muzzle brake / bare-steel fittings): roughness floor raised
  // 0.55 -> 0.70 (lighting_post r1) — with the multiplying roughnessMap the
  // old base dipped the effective GGX roughness to ~0.25-0.3 and the barrel
  // top blew to a clipped pure-white specular spike under the field sun.
  // r9 (camo white-deck major, second half): default envMapIntensity 1.0 +
  // metalness 0.45 mirrored the bright PMREM zenith off big HORIZONTAL dark
  // plates — the T-90M's engine-deck grille base read light gray from the
  // garage camera while small vertical hardware looked fine. Gunmetal on a
  // fighting vehicle is dusty and near-diffuse; keep the tone, kill the sky
  // mirror.
  const dark = track(setup(new THREE.MeshStandardMaterial({
    // r3: hue pulled off the blue-grey — 0x33383a leaned navy under the sky
    // env and cool key light; neutral warm gunmetal keeps fittings in the
    // same family as the dust/steel gear.
    color: 0x36342f, roughness: 0.9, metalness: 0.18, roughnessMap: roughTex,
    envMapIntensity: 0.22,
  })));
  // Individual track-link pads: worn dusty steel, clearly lighter than the
  // shadowed band behind them so the run reads as articulated links up close.
  // r7: metalness dropped 0.38 -> 0.16 and roughness raised — under the field
  // sun the old values fired a glossy-black-plastic specular off sprockets
  // and link pads; worn track steel is dusty and near-diffuse.
  // r10 (critic: "blue-violet specular tint on sprocket/idler wraps — reads
  // anodized"): the default envMapIntensity 1.0 mirrored the blue PMREM sky
  // off every link/sprocket. Worn track steel is dusty near-diffuse — env
  // response cut hard, metalness trimmed, color nudged toward dust brown.
  // tank_models r1: color pulled to dust-brown iron and env cut again — the
  // 0.22 sky response still tinted whole link runs blue-violet in wheel-bay
  // shade ("blue-tinted duplo bricks" critique).
  // tank_models r2 (critic major: Leo 2A7 "near-side track renders light
  // desert-tan while the far track is dark steel"): the 0x57503f dust-brown
  // pads flared warm TAN under direct key light while the shaded far side
  // kept the dark band read — one vehicle, two apparent track materials.
  // Neutral dark iron with only a hint of dust keeps both sides in the same
  // family under any lighting.
  // tank_models r4 (Leo 2A7 "desert-tan rear track against dark track
  // elsewhere on the same vehicle"): 0x46423a link pads bounced to pale sand
  // under direct sun while the band texture stayed near-black — one run read
  // as two materials. Pads pulled down into the band's own tonal family.
  const trackLink = track(setup(new THREE.MeshStandardMaterial({
    color: 0x353634, roughness: 0.95, metalness: 0.08, roughnessMap: roughTex,
    envMapIntensity: 0.08,
  })));
  // Spare track links carried as stowage/armor: dark oily track steel — the
  // light-grey trackLink shade read as unpainted plastic sprue racked on the
  // Tiger turret sides (r6); the live run needs the lighter tone, spares don't.
  const spareTrack = track(setup(new THREE.MeshStandardMaterial({
    // r3: roughness floor raised / metalness cut — with the multiplying
    // roughnessMap the 0.85 base dipped to sparkling flecks on idler/sprocket
    // recess faces (the T-90M "navy sparkle" read under the closeup key).
    color: 0x353634, roughness: 0.94, metalness: 0.08, roughnessMap: roughTex,
    envMapIntensity: 0.06,
  })));
  // Optics / headlight lenses: smoked dark-olive glass (round 3, 2026-10-07). The old smooth blue-grey MIRROR
  // (0x2a3540, metalness 0.85, full env) fired the PMREM sky as the most saturated blue on the vehicle. Critics:
  // T-90M "the optics are flat, saturated royal-blue patches", Oplot "the saturated blue box on the turret roof",
  // Type 99A "flat cyan/blue rectangular patches ... leftover UI or placeholder texture". The Pershing, Challenger
  // and Leopard families had each patched it locally (the 'glass calm-down' lineage). The shared lens now takes
  // that smoked tint fleet-wide: a dark faintly green body, a soft sheen at close range, and almost no sky mirror.
  // Round 4 (2026-10-07; wave 215 on the Type 99A turret top: "the periscope or sight housings beside the machine gun
  // show perfectly flat blue glass with no reflection", on its broad forward windows seen from above): at grazing
  // incidence the round-3 pane still mirrored about twice as much sky as it showed paint (three's DFG terms at N.V
  // 0.1-0.2: sky 0.058-0.068 against paint 0.029), one flat patch of sky blue. Matte smoked glass: rougher, almost
  // dielectric, a quarter of the sky (sky:paint 0.43 at grazing, 0.12 face-on), the same smoked tint.
  const glass = track(setup(new THREE.MeshStandardMaterial({
    color: 0x343b34, roughness: 0.58, metalness: 0.08, envMapIntensity: 0.16,
  })));
  // Gun tube: painted in the vehicle scheme like the hull — crews paint the
  // tube, only the muzzle brake stays bare steel (routed to the dark bucket).
  // Uses the same box-projected camo map as the shell so it never reads as an
  // untextured black prop, with a gentle normal so sleeve clamps still catch.
  // camo_spotting r4: same matte-paint family as the hull (the tube is
  // scheme-painted) — the 0.72 base fired the hull's specular film along the
  // top of the tube under the garage key.
  const barrel = track(setup(new THREE.MeshStandardMaterial({
    map: camoTex, roughness: 0.8, metalness: 0.08, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true, envMapIntensity: 0.45,
  })));
  // tank_models r7 (critic: "solid cream rectangular prism" stowage on the
  // Challenger 2 bustle/deck + K2 turret side): 0x59543f is warm-biased —
  // under the ~4.5x warm key + ACES it tonemapped to flat CREAM while the
  // hull camo stayed green, so every canvas bundle read as an unpainted
  // placeholder primitive. OD canvas is duller, darker and green-biased.
  const usesSchemeTintedCanvas = spec.id === 't72b3m' || spec.id === 'bmpt_terminator2';
  const canvasCloth = track(setup(new THREE.MeshStandardMaterial({
    color: usesSchemeTintedCanvas
      ? new THREE.Color(cssRGB(canvasRgbOf(patVis)))
      : 0x42452f,
    roughness: 0.97, metalness: 0.0,
    bumpMap: roughTex, bumpScale: 0.5, envMapIntensity: 0.25,
    // sealed check 2026-09-13: cloth is thin and seen from both sides —
    // single-sided ghillie strips, tarps and aprons vanished from behind and
    // exposed the hull through the suit as the camera orbited.
    side: THREE.DoubleSide,
  })));
  // The T-72B3M family uses broad modeled canvas aprons and bustle packs.
  // Keep those surfaces map-free (the profile owns that rule), but tint the
  // dedicated cloth material with every active camouflage so winter/desert
  // paints do not leave factory-green rectangles behind. The darker solid
  // tint preserves a readable canvas-vs-armor hierarchy without repeating a
  // full camouflage atlas on each local-UV bag or panel.
  if (usesSchemeTintedCanvas) {
    paintableRecs.push({ m: canvasCloth, kind: 'canvas' });
  }
  // FSP-06 (owner 2026-09-25, material roles): pale sand-khaki canvas for desert / IDF soft kit — the
  // Merkava family's "pale kit" tarps, bustle packs, shelf cloth and rolled loads had ridden the hull camo
  // because the only cloth in the vocabulary was the OD canvas above (their author's note: "pale sand kit
  // + strap seams instead"). Fixed tone, never repainted: real IDF kit stays khaki under any scheme. Kept
  // under the hull's value on Sinai Grey (#6f7566) so it reads as kit, not as a lit hull face.
  const canvasPale = track(setup(new THREE.MeshStandardMaterial({
    color: 0x66604a, roughness: 0.97, metalness: 0.0,
    bumpMap: roughTex, bumpScale: 0.5, envMapIntensity: 0.25,
    side: THREE.DoubleSide,
  })));
  for (const rec of paintableRecs) shared.paintable.add(rec);
  const wood = track(setup(new THREE.MeshStandardMaterial({
    // round 4 (2026-10-07; wave 215 on the M60A1: "the crate reads as varnished mahogany furniture"): matte, greyer,
    // weathered issue-crate wood (was 0x6b543a, a warm stain at roughness 0.88 under the full sky env)
    color: 0x5f5648, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.12,
    bumpMap: roughTex, bumpScale: 0.3,
  })));
  // Unditching logs (2026-10-07, tank-accessories round 4; wave 214 on the T-90M: "a smooth orange or peach tube. Give
  // it bark, end grain and a darker brown"; wave 216 on the PT-91: "a smooth brown tub"): the plain wood tone above lit
  // to peach under the warm key and could not tell bark from end grain. Logs carry their own linear wood colours in
  // the vertex colour (accessoryPrimitives.barkLog `tinted`: grey-brown furrowed bark, pale sapwood round a warmer
  // heart, darker rings), over a white, fully matte, sky-blind base; sawn ends, rings and bark share this one draw.
  const bark = track(setup(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.97, metalness: 0.0,
    bumpMap: roughTex, bumpScale: 0.6, envMapIntensity: 0.18,
  })));
  // Charred wreck: a baked scorched variant of the CAMO map (soot blotches +
  // rising streaks over the darkened pattern) instead of the r2 flat clay
  // color — plus a patchy ember emissiveMap that tankFactory pulses/cools
  // over the first ~20 s of the wreck (emissiveIntensity is animated there).
  const burnt = track(setup(new THREE.MeshStandardMaterial({
    // The destroyed maps are genuinely deferred. Every Garage visual used to
    // allocate and retain a 1024² char atlas plus its ember atlas even though
    // the material is never presented there. Battle warming still builds and
    // uploads the exact same maps before rollout; prepareBurnt is also the
    // synchronous correctness fallback if a diagnostic skips that warm.
    map: null, roughness: 0.94, metalness: 0.16, roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.9, 0.9),
    emissive: 0xff5a18, emissiveIntensity: 0.018, emissiveMap: null,
  })));
  const prepareBurnt = () => {
    ensureBurntTextures(shared, aniso);
    if (!shared.burntTex || !shared.emberTex) {
      throw new Error(`vehicle material cache entry ${shared.cacheKey} has no burnt textures`);
    }
    if (burnt.map === shared.burntTex && burnt.emissiveMap === shared.emberTex) return;
    burnt.map = shared.burntTex;
    burnt.emissiveMap = shared.emberTex;
    // USE_MAP and USE_EMISSIVEMAP are program defines. Force one relink when
    // the deferred atlases first attach; the covered battle warm owns it.
    burnt.needsUpdate = true;
  };
  // effects_combat r3: lift the charred albedo floor ~1.3x (color multiplier
  // above white) so wrecks read as scorched steel rather than a silhouette
  // in overcast/shadowed framings.
  // r5: 1.3 -> 1.5 with the lifted char stack above — scorched steel, not a
  // light-swallowing silhouette (r4 "black hole against sunlit grass").
  // r7 (critic critical: wreck reads "bone-white/cream" where this fallback
  // is sunlit): 1.5 over the pale scorched-camo bake rendered lit panels as
  // bleached bone. 0.72 puts the rare fallback swap in the same charcoal
  // family as the shader burn mask (real wrecks char DARK).
  burnt.color.setScalar(0.72);
  // r5 WORLD-SPACE TRIPLANAR charred sampling: the burnt swap must work on
  // ANY mesh, including sourced GLBs whose palette-atlas UVs collapse whole
  // faces to a few texels — with plain UV sampling those wrecks rendered as
  // a featureless black slab with the ember pockets magnified into giant
  // soft red "spotlight" blobs (r4 wreck-closeup major). Triplanar in world
  // space gives every wreck the same soot/char frequency regardless of UV
  // layout or model unit scale; wrecks are static, so no texture swim.
  burnt.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBwPos;\nvarying vec3 vBwNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 bwp = vec4( transformed, 1.0 );
  vec3 bwn = objectNormal;
  #ifdef USE_INSTANCING
    bwp = instanceMatrix * bwp;
    bwn = mat3( instanceMatrix ) * bwn;
  #endif
  vBwPos = ( modelMatrix * bwp ).xyz;
  vBwNrm = normalize( mat3( modelMatrix ) * bwn );
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBwPos;
varying vec3 vBwNrm;
vec4 burntTri( sampler2D m, vec3 p, vec3 n, float sc ) {
  vec3 w = pow( abs( n ), vec3( 3.0 ) );
  w /= ( w.x + w.y + w.z + 1e-4 );
  return texture2D( m, p.zy * sc ) * w.x +
         texture2D( m, p.xz * sc ) * w.y +
         texture2D( m, p.xy * sc ) * w.z;
}`)
      .replace('#include <map_fragment>', `{
  vec4 sampledDiffuseColor = burntTri( map, vBwPos, vBwNrm, 0.34 );
  diffuseColor *= sampledDiffuseColor;
}`)
      .replace('#include <emissivemap_fragment>', `{
  vec4 emissiveColor = burntTri( emissiveMap, vBwPos + vec3( 3.7, 1.3, 8.1 ), vBwNrm, 0.21 );
  totalEmissiveRadiance *= emissiveColor.rgb;
  // r1 wreck ambient floor: shadowed flanks of a wreck read as featureless
  // pure-black slabs (destroy_2s/5s/25s near flank). A small albedo-scaled
  // fill keeps the soot gradients/panel structure readable from any angle
  // while staying far below the sun-lit side's response.
  totalEmissiveRadiance += diffuseColor.rgb * 0.125; // r5: shadow-side floor up
}`);
  };
  burnt.customProgramCacheKey = () => 'burnt-triplanar-r6';

  // Independent L/R UV transforms share the immutable image Source, so Three
  // can retain one GPU texture without coupling either side's scrolling.
  const trackTexL = track(canvasTex(shared.trackCanvas, { aniso, repeat: true }));
  const trackTexR = track(trackTexL.clone());
  // r10: metalness 0.3 + full env fired the blue-sky mirror off the band's
  // grazing faces (anodized-purple wrap critique) — dusty steel instead.
  const trackMatOpts = { roughness: 0.92, metalness: 0.1, envMapIntensity: 0.1 };
  const trackL = track(setup(new THREE.MeshStandardMaterial({
    map: trackTexL, bumpMap: trackTexL, bumpScale: 0.5, ...trackMatOpts })));
  const trackR = track(setup(new THREE.MeshStandardMaterial({
    map: trackTexR, bumpMap: trackTexR, bumpScale: 0.5, ...trackMatOpts })));

  const marking = vehicleMarkingRecord(spec);
  const decalCache = new Map<string, THREE.MeshStandardMaterial>();
  const decalTextureLeases: SootTextureLease[] = [];
  const decal = (kind: string, text?: string | null): THREE.MeshStandardMaterial => {
    const key = `${marking.markingCode}:${kind}:${text || ''}`;
    if (!decalCache.has(key)) {
      const lease = kind === 'soot' && engineCtx
        ? acquireSootTexture(engineCtx, aniso, () => canvasTex(paintDecal(kind, text, marking), { aniso }))
        : null;
      if (lease) decalTextureLeases.push(lease);
      const t = lease?.texture ?? track(canvasTex(paintDecal(kind, text, marking), { aniso }));
      // number decals re-bake when their font loads (paintDecal registered first, so
      // its redraw runs before this) — push the fresh canvas to the GPU.
      if (document.fonts && !document.fonts.check("bold 16px 'ABC Monument Grotesk'")) {
        document.fonts.load("bold 16px 'ABC Monument Grotesk'").then(faces => { if (faces.length) t.needsUpdate = true; }).catch(() => {});
      }
      const m = track(setup(new THREE.MeshStandardMaterial({
        map: t, transparent: true, roughness: 0.8, metalness: 0.1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        depthWrite: false,
      })));
      // a marking is paint on the plate: it takes the plate's field wear (VEHICLE_FIELD_WEAR_GARAGE), not a clean patch
      m.defines = { ...m.defines, COT_FIELD_WEAR: 1 };
      decalCache.set(key, m);
    }
    const material = decalCache.get(key);
    if (!material) throw new Error(`vehicle decal ${key} was not created`);
    return material;
  };

  // One semantic material vocabulary for builders, live audits and asset
  // generation. Names are diagnostic only; roles are the stable contract.
  // In particular, wheel paint and camouflage guards stay distinct from
  // working track steel/rubber so palette cleanup cannot erase side armor.
  tagVehicleMaterial(hull, 'armorPaint', 'armor-paint');
  tagVehicleMaterial(wheels, 'wheelPaint', 'wheel-paint');
  tagVehicleMaterial(wheelsRecessed, 'wheelPaint', 'wheel-paint-recessed');
  tagVehicleMaterial(rubber, 'tireRubber', 'tire-rubber');
  tagVehicleMaterial(detail, 'fittingPaint', 'fitting-paint');
  tagVehicleMaterial(dark, 'gunmetal', 'gunmetal');
  tagVehicleMaterial(shadow, 'gearShadow', 'gear-shadow');
  tagVehicleMaterial(trackLink, 'trackSteel', 'track-steel');
  tagVehicleMaterial(spareTrack, 'trackSteel', 'spare-track-steel');
  tagVehicleMaterial(glass, 'opticGlass', 'optic-glass');
  tagVehicleMaterial(barrel, 'armorPaint', 'barrel-paint');
  tagVehicleMaterial(canvasCloth, 'canvas', 'canvas');
  tagVehicleMaterial(canvasPale, 'canvasPale', 'canvas-pale');
  tagVehicleMaterial(wood, 'wood', 'wood');
  tagVehicleMaterial(bark, 'wood', 'bark');
  tagVehicleMaterial(burnt, 'burnt', 'burnt');
  tagVehicleMaterial(trackL, 'trackBand', 'track-band-left');
  tagVehicleMaterial(trackR, 'trackBand', 'track-band-right');

  // 2026-10-07 field wear (VEHICLE_FIELD_WEAR_GARAGE): painted bodywork, fittings and gunmetal take the dust, mud and
  // soot of the vehicle frame (1); the wheels, tyres and track links their own running-gear wear (2); the scrolling track
  // band a pattern-free film (3). Glass, the AO panels and the wreck stay as they are. Round 4 (2026-10-07): cloth and
  // wood (4) wear the bodywork's dust, mud, soot and stains without its bare-steel chips, slick oil or seam grime.
  for (const [mode, materials] of [
    [1, [hull, barrel, detail, dark]],
    [2, [wheels, wheelsRecessed, rubber, trackLink, spareTrack]],
    [3, [trackL, trackR]],
    [4, [canvasCloth, canvasPale, wood, bark]],
  ] as const) {
    for (const material of materials) material.defines = { ...material.defines, COT_FIELD_WEAR: mode };
  }

  // Fittings are assembled after the material set is created, outside the
  // main hull/turret merge that normally owns boxUV(). Publish the fleet
  // repeats-per-metre density on every mapped paint material so a fitting can
  // project one continuous, physically scaled camouflage field over its
  // complete merged shell. Without this contract each primitive retained its
  // stock 0..1 UV island, squeezing the entire camouflage atlas onto every
  // roof-tower plate, fork arm and bearing drum. Round 35: the density is the
  // same constant every hull projects with (camoWorldScale.ts), so a pattern
  // reads at one world size on hull, turret and fittings alike.
  const camoUvScale = CAMO_UV_REPEATS_PER_M;
  for (const material of [hull, barrel]) {
    material.userData = {
      ...(material.userData || {}),
      camoProjection: 'vehicle-scale-box-uv',
      camoUvScale,
    };
  }

  return {
    hull, wheels, wheelsRecessed, rubber, detail, dark, shadow, trackLink, spareTrack, glass, barrel,
    canvasCloth, canvasPale, wood, bark, burnt,
    trackL, trackR, trackTexL, trackTexR,
    trackLinkM: 0.165 * 4, // meters of track per full texture repeat (4 links)
    prepareBurnt,
    decal,
    dispose() {
      for (const rec of paintableRecs) shared.paintable.delete(rec);
      for (const resource of disposables) {
        if ('isMaterial' in resource && resource.isMaterial) {
          engineCtx?.releaseShadowMaterial?.(resource);
        }
        resource.dispose();
      }
      for (const lease of decalTextureLeases) lease.release();
      releaseSharedTextures(shared);
    },
  };
}

// ---------------------------------------------------------------------------
// Shader-driven wreck burn mask (effects_combat r6)
// ---------------------------------------------------------------------------
// The r5 wreck pipeline swapped whole meshes to the shared `burnt` material on
// a staggered timer (charQueue). The critic verdict: "staged char swap pops
// per-mesh with a hard boundary — half coal-black, half pristine camo split on
// a mesh seam — and by 2.5 s the wreck is a matte black void", plus the popped
// turret flew as "a flat unlit pure-black cutout with a pristine painted
// barrel still attached" (the swap staging is per-mesh and random, so a barrel
// could stay painted while its turret charred).
//
// This factory replaces the binary swap with a CONTINUOUS burn front computed
// in the fragment shader ON CLONES OF THE TANK'S OWN MATERIALS:
//  - world-space value noise + a top-down height ramp drive a single ignition
//    front that sweeps the whole vehicle over ~2.1 s — it crosses mesh seams
//    smoothly, so there is never a half-and-half wreck;
//  - the sweeping front itself GLOWS ember-hot (uBurnGlow, decays over ~2 s):
//    panels visibly scorch while burning, and the airborne popped turret is
//    fire-lit from within instead of reading as an unlit silhouette;
//  - the final char keeps ~30% of panels at partial burn (noise-capped mask):
//    desaturated darkened paint remnants — a burnt VEHICLE, not a coal cutout;
//  - ember pockets throb in fully-charred seams via uBurnEmber (driven by the
//    wreck ember timer in tankFactory.syncFromState).
// One shared uniforms object per tank drives every clone, so the whole wreck
// animates in lockstep and stepped/frozen captures land mid-sweep correctly.

const BURN_COMMON_GLSL = `
uniform float uBurnT;
uniform float uBurnSeed;
uniform float uBurnLo;
uniform float uBurnHi;
uniform float uBurnGlow;
uniform float uBurnEmber;
varying vec3 vBrnW;
float brnHash( vec3 p ) { return fract( sin( dot( p, vec3( 17.13, 113.7, 41.7 ) ) ) * 43758.5453 ); }
float brnNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = brnHash( i );
  float n100 = brnHash( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = brnHash( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = brnHash( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = brnHash( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = brnHash( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = brnHash( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = brnHash( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix( mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
              mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ), f.z );
}
`;

const BURN_DIFFUSE_GLSL = `
float brnM = 0.0;
float brnBand = 0.0;
float brnKeep = 0.0;
if ( uBurnT >= 0.0 ) {
  vec3 bp = vBrnW * 1.9 + vec3( uBurnSeed );
  float brnN = brnNoise( bp ) * 0.62 + brnNoise( bp * 2.9 + 11.3 ) * 0.38;
  // 0 at the turret roof -> 1 at the tracks: fire starts topside (the blast
  // and the rack cook-off live there) and eats DOWN the hull
  float brnH = clamp( ( uBurnHi - vBrnW.y ) / max( uBurnHi - uBurnLo, 0.5 ), 0.0, 1.0 );
  // sweep tune (r6 verify): /2.1 with a 0.60 height span charred the whole
  // deck by 0.6 s and put half the hull inside the glow band at once — the
  // staged explosion showed BLEACHED pale flanks. /2.4 + 0.80 span keeps the
  // front spatially tight: deck chars under the fireball, flanks follow over
  // ~1.5 s, running gear last (~3 s).
  float brnProg = uBurnT / 2.4;
  float brnX = brnProg - ( brnH * 0.80 + brnN * 0.50 - 0.12 );
  brnM = smoothstep( 0.0, 0.24, brnX );
  // the ignition FRONT: a NARROW ragged glowing edge right where the sweep
  // is eating (wide band + flat gain was the pale-flank wash)
  brnBand = smoothstep( -0.035, 0.005, brnX ) * ( 1.0 - smoothstep( 0.02, 0.14, brnX ) )
    * ( 0.25 + 0.75 * smoothstep( 0.35, 0.78, brnNoise( vBrnW * 5.7 + vec3( uBurnSeed * 2.9 ) ) ) );
  // ~30% survivor panels: low-frequency noise caps the char so patches of
  // desaturated scorched paint survive the full burn (WoT wreck read)
  brnKeep = smoothstep( 0.60, 0.86, brnNoise( vBrnW * 0.85 + vec3( uBurnSeed * 1.7 + 5.1 ) ) );
  brnM *= 1.0 - 0.46 * brnKeep;
  if ( brnM > 0.001 ) {
    float brnLum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    // r7 char rework (critic: "real wrecks char DARK while retaining surface
    // detail"): the char MULTIPLIES the panel's own albedo toward charcoal
    // instead of replacing it with flat noise — camo edges, panel lines,
    // bolts and the normal/roughness response all survive under the soot,
    // just compressed dark. A low-frequency soot-tone noise varies the
    // multiplier panel to panel (patchy burn), and a small additive ash
    // floor guarantees no region ever clips to lightless black. Typical
    // paint (0.10-0.35 linear luma) lands at ~0.035-0.075 — charcoal-dark
    // in sun, still self-similar in shade.
    float brnTone = brnNoise( vBrnW * 3.1 + vec3( uBurnSeed * 2.3 ) );
    vec3 brnChar = diffuseColor.rgb * mix( vec3( 0.105, 0.090, 0.078 ), vec3( 0.27, 0.235, 0.20 ), brnTone )
      + vec3( 0.021, 0.018, 0.015 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( brnLum ) * 0.62, brnM * 0.55 );
    diffuseColor.rgb = mix( diffuseColor.rgb, brnChar, brnM );
  }
}
`;

const BURN_EMISSIVE_GLSL = `
if ( uBurnT >= 0.0 ) {
  // sweeping ignition edge: ember-hot rim light on the panel being eaten
  totalEmissiveRadiance += vec3( 1.35, 0.38, 0.065 ) * brnBand * uBurnGlow
    * ( 0.45 + 0.55 * brnNoise( vBrnW * 6.3 + vec3( uBurnSeed * 3.1 ) ) );
  // fireball wash: while the blast burns, charred surfaces carry a warm fill
  // so the popped turret / fresh wreck reads fire-lit, never a black cutout.
  // lighting_post r5 (critic MAJOR: "flying turret is a solid black
  // silhouette over the fireball"): the linear-in-brnM wash peaked at ~0.05
  // luminance — invisible after the ACES toe. pow(brnM,0.4)*0.62 lands
  // fully-charred faces at ~0.26 luminance (clearly fire-lit orange, under
  // bloom threshold) and reaches partially-charred panels early, while
  // staying exactly zero on unburned paint (keep it a brnM product — a
  // brnM-independent base term regressed a GLB deck to black).
  // r7: 0.62 -> 0.34 — against the darker multiply-char albedo the old gain
  // FLOODED the whole wreck uniform orange for seconds (probe destroy_2_5s);
  // the wash must fire-light the toss beat, then hand the surface back to
  // the charred diffuse (uBurnGlow also decays 1.5 s -> 0.9 s, tankFactory).
  totalEmissiveRadiance += vec3( 0.95, 0.34, 0.10 ) * uBurnGlow * 0.34 * pow( brnM, 0.4 );
  // ember pockets smoldering in seams of the finished char (throb + cool)
  // r7: tighter pocket gate + ~half gain — pockets are seams, not a coat
  float brnPk = smoothstep( 0.80, 0.97, brnNoise( vBrnW * 4.7 + vec3( uBurnSeed * 4.9 + 3.7 ) ) );
  totalEmissiveRadiance += vec3( 0.72, 0.16, 0.028 ) * brnPk * brnM * uBurnEmber * ( 1.0 - brnKeep );
  // shadow-side albedo floor: charred flanks keep their soot/panel gradients
  // readable from any angle (matches the old burnt material's wreck floor)
  // r7: 0.11 -> 0.19 — with the darker multiply-char albedo the shaded side
  // of a wreck needs a touch more ambient fill so soot gradients stay
  // readable from any bearing (never a lightless region, never a wash).
  totalEmissiveRadiance += diffuseColor.rgb * 0.19 * brnM;
}
`;

/**
 * Shared burn-driver uniforms for one tank visual. uBurnT < 0 disables the
 * whole mask (the clone renders identically to its source material).
 * @param {number} seed
 * @returns {object} uniform refs shared by every burn clone of the tank
 */
export function makeBurnUniforms(seed: number) {
  return {
    uBurnT: { value: -1 },
    uBurnSeed: { value: (seed % 1000) * 0.37 + 3.1 },
    uBurnLo: { value: 0 },
    uBurnHi: { value: 2.6 },
    uBurnGlow: { value: 0 },
    uBurnEmber: { value: 0 },
  };
}

/**
 * Wrap `mat` IN PLACE with the burn mask, chaining its existing
 * onBeforeCompile stack (CSM cascade patch, GLB camo overlay, ambient-floor
 * hook) so the material keeps its full live look until uBurnT rises past 0.
 *
 * In place, not a clone: vehicle materials are built per visual (procedural
 * set + per-tank GLB camo clones), the GLB camo overlay exists only as a
 * shader hook (a clone loses the paint — r6 verify: pale raw-bake M1A2
 * wreck), and three's CSM keys its uniform registry by the material captured
 * in the hook closure, so only the original object can chain it safely. The
 * mask idles at zero cost when uBurnT < 0 (resetDestroyed), so the wrap can
 * persist for the visual's lifetime.
 *
 * @param {THREE.Material} mat MeshStandardMaterial (or derived), per-visual
 * @param {object} burnU shared uniforms from makeBurnUniforms
 * @returns {boolean} true when the material now carries THIS tank's burn
 *   driver; false when not patchable (or owned by another visual's driver —
 *   caller falls back to the shared burnt material)
 */
export function applyBurnHook(
  mat: THREE.Material | null | undefined,
  burnU: BurnUniforms,
): boolean {
  if (!mat || !('isMeshStandardMaterial' in mat) || mat.isMeshStandardMaterial !== true) return false;
  // shared-material guard: if some cache path ever hands two visuals the
  // same material instance, only the first owns the burn driver — the
  // second visual must not hijack it (its wreck falls back to mats.burnt).
  if (mat.userData.__burnU) return mat.userData.__burnU === burnU;
  mat.userData.__burnU = burnU;
  const prevHook = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile : null;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (shader, renderer) {
    if (prevHook) prevHook.call(this, shader, renderer);
    Object.assign(shader.uniforms, burnU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBrnW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 brnP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    brnP = instanceMatrix * brnP;
  #endif
  vBrnW = ( modelMatrix * brnP ).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BURN_COMMON_GLSL}`)
      .replace('#include <roughnessmap_fragment>',
        `${BURN_DIFFUSE_GLSL}\n#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.95, brnM );`)
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.06, brnM );')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${BURN_EMISSIVE_GLSL}`);
  };
  // the wrapped shader string differs from unwrapped materials sharing the
  // old cache key — suffix it so the program cache never aliases them
  mat.customProgramCacheKey = function () {
    return (typeof prevKey === 'function' ? prevKey.call(this) : '') + '|burn-r6';
  };
  mat.needsUpdate = true;
  return true;
}
