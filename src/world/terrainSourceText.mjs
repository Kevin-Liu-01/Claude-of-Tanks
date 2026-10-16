// Receipts that read the terrain splat's source text (2026-10-14, the ground lane's R1c landing): the roads' GLSL
// lives in roadSurfaceShader.ts and terrain.ts interpolates it into SPLAT_COMMON_FRAG at two lines. A receipt that
// asserts on the shader's text reads terrain.ts with both chunks put back in place, which is the text the module
// evaluates (roadSurfaceShader.selftest.mjs proves the evaluated program is the same string).
import { readFileSync } from 'node:fs';
import { ROAD_CARRIAGEWAY_GLSL, ROAD_PAVING_GLSL } from './roadSurfaceShader.ts';

export const ROAD_SHADER_CHUNKS = Object.freeze([
  ['${ROAD_CARRIAGEWAY_GLSL}', ROAD_CARRIAGEWAY_GLSL],
  ['${ROAD_PAVING_GLSL}', ROAD_PAVING_GLSL],
]);

/** terrain.ts as text, with each road chunk's interpolation line replaced by the chunk (each must appear exactly once). */
export function terrainSourceText() {
  let source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  for (const [token, chunk] of ROAD_SHADER_CHUNKS) {
    const parts = source.split(token);
    if (parts.length !== 2) throw new Error(`terrain.ts must interpolate ${token} exactly once (found ${parts.length - 1})`);
    source = parts[0] + chunk + parts[1];
  }
  return source;
}
