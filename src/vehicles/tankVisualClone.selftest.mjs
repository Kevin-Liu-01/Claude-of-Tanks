// cloneTankVisual (232; battle builds since perf-252): a copy of a pristine visual draws exactly what a fresh build of
// the same seat draws (the same vehicle, paint, camouflage seed and build options), at rest, driven through the near,
// far and inspection distances, wrecked and reset, and leaves its source untouched. The multiplayer roster builds one
// visual per vehicle, paint and build tier and copies the other seats from it (battlePresentation seatBuildKey); since
// perf-252 its seats are the battle roster's builds (low geometry, static batches, battle detail, the vehicle's battle
// merge), so the copy carries the end-wheel batches, the detail groups, the dual merge's far copies, the program-variant
// twins, its own shadow batch and its own lease on the pooled rigid stock. A copy asked for another build refuses.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { battleStaticDrawMerge, createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { cloneTankVisual } = await import('./tankVisualClone.ts');
const { battleGeometrySharingStats } = await import('./battleGeometrySharing.ts');
const { programVariantOrigin, splitProgramVariants } = await import('../engine/programVariants.ts');
const { getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');

const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
const digest = (view) => createHash('sha256').update(Buffer.from(view.buffer, view.byteOffset, view.byteLength)).digest('hex').slice(0, 12);
function geometryDigest(g) {
  const hash = createHash('sha256');
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name];
    hash.update(name).update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  }
  if (g.index) hash.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  return `${hash.digest('hex').slice(0, 12)}:${g.drawRange.start}/${g.drawRange.count}`;
}
function materialSignature(m) {
  const twin = programVariantOrigin(m) !== m;
  const maps = ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].map((key) => {
    const t = m[key];
    return t ? `${key}@${t.offset.x.toFixed(6)},${t.offset.y.toFixed(6)}` : '';
  }).join('');
  return [m.type, m.name, m.color?.getHexString?.() ?? '', m.emissive?.getHexString?.() ?? '', m.opacity, m.transparent,
    m.depthWrite, m.side, m.visible, twin ? 'twin' : '', Object.keys(m.defines ?? {}).sort().join('+'),
    m.customProgramCacheKey().length, maps].join(':');
}
/** Every object a renderer would draw (the visible chain, the nearest LOD level), in traversal order: what it draws,
 * where, with what, its instances and the polygon offset its depth hook sets. `structure` keeps only the kinds and names. */
function drawn(visual, structure = false) {
  visual.root.updateMatrixWorld(true);
  const out = [];
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isLOD) { if (o.levels.length) visit(o.levels[0].object); return; }
    if (o.isMesh || o.isLine || o.isPoints) {
      if (structure) out.push(`${o.type}:${o.name}`);
      else {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        const units = materials.map((m) => {
          const saved = [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits];
          o.onBeforeRender?.({}, null, camera, o.geometry, m, null);
          const offset = m.polygonOffset ? `${m.polygonOffsetFactor}/${m.polygonOffsetUnits}` : '-';
          [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits] = saved;
          return offset;
        });
        let instances = '';
        if (o.isInstancedMesh) instances = `i${o.count}:${digest(o.instanceMatrix.array)}`;
        if (o.isBatchedMesh) instances = `b${o.instanceCount}:${digest(o._matricesTexture.image.data)}`
          + `:${o._instanceInfo.map((info) => `${info.active ? 1 : 0}${info.visible ? 1 : 0}`).join('')}`;
        out.push([o.type, o.name, geometryDigest(o.geometry), o.matrixWorld.elements.map((v) => v.toFixed(5)).join(','),
          materials.map(materialSignature).join('|'), units.join(','), o.castShadow, o.receiveShadow, o.layers.mask,
          o.customDepthMaterial ? `depth:${o.customDepthMaterial.type}:${o.customDepthMaterial.uuid}` : '',
          o.renderOrder, instances].join(' '));
      }
    }
    for (const child of o.children) visit(child);
  };
  visit(visual.root);
  return out;
}
/** The first differing line of two draw lists (a readable failure). */
function same(actual, expected, label) {
  if (actual.length !== expected.length) assert.fail(`${label}: ${actual.length} draws, expected ${expected.length}`);
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) assert.fail(`${label}: draw ${i} differs\n  got      ${actual[i]}\n  expected ${expected[i]}`);
  }
}

// the multiplayer seats' builds (battlePresentation seatVisualOptions) and the path before perf-252
const CONFIGS = [
  { label: 'a remote seat', options: (id) => ({ quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true,
    staticDrawMerge: battleStaticDrawMerge(id) }) },
  { label: "the viewer's own", options: (id) => ({ quality: 'high', geometryQuality: 'high', batchStatic: true, battleDetailLod: false,
    staticDrawMerge: battleStaticDrawMerge(id) }) },
  // the roster's other-tier fallback for a bot (rosterVisualFallback): high geometry with the battle detail groups
  { label: 'a high-geometry bot', options: (id) => ({ quality: 'ai', geometryQuality: 'high', batchStatic: true, battleDetailLod: true,
    staticDrawMerge: battleStaticDrawMerge(id) }) },
  { label: 'unbatched (before perf-252)', options: () => ({ quality: 'ai' }) },
];
const IDS = ['m1a2_abrams_sepv3', 't90m', 'leo2a7v', 'merkava4', 'leclerc_xlr'];
const SEED = 4321;
const rows = [];
for (const id of IDS) {
  await ensureTankBuilder(id);
  const spec = getSpec(id);
  for (const config of CONFIGS) {
    const label = `${id} (${config.label})`;
    const options = { camoSeed: SEED, camoPattern: null, eraVisualBindingReceipt: false, ...config.options(id) };
    const source = createTank(id, null, options);
    const fresh = createTank(id, null, options);
    const pristine = drawn(source);
    same(drawn(fresh), pristine, `${label}: two builds of one seat`);
    const leases = battleGeometrySharingStats().leases;
    const t0 = performance.now();
    const clone = cloneTankVisual(source, null, options);
    const cloneMs = performance.now() - t0;
    if (options.batchStatic) assert.ok(battleGeometrySharingStats().leases > leases, `${label}: the copy leases the pooled stock`);
    same(drawn(clone), pristine, `${label}: the copy at rest`);
    assert.ok(clone.root !== source.root);
    // the energy skin's unwrap re-seats a battle build's twins (juggernautVisual): the copy is split as its build was
    if (options.batchStatic) {
      assert.ok(clone.root.userData.programVariants?.twins > 0, `${label}: the build split its program variants`);
      assert.deepEqual(splitProgramVariants(clone.root, { onlyAlreadySplit: true }),
        splitProgramVariants(fresh.root, { onlyAlreadySplit: true }), `${label}: the re-seat finds the copy's split`);
      same(drawn(clone), drawn(fresh), `${label}: re-seated`);
    }

    // driven alike: the gear, the tracks' scroll, the turret and gun, the distance hand-offs and the far merge. Both far
    // LODs prepared first, as the battle visual streamer prepares every seat's (prepareFarLod): from 90 m the gear stage
    // (local-fps-265) draws the far LOD's wheel stations, and a build at range is spaced one vehicle at a time
    // (claimFarLodBuild), so an unprepared pair would enter it on different frames
    clone.prepareFarLod?.(); fresh.prepareFarLod?.();
    const a = createTankState(spec, new THREE.Vector3(3, 0.4, -7), 0.3);
    const b = createTankState(spec, new THREE.Vector3(3, 0.4, -7), 0.3);
    const distances = [8, 40, 100, 160, 100, 40, 8, undefined];
    for (let step = 0; step < 48; step++) {
      for (const state of [a, b]) {
        state.speed = 6 + Math.sin(step / 5) * 3;
        state.yaw += 0.01;
        state.pos.x += Math.sin(state.yaw) * state.speed / 30;
        state.pos.z += Math.cos(state.yaw) * state.speed / 30;
        state.turretYaw = Math.sin(step / 9) * 0.8;
        state.gunPitch = 0.05 * Math.cos(step / 7);
      }
      const dist = distances[Math.floor(step / 6)];
      clone.syncFromState(a, 1 / 30, dist);
      fresh.syncFromState(b, 1 / 30, dist);
      if (step % 6 === 5) same(drawn(clone), drawn(fresh), `${label}: driven, at ${dist ?? 'no distance'}`);
    }
    same(drawn(source), pristine, `${label}: the source untouched by its copy's runtime`);

    // a wreck (its burn, pop and dents follow the copy's own seed: the same parts draw) and its reset
    clone.setDestroyed({ ageS: 30 });
    fresh.setDestroyed({ ageS: 30 });
    clone.syncFromState(a, 1 / 30, 60);
    fresh.syncFromState(b, 1 / 30, 60);
    assert.deepEqual(drawn(clone, true), drawn(fresh, true), `${label}: the wreck draws the same parts`);
    clone.resetDestroyed();
    fresh.resetDestroyed();
    const rest = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
    clone.syncFromState(rest, 1 / 30, 10);
    fresh.syncFromState(rest, 1 / 30, 10);
    same(drawn(clone, true), drawn(fresh, true), `${label}: the reset wreck`);

    // another build refuses (the caller builds that seat)
    if (options.batchStatic) {
      for (const other of [{ batchStatic: false }, { geometryQuality: options.geometryQuality === 'low' ? 'high' : 'low' },
        { battleDetailLod: !options.battleDetailLod }]) {
        assert.throws(() => cloneTankVisual(source, null, { ...options, ...other }), /keeps its source's/, `${label}: ${JSON.stringify(other)}`);
      }
    }
    clone.dispose();
    if (options.batchStatic) assert.equal(battleGeometrySharingStats().leases, leases, `${label}: the copy's lease is released`);
    fresh.dispose();
    source.dispose();
    rows.push(`${id}/${config.label} ${pristine.length} draws, copied in ${cloneMs.toFixed(1)} ms`);
  }
}
restoreCanvas();
console.log(`tankVisualClone.selftest: ${rows.length} copies draw as fresh builds at rest, driven near, far and without a `
  + `distance, wrecked and reset, and leave their sources untouched; battle builds lease and release the pooled stock PASS\n  `
  + rows.join('\n  '));
