import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTank } from '../tankFactory.ts';

const materialsSource = readFileSync(new URL('../materials.ts', import.meta.url), 'utf8');
assert.match(materialsSource,
  /spec\.id === 't72b3m'[\s\S]*paintableRecs\.push\(\{ m: canvasCloth, kind: 'canvas' \}\)/,
  'T-72B3M canvas participates in live scheme tinting without sharing the camo map');

const assertMaterialHierarchy = (id) => {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const receipt = hull?.userData.t72b3mMaterialReceipt;
  assert.deepEqual(receipt, {
    armorUsesWorldScaledCamouflage: true,
    fittingsUseSolidSchemeTint: true,
    reliktUsesSolidSchemeTint: true,
    deckPanelsUseSolidSchemeTint: true,
    canvasUsesDedicatedMatteCloth: true,
    primitiveLocalCamoRepeatsRemoved: true,
  }, `${id}: publishes the audited T-72B3M material hierarchy`);

  const byName = (root, name) => root?.getObjectByName(name);
  const armor = byName(hull, 'hull');
  const fittings = byName(hull, 'hullDetail');
  const deckPanels = byName(hull, 'hullWood');
  const hullCanvas = byName(hull, 'hullCloth');
  const turretCanvas = byName(turret, 'turretCloth');
  const relikt = byName(turret, 'turretTrack');
  const hullExternalArmor = byName(hull, 'hullExternalArmor');
  const turretExternalArmor = byName(turret, 'turretExternalArmor');

  assert.ok(armor?.material?.map, `${id}: structural armor retains world-scaled camouflage`);
  for (const [label, object] of [
    ['fittings', fittings], ['deck panels', deckPanels], ['hull canvas', hullCanvas],
    ['turret canvas', turretCanvas], ['Relikt cassettes', relikt],
  ]) {
    // T-72B3M's former hullCloth pieces are the Relikt skirt course. The
    // fleet ERA pass deliberately moved them into the vehicle-camouflaged
    // external-armor bucket; they are not canvas stowage.
    if (!object && id === 't72b3m' && label === 'hull canvas') continue;
    if (!object && id === 'bmpt_terminator2') continue;
    assert.ok(object, `${id}: ${label} mesh exists`);
    if (label === 'fittings') {
      // Fleet paint standard (2026-09-11): welded fittings share the armor's
      // world-scaled camouflage through the same box projection, never a
      // primitive-local repeat of the atlas.
      assert.strictEqual(object.material, armor.material, `${id}: fittings share the structural armor camouflage material`);
      assert.equal(object.material.userData.camoProjection, 'vehicle-scale-box-uv',
        `${id}: fittings carry the vehicle-scale box projection, not primitive-local UVs`);
      assert.ok(object.geometry.getAttribute('uv') && object.geometry.getAttribute('color'),
        `${id}: fittings carry projected UVs and baked dirt like the plates they are welded to`);
      continue;
    }
    assert.equal(object.material.map, null,
      `${id}: ${label} never repeats the full camouflage atlas on primitive-local UVs`);
  }
  // Fittings now share the armor material (above), so they carry exactly the
  // armor's normal/roughness response instead of a separate flat tone.
  if (hullCanvas) {
    assert.equal(hullCanvas.material.bumpMap, null,
      `${id}: canvas is shaped by geometry instead of armor roughness detail`);
  }
  assert.equal(deckPanels.userData.appearanceRole, 'armorPaint');
  assert.equal(deckPanels.userData.appearanceSubtype, 'painted-deck-panel');
  assert.equal(relikt.userData.appearanceRole, 'armorPaint');
  assert.equal(relikt.userData.appearanceSubtype, 'painted-relikt-cassette');
  assert.ok(hullExternalArmor?.material?.map,
    `${id}: hull ERA uses continuous vehicle-scale camouflage`);
  if (id === 't72b3m') {
    assert.ok(turretExternalArmor?.material?.map,
      `${id}: turret ERA uses continuous vehicle-scale camouflage`);
  }

  tank.dispose();
};

assertMaterialHierarchy('t72b3m');
assertMaterialHierarchy('bmpt_terminator2');

console.log('t72CamoCoverage.selftest: T-72B3M/BMPT material hierarchy keeps camo off local-UV fittings');
