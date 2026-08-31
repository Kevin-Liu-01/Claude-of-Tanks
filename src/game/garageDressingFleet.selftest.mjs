import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dressing = await readFile(new URL('./garageDressing.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('./garageDressingAccess.ts', import.meta.url), 'utf8');
const stage = await readFile(new URL('../ui/garageStage.ts', import.meta.url), 'utf8');

assert.match(dressing, /import\('\.\.\/vehicles\/fleetFactory\.ts'\)/,
  'the optional workshop must acquire the fleet lazily');
assert.match(dressing, /ensureTankBuilders\(WORKSHOP_FLEET_IDS\)/);
assert.match(dressing, /quality: 'ai'[\s\S]*geometryQuality: 'high'[\s\S]*staticPreview: true/,
  'workshop tanks use exact fleet geometry with the garage material tier');
for (const id of ['t90a_burlak', 'm1a2', 't90m', 'k2']) {
  assert.match(dressing, new RegExp(`createLegacyVisual\\('${id}'`));
}
assert.doesNotMatch(dressing, /addFleetExhibit\(/,
  'alternate duplicate fleet displays must not be built');
assert.doesNotMatch(dressing, /leclerc/,
  'the retired alternate Leclerc display must not wake its builder');
assert.match(dressing, /layoutReceipt = 'pre-6c7b07533-original'/,
  'Verdant must carry an explicit receipt for the pre-overhaul arrangement');
for (const signature of [
  'verdant_original_turret_gantry',
  'verdant_original_jack_stands',
  'verdant_original_removed_side_skirts',
  'verdant_original_welding_cable',
  'relikt_service_rack',
  'verdant_original_removed_k2_running_gear',
  'track_shoe_pallet',
  'dressing_modern_machine_gun_service_rack',
  'verdant_gantry_connected_crosshead',
  'verdant_gantry_connected_side_rail',
  'verdant_gantry_ground_foot',
]) {
  assert.match(dressing, new RegExp(signature));
}
assert.match(dressing, /tank\.position\.set\(17\.8, 0\.42, -15\.5\)/,
  'Burlak gantry bay retains its original transform');
assert.match(dressing, /tank\.position\.set\(16\.9, 0, 17\.7\)/,
  'Abrams welding bay retains its original transform');
assert.match(dressing, /tank\.position\.set\(-6\.6, 0, 20\.5\)/,
  'T-90M component bay retains its original transform');
assert.match(dressing, /tank\.position\.set\(-16\.25, 0, -16\.85\)/,
  'K2 teardown retains its original transform');
assert.match(dressing, /legacyVerdantRoot\.visible = isVerdant/,
  'the original four-bay composition must be visible only in Verdant');
assert.match(dressing, /verdantInteriorRoot\.visible = isVerdant/,
  'indoor wall clutter must remain exclusive to Verdant');
assert.match(dressing,
  /staticDisplayOwners:\s*\[legacyVerdantRoot, verdantInteriorRoot\]/,
  'the shared bays and Verdant-only interior collapse static leaf draws independently');
assert.match(dressing, /sharedMaintenanceBayCount = isVerdant \? 4 : 0/);
for (const bay of ['burlak_gantry', 'abrams_welding', 't90m_relikt', 'rolled_k2']) {
  assert.match(dressing, new RegExp(bay));
}
assert.doesNotMatch(dressing, /\/maps\/thumbs\//,
  'workshop walls must not reuse battlefield map thumbnails');
assert.doesNotMatch(dressing, /garage_map_location_preview/,
  'the old location-preview wall mesh must be removed');
assert.match(dressing, /import \{ FEATURED_SHOTS \} from '\.\.\/ui\/featuredShots\.ts'/,
  'the wall monitor reuses the canonical checked-in battle archive');
assert.match(dressing, /FEATURED_SHOTS\.filter\(\(shot\) => !shot\.handmade && shot\.maps\?\.length\)/,
  'editor/studio frames must not enter the workshop battle rotation');
assert.match(dressing, /garage_battle_archive_screen/);
assert.match(dressing, /battleScreenMode = 'crt-scroll-slideshow'/);
assert.match(dressing, /uTransition[\s\S]*scanline[\s\S]*rollingGlow/,
  'the archive changes images with a shader scroll and visible CRT treatment');
assert.match(dressing, /if \(!group\.parent \|\| !group\.visible \|\| document\.hidden\) return/,
  'the screen timer must stop instead of polling during battle or background tabs');
assert.match(access, /prepareGarageDressing\?\./,
  'the access boundary prepares fleet builders before the synchronous chunk pump');
assert.doesNotMatch(stage, /openRoof = new Set\(\['field_shed'/,
  'Verdant must retain the original enclosed ceiling and roof trusses');
assert.match(stage, /NO SMOKING\|FLAMMABLE\|FIRE/,
  'hazard signs must use the red safety category');
assert.match(stage, /\^BAY\\b/,
  'bay identification signs must use the blue safety category');

console.log('garageDressingFleet.selftest: Verdant-only four-bay set and independent themed environments pass');
