// eraModuleKit.selftest.mjs — the permanent stock's banded raycast (UI-LOCKDOWN E, 2026-10-25): every seat ray a Stock
// answers through its height bands or plan cells finds exactly what three's raycast over the whole meshes finds (the
// same point and normal, bit for bit, and the same miss), for level rays, vertical rays, rays laid on vertex heights and
// band edges, coincident triangles and oblique rays, and after a stock mesh is added between queries. The fleet proof is
// the geometry ledger of the ERA packages' tanks (t72b3m_hetman, t72b3m_hetman_ii, t72b3_sich, t72b3_zubr, t72b3_zubr_ii).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Stock } from './eraModuleKit.ts';

let seed = 7;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const geometries = [
  new THREE.IcosahedronGeometry(0.9, 3).translate(0.2, 0.5, -0.1),
  new THREE.BoxGeometry(1.4, 0.6, 2.2, 3, 2, 4).translate(0, 0.3, 0.4),
  new THREE.CylinderGeometry(0.5, 0.7, 0.8, 24, 3).translate(-0.6, 0.9, 0.2),
  new THREE.TorusGeometry(0.6, 0.15, 12, 32).rotateX(Math.PI / 2).translate(0.3, 1.1, -0.5),
];
// a soup of loose triangles, two of them coincident (a tie three breaks by order)
const soup = [];
for (let i = 0; i < 300; i++) for (let k = 0; k < 9; k++) soup.push((random() - 0.5) * 2.4 + (k % 3 === 1 ? 0.6 : 0));
soup.push(-0.4, 0.5, 1.2, 0.4, 0.5, 1.2, 0, 1.0, 1.2, -0.4, 0.5, 1.2, 0.4, 0.5, 1.2, 0, 1.0, 1.2);
const loose = new THREE.BufferGeometry();
loose.setAttribute('position', new THREE.Float32BufferAttribute(soup, 3));
geometries.push(loose);

// three's own answer, as Stock.face asked it before the bands
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const reference = (geos) => {
  const meshes = geos.map((g) => { const m = new THREE.Mesh(g, material); m.updateMatrixWorld(true); return m; });
  const ray = new THREE.Raycaster();
  return (origin, direction) => {
    const dir = new THREE.Vector3(...direction).normalize();
    ray.set(new THREE.Vector3(...origin), dir);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit?.face) return null;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return { point: hit.point.toArray(), normal: normal.toArray() };
  };
};
const same = (stock, ref, origin, direction, what) => {
  const got = stock.tryFace(origin, direction), want = ref(origin, direction);
  assert.deepEqual(got && { point: got.point.toArray(), normal: got.normal.toArray() }, want, `${what} from ${origin} along ${direction}`);
  return !!want;
};

const stock = new Stock('selftest', geometries.slice(0, 3));
let ref = reference(geometries.slice(0, 3));
let hits = 0, rays = 0;
const level = () => { const a = random() * Math.PI * 2; return [[Math.cos(a) * 3, random() * 1.8 - 0.2, Math.sin(a) * 3], [-Math.cos(a), 0, -Math.sin(a)]]; };
for (let i = 0; i < 400; i++) { const [o, d] = level(); hits += same(stock, ref, o, d, 'level ray'); rays++; }
// stock grows between queries: the new meshes answer too, and the old bands stay right
stock.add(geometries[3]);
stock.add(geometries[4]);
ref = reference(geometries);
for (let i = 0; i < 400; i++) { const [o, d] = level(); hits += same(stock, ref, o, d, 'level ray after add'); rays++; }
// every vertex height of the box and the soup: rays laid exactly on triangle edges and band boundaries
const heights = new Set();
for (const g of [geometries[1], geometries[4]]) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 7) heights.add(p.getY(i)); }
for (const y of heights) for (const a of [0.3, 1.9, 3.7]) { hits += same(stock, ref, [Math.cos(a) * 3, y, Math.sin(a) * 3], [-Math.cos(a), 0, -Math.sin(a)], 'level ray on a vertex height'); rays++; }
// the coincident pair, straight on
hits += same(stock, ref, [0, 0.7, 3], [0, 0, -1], 'tie'); rays++;
// vertical rays (top) and oblique ones (whole meshes)
for (let i = 0; i < 300; i++) {
  const x = (random() - 0.5) * 2.6, z = (random() - 0.5) * 2.6;
  hits += same(stock, ref, [x, 4, z], [0, -1, 0], 'vertical ray'); rays++;
  hits += same(stock, ref, [x, 3, z], [random() - 0.5, -1, random() - 0.5], 'oblique ray'); rays++;
}
for (let i = 0; i < 100; i++) {
  const x = (random() - 0.5) * 2.6, z = (random() - 0.5) * 2.6, want = ref([x, 4, z], [0, -1, 0]);
  if (want) assert.equal(stock.top(x, z), want.point[1], `top at ${x},${z}`);
  else assert.throws(() => stock.top(x, z), /no permanent turret seat/);
}
assert.ok(hits > rays / 3, `the rays reach the stock (${hits} of ${rays})`);
stock.dispose();

console.log(`eraModuleKit.selftest: ${rays} level, vertical, edge, tie and oblique rays: the banded stock finds what three's raycast finds (${hits} hits)`);
