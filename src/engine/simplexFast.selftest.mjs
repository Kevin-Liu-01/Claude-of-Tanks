import assert from 'node:assert/strict';
import { SimplexNoise as ReferenceSimplex } from 'three/addons/math/SimplexNoise.js';
import { SimplexNoise as FastSimplex } from './simplexFast.ts';

function seededRandom(seed) {
  let state = seed >>> 0;
  return {
    random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    },
  };
}

for (const seed of [1, 0x12345678, 0xffffffff]) {
  const reference = new ReferenceSimplex(seededRandom(seed));
  const fast = new FastSimplex(seededRandom(seed));
  for (let i = 0; i < 128; i++) {
    const x = (i - 64) * 0.071;
    const y = ((i * 37) % 113 - 56) * 0.043;
    const z = ((i * 19) % 97 - 48) * 0.059;
    const w = ((i * 53) % 89 - 44) * 0.031;
    assert.ok(Object.is(fast.noise(x, y), reference.noise(x, y)),
      `2D noise must be bit-identical at seed ${seed}, sample ${i}`);
    assert.ok(Object.is(fast.noise3d(x, y, z), reference.noise3d(x, y, z)),
      `3D noise must be bit-identical at seed ${seed}, sample ${i}`);
    assert.ok(Object.is(fast.noise4d(x, y, z, w), reference.noise4d(x, y, z, w)),
      `4D noise must be bit-identical at seed ${seed}, sample ${i}`);
  }
}

console.log('simplexFast.selftest: 1,152 bit-identical reference samples passed');
