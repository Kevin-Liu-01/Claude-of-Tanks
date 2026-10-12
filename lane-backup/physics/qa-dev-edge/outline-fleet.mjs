// every spec's turret profile with the outline: no throw, outline counts, base face, launch speeds
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile, turretLaunchVelocity } = await import('../src/sim/wreckTurrets.ts');
let errors = 0, none = 0, boxFallback = 0;
const counts = [], ups = [];
const out = new Float64Array(6);
for (const [id, spec] of Object.entries(TANK_SPECS)) {
  let p;
  try { p = wreckTurretProfile(spec, 1); } catch (e) { errors++; console.log('THROW', id, String(e).slice(0, 120)); continue; }
  if (!p.shape) { none++; continue; }
  const n = Array.from(p.shape.sphereSolid).filter((k) => k === 0).length;
  counts.push([n, id]);
  if (n > 40) boxFallback++;
  let r = 0.5; const rnd = () => r;
  turretLaunchVelocity('ammorack', spec.weightTons ?? 40, rnd, out, p.shape.mass);
  ups.push([out[1], id, p.shape.mass]);
}
counts.sort((a, b) => a[0] - b[0]); ups.sort((a, b) => a[0] - b[0]);
console.log('errors', errors, 'turretless', none, 'outline counts min', counts.slice(0, 4).map((c) => c.join(':')).join(' '), 'max', counts.slice(-3).map((c) => c.join(':')).join(' '), 'over 40 (box grid?)', boxFallback);
console.log('mean-draw cook-off up m/s: lowest', ups.slice(0, 3).map((u) => `${u[1]} ${u[0].toFixed(1)} (${(u[2] / 1000).toFixed(1)} t)`).join(', '), '| highest', ups.slice(-3).map((u) => `${u[1]} ${u[0].toFixed(1)} (${(u[2] / 1000).toFixed(1)} t)`).join(', '));
