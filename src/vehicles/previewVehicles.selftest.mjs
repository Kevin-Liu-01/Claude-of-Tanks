// previewVehicles.selftest.mjs — (endscreen-modes-275) the preview vehicles by kind: every mode whose ruleset flies the
// player's seat as a gunship previews its aircraft (and no other mode does), every aircraft's renders are on disk under
// the tanks' file names with the hashes its manifest records, and its hero card is shipped.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { GAME_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { tankAssetFile } from './tankAssets.ts';
import {
  AIRCRAFT_ASSETS_FILE, AIRCRAFT_VIEWS, MODE_AIRCRAFT, PREVIEW_AIRCRAFT, PREVIEW_AIRCRAFT_IDS, modePreviewVehicle, previewVehicleKind,
} from './previewVehicles.ts';

const publicIcons = new URL('../../public/icons/', import.meta.url);
for (const mode of GAME_MODE_IDS) {
  const flies = matchRulesetFor(mode)?.aerial === 'gunship';
  assert.equal(Object.hasOwn(MODE_AIRCRAFT, mode), flies, `${mode}: ${flies ? 'flies the gunship and previews it' : 'previews the garage tank'}`);
}
assert.deepEqual(modePreviewVehicle('ac130', 'm1a1_abrams_hc'), { kind: 'aircraft', id: 'ac130' });
assert.deepEqual(modePreviewVehicle('air_support', 'm1a1_abrams_hc'), { kind: 'tank', id: 'm1a1_abrams_hc' },
  "Air Support's crews drive their tanks (its AC-130 is a call-in)");
assert.equal(previewVehicleKind('m1a1_abrams_hc'), 'tank');
assert.equal(previewVehicleKind('ac130'), 'aircraft');

const manifest = JSON.parse(readFileSync(new URL(AIRCRAFT_ASSETS_FILE, publicIcons), 'utf8'));
const hero = JSON.parse(readFileSync(new URL('hero/hero-cards.json', publicIcons), 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(new URL(file, publicIcons))).digest('hex');
for (const id of PREVIEW_AIRCRAFT_IDS) {
  const row = manifest.aircraft[id];
  assert.ok(row, `${id}: rendered (node tools/genAircraftAssets.mjs --ids=${id})`);
  assert.equal(row.kind, 'aircraft');
  assert.equal(row.nation, PREVIEW_AIRCRAFT[id].nation);
  for (const view of AIRCRAFT_VIEWS) {
    const asset = row.assets[view];
    assert.equal(asset?.file, tankAssetFile(id, view), `${id} ${view}: under the tanks' file name`);
    assert.ok(existsSync(new URL(asset.file, publicIcons)), `${id} ${view}: on disk`);
    assert.equal(sha(asset.file), asset.sha256, `${id} ${view}: the bytes its manifest records`);
  }
  assert.equal(sha(row.assets.angle.thumbnail.file), row.assets.angle.thumbnail.sha256, `${id}: its Garage thumbnail`);
  // the dims the stage and the cameras frame it by are the airframe's own
  const dims = PREVIEW_AIRCRAFT[id];
  assert.ok(Math.abs(row.dims.spanM - dims.spanM) < 1.5 && Math.abs(row.dims.lengthM - dims.lengthM) < 1.5,
    `${id}: the table's dims (${dims.spanM} x ${dims.lengthM} m) are the render's (${row.dims.spanM} x ${row.dims.lengthM} m)`);
  const card = hero.tanks[id];
  assert.ok(card, `${id}: its hero card is shipped (node tools/genHeroCards.mjs --ids=${id}, then hero-cards-compose.mjs ship)`);
  assert.equal(card.mount, 'aircraft');
  assert.equal(card.in?.[0], row.geometryHash, `${id}: the card rendered from the current airframe`);
}
console.log(`previewVehicles.selftest: ${PREVIEW_AIRCRAFT_IDS.length} preview aircraft (${PREVIEW_AIRCRAFT_IDS.join(', ')}): the gunship modes preview them, their renders and hero cards are shipped`);
