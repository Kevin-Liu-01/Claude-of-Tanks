// Exact canvas painters shared by synchronous vehicle materials and optional
// off-thread prebakes. No Three.js, fleet, DOM creation, or quality policy at import.
import { paintCustomCamoStrokes } from './customCamoCanvas.ts';
import type { CustomCamoStroke } from './camoPolicy.ts';

export type MaterialCanvas = HTMLCanvasElement | OffscreenCanvas;
export type MaterialCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Rng = () => number;
type Rgb = [number, number, number];

export interface MaterialVisual {
  scheme?: string;
  base: string;
  weather?: string;
  patches?: string[];
  camoScale?: number;
  plateLines?: boolean;
  zimmerit?: boolean;
  modernWelds?: boolean;
  solidWeatheringIntensity?: number;
  bandAngle?: number;
  digitalCellK?: number;
  blackK?: number;
  patchK?: number;
  rainK?: number;
  patternRepeat?: number;
  drawStrokes?: CustomCamoStroke[];
  drawRepeatX?: number;
  drawRepeatY?: number;
  drawRotation?: number;
  drawMirror?: boolean;
  number?: string;
}

interface PlateLine {
  p: number;
  weld: boolean;
  bolts: boolean;
  gaps: Array<[number, number]>;
}

interface PlateRing { x: number; y: number; r: number; n: number }
interface PlateChip { x: number; y: number; r: number; metal: boolean }
interface PlateStreak { x: number; y: number; len: number; w: number }

export interface PlateFeatures {
  hLines: PlateLine[];
  vLines: PlateLine[];
  rings: PlateRing[];
  chips: PlateChip[];
  streaks: PlateStreak[];
}

interface PatchRaster {
  path: Path2D;
  mnx: number;
  mny: number;
  mxx: number;
  mxy: number;
}

interface FlameLick {
  x: number;
  y: number;
  ang: number;
  len: number;
  w: number;
  j: number;
}

export interface MaterialBasePaintRequest {
  visual: MaterialVisual;
  seed: number;
  dimensions: { albedo: number; map: number };
  plateLines: boolean;
}

export interface MaterialBasePaintEntry<C extends MaterialCanvas> {
  camoCanvas: C;
  normalCanvas: C;
  roughCanvas: C;
  feats: PlateFeatures | null;
}

export const ALBEDO_SIZE = 2048;
export const MAP_SIZE = 1024;

// Official Claude Code pixel mark (24x24 viewBox, verbatim from the published
// icon) — the 'claude' house camo stamps it as a monogram. Two trailing
// subpaths are the punched-out eyes: fill with 'evenodd' or they close up.
export const CLAUDE_CODE_MARK =
  'M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9' +
  'V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949z' +
  'M6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z';

// Official Claude spark (24x24 viewBox, verbatim from the published icon) —
// the 'spark' camo scatters it from sprinkle to hero scale. One closed
// outline, plain nonzero fill.
export const CLAUDE_SPARK_MARK =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.' +
  '6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4' +
  '797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.' +
  '0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714' +
  '-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925' +
  '.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.27' +
  '33-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.46' +
  '74-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018' +
  ' 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.70' +
  '6.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797' +
  '.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.' +
  '9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.12' +
  '93-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.' +
  '1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278' +
  '.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457' +
  '.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6' +
  '393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.80' +
  '92 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1' +
  '.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.607' +
  '1.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.6' +
  '74 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-' +
  '1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.967' +
  '2-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889' +
  ' 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1' +
  '.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';

export function fillHeightNormalRows(
  src: Uint8ClampedArray,
  d: Uint8ClampedArray,
  S: number,
  strength: number,
  yStart = 0,
  yEnd = S,
): Uint8ClampedArray {
  for (let y = yStart; y < yEnd; y++) {
    const ym = y === 0 ? S - 1 : y - 1;
    const yp = y + 1 === S ? 0 : y + 1;
    const row = y * S;
    const rowM = ym * S;
    const rowP = yp * S;
    for (let x = 0; x < S; x++) {
      const xm = x === 0 ? S - 1 : x - 1;
      const xp = x + 1 === S ? 0 : x + 1;
      const dx = (src[(row + xp) * 4] - src[(row + xm) * 4]) / 255;
      const dy = (src[(rowP + x) * 4] - src[(rowM + x) * 4]) / 255;
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il; ny *= il; nz *= il;
      const i = (row + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  return d;
}

export function applyPatchRoughnessPixels(
  pixels: Uint8ClampedArray,
  size: number,
  classes: Uint8Array,
  classSize: number,
  offsets: number[],
): Uint8ClampedArray {
  let state = 0x51ab7 ^ size;
  for (let y = 0; y < size; y++) {
    state = applyPatchRoughnessRow(
      pixels, size, classes, classSize, offsets, y, state,
    );
  }
  return pixels;
}

function applyPatchRoughnessRow(
  pixels: Uint8ClampedArray,
  size: number,
  classes: Uint8Array,
  classSize: number,
  offsets: number[],
  y: number,
  initialState: number,
): number {
  const classY = y >> 1;
  const row = classY * classSize;
  const southY = classY + 2 < classSize ? classY + 2 : classY + 2 - classSize;
  const south = southY * classSize;
  let pixel = y * size * 4;
  let state = initialState;
  for (let classX = 0; classX < classSize; classX++) {
    const tone = classes[row + classX];
    const east = classX + 2 < classSize ? classX + 2 : classX + 2 - classSize;
    let baseDelta = offsets[tone];
    if (classes[row + east] !== tone || classes[south + classX] !== tone) {
      baseDelta += 0.035;
    }
    state = (state * 1664525 + 1013904223) >>> 0;
    let value = pixels[pixel]
      + (baseDelta + (((state >>> 16) & 255) / 255 - 0.5) * 0.024) * 255;
    value = value < 0 ? 0 : (value > 255 ? 255 : value);
    pixels[pixel] = pixels[pixel + 1] = pixels[pixel + 2] = value;
    pixel += 4;

    state = (state * 1664525 + 1013904223) >>> 0;
    value = pixels[pixel]
      + (baseDelta + (((state >>> 16) & 255) / 255 - 0.5) * 0.024) * 255;
    value = value < 0 ? 0 : (value > 255 ? 255 : value);
    pixels[pixel] = pixels[pixel + 1] = pixels[pixel + 2] = value;
    pixel += 4;
  }
  return state;
}

/** Canvas creation and grain residency belong to this painter instance. */
export function createMaterialPainter<C extends MaterialCanvas>(
  createCanvas: (width: number, height: number) => C,
) {
  function canvas2d(
    canvas: C,
    options?: CanvasRenderingContext2DSettings,
  ): MaterialCanvasContext {
    const context = canvas.getContext('2d', options);
    if (!context) throw new Error('2D canvas context is unavailable');
    return context;
  }

  function mulberry32(a: number): Rng {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}


  const makeCanvas = createCanvas;

  function hexToRgb(hex: string): Rgb {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = (c: Rgb, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const scale3 = (c: Rgb, s: number): Rgb => [c[0] * s, c[1] * s, c[2] * s];
  const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  function capCanvasLuma(ctx: MaterialCanvasContext, size: number, maxLuma: number): void {
    const image = ctx.getImageData(0, 0, size, size);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const pixelLuma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (pixelLuma > maxLuma) {
        const scale = maxLuma / pixelLuma;
        data[i] *= scale;
        data[i + 1] *= scale;
        data[i + 2] *= scale;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  // Smooth rounded organic blob as a reusable Path2D (quadratic midpoint spline),
  // horizontally stretched like real NATO splotches.
  function blobPath2D(rng: Rng, x: number, y: number, r: number, lobes = 9, jitter = 0.55): Path2D {
    const sx = 1.25 + rng() * 0.6;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const rr = r * (1 - jitter / 2 + rng() * jitter);
      pts.push([x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr * 0.78]);
    }
    const p = new Path2D();
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[lobes - 1], pts[0]);
    p.moveTo(m[0], m[1]);
    for (let i = 0; i < lobes; i++) {
      const n = mid(pts[i], pts[(i + 1) % lobes]);
      p.quadraticCurveTo(pts[i][0], pts[i][1], n[0], n[1]);
    }
    p.closePath();
    return p;
  }

  // Angular straight-edged blob (Path2D) — desert/splinter patch language.
  // Same wrap contract as blobPath2D but with hard polygonal facets.
  // CAMO PATTERN SECTION (camo r2 edge treatment): `edgeNoise` (0..1, default
  // OFF) subdivides each facet with normal-displaced midpoints — the
  // camoPatchPath2D spray-boundary treatment — so SPRAYED consumers (desert
  // patches, fleck dapples) stop reading as razor-cut vector stickers once a
  // GLB atlas island magnifies the canvas (tank_models r7 lineage). MASKED
  // hard-edge schemes (splinter, caunter, blocks, dazzle) keep the default 0:
  // their ruler edges are the authentic language, and the rng draw order of
  // every existing caller is untouched at 0.
  function polyPath2D(rng: Rng, x: number, y: number, r: number, lobes = 6, jitter = 0.6, edgeNoise = 0): Path2D {
    const sx = 1.2 + rng() * 0.9;
    const p = new Path2D();
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / lobes);
      const rr = r * (1 - jitter / 2 + rng() * jitter);
      pts.push([x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr * 0.8]);
    }
    if (!edgeNoise) {
      for (let i = 0; i < lobes; i++) {
        if (i === 0) p.moveTo(pts[i][0], pts[i][1]); else p.lineTo(pts[i][0], pts[i][1]);
      }
      p.closePath();
      return p;
    }
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < lobes; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % lobes];
      const dx = x1 - x0, dy = y1 - y0;
      const elen = Math.hypot(dx, dy) || 1;
      const nx = -dy / elen, ny = dx / elen;
      const amp = Math.min(elen * 0.18, r * 0.22) * edgeNoise;
      for (const f of [0.3, 0.62]) {
        const j = (rng() - 0.5) * 2 * amp;
        p.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
      }
      p.lineTo(x1, y1);
    }
    p.closePath();
    return p;
  }

  // Elongated multi-lobe ANGULAR camo patch (Path2D): 2-4 straight-edged lobes
  // strung along one direction, each lobe itself stretched — the sprayed
  // military patch silhouette (NATO Gefechtstarnung / MERDC / Hinterhalt):
  // directional, angular, hard-edged, with concave bites where lobes meet.
  // Replaces the single rounded blob stamps that read as leopard/cow spots at
  // garage distance (r7 factory/summer morphology critique). Overlapping
  // same-winding subpaths union under the default nonzero fill rule.
  function camoPatchPath2D(rng: Rng, x: number, y: number, r: number, ang: number, lobeNIn?: number): Path2D {
    const p = new Path2D();
    // camo_spotting r3: callers may force the lobe count — the NATO scheme
    // chains 4-6 lobes into one long flowing band (island-blob critique).
    // When omitted the rng draw order is byte-identical to r2.
    const lobeN = lobeNIn || (2 + ((rng() * 3) | 0));
    const step = r * (0.85 + rng() * 0.5);
    let a = ang + (rng() - 0.5) * 0.2;
    let cx = x - Math.cos(a) * step * (lobeN - 1) * 0.5;
    let cy = y - Math.sin(a) * step * (lobeN - 1) * 0.5;
    for (let l = 0; l < lobeN; l++) {
      const lr = r * (0.55 + rng() * 0.55);
      const stretch = 1.5 + rng() * 0.9;           // per-lobe elongation
      const sides = 5 + ((rng() * 3) | 0);
      const cosA = Math.cos(a), sinA = Math.sin(a);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < sides; i++) {
        const t = (i / sides) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / sides);
        let rr = lr * (0.6 + rng() * 0.6);
        if (rng() < 0.16) rr *= 0.5;               // concave notch facet
        const ex = Math.cos(t) * rr * stretch, ey = Math.sin(t) * rr * 0.8;
        pts.push([cx + ex * cosA - ey * sinA, cy + ex * sinA + ey * cosA]);
      }
      // tank_models r7 ("razor-edged geometric triangles that read as vector
      // shapes rather than sprayed paint" — T-80U/T-90A skirts): the straight
      // lineTo polygon sides survive every downstream blur once a GLB atlas
      // island magnifies the canvas. Each side is subdivided with normal-
      // displaced midpoints (~2-4 px noise at reference scale, scales with the
      // patch) so boundaries wander like spray, never ruler lines.
      p.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < sides; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % sides];
        const dx = x1 - x0, dy = y1 - y0;
        const elen = Math.hypot(dx, dy) || 1;
        const nx = -dy / elen, ny = dx / elen;     // edge normal
        const amp = Math.min(elen * 0.18, lr * 0.22);
        for (const f of [0.3, 0.62]) {
          const j = (rng() - 0.5) * 2 * amp;
          p.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
        }
        p.lineTo(x1, y1);
      }
      p.closePath();
      a += (rng() - 0.5) * 0.55;                   // spine wanders slightly
      cx += Math.cos(a) * step;
      cy += Math.sin(a) * step;
    }
    return p;
  }

  // Fill a Path2D 9 times (3x3 tile offsets) so the pattern wraps seamlessly.
  function fillWrapped(ctx: MaterialCanvasContext, S: number, path: Path2D, style: string, fillRule?: CanvasFillRule): void {
    ctx.fillStyle = style;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      ctx.save(); ctx.translate(dx, dy);
      // fillRule 'evenodd' lets brand marks keep punched-out counters (the
      // Claude Code glyph's eyes) — same-winding subpaths fill solid otherwise
      if (fillRule) ctx.fill(path, fillRule); else ctx.fill(path);
      ctx.restore();
    }
  }
  function strokeWrapped(ctx: MaterialCanvasContext, S: number, path: Path2D, style: string, width: number): void {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      ctx.save(); ctx.translate(dx, dy); ctx.stroke(path); ctx.restore();
    }
  }

  // PERF (performance_budget r5): the per-pixel LCG grain pass was the single
  // largest boot cost — bootprobe self-time 2.5 s across the staged vehicle
  // bakes (16 MB getImageData + a 4.2 M-iteration clamped-add loop +
  // putImageData, per map, per vehicle). Grain is per-texel stochastic noise,
  // not a per-vehicle signature, so ONE cached 50 %-gray noise tile per
  // (size, amp) bucket composited in 'hard-light' reads identically (at
  // mid-tones hard-light adds exactly the same +-128*amp jitter; shadows and
  // highlights grain proportionally less, which reads slightly cleaner) and
  // runs ~10x faster on the GPU drawImage path.
  const _grainTiles = new Map<string, C>(); // "S:amp" -> canvas
  function grainTile(S: number, amp: number): C {
    const key = S + ':' + amp;
    let cnv = _grainTiles.get(key);
    if (cnv) return cnv;
    cnv = makeCanvas(S, S);
    const c = canvas2d(cnv);
    const img = c.createImageData(S, S);
    const d = img.data;
    let s0 = 0x9e3779b9;
    for (let i = 0; i < d.length; i += 4) {
      s0 = (s0 * 1664525 + 1013904223) >>> 0;
      const v = 128 + (((s0 >>> 16) & 255) - 128) * amp;
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
      d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    _grainTiles.set(key, cnv);
    return cnv;
  }
  function applyGrain(ctx: MaterialCanvasContext, S: number, seed: number, amp: number): void {
    // `seed` is intentionally unused now — see grainTile note above.
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'hard-light';
    ctx.drawImage(grainTile(S, amp), 0, 0);
    ctx.globalCompositeOperation = prevOp;
  }

  // ---------------------------------------------------------------------------
  // Plate feature plan — one deterministic description shared by the albedo,
  // height, and roughness painters so panel lines / welds / bolts line up
  // across all three maps. Coordinates are 0..1 of the repeat tile.
  // ---------------------------------------------------------------------------
  function genPlateFeatures(rng: Rng): PlateFeatures {
    const f: PlateFeatures = { hLines: [], vLines: [], rings: [], chips: [], streaks: [] };
    // Panel joins are sparse and broken (1-2 gaps per run) so plates don't read
    // as a uniform tile grid across big hull sides.
    const mkGaps = (): Array<[number, number]> => {
      const gaps: Array<[number, number]> = [];
      const n = 1 + ((rng() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const s = 0.12 + rng() * 0.66;
        gaps.push([s, Math.min(0.92, s + 0.08 + rng() * 0.18)]);
      }
      return gaps.sort((a, b) => a[0] - b[0]);
    };
    // r9: 2-3 joins per tile (was 3-4) — the dense line grid striped big flat
    // plates (Tiger side) into papercraft facets at closeup.
    const nH = 2 + ((rng() * 2) | 0), nV = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < nH; i++) {
      f.hLines.push({ p: (i + 0.12 + rng() * 0.76) / nH, weld: rng() < 0.42, bolts: rng() < 0.45, gaps: mkGaps() });
    }
    for (let i = 0; i < nV; i++) {
      f.vLines.push({ p: (i + 0.12 + rng() * 0.76) / nV, weld: rng() < 0.42, bolts: rng() < 0.35, gaps: mkGaps() });
    }
    // bolt rings (hatch / plate access circles)
    const nR = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < nR; i++) {
      f.rings.push({ x: 0.1 + rng() * 0.8, y: 0.1 + rng() * 0.8, r: 0.022 + rng() * 0.03, n: 8 + ((rng() * 6) | 0) });
    }
    // chips clustered near lines and edges
    // r8: 260 chips with bright glints read as white speckle noise at
    // garage distance — halved, and the glint rectangle dimmed below.
    // r10: halved again (140 -> 72) — the survivors still read as flour dust
    // on the IS-3 / Panzer III / M1A2 roof plates under the garage key.
    for (let i = 0; i < 72; i++) {
      let x = rng(), y = rng();
      if (rng() < 0.55) {                     // snap toward a random line
        if (rng() < 0.5 && f.hLines.length) { y = f.hLines[(rng() * f.hLines.length) | 0].p + (rng() - 0.5) * 0.02; }
        else if (f.vLines.length) { x = f.vLines[(rng() * f.vLines.length) | 0].p + (rng() - 0.5) * 0.02; }
      }
      f.chips.push({ x, y, r: 0.0008 + rng() * 0.0028, metal: rng() < 0.42 });
    }
    // rust weep sources — some at bolts, some free
    for (let i = 0; i < 16; i++) {
      f.streaks.push({ x: rng(), y: rng(), len: 0.02 + rng() * 0.06, w: 0.001 + rng() * 0.002 });
    }
    return f;
  }

  // Un-gapped spans of a panel line, as [start, end] fractions.
  function lineSegs(line: PlateLine): Array<[number, number]> {
    const segs: Array<[number, number]> = [];
    let cur = 0;
    for (const [g0, g1] of line.gaps || []) {
      if (g0 > cur) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < 1) segs.push([cur, 1]);
    return segs;
  }
  const inGap = (line: PlateLine, t: number): boolean => line.gaps.some(([g0, g1]) => t >= g0 && t <= g1);

  // ---------------------------------------------------------------------------
  // Albedo (2048) — camo scheme base + feature overlay + weathering.
  // ---------------------------------------------------------------------------


  function paintCamo(
    canvas: C,
    visual: MaterialVisual,
    rng: Rng,
    feats: PlateFeatures,
    seed: number,
  ): C {
    const ctx = canvas2d(canvas);
    const S = canvas.width;
    const base = hexToRgb(visual.base);
    const weather = hexToRgb(visual.weather || visual.base);
    const patches = (visual.patches || []).map(hexToRgb);

    // World-size normalization (r7): camoScale is UV repeats per meter (boxUV
    // in tankFactory), so a tank at the 0.34 default spreads one tile over ~3 m
    // and reference-size patches balloon past the hull flank height — desert /
    // summer mushed into a near-uniform tint wash on the T-34. `wk` rescales
    // patch geometry so patches cover the SAME world meters everywhere
    // (authored against the 0.5 repeats/m reference; capped at 1 so the
    // hand-tuned 0.55/0.6 tanks keep their look), and `nK` adds patches back as
    // they shrink so coverage density stays constant.
    const wk = Math.min(1, (visual.camoScale != null ? visual.camoScale : 0.34) / 0.5);
    const nK = Math.min(2.2, 1 / (wk * wk));

    ctx.fillStyle = rgb(base);
    ctx.fillRect(0, 0, S, S);

    const paintBaseVariation = (): void => {
      for (let i = 0; i < 30; i++) {
        const x = rng() * S, y = rng() * S, r = S * (0.10 + rng() * 0.22);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const t = 0.25 + rng() * 0.45;
        g.addColorStop(0, rgb(mix(base, weather, t), 0.5));
        g.addColorStop(1, rgb(base, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 90; i++) {
        const x = rng() * S, y = rng() * S, r = S * (0.015 + rng() * 0.04);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const dir = rng() < 0.5 ? 0.92 : 1.07;
        g.addColorStop(0, rgb(scale3(base, dir), 0.22));
        g.addColorStop(1, rgb(base, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    };
    paintBaseVariation();
    // tank_models r3 (critic major: T-90M factory solid renders as "one flat
    // untextured green — plastic toy response, no roughness/weathering
    // variation"): SOLID schemes lean entirely on the two passes above, which
    // vanish under a bright key. Single-color vehicles get an extra patina
    // quilt — big soft fields of sun-faded and oil-darkened paint at low
    // contrast, the multi-tone base every real monotone tank carries.
    const paintSolidBasePatina = (): void => {
      if ((visual.scheme || 'solid') !== 'solid') return;
      // Per-vehicle control for unusually clean factory finishes. Keep the
      // fleet default byte-for-byte at 1; T-72B3M uses a restrained value so
      // the warm garage key cannot turn the large procedural patina fields
      // into disconnected mint/light-olive armor islands.
      const solidWeatheringIntensity = Math.max(0,
        Math.min(1, visual.solidWeatheringIntensity ?? 1));
      for (let i = 0; i < 14; i++) {
        const x = rng() * S, y = rng() * S, r = S * (0.09 + rng() * 0.20);
        const warm = rng() < 0.5;
        // tank_models r7 ("pastel-flat" WWII solids): sun-fade blobs pulled
        // down — the bright [150,142,108] dust mix at 1.18x base was a big
        // slice of the minty lift on 4BO/olive hulls under the warm key.
        const tone = warm
          ? mix(scale3(base, 1.10), [126, 120, 94], 0.16)      // sun-faded, dust-warmed
          : scale3(mix(base, weather, 0.5), 0.84);             // oil/soot-deepened
        const p = blobPath2D(rng, x, y, r, 8, 0.5);
        ctx.filter = `blur(${(S * 0.004).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(tone, 0.15 * solidWeatheringIntensity));
        ctx.filter = 'none';
      }
    };
    paintSolidBasePatina();

    const scheme = visual.scheme || 'solid';
    // camo_spotting r2 (close-orbit edge critique): the r8 wide feather made
    // sprayed patches read hand-painted at ~5 m. Real spray has a HARD core
    // edge (1-2 px feather) with a separate faint overspray halo plus droplet
    // specks riding the border — shared by the 'stripes' and 'nato' schemes.
    // camo_spotting r3: `specks` optional — the 2px droplet dash blew up into
    // confetti-scale chips on GLB skirt UV islands (NATO topology critique);
    // the NATO/masked schemes now skip it while WW2 sprayed schemes keep it.
    const sprayEdge = (p: Path2D, col: Rgb, coreA: number, specks = true): void => {
      ctx.filter = `blur(${(S * 0.0028).toFixed(1)}px)`;
      strokeWrapped(ctx, S, p, rgb(col, 0.18), S * 0.007);       // overspray halo
      ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
      fillWrapped(ctx, S, p, rgb(col, coreA));                   // hard core, ~1.5px feather
      ctx.filter = 'none';
      if (!specks) return;
      ctx.setLineDash([2, 9 + rng() * 8]);                       // droplet specks on the border
      strokeWrapped(ctx, S, p, rgb(col, 0.5), 2.2);
      ctx.setLineDash([]);
    };
    const paintClassicSchemes = (): void => {
      const paintDrawnScheme = (): void => {
        if (scheme === 'drawn' && patches.length) {
      // Device-local vector tile authored in the Garage. The drawing is baked
      // once with the rest of the material, so custom paint adds no draw calls,
      // runtime canvases, or per-frame work.
      const repeatX = Math.max(1, Math.min(8, visual.drawRepeatX || 1));
      const repeatY = Math.max(1, Math.min(8, visual.drawRepeatY || 1));
      const cellW = S / repeatX;
      const cellH = S / repeatY;
      const angle = (visual.drawRotation || 0) * Math.PI / 180;
      const strokes = visual.drawStrokes || [];
      for (let gy = -1; gy <= repeatY; gy++) {
        for (let gx = -1; gx <= repeatX; gx++) {
          ctx.save();
          ctx.translate((gx + 0.5) * cellW, (gy + 0.5) * cellH);
          ctx.rotate(angle);
          if (visual.drawMirror && ((gx + gy) & 1)) ctx.scale(-1, 1);
          ctx.translate(-cellW / 2, -cellH / 2);
          paintCustomCamoStrokes(ctx, strokes, {
            width: cellW,
            height: cellH,
            colorA: rgb(patches[0], 0.97),
            colorB: rgb(patches[1] || patches[0], 0.97),
            eraseColor: rgb(base, 1),
          });
          ctx.restore();
        }
      }
        }
      };
      const paintStripesScheme = (): void => {
        if (scheme === 'stripes' && patches.length) {
      // tank_models r5 REWRITE ("2-tone tan/brown leopard spots instead of the
      // roster Dunkelgelb + olive-green + red-brown soft-edge stripes"): the
      // 1943 factory scheme is BROAD sprayed BANDS — 20-40 cm wide sweeping
      // strokes of Olivgruen AND Rotbraun over Dunkelgelb, soft sprayed edges,
      // one dominant diagonal per vehicle, branching once or twice. No discrete
      // patch stamps at all: the small angular patches + thin streaks are what
      // read as leopard spots at closeup.
      const bandAng = visual.bandAngle != null
        ? visual.bandAngle + (rng() - 0.5) * 0.24          // pinned (naval waves)
        : 0.85 + rng() * 0.55;                             // one direction per tank
      const band = (col: Rgb, w: number, len: number, alpha: number) => {
        const x0 = rng() * S, y0 = rng() * S;
        const ang = bandAng + (rng() - 0.5) * 0.30;
        const bend = (rng() - 0.5) * w * 2.2;
        const mx = x0 + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend;
        const my = y0 + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend;
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.quadraticCurveTo(mx, my, x1, y1);
        // soft sprayed edge: wide low-alpha overspray flank + blurred core
        ctx.filter = `blur(${(S * 0.006).toFixed(1)}px)`;
        strokeWrapped(ctx, S, path, rgb(col, 0.20), w * 1.45);
        ctx.filter = `blur(${(S * 0.0032).toFixed(1)}px)`;
        strokeWrapped(ctx, S, path, rgb(col, alpha), w);
        ctx.filter = 'none';
        return { x0, y0, x1, y1, ang };
      };
      // main broad bands: alternate the two patch tones so BOTH read (the old
      // painter's green mixed 24% toward dunkelgelb and vanished — 2-tone read)
      // camo r8: visual.bandAngle (palette knob) pins the band direction — the
      // 'naval' pattern runs its wave bands HORIZONTAL. rng draw order is
      // identical in both arms, so authored schemes stay byte-stable.
      const nB = Math.max(4, Math.round(5 * nK));
      for (let i = 0; i < nB; i++) {
        const col = mix(patches[i % patches.length], base, 0.10);
        const w = S * wk * (0.085 + rng() * 0.075);        // ~0.15-0.27 m wide
        const len = S * wk * (0.65 + rng() * 0.5);
        const b = band(col, w, len, 0.80);
        // occasional branch fork off the main band
        if (rng() < 0.6) {
          const col2 = mix(patches[(i + 1) % patches.length], base, 0.10);
          const bl = len * (0.35 + rng() * 0.25);
          const ba = b.ang + (rng() < 0.5 ? 0.7 : -0.7) + (rng() - 0.5) * 0.3;
          const px2 = b.x0 + Math.cos(b.ang) * len * (0.3 + rng() * 0.4);
          const py2 = b.y0 + Math.sin(b.ang) * len * (0.3 + rng() * 0.4);
          const path = new Path2D();
          path.moveTo(px2, py2);
          path.lineTo(px2 + Math.cos(ba) * bl, py2 + Math.sin(ba) * bl);
          ctx.filter = `blur(${(S * 0.005).toFixed(1)}px)`;
          strokeWrapped(ctx, S, path, rgb(col2, 0.62), S * wk * (0.06 + rng() * 0.05));
          ctx.filter = 'none';
        }
      }
      // a few narrower connector strokes keep the field from reading as bars
      for (let i = 0; i < Math.round(4 * nK); i++) {
        const col = mix(patches[i % patches.length], base, 0.14);
        band(col, S * wk * (0.038 + rng() * 0.03), S * wk * (0.35 + rng() * 0.3), 0.66);
      }
        }
      };
      const paintAmbushScheme = (): void => {
        if (scheme === 'ambush' && patches.length) {
      // Hinterhalt-Tarnung (the Panther 'ambush' factory scheme): angular
      // Olivgruen/Rotbraun patches elongated along one spray direction over
      // Dunkelgelb, with LIGHT Dunkelgelb dots INSIDE the dark patches and dark
      // dots on the light base between them — the historical dappled-canopy
      // language. (r7: uniform rounded blobs + random confetti dots everywhere
      // read as orange/green cow spots.)
      const dirA = rng() * Math.PI;
      const drawn: Array<{ p: Path2D; x: number; y: number; r: number }> = [];
      const nP = Math.round(14 * nK);
      const paintAmbushPatches = (): void => {
        for (let i = 0; i < nP; i++) {
          const col = mix(patches[i % patches.length], base, 0.06);
          const r = S * wk * (i < nP * 0.35 ? 0.080 + rng() * 0.050 : 0.042 + rng() * 0.038);
          const x = rng() * S, y = rng() * S;
          const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.55);
          ctx.filter = `blur(${Math.max(1.5, S * 0.0012).toFixed(1)}px)`;
          strokeWrapped(ctx, S, p, rgb(mix(col, base, 0.35), 0.40), S * 0.005);
          fillWrapped(ctx, S, p, rgb(col, 0.90));
          ctx.filter = 'none';
          drawn.push({ p, x, y, r });
        }
      };
      const dotWrap = (x: number, y: number, r2: number): void => {
        for (const ox of [-S, 0, S]) {
          for (const oy of [-S, 0, S]) {
            ctx.beginPath(); ctx.arc(x + ox, y + oy, r2, 0, Math.PI * 2); ctx.fill();
          }
        }
      };
      const paintLightAmbushDots = (): void => {
        ctx.fillStyle = rgb(mix(base, [235, 224, 178], 0.18), 0.92);
        for (const d of drawn) {
          const n = 6 + ((rng() * 6) | 0);
          let placed = 0, guard = 0;
          while (placed < n && guard++ < n * 8) {
            const px2 = d.x + (rng() - 0.5) * d.r * 3.6;
            const py2 = d.y + (rng() - 0.5) * d.r * 2.6;
            if (!ctx.isPointInPath(d.p, px2, py2)) continue;
            dotWrap(px2, py2, S * (0.0040 + rng() * 0.0034));
            placed++;
          }
        }
      };
      // dark dots on the base BETWEEN patches (never on the patches — dots on
      // everything is what mushed the scheme into confetti)
      const paintDarkAmbushDots = (): void => {
        for (let i = 0; i < 110; i++) {
          const x = rng() * S, y = rng() * S;
          let inside = false;
          for (const d of drawn) {
            if (ctx.isPointInPath(d.p, x, y)) { inside = true; break; }
          }
          if (inside) continue;
          ctx.fillStyle = rgb(patches[(rng() * patches.length) | 0], 0.88);
          dotWrap(x, y, S * (0.0038 + rng() * 0.0032));
        }
      };
      paintAmbushPatches();
      paintLightAmbushDots();
      paintDarkAmbushDots();
        }
      };
      const paintNatoScheme = (): void => {
        if (scheme === 'nato' && patches.length) {
      // NATO 3-colour (Bundeswehr Gefechtstarnung / MERDC family): angular
      // ELONGATED patches swept along one per-vehicle direction at 2-3 scales —
      // brown field patches first, then sparse black riding the brown
      // boundaries the way the real scheme shadows them. (r7: same-size rounded
      // soft blobs read leopard-print at garage distance.)
      // r10 (critic: "sharp polygonal shards / confetti-sized black chips read
      // as vinyl stickers"): boundaries are FEATHERED like the stripes/ambush
      // schemes (sprayed paint has soft flanks), patch count drops ~30% with
      // larger cores so blobs flow across panel seams, and the minimum black
      // patch is ~2x bigger so no black lands as a confetti chip.
      // tank_models r2 (critic minor: factory/summer "soft-edged ... blobs read
      // airsoft-arcade"): patch scale trimmed ~25% and core alpha raised so the
      // sprayed boundary reads hard at garage distance (NATO/CARC masks are
      // crisp; only a narrow overspray flank stays soft).
      // camo_spotting r3 (critic: "patch topology reads island-blob ... real
      // NATO 3-color flows in connected anchor-point bands"): brown is now FEW
      // LONG bands — 4-6 chained lobes each, spanning a third to half the tile
      // — and ~40% of bands ANCHOR their start on a previous band's spine so
      // the field connects into the flowing anchor-point network of the real
      // scheme instead of scattered same-size islands. Black rides the brown
      // boundaries as elongated shadow bars (never free confetti chips), and
      // the droplet-speck dash is off for both (confetti on skirt UV islands).
      // camo_spotting r6: `pk`/`blackK` (visual.patchK / visual.blackK, both
      // default 1 — rng draw order untouched at 1) let the GLB atlas path
      // rescale the scheme where its UV world density differs from the boxUV
      // reference: the m1a2's summer patches grow ~14% and the black shadow
      // bars gain weight ("two greens read monotone olive at mid distance,
      // black underweighted" critique) while the Tiger's boxUV summer — which
      // already reads — stays byte-identical.
      const pk = visual.patchK || 1;
      const black = patches[0], brown = patches[1] || patches[0];
      const dirA = rng() * Math.PI;
      const centers: Array<[number, number, number]> = [];
      const nBrown = Math.max(4, Math.round(6 * nK / pk));
      const paintBrownBands = (): void => {
        for (let i = 0; i < nBrown; i++) {
          const r = S * wk * pk * (i < nBrown * 0.4 ? 0.082 + rng() * 0.046 : 0.052 + rng() * 0.034);
          let x = rng() * S, y = rng() * S;
          if (i > 0 && rng() < 0.4) {
            const c2 = centers[(rng() * centers.length) | 0];
            x = c2[0] + (rng() - 0.5) * c2[2] * 2.4;
            y = c2[1] + (rng() - 0.5) * c2[2] * 1.8;
          }
          const lobes = 4 + ((rng() * 3) | 0);
          const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.55, lobes);
          sprayEdge(p, brown, 0.97, false);
          centers.push([x, y, r]);
        }
      };
      const nBlack = Math.max(3, Math.round(4 * nK * (visual.blackK || 1) / pk));
      const paintBlackBands = (): void => {
        for (let i = 0; i < nBlack; i++) {
          const r = S * wk * pk * (i < nBlack * 0.4 ? 0.050 + rng() * 0.026 : 0.040 + rng() * 0.020);
          let x = rng() * S, y = rng() * S;
          if (centers.length && rng() < 0.75) {
            const c2 = centers[(rng() * centers.length) | 0];
            const a2 = rng() * Math.PI * 2;
            x = c2[0] + Math.cos(a2) * c2[2] * 1.15;
            y = c2[1] + Math.sin(a2) * c2[2] * 0.85;
          }
          const lobes = 3 + ((rng() * 2) | 0);
          const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.7, lobes);
          sprayEdge(p, black, 0.95, false);
        }
      };
      paintBrownBands();
      paintBlackBands();
        }
      };
      const paintDesertScheme = (): void => {
        if (scheme === 'desert' && patches.length) {
      // Desert: hard-edged multi-scale 3-tone geometry — broad low-contrast
      // diagonal wind bands under angular polygon patches at three scales plus
      // thin dark streaks. Replaces the r1 same-size-ellipse "cheetah print".
      // camo_spotting r6: `pk` (visual.patchK, default 1 — rng draw order is
      // untouched at 1) rescales the patch geometry for consumers whose UV
      // world density differs from the boxUV reference: the GLB atlas path
      // shrinks the big modern hulls' blobs ~30% (m1a2 "dazzle/giraffe patches
      // at large scale" critique) while counts scale 1/pk so overall coverage
      // eases down with the size rather than ballooning.
      const pk = visual.patchK || 1;
      const dark = patches[0], mid2 = patches[1] || patches[0];
      const pale = patches[2] || mix(base, [255, 250, 235], 0.35);
      const paintDesertBands = (): void => {
        for (let i = 0; i < 5; i++) {
          const y0 = rng() * S, slope = (rng() - 0.5) * 0.6;
          const w = S * wk * pk * (0.10 + rng() * 0.10);
          const path = new Path2D();
          path.moveTo(-S * 0.1, y0);
          path.quadraticCurveTo(S * 0.5, y0 + slope * S * 0.5 + (rng() - 0.5) * S * 0.09,
            S * 1.1, y0 + slope * S);
          strokeWrapped(ctx, S, path, rgb(mix(rng() < 0.5 ? mid2 : pale, base, 0.45), 0.30), w);
        }
      };
      paintDesertBands();
      // Large patches near-opaque at three scales. History: r6 pushed contrast
      // here (darkHC 0.74x, paleHC white lift) so the geometry survived mipping
      // at garage distance — but stacked on the widened r9 palette that became
      // the m1a2 "near-white cream blobs vs mid-brown dazzle" (camo_spotting r6
      // critique). The authored palette now carries the whole ladder: darkHC/
      // paleHC are the palette stops themselves, and the low-contrast read is
      // the point (real Sinai-family schemes are subtle).
      const darkHC = dark;
      const paleHC = pale;
      // patch geometry rides wk/nK so the 3-tone shapes stay hull-scale on
      // every tank (r7: on the T-34 the tile spans ~3 m and single patches
      // swallowed the whole flank -> flat tan wash)
      // camo r2 edge treatment: the large/mid desert patches are SPRAYED, not
      // masked — polyPath2D edgeNoise wanders their facets ~2-4 px like the
      // camoPatchPath2D boundaries, so magnified GLB atlas islands stop
      // rendering them as razor-cut vector shards (tank_models r7 lineage).
      const nBig = Math.round(4 * nK / pk);
      const paintLargeDesertPatches = (): void => {
        for (let i = 0; i < nBig; i++) {
          const r = S * wk * pk * (0.16 + rng() * 0.10);
          const x = rng() * S, y = rng() * S;
          const col = i % 2 ? mid2 : darkHC;
          fillWrapped(ctx, S, polyPath2D(rng, x, y, r * 1.04, 7, 0.55, 0.8), rgb(mix(col, base, 0.5), 0.5));
          fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 7, 0.55, 0.8), rgb(col, 0.96));
        }
      };
      paintLargeDesertPatches();
      // r8 confetti fix: the pale sand tone used to arrive as ~27 identically
      // sized chips at even density (1/3 of the mid shards + half the small
      // flecks) — leopard-print at garage distance on Tiger/Abrams. The pale
      // highlight is now FEW large elongated bands swept along one per-vehicle
      // diagonal (sprayed desert geometry), and all small flecking clusters
      // around those bands' edges with a 3x+ size spread (overspray language)
      // instead of raining uniformly across the hull.
      const dirD = rng() * Math.PI;
      const paleBands: Array<[number, number, number]> = [];
      // r9: band count 3 -> 2.5 x nK and radius trimmed — pale coverage down
      // ~25% so the highlight reads as sprayed accents, not dazzle chips
      const paintPaleDesertBands = (): void => {
        for (let i = 0; i < Math.max(2, Math.round(2.5 * nK / pk)); i++) {
          const r = S * wk * pk * (0.085 + rng() * 0.07);
          const x = rng() * S, y = rng() * S;
          const p = camoPatchPath2D(rng, x, y, r, dirD + (rng() - 0.5) * 0.4);
          strokeWrapped(ctx, S, p, rgb(mix(paleHC, base, 0.45), 0.4), S * 0.006);
          fillWrapped(ctx, S, p, rgb(paleHC, 0.93));
          paleBands.push([x, y, r]);
        }
      };
      paintPaleDesertBands();
      const paintDesertShards = (): void => {
        for (let i = 0; i < Math.round(6 * nK / pk); i++) {
          const r = S * wk * pk * (0.045 + rng() * 0.075);
          const col = rng() < 0.5 ? darkHC : mid2;
          fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 5, 0.7, 0.8), rgb(col, 0.94));
        }
      };
      paintDesertShards();
      const paintDesertFlecks = (): void => {
        for (const [bx, by, br] of paleBands) {
          const n = 4 + ((rng() * 5) | 0);
          for (let i = 0; i < n; i++) {
            const a3 = rng() * Math.PI * 2;
            const d3 = br * (0.9 + rng() * 1.5);
            const x = bx + Math.cos(a3) * d3, y = by + Math.sin(a3) * d3 * 0.7;
            const r = S * wk * pk * (0.010 + rng() * rng() * 0.040);
            fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 4, 0.8, 0.6),
              rgb(rng() < 0.45 ? darkHC : paleHC, 0.85));
          }
        }
      };
      paintDesertFlecks();
      const paintDesertStreaks = (): void => {
        for (let i = 0; i < Math.round(14 * nK / pk); i++) {
          const x0 = rng() * S, y0 = rng() * S, len = S * wk * pk * (0.05 + rng() * 0.1);
          const a2 = rng() * Math.PI;
          const path = new Path2D();
          path.moveTo(x0, y0);
          path.lineTo(x0 + Math.cos(a2) * len, y0 + Math.sin(a2) * len * 0.5);
          strokeWrapped(ctx, S, path, rgb(dark, 0.6), 1.5 + rng() * 3);
        }
      };
      paintDesertStreaks();
        }
      };
      paintDrawnScheme();
      paintStripesScheme();
      paintAmbushScheme();
      paintNatoScheme();
      paintDesertScheme();
    };
    paintClassicSchemes();

    const paintFieldSchemes = (): void => {
      const paintWinterScheme = (): void => {
        if (scheme === 'winter') {
      // ===================== CAMO PATTERN SECTION =====================
      // Winter wash: streaky hand-brushed whitewash over the factory paint.
      // patches[0] carries the underlying factory color that shows through
      // worn edges; broad translucent vertical strokes read as brush work.
      const under: Rgb = patches.length ? patches[0] : [70, 80, 55];
      // r8 rework (winter blowout critique): the wash is ~70% cover over the
      // base coat — brighter brushed streaks sit BETWEEN visible grey-green
      // gaps, worn edges show real paint, and the shadow washes went neutral
      // grey (the old blue-tinted radials read as stray pale-blue patches).
      // r10 (critic: winter M1A2 still rendered as blown-out unlit white clay):
      // whitewash albedo is CLAMPED to the ~0.60-0.65 matte-paint band — the
      // palette base dropped a step (see patternVisual 'winter'), the bright
      // brushed strokes are dimmer, worn-through base paint doubles, and a
      // dust-ochre grime pass keyed to the under color masses toward the lower
      // plates so the wash keeps form under the warm garage key.
      // r3: stroke count 74 -> 92 — pairs with the show-through cut below so
      // whitewash coverage rises toward the real ~80% wash (the luma ceiling
      // at the end of this scheme still caps the brightest texels).
      // camo_spotting r5: stroke tones cooled with the palette — the old
      // (214,217,207)/(226,228,219) brushwork carried the same warm bias the
      // base did and fed the cream/tan read under the garage key.
      for (let i = 0; i < 92; i++) {
        const x0 = rng() * S, y0 = rng() * S;
        const len = S * (0.08 + rng() * 0.2);
        const w = S * (0.012 + rng() * 0.03);
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.quadraticCurveTo(x0 + (rng() - 0.5) * w * 3, y0 + len * 0.5, x0 + (rng() - 0.5) * w * 4, y0 + len);
        strokeWrapped(ctx, S, path, 'rgba(207,214,217,0.16)', w * 1.5);
        strokeWrapped(ctx, S, path, 'rgba(219,226,229,0.20)', w);
      }
      // worn-through patches revealing the base vehicle paint (heavier at r8 —
      // the wash needs visible green bones to avoid the white-mass read).
      // camo_spotting r3 (critic: "M1A2 winter retains ~40% green blotch share
      // on upward-facing deck surfaces — roof reads green-spotted rather than
      // whitewashed"): show-through cut from 52 large strong blobs to 30
      // smaller, more translucent ones (~15-20% coverage); the green bones now
      // lean on the streaking passes below, which read as brushed wear rather
      // than spotting. Coverage is texture-global (boxUV has no up-facing
      // knowledge), so decks and flanks whiten together.
      for (let i = 0; i < 30; i++) {
        const r = S * (0.010 + rng() * 0.032);
        const p = blobPath2D(rng, rng() * S, rng() * S, r);
        fillWrapped(ctx, S, p, rgb(under, 0.20 + rng() * 0.28));
      }
      // grey streaking down the plates (rain-washed whitewash) — r5: cooled
      for (let i = 0; i < 70; i++) {
        const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.14);
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.lineTo(x0 + (rng() - 0.5) * 6, y0 + len);
        strokeWrapped(ctx, S, path, `rgba(111,119,123,${0.10 + rng() * 0.12})`, 1.5 + rng() * 4);
      }
      // dust-ochre grime — camo_spotting r2: the mix is now dominated by a
      // FIXED ochre so the pass reads on every hull. Keyed 50% to `under`, a
      // green factory coat (T-34) produced greenish-dark grime that vanished
      // at 0.10 alpha while the Tiger's Dunkelgelb flared warm — same pattern
      // id, one tank grimy, one plastic-clean (r1 winter critique).
      // camo_spotting r5 (winter-reads-tan MAJOR): the ochre [118,98,62] at
      // 0.14-0.27 alpha x30 blobs was the single biggest warm contributor —
      // grime drops to a muted cold-brown, thinner and sparser; the missing
      // wear mass moves to the cold-grey metal streaking pass below so wear
      // reads as whitewash scrubbed off steel, not tan paint.
      const grime = mix(under, [106, 96, 74], 0.72);
      for (let i = 0; i < 20; i++) {
        const x = rng() * S, y = rng() * S, r = S * (0.03 + rng() * 0.08);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgb(grime, 0.09 + rng() * 0.09));
        g.addColorStop(1, rgb(grime, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // worn-bleed streaking (r2, all hulls): grime-grey runs dragged down the
      // plates — the Tiger carried this read via its warm feature weeps while
      // green-based hulls stayed toy-clean; now it is part of the scheme.
      for (let i = 0; i < 40; i++) {
        const x0 = rng() * S, y0 = rng() * S, len = S * (0.04 + rng() * 0.12);
        const tone = rng() < 0.4 ? grime : mix(under, [98, 105, 108], 0.55);
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.lineTo(x0 + (rng() - 0.5) * 5, y0 + len);
        strokeWrapped(ctx, S, path, rgb(tone, 0.10 + rng() * 0.14), 2 + rng() * 5);
      }
      // cold-grey metal wear (camo_spotting r5): whitewash is a chalk layer
      // over dark STEEL — scrub streaks and edge rubs read blue-grey, never
      // ochre. Dragged steel-grey runs + short cold dashes give the wash the
      // worn-over-metal read the critic asked for.
      const paintColdMetalWear = (): void => {
        for (let i = 0; i < 30; i++) {
          const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.13);
          const path = new Path2D();
          path.moveTo(x0, y0);
          path.lineTo(x0 + (rng() - 0.5) * 5, y0 + len);
          strokeWrapped(ctx, S, path, `rgba(88,96,102,${0.09 + rng() * 0.11})`, 1.5 + rng() * 3.5);
        }
        for (let i = 0; i < 26; i++) {
          const x0 = rng() * S, y0 = rng() * S, len = S * (0.015 + rng() * 0.035);
          const a2 = rng() * Math.PI;
          const path = new Path2D();
          path.moveTo(x0, y0);
          path.lineTo(x0 + Math.cos(a2) * len, y0 + Math.sin(a2) * len * 0.4);
          strokeWrapped(ctx, S, path, `rgba(96,104,110,${0.12 + rng() * 0.12})`, 1.2 + rng() * 2.4);
        }
      };
      paintColdMetalWear();
      // neutral shadow washes so the wash never reads as flat white (r5: cooled)
      for (let i = 0; i < 18; i++) {
        const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.12);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(99,106,110,0.13)');
        g.addColorStop(1, 'rgba(99,106,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // r2 unification luma ceiling (same treatment as 'fleck'): the tonal /
      // mottle lifts pushed bright texels ~7% over the authored whitewash band
      // ('#99a1a2' since the r5 cooling), which the warm garage key then blew
      // into cream — no texel may exceed the authored base luma +4%.
      capCanvasLuma(ctx, S, luma(base) * 1.04);
        }
      };
      const paintFleckScheme = (): void => {
        if (scheme === 'fleck' && patches.length) {
      // Flecktarn (camo_spotting r2 legibility rework): the r9 specks (6-22 px,
      // ~12% total coverage) were pedestal-illegible on the Tiger — they read
      // as dirt/mold speckle over a light khaki field, not a scheme, while the
      // Russian digital on the T-90M resolved as a proper 3-tone lattice.
      // Vehicle Flecktarn is a DENSE interlocking dapple field: the three patch
      // tones now carry ~45-55% of the surface as ragged multi-speck clusters
      // (~4-5 tone regions per square meter, dapples ~7-20 cm, so 2-3 distinct
      // clusters read per hull panel at 12 m). Geometry rides wk exactly like
      // the digital scheme's cell math so dapples hold the same world size on
      // every tank, and the composited field is luma-clamped to the authored
      // base/weather tones (the winter r10 treatment) so the tonal and mottle
      // layers can never lift the field lighter than the authored '#57604a'.
      for (let pass = 0; pass < patches.length; pass++) {
        const col = patches[pass];
        const nCl = Math.round(13 * nK);
        for (let cl = 0; cl < nCl; cl++) {
          const cx = rng() * S, cy = rng() * S;
          const cr = S * wk * (0.05 + rng() * 0.055);   // tone-region core
          const n = 5 + ((rng() * 5) | 0);
          for (let i = 0; i < n; i++) {
            const a = rng() * Math.PI * 2, d = rng() * cr;
            const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
            const r = S * wk * (0.018 + rng() * 0.032); // ragged dapple
            // camo r2 edge treatment: dapples are sprayed dabs — edge noise
            // keeps them ragged at closeup instead of vector-crisp (the lone
            // fine-grain flecks below stay plain: at 5-11 px the noise is
            // sub-texel and only costs rng draws)
            fillWrapped(ctx, S, polyPath2D(rng, x, y, r, 6, 0.75, 0.7), rgb(col, 0.92));
          }
        }
        // fine-grain octave: sparse lone flecks between the tone regions
        for (let i = 0; i < Math.round(70 * nK); i++) {
          const r = S * wk * (0.005 + rng() * 0.011);
          fillWrapped(ctx, S, polyPath2D(rng, rng() * S, rng() * S, r, 5, 0.8), rgb(col, 0.85));
        }
      }
      // composited-base luma ceiling: no texel may end up brighter than the
      // authored weather tone (+4%) — the r9 field drifted far lighter than
      // the authored base under the tonal/mottle lifts.
      capCanvasLuma(ctx, S, Math.max(luma(base), luma(weather)) * 1.04);
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintDigitalScheme = (): void => {
        if (scheme === 'digital' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // TWO-SCALE digital (camo_spotting r5). The old painter was a single
      // 16x16 lattice of small rect clusters — at garage range it covered the
      // hull as uniform micro pixel noise ("wallpapered TV static", critic
      // r5): no macro structure, so it read as a printed fabric, not a
      // vehicle scheme. Real digital camo is LARGE organic patches whose
      // EDGES resolve into pixel steps. Rebuilt exactly that way:
      //   1. MACRO: 3-4 elongated multi-lobe patches per tone (hull-scale,
      //      the same organic language the NATO painter uses) are laid out as
      //      Path2D shapes...
      //   2. ...then RASTERIZED onto the pixel grid: each grid cell samples
      //      the path with a jittered point, so patch interiors fill as solid
      //      color masses while the boundary staircases into ragged 1-cell
      //      steps (the jitter is the quantization dither).
      //   3. FINE octave: a sparse sprinkle of lone pixels between patches
      //      keeps the field from reading as clean vector blobs.
      // Pixel pitch is ~2x the old cell (48/64 vs 96/128 cells per tile) so
      // the steps survive mipping at pedestal distance. Cell math: one repeat
      // tile spans 1/camoScale meters; cells scale with wk to hold world size
      // across tanks, and digitalCellK (palette knob) still scales the pitch.
      const cellK = Math.max(1, visual.digitalCellK || 1);
      const cells = Math.max(Math.round(48 / cellK),
        Math.round(64 / (Math.max(wk, 0.5) * cellK)));
      const cell = S / cells;
      // Macro-patch builder: the same elongated multi-lobe language as
      // camoPatchPath2D, but with the vertices tracked so the rasterizer gets
      // an EXACT bbox (the shared helper's lobes can wander ~5r from the
      // anchor — a guessed box either clips lobes or scans half the tile).
      const mkPatch = (): PatchRaster => {
        const lobeN = 2 + ((rng() * 3) | 0);
        const r0 = S * wk * (0.10 + rng() * 0.09);
        const step = r0 * (0.85 + rng() * 0.5);
        let a = rng() * Math.PI;
        let cx2 = rng() * S - Math.cos(a) * step * (lobeN - 1) * 0.5;
        let cy2 = rng() * S - Math.sin(a) * step * (lobeN - 1) * 0.5;
        const path = new Path2D();
        let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
        for (let l = 0; l < lobeN; l++) {
          const lr = r0 * (0.55 + rng() * 0.55);
          const stretch = 1.5 + rng() * 0.9;
          const sides = 5 + ((rng() * 3) | 0);
          const cosA = Math.cos(a), sinA = Math.sin(a);
          for (let i = 0; i < sides; i++) {
            const t = (i / sides) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / sides);
            let rr = lr * (0.6 + rng() * 0.6);
            if (rng() < 0.16) rr *= 0.5;               // concave notch facet
            const ex = Math.cos(t) * rr * stretch, ey = Math.sin(t) * rr * 0.8;
            const px = cx2 + ex * cosA - ey * sinA;
            const py = cy2 + ex * sinA + ey * cosA;
            if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
            mnx = Math.min(mnx, px);
            mxx = Math.max(mxx, px);
            mny = Math.min(mny, py);
            mxy = Math.max(mxy, py);
          }
          path.closePath();
          a += (rng() - 0.5) * 0.55;                   // spine wanders slightly
          cx2 += Math.cos(a) * step;
          cy2 += Math.sin(a) * step;
        }
        return { path, mnx, mny, mxx, mxy };
      };
      const paintDigitalMacroPatches = (): void => {
        for (let pi = 0; pi < patches.length; pi++) {
          const col = patches[pi];
          ctx.fillStyle = rgb(col, 0.94);
          const nP = 3 + (rng() < 0.5 ? 1 : 0);
          for (let p = 0; p < nP; p++) {
            const pt = mkPatch();
            const cx0 = Math.floor(pt.mnx / cell), cx1 = Math.ceil(pt.mxx / cell);
            const cy0 = Math.floor(pt.mny / cell), cy1 = Math.ceil(pt.mxy / cell);
            for (let gy = cy0; gy <= cy1; gy++) {
              for (let gx = cx0; gx <= cx1; gx++) {
                const sx2 = (gx + 0.5) * cell + (rng() - 0.5) * cell * 0.9;
                const sy2 = (gy + 0.5) * cell + (rng() - 0.5) * cell * 0.9;
                if (!ctx.isPointInPath(pt.path, sx2, sy2)) continue;
                const qx = (((gx % cells) + cells) % cells) * cell;
                const qy = (((gy % cells) + cells) % cells) * cell;
                ctx.fillRect(qx, qy, cell + 0.5, cell + 0.5);
              }
            }
          }
        }
      };
      paintDigitalMacroPatches();
      // fine-grain octave: sparse cell noise between the macro patches.
      // camo r2 (starter pattern-quality): ~half the budget now lands as short
      // 2-4 cell RUNS with an occasional perpendicular kink (the L/I dither
      // strokes real pixel schemes quantize into) instead of pure lone pixels —
      // uniform singles read as sensor noise at closeup while runs read as
      // deliberate quantization. Total cell budget unchanged (~170/cellK).
      const paintDigitalRun = (remaining: number): number => {
        const col = patches[(rng() * patches.length) | 0];
        ctx.fillStyle = rgb(col, 0.85);
        let gx = (rng() * cells) | 0, gy = (rng() * cells) | 0;
        const run = rng() < 0.5 ? 1 : 2 + ((rng() * 3) | 0);
        const horiz = rng() < 0.5;
        let consumed = 0;
        for (let k2 = 0; k2 < run && consumed < remaining; k2++, consumed++) {
          const qx = (((gx % cells) + cells) % cells) * cell;
          const qy = (((gy % cells) + cells) % cells) * cell;
          ctx.fillRect(qx, qy, cell + 0.5, cell + 0.5);
          if (horiz) gx++; else gy++;
          if (run > 1 && rng() < 0.3) {
            if (horiz) gy += rng() < 0.5 ? 1 : -1;
            else gx += rng() < 0.5 ? 1 : -1;
          }
        }
        return consumed;
      };
      const paintDigitalFineGrain = (): void => {
        let budget = Math.round(170 / cellK);
        while (budget > 0) {
          budget -= paintDigitalRun(budget);
        }
      };
      paintDigitalFineGrain();
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintMerdcScheme = (): void => {
        if (scheme === 'merdc' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // MERDC (US 4-color, camo r8): TWO DOMINANT tones split the hull in
      // large flowing multi-lobe fields (base carries one, patches[0] the
      // other at ~40-45%), while the two ACCENT tones — sand + black, ~5%
      // each — ride the dominant-field boundaries as narrow elongated bars.
      // Same camoPatchPath2D band language as 'nato' (it IS the same family)
      // but with a LIGHT second dominant instead of dark chips, so the two
      // schemes never read as one another at range: nato = dark chips on
      // green, MERDC = interlocking light/dark green fields.
      const pk = visual.patchK || 1;
      const dom = patches[0];
      const sand = patches[1] || mix(base, [220, 205, 160], 0.5);
      const black = patches[2] || [43, 43, 40];
      const dirA = rng() * Math.PI;
      const fields: Array<[number, number, number]> = [];
      const nF = Math.max(3, Math.round(5 * nK / pk));
      const paintMerdcFields = (): void => {
        for (let i = 0; i < nF; i++) {
          const r = S * wk * pk * (i < nF * 0.4 ? 0.105 + rng() * 0.055 : 0.065 + rng() * 0.04);
          let x = rng() * S, y = rng() * S;
          if (i > 0 && rng() < 0.45) {
            const c2 = fields[(rng() * fields.length) | 0];
            x = c2[0] + (rng() - 0.5) * c2[2] * 2.6;
            y = c2[1] + (rng() - 0.5) * c2[2] * 2.0;
          }
          const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.5, 4 + ((rng() * 3) | 0));
          sprayEdge(p, dom, 0.95, false);
          fields.push([x, y, r]);
        }
      };
      paintMerdcFields();
      // sand: few narrow winding bands bridging the field boundaries
      const paintMerdcSand = (): void => {
        for (let i = 0; i < Math.max(2, Math.round(3 * nK / pk)); i++) {
          const r = S * wk * pk * (0.034 + rng() * 0.022);
          let x = rng() * S, y = rng() * S;
          if (fields.length && rng() < 0.7) {
            const c2 = fields[(rng() * fields.length) | 0];
            const a2 = rng() * Math.PI * 2;
            x = c2[0] + Math.cos(a2) * c2[2] * 1.2;
            y = c2[1] + Math.sin(a2) * c2[2] * 0.9;
          }
          const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.6, 4 + ((rng() * 2) | 0));
          sprayEdge(p, sand, 0.92, false);
        }
      };
      paintMerdcSand();
      // black: thin elongated shadow bars anchored on field boundaries (the
      // nato scheme's proven anti-confetti rule — never free-floating chips)
      const paintMerdcBlack = (): void => {
        for (let i = 0; i < Math.max(2, Math.round(3 * nK * (visual.blackK || 1) / pk)); i++) {
          const r = S * wk * pk * (0.028 + rng() * 0.018);
          let x = rng() * S, y = rng() * S;
          if (fields.length && rng() < 0.8) {
            const c2 = fields[(rng() * fields.length) | 0];
            const a2 = rng() * Math.PI * 2;
            x = c2[0] + Math.cos(a2) * c2[2] * 1.1;
            y = c2[1] + Math.sin(a2) * c2[2] * 0.8;
          }
          const p = camoPatchPath2D(rng, x, y, r, dirA + (rng() - 0.5) * 0.7, 3);
          sprayEdge(p, black, 0.9, false);
        }
      };
      paintMerdcBlack();
        }
      };
      const paintBlotchScheme = (): void => {
        if (scheme === 'blotch' && patches.length) {
      // Dense rounded blotch field (tropic/jungle + autumn palettes, camo r8):
      // large SOFT rounded masses at ~50-60% coverage, each with a small
      // satellite-dapple cluster — canopy language, deliberately zero angular
      // facets so it separates from nato/merdc geometry at battle range.
      // camo r2 (starter pattern-quality): two splotch-shape upgrades.
      //   1. The LARGE masses union a second offset lobe — single blobPath2D
      //      stamps read as same-recipe cookie-cutter ellipses once three sit
      //      on one flank; a two-lobe union gives each mass a waist/branch
      //      silhouette like real foliage masses.
      //   2. Satellites drift along ONE per-vehicle direction (dirB) instead
      //      of ringing the rim uniformly — canopy dapple trails off masses
      //      with the light, it doesn't halo them.
      const pk = visual.patchK || 1;
      const dirB = rng() * Math.PI * 2;              // shared satellite drift
      for (let pi = 0; pi < patches.length; pi++) {
        const col = patches[pi];
        const nB = Math.max(3, Math.round((5 - pi) * nK / pk));
        for (let i = 0; i < nB; i++) {
          const r = S * wk * pk * (pi === 0 ? 0.085 + rng() * 0.055 : 0.05 + rng() * 0.04);
          const x = rng() * S, y = rng() * S;
          const p = blobPath2D(rng, x, y, r, 9, 0.5);
          if (pi === 0) {                            // second lobe on the big masses
            const a3 = rng() * Math.PI * 2;
            p.addPath(blobPath2D(rng, x + Math.cos(a3) * r * (0.75 + rng() * 0.35),
              y + Math.sin(a3) * r * (0.6 + rng() * 0.3), r * (0.55 + rng() * 0.3), 9, 0.5));
          }
          sprayEdge(p, col, 0.93, false);
          const nSat = 2 + ((rng() * 2) | 0);        // dapple trail off the rim
          for (let k2 = 0; k2 < nSat; k2++) {
            const a2 = dirB + (rng() - 0.5) * 1.5;
            const sp = blobPath2D(rng, x + Math.cos(a2) * r * (1.3 + rng() * 0.7),
              y + Math.sin(a2) * r * (1.0 + rng() * 0.6), r * (0.22 + rng() * 0.22), 7, 0.55);
            ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
            fillWrapped(ctx, S, sp, rgb(col, 0.88));
            ctx.filter = 'none';
          }
        }
      }
        }
      };
      paintWinterScheme();
      paintFleckScheme();
      paintDigitalScheme();
      paintMerdcScheme();
      paintBlotchScheme();
    };
    paintFieldSchemes();

    const paintGeometricSchemes = (): void => {
      const paintBlocksScheme = (): void => {
        if (scheme === 'blocks' && patches.length) {
      // Urban block (Berlin-brigade language, camo r8): CRISP axis-aligned
      // rectangles in flat greys — geometry so architectural it can never be
      // mistaken for a foliage scheme. Big panels first, then a course of
      // half-size blocks; edges stay unblurred (masked hard-line paint), the
      // only hard-vector scheme by design.
      const pk = visual.patchK || 1;
      const rect = (x: number, y: number, w2: number, h2: number, col: Rgb, a: number): void => {
        const p = new Path2D();
        p.rect(x - w2 / 2, y - h2 / 2, w2, h2);
        fillWrapped(ctx, S, p, rgb(col, a));
      };
      const nBig = Math.max(4, Math.round(6 * nK / pk));
      for (let i = 0; i < nBig; i++) {
        const col = patches[i % patches.length];
        rect(rng() * S, rng() * S,
          S * wk * pk * (0.13 + rng() * 0.12), S * wk * pk * (0.10 + rng() * 0.10), col, 0.95);
      }
      for (let i = 0; i < Math.round(10 * nK / pk); i++) {
        const col = patches[(rng() * patches.length) | 0];
        rect(rng() * S, rng() * S,
          S * wk * pk * (0.05 + rng() * 0.06), S * wk * pk * (0.04 + rng() * 0.05), col, 0.92);
      }
        }
      };
      const paintWashwornScheme = (): void => {
        if (scheme === 'washworn') {
      // Field-expedient whitewash, HEAVILY worn (camo r8) — distinct from
      // 'winter' (a maintained near-full wash): this one was slopped on
      // mid-campaign and half scrubbed off. Broad opaque chalk swathes leave
      // CONNECTED bands of the factory paint exposed (~25-30%), wear gathers
      // along one abrasion diagonal, and the winter luma ceiling caps the
      // brightest texels so the wash stays in the matte chalk band.
      const under: Rgb = patches.length ? patches[0] : [70, 80, 55];
      for (let i = 0; i < Math.round(9 * nK); i++) {   // crew mop-work swathes
        const r = S * wk * (0.09 + rng() * 0.07);
        const p = camoPatchPath2D(rng, rng() * S, rng() * S, r, rng() * Math.PI, 3 + ((rng() * 3) | 0));
        ctx.filter = `blur(${Math.max(1.5, S * 0.0016).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(mix(base, [255, 255, 255], 0.05), 0.85));
        ctx.filter = 'none';
      }
      // exposed factory paint: connected multi-lobe bands along one diagonal
      const dirW = rng() * Math.PI;
      for (let i = 0; i < Math.round(6 * nK); i++) {
        const r = S * wk * (0.05 + rng() * 0.05);
        const p = camoPatchPath2D(rng, rng() * S, rng() * S, r, dirW + (rng() - 0.5) * 0.5, 3 + ((rng() * 2) | 0));
        ctx.filter = `blur(${Math.max(1, S * 0.0009).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(under, 0.45 + rng() * 0.30));
        ctx.filter = 'none';
      }
      // scrub streaks + cold slush grime (winter's steel-wear language, heavier)
      for (let i = 0; i < 60; i++) {
        const x0 = rng() * S, y0 = rng() * S, len = S * (0.05 + rng() * 0.14);
        const tone: Rgb = rng() < 0.5 ? mix(under, [96, 104, 108], 0.5) : [88, 96, 102];
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.lineTo(x0 + (rng() - 0.5) * 6, y0 + len);
        strokeWrapped(ctx, S, path, rgb(tone, 0.10 + rng() * 0.12), 1.5 + rng() * 4);
      }
      capCanvasLuma(ctx, S, luma(base) * 1.04);
        }
      };
      const paintCaunterScheme = (): void => {
        if (scheme === 'caunter' && patches.length) {
      // British Caunter-family stone scheme (camo r8): PARALLEL hard-edged
      // diagonal bands, all sharing the vehicle's one angle — the disciplined
      // ruler-laid Middle-East look, nothing sprayed. Slate blue-grey + dark
      // earth over the desert-pink base; a gentle mid-band bend follows plate
      // breaks so long hull sides never read as printed tape.
      const pk = visual.patchK || 1;
      const ang = (rng() < 0.5 ? 1 : -1) * (0.55 + rng() * 0.35);   // ~30-50 deg
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa, ny = ca;
      const nB2 = Math.max(4, Math.round(6 * nK / pk));
      for (let i = 0; i < nB2; i++) {
        const col = patches[i % patches.length];
        const w2 = S * wk * pk * (0.07 + rng() * 0.065);
        // camo r2 (starter pattern-quality): bands taper to ~half width along
        // their run — the real Caunter panels are CONVERGING wedges laid to
        // false-perspective the hull, and the old constant-width strips read
        // as printed tape at pedestal range. Same one-angle discipline.
        const wEnd = w2 * (0.45 + rng() * 0.4);
        const wMid = (w2 + wEnd) / 2;
        const cx = rng() * S, cy = rng() * S;
        const len = S * 1.55;
        const bend = (rng() - 0.5) * w2 * 1.6;
        const p = new Path2D();
        const x0 = cx - ca * len / 2, y0 = cy - sa * len / 2;
        const x1 = cx + nx * bend, y1 = cy + ny * bend;
        const x2 = cx + ca * len / 2, y2 = cy + sa * len / 2;
        p.moveTo(x0 + nx * w2 / 2, y0 + ny * w2 / 2);
        p.lineTo(x1 + nx * wMid / 2, y1 + ny * wMid / 2);
        p.lineTo(x2 + nx * wEnd / 2, y2 + ny * wEnd / 2);
        p.lineTo(x2 - nx * wEnd / 2, y2 - ny * wEnd / 2);
        p.lineTo(x1 - nx * wMid / 2, y1 - ny * wMid / 2);
        p.lineTo(x0 - nx * w2 / 2, y0 - ny * w2 / 2);
        p.closePath();
        fillWrapped(ctx, S, p, rgb(col, 0.94));
      }
        }
      };
      const paintSplinterScheme = (): void => {
        if (scheme === 'splinter' && patches.length) {
      // Splittertarn (hard-edge WWII German, camo r8): interlocking
      // straight-edged polygon wedges of green + red-brown over the tan base,
      // plus the signature Regenstreifen — short parallel rain strokes in one
      // fixed diagonal laid across everything.
      const pk = visual.patchK || 1;
      const nP2 = Math.max(5, Math.round(8 * nK / pk));
      for (let i = 0; i < nP2; i++) {
        const col = patches[i % patches.length];
        const r = S * wk * pk * (i < nP2 * 0.4 ? 0.10 + rng() * 0.065 : 0.055 + rng() * 0.045);
        const p = polyPath2D(rng, rng() * S, rng() * S, r, 4 + ((rng() * 3) | 0), 0.5);
        fillWrapped(ctx, S, p, rgb(col, 0.95));
      }
      // camo r2: `rainK` palette knob (default 1 — rng draw order untouched)
      // scales the Regenstreifen density. The Nordic M90-family scheme ('m90')
      // is the same interlocking hard-wedge geometry WITHOUT rain strokes —
      // rainK 0 skips the pass (ra/rainCol still draw so authored splinter
      // layouts stay byte-stable).
      const rainK = visual.rainK == null ? 1 : visual.rainK;
      const ra = 1.1 + (rng() - 0.5) * 0.3;          // one rain direction per tank
      const rainCol = mix(patches[0], [40, 44, 38], 0.55);
      for (let i = 0; i < Math.round(90 * nK * rainK); i++) {
        const x0 = rng() * S, y0 = rng() * S;
        const len = S * wk * (0.025 + rng() * 0.045);
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.lineTo(x0 + Math.cos(ra) * len, y0 + Math.sin(ra) * len);
        strokeWrapped(ctx, S, path, rgb(rainCol, 0.55 + rng() * 0.25), 1.2 + rng() * 1.6);
      }
        }
      };
      const paintDazzleScheme = (): void => {
        if (scheme === 'dazzle' && patches.length) {
      // Dazzle (camo r8): long straight HARD-EDGE wedge bands crossing the
      // hull at two alternating diagonal families — disruption by geometry,
      // not blending. Bands are tapered polygon strips (no spray blur; the
      // camoPatchPath2D midpoint jitter is deliberately absent — dazzle IS
      // ruler-edged). Tones alternate through the patch list so no two
      // neighboring bands share a value.
      const pk = visual.patchK || 1;
      const a0 = rng() * Math.PI;
      const a1 = a0 + Math.PI / 2 + (rng() - 0.5) * 0.5;
      const nB = Math.max(5, Math.round(7 * nK / pk));
      for (let i = 0; i < nB; i++) {
        const col = patches[i % patches.length];
        const ang = (i % 3 === 2 ? a1 : a0) + (rng() - 0.5) * 0.22;
        const len = S * wk * pk * (0.7 + rng() * 0.6);
        const w0 = S * wk * pk * (0.05 + rng() * 0.075);
        const w1 = w0 * (0.25 + rng() * 0.5);        // taper -> wedge read
        const cx = rng() * S, cy = rng() * S;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = -sa, ny = ca;
        const p = new Path2D();
        p.moveTo(cx - ca * len / 2 + nx * w0 / 2, cy - sa * len / 2 + ny * w0 / 2);
        p.lineTo(cx + ca * len / 2 + nx * w1 / 2, cy + sa * len / 2 + ny * w1 / 2);
        p.lineTo(cx + ca * len / 2 - nx * w1 / 2, cy + sa * len / 2 - ny * w1 / 2);
        p.lineTo(cx - ca * len / 2 - nx * w0 / 2, cy - sa * len / 2 - ny * w0 / 2);
        p.closePath();
        fillWrapped(ctx, S, p, rgb(col, 0.96));
      }
      // short counter-chevrons break the band rhythm on big flat plates
      for (let i = 0; i < Math.round(3 * nK / pk); i++) {
        const col = patches[(i + 1) % patches.length];
        const ang = a1 + (rng() - 0.5) * 0.3;
        const len = S * wk * pk * (0.22 + rng() * 0.18);
        const w0 = S * wk * pk * (0.04 + rng() * 0.04);
        const cx = rng() * S, cy = rng() * S;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = -sa, ny = ca;
        const p = new Path2D();
        p.moveTo(cx - ca * len / 2 + nx * w0 / 2, cy - sa * len / 2 + ny * w0 / 2);
        p.lineTo(cx + ca * len / 2 + nx * w0 * 0.3, cy + sa * len / 2 + ny * w0 * 0.3);
        p.lineTo(cx + ca * len / 2 - nx * w0 * 0.3, cy + sa * len / 2 - ny * w0 * 0.3);
        p.lineTo(cx - ca * len / 2 - nx * w0 / 2, cy - sa * len / 2 - ny * w0 / 2);
        p.closePath();
        fillWrapped(ctx, S, p, rgb(col, 0.94));
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      paintBlocksScheme();
      paintWashwornScheme();
      paintCaunterScheme();
      paintSplinterScheme();
      paintDazzleScheme();
    };
    paintGeometricSchemes();

    const paintIdentitySchemes = (): void => {
      const paintTigerStripeScheme = (): void => {
        if (scheme === 'tigerstripe' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // Tiger stripe (SEA gunship lineage, camo r2 expansion): long JAGGED
      // near-horizontal bands — thick dark stripes with sharp tapered claw
      // ends and per-segment width jitter, thin pale interstripes riding
      // between them, over a mid-green field. Brush-applied HARD edges (~1px
      // feather only), never sprayed — the crisp sawtooth silhouette is the
      // signature, so no camoPatchPath2D/sprayEdge here. patches = [dark
      // stripe, pale interstripe, optional mid-green underband].
      const dark = patches[0];
      const pale = patches[1] || mix(base, [214, 208, 168], 0.4);
      const mid2 = patches[2] || null;
      // one near-horizontal flow per vehicle (bandAngle knob can repose it)
      const flow = (visual.bandAngle != null ? visual.bandAngle : 0.14) + (rng() - 0.5) * 0.18;
      const stripe = (col: Rgb, w0: number, len: number, alpha: number): void => {
        const segs = 7;
        const dirA = flow + (rng() - 0.5) * 0.28;
        const x0 = rng() * S, y0 = rng() * S;
        const step = len / segs;
        const spine = [];
        let cx = x0 - Math.cos(dirA) * len / 2, cy = y0 - Math.sin(dirA) * len / 2;
        let a = dirA;
        for (let i = 0; i <= segs; i++) {
          spine.push([cx, cy]);
          a = dirA + (rng() - 0.5) * 0.6;            // spine wanders
          cx += Math.cos(a) * step;
          cy += Math.sin(a) * step;
        }
        const nx = -Math.sin(dirA), ny = Math.cos(dirA);
        const p = new Path2D();
        const half = (i: number): number => {        // sharp taper + jagged width
          const t = i / segs;
          const taper = Math.pow(Math.sin(Math.PI * t), 0.55);
          return (w0 / 2) * taper * (0.6 + rng() * 0.8);
        };
        for (let i = 0; i <= segs; i++) {
          const w2 = half(i);
          const px2 = spine[i][0] + nx * w2, py2 = spine[i][1] + ny * w2;
          if (i === 0) p.moveTo(px2, py2); else p.lineTo(px2, py2);
        }
        for (let i = segs; i >= 0; i--) {
          const w2 = half(i);
          p.lineTo(spine[i][0] - nx * w2, spine[i][1] - ny * w2);
        }
        p.closePath();
        // claw spur: a short tapered branch off a random spine point
        if (rng() < 0.55) {
          const k2 = 1 + ((rng() * (segs - 2)) | 0);
          const sa2 = dirA + (rng() < 0.5 ? 1 : -1) * (0.9 + rng() * 0.5);
          const sl = len * (0.10 + rng() * 0.10);
          const [bx, by] = spine[k2];
          p.moveTo(bx + nx * w0 * 0.2, by + ny * w0 * 0.2);
          p.lineTo(bx + Math.cos(sa2) * sl, by + Math.sin(sa2) * sl);
          p.lineTo(bx - nx * w0 * 0.2, by - ny * w0 * 0.2);
          p.closePath();
        }
        ctx.filter = `blur(${Math.max(1, S * 0.0007).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(col, alpha));
        ctx.filter = 'none';
      };
      if (mid2) {                                    // soft mid-green underbands
        for (let i = 0; i < Math.round(4 * nK); i++) {
          stripe(mix(mid2, base, 0.25), S * wk * (0.09 + rng() * 0.06),
            S * wk * (0.5 + rng() * 0.4), 0.55);
        }
      }
      for (let i = 0; i < Math.round(5 * nK); i++) { // thin pale interstripes
        stripe(pale, S * wk * (0.020 + rng() * 0.018), S * wk * (0.4 + rng() * 0.35), 0.85);
      }
      for (let i = 0; i < Math.round(7 * nK); i++) { // dominant dark claws
        stripe(dark, S * wk * (0.045 + rng() * 0.04), S * wk * (0.55 + rng() * 0.45), 0.94);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintChipSixScheme = (): void => {
        if (scheme === 'chip6' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // US 6-color desert 'chocolate chip' (camo r2 expansion): broad wavy
      // horizontal wind bands in two earth tones over the tan base, then the
      // signature COOKIE clusters — pale rounded blobs with small black-rock
      // chips riding their rims. Band geometry shares the desert scheme's
      // world-size discipline (wk/nK); cookies stay clustered so they never
      // rain as uniform confetti (the r8 desert lesson). patches = [broad
      // dark earth, broad pale sand, cookie pale, chip black].
      const bDark = patches[0];
      const bPale = patches[1] || mix(base, [235, 226, 196], 0.4);
      const cookie = patches[2] || mix(base, [228, 232, 230], 0.55);
      const chip = patches[3] || [51, 52, 47];
      for (let i = 0; i < Math.round(5 * nK); i++) { // wavy horizontal bands
        const y0 = rng() * S;
        const w = S * wk * (0.09 + rng() * 0.09);
        const col = i % 2 ? bDark : bPale;
        const path = new Path2D();
        path.moveTo(-S * 0.1, y0);
        path.bezierCurveTo(
          S * 0.28, y0 + (rng() - 0.5) * S * 0.16,
          S * 0.62, y0 + (rng() - 0.5) * S * 0.16,
          S * 1.1, y0 + (rng() - 0.5) * S * 0.12);
        ctx.filter = `blur(${Math.max(1, S * 0.0009).toFixed(1)}px)`;
        strokeWrapped(ctx, S, path, rgb(mix(col, base, 0.12), 0.88), w);
        ctx.filter = 'none';
      }
      const nCl = Math.round(8 * nK);                // cookie clusters
      for (let i = 0; i < nCl; i++) {
        const ccx = rng() * S, ccy = rng() * S;
        const n = 1 + ((rng() * 3) | 0);
        for (let k2 = 0; k2 < n; k2++) {
          const x = ccx + (rng() - 0.5) * S * wk * 0.11;
          const y = ccy + (rng() - 0.5) * S * wk * 0.08;
          const r = S * wk * (0.019 + rng() * 0.019);
          const p = blobPath2D(rng, x, y, r, 8, 0.4);
          ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
          fillWrapped(ctx, S, p, rgb(cookie, 0.94));
          ctx.filter = 'none';
          const nk2 = 2 + ((rng() * 3) | 0);         // black chips hug the rim
          for (let j = 0; j < nk2; j++) {
            const a2 = rng() * Math.PI * 2;
            const px2 = x + Math.cos(a2) * r * (0.55 + rng() * 0.55);
            const py2 = y + Math.sin(a2) * r * (0.45 + rng() * 0.45) * 0.8;
            const rr = r * (0.16 + rng() * 0.15);
            fillWrapped(ctx, S, polyPath2D(rng, px2, py2, rr, 5, 0.6), rgb(chip, 0.9));
          }
        }
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintBrushScheme = (): void => {
        if (scheme === 'brush' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // UK DPM brush-stroke (camo r2 expansion): layered directional strokes —
      // each tone swept along ONE shared flow with occasional perpendicular
      // counterstrokes, round brush ends, hard masked edge (~1px feather).
      // Strokes stack green -> brown -> black so the black always reads as the
      // top drawing layer, the DPM signature. patches = [green, brown, black].
      const flow = rng() * Math.PI;
      const strokeOne = (col: Rgb, w: number, len: number, alpha: number): void => {
        const x0 = rng() * S, y0 = rng() * S;
        const a = flow + (rng() - 0.5) * 0.6 + (rng() < 0.18 ? Math.PI / 2 : 0);
        const bend = (rng() - 0.5) * w * 3;
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.quadraticCurveTo(
          x0 + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
          y0 + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
          x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
        ctx.filter = `blur(${Math.max(1, S * 0.0007).toFixed(1)}px)`;
        strokeWrapped(ctx, S, path, rgb(col, alpha), w);
        ctx.filter = 'none';
      };
      const green = patches[0];
      const brown = patches[1] || patches[0];
      const black = patches[2] || null;
      for (let i = 0; i < Math.round(8 * nK); i++) {
        strokeOne(green, S * wk * (0.045 + rng() * 0.05), S * wk * (0.30 + rng() * 0.35), 0.92);
      }
      for (let i = 0; i < Math.round(7 * nK); i++) {
        strokeOne(brown, S * wk * (0.040 + rng() * 0.045), S * wk * (0.28 + rng() * 0.30), 0.92);
      }
      if (black) {
        for (let i = 0; i < Math.round(5 * nK); i++) {
          strokeOne(black, S * wk * (0.022 + rng() * 0.028), S * wk * (0.24 + rng() * 0.28), 0.90);
        }
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintClaudeScheme = (): void => {
        if (scheme === 'claude' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // The HOUSE SCHEME (camo r5, owner ask: "remove the black and orange
      // dots... massive versions of the claude guys themselves in black and
      // orange"). The r4 terra/slate field lobes still read as dots under the
      // monogram, so the fields are GONE — same composition language as
      // 'spark': soft clay washes for depth, then the official Claude Code
      // creature stamped from sprinkle to hero scale, ink alternating
      // terracotta/slate straight on the ivory. patches = [terracotta, slate].
      const terra = patches[0];
      const slate = patches[1] || '#3d3b37';
      for (let i = 0; i < Math.max(2, Math.round(3 * nK)); i++) {
        // broad low-alpha clay washes so the ivory field isn't flat
        const x = rng() * S, y = rng() * S;
        const r = S * wk * (0.16 + rng() * 0.09);
        ctx.filter = `blur(${Math.max(2, S * 0.004).toFixed(1)}px)`;
        fillWrapped(ctx, S, blobPath2D(rng, x, y, r, 8, 0.3),
          rgb(mix(terra, base, 0.62), 0.5));
        ctx.filter = 'none';
      }
      const codeSrc = new Path2D(CLAUDE_CODE_MARK);
      const guy = (x: number, y: number, s: number, rot: number, ink: Rgb, a: number): void => {
        const p = new Path2D();
        // 24x24 source box, visual mass centered near (12, 12.5); s/24 spans
        // s units. evenodd keeps the punched eyes open. Rotations stay small —
        // the creature reads upright, unlike the any-angle starburst.
        const m = new DOMMatrix().translate(x, y).rotate((rot * 180) / Math.PI)
          .scale(s / 24, s / 24).translate(-12, -12.5);
        p.addPath(codeSrc, m);
        fillWrapped(ctx, S, p, rgb(ink, a), 'evenodd');
      };
      guy(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.52 + rng() * 0.12), (rng() - 0.5) * 0.5, terra, 0.94); // the hero guy
      const cell = S / 2;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          const x = (gx + 0.5 + (rng() - 0.5) * 0.6) * cell;
          const y = (gy + 0.5 + (rng() - 0.5) * 0.6) * cell;
          guy(x, y, cell * (0.44 + rng() * 0.14), (rng() - 0.5) * 0.5,
            (gx + gy) % 2 ? slate : terra, 0.9);
        }
      }
      for (let i = 0; i < Math.round(7 * nK); i++) {  // sprinkle guys
        guy(rng() * S, rng() * S, S * (0.05 + rng() * 0.04),
          (rng() - 0.5) * 0.7, rng() < 0.4 ? slate : terra, 0.62);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintSparkScheme = (): void => {
        if (scheme === 'spark' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // CLAUDE SPARK camo (camo r4, owner ask): the official starburst from
      // sprinkle to hero scale over warm ivory with soft clay wash fields. One
      // giant spark anchors the tile, mediums alternate terracotta/slate, a
      // terracotta sprinkle fills the field. patches = [terracotta, slate].
      const terra = patches[0];
      const slate = patches[1] || '#3a3733';
      for (let i = 0; i < Math.max(2, Math.round(3 * nK)); i++) {
        // broad low-alpha clay washes so the ivory field isn't flat
        const x = rng() * S, y = rng() * S;
        const r = S * wk * (0.16 + rng() * 0.09);
        ctx.filter = `blur(${Math.max(2, S * 0.004).toFixed(1)}px)`;
        fillWrapped(ctx, S, blobPath2D(rng, x, y, r, 8, 0.3),
          rgb(mix(terra, base, 0.62), 0.5));
        ctx.filter = 'none';
      }
      const sparkSrc = new Path2D(CLAUDE_SPARK_MARK);
      const spark = (x: number, y: number, s: number, rot: number, ink: Rgb, a: number): void => {
        const p = new Path2D();
        const m = new DOMMatrix().translate(x, y).rotate((rot * 180) / Math.PI)
          .scale(s / 24, s / 24).translate(-12, -12);
        p.addPath(sparkSrc, m);
        fillWrapped(ctx, S, p, rgb(ink, a));
      };
      spark(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.5 + rng() * 0.12), rng() * Math.PI * 2, terra, 0.94); // the hero
      const cell = S / 2;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          const x = (gx + 0.5 + (rng() - 0.5) * 0.6) * cell;
          const y = (gy + 0.5 + (rng() - 0.5) * 0.6) * cell;
          spark(x, y, cell * (0.42 + rng() * 0.14), rng() * Math.PI * 2,
            (gx + gy) % 2 ? slate : terra, 0.9);
        }
      }
      for (let i = 0; i < Math.round(7 * nK); i++) {  // sprinkle
        spark(rng() * S, rng() * S, S * (0.045 + rng() * 0.035),
          rng() * Math.PI * 2, rng() < 0.3 ? slate : terra, 0.6);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      paintTigerStripeScheme();
      paintChipSixScheme();
      paintBrushScheme();
      paintClaudeScheme();
      paintSparkScheme();
    };
    paintIdentitySchemes();

    const paintNoveltySchemes = (): void => {
      const paintDuckyScheme = (): void => {
        if (scheme === 'ducky' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // RUBBER DUCKY (camo r6, owner ask: fun set): a hero duck and its
      // flotilla in bath-toy gold on pond gray, slate wing/eye/beak accents,
      // faint ripple lines for water. patches = [gold, slate].
      const gold = patches[0];
      const ink = patches[1] || '#2e3338';
      for (let i = 0; i < Math.round(4 * nK); i++) {   // ripples
        const y0 = rng() * S;
        const path = new Path2D();
        path.moveTo(-S * 0.1, y0);
        path.bezierCurveTo(S * 0.3, y0 + (rng() - 0.5) * S * 0.05,
          S * 0.7, y0 + (rng() - 0.5) * S * 0.05, S * 1.1, y0);
        strokeWrapped(ctx, S, path, rgb(mix(base, [255, 255, 255], 0.2), 0.45),
          Math.max(2, S * 0.005));
      }
      const duck = (x: number, y: number, s: number, flip: boolean, a: number): void => {
        const m = new DOMMatrix().translate(x, y).scale(flip ? -s : s, s);
        const body = new Path2D();
        const q = new Path2D();
        q.ellipse(0.02, 0.10, 0.46, 0.33, 0, 0, Math.PI * 2);      // hull
        q.ellipse(-0.30, -0.28, 0.22, 0.21, 0, 0, Math.PI * 2);    // head
        q.moveTo(-0.48, -0.36); q.lineTo(-0.68, -0.26); q.lineTo(-0.48, -0.18);
        q.closePath();                                             // beak
        q.moveTo(0.34, -0.02); q.quadraticCurveTo(0.58, -0.22, 0.46, 0.08);
        q.closePath();                                             // tail flick
        body.addPath(q, m);
        fillWrapped(ctx, S, body, rgb(gold, a));
        const detail = new Path2D();
        const q2 = new Path2D();
        q2.ellipse(0.08, 0.12, 0.17, 0.10, -0.35, 0, Math.PI * 2); // wing
        q2.moveTo(-0.31, -0.31); q2.arc(-0.34, -0.31, 0.035, 0, Math.PI * 2); // eye
        detail.addPath(q2, m);
        fillWrapped(ctx, S, detail, rgb(ink, a * 0.85));
      };
      duck(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.26 + rng() * 0.06), rng() < 0.5, 0.95);             // hero duck
      for (let i = 0; i < 3; i++) {
        duck(rng() * S, rng() * S, S * (0.12 + rng() * 0.05), rng() < 0.5, 0.92);
      }
      for (let i = 0; i < Math.round(6 * nK); i++) {               // ducklings
        duck(rng() * S, rng() * S, S * (0.045 + rng() * 0.03), rng() < 0.5, 0.8);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintSuitsScheme = (): void => {
        if (scheme === 'suits' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // HIGH ROLLER (camo r6): playing-card suits scattered over aged ivory —
      // hearts/diamonds in red, spades/clubs in black, casino-felt wash.
      // patches = [red, black].
      const red = patches[0];
      const blk = patches[1] || '#2b2b2e';
      const suit = (kind: 0 | 1 | 2 | 3, x: number, y: number, s: number, rot: number, a: number): void => {
        const q = new Path2D();
        if (kind === 0) {          // heart (24x24 box)
          q.moveTo(12, 21);
          q.bezierCurveTo(4, 13, 2, 9, 2, 6.5);
          q.bezierCurveTo(2, 3.5, 4.2, 2, 6.5, 2);
          q.bezierCurveTo(8.6, 2, 10.8, 3.2, 12, 5.6);
          q.bezierCurveTo(13.2, 3.2, 15.4, 2, 17.5, 2);
          q.bezierCurveTo(19.8, 2, 22, 3.5, 22, 6.5);
          q.bezierCurveTo(22, 9, 20, 13, 12, 21);
          q.closePath();
        } else if (kind === 1) {   // diamond
          q.moveTo(12, 1); q.lineTo(19.5, 12); q.lineTo(12, 23);
          q.lineTo(4.5, 12); q.closePath();
        } else if (kind === 2) {   // spade
          q.moveTo(12, 2);
          q.bezierCurveTo(20, 10, 22, 12.5, 22, 15);
          q.bezierCurveTo(22, 18, 19.8, 19.5, 17.5, 19.5);
          q.bezierCurveTo(16, 19.5, 14.6, 18.9, 13.6, 17.8);
          q.lineTo(15.2, 23); q.lineTo(8.8, 23); q.lineTo(10.4, 17.8);
          q.bezierCurveTo(9.4, 18.9, 8, 19.5, 6.5, 19.5);
          q.bezierCurveTo(4.2, 19.5, 2, 18, 2, 15);
          q.bezierCurveTo(2, 12.5, 4, 10, 12, 2);
          q.closePath();
        } else {                   // club
          q.arc(12, 7, 5.2, 0, Math.PI * 2);
          q.moveTo(11.6, 14); q.arc(6.4, 14, 5.2, 0, Math.PI * 2);
          q.moveTo(22.8, 14); q.arc(17.6, 14, 5.2, 0, Math.PI * 2);
          q.moveTo(15.2, 23); q.lineTo(8.8, 23); q.lineTo(10.8, 16);
          q.lineTo(13.2, 16); q.closePath();
        }
        const p = new Path2D();
        p.addPath(q, new DOMMatrix().translate(x, y)
          .rotate((rot * 180) / Math.PI).scale(s / 24, s / 24).translate(-12, -12));
        fillWrapped(ctx, S, p, rgb(kind < 2 ? red : blk, a));
      };
      suit(((rng() * 4) | 0) as 0 | 1 | 2 | 3, S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.42 + rng() * 0.12), (rng() - 0.5) * 0.5, 0.94);     // hero suit
      const cell = S / 2;
      let k6 = (rng() * 4) | 0;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          k6++;
          suit((k6 % 4) as 0 | 1 | 2 | 3, (gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
            (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
            cell * (0.34 + rng() * 0.12), (rng() - 0.5) * 0.5, 0.9);
        }
      }
      for (let i = 0; i < Math.round(8 * nK); i++) {
        suit(((rng() * 4) | 0) as 0 | 1 | 2 | 3, rng() * S, rng() * S,
          S * (0.05 + rng() * 0.04), (rng() - 0.5) * 0.7, 0.65);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintFlamesScheme = (): void => {
        if (scheme === 'flames' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // HOT ROD (camo r6): flame licks sweeping one shared diagonal over
      // near-black — deep red under orange under gold cores, drawn as chains
      // of shrinking lobes with a whip tip. patches = [red, orange, gold].
      const fr = patches[0];
      const fo = patches[1] || patches[0];
      const fg = patches[2] || fo;
      const flow = -0.5 + rng() * 0.25;
      const licks: FlameLick[] = [];
      for (let i = 0; i < Math.round(7 * nK); i++) {
        licks.push({ x: rng() * S, y: rng() * S, ang: flow + (rng() - 0.5) * 0.4,
          len: S * (0.22 + rng() * 0.2), w: S * (0.045 + rng() * 0.035), j: rng() * 9 });
      }
      const drawLayer = (col: Rgb, kScale: number, alpha: number): void => {
        for (const L of licks) {
          const p = new Path2D();
          const steps = 4;
          for (let k2 = 0; k2 < steps; k2++) {
            const t = k2 / steps;
            const wob = Math.sin(L.j + t * 7) * L.w * 0.5;
            p.addPath(blobPath2D(mulberry32((L.j * 1e4) | 0), 0, 0,
              L.w * kScale * (1 - t * 0.72), 7, 0.3),
            new DOMMatrix().translate(
              L.x + Math.cos(L.ang) * L.len * t - Math.sin(L.ang) * wob,
              L.y + Math.sin(L.ang) * L.len * t + Math.cos(L.ang) * wob));
          }
          const tip = new Path2D();                    // whip tip
          tip.moveTo(L.x + Math.cos(L.ang) * L.len * 0.9,
            L.y + Math.sin(L.ang) * L.len * 0.9);
          tip.quadraticCurveTo(
            L.x + Math.cos(L.ang) * L.len * 1.15 - Math.sin(L.ang) * L.w,
            L.y + Math.sin(L.ang) * L.len * 1.15 + Math.cos(L.ang) * L.w,
            L.x + Math.cos(L.ang) * L.len * (1.3 + kScale * 0.2),
            L.y + Math.sin(L.ang) * L.len * (1.3 + kScale * 0.2));
          ctx.filter = `blur(${Math.max(1, S * 0.0008).toFixed(1)}px)`;
          fillWrapped(ctx, S, p, rgb(col, alpha));
          strokeWrapped(ctx, S, tip, rgb(col, alpha * 0.9), L.w * kScale * 0.5);
          ctx.filter = 'none';
        }
      };
      drawLayer(fr, 1, 0.95);
      drawLayer(fo, 0.66, 0.95);
      drawLayer(fg, 0.34, 0.9);
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintLeopardPrintScheme = (): void => {
        if (scheme === 'leopardprint' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // LEOPARD PRINT (camo r6): fashion rosettes — amber patch under a broken
      // black ring of arc chips, solid pips between. patches = [amber, black].
      const amber = patches[0];
      const blk = patches[1] || '#2e2a26';
      for (let i = 0; i < Math.round(24 * nK); i++) {
        const x = rng() * S, y = rng() * S;
        const r = S * (0.035 + rng() * 0.028);
        ctx.filter = `blur(${Math.max(1, S * 0.0007).toFixed(1)}px)`;
        fillWrapped(ctx, S, blobPath2D(rng, x, y, r * 0.8, 7, 0.35), rgb(amber, 0.85));
        ctx.filter = 'none';
        const n = 3 + ((rng() * 3) | 0);
        const a0 = rng() * Math.PI * 2;
        for (let k2 = 0; k2 < n; k2++) {
          const a1 = a0 + (k2 / n) * Math.PI * 2 + (rng() - 0.5) * 0.35;
          const chip = new Path2D();
          chip.arc(x, y, r * (0.95 + rng() * 0.2), a1, a1 + 0.5 + rng() * 0.5);
          strokeWrapped(ctx, S, chip, rgb(blk, 0.92), r * (0.4 + rng() * 0.2));
        }
      }
      for (let i = 0; i < Math.round(16 * nK); i++) {  // solid pips between
        fillWrapped(ctx, S, blobPath2D(rng, rng() * S, rng() * S,
          S * (0.008 + rng() * 0.01), 6, 0.4), rgb(blk, 0.85));
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintBoltScheme = (): void => {
        if (scheme === 'bolt' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // THUNDERBOLT (camo r6): comic lightning bolts, gold heroes with ink
      // counter-bolts on storm gray; soft cloud washes behind.
      // patches = [gold, ink].
      const gold = patches[0];
      const ink = patches[1] || '#26292d';
      for (let i = 0; i < Math.round(3 * nK); i++) {   // cloud washes
        ctx.filter = `blur(${Math.max(2, S * 0.004).toFixed(1)}px)`;
        fillWrapped(ctx, S, blobPath2D(rng, rng() * S, rng() * S,
          S * wk * (0.14 + rng() * 0.08), 8, 0.3),
        rgb(mix(base, [255, 255, 255], 0.14), 0.5));
        ctx.filter = 'none';
      }
      const bolt = (x: number, y: number, s: number, rot: number, col: Rgb, a: number): void => {
        const q = new Path2D();
        q.moveTo(0.06, -0.5); q.lineTo(0.26, -0.5); q.lineTo(0.03, -0.09);
        q.lineTo(0.2, -0.09); q.lineTo(-0.14, 0.5); q.lineTo(-0.02, 0.05);
        q.lineTo(-0.2, 0.05); q.closePath();
        const p = new Path2D();
        p.addPath(q, new DOMMatrix().translate(x, y)
          .rotate((rot * 180) / Math.PI).scale(s, s));
        fillWrapped(ctx, S, p, rgb(col, a));
      };
      bolt(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.5 + rng() * 0.14), (rng() - 0.5) * 0.7, gold, 0.95);  // hero bolt
      const cell = S / 2;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          bolt((gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
            (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
            cell * (0.4 + rng() * 0.14), (rng() - 0.5) * 0.8,
            (gx + gy) % 2 ? ink : gold, 0.9);
        }
      }
      for (let i = 0; i < Math.round(7 * nK); i++) {
        bolt(rng() * S, rng() * S, S * (0.05 + rng() * 0.045),
          rng() * Math.PI * 2, rng() < 0.35 ? ink : gold, 0.7);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      paintDuckyScheme();
      paintSuitsScheme();
      paintFlamesScheme();
      paintLeopardPrintScheme();
      paintBoltScheme();
    };
    paintNoveltySchemes();

    const paintGraphicSchemes = (): void => {
      const paintStarsScheme = (): void => {
        if (scheme === 'stars' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // STARFALL (camo r6): five-point stars from dust to hero on night navy,
      // cream heroes with gold satellites. patches = [cream, gold].
      const cream = patches[0];
      const gold = patches[1] || patches[0];
      const star = (x: number, y: number, s: number, rot: number, col: Rgb, a: number): void => {
        const q = new Path2D();
        for (let k2 = 0; k2 < 10; k2++) {
          const rr = k2 % 2 ? 0.21 : 0.5;
          const aa = -Math.PI / 2 + (k2 * Math.PI) / 5;
          const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
          if (k2) q.lineTo(px, py); else q.moveTo(px, py);
        }
        q.closePath();
        const p = new Path2D();
        p.addPath(q, new DOMMatrix().translate(x, y)
          .rotate((rot * 180) / Math.PI).scale(s, s));
        fillWrapped(ctx, S, p, rgb(col, a));
      };
      star(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.46 + rng() * 0.12), (rng() - 0.5) * 0.6, cream, 0.94); // hero star
      const cell = S / 2;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          star((gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
            (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
            cell * (0.32 + rng() * 0.14), rng() * Math.PI,
            (gx + gy) % 2 ? gold : cream, 0.9);
        }
      }
      for (let i = 0; i < Math.round(14 * nK); i++) {  // star dust
        star(rng() * S, rng() * S, S * (0.02 + rng() * 0.035),
          rng() * Math.PI, rng() < 0.5 ? gold : cream, 0.7);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintDaisyScheme = (): void => {
        if (scheme === 'daisy' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // FLOWER POWER (camo r6): sixties daisies — six cream petal ellipses
      // around a terracotta button, hero to sprinkle on olive drab.
      // patches = [cream, center].
      const cream = patches[0];
      const button = patches[1] || '#c96a3a';
      const daisy = (x: number, y: number, s: number, rot: number, a: number): void => {
        for (let k2 = 0; k2 < 6; k2++) {
          const aa = rot + (k2 * Math.PI) / 3;
          const q = new Path2D();
          q.ellipse(x + Math.cos(aa) * s * 0.3, y + Math.sin(aa) * s * 0.3,
            s * 0.21, s * 0.115, aa, 0, Math.PI * 2);
          fillWrapped(ctx, S, q, rgb(cream, a));
        }
        const c2 = new Path2D();
        c2.arc(x, y, s * 0.145, 0, Math.PI * 2);
        fillWrapped(ctx, S, c2, rgb(button, Math.min(1, a + 0.05)));
      };
      daisy(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.4 + rng() * 0.1), rng() * Math.PI, 0.93);            // hero daisy
      const cell = S / 2;
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 2; gx++) {
          daisy((gx + 0.5 + (rng() - 0.5) * 0.6) * cell,
            (gy + 0.5 + (rng() - 0.5) * 0.6) * cell,
            cell * (0.3 + rng() * 0.12), rng() * Math.PI, 0.9);
        }
      }
      for (let i = 0; i < Math.round(8 * nK); i++) {
        daisy(rng() * S, rng() * S, S * (0.045 + rng() * 0.035),
          rng() * Math.PI, 0.75);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintCircuitScheme = (): void => {
        if (scheme === 'circuit' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // CIRCUIT BOARD (camo r6): mint traces with 45-degree jogs, gold via
      // dots and pads, a few IC packages, on PCB green.
      // patches = [pad gold, trace mint].
      const pad = patches[0];
      const trace = patches[1] || patches[0];
      const via = (x: number, y: number, r: number): void => {
        const q = new Path2D();
        q.arc(x, y, r, 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(pad, 0.92));
      };
      for (let i = 0; i < Math.round(16 * nK); i++) {  // traces
        let x = rng() * S, y = rng() * S;
        const p = new Path2D();
        p.moveTo(x, y);
        via(x, y, S * 0.011);
        let dir = ((rng() * 4) | 0) * (Math.PI / 2);
        const segs = 2 + ((rng() * 3) | 0);
        for (let k2 = 0; k2 < segs; k2++) {
          const len = S * (0.07 + rng() * 0.13);
          x += Math.cos(dir) * len; y += Math.sin(dir) * len;
          p.lineTo(x, y);
          dir += (rng() < 0.5 ? 1 : -1) * (Math.PI / 4) * (1 + ((rng() * 2) | 0));
        }
        strokeWrapped(ctx, S, p, rgb(trace, 0.8), Math.max(2, S * 0.006));
        via(x, y, S * 0.011);
      }
      for (let i = 0; i < Math.round(4 * nK); i++) {   // IC packages
        const x = rng() * S, y = rng() * S;
        const w = S * (0.06 + rng() * 0.05), h = w * (0.55 + rng() * 0.5);
        const q = new Path2D();
        q.rect(x - w / 2, y - h / 2, w, h);
        fillWrapped(ctx, S, q, rgb(mix(base, [0, 0, 0], 0.45), 0.95));
        for (let k2 = 0; k2 < 4; k2++) {               // legs
          via(x - w / 2 - S * 0.008, y - h / 2 + (k2 + 0.5) * (h / 4), S * 0.006);
          via(x + w / 2 + S * 0.008, y - h / 2 + (k2 + 0.5) * (h / 4), S * 0.006);
        }
      }
      for (let i = 0; i < Math.round(10 * nK); i++) via(rng() * S, rng() * S, S * 0.009);
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintRacingScheme = (): void => {
        if (scheme === 'racing' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // RACING TEAM (camo r6): twin rally stripes with a keyline down one
      // shared diagonal, plus number roundels. patches = [red, black].
      const red = patches[0];
      const blk = patches[1] || '#26282c';
      const ang = -0.35 + (rng() - 0.5) * 0.2;
      const band = (offX: number, offY: number, w: number, col: Rgb, alpha: number): void => {
        const path = new Path2D();
        const len = S * 1.6;
        path.moveTo(offX - Math.cos(ang) * len * 0.5, offY - Math.sin(ang) * len * 0.5);
        path.lineTo(offX + Math.cos(ang) * len * 0.5, offY + Math.sin(ang) * len * 0.5);
        strokeWrapped(ctx, S, path, rgb(col, alpha), w);
      };
      const cx = rng() * S, cy = rng() * S;
      const nx = -Math.sin(ang), ny = Math.cos(ang);   // stripe normal
      band(cx, cy, S * 0.11, red, 0.94);               // main stripe
      band(cx + nx * S * 0.095, cy + ny * S * 0.095, S * 0.035, red, 0.94);
      band(cx - nx * S * 0.075, cy - ny * S * 0.075, S * 0.012, blk, 0.9);
      const num = String(1 + ((rng() * 98) | 0));
      const roundel = (x: number, y: number, r: number): void => {
        const disc = new Path2D();
        disc.arc(x, y, r, 0, Math.PI * 2);
        fillWrapped(ctx, S, disc, rgb(mix(base, [255, 255, 255], 0.55), 0.96));
        const ring = new Path2D();
        ring.arc(x, y, r * 0.94, 0, Math.PI * 2);
        strokeWrapped(ctx, S, ring, rgb(blk, 0.92), r * 0.09);
        ctx.save();
        ctx.font = `900 ${Math.round(r * 1.15)}px 'ABC Monument Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgb(blk, 0.94);
        for (const dx of [-S, 0, S]) {
          for (const dy of [-S, 0, S]) {
            ctx.save(); ctx.translate(dx, dy); ctx.fillText(num, x, y * 1.02); ctx.restore();
          }
        }
        ctx.restore();
      };
      roundel(cx + nx * S * (0.26 + rng() * 0.06), cy + ny * S * 0.26, S * (0.13 + rng() * 0.03));
      roundel(cx - nx * S * (0.3 + rng() * 0.06), cy - ny * S * 0.3, S * (0.09 + rng() * 0.03));
      for (let i = 0; i < Math.round(3 * nK); i++) {   // sponsor-ish ticks
        const x = rng() * S, y = rng() * S;
        const q = new Path2D();
        q.rect(x, y, S * (0.05 + rng() * 0.05), S * 0.014);
        fillWrapped(ctx, S, q, rgb(rng() < 0.5 ? red : blk, 0.7));
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintPaintballScheme = (): void => {
        if (scheme === 'paintball' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // PAINTBALL (camo r6): multicolor splats — irregular core, radial
      // droplet spray, occasional drip run — on primer gray.
      // patches = [blue, red, green, yellow].
      for (let i = 0; i < Math.round(9 * nK); i++) {
        const col = patches[(rng() * patches.length) | 0];
        const x = rng() * S, y = rng() * S;
        const r = S * (0.05 + rng() * 0.065);
        ctx.filter = `blur(${Math.max(1, S * 0.0006).toFixed(1)}px)`;
        fillWrapped(ctx, S, blobPath2D(rng, x, y, r, 11, 0.55), rgb(col, 0.9));
        ctx.filter = 'none';
        const nd = 4 + ((rng() * 6) | 0);
        for (let k2 = 0; k2 < nd; k2++) {              // droplet spray
          const aa = rng() * Math.PI * 2;
          const d = r * (1.15 + rng() * 1.5);
          const q = new Path2D();
          q.arc(x + Math.cos(aa) * d, y + Math.sin(aa) * d * 0.85,
            r * (0.06 + rng() * 0.13), 0, Math.PI * 2);
          fillWrapped(ctx, S, q, rgb(col, 0.85));
        }
        if (rng() < 0.45) {                            // drip run
          const drip = new Path2D();
          drip.moveTo(x + (rng() - 0.5) * r, y + r * 0.5);
          drip.lineTo(x + (rng() - 0.5) * r, y + r * (1.6 + rng() * 1.6));
          strokeWrapped(ctx, S, drip, rgb(col, 0.82), r * (0.1 + rng() * 0.08));
        }
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      paintStarsScheme();
      paintDaisyScheme();
      paintCircuitScheme();
      paintRacingScheme();
      paintPaintballScheme();
    };
    paintGraphicSchemes();

    const paintHistoricalSchemes = (): void => {
      const paintStarScheme = (): void => {
        if (scheme === 'star' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // INVASION STAR (camo r7 loadout set): olive field with ONE hero circled
      // white star + a plain satellite star + registration stencils — the
      // Normandy air-recognition language. patches = [white].
      const white = patches[0];
      const star = (x: number, y: number, s: number, rot: number, a: number, ring: boolean): void => {
        const q = new Path2D();
        for (let k2 = 0; k2 < 10; k2++) {
          const rr = k2 % 2 ? 0.19 : 0.5;
          const aa = -Math.PI / 2 + (k2 * Math.PI) / 5;
          if (k2) q.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          else q.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        }
        q.closePath();
        const p = new Path2D();
        p.addPath(q, new DOMMatrix().translate(x, y)
          .rotate((rot * 180) / Math.PI).scale(s, s));
        fillWrapped(ctx, S, p, rgb(white, a));
        if (ring) {                                    // broken invasion circle
          const c2 = new Path2D();
          c2.arc(x, y, s * 0.62, 0.25, Math.PI * 2 - 0.2);
          strokeWrapped(ctx, S, c2, rgb(white, a * 0.9), s * 0.055);
        }
      };
      star(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4),
        S * (0.3 + rng() * 0.06), (rng() - 0.5) * 0.4, 0.9, true);   // hero
      star(rng() * S, rng() * S, S * (0.12 + rng() * 0.04),
        (rng() - 0.5) * 0.5, 0.85, false);
      // camo r8 detailing: repainted-panel modulation (large soft tonal
      // rects), hard-edged OD touch-up patches, and a real registration
      // serial — the crafted-paint read, not decals on a flat coat.
      for (let i = 0; i < Math.round(5 * nK); i++) {
        const q = new Path2D();
        q.rect(rng() * S, rng() * S, S * (0.14 + rng() * 0.2), S * (0.1 + rng() * 0.16));
        ctx.filter = `blur(${Math.max(2, S * 0.006).toFixed(1)}px)`;
        fillWrapped(ctx, S, q, rgb(mix(base, [0, 0, 0], 0.16), 0.3 + rng() * 0.2));
        ctx.filter = 'none';
      }
      for (let i = 0; i < Math.round(4 * nK); i++) {   // hard touch-up patches
        const q = new Path2D();
        const w2 = S * (0.05 + rng() * 0.07), h2 = S * (0.04 + rng() * 0.05);
        q.rect(rng() * S, rng() * S, w2, h2);
        fillWrapped(ctx, S, q, rgb(mix(base, [20, 26, 14], 0.35), 0.55));
      }
      ctx.save();                                      // registration serial
      ctx.font = `700 ${Math.round(S * 0.028)}px 'ABC Monument Grotesk', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgb(white, 0.8);
      const serial = `U.S.A. 30${100000 + ((rng() * 899999) | 0)}`;
      const sx = rng() * S, sy = rng() * S;
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          ctx.save(); ctx.translate(dx, dy); ctx.fillText(serial, sx, sy); ctx.restore();
        }
      }
      ctx.restore();
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintIdentificationBandScheme = (): void => {
        if (scheme === 'idband' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // BERLIN ID BAND (camo r7 loadout set): the white air-recognition band
      // crossing the 4BO field, plus a big white tactical number stencil.
      // patches = [white].
      const white = patches[0];
      const y0 = S * (0.25 + rng() * 0.5);
      const band = new Path2D();
      band.moveTo(-S * 0.1, y0);
      band.lineTo(S * 1.1, y0);
      strokeWrapped(ctx, S, band, rgb(white, 0.88), S * 0.045);
      const x1 = S * (0.2 + rng() * 0.6);              // crossing vertical band
      const band2 = new Path2D();
      band2.moveTo(x1, -S * 0.1);
      band2.lineTo(x1, S * 1.1);
      strokeWrapped(ctx, S, band2, rgb(white, 0.82), S * 0.035);
      const num = String(100 + ((rng() * 899) | 0));   // tactical number
      ctx.save();
      ctx.font = `900 ${Math.round(S * 0.17)}px 'ABC Monument Grotesk', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgb(white, 0.9);
      const nx = S * (0.25 + rng() * 0.5), ny = (y0 + S * 0.55) % S;
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          ctx.save(); ctx.translate(dx, dy); ctx.fillText(num, nx, ny); ctx.restore();
        }
      }
      ctx.restore();
      // camo r8 detailing: the band is field paint, not a sticker — eat its
      // edges with base-tone dabs, add the diagonal assault slash and a
      // Guards star outline.
      for (let i = 0; i < Math.round(26 * nK); i++) {  // band wear
        const q = new Path2D();
        const bx = rng() * S;
        const edge = y0 + (rng() < 0.5 ? -1 : 1) * S * 0.0225;
        q.arc(bx, edge + (rng() - 0.5) * S * 0.008, S * (0.003 + rng() * 0.007), 0, Math.PI * 2);
        fillWrapped(ctx, S, q, rgb(base, 0.85));
      }
      const slash = new Path2D();                      // assault slash
      const sx2 = rng() * S, sy2 = rng() * S;
      slash.moveTo(sx2 - S * 0.07, sy2 + S * 0.1);
      slash.lineTo(sx2 + S * 0.07, sy2 - S * 0.1);
      strokeWrapped(ctx, S, slash, rgb(white, 0.85), S * 0.02);
      const gs = new Path2D();                         // Guards star outline
      const gx2 = rng() * S, gy2 = rng() * S, gr = S * (0.05 + rng() * 0.02);
      for (let k2 = 0; k2 < 10; k2++) {
        const rr = (k2 % 2 ? 0.42 : 1) * gr;
        const aa = -Math.PI / 2 + (k2 * Math.PI) / 5;
        if (k2) gs.lineTo(gx2 + Math.cos(aa) * rr, gy2 + Math.sin(aa) * rr);
        else gs.moveTo(gx2 + Math.cos(aa) * rr, gy2 + Math.sin(aa) * rr);
      }
      gs.closePath();
      strokeWrapped(ctx, S, gs, rgb(white, 0.85), gr * 0.14);
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintBrushWashScheme = (): void => {
        if (scheme === 'brushwash' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // ARDENNES BRUSH WASH (camo r8): whitewash slopped on with a wide
      // brush — long directional strokes, olive drab dragging through in
      // streaks, re-dabbed white over the worst gaps. Crisp stroke language,
      // zero soft blobs. patches = [show-through OD, grime].
      const od = patches[0];
      const grime = patches[1] || patches[0];
      const flow = (rng() - 0.5) * 0.3;                // near-horizontal brush
      const strokeAt = (col: Rgb, w: number, alpha: number, len: number): void => {
        const x0 = rng() * S, y0b = rng() * S;
        const a = flow + (rng() - 0.5) * 0.18;
        const bend = (rng() - 0.5) * w * 2;
        const path = new Path2D();
        path.moveTo(x0, y0b);
        path.quadraticCurveTo(
          x0 + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
          y0b + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
          x0 + Math.cos(a) * len, y0b + Math.sin(a) * len);
        strokeWrapped(ctx, S, path, rgb(col, alpha), w);
      };
      for (let i = 0; i < Math.round(26 * nK); i++) {  // OD dragging through
        strokeAt(od, S * (0.006 + rng() * 0.016), 0.2 + rng() * 0.3,
          S * (0.2 + rng() * 0.35));
      }
      for (let i = 0; i < Math.round(10 * nK); i++) {  // grime streaks
        strokeAt(grime, S * (0.004 + rng() * 0.01), 0.25 + rng() * 0.2,
          S * (0.15 + rng() * 0.25));
      }
      for (let i = 0; i < Math.round(12 * nK); i++) {  // fresh re-dabs
        strokeAt(mix(base, [255, 255, 255], 0.2), S * (0.02 + rng() * 0.03),
          0.4 + rng() * 0.25, S * (0.1 + rng() * 0.18));
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintUsmcScheme = (): void => {
        if (scheme === 'usmc' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // PACIFIC '45 (camo r8): USMC forest green under HARD-EDGED black wave
      // bands, a white hull number and coral-dust stipple — sharp painted
      // shapes, not blobs. patches = [black, coral dust, stencil white].
      const blk = patches[0];
      const dust = patches[1] || patches[0];
      const white = patches[2] || '#e3ded1';
      const flow = -0.4 + rng() * 0.25;
      const paintUsmcBands = (): void => {
        for (let i = 0; i < Math.round(5 * nK); i++) {
          const x0 = rng() * S, y0b = rng() * S;
          const len = S * (0.5 + rng() * 0.4);
          const w = S * wk * (0.045 + rng() * 0.045);
          const path = new Path2D();
          path.moveTo(x0, y0b);
          const seg = 4;
          for (let k2 = 1; k2 <= seg; k2++) {
            const t = k2 / seg;
            path.quadraticCurveTo(
              x0 + Math.cos(flow) * len * (t - 0.5 / seg) - Math.sin(flow) * w * (k2 % 2 ? 1.4 : -1.4),
              y0b + Math.sin(flow) * len * (t - 0.5 / seg) + Math.cos(flow) * w * (k2 % 2 ? 1.4 : -1.4),
              x0 + Math.cos(flow) * len * t, y0b + Math.sin(flow) * len * t);
          }
          strokeWrapped(ctx, S, path, rgb(blk, 0.92), w);
        }
      };
      paintUsmcBands();
      const paintUsmcDust = (): void => {
        for (let i = 0; i < Math.round(6 * nK); i++) {
          const cx2 = rng() * S, cy2 = rng() * S, cr = S * (0.05 + rng() * 0.09);
          const nd = 16 + ((rng() * 22) | 0);
          for (let k2 = 0; k2 < nd; k2++) {
            const aa = rng() * Math.PI * 2, d = Math.sqrt(rng()) * cr;
            const q = new Path2D();
            q.arc(cx2 + Math.cos(aa) * d, cy2 + Math.sin(aa) * d * 0.8,
              S * (0.0015 + rng() * 0.004), 0, Math.PI * 2);
            fillWrapped(ctx, S, q, rgb(dust, 0.4 + rng() * 0.25));
          }
        }
      };
      paintUsmcDust();
      const paintUsmcNumber = (): void => {
        ctx.save();
        const num2 = String(10 + ((rng() * 89) | 0));
        ctx.font = `900 ${Math.round(S * 0.13)}px 'ABC Monument Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgb(white, 0.88);
        const hx = rng() * S, hy = rng() * S;
        for (const dx of [-S, 0, S]) {
          for (const dy of [-S, 0, S]) {
            ctx.save(); ctx.translate(dx, dy); ctx.fillText(num2, hx, hy); ctx.restore();
          }
        }
        ctx.restore();
      };
      paintUsmcNumber();
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintErdlScheme = (): void => {
        if (scheme === 'erdl' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // ERDL LEAF (camo r8, the anti-blob flagship): interlocking HARD-EDGED
      // organic islands — dark-green masses, brown mids riding their borders,
      // thin black branch squiggles threading between. No blur anywhere; the
      // shapes are high-irregularity multi-lobe unions so edges wander like
      // the printed leaf pattern. patches = [dark green, brown, black].
      const dk = patches[0];
      const br = patches[1] || patches[0];
      const bk = patches[2] || '#262a24';
      const leafIsland = (x: number, y: number, r: number, lobes: number): Path2D => {
        const p = blobPath2D(rng, x, y, r, 11, 0.62);
        for (let k2 = 0; k2 < lobes; k2++) {
          const aa = rng() * Math.PI * 2;
          p.addPath(blobPath2D(rng, x + Math.cos(aa) * r * (0.8 + rng() * 0.5),
            y + Math.sin(aa) * r * (0.7 + rng() * 0.4),
            r * (0.45 + rng() * 0.4), 10, 0.6));
        }
        return p;
      };
      const dkIslands = [];
      for (let i = 0; i < Math.round(8 * nK); i++) {   // dark-green masses
        const x = rng() * S, y = rng() * S;
        const r = S * wk * (0.05 + rng() * 0.055);
        dkIslands.push([x, y, r]);
        fillWrapped(ctx, S, leafIsland(x, y, r, 2), rgb(dk, 0.95));
      }
      for (let i = 0; i < Math.round(7 * nK); i++) {   // brown mids ride borders
        const host = dkIslands[(rng() * dkIslands.length) | 0];
        const aa = rng() * Math.PI * 2;
        const x = host[0] + Math.cos(aa) * host[2] * (1 + rng() * 0.5);
        const y = host[1] + Math.sin(aa) * host[2] * (0.9 + rng() * 0.5);
        fillWrapped(ctx, S, leafIsland(x, y, S * wk * (0.03 + rng() * 0.035), 1),
          rgb(br, 0.93));
      }
      for (let i = 0; i < Math.round(11 * nK); i++) {  // black branch squiggles
        let x = rng() * S, y = rng() * S;
        let a = rng() * Math.PI * 2;
        const path = new Path2D();
        path.moveTo(x, y);
        const seg = 2 + ((rng() * 2) | 0);
        for (let k2 = 0; k2 < seg; k2++) {
          const len = S * (0.03 + rng() * 0.05);
          const mx = x + Math.cos(a) * len * 0.5 - Math.sin(a) * len * (rng() - 0.5) * 0.8;
          const my = y + Math.sin(a) * len * 0.5 + Math.cos(a) * len * (rng() - 0.5) * 0.8;
          x += Math.cos(a) * len; y += Math.sin(a) * len;
          path.quadraticCurveTo(mx, my, x, y);
          a += (rng() - 0.5) * 1.4;
        }
        strokeWrapped(ctx, S, path, rgb(bk, 0.92), S * (0.007 + rng() * 0.008));
        if (rng() < 0.5) {                             // leaf chip at the tip
          fillWrapped(ctx, S, blobPath2D(rng, x, y, S * (0.008 + rng() * 0.008), 7, 0.5),
            rgb(bk, 0.92));
        }
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      paintStarScheme();
      paintIdentificationBandScheme();
      paintBrushWashScheme();
      paintUsmcScheme();
      paintErdlScheme();
    };
    paintHistoricalSchemes();

    const paintExperimentalSchemes = (): void => {
      const paintMudWashScheme = (): void => {
        if (scheme === 'mudwash' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // RASPUTITSA (camo r8): mud as an EVENT, not blobs — directional
      // spatter clusters (dense core, sparse fringe), dragged smears along
      // one flow, crusted dry patches with dark rims, panel grime lines.
      // patches = [wet mud, dry mud, dark spatter].
      const wet = patches[0];
      const dry = patches[1] || patches[0];
      const dark = patches[2] || '#332a20';
      const flow = (rng() - 0.5) * 0.5;
      const paintDryMud = (): void => {
        for (let i = 0; i < Math.round(4 * nK); i++) {
          const x = rng() * S, y = rng() * S;
          const r = S * wk * (0.045 + rng() * 0.04);
          const p = blobPath2D(rng, x, y, r, 10, 0.5);
          fillWrapped(ctx, S, p, rgb(dry, 0.85));
          strokeWrapped(ctx, S, p, rgb(dark, 0.7), r * 0.09);
        }
      };
      paintDryMud();
      const paintMudSmears = (): void => {
        for (let i = 0; i < Math.round(9 * nK); i++) {
          const x0 = rng() * S, y0b = rng() * S;
          const a = flow + (rng() - 0.5) * 0.4;
          const len = S * (0.08 + rng() * 0.18);
          const w = S * (0.008 + rng() * 0.018);
          const path = new Path2D();
          path.moveTo(x0, y0b);
          path.quadraticCurveTo(
            x0 + Math.cos(a) * len * 0.5 - Math.sin(a) * w * 1.5,
            y0b + Math.sin(a) * len * 0.5 + Math.cos(a) * w * 1.5,
            x0 + Math.cos(a) * len, y0b + Math.sin(a) * len);
          strokeWrapped(ctx, S, path, rgb(wet, 0.35 + rng() * 0.3), w);
          if (rng() < 0.5) {
            const q = new Path2D();
            q.arc(x0 + Math.cos(a) * len * 1.12, y0b + Math.sin(a) * len * 1.12,
              w * (0.5 + rng() * 0.4), 0, Math.PI * 2);
            fillWrapped(ctx, S, q, rgb(wet, 0.6));
          }
        }
      };
      paintMudSmears();
      const paintMudSpatter = (): void => {
        for (let i = 0; i < Math.round(7 * nK); i++) {
          const cx2 = rng() * S, cy2 = rng() * S;
          const cr = S * (0.03 + rng() * 0.07);
          const nd = 14 + ((rng() * 20) | 0);
          for (let k2 = 0; k2 < nd; k2++) {
            const aa = rng() * Math.PI * 2, d = Math.sqrt(rng()) * cr;
            const q = new Path2D();
            q.arc(cx2 + Math.cos(aa) * d, cy2 + Math.sin(aa) * d * 0.85,
              S * (0.0015 + rng() * 0.005), 0, Math.PI * 2);
            fillWrapped(ctx, S, q, rgb(rng() < 0.3 ? dark : wet, 0.5 + rng() * 0.3));
          }
        }
      };
      paintMudSpatter();
      const paintMudPanelLines = (): void => {
        for (let i = 0; i < Math.round(6 * nK); i++) {
          const path = new Path2D();
          const x0 = rng() * S, y0b = rng() * S, len = S * (0.06 + rng() * 0.1);
          const vert = rng() < 0.5;
          path.moveTo(x0, y0b);
          path.lineTo(x0 + (vert ? 0 : len), y0b + (vert ? len : 0));
          strokeWrapped(ctx, S, path, rgb(dark, 0.4), S * 0.0035);
        }
      };
      paintMudPanelLines();
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintAmoebaScheme = (): void => {
        if (scheme === 'amoeba' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // Soviet WW2 amoeba/kumovka (camo r2 expansion): FEW very large rounded
      // masses over 4BO green — each a union of 2-3 overlapping soft blobs so
      // the silhouette flows with waists and branches (single stamps read as
      // leopard spots — the r7 morphology lesson), plus sparse medium
      // satellites and optional ochre accents. Near-hard brushed edge.
      // patches = [dark amoeba tone, optional ochre accent].
      const dark = patches[0];
      const ochre = patches[1] || null;
      const nBig = Math.max(3, Math.round(4 * nK));
      for (let i = 0; i < nBig; i++) {
        const x = rng() * S, y = rng() * S;
        const r = S * wk * (0.095 + rng() * 0.06);
        const p = blobPath2D(rng, x, y, r, 9, 0.4);
        const nL = 1 + ((rng() * 2) | 0);            // 1-2 extra lobes union in
        let lx = x, ly = y;
        for (let l = 0; l < nL; l++) {
          const a2 = rng() * Math.PI * 2;
          lx += Math.cos(a2) * r * 0.9;
          ly += Math.sin(a2) * r * 0.7;
          p.addPath(blobPath2D(rng, lx, ly, r * (0.6 + rng() * 0.4), 9, 0.4));
        }
        ctx.filter = `blur(${Math.max(1.2, S * 0.0009).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(dark, 0.92));
        ctx.filter = 'none';
      }
      for (let i = 0; i < Math.round(3 * nK); i++) { // medium satellites
        const r = S * wk * (0.045 + rng() * 0.04);
        const p = blobPath2D(rng, rng() * S, rng() * S, r, 9, 0.45);
        ctx.filter = `blur(${Math.max(1.2, S * 0.0009).toFixed(1)}px)`;
        fillWrapped(ctx, S, p, rgb(dark, 0.90));
        ctx.filter = 'none';
      }
      if (ochre) {
        for (let i = 0; i < Math.round(3 * nK); i++) {
          const r = S * wk * (0.028 + rng() * 0.028);
          const p = blobPath2D(rng, rng() * S, rng() * S, r, 8, 0.5);
          ctx.filter = `blur(${Math.max(1, S * 0.0008).toFixed(1)}px)`;
          fillWrapped(ctx, S, p, rgb(ochre, 0.85));
          ctx.filter = 'none';
        }
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintHexFieldScheme = (): void => {
        if (scheme === 'hexfield' && patches.length) {
      // ===================== CAMO PATTERN SECTION =====================
      // Modern experimental hex mesh (camo r2 expansion — Barracuda-net
      // language): a honeycomb cell field where ~55% of cells fill from two
      // tones and the rest let the base breathe, plus 2-3 broad soft dark
      // fields underneath so the mesh carries macro structure and never reads
      // as flat printed fabric (the digital r5 lesson). Cell pitch is
      // quantized so an INTEGER number of columns/rows fits the tile — the
      // hexes stretch a few % anisotropically, invisible at paint scale, and
      // the pattern wraps exactly (3x3 fillWrapped contract).
      const tones = [patches[0], patches[1] || patches[0]];
      const paintHexMacroFields = (): void => {
        for (let i = 0; i < 3; i++) {
          const x = rng() * S, y = rng() * S, r = S * (0.16 + rng() * 0.12);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgb(mix(base, tones[0], 0.55), 0.5));
          g.addColorStop(1, rgb(base, 0));
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      };
      paintHexMacroFields();
      const hexR0 = S * wk * 0.034 * (visual.digitalCellK || 1);
      let nCol = Math.max(6, Math.round(S / (hexR0 * 1.5)));
      if (nCol % 2) nCol++;                          // even count: the odd-column
      // stagger keeps alternating across the wrap seam (3x3 tile contract)
      const cw = S / nCol;                           // column pitch (= 1.5 hexR)
      const hexRx = cw / 1.5;
      const nRow = Math.max(6, Math.round(S / (hexR0 * Math.sqrt(3))));
      const rh = S / nRow;                           // row pitch (= 2 * hw)
      const hw = rh / 2;
      const paintHexCell = (gx: number, gy: number): void => {
        const value = rng();
        if (value < 0.45) return;
        const x = gx * cw;
        const y = gy * rh + (gx % 2 ? hw : 0);
        const col = value < 0.75 ? tones[0] : tones[1];
        const path = new Path2D();
        for (let k2 = 0; k2 < 6; k2++) {
          const angle = (k2 / 6) * Math.PI * 2;
          const px2 = x + Math.cos(angle) * hexRx * 0.94;
          const py2 = y + Math.sin(angle) * hw * 1.085;
          if (k2 === 0) path.moveTo(px2, py2); else path.lineTo(px2, py2);
        }
        path.closePath();
        fillWrapped(ctx, S, path, rgb(col, 0.9));
      };
      const paintHexLattice = (): void => {
        for (let gy = 0; gy < nRow; gy++) {
          for (let gx = 0; gx < nCol; gx++) {
            paintHexCell(gx, gy);
          }
        }
      };
      paintHexLattice();
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      const paintSolidScheme = (): void => {
        if (scheme === 'solid') {
      // ===================== CAMO PATTERN SECTION =====================
      // camo_spotting r3 (critic: t90m factory "single flat parade green ...
      // reads as clay render"): monotone factory coats get an explicit
      // weathered-panel pass — patterned schemes carry tonal variety in their
      // patches, but a solid coat only had the (weather-tone-dependent) soft
      // lifts above, which vanish when the palette authors weather ~= base.
      // Sun-fade patches toward a fixed dusty drift of the weather tone,
      // darker oil/soot pooling, and fine dust-run streaks keep the paint
      // reading as a maintained field vehicle, never parade clay. All alphas
      // stay low so the coat remains clean at distance.
      const solidWeatheringIntensity = Math.max(0,
        Math.min(1, visual.solidWeatheringIntensity ?? 1));
      const fade = mix(weather, [172, 162, 124], 0.16);
      for (let i = 0; i < 26; i++) {                 // sun-fade / repaint panels
        const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.13);
        const tone = i % 3 === 2 ? scale3(base, 0.80) : fade;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgb(tone,
          (0.15 + rng() * 0.13) * solidWeatheringIntensity));
        g.addColorStop(1, rgb(tone, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 80; i++) {                 // dust runs down the plates
        const x0 = rng() * S, y0 = rng() * S, len = S * (0.04 + rng() * 0.10);
        const tone = rng() < 0.4 ? scale3(base, 0.76) : mix(base, [150, 140, 106], 0.42);
        const path = new Path2D();
        path.moveTo(x0, y0);
        path.lineTo(x0 + (rng() - 0.5) * 7, y0 + len);
        strokeWrapped(ctx, S, path, rgb(tone,
          (0.07 + rng() * 0.09) * solidWeatheringIntensity), 1.5 + rng() * 3.5);
      }
      // ===================== END CAMO PATTERN SECTION =================
        }
      };
      paintMudWashScheme();
      paintAmoebaScheme();
      paintHexFieldScheme();
      paintSolidScheme();
    };
    paintExperimentalSchemes();

    // Zimmerit is a common post-pattern pass; it is independent of the scheme.
    const paintZimmeritAlbedo = (): void => {
      if (!visual.zimmerit) return;
      const pitch = Math.max(2, (S / 900) | 0);
      for (let y = 0; y < S; y += pitch) {
        ctx.fillStyle = `rgba(0,0,0,${0.028 + 0.022 * rng()})`;
        ctx.fillRect(0, y, S, 1);
      }
      let x = 0;
      while (x < S) {
        x += (S / 22) * (0.7 + rng() * 0.8);
        ctx.fillStyle = 'rgba(0,0,0,0.035)';
        ctx.fillRect(x, 0, 1.2, S);
      }
    };
    paintZimmeritAlbedo();

    // r10: grain trimmed 0.075 -> 0.055 — part of the "flour-dust white
    // speckle" read on top plates under the warm garage key.
    // tank_models r5: 0.055 -> 0.034 — at pedestal range the survivors still
    // read as rendering noise, not paint. Weathering now leans on the darker
    // low-frequency grime passes below instead of per-pixel salt.
    applyGrain(ctx, S, seed ^ 0x51ab, 0.034);

    // ---- plate feature overlay (matches height/roughness maps) --------------
    const px = (v: number): number => v * S;
    // panel lines: dark recess + light catch-edge below
    ctx.lineCap = 'butt';
    const lw = Math.max(2, S / 800);
    const paintPanelLines = (): void => {
      for (const line of feats.hLines) {
        const y = px(line.p);
        for (const [a, b] of lineSegs(line)) {
          ctx.fillStyle = 'rgba(10,10,8,0.24)'; ctx.fillRect(px(a), y, px(b - a), lw);
          ctx.fillStyle = 'rgba(255,250,235,0.07)'; ctx.fillRect(px(a), y + lw, px(b - a), 1.5);
        }
      }
      for (const line of feats.vLines) {
        const x = px(line.p);
        for (const [a, b] of lineSegs(line)) {
          ctx.fillStyle = 'rgba(10,10,8,0.24)'; ctx.fillRect(x, px(a), lw, px(b - a));
          ctx.fillStyle = 'rgba(255,250,235,0.07)'; ctx.fillRect(x + lw, px(a), 1.5, px(b - a));
        }
      }
    };
    paintPanelLines();
    // weld beads: dashed light/dark stitch straddling the line
    const weldDash = (horiz: boolean, l: PlateLine): void => {
      const p = l.p;
      const step = S / 160;
      for (let t = 0; t < S; t += step) {
        if (inGap(l, t / S)) continue;
        const jit = (rng() - 0.5) * step * 0.3;
        // r10: stitch highlight halved — the bright dashes read as white
        // speckle rows on roof plates ("flour dust" critique).
        const a = 0.09 + rng() * 0.09;
        ctx.fillStyle = `rgba(214,206,188,${a})`;
        if (horiz) ctx.fillRect(t + jit, px(p) - S / 700, step * 0.55, S / 350);
        else ctx.fillRect(px(p) - S / 700, t + jit, S / 350, step * 0.55);
        ctx.fillStyle = `rgba(20,18,14,${a * 0.8})`;
        if (horiz) ctx.fillRect(t + jit + step * 0.3, px(p) + S / 700, step * 0.3, 1.5);
        else ctx.fillRect(px(p) + S / 700, t + jit + step * 0.3, 1.5, step * 0.3);
      }
    };
    const paintWelds = (): void => {
      for (const line of feats.hLines) if (line.weld) weldDash(true, line);
      for (const line of feats.vLines) if (line.weld) weldDash(false, line);
    };
    paintWelds();
    // bolts along lines: dome highlight + drop shadow
    const bolt = (x: number, y: number, r: number): void => {
      ctx.fillStyle = 'rgba(8,8,6,0.5)';
      ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.4, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(216,208,186,0.20)';   // r10: dome glint dimmed (speckle)
      ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.28, r * 0.62, 0, Math.PI * 2); ctx.fill();
    };
    const boltR = Math.max(3, S / 340);
    // r10: modern MBTs are welded composite — full-length rivet/bolt rows made
    // the T-90M read "riveted flat panels" (critic). Rows are WW2-only; hatch
    // bolt RINGS stay for everyone.
    const lineBolts = !visual.modernWelds;
    const paintHorizontalLineBolts = (): void => {
      for (const line of feats.hLines) if (line.bolts && lineBolts) {
        const step = S / 26;
        for (let t = step / 2; t < S; t += step) {
          if (!inGap(line, t / S)) bolt(t, px(line.p) + boltR * 2.4, boltR);
        }
      }
    };
    const paintVerticalLineBolts = (): void => {
      for (const line of feats.vLines) if (line.bolts && lineBolts) {
        const step = S / 26;
        for (let t = step / 2; t < S; t += step) {
          if (!inGap(line, t / S)) bolt(px(line.p) + boltR * 2.4, t, boltR);
        }
      }
    };
    const paintRingBolts = (): void => {
      for (const ring of feats.rings) {
        for (let k = 0; k < ring.n; k++) {
          const angle = (k / ring.n) * Math.PI * 2;
          bolt(
            px(ring.x) + Math.cos(angle) * px(ring.r),
            px(ring.y) + Math.sin(angle) * px(ring.r),
            boltR * 0.9,
          );
        }
      }
    };
    paintHorizontalLineBolts();
    paintVerticalLineBolts();
    paintRingBolts();

    const paintGrimeBlotches = (): void => {
      for (let i = 0; i < 16; i++) {
        const x = rng() * S, y = rng() * S, r = S * (0.05 + rng() * 0.12);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(18,16,12,0.13)');
        g.addColorStop(1, 'rgba(18,16,12,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    };
    paintGrimeBlotches();
    // dust + dark oil streaks (canvas +y == world down on side plates).
    // Light dust streaks stay near the base hue and low alpha: 240 strokes of
    // brightened weather tone at 0.13 glazed a pastel film over the pattern —
    // desert/summer flanks bleached toward one flat tint (r7 wash critique).
    const dustCol = rgb(scale3(mix(weather, base, 0.4), 1.14), 0.09);
    const paintDustAndOilStreaks = (): void => {
      for (let i = 0; i < 240; i++) {
        const x = rng() * S, y = rng() * S, len = S * (0.03 + rng() * 0.12);
        ctx.strokeStyle = rng() < 0.45 ? 'rgba(30,26,20,0.13)' : dustCol;
        ctx.lineWidth = 1 + rng() * 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 8, y + len); ctx.stroke();
      }
    };
    paintDustAndOilStreaks();
    // paint chips — dark pit with a worn-metal glint above (from plan).
    // r10 ("flour dust" critique): glints tinted toward dust ochre keyed to the
    // base color and cut ~50% — the old cool near-white pips read as a uniform
    // white powder stipple across every top plate under the garage key.
    const glintCol = rgb(mix(scale3(base, 1.35), [168, 156, 128], 0.55), 0.24);
    const paintChips = (): void => {
      for (const chip of feats.chips) {
        const x = px(chip.x), y = px(chip.y), radius = Math.max(0.8, px(chip.r));
        ctx.fillStyle = chip.metal ? 'rgba(96,92,82,0.55)' : 'rgba(25,22,18,0.55)';
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        if (chip.metal) {
          ctx.fillStyle = glintCol;
          ctx.fillRect(x - radius * 0.55, y - radius - 1.2, radius * 1.1, 1.8);
        }
      }
    };
    paintChips();
    // rust weeps from plan sources + below some bolts.
    const weep = (x: number, y: number, len: number, w: number): void => {
      const g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, 'rgba(122,64,28,0.42)');
      g.addColorStop(1, 'rgba(122,64,28,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, Math.max(1.4, w), len);
    };
    const paintRustWeeps = (): void => {
      for (const streak of feats.streaks) {
        weep(px(streak.x), px(streak.y), px(streak.len), px(streak.w));
      }
      for (const ring of feats.rings) {
        if (rng() < 0.6) {
          weep(
            px(ring.x) + px(ring.r) * 0.6,
            px(ring.y) + px(ring.r),
            S * (0.02 + rng() * 0.04),
            2,
          );
        }
      }
    };
    paintRustWeeps();
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // Detail heightfield (1024) — the source for the normal map. Mid-gray base,
  // casting noise, plate offsets, panel-line grooves, weld beads, bolt domes,
  // chips, optional zimmerit ridging.
  // ---------------------------------------------------------------------------
  function paintSteelHeightUndulation(
    ctx: MaterialCanvasContext, size: number, rng: Rng,
  ): void {
    for (let index = 0; index < 200; index++) {
      const x = rng() * size;
      const y = rng() * size;
      const radius = size * (0.02 + rng() * 0.09);
      const raised = rng() < 0.5;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(
        0,
        raised ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.085)',
      );
      gradient.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  function paintPanelHeightOffsets(
    ctx: MaterialCanvasContext,
    size: number,
    features: PlateFeatures,
    rng: Rng,
  ): void {
    const horizontal = [0, ...features.hLines.map((line) => line.p), 1]
      .sort((a, b) => a - b);
    const vertical = [0, ...features.vLines.map((line) => line.p), 1]
      .sort((a, b) => a - b);
    for (let y = 0; y < horizontal.length - 1; y++) {
      for (let x = 0; x < vertical.length - 1; x++) {
        const offset = (rng() - 0.5) * 12;
        ctx.fillStyle = offset > 0
          ? `rgba(255,255,255,${offset / 255})`
          : `rgba(0,0,0,${-offset / 255})`;
        ctx.fillRect(
          vertical[x] * size,
          horizontal[y] * size,
          (vertical[x + 1] - vertical[x]) * size,
          (horizontal[y + 1] - horizontal[y]) * size,
        );
      }
    }
  }

  function paintZimmeritHeight(
    ctx: MaterialCanvasContext, size: number, rng: Rng,
  ): void {
    const pitch = Math.max(2, (size / 450) | 0);
    const columns: Array<[number, number, number]> = [];
    let x = 0;
    while (x < size) {
      const width = (size / 22) * (0.7 + rng() * 0.8);
      columns.push([x, Math.min(x + width, size), (rng() * pitch) | 0]);
      x += width;
    }
    for (const [start, end, phase] of columns) {
      for (let y = -pitch; y < size; y += pitch) {
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.fillRect(start, y + phase, end - start, Math.max(1, pitch >> 1));
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(
          start, y + phase + (pitch >> 1), end - start, Math.max(1, pitch >> 1),
        );
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(end - 1, 0, 1.5, size);
    }
    for (let index = 0; index < 10; index++) {
      ctx.fillStyle = 'rgba(110,110,110,0.9)';
      ctx.fillRect(
        rng() * size,
        rng() * size,
        size * (0.015 + rng() * 0.035),
        size * (0.012 + rng() * 0.02),
      );
    }
  }

  function paintHeightGroove(
    ctx: MaterialCanvasContext,
    size: number,
    horizontal: boolean,
    line: PlateLine,
  ): void {
    const width = Math.max(2, size / 480);
    const position = line.p * size;
    for (const [start, end] of lineSegs(line)) {
      const segmentStart = start * size;
      const segmentLength = (end - start) * size;
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      if (horizontal) ctx.fillRect(segmentStart, position, segmentLength, width);
      else ctx.fillRect(position, segmentStart, width, segmentLength);
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      if (horizontal) {
        ctx.fillRect(segmentStart, position - width, segmentLength, width);
        ctx.fillRect(segmentStart, position + width, segmentLength, width);
      } else {
        ctx.fillRect(position - width, segmentStart, width, segmentLength);
        ctx.fillRect(position + width, segmentStart, width, segmentLength);
      }
    }
  }

  function paintHeightGrooves(
    ctx: MaterialCanvasContext, size: number, features: PlateFeatures,
  ): void {
    for (const line of features.hLines) paintHeightGroove(ctx, size, true, line);
    for (const line of features.vLines) paintHeightGroove(ctx, size, false, line);
  }

  function paintHeightWeldLine(
    ctx: MaterialCanvasContext,
    size: number,
    horizontal: boolean,
    line: PlateLine,
    rng: Rng,
  ): void {
    const step = size / 160;
    const radius = Math.max(1.6, size / 620);
    for (let distance = 0; distance < size; distance += step) {
      if (inGap(line, distance / size)) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.30 + rng() * 0.25})`;
      ctx.beginPath();
      const jittered = distance + (rng() - 0.5) * step * 0.4;
      if (horizontal) ctx.arc(jittered, line.p * size, radius, 0, Math.PI * 2);
      else ctx.arc(line.p * size, jittered, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paintHeightWelds(
    ctx: MaterialCanvasContext,
    size: number,
    features: PlateFeatures,
    rng: Rng,
  ): void {
    for (const line of features.hLines) {
      if (line.weld) paintHeightWeldLine(ctx, size, true, line, rng);
    }
    for (const line of features.vLines) {
      if (line.weld) paintHeightWeldLine(ctx, size, false, line, rng);
    }
  }

  function paintHeightBolt(
    ctx: MaterialCanvasContext, x: number, y: number, radius: number,
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintHeightLineBolts(
    ctx: MaterialCanvasContext,
    size: number,
    horizontal: boolean,
    line: PlateLine,
    radius: number,
  ): void {
    const step = size / 26;
    for (let distance = step / 2; distance < size; distance += step) {
      if (inGap(line, distance / size)) continue;
      const offset = line.p * size + radius * 2.4;
      if (horizontal) paintHeightBolt(ctx, distance, offset, radius);
      else paintHeightBolt(ctx, offset, distance, radius);
    }
  }

  function paintHeightBolts(
    ctx: MaterialCanvasContext,
    size: number,
    features: PlateFeatures,
    modernWelds: boolean,
  ): void {
    const radius = Math.max(2, size / 340);
    if (!modernWelds) {
      for (const line of features.hLines) {
        if (line.bolts) paintHeightLineBolts(ctx, size, true, line, radius);
      }
      for (const line of features.vLines) {
        if (line.bolts) paintHeightLineBolts(ctx, size, false, line, radius);
      }
    }
    for (const ring of features.rings) {
      for (let index = 0; index < ring.n; index++) {
        const angle = (index / ring.n) * Math.PI * 2;
        paintHeightBolt(
          ctx,
          (ring.x + Math.cos(angle) * ring.r) * size,
          (ring.y + Math.sin(angle) * ring.r) * size,
          radius,
        );
      }
    }
  }

  function paintHeightChips(
    ctx: MaterialCanvasContext, size: number, features: PlateFeatures,
  ): void {
    for (const chip of features.chips) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(
        chip.x * size,
        chip.y * size,
        Math.max(0.8, chip.r * size * 0.8),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  function paintHeight(
    canvas: C,
    visual: MaterialVisual,
    rng: Rng,
    feats: PlateFeatures,
    seed: number,
  ): C {
    const ctx = canvas2d(canvas);
    const S = canvas.width;
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, S, S);
    paintSteelHeightUndulation(ctx, S, rng);
    paintPanelHeightOffsets(ctx, S, feats, rng);
    if (visual.zimmerit) paintZimmeritHeight(ctx, S, rng);
    paintHeightGrooves(ctx, S, feats);
    paintHeightWelds(ctx, S, feats, rng);
    paintHeightBolts(ctx, S, feats, visual.modernWelds === true);
    paintHeightChips(ctx, S, feats);
    applyGrain(ctx, S, seed ^ 0x77e1, 0.05);
    return canvas;
  }

  /** Fill an exact wrapped Sobel row range without per-pixel helper calls or
   * modulo. Exported for byte-parity regression coverage. */
  // Sobel the heightfield into a tangent-space normal map (wrapping edges).
  function* heightToNormalSteps(hCanvas: C, strength = 1.6): Generator<void, C, void> {
    const S = hCanvas.width;
    const src = canvas2d(hCanvas).getImageData(0, 0, S, S).data;
    const out = makeCanvas(S, S);
    const octx = canvas2d(out);
    const img = octx.createImageData(S, S);
    const d = img.data;
    // A 1024-row Sobel pass was one several-hundred-millisecond task during
    // battle/garage entry. Async prebakes yield after the same 32-row work
    // units; the synchronous authoring path drains the identical generator.
    for (let y = 0; y < S; y += 32) {
      fillHeightNormalRows(src, d, S, strength, y, Math.min(S, y + 32));
      if (y + 32 < S) yield;
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  // Roughness map (1024) sharing the same feature plan: matte paint base, rough
  // dust patches, smooth bare-metal chips/scuffs, slightly rough recesses.
  // camo_spotting r4: base 0.78 -> 0.84 — the multiplying map put effective
  // hull GGX at ~0.61 mean, and up-tilted plates at the sun↔camera mirror
  // angle rendered a pale specular film that washed the camo (t34 glacis /
  // m1a2 chamfer cream). Field paint over dust is duller than 0.78.
  function paintRoughness(canvas: C, rng: Rng, feats: PlateFeatures, base = 0.84): C {
    const ctx = canvas2d(canvas);
    const S = canvas.width;
    const v = (base * 255) | 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const g = ((base + (rng() - 0.5) * 0.2) * 255) | 0;
      ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
      const r = 2 + rng() * 30;
      ctx.beginPath(); ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2); ctx.fill();
    }
    // dust patches: rougher
    for (let i = 0; i < 60; i++) {
      const x = rng() * S, y = rng() * S, r = S * (0.02 + rng() * 0.07);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(240,240,240,0.35)');
      g.addColorStop(1, 'rgba(240,240,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const px = (u: number): number => u * S;
    // recess lines slightly rougher (dust settles)
    ctx.fillStyle = 'rgba(235,235,235,0.5)';
    for (const l of feats.hLines) ctx.fillRect(0, px(l.p) - 1, S, Math.max(2, S / 480) + 2);
    for (const l of feats.vLines) ctx.fillRect(px(l.p) - 1, 0, Math.max(2, S / 480) + 2, S);
    // bare-metal chips + scuffs: smooth (dark)
    // camo_spotting r4: floor 0.30 -> 0.42 — with the multiplying hull base the
    // old dips fired sparkle pockets under the garage key.
    for (const c of feats.chips) {
      if (!c.metal) continue;
      const g = ((0.42 + rng() * 0.12) * 255) | 0;
      ctx.fillStyle = `rgba(${g},${g},${g},0.85)`;
      ctx.beginPath(); ctx.arc(px(c.x), px(c.y), Math.max(1, px(c.r)), 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 200; i++) {
      const g = ((0.34 + rng() * 0.15) * 255) | 0;
      ctx.fillStyle = `rgba(${g},${g},${g},0.6)`;
      ctx.fillRect(rng() * S, rng() * S, 2 + rng() * 9, 1 + rng() * 2.5);
    }
    return canvas;
  }

  /**
   * Apply patch-tone roughness to full-resolution pixels. Classification is
   * half-resolution, so its two horizontal output pixels share the same tone
   * and boundary decision. Process that pair together while retaining the
   * original row-major LCG sequence and arithmetic; output stays byte-exact.
   */
  // ===================== CAMO PATTERN SECTION =====================
  // camo_spotting r4: pattern-keyed roughness modulation. Every pattern was an
  // ALBEDO-only repaint — one constant-response roughness field under all
  // patches, so at garage range camo read as printed vinyl, and big flat plates
  // at the sun↔camera mirror angle fired ONE uniform specular sheet that washed
  // the pattern to cream (m1a2 turret chamfer; t34 glacis — proven by live
  // spec-kill A/B: with roughness 1 / env 0 the "cream rectangle" is fully
  // patterned paint). Field-applied paint batches differ: each pattern TONE now
  // carries a deterministic roughness offset (±0.045), patch BOUNDARIES get a
  // rougher overspray rim (+0.035 — the edge-response hint), plus fine speckle.
  // Patch classification runs at half res and is index-sampled by the full-res
  // add so the whole pass stays ~10-20 ms (boot-path budget).
  function paintPatchRoughness(
    roughCanvas: C,
    camoCanvas: C,
    visual: MaterialVisual,
  ): void {
    const S = roughCanvas.width;
    const tones: Rgb[] = [];
    for (const hx of [visual.base, visual.weather, ...(visual.patches || [])]) {
      if (!hx) continue;
      const c = hexToRgb(hx);
      if (!tones.some((t) => t[0] === c[0] && t[1] === c[1] && t[2] === c[2])) tones.push(c);
    }
    if (tones.length < 2) return;            // monotone coat: keep base response
    // per-tone deterministic offset in ±0.045 (keyed to the tone itself so the
    // same paint always answers light the same way on every vehicle)
    const offs = tones.map((c) => ((((c[0] * 3 + c[1] * 5 + c[2] * 7) % 97) / 96) * 2 - 1) * 0.045);
    const Sd = S >> 1;                       // half-res classification grid
    const down = makeCanvas(Sd, Sd);
    const dctx = canvas2d(down, { willReadFrequently: true });
    dctx.drawImage(camoCanvas, 0, 0, Sd, Sd);
    const cd = dctx.getImageData(0, 0, Sd, Sd).data;
    const cls = new Uint8Array(Sd * Sd);
    for (let p = 0, n = Sd * Sd; p < n; p++) {
      const r = cd[p * 4], g = cd[p * 4 + 1], b = cd[p * 4 + 2];
      let best = 0, bd = Infinity;
      for (let t = 0; t < tones.length; t++) {
        const dr = r - tones[t][0], dg = g - tones[t][1], db = b - tones[t][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = t; }
      }
      cls[p] = best;
    }
    const rctx = canvas2d(roughCanvas, { willReadFrequently: true });
    const rimg = rctx.getImageData(0, 0, S, S);
    const rd = rimg.data;
    applyPatchRoughnessPixels(rd, S, cls, Sd, offs);
    rctx.putImageData(rimg, 0, 0);
  }
  // ===================== END CAMO PATTERN SECTION =================

  function exposureTrim(canvas: C, k = 0.86): void {
    const ctx = canvas2d(canvas);
    ctx.globalCompositeOperation = 'multiply';
    const v = Math.round(k * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  function* bakeBaseSteps(
    entry: MaterialBasePaintEntry<C>,
    request: MaterialBasePaintRequest,
  ): Generator<void, void, void> {
    const { visual: vis, seed, dimensions: sz } = request;
    const rng = mulberry32(seed);
    entry.feats = genPlateFeatures(rng);
    // tank_models r5 ("hull sides show a grid of panel seams on what are single
    // plates"): big single-plate hulls (Tiger) opt out of the tiled panel-join
    // grid entirely — rings/chips/streak weathering stay, the repeating
    // hLine/vLine lattice goes.
    if (!request.plateLines) {
      entry.feats.hLines = [];
      entry.feats.vLines = [];
    }
    entry.camoCanvas.width = entry.camoCanvas.height = sz.albedo;
    paintCamo(entry.camoCanvas, vis, rng, entry.feats, seed);
    yield;
    exposureTrim(entry.camoCanvas);
    yield;
    const heightCanvas = paintHeight(makeCanvas(sz.map, sz.map), vis, rng, entry.feats, seed);
    yield;
    const normalSrc = yield* heightToNormalSteps(heightCanvas, vis.zimmerit ? 2.6 : 2.6);
    yield;
    entry.normalCanvas.width = entry.normalCanvas.height = sz.map;
    canvas2d(entry.normalCanvas).drawImage(normalSrc, 0, 0, sz.map, sz.map);
    entry.roughCanvas.width = entry.roughCanvas.height = sz.map;
    paintRoughness(entry.roughCanvas, rng, entry.feats);
    yield;
  }

  return {
    makeCanvas,
    canvas2d,
    mulberry32,
    hexToRgb,
    rgb,
    mix,
    scale3,
    luma,
    genPlateFeatures,
    paintCamo,
    paintHeight,
    heightToNormalSteps,
    paintRoughness,
    paintPatchRoughness,
    exposureTrim,
    bakeBaseSteps,
  };
}
