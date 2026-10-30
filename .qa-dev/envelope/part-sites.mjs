// Lane tool (envelope-honesty-264): every part of a build (all buckets) with its bucket, parent, box and builder line.
//   cd <tree> && node <this> <out-dir> <id,id,...>     writes <out-dir>/<id>.json [{bucket,parent,min,max,site,caller}]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [outDir, list] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const imp = (p) => import(pathToFileURL(resolve(p)).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { createTank } = await imp('src/vehicles/tankFactory.ts');
const { authorSite, parseStackFrames } = await imp('tools/anatomy-floor-ledger.mjs');
const key = (min, max) => [...min, ...max].map((v) => v.toFixed(6)).join(',');
for (const id of list.split(',')) {
  const census = [];
  const partCensus = (bucket, part) => {
    const limit = Error.stackTraceLimit; Error.stackTraceLimit = 40;
    const stack = new Error().stack || ''; Error.stackTraceLimit = limit;
    census.push({ bucket, part, ...authorSite(parseStackFrames(stack)) });
  };
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, partCensus });
  const siteOf = new Map();
  for (const e of census) {
    if (!e.part.boundingBox) e.part.computeBoundingBox();
    const b = e.part.boundingBox;
    if (b && !b.isEmpty()) siteOf.set(`${e.bucket}|${key(b.min.toArray(), b.max.toArray())}`, e);
  }
  // boxes in the owner rig's frame, as tools/envelope-census.mjs measures them (a receipt is local to its bucket's mesh)
  tank.root.updateMatrixWorld(true);
  const rigs = { turretG: tank.root.getObjectByName('rig_turret'), hullG: tank.root.getObjectByName('rig_hull') };
  const meshes = new Map();
  tank.root.traverse((o) => { if (o.geometry && !meshes.has(o.name)) meshes.set(o.name, o); });
  const rows = (tank.root.userData.combatGeometryParts || []).map((p) => {
    const s = siteOf.get(`${p.bucket}|${key(p.min, p.max)}`);
    const rig = rigs[p.parent] ?? rigs.hullG, mesh = meshes.get(p.bucket);
    let box = new THREE.Box3(new THREE.Vector3().fromArray(p.min), new THREE.Vector3().fromArray(p.max)), framed = false;
    if (rig && mesh) { box = box.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rig.matrixWorld.clone().invert(), mesh.matrixWorld)); framed = true; }
    return { bucket: p.bucket, parent: p.parent, framed, min: box.min.toArray().map((v) => +v.toFixed(4)), max: box.max.toArray().map((v) => +v.toFixed(4)),
      raw: [...p.min, ...p.max].map((v) => +v.toFixed(4)), site: s?.site ?? null, caller: s?.caller ?? null };
  });
  tank.dispose?.();
  writeFileSync(`${outDir}/${id}.json`, JSON.stringify(rows));
  console.log(`${id}: ${rows.length} parts, ${rows.filter((r) => r.site).length} with sites`);
}
