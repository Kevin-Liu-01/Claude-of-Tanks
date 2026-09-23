import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeMaskTexture } from './terrain.ts';

// road pass 2026-09-12: the mask G byte is the road centreline distance field
// (see terrain.ts paintRoadMask). There is no longer a point-sampled or
// filtered rut raster to preserve, so the historical/unoptimized projections
// collapse onto the production factory. The consumers below only compare
// R/B/A (and G) bytes between two runs of the SAME factory, which is exactly
// what they still get. The pin keeps the painter statement unique so a future
// change to the G encoding is caught here first.
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const current = 'px[j + 1] = Math.max(0, 1 - d / 12) * 255;';
assert.equal(source.split(current).length, 2, 'unique actual production distance-field consumer');
assert.doesNotMatch(source, /roadRutMask|roadRutInverseWidth/, 'the Gaussian rut raster is retired');
export const historicalMaskTexture = makeMaskTexture;
