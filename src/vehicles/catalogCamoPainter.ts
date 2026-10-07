// Art direction for field, factory and graphic finishes. Fleet recipes keep
// their palettes and morphology while sharing these bounded baked artists:
// no extra GPU textures, geometry, shaders, or work during a rendered frame.
import type { MaterialCanvas, MaterialCanvasContext, MaterialVisual } from './materialPainter.ts';

export const CATALOG_CAMO_ART_IDS = [
  'summer', 'desert', 'winter', 'urban', 'digital', 'merdc', 'tropic',
  'ambushdot', 'splinter', 'pinkdesert', 'autumn', 'urbanblock', 'washworn',
  'naval', 'dazzle', 'flecktarn', 'amoeba', 'dpm', 'tigerstripe', 'm90',
  'chocchip', 'digitaldesert', 'merdcwinter', 'winterbands', 'berlin',
  'oakleaf', 'hexfield', 'midnight', 'ducky', 'suits', 'flames',
  'leopardprint', 'bolt', 'stars', 'daisy', 'circuit', 'racing', 'paintball',
  'normandy44', 'berlin45', 'ardennes44', 'pacific45', 'jungleops', 'rasputitsa',
  'mono', 'carbon', 'prism',
] as const;
export type CatalogCamoArtId = typeof CATALOG_CAMO_ART_IDS[number] | 'enamel' | 'service-stripes' | 'caunter';
const ids = new Set<string>(CATALOG_CAMO_ART_IDS);
export function catalogCamoArtId(id: string): CatalogCamoArtId | undefined {
  return ids.has(id) ? id as CatalogCamoArtId : undefined;
}

/** Keep the source scheme's construction language; never replace fleet palettes. */
export function fleetCamoArtId(scheme = 'solid'): CatalogCamoArtId | undefined {
  const families: Readonly<Record<string, CatalogCamoArtId>> = {
    solid: 'enamel', nato: 'summer', stripes: 'service-stripes', digital: 'digital',
    desert: 'desert', splinter: 'm90', fleck: 'flecktarn', blotch: 'amoeba',
    amoeba: 'amoeba', chip6: 'chocchip', caunter: 'caunter', hexfield: 'hexfield',
    brush: 'dpm', 'russian-digital': 'digital', woodland: 'summer',
  };
  return families[scheme];
}

type Context = MaterialCanvasContext;
type Rng = () => number;
type Point = [number, number];
type Color = [number, number, number];
const TAU = Math.PI * 2;
const parse = (hex: string): Color => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Color;
const wrap = (n: number, size: number): number => ((n % size) + size) % size;
const smooth = (v: number): number => v * v * (3 - 2 * v);

// Periodic value noise. Only the small lattice is randomized; sampling and
// colour selection use no RNG so HIGH/LOW and picker crops share one pattern.
function noise(rng: Rng, size: number): (x: number, y: number) => number {
  const values = Float32Array.from({ length: size * size }, rng);
  return (x, y) => {
    x = (x - Math.floor(x)) * size; y = (y - Math.floor(y)) * size;
    const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
    const nx = (ix + 1) % size, ny = (iy + 1) % size;
    const a = values[iy * size + ix] * (1 - tx) + values[iy * size + nx] * tx;
    const b = values[ny * size + ix] * (1 - tx) + values[ny * size + nx] * tx;
    return a * (1 - ty) + b * ty;
  };
}

// A raster cell's hash in 0..1. It draws nothing from the RNG stream and is tile-periodic because callers pass wrapped
// cell indices.
function cellHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * 2026-10-07 (tank-accessories lane, round 3; blind critics: the T-90M digital "shows jagged stair-stepping along its
 * edges", the Oplot "a large black camo blob with uniform stair-stepped edges", "blown-up low-resolution images"). The
 * digital fields are smooth macro blobs thresholded on the pixel raster, so every boundary traced a smooth curve in
 * uniform one-pixel stairs: exactly how an upscaled low-resolution mask reads. Digital camouflage is drawn in pixel
 * clusters, and its boundaries break into teeth, notches and stray pixels a cluster or two deep. Each raster pixel's
 * field moves by a per-pixel hash and a per-two-pixel-block hash, scaled by the field's own change per pixel there, so
 * every boundary wanders by up to about two pixels in clusters whatever the macro gradient. The caller thresholds after
 * this, so each tone keeps its coverage.
 */
function fragmentPixelEdges(field: Float32Array, n: number, seed: number): void {
  const source = field.slice();
  for (let y = 0; y < n; y++) {
    const row = y * n, up = ((y + n - 1) % n) * n, down = ((y + 1) % n) * n;
    for (let x = 0; x < n; x++) {
      const left = (x + n - 1) % n, right = (x + 1) % n;
      const change = (Math.abs(source[row + right] - source[row + left]) + Math.abs(source[down + x] - source[up + x])) * .5;
      const jitter = 1.5 * (cellHash(x, y, seed) - .5) + 2.4 * (cellHash(x >> 1, y >> 1, seed ^ 0x5bd1e995) - .5);
      field[row + x] = source[row + x] + change * jitter;
    }
  }
}

/**
 * 2026-10-07 (lead, T-90M rear plate: a large dark digital cluster between the drum brackets read as "a flat black
 * unshaded void ... the rack frames a hole"). The digital schemes' darkest tones were near-black (#171d1a to #23261e,
 * sRGB luma 27-40), which renders as an unshaded hole in shadow. Russian and Chinese digital vehicle patterns use a
 * very dark green or brown, not black: a pixel tone under DIGITAL_TONE_LUMA_FLOOR is lifted to it along a dark olive,
 * so a near-black tone keeps its own cast and gains a little olive.
 */
export const DIGITAL_TONE_LUMA_FLOOR = 54;
const OLIVE_LIFT: Color = [1, 1.08, .82];
const lumaOf = (c: Color): number => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
export function liftDigitalTone(color: Color): Color {
  const short = DIGITAL_TONE_LUMA_FLOOR - lumaOf(color);
  if (short <= 0) return color;
  const k = short / lumaOf(OLIVE_LIFT);
  return color.map((v, ch) => Math.min(255, v + OLIVE_LIFT[ch] * k)) as Color;
}

/**
 * 2026-10-07: the pixel raster drawn onto the tile by exact box coverage. The cells are crisp squares whose edges sit at
 * their true positions: a texel a cell edge crosses blends the two cells by area (one texel), every other texel is its
 * cell's colour. Nearest-neighbour scaling snapped the 25.6-texel cells (2048 Garage bake, 80 cells) to alternating
 * 25- and 26-texel widths with hard aliased edges. A tile smaller than the raster (a swatch) averages its cells.
 */
function paintPixels(ctx: Context, size: number, n: number, cells: Uint8ClampedArray): void {
  const scale = n / size;
  const first = new Int32Array(size + 1), cell: number[] = [], weight: number[] = [];
  for (let at = 0; at < size; at++) {
    const a = at * scale, b = (at + 1) * scale;
    first[at] = cell.length;
    for (let c = Math.floor(a); c < b; c++) {
      const w = (Math.min(b, c + 1) - Math.max(a, c)) / scale;
      if (w > 1e-6) { cell.push(wrap(c, n)); weight.push(w); }
    }
  }
  first[size] = cell.length;
  const out = ctx.createImageData(size, size), data = out.data;
  for (let Y = 0; Y < size; Y++) {
    const y0 = first[Y], y1 = first[Y + 1];
    for (let X = 0; X < size; X++) {
      const x0 = first[X], x1 = first[X + 1], at = (Y * size + X) * 4;
      if (y1 - y0 === 1 && x1 - x0 === 1) {
        const src = (cell[y0] * n + cell[x0]) * 4;
        data[at] = cells[src]; data[at + 1] = cells[src + 1]; data[at + 2] = cells[src + 2]; data[at + 3] = 255;
        continue;
      }
      let r = 0, g = 0, b = 0;
      for (let j = y0; j < y1; j++) {
        const row = cell[j] * n;
        for (let i = x0; i < x1; i++) {
          const w = weight[j] * weight[i], src = (row + cell[i]) * 4;
          r += cells[src] * w; g += cells[src + 1] * w; b += cells[src + 2] * w;
        }
      }
      data[at] = r; data[at + 1] = g; data[at + 2] = b; data[at + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

// All design coordinates are fractions of the canonical two-metre tile.
// Wrap the entire mark (including its outline), never just its centre.
function repeat(ctx: Context, paint: () => void): void {
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    ctx.save(); ctx.translate(x, y); paint(); ctx.restore();
  }
}
function polygon(ctx: Context, points: Point[], color: string): void {
  ctx.fillStyle = color; ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fill();
}
function ellipse(ctx: Context, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

// Connected stencil fields, large enough to break up a hull silhouette. Small
// colour islands live inside the macro fields instead of replacing them with
// uniformly distributed dots. Quantiles keep each intended colour present for
// every seed, including the 5% MERDC accents.
function paintField<C extends MaterialCanvas>(
  ctx: Context, size: number, visual: MaterialVisual, rng: Rng, scratch: C,
): void {
  const id = visual.catalogPattern!;
  const pixel = id === 'digital' || id === 'digitaldesert';
  const fleck = id === 'flecktarn' || id === 'oakleaf' || id === 'ambushdot';
  const wash = ['winter', 'washworn', 'ardennes44', 'rasputitsa'].includes(id);
  const band = ['tigerstripe', 'naval', 'winterbands', 'pacific45', 'service-stripes'].includes(id);
  const n = pixel ? Math.round(80 / Math.max(.85, visual.digitalCellK || 1)) : Math.min(192, size);
  scratch.width = scratch.height = n;
  const raster = scratch.getContext('2d') as Context;
  const image = raster.createImageData(n, n), values = new Float32Array(n * n);
  const secondary = new Float32Array(n * n);
  const density = Math.max(2, Math.min(7, Math.round(4 * (visual.camoScale || .5) / .5 / (visual.patchK || 1))));
  const macro = noise(rng, id === 'amoeba' ? 3 : density);
  const detail = noise(rng, fleck ? 29 : 13), warpX = noise(rng, 5), warpY = noise(rng, 5);
  const phase = rng() * TAU;
  const palette = [visual.base, ...(visual.patches || [])].map(parse);
  if (id === 'pacific45') palette.length = 2;
  if (palette.length === 1) palette.push(parse(visual.weather || visual.base));
  if (pixel) for (let tone = 0; tone < palette.length; tone++) palette[tone] = liftDigitalTone(palette[tone]);
  /**
   * 2026-10-07 (tank-accessories lane, round 3; Challenger 1: the stripes "tile visibly: regular, evenly spaced green
   * and black bands along the barrel, glacis and hull sides ... wrapped in a tiled texture"). The service stripes were
   * one horizontal sine of three periods per tile under a shallow warp: three equal bands at equal spacing, every 67 cm
   * on every plate. They now run on a diagonal whose spacing breathes with whole-tile harmonics (the bands narrow, widen,
   * bow and change slope across the tile), a weaker crossing family makes them fork and merge, and a macro field
   * thickens, thins and occasionally breaks a band. Every term repeats a whole number of times per tile, so the
   * two-metre shared tile stays seamless; the harmonic phases come from the drawn phase (no new draws).
   */
  const stripeField = (u: number, v: number, wx: number, wy: number): number => {
    const along = v * 3 + u + .3 * Math.sin(TAU * v + phase * 1.37) + .1 * Math.sin(TAU * 2 * v + phase * 2.71)
      + .14 * Math.sin(TAU * u + phase * .53) + .1 * Math.sin(TAU * 2 * u + phase * 1.9)
      + .05 * Math.sin(TAU * 3 * u + phase * .77) + warpX(u, v) * .45;
    const across = v * 2 - u * 2 + .2 * Math.sin(TAU * u + phase * 2.3) + warpY(u, v) * .35;
    return .5 + .24 * Math.sin(TAU * along + phase) + .13 * Math.sin(TAU * across + phase * 1.7)
      + (macro(wx, wy) - .5) * .42 + (detail(u, v) - .5) * .16;
  };
  const sampleFields = (): void => {
    for (let index = 0; index < n * n; index++) {
      const x = index % n, y = Math.floor(index / n);
      const u = x / n, v = y / n;
      const wx = u + (warpX(u, v) - .5) * .16, wy = v + (warpY(u, v) - .5) * .16;
      let f = macro(id === 'dpm' ? wx + wy : wx, id === 'dpm' ? wy * 2 : wy) * .84 + detail(u, v) * .16;
      if (id === 'service-stripes') f = stripeField(u, v, wx, wy);
      else if (band) {
        const angled = id === 'winterbands' || id === 'dpm';
        f = .5 + .31 * Math.sin(TAU * ((angled ? u + v : v) * 3 + warpX(u, v) * .52) + phase)
          + (detail(u, v) - .5) * .2;
      } else if (fleck) f = macro(wx, wy) * .6 + detail(u, v) * .4;
      values[y * n + x] = f;
      secondary[y * n + x] = macro(wx + .37, wy + .61) * (fleck ? .55 : .82) + detail(u + .23, v + .47) * (fleck ? .45 : .18);
    }
  };
  sampleFields();
  if (pixel) {
    const seed = Math.floor(phase * 0x10000) | 0;
    fragmentPixelEdges(values, n, seed);
    fragmentPixelEdges(secondary, n, seed ^ 0x68e31da4);
  }
  // Independent stencils overlap instead of forming concentric contour lines.
  // Histograms keep coverage balanced without sorting texels on picker clicks.
  function threshold(field: Float32Array, q: number): number {
    const histogram = new Uint32Array(512);
    for (const value of field) histogram[Math.max(0, Math.min(511, Math.floor(value * 511)))]++;
    let sum = 0;
    for (let bin = 0; bin < histogram.length; bin++) {
      sum += histogram[bin];
      if (sum >= q * field.length) return (bin + .5) / 511;
    }
    return 1;
  }
  const merdc = id === 'merdc' || id === 'merdcwinter';
  const baseCoverage = wash ? (id === 'winter' ? .83 : .66) : palette.length === 3 ? .64 : .5;
  const mainCut = threshold(values, baseCoverage);
  const darkCut = threshold(secondary, merdc ? .05 : .18);
  const accentCut = threshold(secondary, merdc ? .95 : .80);
  const colorAt = (f: number, second: number): Color => {
    let tone = f > mainCut ? (palette.length === 3 ? 2 : 1) : 0;
    if (palette.length === 3 && second < darkCut) tone = 1;
    if (palette.length > 3) {
      if (second < darkCut) tone = 3;
      else if (second > accentCut) tone = 2;
    }
    // Six-colour desert reserves the two light/dark chip colours for chips.
    if (id === 'chocchip') tone = second > accentCut ? 2 : f > mainCut ? 1 : 0;
    return palette[tone];
  };
  const colorFields = (): void => {
    for (let index = 0; index < n * n; index++) {
      const x = index % n, y = Math.floor(index / n);
      const c = colorAt(values[index], secondary[index]);
      // Restrained pigment variation follows the fields, not fake panel seams.
      const variation = 1 + (warpY(x / n, y / n) - .5) * .075;
      for (let ch = 0; ch < 3; ch++) image.data[index * 4 + ch] = c[ch] * variation;
      image.data[index * 4 + 3] = 255;
    }
  };
  // The digital patterns are pixel art by design: their raster cells are drawn as crisp squares by box coverage. A tile
  // no larger than the field raster (the picker swatches) is the raster itself.
  if (pixel) {
    colorFields();
    paintPixels(ctx, size, n, image.data);
    return;
  }
  if (size <= n) {
    colorFields();
    raster.putImageData(image, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(scratch, 0, 0, size, size); ctx.restore();
    return;
  }
  paintFieldEdges(ctx, size, n, values, secondary, warpY, palette, id === 'chocchip', mainCut, darkCut, accentCut);
}

/**
 * 2026-10-04 (the vehicle-look lane; gauntlet wave 49: "its soft camo blobs look blurry"): the field camouflages are
 * thresholded on a coarse raster (FIELD_RASTER texels across the two-metre tile, about a centimetre each) and the hard
 * stencil used to be scaled to the tile with bilinear smoothing, so every colour boundary was a soft, stair-stepped ramp
 * a raster texel wide — 5.3 tile texels at the 1024 battle bake, 10.7 at the 2048 Garage bake: blurred blobs up close.
 * The fields are continuous, so the boundaries are drawn at the tile's own resolution instead: each tile texel takes
 * the fields bilinearly at its centre and blends the stencil's colours by its coverage of each threshold, over one tile
 * texel (the field's own change across the texel). The shapes, the colours, the coverage and the random stream are the
 * raster's; only the edges sharpen. Interiors are the raster path's colours exactly; a boundary is one anti-aliased texel.
 */
function paintFieldEdges(
  ctx: Context, size: number, n: number, values: Float32Array, secondary: Float32Array,
  warpY: (x: number, y: number) => number, palette: Color[], chips: boolean, mainCut: number, darkCut: number, accentCut: number,
): void {
  const k = n / size;
  const [p0, p1, p2 = p1, p3 = p2] = palette;
  const tones = palette.length;
  // the raster path's tone index of a sample (colorAt's rule), and its colour
  const toneOf = (f: number, second: number): number => {
    if (chips) return second > accentCut ? 2 : f > mainCut ? 1 : 0;
    let tone = f > mainCut ? (tones === 3 ? 2 : 1) : 0;
    if (tones === 3 && second < darkCut) tone = 1;
    if (tones > 3) {
      if (second < darkCut) tone = 3;
      else if (second > accentCut) tone = 2;
    }
    return tone;
  };
  const variation = new Float32Array(n * n);
  // a cell whose four corners hold one tone and stay at least half a texel's field change from every threshold is one
  // colour throughout (bilinear values are convex combinations of the corners): its texels take the fast path
  const cellTone = new Int8Array(n * n);
  for (let index = 0; index < n * n; index++) {
    const x = index % n, y = Math.floor(index / n);
    variation[index] = 1 + (warpY(x / n, y / n) - .5) * .075;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a00 = y * n + x, a01 = y * n + (x + 1) % n, a10 = ((y + 1) % n) * n + x, a11 = ((y + 1) % n) * n + (x + 1) % n;
    const corners = [a00, a01, a10, a11];
    const tone = toneOf(values[a00], secondary[a00]);
    const wf = (Math.max(Math.abs(values[a01] - values[a00]), Math.abs(values[a11] - values[a10]))
      + Math.max(Math.abs(values[a10] - values[a00]), Math.abs(values[a11] - values[a01]))) * k;
    const ws = (Math.max(Math.abs(secondary[a01] - secondary[a00]), Math.abs(secondary[a11] - secondary[a10]))
      + Math.max(Math.abs(secondary[a10] - secondary[a00]), Math.abs(secondary[a11] - secondary[a01]))) * k;
    let uniform = true;
    for (const a of corners) {
      if (toneOf(values[a], secondary[a]) !== tone || Math.abs(values[a] - mainCut) < .5 * wf
        || Math.abs(secondary[a] - darkCut) < .5 * ws || Math.abs(secondary[a] - accentCut) < .5 * ws) { uniform = false; break; }
    }
    cellTone[a00] = uniform ? tone : -1;
  }
  const colC0 = new Int32Array(size), colC1 = new Int32Array(size), colT = new Float32Array(size);
  for (let X = 0; X < size; X++) {
    const fx = (X + .5) * k - .5, fx0 = Math.floor(fx);
    colC0[X] = wrap(fx0, n); colC1[X] = wrap(fx0 + 1, n); colT[X] = fx - fx0;
  }
  const out = ctx.createImageData(size, size), data = out.data;
  // coverage of one side of a threshold across this texel: the signed distance over the field's change per texel
  const cover = (d: number, w: number): number => Math.min(1, Math.max(0, d / w + .5));
  for (let Y = 0; Y < size; Y++) {
    const fy = (Y + .5) * k - .5, fy0 = Math.floor(fy), ty = fy - fy0;
    const r0 = wrap(fy0, n) * n, r1 = wrap(fy0 + 1, n) * n;
    for (let X = 0; X < size; X++) {
      const c0 = colC0[X], c1 = colC1[X], tx = colT[X];
      const a00 = r0 + c0, a01 = r0 + c1, a10 = r1 + c0, a11 = r1 + c1;
      const vTopV = variation[a00] + (variation[a01] - variation[a00]) * tx;
      const vary = vTopV + (variation[a10] + (variation[a11] - variation[a10]) * tx - vTopV) * ty;
      const at = (Y * size + X) * 4;
      const uniform = cellTone[a00];
      if (uniform >= 0) {
        const c = palette[uniform];
        data[at] = c[0] * vary; data[at + 1] = c[1] * vary; data[at + 2] = c[2] * vary; data[at + 3] = 255;
        continue;
      }
      const vTop = values[a00] + (values[a01] - values[a00]) * tx, vBot = values[a10] + (values[a11] - values[a10]) * tx;
      const f = vTop + (vBot - vTop) * ty;
      const sTop = secondary[a00] + (secondary[a01] - secondary[a00]) * tx, sBot = secondary[a10] + (secondary[a11] - secondary[a10]) * tx;
      const s = sTop + (sBot - sTop) * ty;
      // the fields' change across one tile texel (|d/dx| + |d/dy|, from the bilinear cell)
      const wf = Math.max(1e-5, (Math.abs((values[a01] - values[a00]) * (1 - ty) + (values[a11] - values[a10]) * ty)
        + Math.abs(vBot - vTop)) * k);
      const ws = Math.max(1e-5, (Math.abs((secondary[a01] - secondary[a00]) * (1 - ty) + (secondary[a11] - secondary[a10]) * ty)
        + Math.abs(sBot - sTop)) * k);
      const above = cover(f - mainCut, wf), dark = cover(darkCut - s, ws), accent = cover(s - accentCut, ws);
      for (let ch = 0; ch < 3; ch++) {
        let c: number;
        if (chips) c = (p0[ch] + (p1[ch] - p0[ch]) * above) * (1 - accent) + p2[ch] * accent;
        else if (tones === 3) c = (p0[ch] + (p2[ch] - p0[ch]) * above) * (1 - dark) + p1[ch] * dark;
        else if (tones > 3) c = ((p0[ch] + (p1[ch] - p0[ch]) * above) * (1 - accent) + p2[ch] * accent) * (1 - dark) + p3[ch] * dark;
        else c = p0[ch] + (p1[ch] - p0[ch]) * above;
        data[at + ch] = c * vary;
      }
      data[at + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

// Shared vertices make genuinely interlocking facets, not isolated triangles
// floating on a blank coat. Alternating diagonals avoid a wallpaper grid.
function paintSplinter(ctx: Context, rng: Rng, colors: string[], id: string): void {
  const count = id === 'dazzle' ? 3 : 4;
  const vertices: Point[][] = [];
  for (let y = 0; y < count; y++) {
    vertices[y] = [];
    for (let x = 0; x < count; x++) vertices[y][x] = [(x + rng() * .55) / count, (y + rng() * .55) / count];
  }
  const point = (x: number, y: number): Point => {
    const p = vertices[wrap(y, count)][wrap(x, count)];
    return [p[0] + Math.floor(x / count), p[1] + Math.floor(y / count)];
  };
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    const p = [point(x, y), point(x + 1, y), point(x + 1, y + 1), point(x, y + 1)];
    const c = Math.floor(rng() * colors.length), d = (c + 1 + Math.floor(rng() * (colors.length - 1))) % colors.length;
    repeat(ctx, () => {
      polygon(ctx, [p[0], p[1], p[2]], colors[c]);
      polygon(ctx, [p[0], p[2], p[3]], colors[(x + y) % 3 ? c : d]);
    });
  }
  if (id !== 'splinter') return;
  // Fine rain hatching is subordinate to the large colour fields.
  ctx.strokeStyle = '#394632'; ctx.lineWidth = .001; ctx.globalAlpha = .25;
  for (let i = 0; i < 180; i++) {
    const x = rng(), y = rng(), length = .009 + rng() * .014;
    repeat(ctx, () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + .002, y + length); ctx.stroke(); });
  }
  ctx.globalAlpha = 1;
}

function paintBlocks(ctx: Context, rng: Rng, colors: string[]): void {
  const rows = [0, .18, .47, .73, 1];
  for (let row = 0; row < 4; row++) {
    let x = -.2 + rng() * .2, previous = -1;
    while (x < 1) {
      const width = .18 + rng() * .35;
      let col = Math.floor(rng() * colors.length); if (col === previous) col = (col + 1) % colors.length;
      ctx.fillStyle = colors[col];
      repeat(ctx, () => ctx.fillRect(x, rows[row], width + .001, rows[row + 1] - rows[row] + .001));
      x += width; previous = col;
    }
  }
}

// One flame silhouette with swept tips and deep cutbacks. Nested fills follow
// the same gesture; there are no stroked circles or detached fire stickers.
function flame(ctx: Context, color: string): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-.2, .16);
  ctx.bezierCurveTo(.03, -.03, .32, .20, .76, -.13);
  ctx.bezierCurveTo(.62, .08, .40, .10, .36, .19);
  ctx.bezierCurveTo(.58, .27, .70, .09, .96, .17);
  ctx.bezierCurveTo(.70, .18, .72, .44, .46, .39);
  ctx.bezierCurveTo(.63, .49, .78, .42, .85, .52);
  ctx.bezierCurveTo(.65, .45, .53, .66, .26, .44);
  ctx.bezierCurveTo(.18, .36, .13, .51, -.2, .47); ctx.closePath(); ctx.fill();
}
function paintFlames(ctx: Context, colors: string[]): void {
  for (const [x, y, scale] of [[-.08, .08, .95], [-.10, .70, .65]]) {
    repeat(ctx, () => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.24); ctx.scale(scale, scale);
      flame(ctx, colors[1]);
      ctx.translate(-.025, .055); ctx.scale(.9, .72); flame(ctx, colors[2]);
      ctx.translate(-.035, .067); ctx.scale(.79, .60); flame(ctx, colors[3]);
      ctx.restore();
    });
  }
}

function paintLeopard(ctx: Context, rng: Rng, colors: string[]): void {
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
    const x = (col + .5 + (rng() - .5) * .65) / 6;
    const y = (row + .5 + (rng() - .5) * .65) / 6;
    const radius = .032 + rng() * .022, phase = rng() * TAU;
    const lobes = Array.from({ length: 13 }, (_, i): Point => {
      const a = i / 12 * TAU + phase, r = radius * (.7 + rng() * .5);
      return [Math.cos(a) * r * 1.24, Math.sin(a) * r];
    });
    repeat(ctx, () => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(phase);
      ctx.fillStyle = colors[1]; ctx.beginPath();
      ctx.moveTo((lobes[0][0] + lobes[11][0]) / 2, (lobes[0][1] + lobes[11][1]) / 2);
      for (let i = 0; i < 12; i++) {
        const next = lobes[(i + 1) % 12];
        ctx.quadraticCurveTo(...lobes[i], (lobes[i][0] + next[0]) / 2, (lobes[i][1] + next[1]) / 2);
      }
      ctx.closePath(); ctx.fill();
      // Broad, broken irregular rosettes, varying rim thickness and warm centres.
      ctx.strokeStyle = colors[2]; ctx.lineWidth = radius * .34; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const start of [.04, .41, .76]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.12, radius * .9, .13, start * TAU, (start + .18) * TAU);
        ctx.stroke();
      }
      ellipse(ctx, radius * 1.4, radius * 1.4, .006, .010, colors[2]); ctx.restore();
    });
  }
}

function star(ctx: Context, x: number, y: number, radius: number, color: string, points = 5): void {
  polygon(ctx, Array.from({ length: points * 2 }, (_, i): Point => {
    const angle = i / points * Math.PI - Math.PI / 2, r = radius * (i % 2 ? .43 : 1);
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r];
  }), color);
}

function paintMotif(ctx: Context, id: string, colors: string[]): void {
  const [base, ink, accent] = colors;
  if (id === 'ducky') {
    // Toy silhouette: neck, beak, tail and inset wing in one readable mark.
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(-.8, -.15);
    ctx.bezierCurveTo(-.35, .0, -.25, -.4, -.1, -.25);
    ctx.bezierCurveTo(-.3, -.85, .45, -1.05, .55, -.48);
    ctx.lineTo(.78, -.32); ctx.lineTo(.49, -.24);
    ctx.bezierCurveTo(.75, .38, -.45, .65, -.8, -.15); ctx.fill();
    ellipse(ctx, -.12, .03, .30, .16, '#b77b2d');
    ellipse(ctx, .30, -.55, .044, .044, accent);
    polygon(ctx, [[.49, -.40], [.8, -.32], [.50, -.25]], '#bd672d');
  } else if (id === 'suits') {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(0, -.9);
    ctx.bezierCurveTo(-.4, -.4, -.85, -.18, -.61, .17);
    ctx.bezierCurveTo(-.43, .42, -.12, .29, 0, .10);
    ctx.bezierCurveTo(.12, .29, .43, .42, .61, .17);
    ctx.bezierCurveTo(.85, -.18, .4, -.4, 0, -.9); ctx.fill();
    polygon(ctx, [[0, -.03], [-.22, .60], [.22, .60]], ink);
  } else if (id === 'bolt') {
    polygon(ctx, [[-.1, -.9], [.65, -.9], [.1, -.18], [.5, -.18], [-.55, .9], [-.13, .12], [-.57, .12]], accent);
    ctx.translate(-.055, -.035);
    polygon(ctx, [[-.1, -.9], [.58, -.9], [.05, -.18], [.43, -.18], [-.55, .9], [-.18, .08], [-.57, .08]], ink);
  } else if (id === 'daisy') {
    for (let i = 0; i < 9; i++) {
      ctx.save(); ctx.rotate(i / 9 * TAU); ellipse(ctx, 0, -.44, .15, .35, ink); ctx.restore();
    }
    ellipse(ctx, 0, 0, .23, .23, accent); ellipse(ctx, -.045, -.05, .10, .09, '#dba65e');
  } else {
    star(ctx, 0, 0, .82, ink);
    star(ctx, 0, 0, .46, base);
  }
}

function paintMotifs(ctx: Context, id: string, rng: Rng, colors: string[]): void {
  // Loose, staggered layout with a restrained hierarchy and generous clear coat.
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = (col + (row % 2 ? .15 : .6) + (rng() - .5) * .25) / 3;
    const y = (row + .5 + (rng() - .5) * .25) / 3;
    const scale = (row === 1 && col === 1 ? .15 : .080 + rng() * .020);
    const angle = (rng() - .5) * .5;
    repeat(ctx, () => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
      paintMotif(ctx, id, colors); ctx.restore();
    });
    if (id === 'suits') repeat(ctx, () => polygon(ctx,
      [[x + .13, y], [x + .15, y + .03], [x + .13, y + .06], [x + .11, y + .03]], colors[2]));
    if (id === 'stars') repeat(ctx, () => star(ctx, x + .15, y + .10, .025, colors[2], 4));
  }
}

function paintCircuit(ctx: Context, rng: Rng, colors: string[]): void {
  ctx.lineJoin = 'bevel';
  for (let row = 0; row < 7; row++) {
    const y = (row + .5) / 7, bend = .2 + rng() * .5, end = bend + .12;
    for (let lane = 0; lane < 3; lane++) {
      const off = lane * .012;
      ctx.strokeStyle = colors[lane === 0 ? 1 : 2]; ctx.lineWidth = .003;
      repeat(ctx, () => {
        ctx.beginPath(); ctx.moveTo(-.03, y + off); ctx.lineTo(bend, y + off);
        ctx.lineTo(end, y + .075 + off); ctx.lineTo(.98, y + .075 + off); ctx.stroke();
        ellipse(ctx, .98, y + .075 + off, .007, .007, colors[1]);
        ellipse(ctx, .98, y + .075 + off, .003, .003, colors[0]);
      });
    }
    ctx.fillStyle = colors[1]; ctx.fillRect(bend + .08, y - .047, .075, .024);
    ctx.fillStyle = '#202e2b'; ctx.fillRect(bend + .086, y - .044, .063, .018);
  }
}

function paintRacing(ctx: Context, colors: string[]): void {
  repeat(ctx, () => {
    polygon(ctx, [[-.2, .27], [1.2, -.08], [1.2, .15], [-.2, .50]], colors[2]);
    polygon(ctx, [[-.2, .29], [1.2, -.06], [1.2, .07], [-.2, .42]], colors[1]);
    polygon(ctx, [[-.2, .435], [1.2, .085], [1.2, .10], [-.2, .45]], colors[0]);
    for (let i = 0; i < 20; i++) for (let row = 0; row < 2; row++) {
      if ((i + row) % 2) continue;
      const x = i * .05, y = .64 - x * .25 + row * .025;
      polygon(ctx, [[x, y], [x + .05, y - .0125], [x + .05, y + .0125], [x, y + .025]], colors[2]);
    }
  });
}

function paintSplashes(ctx: Context, rng: Rng, colors: string[]): void {
  for (let i = 0; i < 10; i++) {
    const x = rng(), y = rng(), r = .04 + rng() * .055;
    const points = Array.from({ length: 30 }, (_, k): Point => {
      const a = k / 30 * TAU, radius = r * (k % 3 === 0 ? 1.2 + rng() : .65 + rng() * .3);
      return [x + Math.cos(a) * radius, y + Math.sin(a) * radius * .7];
    });
    const ink = colors[1 + i % (colors.length - 1)];
    const drops = Array.from({ length: 6 }, (): Point => [x + (rng() - .5) * r * 4, y + (rng() - .5) * r * 3]);
    repeat(ctx, () => { polygon(ctx, points, ink); for (const [dx, dy] of drops) ellipse(ctx, dx, dy, .003, .004, ink); });
  }
}

function paintChips(ctx: Context, rng: Rng, colors: string[]): void {
  for (let i = 0; i < 58; i++) {
    const x = rng(), y = rng(), r = .005 + rng() * .011;
    repeat(ctx, () => {
      ellipse(ctx, x, y, r * 1.25, r * .62, colors[4]);
      ellipse(ctx, x - r * .24, y - r * .25, r * .95, r * .42, colors[3]);
    });
  }
}

function paintHex(ctx: Context, colors: string[]): void {
  // Integer row/column periods prevent a discontinuity at the tile edge.
  const r = 1 / 24, h = 1 / 14;
  ctx.strokeStyle = colors[1]; ctx.lineWidth = .0015;
  for (let row = -1; row < 15; row++) for (let col = -1; col < 17; col++) {
    const x = col * r * 1.5, y = row * h + (col % 2) * h / 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * h / Math.sqrt(3));
      else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * h / Math.sqrt(3));
    }
    ctx.closePath(); ctx.stroke();
  }
}

/** Bounded enamel/twill substrate. Soft pigment mottling and fine weave replace
 * marker-like strokes; periodic sampling prevents seams at the two-metre repeat. */
function paintSubstrate<C extends MaterialCanvas>(
  ctx: Context, size: number, visual: MaterialVisual, rng: Rng, scratch: C,
): void {
  const n = Math.min(192, size);
  scratch.width = scratch.height = n;
  const raster = scratch.getContext('2d') as Context;
  const image = raster.createImageData(n, n), base = parse(visual.base);
  const pigment = noise(rng, 5), grain = noise(rng, 48);
  const carbon = visual.catalogPattern === 'carbon';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    let light = 1 + (pigment(u, v) - .5) * .085 + (grain(u, v) - .5) * .035;
    if (carbon) {
      const cx = Math.floor(u * 48), cy = Math.floor(v * 48);
      const across = (cx - cy + 96) % 4 < 2;
      const fiber = Math.cos(TAU * (across ? v : u) * 144);
      light += (across ? .07 : -.045) + fiber * .025;
    }
    const at = (y * n + x) * 4;
    for (let ch = 0; ch < 3; ch++) image.data[at + ch] = base[ch] * light;
    image.data[at + 3] = 255;
  }
  raster.putImageData(image, 0, 0);
  ctx.drawImage(scratch, 0, 0, size, size);
}

export function createCatalogCamoPainter<C extends MaterialCanvas>(makeCanvas: (w: number, h: number) => C) {
  let fieldScratch: C | null = null;
  return (ctx: Context, size: number, visual: MaterialVisual, rng: Rng): void => {
    const id = visual.catalogPattern;
    if (!id) return;
    const colors = [visual.base, ...(visual.patches || [])];
    const graphic = ['flames', 'leopardprint', 'ducky', 'suits', 'bolt', 'stars', 'daisy', 'circuit', 'racing', 'paintball'];
    const geometric = ['splinter', 'm90', 'dazzle', 'pinkdesert', 'caunter', 'urbanblock', 'berlin', 'mono', 'prism'];
    if (id === 'enamel' || id === 'carbon' || id === 'mono' || id === 'prism') {
      fieldScratch ??= makeCanvas(192, 192);
      paintSubstrate(ctx, size, visual, rng, fieldScratch);
    } else if (!graphic.includes(id) && !geometric.includes(id) && id !== 'normandy44' && id !== 'berlin45') {
      fieldScratch ??= makeCanvas(256, 256);
      paintField(ctx, size, visual, rng, fieldScratch);
    }
    ctx.save(); ctx.scale(size, size);
    if (['splinter', 'm90', 'dazzle', 'prism'].includes(id)) paintSplinter(ctx, rng, colors, id);
    else if (id === 'mono') {
      repeat(ctx, () => {
        polygon(ctx, [[-.15, .15], [.34, .15], [.85, .66], [.68, .83]], colors[1]);
        polygon(ctx, [[.48, -.08], [.63, -.08], [1.08, .37], [1.08, .52]], colors[2]);
      });
    }
    else if (id === 'urbanblock' || id === 'berlin') paintBlocks(ctx, rng, colors);
    else if (id === 'pinkdesert' || id === 'caunter') {
      repeat(ctx, () => {
        polygon(ctx, [[-.2, .28], [.28, .17], [.60, .42], [1.2, .15], [1.2, .42], [.59, .67], [.24, .40], [-.2, .51]], colors[1]);
        polygon(ctx, [[-.2, .73], [.38, .63], [.63, .86], [1.2, .62], [1.2, .75], [.61, 1.02], [.36, .78], [-.2, .91]], colors[2]);
      });
    }
    else if (id === 'flames') paintFlames(ctx, colors);
    else if (id === 'leopardprint') paintLeopard(ctx, rng, colors);
    else if (id === 'circuit') paintCircuit(ctx, rng, colors);
    else if (id === 'racing') paintRacing(ctx, colors);
    else if (id === 'paintball') paintSplashes(ctx, rng, colors);
    else if (graphic.includes(id)) paintMotifs(ctx, id, rng, colors);
    else if (id === 'chocchip') paintChips(ctx, rng, colors);
    else if (id === 'hexfield') paintHex(ctx, colors);
    else if (id === 'normandy44') {
      repeat(ctx, () => { star(ctx, .52, .49, .25, colors[1]);
        ctx.strokeStyle = colors[1]; ctx.lineWidth = .011; ctx.setLineDash([.37, .035]);
        ctx.beginPath(); ctx.arc(.52, .49, .29, 0, TAU); ctx.stroke(); ctx.setLineDash([]); });
    } else if (id === 'berlin45') {
      ctx.fillStyle = colors[1]; ctx.fillRect(.72, 0, .065, 1); ctx.fillRect(0, .73, 1, .065);
    }
    ctx.restore();
  };
}
