import { getSpec, ALL_TANK_IDS } from './wt/src/vehicles/specs.ts';
import { wreckTurretProfile } from './wt/src/sim/wreckTurrets.ts';
for (const id of ALL_TANK_IDS) { const s = getSpec(id); const p = wreckTurretProfile(s); console.log(id, s.weightTons, !!p.shape, p.shape ? (p.shape.mass/1000).toFixed(1) : '-'); }
