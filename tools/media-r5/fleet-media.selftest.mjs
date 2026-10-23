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
// brand-ui SPEC 8.2 / SHOWCASE §5.2 (BUI-F7): the 1280 rung a wide Gallery dossier and Garage panel play (gap S7) holds
// 1.5 MB and VMAF 90 against its master; its files are <vehicle>-1280.webm/.mp4 and count beside the 640 take.
const RUNG_1280_MAX = 1.5 * 1024 * 1024, RUNG_1280_VMAF = 90;
const production = new Set(PRODUCTION_TANK_IDS), named = new Set(['index.json']);
for (const [vehicle, entry] of vehicles) {
  // keys are in the index's own tank id schema; src/ui/fleetTakes.ts reads them in today's spelling (SSOT 2.19)
  assert.ok(production.has(resolveTankId(vehicle, index.tankIdSchema)), `${vehicle}: a production spec id (schema ${index.tankIdSchema ?? 1})`);
  for (const [kind, max] of [['loop', LOOP_MAX], ['poster', POSTER_MAX], ['loop1280', RUNG_1280_MAX], ['loop1280Mp4', RUNG_1280_MAX]]) {
    if (kind.startsWith('loop1280') && !entry[kind]) continue;
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
// the 1280 rung's encode, from the collection's manifest
const site = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/manifest.json'), 'utf8'));
let rung1280 = 0;
for (const file of site.files ?? []) {
  if (!/^media\/site50-r14\/fleet\/[\w-]+-1280\.(?:webm|mp4)$/.test(file.path)) continue;
  rung1280++;
  assert.ok((file.encode?.vmaf ?? 0) >= RUNG_1280_VMAF, `${file.path}: VMAF ${file.encode?.vmaf ?? 'unrecorded'}, ${RUNG_1280_VMAF} at least`);
  assert.ok(file.width === 1280 && file.height === 720, `${file.path}: 1280 x 720`);
}
// "no take = front portrait, never another tank's take" (SPEC 8.2): every take's scene stars its own vehicle (its first
// actor), so a lookup by today's id can only ever show that vehicle; and the surfaces look a take up only by the
// selected vehicle's id and show nothing for a vehicle the index lacks (its front portrait arrives with gap S5)
for (const [vehicle, entry] of vehicles) {
  const scene = JSON.parse(readFileSync(join(ROOT, 'public', entry.scene), 'utf8'));
  const hero = scene.actors?.[0];
  assert.equal(hero && resolveTankId(hero.id, scene.tankIdSchema), resolveTankId(vehicle, index.tankIdSchema),
    `${vehicle}: its take's scene stars that vehicle, never another tank`);
}
const surface = (file) => readFileSync(join(ROOT, file), 'utf8');
assert.match(surface('src/ui/garage.ts'), /const take = fleetIndex\?\.get\(vehicleId\) \?\? null;/, 'the Garage looks up the selected tank\'s own take');
assert.match(surface('src/gallery/inAction.ts'), /\.get\(/, 'the Gallery looks a take up by the vehicle');
assert.match(surface('src/docs/referenceTakes.ts'), /\(await module\.loadFleetTakes\(\)\)\.get\(vehicle\)/, 'the manual looks up the record\'s own vehicle');
const total = files.reduce((sum, f) => sum + statSync(join(DIR, f)).size, 0);
const total640 = files.filter((f) => !/-1280\.\w+$/.test(f)).reduce((sum, f) => sum + statSync(join(DIR, f)).size, 0);
assert.ok(total640 <= PER_VEHICLE * Math.max(1, vehicles.length) + 64 * 1024,
  `the fleet folder's 640 takes are ${(total640 / 1048576).toFixed(1)} MB for ${vehicles.length} vehicles, at most 0.55 MB a vehicle`);
console.log(`fleet-media.selftest: ${vehicles.length} vehicles, ${(total / 1048576).toFixed(1)} MB (loops ≤ 0.6 MB, posters ≤ 120 KB); `
  + `${rung1280 ? `${rung1280} 1280 rungs ≤ 1.5 MB at VMAF ≥ 90` : 'no 1280 rung yet (gap S7)'}; every take stars its own vehicle`);
