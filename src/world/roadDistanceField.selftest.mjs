import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roadLaneSharpness } from './roadMaskProfile.ts';

// road pass 2026-09-12: the terrain mask's G byte carries the road centreline
// distance field (12 m -> 0, 0 m -> 255) and the shader evaluates the
// carriageway edge, the twin wheel lanes and the crown analytically from it.
// This receipt proves the property the retired Gaussian-lane raster could not
// deliver at 2 m texels: after Uint8 storage and bilinear filtering, a straight
// road's lanes are continuous along their length at every bearing and phase.

const byte = new Uint8ClampedArray(1);
const encode = value => { byte[0] = value; return byte[0]; };
const encodeDistance = d => encode(Math.max(0, 1 - d / 12) * 255);
const decodeDistance = g => (1 - g / 255) * 12;

function filteredField(texelM, c, s, phase) {
  // Same pixel-centre convention, Uint8 storage and bilinear lookup as uMask.
  const pixel = (x, z) => encodeDistance(
    Math.abs((x + 0.5 - phase[0]) * texelM * c + (z + 0.5 - phase[1]) * texelM * s));
  return (x, z) => {
    const gx = x / texelM - 0.5, gz = z / texelM - 0.5;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = pixel(ix, iz), b = pixel(ix + 1, iz), d = pixel(ix, iz + 1), e = pixel(ix + 1, iz + 1);
    return decodeDistance((a + (b - a) * fx) * (1 - fz) + (d + (e - d) * fx) * fz);
  };
}

// Shader twins (terrain.ts splatCompute): lane profile (uLaneK from the mask
// texel size) and the noise-free gauge.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const laneAt = (d, k) => { if (!(k > 0)) return 1 - smooth(2.6, 3.6, d); const laneD = (d - 1.55) * k; return Math.exp(-laneD * laneD); };
const core = d => 1 - Math.min(1, Math.max(0, (d - (3.85 - 0.55)) / 1.1)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (d - (3.85 - 0.55)) / 1.1)));

const PHASES = [[0, 0], [0.25, 0.25], [0.5, 0.75], [0.75, 0.5]];
let worstLane = 0, worstLaneMobile = 0, worstEdge = 0, worstCentre = 0;
for (const texelM of [2, 4]) {
  for (let bearing = 0; bearing < 180; bearing += 5) for (const phase of PHASES) {
    const c = Math.cos(bearing * Math.PI / 180), s = Math.sin(bearing * Math.PI / 180);
    const sample = filteredField(texelM, c, s, phase);
    const laneK = roadLaneSharpness(1024 / texelM);
    const lane = d => laneAt(d, laneK);
    for (const across of [-3.85, -1.55, 1.55, 3.85]) {
      let low = Infinity, high = -Infinity;
      for (let along = -32; along <= 32; along += 0.5) {
        const x = -along * s + across * c + phase[0] * texelM;
        const z = along * c + across * s + phase[1] * texelM;
        const d = sample(x, z);
        const value = Math.abs(across) < 2 ? lane(d) : core(d);
        low = Math.min(low, value); high = Math.max(high, value);
        // Away from the centre kink the filtered field IS the distance. Inside
        // half a texel of the centre (the 4 m mobile mask reaches the lanes)
        // bilinear filtering can only overestimate, by at most half a texel.
        const inKink = Math.abs(across) < texelM * 0.5;
        const tolerance = inKink ? texelM * 0.5 : (texelM === 2 ? 0.12 : 0.30);
        assert.ok(Math.abs(d - Math.abs(across)) <= tolerance,
          `${texelM}m/${bearing}deg/${across}m: filtered distance ${d.toFixed(3)} drifts`);
      }
      if (Math.abs(across) < 2) { if (texelM === 2) worstLane = Math.max(worstLane, high - low); else worstLaneMobile = Math.max(worstLaneMobile, high - low); }
      else worstEdge = Math.max(worstEdge, high - low);
    }
    // The centre kink is the only place bilinear filtering overestimates; the
    // crown strip must still read as the road centre (< 1 texel error).
    for (let along = -32; along <= 32; along += 0.5) {
      const d = sample(-along * s + phase[0] * texelM, along * c + phase[1] * texelM);
      worstCentre = Math.max(worstCentre, d);
    }
    assert.ok(worstCentre <= texelM * 0.5 + 0.06, `${texelM}m/${bearing}deg: centre reads ${worstCentre.toFixed(2)} m`);
  }
}
assert.ok(worstLane < 0.06, `desktop lanes stay continuous along a straight road (variation ${worstLane.toFixed(3)})`);
assert.ok(worstLaneMobile < 0.06, `the mobile (4 m) compaction plateau stays continuous along a straight road (variation ${worstLaneMobile.toFixed(3)})`);
assert.equal(roadLaneSharpness(512), 2.4, 'desktop 2 m mask keeps the twin 0.42 m sigma lanes');
assert.equal(roadLaneSharpness(256), 0, 'the 4 m mobile mask uses the plateau fallback');
// 0.13 in core value is <= 0.12 m of edge position on the 2 m mask (the retired
// R-raster receipt allowed 0.22 m); Uint8 quantisation of 12 m is 0.047 m.
assert.ok(worstEdge < 0.13, `the carriageway edge does not scallop (variation ${worstEdge.toFixed(3)})`);

// The painter and the shader consume the same encoding.
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.equal(terrain.split('px[j + 1] = Math.max(0, 1 - d / 12) * 255;').length, 2, 'unique distance-field painter');
assert.equal(terrain.split('float dRoad = (1.0 - mk.g) * 12.0;').length, 2, 'unique distance-field decode');
assert.match(terrain, /if \(d >= 13\) return;/, 'the painter still stops at the historical 13 m apron');
assert.match(terrain, /const core = roadCoreMask\(d, wob, wid, 1 \/ T\);/, 'the R core raster is unchanged');
assert.doesNotMatch(terrain, /roadRutMask|roadRutInverseWidth|rutInverseWidth/, 'no Gaussian lane raster remains');
assert.doesNotMatch(readFileSync(new URL('./roadMaskProfile.ts', import.meta.url), 'utf8'), /roadRutMask|roadRutInverseWidth/,
  'the rut raster helpers are retired with their consumer');
console.log(`roadDistanceField.selftest: ${36 * PHASES.length * 2} bearing/phase cases at 2 m and 4 m texels keep continuous lanes (${worstLane.toFixed(3)} desktop, ${worstLaneMobile.toFixed(3)} mobile), edges (${worstEdge.toFixed(3)}) and centres PASS`);
