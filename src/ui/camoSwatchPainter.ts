/**
 * Demand-loaded exact camouflage swatch renderer. This decorative canvas
 * work stays outside the garage-critical graph; garage.ts supplies an
 * immediate deterministic placeholder until this module is resident.
 *
 * Round 35 (owner 2026-09-21: "fix our camos completely: the look of identical camos looks completely different if
 * you switch between tanks. this system is busted"). The picker used to run a SEPARATE simplified painter seeded by
 * `${spec.id}:${pid}` at a bolder 1.6x scale, so a swatch never matched the hull and changed with every tank. It now
 * paints the REAL tile with the production painter (`createMaterialPainter().paintCamo`, the same recipe and the
 * same hull-independent stream `materials.camoPatternStreamSeed` the hull bakes with) and shows a crop of it: the
 * hull projects one tile per CAMO_TILE_SPAN_M (2 m), so the 128 x 44 swatch is the tile's middle 2 m x 0.69 m band
 * at 2:1 — what that much armour looks like on ANY hull wearing the pattern. Hull-only surface knobs (zimmerit, panel
 * plan, markings) are not part of a pattern and stay out of the swatch; a pattern that legitimately depends on the
 * vehicle (Factory = the nation's service pattern, Signature, winter over the authored coat) still resolves per spec.
 */
import {
  createMaterialPainter, type MaterialVisual, type PlateFeatures,
} from '../vehicles/materialPainter.ts';
import { camoPatternIdHash, camoPatternStreamSeed, resolveCamoVisual } from '../vehicles/materials.ts';
import { CAMO_TILE_SPAN_M } from '../vehicles/camoWorldScale.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';

// --- CAMO PICKER SECTION: swatch painter ------------------------------------
export const CAMO_SWATCH_WIDTH = 128;
export const CAMO_SWATCH_HEIGHT = 44;
/** Resolution the 2 m tile is painted at; the swatch shows it at 2:1 (64 px per metre). Measured at 4.5 ms per tile
 * against 3.9 ms at 128 px (cost is per draw call, not per texel), so the antialiased crop is worth the 16%. */
export const CAMO_SWATCH_TILE_PX = 256;
/** World metres the swatch shows: one full tile across, the same scale down. */
export const CAMO_SWATCH_SPAN_M = Object.freeze({
  width: CAMO_TILE_SPAN_M,
  height: CAMO_TILE_SPAN_M * CAMO_SWATCH_HEIGHT / CAMO_SWATCH_WIDTH,
});
/** Source band of the tile the swatch crops (tile px): full width, the vertical middle at the swatch aspect. */
export const CAMO_SWATCH_CROP = Object.freeze({
  x: 0,
  y: Math.round((CAMO_SWATCH_TILE_PX - CAMO_SWATCH_TILE_PX * CAMO_SWATCH_HEIGHT / CAMO_SWATCH_WIDTH) / 2),
  width: CAMO_SWATCH_TILE_PX,
  height: Math.round(CAMO_SWATCH_TILE_PX * CAMO_SWATCH_HEIGHT / CAMO_SWATCH_WIDTH),
});
/** A swatch has no hull: no panel plan, rivets, chips or rust weeps — the pattern alone. */
const CAMO_SWATCH_EMPTY_FEATURES: Readonly<PlateFeatures> = Object.freeze({
  hLines: [], vLines: [], rings: [], chips: [], streaks: [],
});
/** Cached 128 x 44 results (about 22 KB each); the catalog is ~165 patterns and custom paints come and go. */
const SWATCH_CACHE_LIMIT = 320;
/** Main-thread budget per animation frame for cold swatches queued by the garage (see queueCamoSwatch). */
const SWATCH_FRAME_BUDGET_MS = 6;

type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

interface CamoSwatchRecipe {
  /** The pattern's own recipe: every knob the painter's pattern section reads, nothing the hull owns. */
  visual: MaterialVisual;
  /** The hull-independent stream the hull bakes this pattern from; also the swatch's grain seed. */
  streamSeed: number;
  /** Identity of the painted result: two specs sharing a preset share this key, and so the swatch. */
  key: string;
}

/** The pattern recipe a spec resolves for `pid`, stripped of hull-only surface knobs. */
export function camoSwatchRecipe(spec: FleetTankSpec, pid: string): CamoSwatchRecipe {
  const resolved = resolveCamoVisual(spec, pid);
  const visual: MaterialVisual = { base: resolved.base || '#5a6b46' };
  if (resolved.scheme !== undefined) visual.scheme = resolved.scheme;
  if (resolved.weather !== undefined) visual.weather = resolved.weather;
  if (resolved.patches !== undefined) visual.patches = [...resolved.patches];
  if (resolved.camoScale !== undefined) visual.camoScale = resolved.camoScale;
  if (resolved.patchK !== undefined) visual.patchK = resolved.patchK;
  if (resolved.digitalCellK !== undefined) visual.digitalCellK = resolved.digitalCellK;
  if (resolved.solidWeatheringIntensity !== undefined) visual.solidWeatheringIntensity = resolved.solidWeatheringIntensity;
  if (resolved.bandAngle !== undefined) visual.bandAngle = resolved.bandAngle;
  if (resolved.blackK !== undefined) visual.blackK = resolved.blackK;
  if (resolved.rainK !== undefined) visual.rainK = resolved.rainK;
  if (resolved.patternRepeat !== undefined) visual.patternRepeat = resolved.patternRepeat;
  if (resolved.drawStrokes !== undefined) visual.drawStrokes = resolved.drawStrokes;
  if (resolved.drawRepeatX !== undefined) visual.drawRepeatX = resolved.drawRepeatX;
  if (resolved.drawRepeatY !== undefined) visual.drawRepeatY = resolved.drawRepeatY;
  if (resolved.drawRotation !== undefined) visual.drawRotation = resolved.drawRotation;
  if (resolved.drawMirror !== undefined) visual.drawMirror = resolved.drawMirror;
  const streamSeed = camoPatternStreamSeed(visual, camoPatternIdHash(pid));
  return { visual, streamSeed, key: `${streamSeed}|${JSON.stringify(visual)}` };
}

let canvasFactory: CanvasFactory | null = null;
let painter: ReturnType<typeof createMaterialPainter<HTMLCanvasElement>> | null = null;
let tileScratch: HTMLCanvasElement | null = null;
const swatchCache = new Map<string, HTMLCanvasElement>();

function resolveCanvasFactory(sample: HTMLCanvasElement): CanvasFactory {
  if (canvasFactory) return canvasFactory;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvasFactory = (width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
  } else {
    // Receipts paint through a native canvas with no document: its constructor takes (width, height).
    const Native = sample.constructor as unknown as new (width: number, height: number) => HTMLCanvasElement;
    canvasFactory = (width, height) => new Native(width, height);
  }
  return canvasFactory;
}

function painterFor(sample: HTMLCanvasElement): NonNullable<typeof painter> {
  if (!painter) painter = createMaterialPainter(resolveCanvasFactory(sample));
  return painter;
}

function cachedSwatch(sample: HTMLCanvasElement, recipe: CamoSwatchRecipe): HTMLCanvasElement {
  const hit = swatchCache.get(recipe.key);
  if (hit) {
    // refresh recency: Map iteration order is insertion order, so re-inserting keeps the hot set resident
    swatchCache.delete(recipe.key);
    swatchCache.set(recipe.key, hit);
    return hit;
  }
  const paint = painterFor(sample);
  const makeCanvas = resolveCanvasFactory(sample);
  if (!tileScratch) tileScratch = makeCanvas(CAMO_SWATCH_TILE_PX, CAMO_SWATCH_TILE_PX);
  const tile = tileScratch;
  tile.width = CAMO_SWATCH_TILE_PX;
  tile.height = CAMO_SWATCH_TILE_PX;
  // The exact production albedo pass for this recipe: same painter, same pattern stream, then the same exposure
  // trim every hull tile receives before it becomes a texture.
  paint.paintCamo(tile, recipe.visual, paint.mulberry32(recipe.streamSeed),
    CAMO_SWATCH_EMPTY_FEATURES as PlateFeatures, recipe.streamSeed);
  paint.exposureTrim(tile);
  const swatch = makeCanvas(CAMO_SWATCH_WIDTH, CAMO_SWATCH_HEIGHT);
  const ctx = swatch.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable');
  ctx.drawImage(tile, CAMO_SWATCH_CROP.x, CAMO_SWATCH_CROP.y, CAMO_SWATCH_CROP.width, CAMO_SWATCH_CROP.height,
    0, 0, CAMO_SWATCH_WIDTH, CAMO_SWATCH_HEIGHT);
  if (swatchCache.size >= SWATCH_CACHE_LIMIT) {
    const oldest = swatchCache.keys().next().value;
    if (oldest !== undefined) swatchCache.delete(oldest);
  }
  swatchCache.set(recipe.key, swatch);
  return swatch;
}

function blit(canvas: HTMLCanvasElement, swatch: HTMLCanvasElement): void {
  canvas.width = CAMO_SWATCH_WIDTH;
  canvas.height = CAMO_SWATCH_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(swatch, 0, 0);
}

/** True when the recipe's swatch is already resident (a blit, no painting). */
export function hasCachedCamoSwatch(spec: FleetTankSpec, pid: string): boolean {
  return swatchCache.has(camoSwatchRecipe(spec, pid).key);
}

/** Receipts and benches: drop every resident swatch so the next paint is cold. */
export function resetCamoSwatchCache(): void {
  swatchCache.clear();
}

/** Paint the exact picker swatch for `pid` as worn by `spec`: a 2 m x 0.69 m crop of the real pattern tile. */
export function paintCamoSwatch(
  canvas: HTMLCanvasElement,
  spec: FleetTankSpec,
  pid: string,
): void {
  blit(canvas, cachedSwatch(canvas, camoSwatchRecipe(spec, pid)));
}

// AUTO is a per-map policy, so its tile previews four real resolved pattern
// families as a clean seasonal contact sheet. The caption below already
// supplies the AUTO identity, so no badge obscures the paint.
export function paintAutoCamoSwatch(
  canvas: HTMLCanvasElement,
  spec: FleetTankSpec,
): void {
  const W = CAMO_SWATCH_WIDTH, H = CAMO_SWATCH_HEIGHT;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.fillStyle = '#11171c';
  c.fillRect(0, 0, W, H);
  const patterns = ['summer', 'desert', 'winter', 'urbanblock'];
  const cellW = W / 2;
  const cellH = H / 2;
  patterns.forEach((pattern, index) => {
    const swatch = cachedSwatch(canvas, camoSwatchRecipe(spec, pattern));
    const x = (index % 2) * cellW;
    const y = Math.floor(index / 2) * cellH;
    c.drawImage(swatch, 0, 0, W, H, x, y, cellW, cellH);
  });
  c.strokeStyle = 'rgba(235,243,250,.28)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(cellW, 0); c.lineTo(cellW, H); c.stroke();
  c.beginPath(); c.moveTo(0, cellH); c.lineTo(W, cellH); c.stroke();
  const shade = c.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,.07)');
  shade.addColorStop(0.55, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(3,6,8,.22)');
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);
}

// --- Garage queue: the picker asks for ~165 swatches at once ------------------
// A resident swatch paints immediately (a tank switch repaints every card, and shared presets are all hits). Cold
// recipes cost a real tile each (4.5 ms mean, a few fleck/oak-leaf tiles far more), so they are drained under a
// per-frame budget instead of stalling the click that opened the picker. The last request per canvas wins.
interface PendingSwatch { spec: FleetTankSpec; pid: string; auto: boolean }
const pending = new Map<HTMLCanvasElement, PendingSwatch>();
let drainScheduled = false;

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function scheduleDrain(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  const run = (): void => { drainScheduled = false; drainPending(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function drainPending(): void {
  const started = nowMs();
  for (const [canvas, job] of pending) {
    pending.delete(canvas);
    if (job.auto) paintAutoCamoSwatch(canvas, job.spec);
    else paintCamoSwatch(canvas, job.spec, job.pid);
    if (nowMs() - started > SWATCH_FRAME_BUDGET_MS) break;
  }
  if (pending.size) scheduleDrain();
}

/** Paint now when resident, otherwise within the next frames under the shared budget. */
export function queueCamoSwatch(
  canvas: HTMLCanvasElement,
  spec: FleetTankSpec,
  pid: string,
  auto = false,
): void {
  if (!auto && hasCachedCamoSwatch(spec, pid)) {
    pending.delete(canvas);
    paintCamoSwatch(canvas, spec, pid);
    return;
  }
  pending.set(canvas, { spec, pid, auto });
  scheduleDrain();
}

/** Receipts: number of swatches still waiting for a frame budget. */
export function pendingCamoSwatchCount(): number {
  return pending.size;
}
// --- END CAMO PICKER SECTION (swatch painter) --------------------------------
