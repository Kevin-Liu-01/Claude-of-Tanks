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
for (const id of ['m1a2', 't90m', 'leclerc']) {
  assert.match(dressing, new RegExp(`addFleetExhibit\\('${id}'.*'complete_vehicle'`));
  assert.match(dressing, new RegExp(`addFleetExhibit\\('${id}'.*'turret_and_gun'`));
}
assert.match(dressing, /sourceTurret\.clone\(true\)/,
  'service turrets must clone the already-built exact rig instead of rebuilding a tank');
assert.match(dressing, /completeFleetTank \? Math\.PI : 0/,
  'complete tanks must face the corrected direction along their existing bay axis');
assert.match(access, /prepareGarageDressing\?\./,
  'the access boundary prepares fleet builders before the synchronous chunk pump');
assert.doesNotMatch(stage, /openRoof = new Set\(\['field_shed'/,
  'Verdant must retain the original enclosed ceiling and roof trusses');

console.log('garageDressingFleet.selftest: actual fleet exhibits, facing, and Verdant roof pass');
