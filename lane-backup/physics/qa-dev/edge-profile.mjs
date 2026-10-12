// physics lane scratch (edge stand): the turret bodies' boxes, mass, COM, inertia and spheres.
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
for (const id of ['t90m', 'm1a2', 'kv2']) {
  const p = wreckTurretProfile(TANK_SPECS[id], 1);
  const s = p.shape;
  const r = (v) => Array.from(v, (x) => +x.toFixed(3));
  console.log(id, 'tons', TANK_SPECS[id].weightTons, 'turretCenter', r(p.turretCenter), 'turretHalf', r(p.turretHalf), 'mass', Math.round(s.mass),
    'com', r(s.com), 'I', r(Array.from(s.invInertia, (x) => 1 / x)), 'spheres', s.sphereCount, 'solids', s.solidCount);
  const radii = new Map();
  for (let i = 0; i < s.sphereCount; i++) { const k = s.spheres[i * 4 + 3].toFixed(3) + ' solid' + s.sphereSolid[i]; radii.set(k, (radii.get(k) ?? 0) + 1); }
  console.log('  sphere radii', JSON.stringify(Object.fromEntries(radii)));
  // the box sphere layout extents (solid 0)
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < s.sphereCount; i++) if (s.sphereSolid[i] === 0) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], s.spheres[i * 4 + k]); mx[k] = Math.max(mx[k], s.spheres[i * 4 + k]); }
  console.log('  box spheres span (COM frame)', r(mn), r(mx), 'barrel solid', r(s.solids.slice(14, 22)));
}
