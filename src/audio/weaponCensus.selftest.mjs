// weaponCensus.selftest.mjs — the weapon census is the fleet's (gun-reports-269). tools/audio/weapon-census.mjs keys every
// weapon a playable vehicle, the Gun Game or the AC-130 fires and writes the key union weaponAudio.ts FLEET_ROWS must
// cover (so a new weapon fails typecheck until it has a row), each autoloaded main gun's loader make and the ready-rack
// doors, from the vehicles' own specs and internal layouts. This receipt rebuilds the census from the live fleet and
// fails when the generated file or the census document no longer matches it (run the tool, then add any missing row).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { census, renderDoc, renderGenerated } from '../../tools/audio/weapon-census.mjs';
import { FLEET_WEAPON_KEYS, MAIN_GUN_LOADER } from './weaponCensus.generated.ts';
import { FLEET_ROWS, WEAPON_ROWS } from './weaponAudio.ts';

const result = await census();
const generated = readFileSync(new URL('./weaponCensus.generated.ts', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../../docs/audio-generation/weapon-census.md', import.meta.url), 'utf8');
assert.equal(generated, renderGenerated(result), 'weaponCensus.generated.ts is the live fleet\'s (run node tools/audio/weapon-census.mjs)');
assert.equal(doc, renderDoc(result), 'docs/audio-generation/weapon-census.md is the live fleet\'s (run node tools/audio/weapon-census.mjs)');
for (const key of result.keys.keys()) assert.ok(WEAPON_ROWS[key], `${key} (fired by ${result.keys.get(key)[0]}) has a row in WEAPON_ROWS`);
assert.deepEqual(Object.keys(FLEET_ROWS).sort(), Object.keys(WEAPON_ROWS).filter((key) => FLEET_WEAPON_KEYS.includes(key)).sort());
// The loader makes come from the layouts: the T-72 lineage's carousel, the T-80's basket, the bustle loaders, the Strv 103.
assert.equal(MAIN_GUN_LOADER.t72b3, 'carousel_az');
assert.equal(MAIN_GUN_LOADER.t80u, 'basket_mz');
assert.equal(MAIN_GUN_LOADER.leclerc_s2, 'bustle');
assert.equal(MAIN_GUN_LOADER.strv103b, 'fixed_ram');
assert.equal(MAIN_GUN_LOADER.leo2a4, undefined, 'a Leopard 2 is loaded by hand');
console.log(`weaponCensus.selftest: ${result.vehicles.length} vehicles, ${result.keys.size} keys, ${Object.keys(MAIN_GUN_LOADER).length} autoloaded main guns — the census is the fleet's`);
