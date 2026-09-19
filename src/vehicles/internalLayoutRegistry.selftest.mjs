import assert from 'node:assert/strict';
import { INTERNAL_LAYOUT_SOURCES, internalLayoutFor } from './internalLayoutRegistry.ts';

// Source scopes matter: a related chassis or another turret configuration must
// not silently restore unsupported crew or weapons to these supplied studies.
const expectedSources = {
  kurganets25_x: ['awKurganetsStudy'],
  griffin50_x: ['gdGriffin2018Interview', 'awGriffin50Study'],
  aft10_x: ['awAft10Study'],
  bmp3m_dragun125_x: ['awDragun125Study'],
};
for (const [id, sources] of Object.entries(expectedSources)) {
  const layout = internalLayoutFor(id);
  assert(layout, `${id}: explicit source-study layout`);
  assert.equal(layout.confidence, 'platform-inferred', `${id}: no undocumented interior claim`);
  assert.deepEqual(layout.sources, sources, `${id}: configuration-specific source trail`);
  for (const sourceId of sources) {
    const source = INTERNAL_LAYOUT_SOURCES[sourceId];
    assert(source && /^https:\/\//.test(source.url), `${id}: usable source ${sourceId}`);
    assert.equal(source.kind, sourceId.startsWith('aw')
      ? 'source-model-publisher' : 'manufacturer-interview', `${id}: honest source provenance`);
  }
}

const griffin = internalLayoutFor('griffin50_x');
const kurganets = internalLayoutFor('kurganets25_x');
assert.notEqual(griffin.layoutKey, kurganets.layoutKey, 'Griffin does not inherit Kurganets crew/armament');
assert.deepEqual(griffin.crew.map(({ role, frame }) => [role, frame]), [
  ['driver', 'hull'], ['gunner', 'hull'],
], 'Griffin: two functional hull crew; gunner also represents the commander');
assert.equal(griffin.systems.missileRack, null, 'Griffin 50mm has no ATGM storage');
assert.equal(kurganets.crew.length, 3, 'Kurganets retains its distinct three-person crew');
assert.equal(kurganets.systems.feedSystem.form, 'inferredAutomaticFeed', 'Kurganets does not assert a dual-belt mechanism');

const aft = internalLayoutFor('aft10_x');
assert.equal(aft.crew.length, 3, 'AFT: commander, driver and missile operator');
assert(aft.crew.every(({ frame }) => frame === 'hull'), 'AFT crew remains below the external launcher');
assert.deepEqual(aft.systems.missileRack, { placement: 'turret', form: 'eightCanisterLauncher' },
  'AFT: external eight-canister system, not hidden reserve storage');

const dragun = internalLayoutFor('bmp3m_dragun125_x');
assert.deepEqual(dragun.crew.map(({ role, frame }) => [role, frame]), [
  ['driver', 'hull'], ['gunner', 'turret'], ['commander', 'turret'],
], 'Dragun BM 125 retains its manned turret instead of the unmanned 100/30mm variant');
assert.equal(dragun.systems.engine.placement, 'front', 'Dragun does not inherit the ordinary BMP-3 rear engine');
assert(dragun.systems.autoloader, 'BM 125 has automatic loading');
for (const system of [dragun.systems.ammoRack, dragun.systems.autoloader]) {
  assert(!/isolated|carousel/i.test(system.form), 'Dragun source does not establish an isolated carousel');
}

// Explicit launcher topology cannot disappear behind the legacy reload-time
// heuristic. These exterior-backed records make no hidden-geometry claim.
for (const id of ['fv510_milan_x', 'k21_x', 'cv90_mkiv_x']) {
  const layout = internalLayoutFor(id);
  assert.equal(layout.confidence, 'platform-inferred');
  assert.deepEqual(layout.systems.missileRack, { placement: 'turret', form: 'launcherReadyRounds' });
  assert.equal(layout.crew.length, 3);
  assert.equal(layout.systems.engine.placement, 'front');
  assert(layout.sources.some(key => INTERNAL_LAYOUT_SOURCES[key]?.kind === 'owner-supplied-source-study'));
}
const tml = internalLayoutFor('cv90105_tml_x');
assert.equal(tml.confidence, 'platform-inferred');
assert.equal(tml.systems.engine.placement, 'front');
assert.equal(tml.systems.transmission.placement, 'front');
assert.equal(tml.systems.autoloader, null, 'manual105mmTML is not the AW game clip-autoloader');
assert.equal(tml.crew.length, 4);
assert.equal(tml.crew.filter(station => station.frame === 'turret').length, 3);
assert.equal(tml.crew[0].station, 'frontLeft');
assert.equal(internalLayoutFor('ajax_x').systems.missileRack, null, 'source-unarmed sibling remains unarmed');
assert.equal(internalLayoutFor('cv90').layoutKey, 'ifvFrontTwoMan', 'legacy layouts are unchanged');

// Exercise the actual player lazy-loader/finalizer, not registry data alone.
const { ensureTankBuilders } = await import('./fleetFactory.ts');
const { getSpec } = await import('./specs.ts');
await ensureTankBuilders(['fv510_milan_x', 'k21_x', 'cv90_mkiv_x', 'cv90105_tml_x', 'ajax_x']);
for (const id of ['fv510_milan_x', 'k21_x', 'cv90_mkiv_x']) {
  const rack = getSpec(id).armor.modules.find(module => module.module === 'missileRack');
  assert(rack, `${id}: lazy finalization creates the actual launcher damage module`);
  assert.equal(rack.turretLocal, true, `${id}: launcher module follows turret yaw`);
  assert.equal(rack.visualForm, 'launcherReadyRounds');
}
for (const name of ['engine', 'transmission']) {
  const box = getSpec('cv90105_tml_x').armor.modules.find(module => module.module === name);
  assert(box, `TML ${name} module exists`);
  assert.equal(box.layoutPlacement, 'front');
  assert((box.min[2] + box.max[2]) / 2 > 0, `TML ${name} is physically in the forward hull`);
}
assert(!getSpec('ajax_x').armor.modules.some(module => module.module === 'missileRack'),
  'gun-only Ajax does not gain a phantom missile module during lazy finalization');

console.log('internal layout registry: supplied source scopes, crew, armament and inference bounds PASS');
