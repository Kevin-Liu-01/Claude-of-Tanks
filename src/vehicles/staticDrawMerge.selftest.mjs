// P21 static draw merges (staticDrawMerge.ts): each battle/Garage build is compared with the same build at
// staticDrawMerge 'off', layer by layer (the coplanar depth layer is a unique deterministic id for every
// color-pass mesh in both builds). Pins the merges per articulation owner, the side table and every
// consumer the merge must leave exact.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank } = await import('./tankFactory.ts');
const { getSpec } = await import('./specs.ts');
const { createTankState } = await import('../sim/movement.ts');
const { createShowroomOrbit } = await import('../engine/cameraRig.ts');
const { vehicleShadowDetailOf } = await import('../engine/nearVehicleShadowDetail.ts');
const { vehicleNightLightEmittersFor } = await import('./vehicleNightLighting.ts');
const { smokeSocketsFor } = await import('./vehicleAuxiliaryGeometry.ts');
const { staticMergePartsOf, staticMergePartMatrixWorld, staticMergePartForFace, findStaticMergePart } =
  await import('./staticMergeParts.ts');

const BOT = { camoSeed: 4242, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false };
const PLAYER = { camoSeed: 4242, quality: 'preview', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, eraVisualBindingReceipt: false };
const GARAGE = { camoSeed: 4200, quality: 'ai', staticPreview: true, batchStatic: true, eraVisualBindingReceipt: false };
// Draws saved per articulation owner. A different count means the merged set changed: review the
// equivalence below and the census (.qa-dev f3-census / f3-equivalence in the P21 records), then re-pin.
// 2026-10-07 (tank-accessories round 3): the shared machine gun's can and belt rounds now share the fitting paint, so
// each roof gun folds one more contiguous run (leo2a7v_x's roof gun, the m1a2's commander MAG, the T-90M's remote
// Kord). The m1a2's rig_turret fold already stood at the integration base 9fceb4b9b.
// 2026-10-07 (tank-accessories round 4, ec873dc52: smoke discharger tubes in matte fitting paint): the challenger_3x
// and m1a2 rig_turret folds (turret + turretDetail) are gone. The tubes' smoke apertures had made the whole
// turretDetail combat-visible (resident at every range, like the turret shell); without them turretDetail is
// cosmetic distance detail, a different class from the shell, so the two no longer share a run. Near the tanks draw
// turret, turretDetail and turretFittingPaint (the tubes); at range turretDetail now detaches.
const PINNED = {
  ua_m1a1_x: { saved: 88, owners: { rig_hull: 1, rig_turret: 1, abramsSourceX_LoaderM240: 86 } },
  leo2a7v_x: { saved: 2, owners: { rig_hull: 1, leo2a7v_xRoofMachineGun: 1 } },
  challenger_3x: { saved: 1, owners: { auxiliaryWeaponPitch: 1 } },
  // 2026-10-06 (main's M1A1 mantlet and throat rebuild, ce9f55959..030b3ff96): the m1a2 turretDark bucket is now created after
  // turretCloth, so turret and turretDetail formed one contiguous layer run and merged; round 4's matte discharger tubes
  // (above) leave turretDetail cosmetic, so that fold is gone again. The round-3 machine gun's fitting-paint can and
  // rounds fold one run on the commander MAG.
  m1a2: { saved: 2, owners: { 'fitting_abramsM2HB_m1a2-split-loader': 1, fitting_browningDerived_mag: 1 } },
  t90m: { saved: 1, owners: { t90mProryvRemoteKord: 1 } },
  // turret + a 77,472-vertex turretDetail would be one more draw saved for a 3.4 MB copy: the 16,384-vertex cap keeps both
  strv122_x: { saved: 0, owners: {} },
};
const IDENTITY = new THREE.Matrix4();

function layered(root) {
  const byLayer = new Map();
  root.traverse((o) => { if (o.isMesh && Number.isInteger(o.userData.coplanarDepthLayer)) byLayer.set(o.userData.coplanarDepthLayer, o); });
  return byLayer;
}
/** layer -> { mesh, part } for a merged build (a folded source answers through its draw). */
function sources(root) {
  const out = new Map();
  for (const [layer, mesh] of layered(root)) {
    const parts = staticMergePartsOf(mesh);
    if (!parts.length) out.set(layer, { mesh, part: null });
    for (const part of parts) out.set(part.layer, { mesh, part });
  }
  return out;
}
const bytes = (attribute, start = 0, count = attribute.count) => {
  const array = attribute.array, size = attribute.itemSize * array.BYTES_PER_ELEMENT;
  return Buffer.from(array.buffer, array.byteOffset + start * size, count * size);
};
const visibleChain = (object, root) => { for (let n = object; n && n !== root.parent; n = n.parent) if (!n.visible) return false; return true; };
function updateLods(root, distance) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(distance, 1.8, 0);
  camera.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  for (let pass = 0; pass < 2; pass++) root.traverse((o) => { if (o.isLOD) o.update(camera); });
}
function emitters(root, read) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), rows = [];
  root.traverse((o) => { for (const item of read(o)) {
    const m = inverse.clone().multiply(o.matrixWorld);
    rows.push([...new THREE.Vector3().fromArray(item.position).applyMatrix4(m).toArray(),
      ...new THREE.Vector3().fromArray(item.direction ?? [0, 0, 1]).transformDirection(m).toArray()]);
  } });
  return rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}
function sameRows(a, b, label) {
  assert.equal(a.length, b.length, `${label}: count`);
  a.forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(v - b[i][j]) <= 1e-9, `${label}: row ${i}`)));
}
function showroomPose(root) {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 4000);
  let pose = null;
  const orbit = createShowroomOrbit(camera, { setExternalPose: (position, target, fov) => { pose = [...position.toArray(), ...target.toArray(), fov]; } },
    { getSubject: () => root, heroYawRad: 0.65, heroPitchRad: 0.22 });
  orbit.start(); orbit.update(1 / 60); orbit.stop();
  return pose;
}

/** Build off/merged twins and prove the merged one is the same scene, draw for draw. */
function equivalent(id, options, label) {
  const off = createTank(id, null, { ...options, staticDrawMerge: 'off' });
  const merged = createTank(id, null, options);
  const stats = { id, label, merges: merged.root.userData.staticMergeCount, saved: merged.root.userData.staticMergeSavedDraws, owners: {} };
  try {
    assert.equal(off.root.userData.staticMergeSavedDraws, undefined, `${label} ${id}: 'off' keeps every separate draw`);
    off.root.updateMatrixWorld(true); merged.root.updateMatrixWorld(true);
    const a = layered(off.root), b = sources(merged.root), world = new THREE.Matrix4();
    assert.equal(b.size, a.size, `${label} ${id}: every color-pass layer is still drawn exactly once`);
    const pairs = new Map();
    for (const [layer, mesh] of layered(merged.root)) {
      const parts = staticMergePartsOf(mesh);
      if (!parts.length) continue;
      const owner = (mesh.parent.isLOD ? mesh.parent.parent : mesh.parent).name;
      stats.owners[owner] = (stats.owners[owner] ?? 0) + parts.length - 1;
      assert.ok(parts.length > 1 && mesh.matrix.equals(IDENTITY), `${label} ${id}: a merged draw sits at its owner frame`);
      assert.ok(mesh.geometry.getAttribute('position').count <= 16384, `${label} ${id}: ${mesh.name} stays within the merged-vertex cap`);
      parts.forEach((part, i) => { if (i) assert.equal(part.layer, parts[i - 1].layer + 1, `${label} ${id}: ${mesh.name} folds consecutive layers only`); });
      assert.equal(layer, parts.at(-1).layer, `${label} ${id}: ${mesh.name} collapses onto its run's top layer`);
    }
    for (const [layer, source] of a) {
      const { mesh, part } = b.get(layer);
      for (const flag of ['castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled']) assert.equal(mesh[flag], source[flag], `${label} ${id} ${layer} ${flag}`);
      const prior = pairs.get(source.material);
      assert.ok(!prior || prior === mesh.material, `${label} ${id}: one material per source material`);
      pairs.set(source.material, mesh.material);
      if (!part) {
        assert.equal(mesh.name, source.name, `${label} ${id}: an unmerged mesh keeps layer ${layer}`);
        assert.ok(mesh.matrixWorld.equals(source.matrixWorld), `${label} ${id}: ${source.name} world matrix`);
        continue;
      }
      assert.equal(part.name, source.name, `${label} ${id}: side table names layer ${layer}`);
      assert.deepEqual({ ...part.userData, coplanarDepthLayer: undefined }, { ...source.userData, coplanarDepthLayer: undefined },
        `${label} ${id}: side table keeps ${source.name}'s userData`);
      assert.ok(staticMergePartMatrixWorld(mesh, part, world).equals(source.matrixWorld), `${label} ${id}: ${source.name} replayed world matrix`);
      const translated = !part.matrix.equals(IDENTITY);
      for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
        const target = mesh.geometry.getAttribute(name);
        if (name === 'position' && translated) {
          const e = part.matrix.elements;
          for (let v = 0; v < attribute.count; v++) {
            assert.ok(target.getX(part.vertexStart + v) === Math.fround(attribute.getX(v) + e[12])
              && target.getY(part.vertexStart + v) === Math.fround(attribute.getY(v) + e[13])
              && target.getZ(part.vertexStart + v) === Math.fround(attribute.getZ(v) + e[14]), `${label} ${id}: ${source.name} translated vertex ${v}`);
          }
        } else {
          assert.ok(bytes(attribute).equals(bytes(target, part.vertexStart, part.vertexCount)), `${label} ${id}: ${source.name} ${name} bytes`);
        }
      }
    }
    // effective visibility per layer through the LOD switches and the distance-detail policy
    const stateA = createTankState(getSpec(id), new THREE.Vector3(), 0), stateB = createTankState(getSpec(id), new THREE.Vector3(), 0);
    for (const distance of [12, 58, 70, 130, 260, 40]) {
      off.syncFromState(stateA, 0, distance); merged.syncFromState(stateB, 0, distance);
      updateLods(off.root, distance); updateLods(merged.root, distance);
      const shown = sources(merged.root);
      let attached = 0;
      for (const [layer, mesh] of layered(off.root)) {
        attached++;
        assert.equal(visibleChain(shown.get(layer)?.mesh, merged.root), visibleChain(mesh, off.root), `${label} ${id}: layer ${layer} visibility at ${distance} m`);
      }
      assert.equal(shown.size, attached, `${label} ${id}: same attached detail at ${distance} m`);
    }
    const casters = (root) => [...new Set((vehicleShadowDetailOf(root)?.detail ?? []).flatMap((mesh) =>
      staticMergePartsOf(mesh).length ? staticMergePartsOf(mesh).map((part) => part.layer) : [mesh.userData.coplanarDepthLayer ?? mesh.name]))].sort();
    assert.deepEqual(casters(merged.root), casters(off.root), `${label} ${id}: near-hull shadow casters cover the same layers`);
    sameRows(emitters(merged.root, vehicleNightLightEmittersFor), emitters(off.root, vehicleNightLightEmittersFor), `${label} ${id} night lamps`);
    sameRows(emitters(merged.root, smokeSocketsFor), emitters(off.root, smokeSocketsFor), `${label} ${id} smoke sockets`);
    assert.deepEqual(merged.prepareForSimulation(), off.prepareForSimulation(), `${label} ${id}: rest contact replays every source exactly`);
    assert.deepEqual(showroomPose(merged.root), showroomPose(off.root), `${label} ${id}: showroom framing box`);
    merged.seatOnFloor(0); off.seatOnFloor(0);
    assert.equal(merged.root.position.y, off.root.position.y, `${label} ${id}: presentation floor`);
    // ERA strip/reset and weapon scorch edit buffers in place: those buffers never merge, and every
    // merged draw's buffer is untouched by them.
    const digest = (geometry) => ['position', 'color', 'normal'].map((name) => geometry.getAttribute(name))
      .map((attribute) => (attribute ? bytes(attribute).toString('base64') : null)).join('|');
    const editable = (root) => [...sources(root)].sort(([x], [y]) => x - y)
      .filter(([, { part }]) => !part).map(([layer, { mesh }]) => [layer, digest(mesh.geometry)]);
    const mergedDraws = () => [...layered(merged.root).values()].filter((mesh) => staticMergePartsOf(mesh).length).map((mesh) => digest(mesh.geometry));
    const mergedBefore = mergedDraws();
    for (const name of off.root.userData.eraClusterNames ?? []) { off.stripEra(name); merged.stripEra(name); }
    for (const module of ['roofGun', 'mainGun', 'coaxMg', 'launcher']) { off.setWeaponModuleState(module, 'red'); merged.setWeaponModuleState(module, 'red'); }
    const offLive = editable(off.root).filter(([layer]) => !sources(merged.root).get(layer).part);
    assert.deepEqual(editable(merged.root), offLive, `${label} ${id}: stripped ERA and scorched stock identical`);
    assert.deepEqual(mergedDraws(), mergedBefore, `${label} ${id}: no in-place edit reaches a merged draw`);
    off.resetDestroyed(); merged.resetDestroyed();
    assert.deepEqual(editable(merged.root), editable(off.root).filter(([layer]) => !sources(merged.root).get(layer).part),
      `${label} ${id}: reset restores identical buffers`);
    off.setDestroyed({ ageS: 0 }); merged.setDestroyed({ ageS: 0 });
    const wreck = new Map();
    for (const [layer, source] of layered(off.root)) {
      const { mesh } = sources(merged.root).get(layer);
      assert.equal(mesh.visible, source.visible, `${label} ${id}: wreck visibility ${layer}`);
      const prior = wreck.get(source.material);
      assert.ok(!prior || prior === mesh.material, `${label} ${id}: wreck sweep pairs materials`);
      wreck.set(source.material, mesh.material);
    }
  } finally { off.dispose(); merged.dispose(); }
  return stats;
}

const results = [];
for (const [id, pin] of Object.entries(PINNED)) {
  const bot = equivalent(id, BOT, 'bot');
  assert.equal(bot.saved, pin.saved, `${id}: pinned draws saved`);
  assert.deepEqual(bot.owners, pin.owners, `${id}: pinned merges per articulation owner`);
  results.push(bot);
}
for (const id of ['ua_m1a1_x', 'challenger_3x']) results.push(equivalent(id, PLAYER, 'player'), equivalent(id, GARAGE, 'garage'));

// Side table: a folded source answers by name and by raycast face; a live mesh answers as itself.
const tank = createTank('ua_m1a1_x', null, BOT);
try {
  const merged = []; tank.root.traverse((o) => { if (staticMergePartsOf(o).length) merged.push(o); });
  const draw = merged.find((mesh) => staticMergePartsOf(mesh).length > 4);
  const parts = staticMergePartsOf(draw);
  const found = findStaticMergePart(tank.root, parts[2].name);
  assert.equal(found.mesh, draw, 'a folded source resolves to its merged draw');
  assert.equal(found.part, parts[2], 'with its side-table row');
  const live = findStaticMergePart(tank.root, 'hull');
  assert.ok(live && live.part === null && live.mesh.name === 'hull', 'a live mesh resolves to itself');
  const corner = (part) => (part.indexStart >= 0 ? part.indexStart : part.vertexStart);
  const count = (part) => (part.indexStart >= 0 ? part.indexCount : part.vertexCount);
  assert.equal(staticMergePartForFace(draw, corner(parts[1]) / 3), parts[1], 'first face of a part');
  assert.equal(staticMergePartForFace(draw, (corner(parts[1]) + count(parts[1])) / 3 - 1), parts[1], 'last face of a part');
  assert.equal(staticMergePartForFace(draw, (corner(parts[1]) + count(parts[1])) / 3), parts[2], 'next part begins at the boundary');
  assert.ok(!Object.keys(draw.userData).includes('staticMergeParts') && JSON.stringify(draw.userData).length < 4096,
    'the side table never rides userData copies or digests');
  const disposed = new Set(); for (const part of parts) part.geometry.addEventListener('dispose', () => disposed.add(part.geometry));
  tank.dispose();
  assert.equal(disposed.size, new Set(parts.map((part) => part.geometry)).size, 'every folded source buffer is released with the visual');
} catch (error) { tank.dispose(); throw error; }

// Modes: the default folds only parts already at their owner frame (every vertex byte unchanged); the opt-in
// translation bake folds more, and is held to the same layer-by-layer equivalence; non-battle builds never merge.
const translations = equivalent('ua_m1a1_x', { ...BOT, staticDrawMerge: 'translations' }, 'translations');
assert.ok(translations.saved > PINNED.ua_m1a1_x.saved, 'the translation bake is a strict superset of the default merge');
results.push(translations);
const identity = createTank('ua_m1a1_x', null, BOT);
const authoring = createTank('ua_m1a1_x', null, { ...BOT, batchStatic: false, battleDetailLod: false });
try {
  identity.root.traverse((o) => { for (const part of staticMergePartsOf(o)) assert.ok(part.matrix.equals(IDENTITY), 'the default never bakes a translation'); });
  let folded = 0; authoring.root.traverse((o) => { folded += staticMergePartsOf(o).length; });
  assert.equal(folded, 0, 'authoring (non-batchStatic) builds keep every separate mesh');
  assert.equal(authoring.root.userData.staticMergeSavedDraws, undefined);
} finally { identity.dispose(); authoring.dispose(); }
restoreCanvas();
console.log(`staticDrawMerge.selftest: ${results.length} off/merged twins equivalent; ${results.map((r) => `${r.label} ${r.id} -${r.saved}`).join(', ')}`);
