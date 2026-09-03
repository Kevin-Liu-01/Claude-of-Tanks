import * as THREE from 'three';

export interface ProceduralTextureOptions {
  srgb?: boolean;
  anisotropy?: number;
  repeat?: boolean;
}

interface Noise4DSource {
  noise4d(x: number, y: number, z: number, w: number): number;
}

/** Build a CanvasTexture from a packed RGBA buffer with the world defaults. */
export function textureFromRgbaPixels(
  pixels: Uint8ClampedArray,
  size: number,
  { srgb = false, anisotropy = 4, repeat = true }: ProceduralTextureOptions = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('world procedural texture: Canvas2D context unavailable');
  context.putImageData(
    new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = repeat
    ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Encode a wrapped Sobel height derivative as a tileable tangent-space normal map. */
export function normalTextureFromHeight(
  height: Float32Array,
  size: number,
  strength: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const sample = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];
  const normal = new THREE.Vector3();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1))
      - (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
    const dy = (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1))
      - (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));
    normal.set(-dx * strength, -dy * strength, 1).normalize();
    const offset = (y * size + x) * 4;
    pixels[offset] = normal.x * 127.5 + 127.5;
    pixels[offset + 1] = normal.y * 127.5 + 127.5;
    pixels[offset + 2] = normal.z * 127.5 + 127.5;
    pixels[offset + 3] = 255;
  }
  return textureFromRgbaPixels(pixels, size, { anisotropy });
}

/** Seamless 4D-simplex sampling over a 2D torus. */
export function tileableTorusNoise(
  noise: Noise4DSource,
  u: number,
  v: number,
  frequencyU: number,
  frequencyV: number,
  offset: number,
): number {
  const angleU = u * Math.PI * 2 * frequencyU;
  const angleV = v * Math.PI * 2 * frequencyV;
  const radiusU = frequencyU * 0.55;
  const radiusV = frequencyV * 0.55;
  return noise.noise4d(
    Math.cos(angleU) * radiusU + offset,
    Math.sin(angleU) * radiusU - offset * 0.7,
    Math.cos(angleV) * radiusV + offset * 1.3,
    Math.sin(angleV) * radiusV + offset * 0.35,
  );
}
