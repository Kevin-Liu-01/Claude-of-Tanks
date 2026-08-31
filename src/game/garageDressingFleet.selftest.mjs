import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dressing = await readFile(new URL('./garageDressing.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('./garageDressingAccess.ts', import.meta.url), 'utf8');
const stage = await readFile(new URL('../ui/garageStage.ts', import.meta.url), 'utf8');

assert.doesNotMatch(dressing, /fleetFactory|ensureTankBuilders|createTank\(/,
  'retired invisible workshop must never wake playable fleet builders');
assert.doesNotMatch(dressing, /BoxGeometry|CylinderGeometry|CanvasTexture/,
  'retired workshop must not allocate hidden geometry or textures');
assert.match(dressing, /workshopTriangleCount = 0/);
assert.match(dressing, /activeWorkshopTriangleCount = 0/);
assert.match(dressing, /workshopExhibitCount = 0/);
assert.match(dressing, /retiredLegacyWorkshop = true/);
assert.match(dressing, /pump: \(\) => false/);
assert.match(dressing, /isBuilt: \(\) => true/);
assert.doesNotMatch(access, /prepareGarageDressing|fleetFactory|ensureTankBuilders/,
  'compatibility access must not prepare hidden fleet content');
assert.match(access, /isBuilt: \(\) => true/,
  'retired compatibility owner is complete at first paint');
assert.match(stage, /authentic-scene-pack/,
  'stage presentation must be owned by authentic scene packs');
assert.doesNotMatch(stage, /openRoof = new Set\(\['field_shed'/,
  'no environment may reactivate the retired enclosed workshop');

console.log('garageDressingFleet.selftest: hidden legacy workshop is a zero-cost compatibility owner');
