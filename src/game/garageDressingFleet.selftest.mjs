import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dressing = await readFile(new URL('./garageDressing.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('./garageDressingAccess.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('./garageWorkshopGeometryWorker.ts', import.meta.url), 'utf8');
const transfer = await readFile(new URL('./garageWorkshopTransfer.ts', import.meta.url), 'utf8');
const workshopLayout = await readFile(new URL('./garageWorkshopLayout.ts', import.meta.url), 'utf8');
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
for (const owner of ['T90_PROFILES', 'ABRAMS_PROFILES', 'LEOPARD_PROFILES', 'MODERN3_BUILDERS']) {
  assert.match(worker, new RegExp(owner), `worker must register its bounded ${owner} family`);
}
for (const id of ['t90a_burlak', 'm1a2', 'leo2a5_a5nl', 't90m', 'k2']) {
  assert.match(dressing, new RegExp(`createLegacyVisual\\('${id}'`));
}
assert.doesNotMatch(dressing, /visual\.root\.clone\(true\)/,
  'the Leopard teardown must be its real fleet graph rather than a cloned Abrams');
assert.match(dressing,
  /createLegacyVisual\('leo2a5_a5nl'[\s\S]*vehicleIdentity = 'Leopard 2A5\/A5NL'/,
  'the fifth exhibit must retain the exact A5NL fleet identity throughout its service bay');
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
  'Burlak geometry retains its authored local transform inside the bay owner');
assert.match(dressing, /garage_burlak_gantry_forward/,
  'the complete Burlak service story must have one movable bay owner');
assert.match(dressing,
  /burlakBayRoot\.position\.set\([\s\S]*BURLAK_SCAFFOLD_CLEARANCE_OFFSET\.x,[\s\S]*BURLAK_SCAFFOLD_CLEARANCE_OFFSET\.z/,
  'the Burlak tank, stands, gantry, tools and floor dressing must advance together');
assert.match(dressing, /foregroundOfVerdantScaffold = true/,
  'the Burlak assembly must remain in front of Verdant scaffold uprights');
assert.match(workshopLayout,
  /id: 'burlak_gantry', role: 'heavy-lift', x: 18\.8, z: -10\.3, yaw: -0\.55/,
  'outdoor service structures must follow the Burlak assembly final pose');
assert.match(workshopLayout, /cameraAdvanceM: 4\.38/,
  'the Burlak foreground correction must remain large enough to clear the scaffold silhouette');
assert.match(dressing, /tank\.position\.set\(16\.9, 0, 17\.7\)/,
  'Abrams welding bay retains its original transform');
assert.match(workshopLayout,
  /id: 'abrams_welding', role: 'welding', x: -15\.25, z: -16\.05/,
  'all-environment structures must follow the advanced Abrams service owner');
assert.match(workshopLayout, /ABRAMS_BAY_FORWARD_ADVANCE_M = 1\.65/,
  'the complete Abrams bay must align with its painted service square');
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
assert.match(dressing,
  /const forwardAdvance = bayId === 'abrams_welding'[\s\S]*ABRAMS_BAY_FORWARD_ADVANCE_M : -0\.35/,
  'both swapped service bays must remain outside the showroom orbit');
assert.match(dressing, /perimeterCraneClearance = true/,
  'the complete bay owner must receipt its corrected crane clearance');
assert.match(dressing, /supportMode = 'connected-steel-rollover-cradle'/,
  'the rolled K2 hull must identify its connected load-bearing support');
assert.match(dressing, /swappedServiceBayIds = \['abrams_welding', 'rolled_k2'\]/,
  'Garage diagnostics must receipt the requested bay swap');
assert.match(dressing, /legacyVerdantRoot\.visible = true/,
  'the complete four-bay composition must surround every Garage environment');
for (const signature of [
  "mountMode = parent === legacyVerdantRoot",
  "'grounded-freestanding-frame'",
  'garage_service_sign_ground_post',
  'garage_service_sign_ground_foot',
  'garage_service_sign_connected_brace',
  'garage_service_sign_lower_tie',
  'supportConnections = 9',
]) {
  assert.ok(dressing.includes(signature),
    `outdoor service labels must retain their grounded support: ${signature}`);
}
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
assert.match(dressing, /secondaryRoot\.rotation\.y = Math\.PI \/ 2/,
  'the west CRT must face inward so its live image is visible instead of its rear casing');
assert.match(dressing, /battleScreenSecondaryFacing = 'inward-to-hero'/,
  'Garage diagnostics must receipt the corrected second-display orientation');
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
assert.match(dressing, /const craneRunwayX = 21\.0/,
  'the travelling-crane columns must clear the authored fleet service bays');
assert.match(dressing, /const craneColumnZ = 20\.4/,
  'the travelling-crane feet must stay on the workshop perimeter');
const assertWorkshopSignature = (signature) => assert.ok(dressing.includes(signature),
  `the connected overhead and utility pass must retain ${signature}`);
assertWorkshopSignature('verdant_${stationId}_hoist_chain_left');
assertWorkshopSignature('verdant_${stationId}_hoist_chain_right');
assertWorkshopSignature('verdant_${stationId}_spreader_sling_');
assertWorkshopSignature('verdant_${stationId}_reinforced_spreader');
assertWorkshopSignature('suspended_powerpack');
assertWorkshopSignature('suspended_final_drive');
assertWorkshopSignature('suspended_turret_basket');
assertWorkshopSignature('connected_lift_eye');
assertWorkshopSignature('lifting_lug');
assertWorkshopSignature('verdant_routed_workshop_utilities');
assertWorkshopSignature('verdant_power_run_south');
assertWorkshopSignature('verdant_air_run_north');
assertWorkshopSignature('verdant_welder_power_drop');
assertWorkshopSignature('verdant_teardown_air_drop');
assertWorkshopSignature('verdant_center_lamp_feed');
assertWorkshopSignature('verdant_lamp_feed_east');
assertWorkshopSignature('verdant_lamp_feed_north');
assertWorkshopSignature('verdant_lamp_feed_south');
assertWorkshopSignature('verdant_lamp_feed_welding_bay');
assertWorkshopSignature('verdant_rear_chain_fall_');
assert.match(dressing, /verdantHeroHoistOffsetM = 12\.0/,
  'every lift must park well clear of the hero tank');
assertWorkshopSignature("['east_front', 12.0, -9.2, 'final-drive']");
assertWorkshopSignature("['east_center', 14.4, 0, 'powerpack']");
assertWorkshopSignature("['east_rear', 13.2, 9.2, 'turret-basket']");
assertWorkshopSignature("['west_front', -12.0, -9.2, 'turret-basket']");
assertWorkshopSignature("['west_center', -14.4, 0, 'final-drive']");
assertWorkshopSignature("['west_rear', -13.2, 9.2, 'powerpack']");
assert.match(dressing, /verdantFlammableWallHoistGapM = 5\.91/,
  'the east wall hoist bank must retain a usable inspection aisle');
assert.match(dressing, /verdantOppositeWallHoistGapM = 5\.91/,
  'the west wall hoist bank must retain a matching inspection aisle');
assert.match(dressing, /verdantEastHoistsParkedAtFlammableWall = true/,
  'the east bank must stay parked toward the FLAMMABLE wall');
assert.match(dressing, /verdantHoistBanksParkedAtSideWalls = true/,
  'both trolley banks must remain parked at opposite side walls');
assert.match(dressing, /verdantHoistBankCount = 2/,
  'the workshop must retain one complete crane bank at each side');
assert.match(dressing, /verdantCraneBridgeCount = 3/,
  'the paired trolley banks must share three physical bridge beams');
assert.match(dressing, /verdantHoistStationCount = 6/,
  'the workshop must retain three lift stations in each side-wall bank');
assert.match(dressing, /verdantHoistChainRuns = 38/,
  'the six lifting stations and parked falls must retain their chain choreography');
assert.match(dressing, /verdantSuspendedLoadCount = 6/,
  'every active lifting station must carry a purposeful mechanical load');
assert.match(dressing, /verdantConnectedLiftPointCount = 24/,
  'every spreader sling must terminate on one of four visible lifting eyes per load');
assert.match(dressing, /stationX \+ Math\.sign\(x\) \* suspendedLoadAttachX/,
  'sling endpoints must share the lifting-frame x coordinates');
assert.match(dressing, /Math\.sign\(zOffset\) \* suspendedLoadAttachZ/,
  'sling endpoints must share the lifting-frame z coordinates');
assert.match(dressing, /verdantRoutedUtilityCircuits = 12/,
  'organized wall and floor utilities must remain part of Verdant');
assert.match(dressing, /workshopModelMode = 'actual-fleet'/,
  'every Garage must identify its shared service exhibits as real fleet geometry');
for (const component of [
  'mobility_teardown_vehicle',
  'mobility_teardown_service_bay',
  'connected_hull_lift',
  'removed_road_wheel_rack',
  'removed_road_wheel_tires',
  'removed_road_wheel_discs',
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
for (const signature of [
  'garage_leopard_a5nl_mobility_teardown',
  'leopard_a5nl_mobility_lift_base_rail',
  'leopard_a5nl_mobility_lift_ground_foot',
  'leopard_a5nl_mobility_lift_post',
  'leopard_a5nl_mobility_lift_contact_pad',
  'leopard_a5nl_mobility_lift_crossmember',
  'leopard_a5nl_wheel_rack_ground_base',
  'leopard_a5nl_wheel_rack_connected_upright',
  'leopard_a5nl_wheel_rack_connected_rail',
]) {
  assert.match(dressing, new RegExp(signature));
}
assert.match(dressing, /paintSquareOccupied = true/,
  'the formerly empty painted service square must carry a real teardown story');
assert.match(dressing, /supportedWheelCount = 8/,
  'removed Leopard road wheels must remain visibly accounted for');
assert.match(dressing, /workshopExhibitCount = 5/,
  'all Garage variants must expose the added teardown vehicle');
assert.match(dressing, /verdantOriginalExhibitCount = 5/,
  'Verdant diagnostics must include the added teardown vehicle');
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

console.log('garageDressingFleet.selftest: shared five-exhibit fleet set and Verdant interior pass');
