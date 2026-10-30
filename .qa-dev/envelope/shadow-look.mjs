// Lane tool (envelope-honesty-264): the parts of the look world-look.mjs does not prove. (1) Every shadow-casting mesh the
// colour camera does not draw (the procShadow_* proxies, the Gallery's glass shell), as vehicle-space triangles rounded to
// 0.1 mm, sorted and digested. (2) The LOD sets: the colour-drawn triangles kept at every distance and those inside a
// THREE.LOD wrapper (culled past the detail distance), each as one sorted digest, so a part that changes LOD membership shows.
//   cd <tree> && node <this> <out-dir> <id,...>        writes <out-dir>/<id>.json { digest, count, names }
//   node <this> --compare <base-dir> <after-dir> <id,...>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const argv = process.argv.slice(2);
if (argv[0] === '--compare') {
  const [, a, b, list] = argv; let bad = 0;
  for (const id of list.split(',')) {
    const x = JSON.parse(readFileSync(`${a}/${id}.json`, 'utf8')), y = JSON.parse(readFileSync(`${b}/${id}.json`, 'utf8'));
    const diff = Object.keys({ ...x.names, ...y.names }).filter((n) => x.names[n]?.digest !== y.names[n]?.digest)
      .map((n) => `${n} ${x.names[n]?.count ?? 0}->${y.names[n]?.count ?? 0} tris, box ${x.names[n]?.box ?? '-'} -> ${y.names[n]?.box ?? '-'}`);
    if (!diff.length) console.log(`${id}: shadow casters and LOD sets identical`); else { bad++; console.log(`${id}: SHADOW/LOD CHANGED: ${diff.join('; ')}`); }
  }
  process.exitCode = bad ? 1 : 0;
} else {
  const [outDir, list] = argv; mkdirSync(outDir, { recursive: true });
  const imp = (p) => import(pathToFileURL(resolve(p)).href);
  const THREE = await imp('node_modules/three/build/three.module.js');
  const { createTank } = await imp('src/vehicles/tankFactory.ts');
  const r = (v) => (Math.round(v * 1e4) / 1e4).toFixed(4);
  for (const id of list.split(',')) {
    const tank = createTank(id, null, { proceduralOnly: true, camoSeed: 4100, quality: 'high', materialMode: 'geometry-only' });
    tank.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(tank.root.matrixWorld).invert();
    const names = {}; const v = new THREE.Vector3(); const lod = { kept: [], wrapped: [] };
    tank.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || o.userData?.interiorFill) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const colour = mats.some((m) => m && m.colorWrite !== false && m.visible !== false) && (o.layers.mask & 1);
      if (colour) { // LOD membership of what the colour camera draws
        let wrapped = false; for (let p = o.parent; p; p = p.parent) if (p.isLOD) wrapped = true;
        const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
        const into = wrapped ? lod.wrapped : lod.kept;
        for (let i = 0; i + 2 < n; i += 3) { const c = [];
          for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m); c.push(`${r(v.x)},${r(v.y)},${r(v.z)}`); }
          into.push(c.sort().join(' ')); }
        return;
      }
      if (!o.castShadow) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
      const tris = []; const box = new THREE.Box3();
      for (let i = 0; i + 2 < n; i += 3) {
        const c = [];
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m); box.expandByPoint(v); c.push(`${r(v.x)},${r(v.y)},${r(v.z)}`); }
        tris.push(c.sort().join(' '));
      }
      tris.sort();
      const path = []; for (let p = o; p && p !== tank.root; p = p.parent) path.unshift(p.name || p.type);
      const key = path.join('/'); const b = (x) => `${x.x.toFixed(2)},${x.y.toFixed(2)},${x.z.toFixed(2)}`;
      names[key] = { count: tris.length, digest: createHash('sha256').update(tris.join('\n')).digest('hex').slice(0, 16), box: `${b(box.min)}..${b(box.max)}` };
    });
    for (const [k, list] of Object.entries(lod)) { list.sort();
      names[`LOD:${k}`] = { count: list.length, digest: createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 16), box: '-' }; }
    writeFileSync(`${outDir}/${id}.json`, JSON.stringify({ id, names }));
    tank.dispose?.();
  }
}
