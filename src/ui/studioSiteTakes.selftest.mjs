// studioSiteTakes.selftest.mjs — the site's takes as Studio presets (owner 2026-10-12: "keep our code for these videos
// and setup preserved so we can always tweak them, and also just show them as presets u can access in /studio"). The
// Director workspace lists the index tools/media-r5/site-media.mjs writes beside the site fifty; every take on it must be
// the scene its 4K final was filmed from, today's code in the shot library, loadable as a scene link, with its picture.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import { resolveTankId } from '../vehicles/tankIdAliases.ts';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const panel = readFileSync(join(ROOT, 'src/ui/studioProductionPanel.ts'), 'utf8');
const indexPath = panel.match(/const SITE_TAKES_INDEX = '([^']+)';/)?.[1];
assert.ok(indexPath, 'the Director panel names the takes index');
assert.equal(sceneLinkPath(indexPath), indexPath, 'the index is a path on this site');
const index = JSON.parse(readFileSync(join(ROOT, 'public', indexPath), 'utf8'));
const picks = JSON.parse(readFileSync(join(ROOT, 'tools/media-r5/site-media/picks.json'), 'utf8'));
assert.equal(index.collection, picks.collection, 'the index belongs to the collection the site shows');
// Every tank's own take (owner 2026-10-12, src/ui/fleetTakes.ts) may join the index as a 'fleet' entry naming its vehicle;
// the Director reaches those through its finder and lists every other take by default.
const fleetIndex = JSON.parse(readFileSync(join(ROOT, 'public', indexPath.replace(/scenes\/index\.json$/, 'fleet/index.json')), 'utf8'));
const siteTakes = index.takes.filter((take) => take.group !== 'fleet');
const fleetTakes = index.takes.filter((take) => take.group === 'fleet');
assert.equal(new Set(index.takes.map((take) => take.id)).size, index.takes.length, 'one entry per take');
// (2026-10-18) in the picks' own order: the site fifty, the owner's nine, then the combat round's takes (s225-s228); a
// sort by id would slot s225 between s22 and s23
assert.deepEqual(siteTakes.map((take) => take.id), Object.keys(picks.takes), 'every take of the site fifty, in order');
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const fleetVehicles = new Set();
for (const take of fleetTakes) {
  assert.ok(typeof take.vehicle === 'string' && take.vehicle && !fleetVehicles.has(take.vehicle), `${take.id}: one fleet take per vehicle`);
  fleetVehicles.add(take.vehicle);
  // object3d-assert-ok: take.scene is a Studio scene id string, not a THREE.Scene
  assert.equal(sceneLinkPath(take.scene), take.scene, `${take.id}: its scene is a scene link on this site`);
  const scene = JSON.parse(readFileSync(join(ROOT, 'public', take.scene), 'utf8'));
  assert.equal(scene.map, take.map, `${take.id}: the card names the scene's map`);
  // (2026-10-18) the index names the vehicle at the fleet index's tank id schema and a 226 take's scene its actors at
  // schema 3: both resolved to today's ids, as src/ui/fleetTakes.ts reads them
  const vehicleNow = resolveTankId(take.vehicle, fleetIndex.tankIdSchema);
  assert.ok(scene.actors?.some((actor) => resolveTankId(actor.id, scene.tankIdSchema) === vehicleNow), `${take.id}: the take stages its vehicle`);
  assert.ok(!take.thumb || existsSync(join(ROOT, 'public', take.thumb)), `${take.id}: its card picture ships`);
  assert.ok(take.title.en && take.title.zh && take.short.en && take.short.zh, `${take.id}: titled in both languages`);
}
for (const take of siteTakes) {
  // object3d-assert-ok: take.scene is a Studio scene id string, not a THREE.Scene
  assert.equal(sceneLinkPath(take.scene), take.scene, `${take.id}: its scene is a scene link on this site`);
  const scene = JSON.parse(readFileSync(join(ROOT, 'public', take.scene), 'utf8'));
  assert.equal(scene.map, take.map, `${take.id}: the card names the scene's map`);
  assert.ok(Array.isArray(scene.actors) && scene.actors.length > 0, `${take.id}: the scene stages its tanks`);
  assert.ok(scene.storyboard?.shots?.length > 0 && scene.storyboard.durationMs === take.durationMs,
    `${take.id}: the scene carries its storyboard and the card its length`);
  const library = join(ROOT, 'tools/media-r5/site50-shots', `${take.id}.json`);
  assert.ok(existsSync(library), `${take.id}: the shot library holds its code`);
  assert.equal(sha(join(ROOT, 'public', take.scene)), sha(library), `${take.id}: the preset is the library's current code`);
  assert.ok(existsSync(join(ROOT, 'public', take.thumb)), `${take.id}: its card picture ships`);
  assert.ok(take.title.en && take.title.zh && take.short.en && take.short.zh, `${take.id}: titled in both languages`);
}
assert.match(panel, /sceneLinkPath\(take\.scene\)/, 'a preset loads only this site\'s own files, as a scene link does');
assert.match(panel, /\.then\(\(json\) => S\.load\(json\)\)/, 'a preset stages through the Studio\'s own load, as Load JSON does');
assert.match(panel, /if \(take\.group !== 'fleet'\) takesLibrary\.append\(takeCard\(take\)\)/, 'the default list leaves the fleet\'s takes out');
console.log(`studioSiteTakes.selftest: ${siteTakes.length} takes and ${fleetTakes.length} tanks' own takes, each its filmed scene, `
  + 'loadable from the Director workspace');
