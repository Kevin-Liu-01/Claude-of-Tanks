import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roadCoreMask } from './roadMaskProfile.ts';

function sampleFilteredMask(x, z, c, s, texelM) {
  // Same pixel-centre convention, Uint8 storage and bilinear lookup as uMask.
  const gx = x / texelM - 0.5, gz = z / texelM - 0.5;
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const pixel = (px, pz) => Math.round(255 * roadCoreMask(
    Math.abs((px + 0.5) * texelM * c + (pz + 0.5) * texelM * s), 0, 0, texelM)) / 255;
  const a = pixel(ix, iz), b = pixel(ix + 1, iz), d = pixel(ix, iz + 1), e = pixel(ix + 1, iz + 1);
  return (a + (b - a) * fx) * (1 - fz) + (d + (e - d) * fx) * fz;
}

for (const texelM of [2, 4]) {
  for (let angle = 0; angle < 180; angle += 5) {
    const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
    let smallest = Infinity, largest = 0;
    for (let along = -32; along <= 32; along += 0.5) {
      assert.ok(sampleFilteredMask(-along * s, along * c, c, s, texelM) > 0.70,
        `${texelM}m/${angle}°: the road centre cannot alternate into snow/grass holes`);
      let lo = 2, hi = 7;
      for (let iteration = 0; iteration < 20; iteration++) {
        const at = (lo + hi) * 0.5;
        const value = sampleFilteredMask(-along * s + at * c, along * c + at * s, c, s, texelM);
        if (value > 0.54) lo = at; else hi = at;
      }
      smallest = Math.min(smallest, lo); largest = Math.max(largest, hi);
    }
    assert.ok(largest - smallest < (texelM === 2 ? 0.22 : 0.62),
      `${texelM}m/${angle}°: bounded sub-texel road edge scallop (${largest - smallest})`);
    assert.ok(smallest > 3 && largest < 4.2, 'filtering preserves the authored carriageway width');
  }
  for (const wobble of [-1.15, 0, 1.15]) for (const width of [-1.5, 0, 1.5]) {
    for (let distance = 0; distance <= 14; distance += 0.125) {
      const value = roadCoreMask(distance, wobble, width, texelM);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, 'all authored modulation stays normalized');
    }
    assert.equal(roadCoreMask(14, wobble, width, texelM), 0, 'off-road pixels remain empty');
  }
}

const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /const core = roadCoreMask\(d, wob, wid, 1 \/ T\);/);
assert.match(terrain, /segDist\(\(tx \+ 0\.5\) \/ T - HALF, \(tz \+ 0\.5\) \/ T - HALF,/);
assert.match(terrain, /const x = \(tx \+ 0\.5\) \/ T - HALF/);
assert.match(terrain, /const z = \(tz \+ 0\.5\) \/ T - HALF/);
assert.match(terrain, /const s = texSize\(512\), T = s \/ MAP_SIZE;/, 'no resolution or memory increase');
assert.match(readFileSync(new URL('./hardstandSurface.ts', import.meta.url), 'utf8'),
  /signedDistance\(strip, \(ix \+ 0\.5\) \* step - halfMap, \(iz \+ 0\.5\) \* step - halfMap\)/,
  'the runway stamp uses the same physical pixel centres');
console.log('roadMaskProfile.selftest: 72 road bearings retain smooth edges and solid centres at desktop/mobile mask resolution');
