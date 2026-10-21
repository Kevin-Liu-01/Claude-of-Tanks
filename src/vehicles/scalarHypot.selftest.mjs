// hypot2/hypot3 equal Math.hypot bit for bit (Object.is), including -0, NaN, Infinity, denormals and wide ranges: the
// per-frame track paths use them in place of Math.hypot, and the fleet geometry ledger pins the vertices they place.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { hypot2, hypot3 } from './scalarHypot.ts';

let seed = 0x9e3779b9;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32; };
const value = () => (random() - 0.5) * 10 ** Math.floor(random() * 16 - 8);
const special = [0, -0, 1, -1, 1e-310, -1e-310, 5e-324, Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, -Infinity, NaN, 0.1, 3, 4];
const same = (got, want, args) => assert.ok(Object.is(got, want), `hypot(${args.join(', ')}): ${got} vs Math.hypot ${want}`);
for (const a of special) for (const b of special) {
  same(hypot2(a, b), Math.hypot(a, b), [a, b]);
  for (const c of special) same(hypot3(a, b, c), Math.hypot(a, b, c), [a, b, c]);
}
let plainDiffers = 0;
for (let i = 0; i < 200_000; i++) {
  const a = value(), b = value(), c = value();
  same(hypot2(a, b), Math.hypot(a, b), [a, b]);
  same(hypot3(a, b, c), Math.hypot(a, b, c), [a, b, c]);
  if (Math.sqrt(a * a + b * b) !== Math.hypot(a, b)) plainDiffers++;
}
// the negative control: the plain square root of the sum of squares differs often, which is why these exist
assert.ok(plainDiffers > 10_000, `Math.sqrt(a*a+b*b) differs from Math.hypot on ${plainDiffers} of 200000`);
console.log(`scalarHypot.selftest: hypot2/hypot3 equal Math.hypot bit for bit on ${special.length ** 3 + special.length ** 2} edge and 400000 random inputs (the plain form differs on ${plainDiffers})`);
