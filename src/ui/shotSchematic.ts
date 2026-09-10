// Shared exact schematic arithmetic. Workers drain it; the DOM fallback yields
// between bounded checkpoints. No fleet, DOM construction or renderer imports.
export type SchematicCanvas = HTMLCanvasElement | OffscreenCanvas;
export interface SchematicRequest { url: string; width: number; height: number }
type SchematicContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const PIXEL_BATCH_BYTES = 4096 * 4;
const ROW_BATCH = 8;

export function validSchematicSize(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width <= 8192 && height <= 8192 && width * height <= 16_777_216;
}

/** Preserve accumulation order, alpha thresholds, and Uint8Clamped rounding. */
export function* normalizeSchematicPixels(pixels: Uint8ClampedArray): Generator<void> {
  let sum = 0, count = 0;
  for (let start = 0; start < pixels.length; start += PIXEL_BATCH_BYTES) {
    const end = Math.min(pixels.length, start + PIXEL_BATCH_BYTES);
    for (let index = start; index < end; index += 4) {
      if (pixels[index + 3] < 16) continue;
      sum += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      count += 1;
    }
    yield;
  }
  const mean = count ? sum / count : 128;
  for (let start = 0; start < pixels.length; start += PIXEL_BATCH_BYTES) {
    const end = Math.min(pixels.length, start + PIXEL_BATCH_BYTES);
    for (let index = start; index < end; index += 4) {
      if (pixels[index + 3] === 0) continue;
      const luminance = pixels[index] * 0.2126
        + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      const value = Math.max(24, Math.min(250, 178 + (luminance - mean) * 2.1));
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
    }
    yield;
  }
}

function sharpenRow(pixels: Uint8ClampedArray, source: Uint8ClampedArray, width: number, y: number): void {
  const amount = 0.55;
  for (let x = 1; x < width - 1; x += 1) {
    const index = (y * width + x) * 4;
    if (source[index + 3] < 8) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const center = source[index + channel];
      const neighbor = (offset: number): number => (
        source[index + offset + 3] >= 8 ? source[index + offset + channel] : center
      );
      pixels[index + channel] = center * (1 + 4 * amount)
        - amount * (neighbor(-4) + neighbor(4) + neighbor(-width * 4) + neighbor(width * 4));
    }
  }
}

function isOutline(source: Uint8ClampedArray, width: number, height: number, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height
        || source[(ny * width + nx) * 4 + 3] < 8) return true;
    }
  }
  return false;
}

/** Sharpen and outline both read the SAME pre-sharpen pixels, as before. */
export function* finishSchematicPixels(
  pixels: Uint8ClampedArray, width: number, height: number,
): Generator<void> {
  const source = new Uint8ClampedArray(pixels);
  for (let y = 1; y < height - 1; y += 1) {
    sharpenRow(pixels, source, width, y);
    if (y % ROW_BATCH === 0) yield;
  }
  yield;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 8 || !isOutline(source, width, height, x, y)) continue;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 36;
      pixels[index + 3] = Math.max(pixels[index + 3], 216);
    }
    if (y % ROW_BATCH === 0) yield;
  }
}

function canvasContext(canvas: SchematicCanvas): SchematicContext {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Schematic Canvas2D unavailable');
  return context;
}

// A fallback read never asks the browser for the entire source image at once.
function* readRows(context: SchematicContext, width: number, height: number): Generator<void, ImageData> {
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += ROW_BATCH) {
    const rows = Math.min(ROW_BATCH, height - y);
    image.data.set(context.getImageData(0, y, width, rows).data, y * width * 4);
    yield;
  }
  return image;
}

function* writeRows(context: SchematicContext, image: ImageData): Generator<void> {
  for (let y = 0; y < image.height; y += ROW_BATCH) {
    context.putImageData(image, 0, 0, 0, y, image.width, Math.min(ROW_BATCH, image.height - y));
    yield;
  }
}

/** Target remains private until complete; caller owns the returned canvas. */
export function* bakeSchematicSteps<C extends SchematicCanvas>(
  image: CanvasImageSource, sourceWidth: number, sourceHeight: number,
  request: SchematicRequest, createCanvas: (width: number, height: number) => C,
): Generator<void, C | null> {
  if (!validSchematicSize(sourceWidth, sourceHeight) || !validSchematicSize(request.width, request.height)) {
    throw new Error('Invalid schematic dimensions');
  }
  const owned: C[] = [];
  let complete: C | null = null;
  const makeCanvas = (width: number, height: number): C => {
    const canvas = createCanvas(width, height); owned.push(canvas); return canvas;
  };
  try {
    yield;
    const sourceCanvas = makeCanvas(sourceWidth, sourceHeight);
    const sourceContext = canvasContext(sourceCanvas);
    sourceContext.drawImage(image, 0, 0);
    yield;
    const sourceImage = yield* readRows(sourceContext, sourceWidth, sourceHeight);
    yield* normalizeSchematicPixels(sourceImage.data);
    yield* writeRows(sourceContext, sourceImage);
    const target = makeCanvas(request.width, request.height);
    const context = canvasContext(target);
    const fit = Math.min(request.width / sourceWidth, request.height / sourceHeight);
    const width = sourceWidth * fit, height = sourceHeight * fit;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sourceCanvas, (request.width - width) / 2, (request.height - height) / 2, width, height);
    yield;
    const targetImage = yield* readRows(context, request.width, request.height);
    yield* finishSchematicPixels(targetImage.data, request.width, request.height);
    yield* writeRows(context, targetImage);
    complete = target;
    return target;
  } finally {
    for (const canvas of owned) {
      if (canvas !== complete) { canvas.width = 0; canvas.height = 0; }
    }
  }
}
