// Round 77b (2026-09-26): the far forests as impostors of the near trees (treeImpostors.ts, vegetation.ts). Pins the
// layout law (eight azimuths, three near variants per species, the tile from the texture budget, ≤ 6 MB on every
// authored map), the row measure, and — on the real seeded producers of Verdant, Nordhavn Fjord and Delta with a
// recording renderer — that the far pools are impostor quads on the one atlas (two draws per species instead of the
// lobes' four, two triangles per far tree), that the bake runs once from the first update outside any render pass
// with the previous render state restored and again after a GPU suspension disposes the atlas, that every far slot
// carries its tree's near variant through the partition's slot swaps, that the bake inputs digest deterministically
// (pinned per map), and that the mobile tier and a renderer-less context keep the lobe tier. No GPU, no art claim.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation, createGarageTreeKit } from './vegetation.ts';
import {
  TREE_IMPOSTOR_BUDGET_BYTES, TREE_IMPOSTOR_DIRECTIONS, TREE_IMPOSTOR_ELEVATION_RAD, TREE_IMPOSTOR_MARGIN,
  TREE_IMPOSTOR_MAX_ROWS, TREE_IMPOSTOR_PROGRAM_KEY, TREE_IMPOSTOR_VARIANTS, TREE_IMPOSTOR_ELEVATED_RAD, measureTreeImpostorRow,
  resolveTreeImpostorElevated, resolveTreeImpostorTile, resolveTreeImpostorVariants, treeImpostorAtlasBytes,
} from './treeImpostors.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { TREE_ARCHETYPES } from './treeSpecies.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';

// The pinned bake-input digests (seed 2001, the real leaf atlases): a changed builder or atlas moves them — re-pin deliberately.
// Round 77c (2026-09-26): re-pinned for the elevated ring — the layout text carries the ring's elevation ('flat' where the
// atlas has none) and every row its capture elevation; Nordhavn's atlas gains its three 45° rows.
// p2 trees lane (2026-10-01): re-pinned for the grown near trees (treeGrowth.ts) and their spray atlases
// (treeSprayAtlas.ts) — the far tier bakes the new trees; was verdant 33ca4146, fjord a9c982e2, delta a43cefd0. Re-pinned
// with the crown's occlusion baked into the wood, the oak's dome and the desktop palms' pinnate frond.
const PINS = { verdant: 'e2ad75c1', fjord: 'd5c01887', delta: 'e49114df' };
// every producer's digest is reported before the pin is asserted (a re-pin reads all three from one run)
const digestMismatches = [];

// --- the layout law -------------------------------------------------------------------------------------------
assert.equal(resolveTreeImpostorTile(6), 128, 'two species fit 128 px tiles');
assert.equal(resolveTreeImpostorTile(9), 96, 'three species take 96 px');
assert.equal(resolveTreeImpostorTile(12), 96, 'four species take 96 px');
assert.equal(resolveTreeImpostorTile(15), 64, 'five species take 64 px');
for (const rows of [6, 9, 12, 15]) assert.ok(treeImpostorAtlasBytes(resolveTreeImpostorTile(rows), rows) <= TREE_IMPOSTOR_BUDGET_BYTES);
assert.ok(treeImpostorAtlasBytes(128, 9) > TREE_IMPOSTOR_BUDGET_BYTES, 'the next tile up would break the budget');
assert.equal(resolveTreeImpostorVariants(3), 3); assert.equal(resolveTreeImpostorVariants(5), 3);
assert.equal(resolveTreeImpostorVariants(6), 2); assert.equal(resolveTreeImpostorVariants(13), 1);
assert.throws(() => resolveTreeImpostorVariants(0), /at least one/);
// round 77c: the elevated ring joins only where it keeps the row cap and the ground ring's tile — every 3-species map
// (12 rows at 96 px, 5.63 MB), never a 4-species map (16 rows would drop the ground ring to 64 px)
assert.equal(resolveTreeImpostorElevated(3), true); assert.equal(resolveTreeImpostorElevated(4), false);
assert.equal(resolveTreeImpostorElevated(13), false, 'the receipts\' 13-species world stays under the row cap without it');
const budgetRows = [];
for (const id of MAP_IDS) {
  const speciesCount = getMapConfig(id).vegetation.species.length;
  assert.equal(resolveTreeImpostorVariants(speciesCount), TREE_IMPOSTOR_VARIANTS, `${id}: every authored map bakes its three near variants`);
  const elevated = resolveTreeImpostorElevated(speciesCount);
  assert.equal(elevated, speciesCount === 3, `${id}: the elevated ring on the 3-species maps only`);
  const rows = speciesCount * TREE_IMPOSTOR_VARIANTS + (elevated ? speciesCount : 0);
  const tile = resolveTreeImpostorTile(rows), bytes = treeImpostorAtlasBytes(tile, rows);
  assert.equal(tile, resolveTreeImpostorTile(speciesCount * TREE_IMPOSTOR_VARIANTS), `${id}: the ground ring keeps its tile`);
  assert.ok(rows <= TREE_IMPOSTOR_MAX_ROWS && bytes <= TREE_IMPOSTOR_BUDGET_BYTES, `${id}: ${rows} rows, ${bytes} bytes`);
  budgetRows.push({ id, rows, tile, elevated, mb: +(bytes / 1048576).toFixed(2) });
}
// the row measure: a 2 m radius, 8 m tall box projects at the capture elevation into a tile with gutters
{
  const box = new THREE.BoxGeometry(4, 8, 4).translate(0, 4, 0);
  const row = measureTreeImpostorRow({ species: 'box', variant: 0, trunk: box, cards: box });
  const ce = Math.cos(TREE_IMPOSTOR_ELEVATION_RAD), se = Math.sin(TREE_IMPOSTOR_ELEVATION_RAD), r = Math.SQRT2 * 2;
  const span = Math.max(2 * r, (8 * ce + r * se) - (0 - r * se));
  assert.ok(Math.abs(row.cellM - span / (1 - 2 * TREE_IMPOSTOR_MARGIN)) < 1e-9, 'the cell is the projected span plus the gutters');
  assert.ok(row.baseV > 0 && row.baseV < 0.2, `the base sits just above the tile bottom (${row.baseV})`);
  assert.equal(row.radiusM, r); assert.equal(row.heightM, 8); assert.equal(row.elevation, TREE_IMPOSTOR_ELEVATION_RAD);
  // round 77c: the same box at the elevated ring's 45° needs the taller projected cell
  const high = measureTreeImpostorRow({ species: 'box', variant: 0, trunk: box, cards: box }, TREE_IMPOSTOR_ELEVATED_RAD);
  assert.ok(high.cellM > row.cellM && high.elevation === TREE_IMPOSTOR_ELEVATED_RAD, 'the elevated row measures at its own elevation');
  assert.throws(() => measureTreeImpostorRow({ species: 'none', variant: 0, trunk: new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), cards: new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)) }), /no measurable/);
  box.dispose();
}

// --- the lobe tier's cost, for the triangle comparison (the headless garage kit is the far pair) ----------------
const lobeTriangles = {};
for (const family of ['oak', 'pine', 'palm', 'birch']) {
  const kit = createGarageTreeKit({}, null, family);
  assert.equal(kit.detailTier, 'battlefield-far');
  lobeTriangles[TREE_ARCHETYPES[family].family] = (kit.trunk.getAttribute('position').count + kit.foliage.getAttribute('position').count) / 3;
  kit.dispose();
}

// --- the production build with a recording renderer -----------------------------------------------------------
const savedDocument = globalThis.document, savedImageData = globalThis.ImageData, savedWindow = globalThis.window;
globalThis.ImageData = ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };

function recordingRenderer() {
  const state = { target: null, color: new THREE.Color(0.1, 0.2, 0.3), alpha: 0.7, autoClear: true };
  const calls = [];
  return {
    calls,
    getRenderTarget: () => state.target,
    setRenderTarget(target) { state.target = target; calls.push(['target', target?.texture.name ?? null]); },
    render(scene, camera) {
      calls.push(['render', state.target?.texture.name ?? null, scene.children.length, camera.type,
        [camera.left, camera.right, camera.top, camera.bottom]]);
    },
    clear(color, depth, stencil) { calls.push(['clear', state.target?.texture.name ?? null, color, depth, stencil]); },
    getClearColor: target => target.copy(state.color),
    getClearAlpha: () => state.alpha,
    setClearColor(color, alpha = 1) { state.color.set(color); state.alpha = alpha; calls.push(['clearColor', state.color.getHex(), alpha]); },
    get autoClear() { return state.autoClear; }, set autoClear(v) { state.autoClear = v; calls.push(['autoClear', v]); },
    shadowMap: { autoUpdate: true }, xr: { enabled: true },
    state,
  };
}

function produce(id, withRenderer = true) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  const renderer = withRenderer ? recordingRenderer() : null;
  const engine = { setupShadowMaterial() {} };
  if (renderer) engine.renderer = renderer;
  const world = createVegetation(field, engine, 2001, cfg);
  return { cfg, field, renderer, world };
}

function auditFarSlots(world, id) {
  const library = world._treeImpostors;
  const meshes = world.group.children.filter(m => m.userData.treeImpostor === true);
  let far = 0;
  for (const tree of world._trees) {
    // p2 trees lane: a battle snag keeps its own far stand-in (the atlas holds the living species)
    if (tree.fslot < 0 || tree.species === 'snag') continue;
    far++;
    const mesh = meshes.find(m => m.name === `treeImpostor_${tree.species}_${tree.fv}`);
    assert.ok(mesh && mesh.count > tree.fslot, `${id}: the far slot is inside the live prefix`);
    assert.equal(mesh.geometry.getAttribute('aImpRow').array[tree.fslot], tree.variant, `${id}: the slot carries its tree's near variant`);
    const e = mesh.instanceMatrix.array;
    assert.ok(Math.abs(e[tree.fslot * 16 + 12] - tree.x) < 1e-3 && Math.abs(e[tree.fslot * 16 + 14] - tree.z) < 1e-3, `${id}: the slot carries its tree`);
    assert.ok(tree.variant >= 0 && tree.variant < TREE_IMPOSTOR_VARIANTS);
    const row = library.rowBase(tree.species) + (tree.variant % library.variants);
    assert.equal(row, library.rows.findIndex(r => r.species === tree.species && r.variant === tree.variant % library.variants));
  }
  return far;
}

const receipts = [];
try {
  assert.equal(getDeviceTier(), 'desktop');
  for (const id of ['verdant', 'fjord', 'delta']) {
    const { cfg, renderer, world } = produce(id);
    const species = cfg.vegetation.species;
    const library = world._treeImpostors;
    assert.ok(library, `${id}: the impostor library exists where the engine context carries a renderer`);
    // the layout (round 77c: the elevated rows, one per species at 45°, after the ground rows where the ring fits)
    assert.equal(library.variants, TREE_IMPOSTOR_VARIANTS, `${id}: the three near variants`);
    assert.equal(library.elevated, resolveTreeImpostorElevated(species.length), `${id}: the elevated ring by the law`);
    assert.equal(library.groundRows, species.length * TREE_IMPOSTOR_VARIANTS);
    assert.equal(library.rows.length, library.groundRows + (library.elevated ? species.length : 0));
    assert.deepEqual(library.rows.map(r => `${r.species}/${r.variant}@${Math.round(r.elevation * 180 / Math.PI)}`),
      [...species.flatMap(sp => [0, 1, 2].map(k => `${sp}/${k}@10`)), ...(library.elevated ? species.map(sp => `${sp}/0@45`) : [])], `${id}: species × near variants in order, then the elevated rows`);
    assert.equal(library.tile, resolveTreeImpostorTile(library.rows.length));
    assert.equal(library.width, library.tile * TREE_IMPOSTOR_DIRECTIONS); assert.equal(library.height, library.tile * library.rows.length);
    assert.equal(library.albedo.width, library.width); assert.equal(library.albedo.height, library.height);
    assert.equal(library.normal.width, library.width / 2); assert.equal(library.normal.height, library.height / 2);
    assert.ok(library.bytes <= TREE_IMPOSTOR_BUDGET_BYTES, `${id}: ${library.bytes} bytes`);
    for (const row of library.rows) {
      // p2 trees lane (2026-10-01): a grown conifer's skirt is wide against its height, so seen from the elevated
      // ring's 45° more of the crown projects below its base point (the base at up to ~0.33 of the tile)
      const baseCap = row.elevation > 0.5 ? 0.4 : 0.3;
      assert.ok(row.cellM > 4 && row.cellM < 40 && row.baseV > 0 && row.baseV < baseCap && row.heightM > 3, `${id}: ${row.species}/${row.variant} measured (${row.cellM}, ${row.baseV}, ${row.heightM})`);
    }
    assert.equal(library.material.customProgramCacheKey(), TREE_IMPOSTOR_PROGRAM_KEY);
    assert.strictEqual(library.material.map, library.albedo.texture);
    // the pools: two impostor quads per species, no lobe pool, the near pools and their shadow proxies untouched
    const impostorMeshes = world.group.children.filter(m => m.userData.treeImpostor === true);
    assert.equal(impostorMeshes.length, species.length * 2, `${id}: two impostor pools per species`);
    // p2 trees lane: the battle snags keep their own far stand-in (two pools per far variant), every living species is an impostor
    assert.equal(world.group.children.filter(m => m.userData.treeLod === 'far' && !m.userData.treeImpostor && !m.userData.battleSnag).length, 0, `${id}: no lobe pool`);
    // (+ the battle snags' three near pools where the map has craters — vegetation.ts battleSnagShare)
    const nearSpecies = species.length + (world.group.userData.battleSnags?.share > 0 ? 1 : 0);
    assert.equal(world.group.children.filter(m => m.userData.treeCanopyShadowProxy).length, nearSpecies * 3, `${id}: the near crown shadow proxies stay`);
    assert.equal(world.group.children.filter(m => m.userData.treeFoliage).length, nearSpecies * 3);
    for (const mesh of impostorMeshes) {
      const [, sp, fv] = mesh.name.split('_');
      assert.strictEqual(mesh.material, library.material);
      assert.equal(mesh.geometry.getAttribute('position').count, 4); assert.equal(mesh.geometry.index.count, 6);
      assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
      assert.equal(mesh.userData.aoExclude, true); assert.equal(mesh.userData.treeLod, 'far'); assert.equal(mesh.frustumCulled, false);
      const cell = mesh.geometry.getAttribute('aImpCell');
      assert.equal(cell.itemSize, 4, 'round 77c: the cell carries the elevated row');
      for (let v = 0; v < 4; v++) {
        assert.equal(cell.getX(v), library.rowBase(sp)); assert.equal(cell.getY(v), fv === '1' ? 1 : 0); assert.equal(cell.getZ(v), library.variants);
        assert.equal(cell.getW(v), library.elevated ? library.groundRows + species.indexOf(sp) : -1, `${id}: the species' elevated row (or none)`);
      }
      const flex = [...mesh.geometry.getAttribute('aFlex').array];
      assert.ok(flex[0] === 0 && flex[1] === 0 && Math.abs(flex[2] - 0.3) < 1e-6 && Math.abs(flex[3] - 0.3) < 1e-6, 'the quad top flutters like a lobe crown');
      const population = world._trees.filter(t => t.species === sp).length;
      const row = mesh.geometry.getAttribute('aImpRow');
      assert.ok(row?.isInstancedBufferAttribute && row.count === Math.min(world._trees.length, Math.max(1, population)), `${id}: aImpRow at the species capacity`);
      assert.equal(row.usage, THREE.DynamicDrawUsage);
    }
    // the bake: none at construction, once from the first update, outside a render pass, the state restored
    assert.equal(library.baked, false); assert.equal(library.bakes, 0); assert.equal(renderer.calls.length, 0);
    const camera = new THREE.Vector3(0, 6, 0);
    world.update(1 / 60, camera);
    assert.equal(library.baked, true); assert.equal(library.bakes, 1, `${id}: baked once`);
    const calls = renderer.calls;
    const renders = calls.filter(c => c[0] === 'render');
    // round 77c: each pass renders the ground ring's scene and, where the atlas has one, the elevated ring's scene,
    // each seen by its own tilted camera over its rows
    const ringsPerPass = library.elevated ? 2 : 1;
    assert.deepEqual(renders.map(c => c[1]), [...Array(ringsPerPass).fill('treeImpostorAlbedo'), ...Array(ringsPerPass).fill('treeImpostorNormal')], `${id}: the albedo pass then the normal pass`);
    renders.forEach((render, index) => {
      const elevatedRing = index % ringsPerPass === 1;
      assert.equal(render[2], (elevatedRing ? library.rows.length - library.groundRows : library.groundRows) * TREE_IMPOSTOR_DIRECTIONS, 'one copy per row and azimuth');
      assert.equal(render[3], 'OrthographicCamera');
      assert.deepEqual(render[4], [0, TREE_IMPOSTOR_DIRECTIONS, library.rows.length, 0], 'every ring camera maps the whole atlas grid onto the whole target (a per-ring frustum stretched the ground rows)');
    });
    assert.deepEqual(calls.filter(c => c[0] === 'clear').map(c => c.slice(1)), [['treeImpostorAlbedo', true, true, false], ['treeImpostorNormal', true, true, false]]);
    const targets = calls.filter(c => c[0] === 'target').map(c => c[1]);
    assert.deepEqual(targets, ['treeImpostorAlbedo', 'treeImpostorNormal', null], `${id}: the previous target is restored`);
    assert.equal(renderer.state.color.getHex(), new THREE.Color(0.1, 0.2, 0.3).getHex(), 'the clear colour is restored');
    assert.equal(renderer.state.alpha, 0.7); assert.equal(renderer.state.autoClear, true); assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(renderer.xr.enabled, true);
    const floodCall = calls.find(c => c[0] === 'clearColor');
    assert.ok(floodCall && floodCall[2] === 0, 'the gutters flood with alpha zero');
    world.update(1 / 60, camera);
    assert.equal(library.bakes, 1, `${id}: a baked atlas is not re-baked`);
    // the far slots carry their trees' variants, through the partition and its slot swaps
    const farAtSpawn = auditFarSlots(world, id);
    assert.ok(farAtSpawn > 0, `${id}: far trees exist at the map centre`);
    const moved = new THREE.Vector3(300, 6, 200);
    world.update(1 / 60, moved); world.update(1 / 60, moved);
    for (let tick = 0; tick < 6; tick++) world.update(0.1, moved);
    const farMoved = auditFarSlots(world, id);
    assert.ok(farMoved > 0 && farMoved !== farAtSpawn, `${id}: the partition moved (${farAtSpawn} → ${farMoved})`);
    // a GPU suspension disposes the atlas: the next update bakes again
    library.albedo.texture.dispose();
    assert.equal(library.baked, false);
    world.update(1 / 60, moved);
    assert.equal(library.bakes, 2, `${id}: re-baked after the suspension`);
    // the bake inputs digest deterministically
    const digest = library.digest();
    assert.equal(digest, library.digest());
    const again = produce(id);
    assert.equal(again.world._treeImpostors.digest(), digest, `${id}: the same seeded build bakes the same inputs`);
    again.world.dispose(); disposeObject3DResources(again.world.group);
    // the far tier's cost
    const farTrianglesLobes = world._trees.reduce((n, t) => n + (t.species === 'snag' ? 0 : lobeTriangles[TREE_ARCHETYPES[t.species].family]), 0);
    receipts.push({ id, tile: library.tile, rows: library.rows.length, elevated: library.elevated, atlas: `${library.width}x${library.height}`, mb: +(library.bytes / 1048576).toFixed(2),
      farDraws: impostorMeshes.length, lobeDraws: species.length * 4, trees: world._trees.length,
      farTrianglesAllTrees: { impostor: world._trees.length * 2, lobes: farTrianglesLobes }, digest });
    if (digest !== PINS[id]) digestMismatches.push(`${id}: the pinned bake-input digest (${digest}, pinned ${PINS[id]})`);
    world.dispose(); disposeObject3DResources(world.group);
  }
  // no renderer: the lobe tier, as the receipts build it
  {
    const { world } = produce('verdant', false);
    assert.equal(world._treeImpostors, null);
    assert.ok(world.group.children.some(m => m.userData.treeLod === 'far' && !m.userData.treeImpostor), 'the lobe pools');
    world.dispose(); disposeObject3DResources(world.group);
  }
  // the mobile tier: the lobe tier even with a renderer
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  resolveDeviceTier(); assert.equal(getDeviceTier(), 'mobile');
  {
    const { world, renderer } = produce('verdant');
    assert.equal(world._treeImpostors, null, 'the mobile tier keeps the lobes');
    world.update(1 / 60, new THREE.Vector3()); assert.equal(renderer.calls.length, 0);
    world.dispose(); disposeObject3DResources(world.group);
  }
} finally {
  if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  if (savedImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = savedImageData;
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
console.log(JSON.stringify({ receipts, lobeTriangles, budget: budgetRows }));
assert.deepEqual(digestMismatches, [], digestMismatches.join('; '));
console.log('treeImpostors.selftest: the layout law and budget on 31 maps, the row measure, impostor pools (2 draws / species, 2 tris / far tree) on three producers, the bake from the first update with the render state restored and after a suspension, far slots carrying their variants through the partition, pinned deterministic bake inputs, lobes without a renderer and on mobile PASS');
