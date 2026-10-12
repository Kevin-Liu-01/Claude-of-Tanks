// physics lane scratch: the first-pop cost of a turret profile per spec (cold), and a cached call.
import { performance } from 'node:perf_hooks';
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const rows = [];
const order = Object.keys(TANK_SPECS);
console.log('first specs', order.slice(0, 3).join(' '));
if (process.argv.includes('--warm')) for (const spec of Object.values(TANK_SPECS)) { try { wreckTurretProfile(spec, 0.5); } catch {} }
for (const [id, spec] of Object.entries(TANK_SPECS)) {
  const t0 = performance.now();
  let p = null; try { p = wreckTurretProfile(spec, 1); } catch (e) { p = { err: String(e).slice(0, 80) }; }
  const t1 = performance.now();
  wreckTurretProfile(spec, 1);
  const t2 = performance.now();
  rows.push({ id, coldMs: +(t1 - t0).toFixed(3), warmMs: +(t2 - t1).toFixed(4), spheres: p?.shape?.sphereCount ?? null, err: p?.err });
}
rows.sort((a, b) => b.coldMs - a.coldMs);
console.log('specs', rows.length, 'total cold ms', rows.reduce((s, r) => s + r.coldMs, 0).toFixed(1));
for (const r of rows.slice(0, 12)) console.log(JSON.stringify(r));
console.log('errors', rows.filter((r) => r.err).length, 'no shape', rows.filter((r) => r.spheres == null).map((r) => r.id).join(' '));
