// outlandTreeAdoption.selftest (GND, 2026-10-14; the owner's Kestrel border trees "breaking into floating blobs"):
// near the playable square the battlefield's own tree tiers draw the horizon ring's trees (vegetation.ts
// adoptOutlandTrees, bound by map.ts through horizonForestImpostors.ts; the Hinterland's through hinterland/trees.ts).
// On the real seeded ring and vegetation of Kestrel (airfield), Longleaf (the worst magnification) and Monsoon (the
// largest ring) with a recording renderer: every placement is drawn exactly once (an adopted tree or a ring quad); an
// adopted tree is the resolved placement (species, near variant = its impostor row, stature, seat, tint); the build is
// untouched (its records, colliders, concealers, pools, scene children, shadow registrations and instance buffers);
// every outland pool's instance attributes hold its capacity; from the chase at Kestrel's line every adopted tree in the
// near reach is near, and the x8 sight over the line promotes the corridor's; no lobe shadow proxy stands on an adopted
// placement; a world without an atlas adopts nothing. No GPU, no art claim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { OUTLAND_ADOPT_M, OUTLAND_NEAR_SCALE, createVegetation, outlandAdoptable, outlandTreesEnabled } from './vegetation.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { HORIZON_FOREST_PLACEMENT_STRIDE } from './horizonVista.ts';
import { bindHorizonForestImpostors, resolveHorizonForestTrees } from './horizonForestImpostors.ts';
import { applyHinterlandTreeImpostors } from './hinterland/trees.ts';
import { HINTERLAND_FORMS, HINTERLAND_TREE_STRIDE } from './hinterland/wire.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';
import { shadowCasterCascadesOf, shadowCasterProfileOf } from '../engine/renderLayers.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
globalThis.ImageData = ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const renderer = {
  getRenderTarget: () => null, setRenderTarget() {}, render() {}, clear() {}, getClearColor: target => target,
  getClearAlpha: () => 1, setClearColor() {}, autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
};
const STRIDE = HORIZON_FOREST_PLACEMENT_STRIDE;
const key = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;
const recordHash = world => createHash('sha256').update(JSON.stringify(world._trees.map(t => [t.x, t.z, t.species, t.variant, t.fv]))).digest('hex');
const settle = (world, cam, fwd = null, n = 4) => { for (let i = 0; i < n; i++) world.update(0, cam, fwd, null); };

assert.equal(outlandTreesEnabled(), true, 'adoption is on without a `?outlandTrees=0` query');
assert.equal(outlandAdoptable(PLAYABLE_HALF_EXTENT_M - 1, 0), false, 'nothing inside the line is adopted');
assert.equal(outlandAdoptable(PLAYABLE_HALF_EXTENT_M + 42, 0), true, 'a tree 42 m over the line is');
assert.equal(outlandAdoptable(PLAYABLE_HALF_EXTENT_M + OUTLAND_ADOPT_M + 1, 0), false, 'one past the reach is not');

const rows = [];
try {
  for (const id of ['airfield', 'longleaf', 'monsoon']) {
    const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
    const engine = { renderer, setupShadowMaterial() {} };
    const ring = buildHorizonRing(engine, cfg, 1337, field);
    const forest = ring.getObjectByName('horizon-forest');
    assert.ok(forest?.userData.horizonForest?.placements, `${id}: the ring forest`);
    const record = forest.userData.horizonForest;
    const world = createVegetation(field, engine, 2001, cfg);
    const library = world._treeImpostors;
    assert.ok(library, `${id}: an atlas (the recording renderer)`);
    // the build before any adoption
    const children = [...world.group.children];
    const pools = children.filter(c => c.isInstancedMesh);
    const before = {
      hash: recordHash(world), trees: world._trees.length, obstacles: world.treeObstacles.length, concealers: world.concealers.length,
      capacity: pools.map(m => m.instanceMatrix.count), profiles: pools.map(m => shadowCasterProfileOf(m)), cascades: pools.map(m => shadowCasterCascadesOf(m)),
      attributes: pools.map(m => ['aFadeI', 'aLodF', 'aImpRow'].map(n => m.geometry.getAttribute(n))),
    };
    const y0 = field.getHeightAt(0, 0);
    settle(world, new THREE.Vector3(0, y0 + 3, 0)); // the build's own partition first: adoption seeds into a live world
    // the binding with the adoption, as map.ts wires it
    // (GND, 2026-10-15: the forest over the line takes its own mix, as map.ts wires it — `ringMix`, else the rim's)
    // (and, 2026-10-15, each species at its own stature where the map's ring says so — VegetationConfig `ringStature`)
    const options = { library, rimMix: world._ringMix, rimTreeHeightM: world._rimTreeHeightM, speciesHeightM: world._ringSpeciesHeightM,
      understory: world._ringUnderstory, rimTreeTint: world._rimTreeTint, setupMaterial() {} };
    const resolved = resolveHorizonForestTrees(forest, library, { ...options, formVariant: world._treeFormVariant });
    if (id === 'longleaf') {
      // the blind critics' Longleaf backdrop ("a broadleaf band that doesn't match the longleaf pines"): past the line the
      // flatwoods are longleaf alone — every ring tree, adopted or a quad, is the pine slot (its longleaf form)
      assert.deepEqual(world._ringMix, [['pine', 1]], 'longleaf: the ring mix is the pines alone');
      assert.ok(world._rimMix.some(([sp]) => sp === 'oak'), 'longleaf: the rim inside the line keeps the creek bottom\'s oaks');
      const offPine = resolved.trees.filter(t => t.species !== 'pine').length;
      assert.equal(offPine, 0, `longleaf: every ring tree is a longleaf pine (${offPine} are not)`);
    } else {
      assert.strictEqual(world._ringMix, world._rimMix, `${id}: without a ring mix the ring takes the rim's`);
    }
    const within = resolved.trees.filter(t => outlandAdoptable(t.x, t.z));
    const receipt = bindHorizonForestImpostors(forest, {
      ...options, formVariant: world._treeFormVariant, adoptWithin: t => outlandAdoptable(t.x, t.z), adopt: trees => world.adoptOutlandTrees(trees),
    });
    assert.ok(within.length > 0, `${id}: ring trees within the reach (${within.length})`);
    assert.equal(receipt.adopted, within.length, `${id}: every tree within the reach adopted`);
    assert.equal(world._outland.length, 1);
    const batch = world._outland[0];
    assert.equal(batch.trees.length, within.length);
    // every placement exactly once: an adopted tree or a quad
    const seen = new Map();
    for (const t of batch.trees) seen.set(key(t.x, t.z), (seen.get(key(t.x, t.z)) ?? 0) + 1);
    const quads = forest.children.filter(c => c.userData.horizonForestImpostor);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let quadCount = 0;
    for (const mesh of quads) for (let j = 0; j < mesh.count; j++) {
      mesh.getMatrixAt(j, m4); p.setFromMatrixPosition(m4); quadCount++;
      seen.set(key(p.x, p.z), (seen.get(key(p.x, p.z)) ?? 0) + 1);
    }
    // (GND 2026-10-16: with a ring understorey, its young trees count too — resolveHorizonForestTrees after the placements)
    assert.equal(quadCount + batch.trees.length, resolved.trees.length, `${id}: adopted + quads = placements + understorey`);
    assert.ok(resolved.trees.length >= record.instances, `${id}: every placement resolved`);
    for (let i = 0; i < record.instances; i++) {
      const o = i * STRIDE;
      assert.equal(seen.get(key(record.placements[o], record.placements[o + 2])), 1, `${id}: placement ${i} drawn exactly once`);
    }
    // an adopted tree is its resolved placement: species, near variant (its impostor row), stature, seat, yaw, tint
    const byKey = new Map(within.map(t => [key(t.x, t.z), t]));
    for (const t of batch.trees) {
      const r = byKey.get(key(t.x, t.z));
      assert.ok(r, `${id}: an adopted tree is a resolved placement`);
      assert.equal(t.species, r.species); assert.equal(t.variant, r.variant);
      assert.equal(t.fv, r.mirror ? 1 : 0, `${id}: the far quad's mirror`);
      t.mat.decompose(p, q, s);
      assert.ok(Math.abs(s.y - r.scale) < 1e-5 && Math.abs(p.y - r.y) < 1e-4, `${id}: the stature and the seat`);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs([t.tint.r, t.tint.g, t.tint.b][k] - r.tint[k]) < 1e-5, `${id}: the tint`);
      assert.equal(t.variant, world._treeFormVariant(t.species, t.variant, t.x, t.z), `${id}: the forest-form law is a fixed point`);
      assert.equal(t.nearScale, OUTLAND_NEAR_SCALE);
    }
    // the build untouched: records, colliders, concealers, its pools, children, registrations and instance buffers
    assert.equal(recordHash(world), before.hash, `${id}: the build's tree records unchanged`);
    assert.equal(world._trees.length, before.trees); assert.equal(world.treeObstacles.length, before.obstacles); assert.equal(world.concealers.length, before.concealers);
    assert.deepEqual(world.group.children.slice(0, children.length), children, `${id}: the build's scene children kept, in order`);
    pools.forEach((m, i) => {
      assert.equal(m.instanceMatrix.count, before.capacity[i], `${id}: ${m.name}: its capacity`);
      assert.strictEqual(shadowCasterProfileOf(m), before.profiles[i]); assert.strictEqual(shadowCasterCascadesOf(m), before.cascades[i]);
      ['aFadeI', 'aLodF', 'aImpRow'].forEach((n, k) => assert.strictEqual(m.geometry.getAttribute(n), before.attributes[i][k], `${id}: ${m.name}: its own ${n}`));
    });
    const outlandMeshes = world.group.children.slice(children.length);
    assert.ok(outlandMeshes.length > 0 && outlandMeshes.every(m => m.userData.outlandTree), `${id}: the batch's pools appended after the build's`);
    // the batch's pools: their own instance attributes at their capacity; the near tier's shadow profile on its casters
    const capacityOk = () => {
      for (const m of outlandMeshes) {
        for (const n of ['aFadeI', 'aLodF', 'aImpRow']) {
          const a = m.geometry.getAttribute(n);
          if (a) assert.ok(a.count >= m.instanceMatrix.count && a.count >= m.count, `${id}: ${m.name}: ${n} holds the pool (${a.count} / ${m.instanceMatrix.count})`);
        }
      }
    };
    capacityOk();
    const nearProfile = before.profiles.find(Boolean);
    for (const m of outlandMeshes) if (m.castShadow && shadowCasterProfileOf(m)) assert.strictEqual(shadowCasterProfileOf(m), nearProfile, `${id}: one near-tier profile`);
    // no lobe shadow proxy stands on an adopted placement
    const adoptedKeys = new Set(batch.trees.map(t => key(t.x, t.z)));
    for (const proxy of forest.children.filter(c => c.userData.horizonForestShadowProxy)) {
      for (let j = 0; j < proxy.count; j++) { proxy.getMatrixAt(j, m4); p.setFromMatrixPosition(m4); assert.ok(!adoptedKeys.has(key(p.x, p.z)), `${id}: no proxy on an adopted tree`); }
    }
    // the chase at the line nearest the ring (Kestrel's owner pose, -470, 50; the same spot on every map): every adopted
    // tree inside the near reach is near once the partition settles
    const nearReach = 200 * OUTLAND_NEAR_SCALE;
    const chase = new THREE.Vector3(-462, field.getHeightAt(-462, 50) + 3.5, 50);
    settle(world, chase);
    let inReach = 0;
    for (const t of batch.trees) {
      if (Math.hypot(t.x - chase.x, t.z - chase.z) >= nearReach - 1) continue;
      inReach++;
      assert.ok(t.near && t.slot >= 0, `${id}: an adopted tree ${Math.hypot(t.x - chase.x, t.z - chase.z).toFixed(0)} m from the chase is near`);
    }
    capacityOk();
    // the x8 sight over the line (-X): the corridor's adopted trees promoted to the near tier
    world.setSniperFade(1, true, 3.75, 600);
    const fwd = new THREE.Vector3(-1, 0, 0);
    settle(world, chase.clone().setX(chase.x + 0.01), fwd); // (the promotion repartitions on the scope's step, not a move)
    let corridor = 0;
    for (const t of batch.trees) {
      const along = chase.x - t.x, across = Math.abs(t.z - chase.z);
      if (along <= 1 || along > 600 || across > 24 + along * 0.14 - 1) continue;
      corridor++;
      assert.ok(t.near, `${id}: an adopted tree ${along.toFixed(0)} m down the x8 corridor is promoted`);
    }
    capacityOk();
    world.setSniperFade(0, true, 55, null);
    settle(world, chase);
    rows.push({ id, placements: record.instances, adopted: batch.trees.length, quads: quadCount, chaseNear: inReach, corridor,
      pools: outlandMeshes.length, minRadiusM: +batch.minRadiusM.toFixed(1) });
    // the Hinterland's trees (hinterland/trees.ts; a synthetic outland of this ring's adopted spots shifted 30 m out):
    // the same law, its own batch
    if (id === 'airfield') {
      const sample = batch.trees.slice(0, 40);
      const packed = new Float32Array(sample.length * HINTERLAND_TREE_STRIDE);
      sample.forEach((t, i) => packed.set([t.x * 1.06, t.z * 1.06, 14, 4, 0.5, 0.8, 0, HINTERLAND_FORMS.indexOf('conifer'), field.getHeightAt(t.x, t.z)], i * HINTERLAND_TREE_STRIDE));
      const object = new THREE.Group(), outland = new THREE.Group();
      outland.name = 'hinterland-outland';
      outland.userData.hinterlandNearTrees = { trees: packed, species: [sample[0].species], pyramid: null };
      object.add(outland);
      const h = applyHinterlandTreeImpostors(object, {
        library, rimMix: world._ringMix, rimTreeTint: world._rimTreeTint, setupMaterial() {},
        formVariant: world._treeFormVariant, adoptWithin: t => outlandAdoptable(t.x, t.z), adopt: trees => world.adoptOutlandTrees(trees),
      });
      const expected = sample.filter(t => outlandAdoptable(t.x * 1.06, t.z * 1.06)).length;
      assert.equal(h.adopted, expected, 'hinterland: the trees within the reach adopted');
      assert.equal(world._outland.length, 2, 'hinterland: its own batch');
      const hq = outland.getObjectByName('hinterland-tree-impostors').children.reduce((n, m) => n + m.count, 0);
      assert.equal(hq + h.adopted, sample.length, 'hinterland: adopted + quads = its trees');
      rows.push({ id: 'hinterland(synthetic)', trees: sample.length, adopted: h.adopted, quads: hq });
    }
    world.dispose(); disposeObject3DResources(world.group); disposeObject3DResources(ring);
  }
  // a world without an atlas (no renderer: Node, the server, the receipts) adopts nothing and keeps its records
  {
    const cfg = getMapConfig('airfield'), field = createHeightField(1337, cfg);
    const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    assert.equal(world._treeImpostors, null, 'no renderer, no atlas');
    const hash = recordHash(world), children = world.group.children.length;
    const n = world.adoptOutlandTrees([{ x: 520, y: 0, z: 0, yaw: 0, species: world._trees[0].species, variant: 0, mirror: false, scale: 1, tint: [1, 1, 1] }]);
    assert.equal(n, 0, 'nothing adopted without an atlas');
    assert.equal(recordHash(world), hash); assert.equal(world.group.children.length, children); assert.equal(world._outland.length, 0);
    world.dispose(); disposeObject3DResources(world.group);
  }
} finally {
  if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  if (savedImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = savedImageData;
}
console.log(JSON.stringify({ rows }));
console.log('outlandTreeAdoption.selftest: the ring\'s trees near the square drawn once by the battlefield\'s tiers (resolved placement, '
  + 'the build untouched, pools at capacity, near at the chase, promoted down the x8 corridor, no proxy under them), the Hinterland\'s '
  + 'the same, nothing adopted without an atlas');
