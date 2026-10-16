import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../src/vehicles/tankFactory.ts';
import { PRODUCTION_TANK_IDS } from '../../src/vehicles/specs.ts';
import { resolveTankId } from '../../src/vehicles/tankIdAliases.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';

// The fleet's panel media (owner 2026-10-12: "make a special video for all tanks ... and use that everywhere"; the
// coordinator's budget, 2026-10-13): public/media/site50-r14/fleet holds, for each production vehicle whose own take is
// filmed, a silent 640×360 loop of at most 0.6 MB and a 640×360 poster of at most 120 KB, and index.json naming them by
// today's spec ids (the id rename re-keys it from its table). The folder's total stays under 0.55 MB a vehicle, so a
// later re-encode cannot creep; every file belongs to an entry and every entry's files exist.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, 'public/media/site50-r14/fleet');
if (!existsSync(join(DIR, 'index.json'))) {
  console.log('fleet-media.selftest: no fleet media in this tree');
  process.exit(0);
}
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')), vehicles = Object.entries(index.vehicles ?? {});
// The leo2a6m swap (SSOT 2.19): the index's leo2a6m_x take is the Leopard 2A6M, which today's ids call leo2a6m, and an
// index key leo2a6m written before schema 3 is the Leopard 2A4 OTCO; read through the stamp, neither shows the other.
const shown = (key) => TANK_SPECS[resolveTankId(key, index.tankIdSchema)]?.label?.displayName;
if (index.vehicles?.leo2a6m_x) {
  assert.equal(shown('leo2a6m_x'), 'Leopard 2A6M', 'the leo2a6m_x take reads as the Leopard 2A6M');
  assert.match(index.vehicles.leo2a6m_x.title.en, /Leopard 2A6M/, 'and is the 2A6M on film');
}
if ((index.tankIdSchema ?? 1) < 3) assert.equal(shown('leo2a6m'), 'Leopard 2A4 OTCO', 'a pre-rename leo2a6m key reads as the 2A4 OTCO');
const LOOP_MAX = 0.6 * 1024 * 1024, POSTER_MAX = 120 * 1024, PER_VEHICLE = 0.55 * 1024 * 1024;
const production = new Set(PRODUCTION_TANK_IDS), named = new Set(['index.json']);
for (const [vehicle, entry] of vehicles) {
  // keys are in the index's own tank id schema; src/ui/fleetTakes.ts reads them in today's spelling (SSOT 2.19)
  assert.ok(production.has(resolveTankId(vehicle, index.tankIdSchema)), `${vehicle}: a production spec id (schema ${index.tankIdSchema ?? 1})`);
  for (const [kind, max] of [['loop', LOOP_MAX], ['poster', POSTER_MAX]]) {
    const file = entry[kind]?.replace(/^\/media\/site50-r14\/fleet\//, '');
    assert.ok(file && existsSync(join(DIR, file)), `${vehicle}: its ${kind} exists (${entry[kind]})`);
    assert.ok(statSync(join(DIR, file)).size <= max, `${vehicle}: its ${kind} is ${statSync(join(DIR, file)).size} B, at most ${max}`);
    named.add(file);
  }
  assert.ok(entry.take && entry.title?.en && entry.title?.zh && entry.scene, `${vehicle}: its take, titles and scene`);
  // the Gallery and the Garage open a take in the Studio from its scene, so the scene ships with the take
  assert.ok(existsSync(join(ROOT, 'public', entry.scene)), `${vehicle}: its scene ships (${entry.scene})`);
}
const files = readdirSync(DIR);
assert.deepEqual(files.filter((f) => !named.has(f)), [], 'every file in the fleet folder belongs to an entry');
const total = files.reduce((sum, f) => sum + statSync(join(DIR, f)).size, 0);
assert.ok(total <= PER_VEHICLE * Math.max(1, vehicles.length) + 64 * 1024,
  `the fleet folder is ${(total / 1048576).toFixed(1)} MB for ${vehicles.length} vehicles, at most 0.55 MB a vehicle`);
console.log(`fleet-media.selftest: ${vehicles.length} vehicles, ${(total / 1048576).toFixed(1)} MB (loops ≤ 0.6 MB, posters ≤ 120 KB)`);
