import assert from 'node:assert/strict';
import { evaluateQuality, loosePlacementPasses } from './map-environment-quality.mjs';

const kinds = ['bucket', 'churn', 'gasbottle', 'jerrycan', 'trashcan'];
for (const authoredSites of [14, 18, 20, 22]) {
  const acceptedSites = Math.ceil(authoredSites * 0.85);
  const good = { authoredSites, acceptedSites, placedMembers: acceptedSites, kinds };
  assert.ok(loosePlacementPasses(good), `${authoredSites}: authored coverage passes without body inflation`);
  assert.equal(loosePlacementPasses({ ...good, acceptedSites: acceptedSites - 1 }), false,
    `${authoredSites}: genuinely underplaced sites fail`);
  assert.equal(loosePlacementPasses({ ...good, kinds: [...kinds.slice(0, 4), kinds[0]] }), false,
    'duplicated kind labels do not fake material diversity');
  assert.equal(loosePlacementPasses({ ...good, placedMembers: acceptedSites * 3 }), false,
    'receipt cannot claim more than the existing two members per site');
}
for (const receipt of [null, {}, { authoredSites: 0 }, { authoredSites: -1 }]) {
  assert.equal(loosePlacementPasses(receipt), false, 'absent/invalid construction receipts fail visibly');
}
const quality = {
  map: { landforms: 6, tacticalBeats: 3, roads: 5, wallRuns: 6 },
  buildings: { placed: 20, familyCount: 12, destructibleFamilies: 4 },
  decorations: {
    destructibles: 500, destructibleKinds: 40, wrecks: 5,
    looseProps: 25,
    loosePlacement: { authoredSites: 20, acceptedSites: 19, placedMembers: 25, kinds },
    utilityPoles: { enabled: false },
    grounding: { unsupportedDestructibles: 0, unsupportedWideDecorations: 0 },
  },
  foliage: { configuredSpecies: 3, concealers: 100 },
  water: { features: 2, liquid: true },
};
assert.ok(evaluateQuality({ quality }).pass, 'a fully authored small body count passes');
const canyonQuality=structuredClone(quality);
canyonQuality.map.landforms=0;
canyonQuality.map.canyonSections=[-80,0,70].map(z=>({z,westRelief:64,eastRelief:86,
  westFloorDelta:1,eastFloorDelta:-1}));
assert.ok(evaluateQuality({id:'badlands',quality:canyonQuality}).checks.mapAuthorship);
assert.equal(evaluateQuality({id:'frontier',quality:canyonQuality}).checks.mapAuthorship,false);
for(const patch of [{westRelief:0},{eastRelief:0},{eastFloorDelta:20},{z:999}]) {
  const bad=structuredClone(canyonQuality);Object.assign(bad.map.canyonSections[1],patch);
  assert.equal(evaluateQuality({id:'badlands',quality:bad}).checks.mapAuthorship,false);
}
delete canyonQuality.map.canyonSections;
assert.equal(evaluateQuality({id:'badlands',quality:canyonQuality}).checks.mapAuthorship,false,
  'name and metadata alone cannot certify regional relief');
for (const [section, property, value, check] of [
  ['decorations', 'destructibles', 349, 'decorationQuality'],
  ['decorations', 'destructibleKinds', 31, 'decorationQuality'],
  ['decorations', 'wrecks', 3, 'decorationQuality'],
  ['buildings', 'placed', 14, 'buildingQuality'],
]) {
  const broken = structuredClone(quality);
  broken[section][property] = value;
  assert.equal(evaluateQuality({ quality: broken }).checks[check], false,
    `${property}: original independent quality floor remains enforced`);
}
const broken = structuredClone(quality);
broken.decorations.looseProps = 1000;
broken.decorations.loosePlacement.acceptedSites = 16;
assert.equal(evaluateQuality({ quality: broken }).pass, false,
  'inflating the overall loose-body count cannot hide failed authored sites');
broken.decorations.loosePlacement = quality.decorations.loosePlacement;
broken.decorations.grounding.unsupportedWideDecorations = 1;
assert.equal(evaluateQuality({ quality: broken }).checks.decorationGrounding, false);
console.log('map-environment-quality.selftest: authored coverage/diversity, invalid receipts and unchanged independent gates pass');
