// Lane tool (envelope-honesty-264): how far each main plate sits from the honest shell — the lane build's own 'turret'
// and 'hull' meshes (the primary buckets after the moves) — for two plate-geo.mjs dumps (263 and the lane), per id.
// A ray from 2 m outside the plate's centre runs in along its normal; gap = how far outside the plate the shell's first
// face lies (negative: the plate floats outside the shell). Same geometry for both dumps: the look is identical.
//   cd <lane> && node <this> <base-plates.json> <lane-plates.json> <id,...>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const imp = (p) => import(pathToFileURL(resolve(p)).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { createTank } = await imp('src/vehicles/tankFactory.ts');
const [baseLog, laneLog, list] = process.argv.slice(2);
const B = JSON.parse(readFileSync(baseLog, 'utf8')), L = JSON.parse(readFileSync(laneLog, 'utf8'));
const ray = new THREE.Raycaster();
for (const id of list.split(',')) {
  const tank = createTank(id, null, { proceduralOnly: true, camoSeed: 4100, quality: 'high', materialMode: 'geometry-only' });
  tank.root.updateMatrixWorld(true);
  const rig = { T: tank.root.getObjectByName('rig_turret'), H: tank.root.getObjectByName('rig_hull') };
  const shell = { T: [], H: [] };
  for (const z of ['T', 'H']) rig[z]?.traverse((o) => { if (o.isMesh && (o.name === (z === 'T' ? 'turret' : 'hull'))) shell[z].push(o); });
  const gap = (p) => {
    const r = rig[p.zone]; if (!r || !shell[p.zone].length) return null;
    const n = new THREE.Vector3(...p.n).normalize(), c = new THREE.Vector3(...p.c);
    const o = c.clone().addScaledVector(n, 2).applyMatrix4(r.matrixWorld);
    const d = n.clone().negate().transformDirection(r.matrixWorld);
    ray.set(o, d); ray.far = 6;
    const hit = ray.intersectObjects(shell[p.zone], false)[0];
    return hit ? 2 - hit.distance : null;
  };
  const rows = [];
  for (const lp of L[id] || []) {
    const bp = (B[id] || []).find((p) => p.zone === lp.zone && p.name === lp.name);
    if (!bp) continue;
    const gb = gap(bp), gl = gap(lp);
    if (gb === null && gl === null) continue;
    rows.push({ k: `${lp.zone} ${lp.name}`, gb, gl });
  }
  const f = (g) => (g === null ? '  miss' : (g >= 0 ? ' ' : '') + g.toFixed(2));
  const worse = rows.filter((r) => r.gl !== null && r.gb !== null && Math.abs(r.gl) > Math.abs(r.gb) + 0.03);
  const better = rows.filter((r) => r.gl !== null && r.gb !== null && Math.abs(r.gl) + 0.03 < Math.abs(r.gb));
  console.log(`${id}: ${rows.length} main plates; closer to the shell ${better.length}, further ${worse.length}`);
  for (const r of [...worse, ...better]) console.log(`   ${worse.includes(r) ? 'FURTHER' : 'closer '} ${r.k.padEnd(28)} 263 ${f(r.gb)}  lane ${f(r.gl)}`);
  tank.dispose?.();
}
