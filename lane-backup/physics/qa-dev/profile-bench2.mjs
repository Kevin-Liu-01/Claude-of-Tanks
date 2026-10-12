// physics lane scratch: armour access vs the profile itself, per spec, after a warm-up pass of other specs.
import { performance } from 'node:perf_hooks';
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const ids = Object.keys(TANK_SPECS);
const desc = Object.getOwnPropertyDescriptor(TANK_SPECS[ids[0]], 'armor');
console.log('armor descriptor of', ids[0], desc ? (desc.get ? 'getter' : 'value') : 'none (prototype?)');
// warm the JIT on the first 20 specs (armour + profile at 0.5), then measure the rest
for (const id of ids.slice(0, 20)) { void TANK_SPECS[id].armor; wreckTurretProfile(TANK_SPECS[id], 0.5); }
const rows = [];
for (const id of ids.slice(20)) {
  const spec = TANK_SPECS[id];
  const t0 = performance.now(); void spec.armor; const t1 = performance.now();
  wreckTurretProfile(spec, 1); const t2 = performance.now();
  rows.push({ id, armorMs: +(t1 - t0).toFixed(3), profileMs: +(t2 - t1).toFixed(3) });
}
const by = (k) => [...rows].sort((a, b) => b[k] - a[k]);
console.log('armour top', JSON.stringify(by('armorMs').slice(0, 5)));
console.log('profile top', JSON.stringify(by('profileMs').slice(0, 8)));
const med = (k) => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
console.log('median armour', med('armorMs'), 'median profile', med('profileMs'));
