import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dressing = await readFile(new URL('./garageDressing.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('./garageDressingAccess.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('./garageWorkshopGeometryWorker.ts', import.meta.url), 'utf8');
const transfer = await readFile(new URL('./garageWorkshopTransfer.ts', import.meta.url), 'utf8');
const stage = await readFile(new URL('../ui/garageStage.ts', import.meta.url), 'utf8');

assert.doesNotMatch(dressing,
  /Promise\.all\([\s\S]{0,300}import\('\.\.\/vehicles\/fleetFactory\.ts'\)/,
  'the ordinary workshop path must not duplicate worker-owned fleet families on the render thread');
assert.match(dressing,
  /catch \(error\)[\s\S]*import\('\.\.\/vehicles\/fleetFactory\.ts'\)[\s\S]*ensureTankBuilder\(specId\)/,
  'the playable fleet facade remains an exceptional worker-recovery path');
assert.match(dressing, /WORKSHOP_CHUNK_VEHICLE_IDS\[next\]/,
  'one exact fleet builder must be resolved per streamed workshop slice');
assert.match(dressing,
  /WORKSHOP_PRESENTATION_OPTIONS[\s\S]*quality: 'ai'[\s\S]*camoPattern: 'factory'[\s\S]*geometryQuality: 'high'[\s\S]*staticPreview: true[\s\S]*decor: true[\s\S]*deferStaticBatch: true/,
  'workshop tanks retain full authored geometry and fittings with a fixed recovery finish');
assert.doesNotMatch(dressing, /renderer\.compile\(/,
  'workshop streaming must not synchronously compile a decorative subtree');
assert.match(dressing, /await transfer\.createVisual\(specId, camoSeed\)/,
  'full-detail exhibit geometry must be acquired away from the render thread');
assert.match(transfer, /new Worker\(new URL\('\.\/garageWorkshopGeometryWorker\.ts'/,
  'the workshop transfer must lazily own its dedicated module worker');
assert.doesNotMatch(transfer, /prebakeSharedTextures|createTankMaterials/,
  'static exhibits must not wake procedural camouflage or scrolling-track texture allocation');
assert.match(transfer, /createGarageWorkshopMaterialPalette/,
  'static exhibits must use the map-free factory delivery palette');
assert.match(transfer, /sharedPalettes = new Map/,
  'matching national service finishes must share immutable Garage materials');
assert.match(transfer, /textureQuality = 'factory-solid'/,
  'diagnostics must identify the map-free background finish');
assert.match(dressing, /camoPattern: 'factory',[\s\S]*\}\);/,
  'the exceptional main-thread recovery path must not accept signature paint overrides');
assert.match(dressing, /workshopTransferPayload/,
  'the Garage must retain worker payload savings for production diagnostics');
assert.match(worker, /geometryQuality: 'high'[\s\S]*decor: true/,
  'worker exhibits retain full procedural detail and fittings');
assert.match(worker,
  /name !== 'position' && name !== 'normal'/,
  'solid workshop geometry must omit unused colour, UV and tangent transfer channels');
assert.match(worker, /lod\.levels\[index\]\?\.hysteresis \?\? 0/,
  'worker exhibits must serialize the authored LOD transition hysteresis');
assert.match(transfer, /source\.lodHysteresis \?\? 0/,
  'main-thread exhibits must restore LOD hysteresis instead of reintroducing transition chatter');
assert.match(transfer, /spec: TANK_SPECS\[specId\]/,
  'the transfer must send the requested spec without loading unrelated supplemental donors');
assert.match(worker, /TANK_SPECS\[specId\] \|\|= spec/,
  'the worker must register the requested spec before resolving its builder');
assert.doesNotMatch(worker, /fleetFactory|ensureFullFleet|ensureTankBuilder/,
  'the worker must not package the full playable fleet facade');
for (const owner of ['T90_PROFILES', 'ABRAMS_PROFILES', 'MODERN3_BUILDERS']) {
  assert.match(worker, new RegExp(owner), `worker must register its bounded ${owner} family`);
}
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
  'k2_cradle_base_rail',
  'k2_cradle_crossmember',
  'k2_cradle_ground_foot',
  'k2_cradle_a_frame_brace',
  'k2_cradle_contact_saddle',
  'k2_cradle_rubber_contact_pad',
  'k2_cradle_connected_spine',
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
  'K2 teardown retains its authored transform inside the swapped bay owner');
assert.match(dressing,
  /halfTurnAuthoredServiceBay\(firstBayChildIndex, 'abrams_welding', 'm1a2'\)/,
  'the complete Abrams service section must move into the former K2 quadrant');
assert.match(dressing,
  /halfTurnAuthoredServiceBay\(firstBayChildIndex, 'rolled_k2', 'k2'\)/,
  'the complete K2 teardown section must move into the former Abrams quadrant');
assert.match(dressing, /supportMode = 'connected-steel-rollover-cradle'/,
  'the rolled K2 hull must identify its connected load-bearing support');
assert.match(dressing, /swappedServiceBayIds = \['abrams_welding', 'rolled_k2'\]/,
  'Garage diagnostics must receipt the requested bay swap');
assert.match(dressing, /legacyVerdantRoot\.visible = true/,
  'the complete four-bay composition must surround every Garage environment');
assert.match(dressing, /verdantInteriorRoot\.visible = isVerdant/,
  'indoor wall clutter must remain exclusive to Verdant');
assert.match(dressing, /verdantInteriorRoot\.rotation\.y = Math\.PI/,
  'Verdant wall-supported clutter must follow the indoor room half-turn');
assert.doesNotMatch(dressing, /legacyVerdantRoot\.rotation\.y = Math\.PI/,
  'the shared bays and archive display must not rotate with the Verdant room');
assert.match(dressing, /legacyVerdantRoot\.add\(screenRoot\)/,
  'the rotating battle display must share the all-Garage workshop owner');
assert.match(dressing, /legacyVerdantRoot\.add\(secondaryRoot\)/,
  'the second battle display must live on the shared all-Garage workshop owner');
assert.match(dressing, /screenRoot\.position\.set\(0, 4\.15, -18\.25\)/,
  'the tank rear must point toward the shared physical display');
assert.match(dressing, /battleScreenVisible = true/,
  'the rotating battle display must remain visible in every Garage');
assert.match(dressing, /battleScreenDisplayCount = 2/,
  'two physically separate battle displays must surround the Garage');
assert.match(dressing, /battleScreenResidentImageLimit = 3/,
  'dual displays must keep a bounded three-image transition peak');
assert.doesNotMatch(dressing, /currentVariant\.id !== 'verdant_motor_pool'/,
  'the shared display must not stop rotating outside Verdant');
assert.match(dressing,
  /staticDisplayOwners:\s*\[legacyVerdantRoot, verdantInteriorRoot\]/,
  'the shared bays and Verdant-only interior collapse static leaf draws independently');
assert.match(dressing, /sharedMaintenanceBayCount = 4/);
assert.match(dressing, /workshopOrbitCoverageDegrees = 360/);
assert.match(dressing, /workshopModelMode = 'actual-fleet'/,
  'every Garage must identify its shared service exhibits as real fleet geometry');
for (const component of [
  'turret_cradle',
  'relikt_service_rack',
  'rolled_k2_hull',
  'road_wheel_stacks',
  'track_shoe_pallet',
  'weapon_service_rack',
]) {
  assert.match(dressing, new RegExp(component),
    `the full-detail shared workshop must retain ${component}`);
}
for (const quadrant of ['north-east', 'south-east', 'south-west', 'north-west']) {
  assert.match(dressing, new RegExp(quadrant));
}
assert.match(dressing, /getGarageWorkshopLayoutPose\(currentVariant\)/,
  'each environment must recompose the shared 360-degree service set');
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
  'the access boundary prepares fleet builders before the quiet chunk pump');
assert.doesNotMatch(stage, /openRoof = new Set\(\['field_shed'/,
  'Verdant must retain the original enclosed ceiling and roof trusses');
assert.match(stage, /NO SMOKING\|FLAMMABLE\|FIRE/,
  'hazard signs must use the red safety category');
assert.match(stage, /\^BAY\\b/,
  'bay identification signs must use the blue safety category');
assert.match(stage,
  /verdantIndoorSetRoot\.rotation\.y = Math\.PI[\s\S]*verdantIndoorSetRotationRad = Math\.PI/,
  'the complete Verdant indoor shell and fixture set must rotate once at construction');
assert.match(stage,
  /object !== podium[\s\S]*object !== rimRing[\s\S]*object !== architecture\.group/,
  'the Verdant half-turn must exclude the hero podium and outdoor scene packs');

console.log('garageDressingFleet.selftest: shared four-bay fleet set and Verdant interior pass');
