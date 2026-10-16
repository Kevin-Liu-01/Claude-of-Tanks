// ringSpeciesStature.selftest.mjs — the ring's trees at each species' own stature (GND, 2026-10-15; the coordinator's
// ruling on the ring: "birch and poplar shouldn't stand at pine height", but Verdant's forests are owner-approved and
// stay byte-identical). The ring (horizonForestImpostors.ts resolveHorizonForestTrees) stood every tree at the rim
// trees' one mean height; a map that sets VegetationConfig `ringStature: 'species'` stands each at its own species'
// rim stature (vegetation.ts `_ringSpeciesHeightM`).
//
// 1. Verdant sets no stature law: its ring resolves by the one-mean law bit for bit (every scale Object.is the old
//    expression), and its bound ring — every quad's instance matrix, colour and atlas row — hashes to the digest of the
//    owner-approved ring (pinned from 598069b82, before this law existed; re-pin only for a deliberate Verdant ring
//    change, never for a stature law elsewhere). A binding without the option and one with `speciesHeightM: null`
//    are the same bytes.
// 2. The maps that set it: each tree's height is (its placement scale / the ring's mean scale) × its species' own
//    stature, the species statures are the rim's (or, for a species the rim does not grow, its rows' height at the
//    rim's mean scale), and on each such map some species really moves (else the setting would be a no-op there).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { HORIZON_FOREST_PLACEMENT_STRIDE as STRIDE } from './horizonVista.ts';
import { bindHorizonForestImpostors, resolveHorizonForestTrees } from './horizonForestImpostors.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

/** Verdant's bound ring forest as the owner approved it (598069b82; ring-digest of quads' matrices, colours, rows). */
const VERDANT_RING_DIGEST = 'd92dab7742fb94b677407b39017a4f76f187ca39d5fb230eca7461bdfecfabbf';

const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
globalThis.ImageData = ImageData;
globalThis.document = { createElement() { return createCanvas(1, 1); } };
const renderer = {
  getRenderTarget: () => null, setRenderTarget() {}, render() {}, clear() {}, getClearColor: target => target,
  getClearAlpha: () => 1, setClearColor() {}, autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
};

function build(id) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  const engine = { renderer, setupShadowMaterial() {} };
  const fresh = () => buildHorizonRing(engine, cfg, 1337, field).getObjectByName('horizon-forest');
  const world = createVegetation(field, engine, 2001, cfg);
  assert.ok(world._treeImpostors, `${id}: an atlas (the recording renderer)`);
  return { cfg, world, fresh };
}
function digest(forest) {
  const hash = createHash('sha256');
  const meshes = forest.children.filter(c => c.isInstancedMesh).sort((a, b) => a.name.localeCompare(b.name));
  for (const m of meshes) {
    hash.update(m.name); hash.update(String(m.count));
    hash.update(Buffer.from(m.instanceMatrix.array.buffer, m.instanceMatrix.array.byteOffset, m.count * 64));
    if (m.instanceColor) hash.update(Buffer.from(m.instanceColor.array.buffer, m.instanceColor.array.byteOffset, m.count * 12));
    const rows = m.geometry.getAttribute('aImpRow');
    if (rows) hash.update(Buffer.from(rows.array.buffer, rows.array.byteOffset, rows.array.byteLength));
  }
  return hash.digest('hex');
}
/** The map.ts wiring (the ring's own mix, the rim's mean, the per-species statures where the map sets the law). */
const wiring = (world, extra = {}) => ({
  library: world._treeImpostors, rimMix: world._ringMix, rimTreeHeightM: world._rimTreeHeightM,
  speciesHeightM: world._ringSpeciesHeightM, rimTreeTint: world._rimTreeTint, setupMaterial() {}, ...extra,
});

try {
  // ---- 1. Verdant: the one-mean law, bit for bit
  {
    const { cfg, world, fresh } = build('verdant');
    assert.equal(cfg.vegetation.ringStature, undefined, 'Verdant sets no stature law');
    assert.equal(world._ringSpeciesHeightM, null, 'so the vegetation hands the ring no per-species statures');
    const forest = fresh(), library = world._treeImpostors;
    const resolved = resolveHorizonForestTrees(forest, library, wiring(world));
    // the one-mean law as it was written before the stature law (598069b82), recomputed here from the packed placements
    const packed = forest.userData.horizonForest.placements, count = packed.length / STRIDE;
    let scaleSum = 0;
    for (let i = 0; i < count; i++) scaleSum += packed[i * STRIDE + 3];
    const ringScaleMean = scaleSum / count;
    for (const tree of resolved.trees) {
      const o = tree.index * STRIDE, row = library.rows[library.rowBase(tree.species) + tree.variant];
      const old = (packed[o + 3] / ringScaleMean) * resolved.ringLobeHeightM * resolved.ratio / Math.max(1e-3, row.heightM);
      assert.ok(Object.is(tree.scale, old), `Verdant ring tree ${tree.index}: scale ${tree.scale} is the one-mean law's ${old}`);
    }
    const bound = fresh();
    bindHorizonForestImpostors(bound, wiring(world));
    const production = digest(bound);
    const without = fresh();
    bindHorizonForestImpostors(without, { library, rimMix: world._ringMix, rimTreeHeightM: world._rimTreeHeightM, rimTreeTint: world._rimTreeTint, setupMaterial() {} });
    assert.equal(digest(without), production, 'a binding without the option is the same bytes');
    assert.equal(production, VERDANT_RING_DIGEST, 'Verdant\'s bound ring is the owner-approved one, byte for byte');
    console.log(`ringSpeciesStature: Verdant ${resolved.trees.length} ring trees on the one-mean law bit for bit; ring digest ${production.slice(0, 16)} pinned`);
  }

  // ---- 2. the maps that set the law
  const speciesMaps = MAP_IDS.filter(id => getMapConfig(id).vegetation?.ringStature === 'species');
  for (const id of ['airfield', 'longleaf']) assert.ok(speciesMaps.includes(id), `${id} stands its ring by species`);
  assert.ok(!speciesMaps.includes('verdant'));
  for (const id of speciesMaps) {
    const { world, fresh } = build(id);
    const own = world._ringSpeciesHeightM, library = world._treeImpostors;
    assert.ok(own && Object.keys(own).length > 0, `${id}: per-species statures`);
    for (const [species, height] of Object.entries(own)) assert.ok(Number.isFinite(height) && height > 1, `${id}: ${species} at ${height} m`);
    const forest = fresh();
    const resolved = resolveHorizonForestTrees(forest, library, wiring(world));
    const packed = forest.userData.horizonForest.placements, count = packed.length / STRIDE;
    let scaleSum = 0;
    for (let i = 0; i < count; i++) scaleSum += packed[i * STRIDE + 3];
    const ringScaleMean = scaleSum / count;
    const moved = {};
    for (const tree of resolved.trees) {
      const o = tree.index * STRIDE, row = library.rows[library.rowBase(tree.species) + tree.variant];
      assert.ok(own[tree.species] > 0, `${id}: ring species ${tree.species} has a stature`);
      const want = (packed[o + 3] / ringScaleMean) * own[tree.species];
      assert.ok(Math.abs(tree.scale * Math.max(1e-3, row.heightM) - want) < 1e-6 * want, `${id} tree ${tree.index}: its species' stature`);
      moved[tree.species] = own[tree.species] / world._rimTreeHeightM;
    }
    const worst = Math.max(...Object.values(moved).map(r => Math.max(r, 1 / r)));
    // (Longleaf's ring is its pines alone: they move from the oaks-included rim mean to the rim pines' own, 5 %)
    assert.ok(worst > 1.03, `${id}: some ring species moves off the one mean (worst x${worst.toFixed(2)})`);
    const bound = fresh();
    const receipt = bindHorizonForestImpostors(bound, wiring(world));
    assert.deepEqual(receipt.stature.species, own, `${id}: the binding's receipt names the statures`);
    console.log(`ringSpeciesStature: ${id} — rim mean ${world._rimTreeHeightM.toFixed(1)} m; ${Object.entries(moved)
      .map(([sp, r]) => `${sp} ${own[sp].toFixed(1)} m (x${r.toFixed(2)})`).join(', ')}`);
  }
} finally {
  globalThis.document = savedDocument;
  globalThis.ImageData = savedImageData;
}
