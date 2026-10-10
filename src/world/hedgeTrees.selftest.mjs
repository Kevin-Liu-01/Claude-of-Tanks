// Trees lane (2026-10-06, the map lanes' request; Saltmere's Léon bocage first): a map's hedge trees
// (vegetation.ts VegetationConfig `hedgeTrees`, plantHedgeTrees) — on the real seeded producer of Saltmere Coast with a
// hedge config: every hedge tree stands in its land use's hedge band (landUseAt), a field tree's 5 m from every other
// tree, ordinary records (collision, concealment, the open form's field mark) of the mix's species, spaced along its
// line, the census honest (a gate a line, trees per hedge km); deterministic; the same map unset plants none and keeps
// its digest. A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { createLandFieldSample, landUseAt, resolveLandUseProfile } from './landUse.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

const digest = (world) => createHash('sha256').update(JSON.stringify(world._trees.map((t) => [t.species, t.variant, ...t.mat.elements.map((v) => +v.toFixed(5))]))).digest('hex').slice(0, 16);

const restore = canvasFixture();
try {
  const cfg = getMapConfig('coastal'), field = createHeightField(1337, cfg), profile = resolveLandUseProfile('coastal');
  const hedge = { mix: [['oak', 0.6], ['cedar', 0.4]], spacingM: 9, gateM: 4 };
  const build = (vegetation) => createVegetation(field, { setupShadowMaterial() {} }, 2001, { ...cfg, vegetation: { ...cfg.vegetation, ...vegetation } });
  const plain = build({}), hedged = build({ hedgeTrees: hedge }), replay = build({ hedgeTrees: hedge });
  try {
    // unset: none planted, the map's own digest
    assert.equal(plain.group.userData.hedgeTrees, undefined, 'unset: no hedge planting');
    assert.ok(plain._trees.every((t) => !t.hedgeRow), 'unset: no hedge tree');
    const plainDigest = digest(plain);
    // set: the trees before the hedges are the plain map's, the hedge trees after them
    const rows = hedged._trees.filter((t) => t.hedgeRow);
    const first = hedged._trees.findIndex((t) => t.hedgeRow);
    assert.ok(first > 0 && rows.length === hedged._trees.length - first, 'the hedge trees stand after every other placement');
    assert.equal(digest({ _trees: hedged._trees.slice(0, first) }), digest({ _trees: plain._trees.slice(0, first) }),
      'every tree before the hedges as the plain map placed it');
    const census = hedged.group.userData.hedgeTrees;
    assert.equal(census.standing, rows.length, 'the census counts the trees still standing');
    // (symmetric deployments, modes lane 2026-10-08: the deployment slots' clearings take theirs too, counted apart)
    const passes = census.planted - census.standing - census.clearings;
    assert.ok(census.planted >= census.standing && census.clearings >= 0 && passes >= 0 && passes <= 0.02 * census.planted,
      `a few at most taken by the structure and road passes (${census.planted} planted, ${census.standing} standing, ${census.clearings} in the deployment clearings)`);
    assert.ok(census.lines > 50 && census.gates === census.lines && census.km > 5, `the hedged field ends read (${JSON.stringify(census)})`);
    assert.ok(census.perKm > 15 && census.perKm < 1000 / hedge.spacingM * 1.4, `trees per hedge km at the spacing (${census.perKm})`);
    assert.deepEqual(digest(hedged), digest(replay), 'deterministic');
    const sample = createLandFieldSample(), mixSpecies = new Set(hedge.mix.map(([sp]) => sp));
    const byLine = new Map();
    for (const t of rows) {
      const at = landUseAt(profile, t.x, t.z, sample);
      assert.ok(at.active && at.hedge >= 0.98, `a hedge tree in its hedge's band (${t.x.toFixed(1)}, ${t.z.toFixed(1)}: ${at.hedge})`);
      // (a battle zone's shell-killed trees stand as snags, whatever they grew as: vegetation.ts convertSnags)
      assert.ok(mixSpecies.has(t.species) || t.species === 'snag', `of the mix's species (${t.species})`);
      assert.ok(!t.wood && !t.field && t.hedgeRow, 'a hedge tree, not a wood\'s or a lone one');
      for (const o of hedged._trees) {
        if (o !== t) assert.ok(Math.hypot(o.x - t.x, o.z - t.z) >= 5 - 1e-6, 'a field tree\'s 5 m from every other tree');
      }
      assert.equal(hedged.treeObstacles.filter((ob) => hedged._trees[ob.treeIdx] === t).length, 1, 'with its trunk record');
      const key = at.id * 2 + (at.sU >= 0 ? 0 : 1);
      const along = -Math.sin(profile.heading) * t.x + Math.cos(profile.heading) * t.z;
      (byLine.get(key) ?? byLine.set(key, []).get(key)).push(along);
    }
    let gaps = 0, pairs = 0;
    for (const list of byLine.values()) {
      list.sort((a, b) => a - b);
      for (let i = 1; i < list.length; i++) { pairs++; if (list[i] - list[i - 1] < hedge.spacingM * 0.7) gaps++; }
    }
    assert.ok(gaps <= pairs * 0.05, `spaced along their lines (${gaps} of ${pairs} pairs under 0.7 of the spacing)`);
    console.log(JSON.stringify({ map: 'coastal', plainTrees: plain._trees.length, plainDigest, hedgeTrees: rows.length, census }));
  } finally {
    for (const w of [plain, hedged, replay]) { w.dispose(); disposeObject3DResources(w.group); }
  }
} finally { restore(); }
console.log('hedgeTrees.selftest: Saltmere\'s hedge trees in their hedges\' bands, spaced, ordinary records of the mix, after every other placement, deterministic; unset none PASS');
