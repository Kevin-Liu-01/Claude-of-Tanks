import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTank } from '../tankFactory.js';

const materialsSource = readFileSync(new URL('../materials.js', import.meta.url), 'utf8');
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

  assert.ok(armor?.material?.map, `${id}: structural armor retains world-scaled camouflage`);
  for (const [label, object] of [
    ['fittings', fittings], ['deck panels', deckPanels], ['hull canvas', hullCanvas],
    ['turret canvas', turretCanvas], ['Relikt cassettes', relikt],
  ]) {
    if (!object && id === 'bmpt_terminator2') continue;
    assert.ok(object, `${id}: ${label} mesh exists`);
    assert.equal(object.material.map, null,
      `${id}: ${label} never repeats the full camouflage atlas on primitive-local UVs`);
  }
  assert.equal(fittings.material.normalMap, null,
    `${id}: small fittings do not inherit armor-scale normal noise`);
  assert.equal(fittings.material.roughnessMap, null,
    `${id}: small fittings keep a stable matte response`);
  assert.equal(hullCanvas.material.bumpMap, null,
    `${id}: canvas is shaped by geometry instead of armor roughness detail`);
  assert.equal(deckPanels.userData.appearanceRole, 'armorPaint');
  assert.equal(deckPanels.userData.appearanceSubtype, 'painted-deck-panel');
  assert.equal(relikt.userData.appearanceRole, 'armorPaint');
  assert.equal(relikt.userData.appearanceSubtype, 'painted-relikt-cassette');

  tank.dispose();
};

assertMaterialHierarchy('t72b3m');
assertMaterialHierarchy('bmpt_terminator2');

console.log('t72CamoCoverage.selftest: T-72B3M/BMPT material hierarchy keeps camo off local-UV fittings');
