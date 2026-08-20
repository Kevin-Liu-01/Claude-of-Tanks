import assert from 'node:assert/strict';
// The factory registers every first-party expansion module before finalizing
// ALL_TANK_IDS. The browser gallery imports it first for the same reason.
import '../vehicles/tankFactory.js';
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.js';
import {
  buildGalleryRecords,
  createGalleryRecord,
  filterGalleryRecords,
  serializeGallerySpec,
} from './catalog.js';

const records = buildGalleryRecords(VISIBLE_TANK_IDS.map(getSpec));
assert.equal(records.length, VISIBLE_TANK_IDS.length, 'every visible vehicle must appear in the gallery');
assert.ok(records.length > 0, 'gallery roster must not be empty');
assert.ok(records.every((record) => !record.developmentOnly),
  'production gallery must not expose development-only vehicles');

for (const record of records) {
  assert.ok(record.displayName, `${record.id}: missing display name`);
  assert.equal(record.authorship?.creator, 'Kevin B. Liu', `${record.id}: missing named model creator`);
  assert.equal(record.authorship?.license, 'MIT', `${record.id}: missing first-party model license`);
  assert.equal(record.brief.length, 2, `${record.id}: expected two readable paragraphs`);
  assert.ok(record.brief.every((paragraph) => paragraph.length > 100), `${record.id}: brief is too thin`);
  assert.ok(Object.values(record.ratings).every((value) => value >= 0 && value <= 100), `${record.id}: rating outside 0..100`);
  assert.ok(record.searchText.includes(record.id.toLocaleLowerCase('en-US')), `${record.id}: stable id missing from search index`);
}

const first = records[0];
assert.deepEqual(filterGalleryRecords(records, { query: first.id }), [first], 'stable id search must find one exact record');
assert.ok(filterGalleryRecords(records, { nation: first.nation }).every((record) => record.nation === first.nation));
assert.ok(filterGalleryRecords(records, { vehicleClass: first.classKey }).every((record) => record.classKey === first.classKey));

const serialized = serializeGallerySpec(getSpec(first.id));
assert.equal(serialized.schema, 'claude-of-tanks/gallery-spec@1');
assert.equal(serialized.id, first.id);
assert.equal(serialized.authorship.creator, 'Kevin B. Liu');
assert.equal(serialized.authorship.geometry, 'first-party-procedural');
assert.ok(Array.isArray(serialized.gun.shells));
assert.ok(Number.isFinite(serialized.protection.armorPlateCount));

const sample = createGalleryRecord(getSpec(VISIBLE_TANK_IDS[0]));
assert.match(sample.brief.join(' '), new RegExp(sample.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const magazineRecord = createGalleryRecord(getSpec('pl01_105'));
assert.equal(magazineRecord.metrics.autoloader, true);
assert.equal(magazineRecord.metrics.magazineSize, 4);
assert.equal(magazineRecord.metrics.intraClipS, 2);
assert.equal(magazineRecord.metrics.reloadS, 18);
assert.equal(magazineRecord.metrics.burstDamage, 1600);
assert.equal(magazineRecord.metrics.dpm, 4000);
assert.match(magazineRecord.brief.join(' '), /4-round magazine autoloader/);
assert.match(magazineRecord.highlights.join(' '), /1,600 burst damage/);

const serializedMagazine = serializeGallerySpec(getSpec('pl01_105'));
assert.deepEqual(serializedMagazine.gun.autoloader, {
  magazineSize: 4,
  intraMagazineCycleS: 2,
  fullReloadS: 18,
  burstDamage: 1600,
  sustainedDamagePerMinute: 4000,
});

console.log(`tank gallery catalog self-test passed (${records.length} vehicles)`);
