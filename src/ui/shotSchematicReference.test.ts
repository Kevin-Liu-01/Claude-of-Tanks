// Frozen independent aa03ceb90 schematic implementation, TEST ONLY.
// Intentionally retains the old full readbacks and synchronous PNG reference.
function requireCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Reference Canvas2D unavailable');
  return context;
}

function normalizeSchematicSource(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = requireCanvasContext(canvas);
  context.drawImage(img, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue;
    sum += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    count += 1;
  }
  const mean = count ? sum / count : 128;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const luminance = pixels[index] * 0.2126
      + pixels[index + 1] * 0.7152
      + pixels[index + 2] * 0.0722;
    const value = Math.max(24, Math.min(250, 178 + (luminance - mean) * 2.1));
    pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function sharpenSchematic(
  pixels: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const amount = 0.55;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 8) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel];
        const neighbor = (offset: number): number => (
          source[index + offset + 3] >= 8 ? source[index + offset + channel] : center
        );
        pixels[index + channel] = center * (1 + 4 * amount)
          - amount * (
            neighbor(-4) + neighbor(4)
            + neighbor(-width * 4) + neighbor(width * 4)
          );
      }
    }
  }
}

function outlineSchematic(
  pixels: Uint8ClampedArray,
  source: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const outlineRadius = 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 8) continue;
      let edge = false;
      for (let dy = -outlineRadius; dy <= outlineRadius && !edge; dy += 1) {
        for (let dx = -outlineRadius; dx <= outlineRadius && !edge; dx += 1) {
          const neighborX = x + dx;
          const neighborY = y + dy;
          edge = neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height
            || source[(neighborY * width + neighborX) * 4 + 3] < 8;
        }
      }
      if (!edge) continue;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 36;
      pixels[index + 3] = Math.max(pixels[index + 3], 216);
    }
  }
}

export function legacySchematic(img: HTMLImageElement, outW: number, outH: number): string {
  const sourceCanvas = normalizeSchematicSource(img);
  const target = document.createElement('canvas');
  target.width = outW;
  target.height = outH;
  const context = requireCanvasContext(target);
  const fit = Math.min(outW / sourceCanvas.width, outH / sourceCanvas.height);
  const width = sourceCanvas.width * fit;
  const height = sourceCanvas.height * fit;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceCanvas, (outW - width) / 2, (outH - height) / 2, width, height);
  const image = context.getImageData(0, 0, outW, outH);
  const source = new Uint8ClampedArray(image.data);
  sharpenSchematic(image.data, source, outW, outH);
  outlineSchematic(image.data, source, outW, outH);
  context.putImageData(image, 0, 0);
  return target.toDataURL();
}
