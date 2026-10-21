// Math.hypot without its argument array, bit for bit (229 perf pass). V8's Math.hypot allocates an array per call, and
// the per-frame track paths call it per triangle and per shoe. A plain Math.sqrt(a*a + b*b) is NOT the same number: V8
// divides every argument by the largest and Kahan-sums the squares (src/builtins/math.tq MathHypot), so the last bit
// differs on ~40 % of inputs, and that moved running-gear vertices (leo1a5's fleet-geometry-ledger row). These follow
// V8's algorithm step for step in plain IEEE doubles; scalarHypot.selftest.mjs holds them equal to Math.hypot.

export function hypot2(a: number, b: number): number {
  const x = Math.abs(a), y = Math.abs(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return x === Infinity || y === Infinity ? Infinity : NaN;
  const max = x > y ? x : y;
  if (max === Infinity) return Infinity;
  if (max === 0) return 0;
  let sum = 0, compensation = 0;
  let n = x / max, summand = n * n - compensation, preliminary = sum + summand;
  compensation = (preliminary - sum) - summand; sum = preliminary;
  n = y / max; summand = n * n - compensation; preliminary = sum + summand;
  sum = preliminary;
  return Math.sqrt(sum) * max;
}

export function hypot3(a: number, b: number, c: number): number {
  const x = Math.abs(a), y = Math.abs(b), z = Math.abs(c);
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return x === Infinity || y === Infinity || z === Infinity ? Infinity : NaN;
  let max = x > y ? x : y;
  if (z > max) max = z;
  if (max === Infinity) return Infinity;
  if (max === 0) return 0;
  let sum = 0, compensation = 0;
  let n = x / max, summand = n * n - compensation, preliminary = sum + summand;
  compensation = (preliminary - sum) - summand; sum = preliminary;
  n = y / max; summand = n * n - compensation; preliminary = sum + summand;
  compensation = (preliminary - sum) - summand; sum = preliminary;
  n = z / max; summand = n * n - compensation; preliminary = sum + summand;
  sum = preliminary;
  return Math.sqrt(sum) * max;
}
