// physics lane scratch: tipping margins of the turret body resting on each face (rear, front, ±side, roof, base):
// the box's contact layout vs the armour cloud's extreme points (plates + cells, floored on the ring plane).
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const ids = (process.argv.find((a) => a.startsWith('--ids='))?.slice(6) ?? 't90m,m1a2,kv2').split(',');
const dirs = { rear: [0, 0, -1], front: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0], roof: [0, 1, 0], base: [0, -1, 0] };
function hull2d(pts) { // monotone chain
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function margin(points, com, d) {
  // the face: points within 3 cm of the extreme plane along d; in-plane axes
  const dot = (p) => p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
  const ext = Math.max(...points.map(dot));
  const face = points.filter((p) => dot(p) >= ext - 0.03);
  const ax = Math.abs(d[0]) > 0.5 ? [1, 2] : Math.abs(d[1]) > 0.5 ? [0, 2] : [0, 1];
  const poly = hull2d(face.map((p) => [p[ax[0]], p[ax[1]]]));
  const c = [com[ax[0]], com[ax[1]]];
  const h = ext - dot(com); // COM height above the face plane
  if (poly.length < 3) return { h: +h.toFixed(2), margin: 0, deg: 0, n: face.length };
  // signed distance from c to the polygon edges (min over edges; positive inside for CCW)
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
    const dist = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / len;
    best = Math.min(best, -dist);
  }
  return { h: +h.toFixed(2), margin: +best.toFixed(2), deg: +(Math.atan2(best, h) * 180 / Math.PI).toFixed(1), n: face.length };
}
for (const id of ids) {
  const spec = TANK_SPECS[id], prof = wreckTurretProfile(spec, 1), s = prof.shape;
  const com = Array.from(s.com);
  // the box layout's sphere centres in the frame (spheres are stored COM-relative), barrel solid excluded
  const box = [];
  for (let i = 0; i < s.sphereCount; i++) if (s.sphereSolid[i] === 0) box.push([s.spheres[i * 4] + com[0], s.spheres[i * 4 + 1] + com[1], s.spheres[i * 4 + 2] + com[2]]);
  const a = spec.armor, cloud = [];
  for (const pl of a.turretPlates ?? []) for (const v of pl.verts) cloud.push([v[0], Math.max(0.02, v[1]), v[2]]);
  for (const c of a.collisionShells?.turret ?? []) for (let k = 0; k < 8; k++) cloud.push([k & 1 ? c.max[0] : c.min[0], Math.max(0.02, k & 2 ? c.max[1] : c.min[1]), k & 4 ? c.max[2] : c.min[2]]);
  console.log(id, 'COM', com.map((v) => v.toFixed(2)).join(','));
  for (const [name, d] of Object.entries(dirs)) {
    const mb = margin(box, com, d), mc = margin(cloud, com, d);
    console.log(`  ${name.padEnd(5)} box: h ${mb.h} margin ${mb.margin} m (${mb.deg}°, ${mb.n} pts)   armour: h ${mc.h} margin ${mc.margin} m (${mc.deg}°, ${mc.n} pts)`);
  }
}
