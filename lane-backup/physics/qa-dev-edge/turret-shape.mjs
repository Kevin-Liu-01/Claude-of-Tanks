// physics lane scratch: the turret armour's vertex cloud per height band (how much it narrows toward the roof).
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const ids = (process.argv.find((a) => a.startsWith('--ids='))?.slice(6) ?? 't90m,m1a2,kv2,leopard2a6,t72b3,abramsx').split(',');
for (const id of ids) {
  const spec = TANK_SPECS[id]; if (!spec) { console.log(id, 'missing'); continue; }
  const a = spec.armor;
  const pts = [];
  for (const pl of a.turretPlates ?? []) for (const v of pl.verts) pts.push(v);
  const cells = a.collisionShells?.turret ?? [];
  for (const c of cells) for (let k = 0; k < 8; k++) pts.push([k & 1 ? c.max[0] : c.min[0], k & 2 ? c.max[1] : c.min[1], k & 4 ? c.max[2] : c.min[2]]);
  const ys = pts.map((p) => p[1]);
  const y0 = Math.max(0.02, Math.min(...ys)), y1 = Math.max(...ys);
  console.log(`${id}: ${a.turretPlates?.length ?? 0} plates, ${cells.length} cells, ${pts.length} points, y ${y0.toFixed(2)}..${y1.toFixed(2)}`);
  for (let b = 0; b < 5; b++) {
    const lo = y0 + (y1 - y0) * b / 5, hi = y0 + (y1 - y0) * (b + 1) / 5;
    const band = pts.filter((p) => p[1] >= lo - 1e-6 && p[1] <= hi + 1e-6);
    if (!band.length) { console.log(`  band ${b}: none`); continue; }
    const xs = band.map((p) => p[0]), zs = band.map((p) => p[2]);
    console.log(`  y ${lo.toFixed(2)}-${hi.toFixed(2)}: x ${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}  z ${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)}  (${band.length})`);
  }
}
