// physics lane scratch (debris-pool perf, 2026-10-11): a collapse-like heap in the debris pool — 128 boxes of mixed
// sizes (panels, slabs, beams, clumps) released in waves over a house footprint onto flat ground — and the cost of each
// pool.advance(1/60) over 14 s: mean, p95, max ms, awake counts. Deterministic (seeded).
//   node heap-bench.mjs [--n=128] [--s=14] [--prof]
import { performance } from 'node:perf_hooks';
const ENG = process.argv.find((a) => a.startsWith('--engine='))?.slice(9);
const base = ENG ? `file://${ENG}/` : '../';
const { createDebrisPhysics } = await import(`${base}src/fx/debrisPhysics.ts`);
const { createRigidBox } = await import(`${base}src/sim/rigidBody.ts`);
const arg = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
const N = arg('n', 128), S = arg('s', 14);
globalThis.__COT_CPB = arg('cpb', 28);
let a = 12345 >>> 0;
const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pool = createDebrisPhysics({ capacity: 128 });
pool.bind({ groundAt: () => 0 });
const kinds = [
  () => [1.2 + rnd() * 1.6, 0.1 + rnd() * 0.08, 0.9 + rnd() * 1.0, 1900], // wall panel
  () => [1.5 + rnd() * 1.5, 0.08 + rnd() * 0.06, 1.0 + rnd() * 1.2, 1200], // roof slab
  () => [1.2 + rnd() * 1.6, 0.04 + rnd() * 0.04, 0.07 + rnd() * 0.04, 600], // beam / rafter
  () => [0.2 + rnd() * 0.4, 0.15 + rnd() * 0.3, 0.2 + rnd() * 0.4, 1900], // clump
];
for (let i = 0; i < N; i++) {
  const [hx, hy, hz, rho] = kinds[i % 4]();
  const shape = createRigidBox(hx, hy, hz, rho, { restitution: 0.14, friction: 0.72, rolling: 0.15 });
  const yaw = rnd() * Math.PI * 2, tilt = (rnd() - 0.5) * 0.6;
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), ct = Math.cos(tilt / 2), st = Math.sin(tilt / 2);
  // yaw then a tilt about x
  const q = { qx: ct * 0 + st * cy, qy: sy * ct, qz: -st * sy * 0, qw: cy * ct };
  // a lattice (no body starts inside another): 4 x 4 cells of 3.2 m, layers 0.75 m apart, a small random yaw only
  const cell = i % 16, layer = (i / 16) | 0;
  const cx = ((cell % 4) - 1.5) * 3.2 + (rnd() - 0.5) * 0.3, cz = (((cell / 4) | 0) - 1.5) * 3.2 + (rnd() - 0.5) * 0.3;
  const yaw2 = (rnd() - 0.5) * 0.3;
  pool.spawn(shape, { x: cx, y: 0.6 + layer * 0.75, z: cz, qx: 0, qy: Math.sin(yaw2 / 2), qz: 0, qw: Math.cos(yaw2 / 2),
    vx: (rnd() - 0.5) * 1.5, vy: 0, vz: (rnd() - 0.5) * 1.5, wx: (rnd() - 0.5), wz: (rnd() - 0.5) }, layer * 0.25);
  void q; void tilt;
}
const ms = [];
let awakeAt = [];
for (let f = 0; f < S * 60; f++) {
  const c0 = process.cpuUsage();
  pool.advance(1 / 60);
  const c = process.cpuUsage(c0);
  ms.push((c.user + c.system) / 1000);
  if (f % 120 === 119) awakeAt.push(pool.world.awakeCount);
}
const sorted = ms.slice(60).sort((x, y) => x - y);
const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const asleep = (() => { let n = 0; for (let k = 0; k < pool.world.capacity; k++) if (pool.world.active[k] && pool.world.asleep[k]) n++; return n; })();
// a digest of the final poses (determinism across runs)
let h = 0x811c9dc5;
for (let k = 0; k < pool.world.capacity; k++) if (pool.world.active[k]) for (const v of [pool.world.px[k], pool.world.py[k], pool.world.pz[k], pool.world.qw[k]]) { const b = new Float64Array([v]); const u = new Uint32Array(b.buffer); h = Math.imul(h ^ u[0], 0x01000193) >>> 0; h = Math.imul(h ^ u[1], 0x01000193) >>> 0; }
console.log(`heap ${N} bodies, ${S} s: advance CPU mean ${mean.toFixed(3)} ms, p95 ${q(0.95).toFixed(2)}, p99 ${q(0.99).toFixed(2)}, max ${sorted[sorted.length - 1].toFixed(2)}; awake every 2 s ${awakeAt.join('/')}; asleep at end ${asleep}; digest ${h.toString(16)}`);
{
  const W = pool.world, rows = [];
  for (let k = 0; k < W.capacity; k++) {
    if (!W.active[k] || W.asleep[k]) continue;
    const v = Math.hypot(W.vx[k], W.vy[k], W.vz[k]), w = Math.hypot(W.wx[k], W.wy[k], W.wz[k]);
    const sh = W.shape(k);
    rows.push({ k, v, w, y: W.py[k], m: sh.mass, ir: Math.max(...sh.invInertia) / Math.min(...sh.invInertia) });
  }
  rows.sort((a, b) => b.w - a.w);
  const buckets = { 'v<0.07&w<0.12 (quiet)': 0, 'w 0.12-0.5': 0, 'w 0.5-2': 0, 'w>2': 0 };
  for (const r of rows) { if (r.v < 0.07 && r.w < 0.12) buckets['v<0.07&w<0.12 (quiet)']++; else if (r.w < 0.5) buckets['w 0.12-0.5']++; else if (r.w < 2) buckets['w 0.5-2']++; else buckets['w>2']++; }
  console.log('  awake at end:', rows.length, JSON.stringify(buckets), 'fastest:', rows.slice(0, 5).map((r) => `#${r.k} v${r.v.toFixed(2)} w${r.w.toFixed(2)} y${r.y.toFixed(2)} m${r.m.toFixed(0)}`).join(', '));
  const lows = rows.filter((r) => r.y < -0.05); console.log('  bodies below ground:', lows.length);
}
// cost by phase of the run: first 4 s (falling), 4-8 s (settling), 8-14 s (resting)
const seg = (a0, a1) => { const s = ms.slice(a0 * 60, a1 * 60); return (s.reduce((x, y) => x + y, 0) / s.length).toFixed(3); };
console.log(`  mean ms by phase: 0-4 s ${seg(0, 4)}, 4-8 s ${seg(4, 8)}, 8-14 s ${seg(8, Math.min(14, S))}`);
