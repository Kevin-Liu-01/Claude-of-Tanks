// Lane tool (envelope-honesty-264): every main plate's centre and Newell normal (from its authored winding) per id.
//   cd <tree> && node <this> <out.json> <id,...>
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const imp = (p) => import(pathToFileURL(resolve(p)).href);
await imp('src/vehicles/tankFactory.ts');
const { getSpec } = await imp('src/vehicles/specs.ts');
const [out, list] = process.argv.slice(2);
const res = {};
for (const id of list.split(',')) {
  const a = getSpec(id).armor; res[id] = [];
  for (const [zone, plates] of [['T', a.turretPlates], ['H', a.hullPlates]]) for (const p of plates ?? []) {
    if ((p.kind || 'main') !== 'main' || !p.verts?.length) continue;
    const v = p.verts, c = [0, 0, 0], n = [0, 0, 0];
    for (const q of v) for (let k = 0; k < 3; k++) c[k] += q[k] / v.length;
    for (let i = 0; i < v.length; i++) { const a0 = v[i], b0 = v[(i + 1) % v.length];
      n[0] += (a0[1] - b0[1]) * (a0[2] + b0[2]); n[1] += (a0[2] - b0[2]) * (a0[0] + b0[0]); n[2] += (a0[0] - b0[0]) * (a0[1] + b0[1]); }
    const l = Math.hypot(...n) || 1;
    res[id].push({ zone, name: p.name, c, n: n.map((x) => x / l) });
  }
}
writeFileSync(out, JSON.stringify(res));
