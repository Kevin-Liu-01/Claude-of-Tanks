// The millimetre weld (perf-240): two corners share a key exactly when the `${x},${y},${z}` string of their positions
// rounded to the millimetre did (the welds it replaced), and the first value stored at a key is the one every later
// corner there reads. Checked against that string map over a seeded spread of corners (shared, near, -0 and 0, half
// millimetres, beyond the int32 range, not finite) and a table reused at several sizes.
import assert from 'node:assert/strict';
import { createMillimetreWeld } from './millimetreWeld.ts';

let seed = 240;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pick = () => {
  const r = rand();
  if (r < 0.05) return [-0.0001, 0.0004, -0.0];
  if (r < 0.1) return [0.0001, -0.0004, 0];
  if (r < 0.14) return [1.0005, 2.0005, -3.0005];
  if (r < 0.16) return [3e6, -4e6, 2147483.6475];
  if (r < 0.18) return [NaN, 1, 2];
  if (r < 0.2) return [Infinity, 0, -Infinity];
  // a grid of shared corners, jittered under and over half a millimetre
  const g = () => (Math.floor(rand() * 40) - 20) * 0.25 + (rand() - 0.5) * 0.0012;
  return [g() + 512.1234, g(), g() - 233.5];
};

const weld = createMillimetreWeld();
let shared = 0, strings = 0;
for (const corners of [3, 40, 600, 9000, 120]) {
  weld.begin(corners);
  const reference = new Map();
  for (let i = 0; i < corners; i++) {
    const [x, y, z] = pick();
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    const want = reference.has(key) ? reference.get(key) : -1;
    if (want < 0) reference.set(key, i);
    else shared++;
    if (!Number.isFinite(Math.round(x * 1000)) || Math.abs(Math.round(x * 1000)) > 0x7fffffff) strings++;
    assert.equal(weld.claim(x, y, z, i), want, `corner ${i} of ${corners} at ${key}`);
  }
}
assert.ok(shared > 1000, `corners shared a key (${shared})`);
assert.ok(strings > 50, `corners kept a string key (${strings})`);
console.log(`millimetreWeld.selftest: ${shared} shared corners and ${strings} string-keyed ones weld as the string keys did`);
