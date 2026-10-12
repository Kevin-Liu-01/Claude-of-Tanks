import { getSpec, ALL_TANK_IDS } from './wt/src/vehicles/specs.ts';
import { wreckTurretProfile } from './wt/src/sim/wreckTurrets.ts';
const t0 = performance.now();
let turretless = 0, n = 0, maxMass = 0, minMass = 1e9;
const rows = [];
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const p = wreckTurretProfile(spec);
  n++;
  if (!p.shape) { turretless++; continue; }
  maxMass = Math.max(maxMass, p.shape.mass); minMass = Math.min(minMass, p.shape.mass);
  rows.push([id, spec.weightTons, p.shape.mass / 1000 / spec.weightTons, p.turretHalf, p.hullHalf, p.shape.sphereCount]);
}
console.log('ids', n, 'turretless', turretless, 'turret mass t', (minMass/1000).toFixed(1), '..', (maxMass/1000).toFixed(1), 'ms', (performance.now()-t0).toFixed(0));
for (const r of rows.slice(0, 8)) console.log(r[0], r[1], 'share', r[2].toFixed(2), 'turretHalf', r[3].map(v=>v.toFixed(2)).join(','), 'hullHalf', r[4].map(v=>v.toFixed(2)).join(','), 'spheres', r[5]);
const shares = rows.map(r => r[2]).sort((a,b)=>a-b);
console.log('share p10', shares[Math.floor(shares.length*0.1)].toFixed(2), 'median', shares[Math.floor(shares.length*0.5)].toFixed(2), 'p90', shares[Math.floor(shares.length*0.9)].toFixed(2));
const m1 = getSpec('m1a2'); console.log('m1a2 pivot', m1.armor.turretPivot, 'gunPivot', m1.armor.gunPivot, 'barrel', m1.armor.gunBarrel, 'turretless', m1.armor.turretless);
