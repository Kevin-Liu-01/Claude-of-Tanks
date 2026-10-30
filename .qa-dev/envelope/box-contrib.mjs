// Lane tool (envelope-honesty-264): every mesh of a build with its vehicle-space box, visibility, colour write, layer and
// castShadow, sorted by name; for finding what Box3.setFromObject(root) (the icon page's projection box) reads.
//   cd <tree> && node <this> <id>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const imp = (p) => import(pathToFileURL(resolve(p)).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { createTank } = await imp('src/vehicles/tankFactory.ts');
const id = process.argv[2];
const tank = createTank(id, null, { proceduralOnly: true, camoSeed: 4100, quality: 'high', materialMode: 'geometry-only' });
tank.root.updateMatrixWorld(true);
const r = (v) => v.toFixed(3);
const all = new THREE.Box3().setFromObject(tank.root);
console.log(`ROOT ${r(all.min.x)},${r(all.min.y)},${r(all.min.z)} .. ${r(all.max.x)},${r(all.max.y)},${r(all.max.z)}`);
const rows = [];
tank.root.traverse((o) => {
  if (!o.isMesh && !o.isLine && !o.isPoints) return;
  const b = new THREE.Box3().setFromObject(o, false);
  let shown = true; for (let p = o; p; p = p.parent) if (p.visible === false) shown = false;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const cw = mats.some((m) => m && m.colorWrite !== false && m.visible !== false);
  const path = []; for (let p = o; p && p !== tank.root; p = p.parent) path.unshift(p.name || p.type);
  rows.push(`${path.join('/')} shown=${shown} cw=${cw} layer=${o.layers.mask} cast=${o.castShadow} ${r(b.min.x)},${r(b.min.y)},${r(b.min.z)} .. ${r(b.max.x)},${r(b.max.y)},${r(b.max.z)}`);
});
rows.sort();
for (const row of rows) console.log(row);
