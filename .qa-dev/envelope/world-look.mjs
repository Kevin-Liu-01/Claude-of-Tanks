// Lane tool (envelope-honesty-264): the look on the FINAL build, generated tables applied (turret seats, ring receipts,
// mission docks, markings, spare track): every visible triangle in vehicle space, rounded to 0.1 mm, with its material's
// type, colour and texture presence. A bucket move only regroups triangles between merged meshes, so the sorted
// multiset is identical; a re-seated turret, a moved dock or decal is not. Vertex colours (the dust bake) are left out.
//   cd <tree> && node <this> <out-dir> <id,id,...>           writes <out-dir>/<id>.json { tris, digest, buckets }
//   node <this> --compare <base-dir> <after-dir> <id,...>    exit 1 on any digest difference, with the first diffs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const argv = process.argv.slice(2);
if (argv[0] === '--compare') {
  const [, baseDir, afterDir, list] = argv;
  let bad = 0;
  for (const id of list.split(',')) {
    const a = JSON.parse(readFileSync(`${baseDir}/${id}.json`, 'utf8')), b = JSON.parse(readFileSync(`${afterDir}/${id}.json`, 'utf8'));
    if (a.digest === b.digest) { console.log(`${id}: world look identical (${b.count} triangles)`); continue; }
    bad++;
    const A = new Map(), B = new Map();
    for (const t of a.tris) A.set(t, (A.get(t) || 0) + 1);
    for (const t of b.tris) B.set(t, (B.get(t) || 0) + 1);
    const gone = [...A].filter(([t, n]) => (B.get(t) || 0) < n).map(([t]) => t), added = [...B].filter(([t, n]) => (A.get(t) || 0) < n).map(([t]) => t);
    const by = (list, names) => { const c = {}; for (const t of list) { const n = names?.[t] ?? '?'; c[n] = (c[n] || 0) + 1; } return JSON.stringify(c); };
    console.log(`${id}: WORLD LOOK CHANGED: ${a.count} -> ${b.count} triangles, ${gone.length} gone ${by(gone, a.names)}, ${added.length} new ${by(added, b.names)}`);
  }
  process.exitCode = bad ? 1 : 0;
} else {
  const [outDir, list] = argv;
  mkdirSync(outDir, { recursive: true });
  const imp = (p) => import(pathToFileURL(resolve(p)).href);
  const THREE = await imp('node_modules/three/build/three.module.js');
  const { createTank } = await imp('src/vehicles/tankFactory.ts');
  const r = (v) => (Math.round(v * 1e4) / 1e4).toFixed(4);
  const v = new THREE.Vector3();
  for (const id of list.split(',')) {
    const tank = createTank(id, null, { proceduralOnly: true, camoSeed: 4100, quality: 'high', materialMode: 'geometry-only' });
    tank.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(tank.root.matrixWorld).invert();
    const tris = [], names = new Map();
    tank.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || o.userData?.interiorFill) return;
      // what a colour camera draws (src/vehicles/tankAssets.ts cameraDraws): shown up the tree, layer 0, a visible
      // colour-writing material; generated interior fills are left out as the asset fingerprint leaves them out
      let shown = true; for (let p = o; p; p = p.parent) if (p.visible === false) shown = false;
      if (!shown || (o.layers && (o.layers.mask & 1) === 0)) return;
      const drawn = (Array.isArray(o.material) ? o.material : [o.material]).some((m) => m && m.visible !== false && m.colorWrite !== false);
      if (!drawn) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position, index = o.geometry.index;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const groups = o.geometry.groups?.length ? o.geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
      const n = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < n; k++) {
        const mk = new THREE.Matrix4();
        if (o.isInstancedMesh) { o.getMatrixAt(k, mk); mk.premultiply(m); } else mk.copy(m);
        for (const g of groups) {
          const mat = mats[g.materialIndex ?? 0];
          const mkey = mat ? `${mat.type}:${mat.color ? mat.color.getHexString() : '-'}:${mat.map ? 'map' : '-'}:${mat.transparent ? 't' : 'o'}` : 'none';
          for (let i = g.start; i + 2 < g.start + g.count; i += 3) {
            const corners = [];
            for (let c = 0; c < 3; c++) { v.fromBufferAttribute(pos, index ? index.getX(i + c) : i + c).applyMatrix4(mk); corners.push(`${r(v.x)},${r(v.y)},${r(v.z)}`); }
            corners.sort();
            tris.push(`${mkey}|${corners.join('|')}`); names.set(tris.at(-1), o.name || o.parent?.name || '?');
          }
        }
      }
    });
    tank.dispose?.();
    tris.sort();
    const digest = createHash('sha256').update(tris.join('\n')).digest('hex');
    writeFileSync(`${outDir}/${id}.json`, JSON.stringify({ id, count: tris.length, digest, tris, names: Object.fromEntries(names) }));
    console.log(`${id}: ${tris.length} triangles ${digest.slice(0, 12)}`);
  }
}
