// Trees lane (2026-10-08, the gauntlet's wave 283a: low-view grass "card-like and translucent, flat identical cards"
// on Verdant, Amberford and Redrock): the near carpet's tuft is a clump of three blade cards (vegetation.ts
// buildGrassClumpGeometry) — six triangles, their headings uneven (no two within 35°, never the crossed planes' square),
// each card its own width and height, its top leaning out so the clump splays, each card its own shade — and the carpet
// draws it with its shades (the carpet material's vertex colour), while the mid and far chunks keep the crossed planes;
// a blade card's back face takes its own shade in the grass hook. A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGrassClumpGeometry, buildGrassTuftGeometry, GRASS_CLUMP_SHADES } from './vegetation.ts';

const report = {};
for (const variant of [0, 1]) {
  const [w, h] = variant === 0 ? [0.92, 0.74] : [1.14, 0.58];
  const clump = buildGrassClumpGeometry(w, h, variant), crossed = buildGrassTuftGeometry(w, h);
  const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  assert.equal(tris(clump), 6, `variant ${variant}: three cards, six triangles`);
  assert.equal(tris(crossed), 4, 'the crossed planes keep their four');
  assert.deepEqual(buildGrassClumpGeometry(w, h, variant).getAttribute('position').array, clump.getAttribute('position').array,
    'deterministic');
  // each card's four vertices (PlaneGeometry 1 × 1, merged in order): its heading from its bottom edge, its size, its splay
  const pos = clump.getAttribute('position'), col = clump.getAttribute('color');
  const cards = [0, 1, 2].map((k) => {
    const v = (i) => [pos.getX(k * 4 + i), pos.getY(k * 4 + i), pos.getZ(k * 4 + i)];
    const [tl, tr, bl, br] = [v(0), v(1), v(2), v(3)];
    const heading = Math.atan2(br[2] - bl[2], br[0] - bl[0]);
    const width = Math.hypot(br[0] - bl[0], br[2] - bl[2]), height = tl[1] - bl[1];
    const midTop = [(tl[0] + tr[0]) / 2, (tl[2] + tr[2]) / 2], midBottom = [(bl[0] + br[0]) / 2, (bl[2] + br[2]) / 2];
    const splay = Math.hypot(midTop[0] - midBottom[0], midTop[1] - midBottom[1]);
    return { heading, width, height, splay, shade: [col.getX(k * 4), col.getY(k * 4), col.getZ(k * 4)] };
  });
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    let d = Math.abs(cards[a].heading - cards[b].heading) % Math.PI;
    d = Math.min(d, Math.PI - d) * 180 / Math.PI;
    assert.ok(d >= 35, `variant ${variant}: cards ${a} and ${b} ${d.toFixed(0)}° apart`);
    assert.ok(Math.abs(d - 90) > 10 || a + b !== 1, `variant ${variant}: not the crossed planes' square`);
  }
  assert.ok(new Set(cards.map((c) => c.width.toFixed(3))).size === 3 && new Set(cards.map((c) => c.height.toFixed(3))).size === 3,
    `variant ${variant}: each card its own width and height`);
  assert.ok(cards.every((c) => c.splay > 0.02 * h), `variant ${variant}: every card's top leans out`);
  assert.equal(new Set(cards.map((c) => c.shade.join())).size, 3, `variant ${variant}: each card its own shade`);
  for (const c of cards) assert.ok(GRASS_CLUMP_SHADES.some((s) => s.every((x, i) => Math.abs(x - c.shade[i]) < 1e-6)),
    'the shades are the table\'s (as float32)');
  report[variant] = cards.map((c) => ({ deg: +(c.heading * 180 / Math.PI).toFixed(0), w: +c.width.toFixed(2), h: +c.height.toFixed(2),
    splay: +c.splay.toFixed(3) }));
}
// the carpet draws the clump with its shades; the chunks keep the crossed planes; the back face in its own shade
const source = await readFile(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.match(source, /new THREE\.InstancedMesh\(grassVariants\[vv\]\.geoCarpet, grassVariants\[vv\]\.matNear, CARPET_CAP\)/,
  'the near carpet draws the clump');
assert.match(source, /grassVariants\[gv\]\.matNear\.vertexColors = true;/, 'with its cards\' shades');
assert.match(source, /geoNear: grassVariants\[vv\]\.geo,/, 'the mid chunks keep the crossed planes');
assert.match(source, /if \(!gl_FrontFacing\) diffuseColor\.rgb \*= 0\.8;/, 'a blade card\'s back face in its own shade');
console.log(JSON.stringify(report));
console.log('grassClump.selftest: the near carpet\'s tufts are splayed clumps of three uneven blade cards, each its own shade; the back faces shaded PASS');
