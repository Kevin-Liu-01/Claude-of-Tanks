/** DOM-free pixel kernels shared by the legacy Canvas path and worker. */
export interface SourcedComposeOptions {
  roughInAlpha?: boolean;
  separateSurface?: boolean;
  roughMul?: number;
  tint?: readonly [number, number, number] | null;
  desat?: number;
  lift?: number;
}

/** Mutate the color readback, retaining the production arithmetic and order. */
export function composeAlbedoPixels(
  color: Uint8ClampedArray,
  ao: Uint8ClampedArray | null,
  rough: Uint8ClampedArray | null,
  {
    roughInAlpha = false,
    roughMul = 1,
    tint = null,
    desat = 0,
    lift = 0,
  }: SourcedComposeOptions = {},
): void {
  const d = color;
  // separateSurface is a caller/cache routing flag, not an albedo operation.
  const aod = ao;
  const rgd = roughInAlpha ? rough : null;
  const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
  for (let i = 0; i < d.length; i += 4) {
    const a = aod ? aod[i] / 255 : 1;
    let r = d[i] * a * tr, g = d[i + 1] * a * tg, b = d[i + 2] * a * tb;
    if (desat > 0) {
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      r += (lum - r) * desat; g += (lum - g) * desat; b += (lum - b) * desat;
    }
    if (lift > 0) { r += lift * 255; g += lift * 255; b += lift * 255; }
    d[i] = Math.min(255, r);
    d[i + 1] = Math.min(255, g);
    d[i + 2] = Math.min(255, b);
    d[i + 3] = roughInAlpha
      ? Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul))
      : 255;
  }
}

/** Pack the unchanged linear building surface: R=AO, G=roughness, B=0. */
export function composeSurfacePixels(
  out: Uint8ClampedArray,
  ao: Uint8ClampedArray | null,
  rough: Uint8ClampedArray | null,
  roughMul = 1,
): void {
  const d = out, aod = ao, rgd = rough;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = aod ? aod[i] : 255;
    d[i + 1] = Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul));
    d[i + 2] = 0;
    d[i + 3] = 255;
  }
}
